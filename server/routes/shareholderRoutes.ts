import { Router, type Response } from 'express';
import { db } from '../db.ts';
import {
  dispatchNotification,
  logAudit,
  requireApproved,
  requireAuth,
  requireSuperAdmin,
  type AuthedRequest,
} from '../auth.ts';
import {
  bpsToPercent,
  calculateInvestmentOwnershipBps,
  calculateProfitDistribution,
  percentToBps,
  roundMoney,
  validateManualOwnershipBps,
} from '../../src/shared/erpMath.ts';

export const shareholderRoutes = Router();

function getShareholderOverviewData() {
  const settings = db
    .prepare(`SELECT admin_ownership_bps, admin_equity_capital FROM business_settings WHERE id = 1`)
    .get() as { admin_ownership_bps: number; admin_equity_capital: number };

  const adminUser = db
    .prepare(`SELECT id, full_name, email, phone, avatar_url FROM profiles WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1`)
    .get() as { id: number; full_name: string; email: string; phone: string; avatar_url: string | null } | undefined;

  const shareholders = db
    .prepare(
      `SELECT s.*, p.full_name as linked_user_name
       FROM shareholders s
       LEFT JOIN profiles p ON p.id = s.linked_user_id
       ORDER BY s.ownership_bps DESC, s.id ASC`
    )
    .all() as Array<{
    id: number;
    full_name: string;
    total_investment: number;
    ownership_bps: number;
    linked_user_id: number | null;
    can_view_own_portal: number;
    status: string;
  }>;

  const enrichedShareholders = shareholders.map((s) => ({
    ...s,
    ownership_percent: bpsToPercent(s.ownership_bps),
  }));

  const totalShareholderInvestment = shareholders
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + s.total_investment, 0);

  const totalBusinessEquity = roundMoney(settings.admin_equity_capital + totalShareholderInvestment);

  const investments = db
    .prepare(`SELECT * FROM shareholder_investments ORDER BY investment_date DESC, id DESC LIMIT 100`)
    .all();

  const history = db
    .prepare(`SELECT * FROM ownership_history ORDER BY id DESC LIMIT 100`)
    .all();

  const distributions = db
    .prepare(`SELECT * FROM profit_distributions ORDER BY id DESC LIMIT 50`)
    .all() as Array<{ id: number }>;

  const distItems = db.prepare(`SELECT * FROM profit_distribution_items`).all() as Array<{
    distribution_id: number;
  }>;
  const distItemMap = new Map<number, unknown[]>();
  for (const item of distItems) {
    const arr = distItemMap.get(item.distribution_id) || [];
    arr.push(item);
    distItemMap.set(item.distribution_id, arr);
  }

  return {
    main_admin: {
      name: adminUser?.full_name || 'Main Admin',
      email: adminUser?.email || '',
      avatar_url: adminUser?.avatar_url || null,
      equity_capital: settings.admin_equity_capital,
      ownership_bps: settings.admin_ownership_bps,
      ownership_percent: bpsToPercent(settings.admin_ownership_bps),
    },
    total_business_equity: totalBusinessEquity,
    total_shareholders: shareholders.filter((s) => s.status === 'active').length,
    shareholders: enrichedShareholders,
    investments,
    ownership_history: history,
    profit_distributions: distributions.map((d) => ({
      ...d,
      items: distItemMap.get(d.id) || [],
    })),
  };
}

