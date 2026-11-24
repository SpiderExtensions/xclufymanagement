import { Router, type Response } from 'express';
import { db } from '../db.ts';
import {
  dispatchNotification,
  logAudit,
  requireApproved,
  requireAuth,
  requireModule,
  type AuthedRequest,
} from '../auth.ts';
import { roundMoney } from '../../src/shared/erpMath.ts';

export const catalogRoutes = Router();

function getProductWithVariants(productId: number) {
  const product = db
    .prepare(
      `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`
    )
    .get(productId) as Record<string, unknown> | undefined;
  if (!product) return null;
  const variants = db.prepare(`SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC`).all(productId);
  return { ...product, variants };
}

async function notifyWaitlistIfAvailable(productId: number, productName: string, newStock: number) {
  if (newStock <= 0) return;
  const waiting = db
    .prepare(
      `SELECT id, customer_name FROM waitlist_entries WHERE product_id = ? AND status = 'Waiting'`
    )
    .all(productId) as Array<{ id: number; customer_name: string }>;

  if (waiting.length > 0) {
    db.prepare(
      `UPDATE waitlist_entries SET status = 'Product Available' WHERE product_id = ? AND status = 'Waiting'`
    ).run(productId);

    await dispatchNotification({
      roles: ['super_admin', 'admin', 'manager', 'sales_staff'],
      category: 'business',
      title: 'Waitlist Product Available',
      message: `${productName} is back in stock (${newStock} units). ${waiting.length} customer waitlist entry(s) marked available.`,
      linkModule: 'waitlist',
    });
  }
}

// ================= CATEGORIES =================

catalogRoutes.get('/categories', requireAuth, requireApproved, (_req: AuthedRequest, res: Response) => {
  const categories = db
    .prepare(
      `SELECT c.*, COUNT(p.id) as product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.status != 'archived'
       GROUP BY c.id
       ORDER BY c.name ASC`
    )
    .all();
  res.json({ categories });
});

catalogRoutes.post('/categories', requireAuth, requireApproved, requireModule('categories'), (req: AuthedRequest, res: Response) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const imageUrl = req.body?.image_url || null;
  const status = req.body?.status === 'inactive' ? 'inactive' : 'active';

  if (!name) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }

  try {
    const info = db
      .prepare(`INSERT INTO categories (name, description, image_url, status) VALUES (?, ?, ?, ?)`)
      .run(name, description, imageUrl, status);
    const category = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(info.lastInsertRowid);
    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: 'CATEGORY_CREATED',
      entityType: 'category',
      entityId: Number(info.lastInsertRowid),
      newValues: { name, status },
    });
    res.status(201).json({ category });
  } catch {
    res.status(409).json({ error: 'A category with this name already exists.' });
  }
});

catalogRoutes.put('/categories/:id', requireAuth, requireApproved, requireModule('categories'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const status = req.body?.status === 'inactive' ? 'inactive' : 'active';
  const imageUrl = req.body?.image_url ?? null;

  if (!name) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }

  const info = db
    .prepare(`UPDATE categories SET name = ?, description = ?, image_url = ?, status = ? WHERE id = ?`)
    .run(name, description, imageUrl, status, id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  res.json({ category: db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) });
});

