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
import { calculateOrderTotals, roundMoney } from '../../src/shared/erpMath.ts';

export const salesRoutes = Router();

function generateCode(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

// ================= CUSTOMERS =================

salesRoutes.get('/customers', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const search = req.query.search ? String(req.query.search).trim() : '';
  let sql = `
    SELECT c.*,
      COUNT(DISTINCT o.id) as total_orders,
      COALESCE(SUM(CASE WHEN o.order_status != 'cancelled' THEN o.grand_total ELSE 0 END), 0) as total_spent,
      COALESCE(SUM(CASE WHEN o.order_status != 'cancelled' THEN o.due_amount ELSE 0 END), 0) as outstanding_due
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (search) {
    sql += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ` GROUP BY c.id ORDER BY c.id DESC`;
  const customers = db.prepare(sql).all(...params);
  res.json({ customers });
});

salesRoutes.get('/customers/:id', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found.' });
    return;
  }
  const orders = db.prepare(`SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC`).all(id);
  const payments = db.prepare(`SELECT * FROM payments WHERE customer_id = ? ORDER BY id DESC`).all(id);
  const preorders = db.prepare(`SELECT * FROM preorders WHERE customer_id = ? ORDER BY id DESC`).all(id);
  const waitlists = db
    .prepare(
      `SELECT w.*, p.name as product_name FROM waitlist_entries w LEFT JOIN products p ON p.id = w.product_id WHERE w.customer_id = ? ORDER BY w.id DESC`
    )
    .all(id);
  res.json({ customer, orders, payments, preorders, waitlists });
});

salesRoutes.post('/customers', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  if (!name || !phone) {
    res.status(400).json({ error: 'Customer name and phone number are required.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO customers (name, phone, email, address, division, district, upazila, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      phone,
      String(b.email || '').trim(),
      String(b.address || '').trim(),
      String(b.division || '').trim(),
      String(b.district || '').trim(),
      String(b.upazila || '').trim(),
      String(b.notes || '').trim()
    );
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ customer });
});

salesRoutes.put('/customers/:id', requireAuth, requireApproved, requireModule('customers'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim();
  if (!name || !phone) {
    res.status(400).json({ error: 'Customer name and phone are required.' });
    return;
  }
  db.prepare(
    `UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, division = ?, district = ?, upazila = ?, notes = ? WHERE id = ?`
  ).run(
    name,
    phone,
    String(b.email || '').trim(),
    String(b.address || '').trim(),
    String(b.division || '').trim(),
    String(b.district || '').trim(),
    String(b.upazila || '').trim(),
    String(b.notes || '').trim(),
    id
  );
  res.json({ customer: db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) });
});

// ================= ORDERS & POS =================

salesRoutes.get('/orders', requireAuth, requireApproved, requireModule('orders'), (req: AuthedRequest, res: Response) => {
  const status = req.query.status ? String(req.query.status) : '';
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql = `
    SELECT o.*, u.full_name as created_by_name
    FROM orders o
    LEFT JOIN profiles u ON u.id = o.created_by
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (status) {
    sql += ` AND o.order_status = ?`;
    params.push(status);
  }
  if (search) {
    sql += ` AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY o.id DESC LIMIT 200`;

  const orders = db.prepare(sql).all(...params) as Array<{ id: number }>;
  const items = db.prepare(`SELECT * FROM order_items ORDER BY id ASC`).all() as Array<{ order_id: number }>;
  const itemMap = new Map<number, unknown[]>();
  for (const it of items) {
    const list = itemMap.get(it.order_id) || [];
    list.push(it);
    itemMap.set(it.order_id, list);
  }
  res.json({
    orders: orders.map((o) => ({ ...o, items: itemMap.get(o.id) || [] })),
  });
});

salesRoutes.get('/orders/:id', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const order = db
    .prepare(`SELECT o.*, u.full_name as created_by_name FROM orders o LEFT JOIN profiles u ON u.id = o.created_by WHERE o.id = ?`)
    .get(id);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(id);
  const payments = db.prepare(`SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC`).all(id);
  res.json({ order: { ...order, items }, payments });
});