// GET /api/shareholders — Main Admin sees full registry; approved shareholder_viewer sees ONLY their own linked record
shareholderRoutes.get('/', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  if (req.user!.role === 'super_admin') {
    const approvedUsers = db
      .prepare(`SELECT id, full_name, email, role FROM profiles WHERE approval_status = 'approved' AND is_active = 1`)
      .all();
    res.json({ ...getShareholderOverviewData(), is_admin_view: true, approved_users: approvedUsers });
    return;
  }

  if (req.user!.role === 'shareholder_viewer') {
    const linked = db
      .prepare(`SELECT * FROM shareholders WHERE linked_user_id = ? AND can_view_own_portal = 1`)
      .get(req.user!.id) as { id: number; ownership_bps: number } | undefined;

    if (!linked) {
      res.status(403).json({ error: 'No linked shareholder portal access granted to your account.' });
      return;
    }

    const investments = db
      .prepare(`SELECT * FROM shareholder_investments WHERE shareholder_id = ? ORDER BY investment_date DESC`)
      .all(linked.id);
    const history = db
      .prepare(`SELECT * FROM ownership_history WHERE shareholder_id = ? ORDER BY id DESC`)
      .all(linked.id);
    const distItems = db
      .prepare(
        `SELECT pdi.*, pd.period_label, pd.period_start, pd.period_end, pd.created_at
         FROM profit_distribution_items pdi
         JOIN profit_distributions pd ON pd.id = pdi.distribution_id
         WHERE pdi.shareholder_id = ? ORDER BY pd.id DESC`
      )
      .all(linked.id);

    res.json({
      is_admin_view: false,
      own_shareholder: { ...linked, ownership_percent: bpsToPercent(linked.ownership_bps) },
      investments,
      ownership_history: history,
      own_distributions: distItems,
    });
    return;
  }

  res.status(403).json({ error: 'Shareholder management is exclusively controlled by the Main Admin.' });
});

// Main Admin updates their own baseline equity capital
shareholderRoutes.post('/admin-capital', requireAuth, requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const amount = roundMoney(Number(req.body?.amount || 0));
  const method = String(req.body?.payment_method || 'Bank Transfer');
  const date = String(req.body?.investment_date || new Date().toISOString().slice(0, 10));
  const description = String(req.body?.description || 'Main Admin Equity Contribution').trim();
  const recalculate = Boolean(req.body?.recalculate_ownership);

  if (amount <= 0) {
    res.status(400).json({ error: 'Capital amount must be greater than zero.' });
    return;
  }

  db.transaction(() => {
    const settings = db
      .prepare(`SELECT admin_equity_capital, admin_ownership_bps FROM business_settings WHERE id = 1`)
      .get() as { admin_equity_capital: number; admin_ownership_bps: number };
    const newCapital = roundMoney(settings.admin_equity_capital + amount);

    db.prepare(`UPDATE business_settings SET admin_equity_capital = ?, updated_at = datetime('now') WHERE id = 1`).run(
      newCapital
    );

    db.prepare(
      `INSERT INTO shareholder_investments (shareholder_id, shareholder_name, amount, investment_date, investment_type, payment_method, reference_number, description, authorized_by)
       VALUES (NULL, ?, ?, ?, 'equity_contribution', ?, ?, ?, ?)`
    ).run(req.user!.full_name, amount, date, method, String(req.body?.reference_number || ''), description, req.user!.id);

    if (recalculate) {
      const activeSh = db
        .prepare(`SELECT id, full_name, total_investment, ownership_bps FROM shareholders WHERE status = 'active'`)
        .all() as Array<{ id: number; full_name: string; total_investment: number; ownership_bps: number }>;

      const calc = calculateInvestmentOwnershipBps(
        newCapital,
        activeSh.map((s) => ({ id: s.id, name: s.full_name, equityCapital: s.total_investment })),
        req.user!.full_name
      );

      const adminRes = calc.find((c) => c.id === null)!;
      if (adminRes.ownershipBps !== settings.admin_ownership_bps) {
        db.prepare(`UPDATE business_settings SET admin_ownership_bps = ? WHERE id = 1`).run(adminRes.ownershipBps);
        db.prepare(
          `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          req.user!.full_name,
          settings.admin_ownership_bps,
          adminRes.ownershipBps,
          settings.admin_equity_capital,
          newCapital,
          date,
          'Main Admin capital contribution & investment-based recalculation',
          req.user!.id,
          req.user!.full_name
        );
      }

      for (const s of activeSh) {
        const match = calc.find((c) => c.id === s.id)!;
        if (match.ownershipBps !== s.ownership_bps) {
          db.prepare(`UPDATE shareholders SET ownership_bps = ? WHERE id = ?`).run(match.ownershipBps, s.id);
          db.prepare(
            `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            s.full_name,
            s.id,
            s.ownership_bps,
            match.ownershipBps,
            s.total_investment,
            s.total_investment,
            date,
            'Proportional adjustment after Main Admin capital contribution',
            req.user!.id,
            req.user!.full_name
          );
        }
      }
    }
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'ADMIN_EQUITY_ADDED',
    entityType: 'shareholder',
    newValues: { amount, recalculate },
  });

  res.json(getShareholderOverviewData());
});