catalogRoutes.delete('/categories/:id', requireAuth, requireApproved, requireModule('categories'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ================= PRODUCTS & VARIANTS =================

catalogRoutes.get('/products', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const search = req.query.search ? String(req.query.search).trim() : '';
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const status = req.query.status ? String(req.query.status) : '';

  let sql = `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE 1=1`;
  const params: unknown[] = [];

  if (search) {
    sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.tags LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (categoryId) {
    sql += ` AND p.category_id = ?`;
    params.push(categoryId);
  }
  if (status) {
    sql += ` AND p.status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY p.id DESC`;

  const products = db.prepare(sql).all(...params) as Array<{ id: number }>;
  const allVariants = db.prepare(`SELECT * FROM product_variants ORDER BY id ASC`).all() as Array<{
    product_id: number;
  }>;
  const variantMap = new Map<number, unknown[]>();
  for (const v of allVariants) {
    const arr = variantMap.get(v.product_id) || [];
    arr.push(v);
    variantMap.set(v.product_id, arr);
  }

  const enriched = products.map((p) => ({
    ...p,
    variants: variantMap.get(p.id) || [],
  }));

  res.json({ products: enriched });
});

catalogRoutes.post('/products', requireAuth, requireApproved, requireModule('products'), async (req: AuthedRequest, res: Response) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const sku = String(b.sku || '').trim();
    const barcode = String(b.barcode || '').trim();
    const categoryId = b.category_id ? Number(b.category_id) : null;
    const purchasePrice = Math.max(0, roundMoney(Number(b.purchase_price || 0)));
    const sellingPrice = Math.max(0, roundMoney(Number(b.selling_price || 0)));
    const discountPrice =
      b.discount_price !== null && b.discount_price !== '' && b.discount_price !== undefined
        ? Math.max(0, roundMoney(Number(b.discount_price)))
        : null;
    const availableStock = Math.max(0, Math.floor(Number(b.available_stock || 0)));
    const minStock = Math.max(0, Math.floor(Number(b.min_stock ?? 5)));
    const variants = Array.isArray(b.variants) ? b.variants : [];

    if (!name || !sku) {
      res.status(400).json({ error: 'Product name and SKU are required.' });
      return;
    }

    // Check duplicate barcode across products & variants
    if (barcode) {
      const dupProd = db.prepare(`SELECT id FROM products WHERE barcode = ?`).get(barcode);
      const dupVar = db.prepare(`SELECT id FROM product_variants WHERE barcode = ?`).get(barcode);
      if (dupProd || dupVar) {
        res.status(409).json({ error: `Barcode "${barcode}" is already assigned to another item.` });
        return;
      }
    }

    const totalVariantStock =
      variants.length > 0
        ? variants.reduce((sum: number, v: { stock?: number }) => sum + Math.max(0, Math.floor(Number(v.stock || 0))), 0)
        : availableStock;

    const status =
      b.status === 'archived'
        ? 'archived'
        : totalVariantStock <= 0
          ? 'out_of_stock'
          : 'active';

    const createdId = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO products (name, sku, category_id, description, image_url, purchase_price, selling_price, discount_price, available_stock, min_stock, barcode, status, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          name,
          sku,
          categoryId,
          String(b.description || '').trim(),
          b.image_url || null,
          purchasePrice,
          sellingPrice,
          discountPrice,
          totalVariantStock,
          minStock,
          barcode,
          status,
          String(b.tags || '').trim()
        );

      const productId = Number(info.lastInsertRowid);

      const insertVar = db.prepare(
        `INSERT INTO product_variants (product_id, size, color, material, style, sku, barcode, price, stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const v of variants) {
        const vBarcode = String(v.barcode || '').trim();
        if (vBarcode) {
          const dupP = db.prepare(`SELECT id FROM products WHERE barcode = ?`).get(vBarcode);
          const dupV = db.prepare(`SELECT id FROM product_variants WHERE barcode = ?`).get(vBarcode);
          if (dupP || dupV) {
            throw new Error(`Variant barcode "${vBarcode}" is already assigned.`);
          }
        }
        insertVar.run(
          productId,
          String(v.size || '').trim(),
          String(v.color || '').trim(),
          String(v.material || '').trim(),
          String(v.style || '').trim(),
          String(v.sku || `${sku}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`).trim(),
          vBarcode,
          Math.max(0, roundMoney(Number(v.price ?? sellingPrice))),
          Math.max(0, Math.floor(Number(v.stock || 0)))
        );
      }

      if (totalVariantStock > 0) {
        db.prepare(
          `INSERT INTO inventory_transactions (product_id, change_type, quantity_delta, previous_stock, new_stock, reference_type, notes, created_by)
           VALUES (?, 'initial_stock', ?, 0, ?, 'product_create', 'Initial product creation stock', ?)`
        ).run(productId, totalVariantStock, totalVariantStock, req.user!.id);
      }

      return productId;
    })();

    const created = getProductWithVariants(createdId);
    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: 'PRODUCT_CREATED',
      entityType: 'product',
      entityId: createdId,
      newValues: { name, sku, available_stock: totalVariantStock },
    });

    res.status(201).json({ product: created });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Failed to create product' });
  }
});

catalogRoutes.put('/products/:id', requireAuth, requireApproved, requireModule('products'), async (req: AuthedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = getProductWithVariants(id) as { available_stock: number; name: string } | null;
    if (!existing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const b = req.body || {};
    const name = String(b.name || '').trim();
    const sku = String(b.sku || '').trim();
    const barcode = String(b.barcode || '').trim();
    const categoryId = b.category_id ? Number(b.category_id) : null;
    const purchasePrice = Math.max(0, roundMoney(Number(b.purchase_price || 0)));
    const sellingPrice = Math.max(0, roundMoney(Number(b.selling_price || 0)));
    const discountPrice =
      b.discount_price !== null && b.discount_price !== '' && b.discount_price !== undefined
        ? Math.max(0, roundMoney(Number(b.discount_price)))
        : null;
    const minStock = Math.max(0, Math.floor(Number(b.min_stock ?? 5)));
    const variants = Array.isArray(b.variants) ? b.variants : null;

    if (!name || !sku) {
      res.status(400).json({ error: 'Product name and SKU are required.' });
      return;
    }

    if (barcode) {
      const dupProd = db.prepare(`SELECT id FROM products WHERE barcode = ? AND id != ?`).get(barcode, id);
      const dupVar = db.prepare(`SELECT id FROM product_variants WHERE barcode = ? AND product_id != ?`).get(barcode, id);
      if (dupProd || dupVar) {
        res.status(409).json({ error: `Barcode "${barcode}" is already in use.` });
        return;
      }
    }

    const newStock =
      variants && variants.length > 0
        ? variants.reduce((sum: number, v: { stock?: number }) => sum + Math.max(0, Math.floor(Number(v.stock || 0))), 0)
        : Math.max(0, Math.floor(Number(b.available_stock ?? existing.available_stock)));

    const status =
      b.status === 'archived'
        ? 'archived'
        : newStock <= 0
          ? 'out_of_stock'
          : 'active';

    db.transaction(() => {
      db.prepare(
        `UPDATE products SET
          name = ?, sku = ?, category_id = ?, description = ?, image_url = ?,
          purchase_price = ?, selling_price = ?, discount_price = ?,
          available_stock = ?, min_stock = ?, barcode = ?, status = ?, tags = ?,
          updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        name,
        sku,
        categoryId,
        String(b.description || '').trim(),
        b.image_url !== undefined ? b.image_url : null,
        purchasePrice,
        sellingPrice,
        discountPrice,
        newStock,
        minStock,
        barcode,
        status,
        String(b.tags || '').trim(),
        id
      );

      if (variants !== null) {
        db.prepare(`DELETE FROM product_variants WHERE product_id = ?`).run(id);
        const insertVar = db.prepare(
          `INSERT INTO product_variants (product_id, size, color, material, style, sku, barcode, price, stock)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const v of variants) {
          insertVar.run(
            id,
            String(v.size || '').trim(),
            String(v.color || '').trim(),
            String(v.material || '').trim(),
            String(v.style || '').trim(),
            String(v.sku || `${sku}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`).trim(),
            String(v.barcode || '').trim(),
            Math.max(0, roundMoney(Number(v.price ?? sellingPrice))),
            Math.max(0, Math.floor(Number(v.stock || 0)))
          );
        }
      }
    })();

    if (newStock > existing.available_stock) {
      await notifyWaitlistIfAvailable(id, name, newStock);
    }

    const updated = getProductWithVariants(id);
    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: id,
      previousValues: existing,
      newValues: { name, sku, available_stock: newStock },
    });

    res.json({ product: updated });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Failed to update product' });
  }
});

catalogRoutes.post('/products/:id/duplicate', requireAuth, requireApproved, requireModule('products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const src = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!src) {
    res.status(404).json({ error: 'Product not found.' });
    return;
  }
  const newSku = `${src.sku}-COPY-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const info = db
    .prepare(
      `INSERT INTO products (name, sku, category_id, description, image_url, purchase_price, selling_price, discount_price, available_stock, min_stock, barcode, status, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', 'out_of_stock', ?)`
    )
    .run(
      `${src.name} (Copy)`,
      newSku,
      src.category_id,
      src.description,
      src.image_url,
      src.purchase_price,
      src.selling_price,
      src.discount_price,
      src.min_stock,
      src.tags
    );
  res.status(201).json({ product: getProductWithVariants(Number(info.lastInsertRowid)) });
});

catalogRoutes.delete('/products/:id', requireAuth, requireApproved, requireModule('products'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  try {
    db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
    res.json({ ok: true });
  } catch {
    db.prepare(`UPDATE products SET status = 'archived', updated_at = datetime('now') WHERE id = ?`).run(id);
    res.json({ ok: true, archived: true });
  }
});

// ================= BARCODE LOOKUP =================

catalogRoutes.get('/barcodes/lookup', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const code = String(req.query.code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'Barcode or SKU query is required.' });
    return;
  }

  // Exact match on variant barcode or SKU first
  const variant = db
    .prepare(`SELECT * FROM product_variants WHERE barcode = ? OR sku = ? COLLATE NOCASE`)
    .get(code, code) as { id: number; product_id: number } | undefined;

  if (variant) {
    const product = getProductWithVariants(variant.product_id);
    res.json({ match: 'variant', product, variant });
    return;
  }

  // Exact match on product barcode or SKU
  const productRow = db
    .prepare(`SELECT id FROM products WHERE (barcode = ? OR sku = ? COLLATE NOCASE) AND status != 'archived'`)
    .get(code, code) as { id: number } | undefined;

  if (productRow) {
    res.json({ match: 'product', product: getProductWithVariants(productRow.id), variant: null });
    return;
  }

  res.status(404).json({ error: `No product or variant found matching "${code}".` });
});

// ================= INVENTORY MANAGEMENT =================

catalogRoutes.get('/inventory', requireAuth, requireApproved, requireModule('inventory'), (_req: AuthedRequest, res: Response) => {
  const products = db
    .prepare(
      `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status != 'archived' ORDER BY p.available_stock ASC, p.name ASC`
    )
    .all();
  const transactions = db
    .prepare(
      `SELECT t.*, p.name as product_name, p.sku as product_sku, u.full_name as user_name
       FROM inventory_transactions t
       JOIN products p ON p.id = t.product_id
       LEFT JOIN profiles u ON u.id = t.created_by
       ORDER BY t.id DESC LIMIT 120`
    )
    .all();
  res.json({ products, transactions });
});

catalogRoutes.post('/inventory/adjust', requireAuth, requireApproved, requireModule('inventory'), async (req: AuthedRequest, res: Response) => {
  try {
    const productId = Number(req.body?.product_id);
    const variantId = req.body?.variant_id ? Number(req.body.variant_id) : null;
    const changeType = String(req.body?.change_type || 'adjustment') as
      | 'receive'
      | 'adjustment'
      | 'damaged'
      | 'return'
      | 'reserve'
      | 'release_reserve';
    const quantity = Math.floor(Number(req.body?.quantity || 0));
    const notes = String(req.body?.notes || '').trim();

    if (!productId || !Number.isFinite(quantity) || quantity === 0) {
      res.status(400).json({ error: 'Product and non-zero quantity are required.' });
      return;
    }

    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId) as
      | { id: number; name: string; available_stock: number; reserved_stock: number; damaged_stock: number; returned_stock: number; min_stock: number }
      | undefined;
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    let delta = quantity;
    if (changeType === 'receive' || changeType === 'return') {
      delta = Math.abs(quantity);
    } else if (changeType === 'damaged' || changeType === 'reserve') {
      delta = -Math.abs(quantity);
    }

    const prevStock = product.available_stock;
    const newStock = prevStock + delta;
    if (newStock < 0) {
      res.status(400).json({ error: `Insufficient available stock (${prevStock}) for this adjustment.` });
      return;
    }

    db.transaction(() => {
      let reserved = product.reserved_stock;
      let damaged = product.damaged_stock;
      let returned = product.returned_stock;

      if (changeType === 'reserve') reserved += Math.abs(quantity);
      if (changeType === 'release_reserve') reserved = Math.max(0, reserved - Math.abs(quantity));
      if (changeType === 'damaged') damaged += Math.abs(quantity);
      if (changeType === 'return') returned += Math.abs(quantity);

      const newStatus = newStock <= 0 ? 'out_of_stock' : 'active';
      db.prepare(
        `UPDATE products SET available_stock = ?, reserved_stock = ?, damaged_stock = ?, returned_stock = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newStock, reserved, damaged, returned, newStatus, productId);

      if (variantId) {
        db.prepare(`UPDATE product_variants SET stock = MAX(0, stock + ?) WHERE id = ? AND product_id = ?`).run(
          delta,
          variantId,
          productId
        );
      }

      db.prepare(
        `INSERT INTO inventory_transactions (product_id, variant_id, change_type, quantity_delta, previous_stock, new_stock, reference_type, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`
      ).run(productId, variantId, changeType, delta, prevStock, newStock, notes, req.user!.id);
    })();

    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: `STOCK_${changeType.toUpperCase()}`,
      entityType: 'product',
      entityId: productId,
      previousValues: { available_stock: prevStock },
      newValues: { available_stock: newStock, notes },
    });

    if (newStock > prevStock) {
      await notifyWaitlistIfAvailable(productId, product.name, newStock);
    } else if (newStock === 0) {
      await dispatchNotification({
        roles: ['super_admin', 'admin', 'manager', 'inventory_manager'],
        category: 'business',
        title: 'Product Out of Stock',
        message: `${product.name} is now out of stock.`,
        linkModule: 'inventory',
      });
    } else if (newStock <= product.min_stock) {
      await dispatchNotification({
        roles: ['super_admin', 'admin', 'manager', 'inventory_manager'],
        category: 'business',
        title: 'Low Stock Alert',
        message: `${product.name} has ${newStock} unit(s) remaining (minimum: ${product.min_stock}).`,
        linkModule: 'inventory',
      });
    }

    res.json({ product: getProductWithVariants(productId) });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Inventory adjustment failed.' });
  }
});

// ================= CSV PRODUCT IMPORT CENTER =================

catalogRoutes.post('/products/import-csv', requireAuth, requireApproved, requireModule('import_export'), async (req: AuthedRequest, res: Response) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const duplicateStrategy = req.body?.duplicate_strategy === 'update' ? 'update' : 'skip';

  if (rows.length === 0) {
    res.status(400).json({ error: 'No product rows supplied for import.' });
    return;
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ rowIndex: number; sku: string; reason: string }> = [];

  const runImport = db.transaction(() => {
    for (const r of rows) {
      const name = String(r.name || '').trim();
      const sku = String(r.sku || '').trim();
      const barcode = String(r.barcode || '').trim();
      const catName = String(r.category || 'Fashion Accessories').trim() || 'Fashion Accessories';
      const purchasePrice = Math.max(0, roundMoney(Number(r.purchase_price || 0)));
      const sellingPrice = Math.max(0, roundMoney(Number(r.selling_price || 0)));
      const discountPrice =
        r.discount_price !== null && r.discount_price !== undefined && r.discount_price !== ''
          ? Math.max(0, roundMoney(Number(r.discount_price)))
          : null;
      const availableStock = Math.max(0, Math.floor(Number(r.available_stock || 0)));
      const minStock = Math.max(0, Math.floor(Number(r.min_stock ?? 5)));

      if (!name || !sku || sellingPrice <= 0) {
        errors.push({ rowIndex: r.rowIndex || 0, sku, reason: 'Missing required name, SKU, or valid selling price.' });
        continue;
      }

      // Resolve or create category
      let cat = db.prepare(`SELECT id FROM categories WHERE name = ? COLLATE NOCASE`).get(catName) as
        | { id: number }
        | undefined;
      if (!cat) {
        const cRes = db.prepare(`INSERT INTO categories (name) VALUES (?)`).run(catName);
        cat = { id: Number(cRes.lastInsertRowid) };
      }

      const existingBySku = db.prepare(`SELECT id, available_stock FROM products WHERE sku = ? COLLATE NOCASE`).get(sku) as
        | { id: number; available_stock: number }
        | undefined;
      const existingByBarcode = barcode
        ? (db.prepare(`SELECT id FROM products WHERE barcode = ?`).get(barcode) as { id: number } | undefined)
        : undefined;

      if (existingBySku || existingByBarcode) {
        if (duplicateStrategy === 'update' && existingBySku) {
          if (existingByBarcode && existingByBarcode.id !== existingBySku.id) {
            errors.push({ rowIndex: r.rowIndex || 0, sku, reason: `Barcode "${barcode}" belongs to another product.` });
            continue;
          }
          db.prepare(
            `UPDATE products SET name = ?, category_id = ?, description = ?, purchase_price = ?, selling_price = ?, discount_price = ?, available_stock = ?, min_stock = ?, barcode = ?, tags = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
          ).run(
            name,
            cat.id,
            String(r.description || ''),
            purchasePrice,
            sellingPrice,
            discountPrice,
            availableStock,
            minStock,
            barcode,
            String(r.tags || ''),
            availableStock > 0 ? 'active' : 'out_of_stock',
            existingBySku.id
          );
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      const ins = db
        .prepare(
          `INSERT INTO products (name, sku, category_id, description, purchase_price, selling_price, discount_price, available_stock, min_stock, barcode, status, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          name,
          sku,
          cat.id,
          String(r.description || ''),
          purchasePrice,
          sellingPrice,
          discountPrice,
          availableStock,
          minStock,
          barcode,
          availableStock > 0 ? 'active' : 'out_of_stock',
          String(r.tags || '')
        );

      const pid = Number(ins.lastInsertRowid);
      if (availableStock > 0) {
        db.prepare(
          `INSERT INTO inventory_transactions (product_id, change_type, quantity_delta, previous_stock, new_stock, reference_type, notes, created_by)
           VALUES (?, 'csv_import', ?, 0, ?, 'csv_import', 'Imported from CSV', ?)`
        ).run(pid, availableStock, availableStock, req.user!.id);
      }
      imported += 1;
    }
  });

  runImport();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'CSV_PRODUCTS_IMPORTED',
    entityType: 'product',
    newValues: { imported, updated, skipped, errors: errors.length },
  });

  res.json({ imported, updated, skipped, errors });
});