salesRoutes.post('/orders', requireAuth, requireApproved, requireModule('pos'), async (req: AuthedRequest, res: Response) => {
  try {
    const b = req.body || {};
    const rawItems = Array.isArray(b.items) ? b.items : [];
    if (rawItems.length === 0) {
      res.status(400).json({ error: 'Add at least one product to the cart.' });
      return;
    }

    const customerId = b.customer_id ? Number(b.customer_id) : null;
    let customerName = String(b.customer_name || 'Walk-in Guest').trim() || 'Walk-in Guest';
    let customerPhone = String(b.customer_phone || '').trim();

    if (customerId) {
      const cust = db.prepare(`SELECT name, phone FROM customers WHERE id = ?`).get(customerId) as
        | { name: string; phone: string }
        | undefined;
      if (cust) {
        customerName = cust.name;
        customerPhone = cust.phone;
      }
    }

    const discountAmount = Math.max(0, roundMoney(Number(b.discount_amount || 0)));
    const deliveryCharge = Math.max(0, roundMoney(Number(b.delivery_charge || 0)));
    const paymentMethod = String(b.payment_method || 'Cash').trim();
    const orderStatus = String(b.order_status || 'completed');
    const requestedPaid = b.amount_paid !== undefined ? Math.max(0, roundMoney(Number(b.amount_paid))) : 0;

    const lowStockAlerts: Array<{ name: string; stock: number; minStock: number }> = [];

    const createdOrderId = db.transaction(() => {
      // Resolve line items from authoritative DB prices & validate stock once
      const resolvedItems: Array<{
        productId: number;
        variantId: number | null;
        productName: string;
        variantLabel: string;
        sku: string;
        quantity: number;
        unitPrice: number;
        costPrice: number;
        lineTotal: number;
      }> = [];

      for (const item of rawItems) {
        const productId = Number(item.product_id);
        const variantId = item.variant_id ? Number(item.variant_id) : null;
        const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));

        const prod = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId) as
          | {
              id: number;
              name: string;
              sku: string;
              purchase_price: number;
              selling_price: number;
              discount_price: number | null;
              available_stock: number;
              min_stock: number;
            }
          | undefined;
        if (!prod) throw new Error(`Product #${productId} not found.`);

        let unitPrice =
          item.unit_price !== undefined
            ? Math.max(0, roundMoney(Number(item.unit_price)))
            : prod.discount_price !== null && prod.discount_price > 0
              ? prod.discount_price
              : prod.selling_price;
        let variantLabel = '';
        let itemSku = prod.sku;

        if (variantId) {
          const variant = db
            .prepare(`SELECT * FROM product_variants WHERE id = ? AND product_id = ?`)
            .get(variantId, productId) as
            | { id: number; size: string; color: string; material: string; style: string; sku: string; price: number; stock: number }
            | undefined;
          if (!variant) throw new Error(`Selected variant not found for ${prod.name}.`);
          if (variant.stock < quantity) {
            throw new Error(`Insufficient variant stock for ${prod.name} (${variant.sku}). Available: ${variant.stock}.`);
          }
          if (item.unit_price === undefined && variant.price > 0) {
            unitPrice = variant.price;
          }
          variantLabel = [variant.size, variant.color, variant.material, variant.style].filter(Boolean).join(' / ');
          itemSku = variant.sku;

          db.prepare(`UPDATE product_variants SET stock = stock - ? WHERE id = ?`).run(quantity, variantId);
        } else if (prod.available_stock < quantity) {
          throw new Error(`Insufficient stock for ${prod.name}. Available: ${prod.available_stock}.`);
        }

        // Deduct product stock exactly once
        const prevStock = prod.available_stock;
        const newStock = Math.max(0, prevStock - quantity);
        db.prepare(
          `UPDATE products SET
            available_stock = ?,
            sold_stock = sold_stock + ?,
            status = CASE WHEN ? <= 0 THEN 'out_of_stock' ELSE status END,
            updated_at = datetime('now')
           WHERE id = ?`
        ).run(newStock, quantity, newStock, productId);

        db.prepare(
          `INSERT INTO inventory_transactions (product_id, variant_id, change_type, quantity_delta, previous_stock, new_stock, reference_type, notes, created_by)
           VALUES (?, ?, 'sale', ?, ?, ?, 'order', 'POS / Order Sale', ?)`
        ).run(productId, variantId, -quantity, prevStock, newStock, req.user!.id);

        if (newStock <= prod.min_stock) {
          lowStockAlerts.push({ name: prod.name, stock: newStock, minStock: prod.min_stock });
        }

        resolvedItems.push({
          productId,
          variantId,
          productName: prod.name,
          variantLabel,
          sku: itemSku,
          quantity,
          unitPrice,
          costPrice: prod.purchase_price,
          lineTotal: roundMoney(quantity * unitPrice),
        });
      }

      const totals = calculateOrderTotals(
        resolvedItems.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
        discountAmount,
        deliveryCharge,
        requestedPaid
      );

      const orderNumber = generateCode('XC');
      const orderInfo = db
        .prepare(
          `INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, subtotal, discount_amount, delivery_charge, grand_total, amount_paid, due_amount, payment_method, payment_status, order_status, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orderNumber,
          customerId,
          customerName,
          customerPhone,
          totals.subtotal,
          totals.discountAmount,
          totals.deliveryCharge,
          totals.grandTotal,
          totals.amountPaid,
          totals.dueAmount,
          paymentMethod,
          totals.paymentStatus,
          orderStatus,
          String(b.notes || '').trim(),
          req.user!.id
        );

      const orderId = Number(orderInfo.lastInsertRowid);
      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_label, sku, quantity, unit_price, cost_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const it of resolvedItems) {
        insertItem.run(
          orderId,
          it.productId,
          it.variantId,
          it.productName,
          it.variantLabel,
          it.sku,
          it.quantity,
          it.unitPrice,
          it.costPrice,
          it.lineTotal
        );
      }

      if (totals.amountPaid > 0) {
        db.prepare(
          `INSERT INTO payments (order_id, customer_id, amount, payment_method, payment_type, notes, received_by)
           VALUES (?, ?, ?, ?, 'order_payment', ?, ?)`
        ).run(orderId, customerId, totals.amountPaid, paymentMethod, `Initial payment for ${orderNumber}`, req.user!.id);

        db.prepare(
          `INSERT INTO financial_ledger (entry_type, direction, amount, category, payment_method, reference_type, reference_id, description, entry_date, created_by)
           VALUES ('order_payment', 'in', ?, 'Product Sales', ?, 'order', ?, ?, date('now'), ?)`
        ).run(totals.amountPaid, paymentMethod, orderNumber, `Order ${orderNumber} (${customerName})`, req.user!.id);
      }

      return { orderId, orderNumber, grandTotal: totals.grandTotal, amountPaid: totals.amountPaid };
    })();

    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: createdOrderId.orderNumber,
      newValues: { grand_total: createdOrderId.grandTotal, amount_paid: createdOrderId.amountPaid },
    });

    await dispatchNotification({
      roles: ['super_admin', 'admin', 'manager', 'accountant'],
      category: 'business',
      title: `New Order ${createdOrderId.orderNumber}`,
      message: `${customerName} placed an order of ৳${createdOrderId.grandTotal.toLocaleString()} (Paid: ৳${createdOrderId.amountPaid.toLocaleString()}).`,
      linkModule: 'orders',
    });

    for (const alert of lowStockAlerts) {
      await dispatchNotification({
        roles: ['super_admin', 'admin', 'manager', 'inventory_manager'],
        category: 'business',
        title: alert.stock === 0 ? 'Out of Stock Alert' : 'Low Stock Alert',
        message: `${alert.name} now has ${alert.stock} unit(s) remaining.`,
        linkModule: 'inventory',
      });
    }

    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(createdOrderId.orderId) as Record<string, unknown>;
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(createdOrderId.orderId);
    res.status(201).json({ order: { ...order, items } });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Failed to create order.' });
  }
});

salesRoutes.post('/orders/:id/payment', requireAuth, requireApproved, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const amount = Math.max(0, roundMoney(Number(req.body?.amount || 0)));
  const paymentMethod = String(req.body?.payment_method || 'Cash').trim();
  const reference = String(req.body?.reference_number || '').trim();

  if (amount <= 0) {
    res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    return;
  }

  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as
    | { id: number; order_number: string; customer_id: number | null; customer_name: string; grand_total: number; amount_paid: number; due_amount: number }
    | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (order.due_amount <= 0) {
    res.status(400).json({ error: 'This order is already fully paid.' });
    return;
  }

  const appliedAmount = Math.min(order.due_amount, amount);
  const newPaid = roundMoney(order.amount_paid + appliedAmount);
  const newDue = roundMoney(Math.max(0, order.grand_total - newPaid));
  const paymentStatus = newDue <= 0 ? 'paid' : 'partial';

  db.transaction(() => {
    db.prepare(`UPDATE orders SET amount_paid = ?, due_amount = ?, payment_status = ? WHERE id = ?`).run(
      newPaid,
      newDue,
      paymentStatus,
      id
    );
    db.prepare(
      `INSERT INTO payments (order_id, customer_id, amount, payment_method, payment_type, reference_number, notes, received_by)
       VALUES (?, ?, ?, ?, 'due_collection', ?, ?, ?)`
    ).run(id, order.customer_id, appliedAmount, paymentMethod, reference, `Due collection for ${order.order_number}`, req.user!.id);

    db.prepare(
      `INSERT INTO financial_ledger (entry_type, direction, amount, category, payment_method, reference_type, reference_id, description, entry_date, created_by)
       VALUES ('due_collection', 'in', ?, 'Due Collections', ?, 'order', ?, ?, date('now'), ?)`
    ).run(appliedAmount, paymentMethod, order.order_number, `Due collection ${order.order_number} (${order.customer_name})`, req.user!.id);
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'DUE_PAYMENT_COLLECTED',
    entityType: 'order',
    entityId: order.order_number,
    newValues: { collected: appliedAmount, remaining_due: newDue },
  });

  await dispatchNotification({
    roles: ['super_admin', 'admin', 'accountant'],
    category: 'business',
    title: `Payment Received (${order.order_number})`,
    message: `Collected ৳${appliedAmount.toLocaleString()} via ${paymentMethod}. Remaining due: ৳${newDue.toLocaleString()}.`,
    linkModule: 'orders',
  });

  res.json({ order: db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) });
});

salesRoutes.patch('/orders/:id/status', requireAuth, requireApproved, requireModule('orders'), async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const newStatus = String(req.body?.order_status || '');
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as
    | { id: number; order_number: string; order_status: string }
    | undefined;
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  db.transaction(() => {
    // If transitioning to cancelled from non-cancelled, restore stock once
    if (newStatus === 'cancelled' && order.order_status !== 'cancelled') {
      const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(id) as Array<{
        product_id: number;
        variant_id: number | null;
        quantity: number;
      }>;
      for (const it of items) {
        const prod = db.prepare(`SELECT available_stock FROM products WHERE id = ?`).get(it.product_id) as {
          available_stock: number;
        };
        const nextStock = prod.available_stock + it.quantity;
        db.prepare(
          `UPDATE products SET available_stock = ?, sold_stock = MAX(0, sold_stock - ?), status = 'active', updated_at = datetime('now') WHERE id = ?`
        ).run(nextStock, it.quantity, it.product_id);
        if (it.variant_id) {
          db.prepare(`UPDATE product_variants SET stock = stock + ? WHERE id = ?`).run(it.quantity, it.variant_id);
        }
        db.prepare(
          `INSERT INTO inventory_transactions (product_id, variant_id, change_type, quantity_delta, previous_stock, new_stock, reference_type, reference_id, notes, created_by)
           VALUES (?, ?, 'order_cancelled_restore', ?, ?, ?, 'order', ?, 'Stock restored on cancellation', ?)`
        ).run(it.product_id, it.variant_id, it.quantity, prod.available_stock, nextStock, order.order_number, req.user!.id);
      }
    }
    db.prepare(`UPDATE orders SET order_status = ? WHERE id = ?`).run(newStatus, id);
  })();

  await dispatchNotification({
    roles: ['super_admin', 'admin', 'manager'],
    category: 'business',
    title: `Order ${order.order_number} ${newStatus}`,
    message: `Order status changed from ${order.order_status} to ${newStatus}.`,
    linkModule: 'orders',
  });

  res.json({ order: db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) });
});

// ================= PRE-ORDERS =================

salesRoutes.get('/preorders', requireAuth, requireApproved, requireModule('preorders'), (_req: AuthedRequest, res: Response) => {
  const preorders = db
    .prepare(
      `SELECT pr.*, s.name as supplier_name FROM preorders pr LEFT JOIN suppliers s ON s.id = pr.supplier_id ORDER BY pr.id DESC`
    )
    .all();
  res.json({ preorders });
});

salesRoutes.post('/preorders', requireAuth, requireApproved, requireModule('preorders'), async (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const customerId = b.customer_id ? Number(b.customer_id) : null;
  const customerName = String(b.customer_name || '').trim();
  const customerPhone = String(b.customer_phone || '').trim();
  const productId = b.product_id ? Number(b.product_id) : null;
  const productName = String(b.product_name || '').trim();
  const quantity = Math.max(1, Math.floor(Number(b.quantity || 1)));
  const unitPrice = Math.max(0, roundMoney(Number(b.unit_price || 0)));
  const totalAmount = roundMoney(quantity * unitPrice);
  const advancePayment = Math.min(totalAmount, Math.max(0, roundMoney(Number(b.advance_payment || 0))));
  const remainingPayment = roundMoney(Math.max(0, totalAmount - advancePayment));

  if (!customerName || !productName) {
    res.status(400).json({ error: 'Customer name and product name are required.' });
    return;
  }

  const preorderNumber = generateCode('PO-PRE');
  const status = String(b.status || (advancePayment > 0 ? 'Advance Received' : 'Pending'));

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO preorders (preorder_number, customer_id, customer_name, customer_phone, product_id, product_name, variant_id, variant_label, quantity, unit_price, total_amount, advance_payment, remaining_payment, expected_arrival, supplier_id, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        preorderNumber,
        customerId,
        customerName,
        customerPhone,
        productId,
        productName,
        b.variant_id ? Number(b.variant_id) : null,
        String(b.variant_label || '').trim(),
        quantity,
        unitPrice,
        totalAmount,
        advancePayment,
        remainingPayment,
        String(b.expected_arrival || '').trim(),
        b.supplier_id ? Number(b.supplier_id) : null,
        status,
        String(b.notes || '').trim(),
        req.user!.id
      );

    const pid = Number(info.lastInsertRowid);
    if (advancePayment > 0) {
      db.prepare(
        `INSERT INTO payments (preorder_id, customer_id, amount, payment_method, payment_type, notes, received_by)
         VALUES (?, ?, ?, ?, 'preorder_advance', ?, ?)`
      ).run(pid, customerId, advancePayment, String(b.payment_method || 'bKash'), `Advance for ${preorderNumber}`, req.user!.id);

      db.prepare(
        `INSERT INTO financial_ledger (entry_type, direction, amount, category, payment_method, reference_type, reference_id, description, entry_date, created_by)
         VALUES ('preorder_advance', 'in', ?, 'Pre-order Advances', ?, 'preorder', ?, ?, date('now'), ?)`
      ).run(advancePayment, String(b.payment_method || 'bKash'), preorderNumber, `Pre-order advance ${preorderNumber}`, req.user!.id);
    }
    return pid;
  })();

  res.status(201).json({ preorder: db.prepare(`SELECT * FROM preorders WHERE id = ?`).get(id) });
});

salesRoutes.patch('/preorders/:id', requireAuth, requireApproved, requireModule('preorders'), async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const current = db.prepare(`SELECT * FROM preorders WHERE id = ?`).get(id) as
    | { id: number; preorder_number: string; product_name: string; customer_name: string; status: string }
    | undefined;
  if (!current) {
    res.status(404).json({ error: 'Pre-order not found.' });
    return;
  }

  const nextStatus = String(req.body?.status || current.status);
  db.prepare(`UPDATE preorders SET status = ?, expected_arrival = COALESCE(?, expected_arrival), notes = COALESCE(?, notes) WHERE id = ?`).run(
    nextStatus,
    req.body?.expected_arrival ?? null,
    req.body?.notes ?? null,
    id
  );

  if (nextStatus === 'Arrived' && current.status !== 'Arrived') {
    await dispatchNotification({
      roles: ['super_admin', 'admin', 'manager', 'sales_staff'],
      category: 'business',
      title: `Pre-order Arrived (${current.preorder_number})`,
      message: `${current.product_name} for ${current.customer_name} has arrived and is ready for customer notification.`,
      linkModule: 'preorders',
    });
  }

  res.json({ preorder: db.prepare(`SELECT * FROM preorders WHERE id = ?`).get(id) });
});

// ================= CUSTOMER WAITLIST =================

salesRoutes.get('/waitlist', requireAuth, requireApproved, requireModule('waitlist'), (_req: AuthedRequest, res: Response) => {
  const entries = db
    .prepare(
      `SELECT w.*, p.name as product_name, p.available_stock as current_stock
       FROM waitlist_entries w
       JOIN products p ON p.id = w.product_id
       ORDER BY w.id DESC`
    )
    .all();
  res.json({ entries });
});

salesRoutes.post('/waitlist', requireAuth, requireApproved, requireModule('waitlist'), (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const customerName = String(b.customer_name || '').trim();
  const phone = String(b.phone || '').trim();
  const productId = Number(b.product_id);
  if (!customerName || !productId) {
    res.status(400).json({ error: 'Customer name and product are required.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO waitlist_entries (customer_id, customer_name, phone, product_id, variant_id, variant_label, quantity, priority, expected_availability, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.customer_id ? Number(b.customer_id) : null,
      customerName,
      phone,
      productId,
      b.variant_id ? Number(b.variant_id) : null,
      String(b.variant_label || '').trim(),
      Math.max(1, Math.floor(Number(b.quantity || 1))),
      String(b.priority || 'Normal'),
      String(b.expected_availability || '').trim(),
      String(b.status || 'Waiting'),
      String(b.notes || '').trim()
    );
  res.status(201).json({ entry: db.prepare(`SELECT * FROM waitlist_entries WHERE id = ?`).get(info.lastInsertRowid) });
});

salesRoutes.patch('/waitlist/:id', requireAuth, requireApproved, requireModule('waitlist'), (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(`UPDATE waitlist_entries SET status = COALESCE(?, status), priority = COALESCE(?, priority), notes = COALESCE(?, notes) WHERE id = ?`).run(
    req.body?.status ?? null,
    req.body?.priority ?? null,
    req.body?.notes ?? null,
    id
  );
  res.json({ entry: db.prepare(`SELECT * FROM waitlist_entries WHERE id = ?`).get(id) });
});
