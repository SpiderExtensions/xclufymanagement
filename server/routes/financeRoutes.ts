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
import { calculateFinancialSummary, roundMoney } from '../../src/shared/erpMath.ts';

export const financeRoutes = Router();

function resolveDateRange(range: string, from?: string, to?: string): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = fmt(now);

  if (range === 'custom' && from && to) {
    return { start: from, end: to };
  }
  if (range === 'today') return { start: today, end: today };
  if (range === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ys = fmt(y);
    return { start: ys, end: ys };
  }
  if (range === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { start: fmt(d), end: today };
  }
  if (range === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { start: fmt(d), end: today };
  }
  if (range === 'this_month') {
    return { start: `${today.slice(0, 7)}-01`, end: today };
  }
  if (range === 'prev_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: fmt(first), end: fmt(last) };
  }
  if (range === 'this_year') {
    return { start: `${now.getFullYear()}-01-01`, end: today };
  }
  // All-time default
  return { start: '2000-01-01', end: '2099-12-31' };
}

// ================= DASHBOARD ANALYTICS =================

financeRoutes.get('/dashboard', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const range = String(req.query.range || 'all');
  const { start, end } = resolveDateRange(
    range,
    req.query.from ? String(req.query.from) : undefined,
    req.query.to ? String(req.query.to) : undefined
  );

  const settings = db.prepare(`SELECT * FROM business_settings WHERE id = 1`).get() as {
    opening_balance: number;
    admin_equity_capital: number;
  };

  const orderAgg = db
    .prepare(
      `SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(grand_total), 0) as order_revenue,
        COALESCE(SUM(due_amount), 0) as outstanding_receivables
       FROM orders
       WHERE order_status != 'cancelled' AND date(created_at) BETWEEN ? AND ?`
    )
    .get(start, end) as { total_orders: number; order_revenue: number; outstanding_receivables: number };

  const cogsAgg = db
    .prepare(
      `SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as cogs
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.order_status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?`
    )
    .get(start, end) as { cogs: number };

  const orderCashAgg = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as cash
       FROM payments
       WHERE payment_type IN ('order_payment', 'due_collection') AND date(created_at) BETWEEN ? AND ?`
    )
    .get(start, end) as { cash: number };

  const preorderCashAgg = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as cash
       FROM payments
       WHERE payment_type = 'preorder_advance' AND date(created_at) BETWEEN ? AND ?`
    )
    .get(start, end) as { cash: number };

  const otherIncomeAgg = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM income_records
       WHERE date(income_date) BETWEEN ? AND ?`
    )
    .get(start, end) as { total: number };

  const expenseAgg = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE date(expense_date) BETWEEN ? AND ?`
    )
    .get(start, end) as { total: number };

  const shareholderEq = db
    .prepare(
      `SELECT COALESCE(SUM(total_investment), 0) as sh_eq, COUNT(*) as sh_count
       FROM shareholders WHERE status = 'active'`
    )
    .get() as { sh_eq: number; sh_count: number };

  const withdrawalsAgg = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM shareholder_investments WHERE investment_type = 'capital_withdrawal'`
    )
    .get() as { total: number };

  const summary = calculateFinancialSummary({
    openingBalance: settings.opening_balance,
    orderRevenue: orderAgg.order_revenue,
    otherIncome: otherIncomeAgg.total,
    actualCashFromOrders: orderCashAgg.cash,
    preorderAdvancesReceived: preorderCashAgg.cash,
    actualExpenses: expenseAgg.total,
    cogs: cogsAgg.cogs,
    outstandingReceivables: orderAgg.outstanding_receivables,
    totalBusinessEquity: roundMoney(settings.admin_equity_capital + shareholderEq.sh_eq),
    capitalWithdrawals: withdrawalsAgg.total,
  });

  const counts = {
    total_orders: orderAgg.total_orders,
    total_customers: (db.prepare(`SELECT COUNT(*) as c FROM customers`).get() as { c: number }).c,
    total_products: (db.prepare(`SELECT COUNT(*) as c FROM products WHERE status != 'archived'`).get() as { c: number }).c,
    inventory_value: (
      db.prepare(`SELECT COALESCE(SUM(available_stock * purchase_price), 0) as v FROM products WHERE status != 'archived'`).get() as {
        v: number;
      }
    ).v,
    low_stock_count: (
      db.prepare(`SELECT COUNT(*) as c FROM products WHERE status != 'archived' AND available_stock <= min_stock`).get() as {
        c: number;
      }
    ).c,
    total_shareholders: shareholderEq.sh_count,
  };

  // Time-series chart (last 14 active days or within range)
  const salesSeries = db
    .prepare(
      `SELECT date(created_at) as day, COALESCE(SUM(grand_total), 0) as revenue, COUNT(*) as orders
       FROM orders WHERE order_status != 'cancelled' AND date(created_at) BETWEEN ? AND ?
       GROUP BY date(created_at) ORDER BY day ASC LIMIT 31`
    )
    .all(start, end);

  const expenseSeries = db
    .prepare(
      `SELECT date(expense_date) as day, COALESCE(SUM(amount), 0) as expense
       FROM expenses WHERE date(expense_date) BETWEEN ? AND ?
       GROUP BY date(expense_date) ORDER BY day ASC LIMIT 31`
    )
    .all(start, end);

  const bestSelling = db
    .prepare(
      `SELECT oi.product_name, SUM(oi.quantity) as units_sold, SUM(oi.line_total) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.order_status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?
       GROUP BY oi.product_id, oi.product_name
       ORDER BY units_sold DESC LIMIT 6`
    )
    .all(start, end);

  const salesByCategory = db
    .prepare(
      `SELECT COALESCE(c.name, 'Uncategorized') as category, SUM(oi.line_total) as revenue, SUM(oi.quantity) as units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE o.order_status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?
       GROUP BY category ORDER BY revenue DESC`
    )
    .all(start, end);

  const orderStatusDist = db
    .prepare(
      `SELECT order_status as status, COUNT(*) as count FROM orders WHERE date(created_at) BETWEEN ? AND ? GROUP BY order_status`
    )
    .all(start, end);

  const canSeeShareholders = req.user!.role === 'super_admin';

  res.json({
    range: { range, start, end },
    summary: canSeeShareholders
      ? summary
      : { ...summary, totalBusinessEquity: undefined },
    counts: canSeeShareholders
      ? counts
      : { ...counts, total_shareholders: undefined },
    can_see_shareholders: canSeeShareholders,
    charts: {
      sales_series: salesSeries,
      expense_series: expenseSeries,
      best_selling: bestSelling,
      sales_by_category: salesByCategory,
      order_status: orderStatusDist,
    },
  });
});

// ================= SUPPLIERS & PURCHASE ORDERS =================

financeRoutes.get('/suppliers', requireAuth, requireApproved, requireModule('suppliers'), (_req: AuthedRequest, res: Response) => {
  const suppliers = db
    .prepare(
      `SELECT s.*,
        COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE supplier_id = s.id), 0) as total_purchased,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id), 0) as total_paid
       FROM suppliers s ORDER BY s.id DESC`
    )
    .all() as Array<{ total_purchased: number; total_paid: number }>;

  const enriched = suppliers.map((s) => ({
    ...s,
    outstanding_balance: roundMoney(Math.max(0, s.total_purchased - s.total_paid)),
  }));
  const purchaseOrders = db
    .prepare(
      `SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ORDER BY po.id DESC LIMIT 100`
    )
    .all();
  const payments = db
    .prepare(
      `SELECT sp.*, s.name as supplier_name FROM supplier_payments sp JOIN suppliers s ON s.id = sp.supplier_id ORDER BY sp.id DESC LIMIT 100`
    )
    .all();
  res.json({ suppliers: enriched, purchase_orders: purchaseOrders, supplier_payments: payments });
});

financeRoutes.post('/suppliers', requireAuth, requireApproved, requireModule('suppliers'), (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) {
    res.status(400).json({ error: 'Supplier name is required.' });
    return;
  }
  const info = db
    .prepare(`INSERT INTO suppliers (name, contact_person, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      name,
      String(b.contact_person || '').trim(),
      String(b.phone || '').trim(),
      String(b.email || '').trim(),
      String(b.address || '').trim(),
      String(b.notes || '').trim()
    );
  res.status(201).json({ supplier: db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(info.lastInsertRowid) });
});