// + ADD SHAREHOLDER (Method 1: Investment-Based OR Method 2: Manual Allocation)
shareholderRoutes.post('/', requireAuth, requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const b = req.body || {};
    const fullName = String(b.full_name || '').trim();
    const initialInvestment = Math.max(0, roundMoney(Number(b.initial_investment || 0)));
    const investmentDate = String(b.investment_date || new Date().toISOString().slice(0, 10));
    const allocationMethod = b.allocation_method === 'investment' ? 'investment' : 'manual';
    const manualPercent = Number(b.manual_ownership_percent ?? 0);
    const confirmOwnershipChange = Boolean(b.confirm_ownership_change);

    if (!fullName) {
      res.status(400).json({ error: 'Shareholder full name is required.' });
      return;
    }
    if (!confirmOwnershipChange) {
      res.status(400).json({ error: 'Explicit Main Admin confirmation is required to allocate ownership.' });
      return;
    }

    const newShareholderId = db.transaction(() => {
      const settings = db
        .prepare(`SELECT admin_ownership_bps, admin_equity_capital FROM business_settings WHERE id = 1`)
        .get() as { admin_ownership_bps: number; admin_equity_capital: number };

      const existingActive = db
        .prepare(`SELECT id, full_name, total_investment, ownership_bps FROM shareholders WHERE status = 'active'`)
        .all() as Array<{ id: number; full_name: string; total_investment: number; ownership_bps: number }>;

      const ins = db
        .prepare(
          `INSERT INTO shareholders (full_name, avatar_url, phone, email, address, total_investment, ownership_bps, linked_user_id, can_view_own_portal, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
        )
        .run(
          fullName,
          b.avatar_url || null,
          String(b.phone || '').trim(),
          String(b.email || '').trim(),
          String(b.address || '').trim(),
          initialInvestment,
          b.linked_user_id ? Number(b.linked_user_id) : null,
          b.can_view_own_portal ? 1 : 0,
          b.status === 'inactive' ? 'inactive' : 'active',
          String(b.notes || '').trim()
        );
      const shareholderId = Number(ins.lastInsertRowid);

      if (initialInvestment > 0) {
        db.prepare(
          `INSERT INTO shareholder_investments (shareholder_id, shareholder_name, amount, investment_date, investment_type, payment_method, reference_number, description, proof_url, authorized_by)
           VALUES (?, ?, ?, ?, 'equity_contribution', ?, ?, ?, ?, ?)`
        ).run(
          shareholderId,
          fullName,
          initialInvestment,
          investmentDate,
          String(b.payment_method || 'Bank Transfer'),
          String(b.reference_number || ''),
          String(b.investment_description || `Initial equity contribution by ${fullName}`),
          b.proof_url || null,
          req.user!.id
        );
      }

      if (allocationMethod === 'investment') {
        const calc = calculateInvestmentOwnershipBps(
          settings.admin_equity_capital,
          [
            ...existingActive.map((s) => ({ id: s.id, name: s.full_name, equityCapital: s.total_investment })),
            { id: shareholderId, name: fullName, equityCapital: initialInvestment },
          ],
          req.user!.full_name
        );

        const adminAlloc = calc.find((c) => c.id === null)!;
        db.prepare(`UPDATE business_settings SET admin_ownership_bps = ? WHERE id = 1`).run(adminAlloc.ownershipBps);
        if (adminAlloc.ownershipBps !== settings.admin_ownership_bps) {
          db.prepare(
            `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            req.user!.full_name,
            settings.admin_ownership_bps,
            adminAlloc.ownershipBps,
            settings.admin_equity_capital,
            settings.admin_equity_capital,
            investmentDate,
            `Investment-based allocation upon adding ${fullName}`,
            req.user!.id,
            req.user!.full_name
          );
        }

        for (const item of calc.filter((c) => c.id !== null)) {
          const prev = existingActive.find((e) => e.id === item.id);
          const prevBps = prev ? prev.ownership_bps : 0;
          const prevEq = prev ? prev.total_investment : 0;
          db.prepare(`UPDATE shareholders SET ownership_bps = ? WHERE id = ?`).run(item.ownershipBps, item.id);
          if (item.ownershipBps !== prevBps || item.id === shareholderId) {
            db.prepare(
              `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              item.name,
              item.id,
              prevBps,
              item.ownershipBps,
              prevEq,
              item.equityCapital,
              investmentDate,
              `Investment-based allocation (${bpsToPercent(item.ownershipBps).toFixed(2)}%)`,
              req.user!.id,
              req.user!.full_name
            );
          }
        }
      } else {
        // Method 2: Manual Ownership Allocation transferred from Main Admin
        const newBps = percentToBps(manualPercent);
        if (newBps < 0 || newBps > settings.admin_ownership_bps) {
          throw new Error(
            `Manual allocation (${manualPercent}%) exceeds Main Admin available ownership (${bpsToPercent(
              settings.admin_ownership_bps
            )}%).`
          );
        }
        const nextAdminBps = settings.admin_ownership_bps - newBps;
        db.prepare(`UPDATE business_settings SET admin_ownership_bps = ? WHERE id = 1`).run(nextAdminBps);
        db.prepare(`UPDATE shareholders SET ownership_bps = ? WHERE id = ?`).run(newBps, shareholderId);

        db.prepare(
          `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          req.user!.full_name,
          settings.admin_ownership_bps,
          nextAdminBps,
          settings.admin_equity_capital,
          settings.admin_equity_capital,
          investmentDate,
          `Manual ownership transfer of ${bpsToPercent(newBps).toFixed(2)}% to ${fullName}`,
          req.user!.id,
          req.user!.full_name
        );

        db.prepare(
          `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
           VALUES (?, ?, 0, ?, 0, ?, ?, ?, ?, ?)`
        ).run(
          fullName,
          shareholderId,
          newBps,
          initialInvestment,
          investmentDate,
          `Initial manual ownership allocation`,
          req.user!.id,
          req.user!.full_name
        );
      }

      return shareholderId;
    })();

    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: 'SHAREHOLDER_ADDED',
      entityType: 'shareholder',
      entityId: newShareholderId,
      newValues: { full_name: fullName, initial_investment: initialInvestment, allocation_method: allocationMethod },
    });

    await dispatchNotification({
      roles: ['super_admin'],
      category: 'shareholder',
      title: 'New Shareholder Added',
      message: `${fullName} was added as a shareholder with ৳${initialInvestment.toLocaleString()} initial investment.`,
      linkModule: 'shareholders',
    });

    res.status(201).json(getShareholderOverviewData());
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Failed to add shareholder.' });
  }
});

// Record additional investment, capital withdrawal, or loan/advance
shareholderRoutes.post('/:id/investments', requireAuth, requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const shareholderId = Number(req.params.id);
    const b = req.body || {};
    const amount = roundMoney(Number(b.amount || 0));
    const investmentType = String(b.investment_type || 'additional_capital') as
      | 'equity_contribution'
      | 'additional_capital'
      | 'capital_withdrawal'
      | 'loan_advance';
    const investmentDate = String(b.investment_date || new Date().toISOString().slice(0, 10));
    const recalculate = Boolean(b.recalculate_ownership);

    if (amount <= 0) {
      res.status(400).json({ error: 'Amount must be greater than zero.' });
      return;
    }

    const shareholder = db.prepare(`SELECT * FROM shareholders WHERE id = ?`).get(shareholderId) as
      | { id: number; full_name: string; total_investment: number; ownership_bps: number }
      | undefined;
    if (!shareholder) {
      res.status(404).json({ error: 'Shareholder not found.' });
      return;
    }

    db.transaction(() => {
      db.prepare(
        `INSERT INTO shareholder_investments (shareholder_id, shareholder_name, amount, investment_date, investment_type, payment_method, reference_number, description, proof_url, authorized_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        shareholderId,
        shareholder.full_name,
        amount,
        investmentDate,
        investmentType,
        String(b.payment_method || 'Bank Transfer'),
        String(b.reference_number || ''),
        String(b.description || '').trim(),
        b.proof_url || null,
        req.user!.id
      );

      // Note: loan_advance NEVER automatically becomes equity!
      if (investmentType === 'equity_contribution' || investmentType === 'additional_capital') {
        db.prepare(`UPDATE shareholders SET total_investment = total_investment + ? WHERE id = ?`).run(
          amount,
          shareholderId
        );
      } else if (investmentType === 'capital_withdrawal') {
        const nextInv = Math.max(0, roundMoney(shareholder.total_investment - amount));
        db.prepare(`UPDATE shareholders SET total_investment = ? WHERE id = ?`).run(nextInv, shareholderId);
      }

      if (recalculate && investmentType !== 'loan_advance') {
        const settings = db
          .prepare(`SELECT admin_equity_capital, admin_ownership_bps FROM business_settings WHERE id = 1`)
          .get() as { admin_equity_capital: number; admin_ownership_bps: number };
        const activeSh = db
          .prepare(`SELECT id, full_name, total_investment, ownership_bps FROM shareholders WHERE status = 'active'`)
          .all() as Array<{ id: number; full_name: string; total_investment: number; ownership_bps: number }>;

        const calc = calculateInvestmentOwnershipBps(
          settings.admin_equity_capital,
          activeSh.map((s) => ({ id: s.id, name: s.full_name, equityCapital: s.total_investment })),
          req.user!.full_name
        );

        const adminRes = calc.find((c) => c.id === null)!;
        if (adminRes.ownershipBps !== settings.admin_ownership_bps) {
          db.prepare(`UPDATE business_settings SET admin_ownership_bps = ? WHERE id = 1`).run(adminRes.ownershipBps);
          db.prepare(
            `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            req.user!.full_name,
            settings.admin_ownership_bps,
            adminRes.ownershipBps,
            settings.admin_equity_capital,
            settings.admin_equity_capital,
            investmentDate,
            `Ownership recalculated after ${shareholder.full_name} ${investmentType}`,
            req.user!.id,
            req.user!.full_name
          );
        }

        for (const s of activeSh) {
          const match = calc.find((c) => c.id === s.id)!;
          if (match.ownershipBps !== s.ownership_bps) {
            db.prepare(`UPDATE shareholders SET ownership_bps = ? WHERE id = ?`).run(match.ownershipBps, s.id);
            db.prepare(
              `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              s.full_name,
              s.id,
              s.ownership_bps,
              match.ownershipBps,
              s.total_investment,
              s.total_investment,
              investmentDate,
              `Ownership recalculated after ${investmentType}`,
              req.user!.id,
              req.user!.full_name
            );
          }
        }
      }
    })();

    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: 'SHAREHOLDER_INVESTMENT_RECORDED',
      entityType: 'shareholder',
      entityId: shareholderId,
      newValues: { amount, investmentType, recalculate },
    });

    await dispatchNotification({
      roles: ['super_admin'],
      category: 'shareholder',
      title: 'Shareholder Investment Recorded',
      message: `${shareholder.full_name}: ৳${amount.toLocaleString()} (${investmentType.replace(/_/g, ' ')}).`,
      linkModule: 'shareholders',
    });

    res.json(getShareholderOverviewData());
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Failed to record investment.' });
  }
});

// Explicit manual ownership reallocation (must sum to 100.00% = 10000 bps)
shareholderRoutes.post('/reallocate', requireAuth, requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
  const reason = String(req.body?.reason || 'Manual ownership transfer / reallocation').trim();
  const effectiveDate = String(req.body?.effective_date || new Date().toISOString().slice(0, 10));

  const bpsList = allocations.map((a: { id: number | null; percent: number }) => ({
    id: a.id,
    ownershipBps: percentToBps(Number(a.percent)),
  }));

  const check = validateManualOwnershipBps(bpsList);
  if (!check.valid) {
    res.status(400).json({ error: check.error });
    return;
  }

  db.transaction(() => {
    const settings = db
      .prepare(`SELECT admin_ownership_bps, admin_equity_capital FROM business_settings WHERE id = 1`)
      .get() as { admin_ownership_bps: number; admin_equity_capital: number };

    for (const item of bpsList) {
      if (item.id === null) {
        if (item.ownershipBps !== settings.admin_ownership_bps) {
          db.prepare(`UPDATE business_settings SET admin_ownership_bps = ? WHERE id = 1`).run(item.ownershipBps);
          db.prepare(
            `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            req.user!.full_name,
            settings.admin_ownership_bps,
            item.ownershipBps,
            settings.admin_equity_capital,
            settings.admin_equity_capital,
            effectiveDate,
            reason,
            req.user!.id,
            req.user!.full_name
          );
        }
      } else {
        const sh = db.prepare(`SELECT id, full_name, ownership_bps, total_investment FROM shareholders WHERE id = ?`).get(
          item.id
        ) as { id: number; full_name: string; ownership_bps: number; total_investment: number } | undefined;
        if (sh && sh.ownership_bps !== item.ownershipBps) {
          db.prepare(`UPDATE shareholders SET ownership_bps = ? WHERE id = ?`).run(item.ownershipBps, sh.id);
          db.prepare(
            `INSERT INTO ownership_history (entity_label, shareholder_id, previous_bps, new_bps, previous_equity, new_equity, effective_date, reason, authorized_by, authorized_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            sh.full_name,
            sh.id,
            sh.ownership_bps,
            item.ownershipBps,
            sh.total_investment,
            sh.total_investment,
            effectiveDate,
            reason,
            req.user!.id,
            req.user!.full_name
          );
        }
      }
    }
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'OWNERSHIP_REALLOCATED',
    entityType: 'shareholder',
    newValues: { reason, allocations: bpsList },
  });

  await dispatchNotification({
    roles: ['super_admin'],
    category: 'shareholder',
    title: 'Ownership Percentages Updated',
    message: `Active business ownership was reallocated (${reason}).`,
    linkModule: 'shareholders',
  });

  res.json(getShareholderOverviewData());
});

shareholderRoutes.put('/:id', requireAuth, requireSuperAdmin, (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.prepare(
    `UPDATE shareholders SET full_name = ?, phone = ?, email = ?, address = ?, linked_user_id = ?, can_view_own_portal = ?, status = ?, notes = ? WHERE id = ?`
  ).run(
    String(b.full_name || '').trim(),
    String(b.phone || '').trim(),
    String(b.email || '').trim(),
    String(b.address || '').trim(),
    b.linked_user_id ? Number(b.linked_user_id) : null,
    b.can_view_own_portal ? 1 : 0,
    b.status === 'inactive' ? 'inactive' : 'active',
    String(b.notes || '').trim(),
    id
  );
  res.json(getShareholderOverviewData());
});

// ================= PROFIT DISTRIBUTION =================

shareholderRoutes.post('/profit-distributions/preview', requireAuth, requireSuperAdmin, (req: AuthedRequest, res: Response) => {
  const periodStart = String(req.body?.period_start || '2000-01-01');
  const periodEnd = String(req.body?.period_end || new Date().toISOString().slice(0, 10));
  const amount = Math.max(0, roundMoney(Number(req.body?.distribution_amount || 0)));

  const settings = db
    .prepare(`SELECT admin_ownership_bps FROM business_settings WHERE id = 1`)
    .get() as { admin_ownership_bps: number };
  const activeSh = db
    .prepare(`SELECT id, full_name, ownership_bps FROM shareholders WHERE status = 'active' AND ownership_bps > 0`)
    .all() as Array<{ id: number; full_name: string; ownership_bps: number }>;

  const rev = (
    db
      .prepare(`SELECT COALESCE(SUM(grand_total), 0) as v FROM orders WHERE order_status != 'cancelled' AND date(created_at) BETWEEN ? AND ?`)
      .get(periodStart, periodEnd) as { v: number }
  ).v;
  const cogs = (
    db
      .prepare(`SELECT COALESCE(SUM(oi.cost_price * oi.quantity), 0) as v FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.order_status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?`)
      .get(periodStart, periodEnd) as { v: number }
  ).v;
  const exp = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE date(expense_date) BETWEEN ? AND ?`).get(periodStart, periodEnd) as {
      v: number;
    }
  ).v;
  const distributableProfit = roundMoney(rev - cogs - exp);

  const allocations = calculateProfitDistribution(amount, [
    { shareholderId: null, recipientName: req.user!.full_name, ownershipBps: settings.admin_ownership_bps },
    ...activeSh.map((s) => ({ shareholderId: s.id, recipientName: s.full_name, ownershipBps: s.ownership_bps })),
  ]);

  res.json({
    period_start: periodStart,
    period_end: periodEnd,
    accounting_profit: distributableProfit,
    distribution_amount: amount,
    allocations,
  });
});

shareholderRoutes.post('/profit-distributions', requireAuth, requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const b = req.body || {};
  const periodLabel = String(b.period_label || 'Profit Distribution').trim();
  const periodStart = String(b.period_start || '2000-01-01');
  const periodEnd = String(b.period_end || new Date().toISOString().slice(0, 10));
  const distributionAmount = Math.max(0, roundMoney(Number(b.distribution_amount || 0)));
  const distributableProfit = roundMoney(Number(b.accounting_profit || distributionAmount));

  if (distributionAmount <= 0) {
    res.status(400).json({ error: 'Distribution amount must be greater than zero.' });
    return;
  }

  const settings = db
    .prepare(`SELECT admin_ownership_bps FROM business_settings WHERE id = 1`)
    .get() as { admin_ownership_bps: number };
  const activeSh = db
    .prepare(`SELECT id, full_name, ownership_bps FROM shareholders WHERE status = 'active' AND ownership_bps > 0`)
    .all() as Array<{ id: number; full_name: string; ownership_bps: number }>;

  const allocations = calculateProfitDistribution(distributionAmount, [
    { shareholderId: null, recipientName: req.user!.full_name, ownershipBps: settings.admin_ownership_bps },
    ...activeSh.map((s) => ({ shareholderId: s.id, recipientName: s.full_name, ownershipBps: s.ownership_bps })),
  ]);

  const distId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO profit_distributions (period_label, period_start, period_end, distributable_profit, distributed_amount, status, notes, authorized_by, authorized_by_name)
         VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?)`
      )
      .run(
        periodLabel,
        periodStart,
        periodEnd,
        distributableProfit,
        distributionAmount,
        String(b.notes || '').trim(),
        req.user!.id,
        req.user!.full_name
      );
    const id = Number(info.lastInsertRowid);
    const insItem = db.prepare(
      `INSERT INTO profit_distribution_items (distribution_id, shareholder_id, recipient_name, ownership_bps, allocated_amount)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const a of allocations) {
      insItem.run(id, a.shareholderId, a.recipientName, a.ownershipBps, a.allocatedAmount);
    }
    return id;
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'PROFIT_DISTRIBUTION_APPROVED',
    entityType: 'profit_distribution',
    entityId: distId,
    newValues: { periodLabel, distributionAmount },
  });

  await dispatchNotification({
    roles: ['super_admin', 'shareholder_viewer'],
    category: 'shareholder',
    title: 'Profit Distribution Approved',
    message: `${periodLabel}: ৳${distributionAmount.toLocaleString()} allocated across approved ownership shares.`,
    linkModule: 'shareholders',
  });

  res.status(201).json(getShareholderOverviewData());
});