financeRoutes.post('/purchase-orders', requireAuth, requireApproved, requireModule('suppliers'), (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const supplierId = Number(b.supplier_id);
  const items = Array.isArray(b.items) ? b.items : [];
  const receiveNow = Boolean(b.receive_now);
  const amountPaid = Math.max(0, roundMoney(Number(b.amount_paid || 0)));

  if (!supplierId || items.length === 0) {
    res.status(400).json({ error: 'Supplier and at least one item are required.' });
    return;
  }

  const poNumber = `SUP-${Date.now().toString().slice(-6)}`;
  const poId = db.transaction(() => {
    let totalAmount = 0;
    const resolved: Array<{ productId: number; productName: string; qty: number; cost: number; lineTotal: number }> = [];
    for (const it of items) {
      const pid = Number(it.product_id);
      const prod = db.prepare(`SELECT id, name FROM products WHERE id = ?`).get(pid) as
        | { id: number; name: string }
        | undefined;
      if (!prod) throw new Error(`Product #${pid} not found.`);
      const qty = Math.max(1, Math.floor(Number(it.quantity || 1)));
      const cost = Math.max(0, roundMoney(Number(it.unit_cost || 0)));
      const lineTotal = roundMoney(qty * cost);
      totalAmount += lineTotal;
      resolved.push({ productId: pid, productName: prod.name, qty, cost, lineTotal });
    }

    const paid = Math.min(totalAmount, amountPaid);
    const poInfo = db
      .prepare(
        `INSERT INTO purchase_orders (po_number, supplier_id, total_amount, amount_paid, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(poNumber, supplierId, totalAmount, paid, receiveNow ? 'received' : 'pending', String(b.notes || ''), req.user!.id);

    const id = Number(poInfo.lastInsertRowid);
    const insItem = db.prepare(
      `INSERT INTO purchase_order_items (purchase_order_id, product_id, product_name, quantity, unit_cost, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const r of resolved) {
      insItem.run(id, r.productId, r.productName, r.qty, r.cost, r.lineTotal);
      if (receiveNow) {
        const cur = db.prepare(`SELECT available_stock FROM products WHERE id = ?`).get(r.productId) as {
          available_stock: number;
        };
        const next = cur.available_stock + r.qty;
        db.prepare(`UPDATE products SET available_stock = ?, purchase_price = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`).run(
          next,
          r.cost,
          r.productId
        );
        db.prepare(
          `INSERT INTO inventory_transactions (product_id, change_type, quantity_delta, previous_stock, new_stock, reference_type, reference_id, notes, created_by)
           VALUES (?, 'supplier_receive', ?, ?, ?, 'purchase_order', ?, ?, ?)`
        ).run(r.productId, r.qty, cur.available_stock, next, poNumber, `Received from PO ${poNumber}`, req.user!.id);
      }
    }

    if (paid > 0) {
      db.prepare(
        `INSERT INTO supplier_payments (supplier_id, purchase_order_id, amount, payment_method, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(supplierId, id, paid, String(b.payment_method || 'Bank Transfer'), `Payment for ${poNumber}`, req.user!.id);

      db.prepare(
        `INSERT INTO expenses (category, amount, expense_date, payment_method, reference_number, description, created_by)
         VALUES ('Product Purchasing', ?, date('now'), ?, ?, ?, ?)`
      ).run(paid, String(b.payment_method || 'Bank Transfer'), poNumber, `Supplier PO ${poNumber}`, req.user!.id);

      db.prepare(
        `INSERT INTO financial_ledger (entry_type, direction, amount, category, payment_method, reference_type, reference_id, description, entry_date, created_by)
         VALUES ('supplier_payment', 'out', ?, 'Product Purchasing', ?, 'purchase_order', ?, ?, date('now'), ?)`
      ).run(paid, String(b.payment_method || 'Bank Transfer'), poNumber, `Supplier PO ${poNumber}`, req.user!.id);
    }

    return id;
  })();

  res.status(201).json({ purchase_order: db.prepare(`SELECT * FROM purchase_orders WHERE id = ?`).get(poId) });
});

financeRoutes.post('/suppliers/:id/pay', requireAuth, requireApproved, requireModule('suppliers'), (req: AuthedRequest, res: Response) => {
  const supplierId = Number(req.params.id);
  const amount = Math.max(0, roundMoney(Number(req.body?.amount || 0)));
  const paymentMethod = String(req.body?.payment_method || 'Bank Transfer');
  const reference = String(req.body?.reference_number || '').trim();
  const notes = String(req.body?.notes || '').trim();

  if (amount <= 0) {
    res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    return;
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO supplier_payments (supplier_id, amount, payment_method, reference_number, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(supplierId, amount, paymentMethod, reference, notes, req.user!.id);

    db.prepare(
      `INSERT INTO expenses (category, amount, expense_date, payment_method, reference_number, description, created_by)
       VALUES ('Product Purchasing', ?, date('now'), ?, ?, ?, ?)`
    ).run(amount, paymentMethod, reference, notes || `Supplier payment #${supplierId}`, req.user!.id);

    db.prepare(
      `INSERT INTO financial_ledger (entry_type, direction, amount, category, payment_method, reference_type, reference_id, description, entry_date, created_by)
       VALUES ('supplier_payment', 'out', ?, 'Product Purchasing', ?, 'supplier', ?, ?, date('now'), ?)`
    ).run(amount, paymentMethod, String(supplierId), notes || `Supplier payment #${supplierId}`, req.user!.id);
  })();

  res.json({ ok: true });
});

// ================= INCOME, EXPENSES & LEDGER =================

financeRoutes.get('/income', requireAuth, requireApproved, requireModule('income'), (_req: AuthedRequest, res: Response) => {
  const records = db.prepare(`SELECT * FROM income_records ORDER BY income_date DESC, id DESC LIMIT 200`).all();
  const orderPayments = db
    .prepare(
      `SELECT p.*, o.order_number, c.name as customer_name
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       LEFT JOIN customers c ON c.id = p.customer_id
       ORDER BY p.id DESC LIMIT 200`
    )
    .all();
  res.json({ income_records: records, order_payments: orderPayments });
});

financeRoutes.post('/income', requireAuth, requireApproved, requireModule('income'), (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const category = String(b.category || 'Other Income').trim();
  const amount = Math.max(0, roundMoney(Number(b.amount || 0)));
  const incomeDate = String(b.income_date || new Date().toISOString().slice(0, 10));
  const paymentMethod = String(b.payment_method || 'Cash').trim();
  const description = String(b.description || '').trim();

  if (amount <= 0) {
    res.status(400).json({ error: 'Income amount must be greater than zero.' });
    return;
  }

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO income_records (category, amount, income_date, payment_method, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(category, amount, incomeDate, paymentMethod, description, req.user!.id);
    db.prepare(
      `INSERT INTO financial_ledger (entry_type, direction, amount, category, payment_method, reference_type, reference_id, description, entry_date, created_by)
       VALUES ('other_income', 'in', ?, ?, ?, 'income_record', ?, ?, ?, ?)`
    ).run(amount, category, paymentMethod, String(info.lastInsertRowid), description || category, incomeDate, req.user!.id);
    return Number(info.lastInsertRowid);
  })();

  res.status(201).json({ record: db.prepare(`SELECT * FROM income_records WHERE id = ?`).get(id) });
});

financeRoutes.get('/expenses', requireAuth, requireApproved, requireModule('expenses'), (_req: AuthedRequest, res: Response) => {
  const expenses = db.prepare(`SELECT * FROM expenses ORDER BY expense_date DESC, id DESC LIMIT 250`).all();
  res.json({ expenses });
});

financeRoutes.post('/expenses', requireAuth, requireApproved, requireModule('expenses'), async (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const category = String(b.category || 'Other Expenses').trim();
  const amount = Math.max(0, roundMoney(Number(b.amount || 0)));
  const expenseDate = String(b.expense_date || new Date().toISOString().slice(0, 10));
  const paymentMethod = String(b.payment_method || 'Cash').trim();
  const vendorName = String(b.vendor_name || '').trim();
  const reference = String(b.reference_number || '').trim();
  const description = String(b.description || '').trim();

  if (amount <= 0) {
    res.status(400).json({ error: 'Expense amount must be greater than zero.' });
    return;
  }

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO expenses (category, amount, expense_date, payment_method, vendor_name, reference_number, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(category, amount, expenseDate, paymentMethod, vendorName, reference, description, req.user!.id);
    db.prepare(
      `INSERT INTO financial_ledger (entry_type, direction, amount, category, payment_method, reference_type, reference_id, description, entry_date, created_by)
       VALUES ('expense', 'out', ?, ?, ?, 'expense', ?, ?, ?, ?)`
    ).run(amount, category, paymentMethod, String(info.lastInsertRowid), description || category, expenseDate, req.user!.id);
    return Number(info.lastInsertRowid);
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'EXPENSE_RECORDED',
    entityType: 'expense',
    entityId: id,
    newValues: { category, amount, expenseDate },
  });

  await dispatchNotification({
    roles: ['super_admin', 'admin', 'accountant'],
    category: 'business',
    title: 'New Expense Recorded',
    message: `৳${amount.toLocaleString()} logged under ${category}${description ? ` — ${description}` : ''}.`,
    linkModule: 'expenses',
  });

  res.status(201).json({ expense: db.prepare(`SELECT * FROM expenses WHERE id = ?`).get(id) });
});

financeRoutes.get('/transactions', requireAuth, requireApproved, requireModule('transactions'), (_req: AuthedRequest, res: Response) => {
  const ledger = db
    .prepare(
      `SELECT l.*, u.full_name as created_by_name
       FROM financial_ledger l
       LEFT JOIN profiles u ON u.id = l.created_by
       ORDER BY l.entry_date DESC, l.id DESC LIMIT 300`
    )
    .all();
  res.json({ transactions: ledger });
});

// ================= FINANCIAL REPORTS =================

financeRoutes.get('/reports', requireAuth, requireApproved, requireModule('reports'), (req: AuthedRequest, res: Response) => {
  const reportType = String(req.query.type || 'profit_loss');
  const from = String(req.query.from || '2000-01-01');
  const to = String(req.query.to || '2099-12-31');

  if (reportType === 'shareholder_investments' || reportType === 'ownership_distribution' || reportType === 'profit_distribution') {
    if (req.user!.role !== 'super_admin') {
      res.status(403).json({ error: 'Shareholder financial reports require Main Admin authorization.' });
      return;
    }
  }

  let rows: unknown[] = [];
  if (reportType === 'daily_sales' || reportType === 'weekly_sales' || reportType === 'monthly_sales' || reportType === 'yearly_sales') {
    const groupExpr =
      reportType === 'yearly_sales'
        ? `strftime('%Y', created_at)`
        : reportType === 'monthly_sales'
          ? `strftime('%Y-%m', created_at)`
          : reportType === 'weekly_sales'
            ? `strftime('%Y-W%W', created_at)`
            : `date(created_at)`;
    rows = db
      .prepare(
        `SELECT ${groupExpr} as period, COUNT(*) as order_count, SUM(subtotal) as subtotal, SUM(discount_amount) as discounts, SUM(grand_total) as revenue, SUM(amount_paid) as cash_received, SUM(due_amount) as due_amount
         FROM orders WHERE order_status != 'cancelled' AND date(created_at) BETWEEN ? AND ?
         GROUP BY period ORDER BY period DESC`
      )
      .all(from, to);
  } else if (reportType === 'expenses') {
    rows = db
      .prepare(`SELECT expense_date, category, vendor_name, payment_method, amount, description FROM expenses WHERE date(expense_date) BETWEEN ? AND ? ORDER BY expense_date DESC`)
      .all(from, to);
  } else if (reportType === 'inventory') {
    rows = db
      .prepare(
        `SELECT p.sku, p.name, c.name as category, p.available_stock, p.reserved_stock, p.sold_stock, p.purchase_price, p.selling_price, (p.available_stock * p.purchase_price) as stock_cost_value
         FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status != 'archived' ORDER BY p.available_stock ASC`
      )
      .all();
  } else if (reportType === 'best_selling') {
    rows = db
      .prepare(
        `SELECT oi.sku, oi.product_name, SUM(oi.quantity) as quantity_sold, SUM(oi.line_total) as total_revenue, SUM(oi.cost_price * oi.quantity) as total_cost
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.order_status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?
         GROUP BY oi.product_id ORDER BY quantity_sold DESC`
      )
      .all(from, to);
  } else if (reportType === 'customer_purchases') {
    rows = db
      .prepare(
        `SELECT c.name, c.phone, COUNT(o.id) as orders, COALESCE(SUM(o.grand_total), 0) as total_spent, COALESCE(SUM(o.amount_paid), 0) as paid, COALESCE(SUM(o.due_amount), 0) as due
         FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.order_status != 'cancelled'
         GROUP BY c.id ORDER BY total_spent DESC`
      )
      .all();
  } else if (reportType === 'preorders') {
    rows = db.prepare(`SELECT preorder_number, customer_name, product_name, quantity, total_amount, advance_payment, remaining_payment, status, expected_arrival FROM preorders ORDER BY id DESC`).all();
  } else if (reportType === 'waitlists') {
    rows = db
      .prepare(`SELECT w.customer_name, w.phone, p.name as product_name, w.quantity, w.priority, w.status, w.expected_availability FROM waitlist_entries w JOIN products p ON p.id = w.product_id ORDER BY w.id DESC`)
      .all();
  } else if (reportType === 'outstanding_dues') {
    rows = db
      .prepare(`SELECT order_number, customer_name, customer_phone, grand_total, amount_paid, due_amount, payment_status, created_at FROM orders WHERE due_amount > 0 AND order_status != 'cancelled' ORDER BY due_amount DESC`)
      .all();
  } else if (reportType === 'cash_flow') {
    rows = db
      .prepare(`SELECT entry_date, entry_type, direction, category, payment_method, amount, description FROM financial_ledger WHERE date(entry_date) BETWEEN ? AND ? ORDER BY entry_date DESC, id DESC`)
      .all(from, to);
  } else if (reportType === 'shareholder_investments') {
    rows = db.prepare(`SELECT investment_date, shareholder_name, investment_type, amount, payment_method, reference_number, description FROM shareholder_investments ORDER BY investment_date DESC`).all();
  } else if (reportType === 'ownership_distribution') {
    rows = db.prepare(`SELECT full_name, total_investment, ROUND(ownership_bps / 100.0, 2) as ownership_percent, status FROM shareholders ORDER BY ownership_bps DESC`).all();
  } else if (reportType === 'profit_distribution') {
    rows = db.prepare(`SELECT period_label, period_start, period_end, distributable_profit, distributed_amount, authorized_by_name, created_at FROM profit_distributions ORDER BY id DESC`).all();
  } else {
    // Profit & Loss summary rows
    const ordersRev = (
      db.prepare(`SELECT COALESCE(SUM(grand_total), 0) as v FROM orders WHERE order_status != 'cancelled' AND date(created_at) BETWEEN ? AND ?`).get(from, to) as { v: number }
    ).v;
    const otherInc = (
      db.prepare(`SELECT COALESCE(SUM(amount), 0) as v FROM income_records WHERE date(income_date) BETWEEN ? AND ?`).get(from, to) as { v: number }
    ).v;
    const cogs = (
      db.prepare(`SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as v FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?`).get(from, to) as { v: number }
    ).v;
    const expRows = db
      .prepare(`SELECT category, SUM(amount) as total FROM expenses WHERE date(expense_date) BETWEEN ? AND ? GROUP BY category`)
      .all(from, to) as Array<{ category: string; total: number }>;
    const totalExp = expRows.reduce((s, r) => s + r.total, 0);
    rows = [
      { line_item: 'Product Sales Revenue', amount: ordersRev },
      { line_item: 'Other Operating Income', amount: otherInc },
      { line_item: 'Cost of Goods Sold (COGS)', amount: -cogs },
      { line_item: 'Gross Profit', amount: roundMoney(ordersRev + otherInc - cogs) },
      ...expRows.map((e) => ({ line_item: `Expense — ${e.category}`, amount: -e.total })),
      { line_item: 'Net Profit', amount: roundMoney(ordersRev + otherInc - cogs - totalExp) },
    ];
  }

  res.json({ report_type: reportType, from, to, rows });
});
