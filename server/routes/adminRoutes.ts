import { Router, type Response } from 'express';
import * as webpush from 'web-push';
import { db, getVapidKeys } from '../db.ts';
import {
  ALL_MODULES,
  ROLE_DEFAULT_MODULES,
  buildUserProfile,
  dispatchNotification,
  logAudit,
  logSecurityEvent,
  requireApproved,
  requireAuth,
  requireModule,
  requireSuperAdmin,
  type AuthedRequest,
} from '../auth.ts';
import type { ModuleKey, UserRole } from '../../src/shared/types.ts';

export const adminRoutes = Router();

// ================= USER MANAGEMENT =================

adminRoutes.get('/users', requireAuth, requireApproved, requireModule('users'), (_req: AuthedRequest, res: Response) => {
  const rows = db.prepare(`SELECT id FROM profiles ORDER BY created_at ASC`).all() as Array<{ id: number }>;
  const users = rows.map((r) => buildUserProfile(r.id)).filter(Boolean);
  res.json({ users });
});

adminRoutes.post('/users/:id/approve', requireAuth, requireApproved, requireModule('users'), async (req: AuthedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  const role = (req.body?.role as UserRole) || 'sales_staff';

  if (role === 'super_admin' && req.user!.role !== 'super_admin') {
    res.status(403).json({ error: 'Only Main Admin can assign super_admin role.' });
    return;
  }

  const target = db.prepare(`SELECT id, full_name, email, approval_status FROM profiles WHERE id = ?`).get(targetId) as
    | { id: number; full_name: string; email: string; approval_status: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`UPDATE profiles SET approval_status = 'approved', is_active = 1, role = ?, updated_at = datetime('now') WHERE id = ?`).run(
      role,
      targetId
    );
    db.prepare(`DELETE FROM user_permissions WHERE user_id = ?`).run(targetId);
    const defaults = ROLE_DEFAULT_MODULES[role] || ['profile', 'notifications'];
    const insertPerm = db.prepare(`INSERT INTO user_permissions (user_id, module_key, allowed) VALUES (?, ?, ?)`);
    for (const mod of ALL_MODULES) {
      insertPerm.run(targetId, mod, defaults.includes(mod) ? 1 : 0);
    }
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'USER_APPROVED',
    entityType: 'profile',
    entityId: targetId,
    previousValues: { approval_status: target.approval_status },
    newValues: { approval_status: 'approved', role },
  });

  await dispatchNotification({
    userIds: [targetId],
    category: 'account',
    title: 'Account Approved',
    message: 'Your XCLUFY account has been approved. You can now access permitted modules and enroll biometric login.',
    linkModule: 'profile',
  });

  res.json({ user: buildUserProfile(targetId) });
});

adminRoutes.post('/users/:id/status', requireAuth, requireApproved, requireModule('users'), async (req: AuthedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  const status = String(req.body?.status || '') as 'rejected' | 'suspended' | 'approved';

  if (!['rejected', 'suspended', 'approved'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  if (targetId === req.user!.id) {
    res.status(400).json({ error: 'You cannot reject or suspend your own active admin account.' });
    return;
  }

  const target = db.prepare(`SELECT id, full_name, role, approval_status FROM profiles WHERE id = ?`).get(targetId) as
    | { id: number; full_name: string; role: string; approval_status: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (target.role === 'super_admin') {
    res.status(403).json({ error: 'Main Admin status cannot be suspended here.' });
    return;
  }

  const isActive = status === 'approved' ? 1 : 0;
  db.transaction(() => {
    db.prepare(`UPDATE profiles SET approval_status = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(
      status,
      isActive,
      targetId
    );
    if (status !== 'approved') {
      db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(targetId);
    }
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: `USER_${status.toUpperCase()}`,
    entityType: 'profile',
    entityId: targetId,
    previousValues: { approval_status: target.approval_status },
    newValues: { approval_status: status },
  });

  await dispatchNotification({
    userIds: [targetId],
    category: 'account',
    title: `Account ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: `Your XCLUFY account status was updated to ${status}.`,
  });

  res.json({ user: buildUserProfile(targetId) });
});

adminRoutes.put('/users/:id/permissions', requireAuth, requireApproved, requireModule('users'), async (req: AuthedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  const role = req.body?.role as UserRole | undefined;
  const permissions = req.body?.permissions as ModuleKey[] | undefined;

  const target = db.prepare(`SELECT id, role FROM profiles WHERE id = ?`).get(targetId) as
    | { id: number; role: UserRole }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (target.role === 'super_admin' && req.user!.id !== targetId) {
    res.status(403).json({ error: 'Cannot alter Main Admin permissions.' });
    return;
  }

  if (role === 'super_admin' && req.user!.role !== 'super_admin') {
    res.status(403).json({ error: 'Only Main Admin can assign super_admin role.' });
    return;
  }

  db.transaction(() => {
    if (role && target.role !== 'super_admin') {
      db.prepare(`UPDATE profiles SET role = ?, updated_at = datetime('now') WHERE id = ?`).run(role, targetId);
    }
    if (Array.isArray(permissions) && target.role !== 'super_admin') {
      const allowedSet = new Set<string>([...permissions, 'profile', 'notifications']);
      db.prepare(`DELETE FROM user_permissions WHERE user_id = ?`).run(targetId);
      const stmt = db.prepare(`INSERT INTO user_permissions (user_id, module_key, allowed) VALUES (?, ?, ?)`);
      for (const mod of ALL_MODULES) {
        // Shareholders module stays restricted to super_admin unless shareholder_viewer
        const permitted = mod === 'shareholders' && role !== 'shareholder_viewer' ? 0 : allowedSet.has(mod) ? 1 : 0;
        stmt.run(targetId, mod, permitted);
      }
    }
  })();

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'USER_PERMISSIONS_UPDATED',
    entityType: 'profile',
    entityId: targetId,
    newValues: { role, permissions },
  });

  await dispatchNotification({
    userIds: [targetId],
    category: 'admin',
    title: 'Permissions Updated',
    message: 'Your role or module permissions on XCLUFY were updated by an administrator.',
    linkModule: 'profile',
  });

  res.json({ user: buildUserProfile(targetId) });
});

adminRoutes.post('/users/:id/revoke-sessions', requireAuth, requireApproved, requireModule('users'), (req: AuthedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(targetId);
  logSecurityEvent({
    userId: req.user!.id,
    eventType: 'SESSIONS_REVOKED',
    req,
    details: `Revoked all active sessions for user #${targetId}`,
  });
  res.json({ ok: true });
});

// ================= ACTIVITY LOGS & SECURITY EVENTS =================

adminRoutes.get('/activity-logs', requireAuth, requireApproved, requireModule('activity_logs'), (req: AuthedRequest, res: Response) => {
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
  const entityType = req.query.entity_type ? String(req.query.entity_type) : '';
  const search = req.query.search ? String(req.query.search).trim() : '';

  let sql = `SELECT a.*, p.avatar_url as user_avatar FROM audit_logs a LEFT JOIN profiles p ON p.id = a.user_id WHERE 1=1`;
  const params: unknown[] = [];

  if (entityType) {
    sql += ` AND a.entity_type = ?`;
    params.push(entityType);
  }
  if (search) {
    sql += ` AND (a.action LIKE ? OR a.user_name LIKE ? OR a.entity_id LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY a.id DESC LIMIT ?`;
  params.push(limit);

  const logs = db.prepare(sql).all(...params);
  const securityEvents = db
    .prepare(`SELECT s.*, p.full_name as user_name FROM security_events s LEFT JOIN profiles p ON p.id = s.user_id ORDER BY s.id DESC LIMIT 50`)
    .all();

  res.json({ logs, security_events: securityEvents });
});

// ================= BUSINESS SETTINGS =================

adminRoutes.get('/settings', requireAuth, requireApproved, (_req: AuthedRequest, res: Response) => {
  const settings = db.prepare(`SELECT * FROM business_settings WHERE id = 1`).get();
  res.json({ settings });
});

adminRoutes.put('/settings', requireAuth, requireApproved, requireModule('settings'), (req: AuthedRequest, res: Response) => {
  const current = db.prepare(`SELECT * FROM business_settings WHERE id = 1`).get() as Record<string, unknown>;
  const {
    business_name,
    tagline,
    logo_url,
    address,
    phone,
    email,
    opening_balance,
    default_delivery_charge,
    low_stock_threshold,
    receipt_header,
    receipt_footer,
  } = req.body || {};

  db.prepare(
    `UPDATE business_settings SET
      business_name = ?,
      tagline = ?,
      logo_url = ?,
      address = ?,
      phone = ?,
      email = ?,
      opening_balance = ?,
      default_delivery_charge = ?,
      low_stock_threshold = ?,
      receipt_header = ?,
      receipt_footer = ?,
      updated_at = datetime('now')
     WHERE id = 1`
  ).run(
    String(business_name ?? current.business_name).trim() || 'XCLUFY',
    String(tagline ?? current.tagline).trim(),
    logo_url !== undefined ? logo_url : current.logo_url,
    String(address ?? current.address).trim(),
    String(phone ?? current.phone).trim(),
    String(email ?? current.email).trim(),
    Number.isFinite(Number(opening_balance)) ? Number(opening_balance) : current.opening_balance,
    Number.isFinite(Number(default_delivery_charge)) ? Math.max(0, Number(default_delivery_charge)) : current.default_delivery_charge,
    Number.isFinite(Number(low_stock_threshold)) ? Math.max(0, Math.floor(Number(low_stock_threshold))) : current.low_stock_threshold,
    String(receipt_header ?? current.receipt_header).trim(),
    String(receipt_footer ?? current.receipt_footer).trim()
  );

  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'SETTINGS_UPDATED',
    entityType: 'business_settings',
    entityId: 1,
    previousValues: current,
    newValues: req.body,
  });

  res.json({ settings: db.prepare(`SELECT * FROM business_settings WHERE id = 1`).get() });
});

// ================= NOTIFICATIONS & REAL WEB PUSH =================

adminRoutes.get('/notifications', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const notifications = db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100`)
    .all(req.user!.id);
  const unreadRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`)
    .get(req.user!.id) as { cnt: number };
  const subscriptionCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM push_subscriptions WHERE user_id = ?`).get(req.user!.id) as { cnt: number }
  ).cnt;

  res.json({
    notifications,
    unread_count: unreadRow.cnt,
    push_subscription_count: subscriptionCount,
  });
});

adminRoutes.post('/notifications/:id/read', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
    Number(req.params.id),
    req.user!.id
  );
  res.json({ ok: true });
});

adminRoutes.post('/notifications/read-all', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user!.id);
  res.json({ ok: true });
});

adminRoutes.get('/push/vapid-key', requireAuth, requireApproved, (_req: AuthedRequest, res: Response) => {
  const { publicKey } = getVapidKeys();
  res.json({ publicKey });
});

adminRoutes.post('/push/subscribe', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const sub = req.body?.subscription;
  const deviceLabel = String(req.body?.device_label || 'Mobile / Desktop Browser').slice(0, 80);

  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    res.status(400).json({ error: 'Valid Web Push subscription object is required.' });
    return;
  }

  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device_label)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device_label = excluded.device_label`
  ).run(req.user!.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, deviceLabel);

  res.json({ ok: true });
});

adminRoutes.delete('/push/subscribe', requireAuth, requireApproved, (req: AuthedRequest, res: Response) => {
  const endpoint = String(req.body?.endpoint || '');
  if (endpoint) {
    db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`).run(endpoint, req.user!.id);
  } else {
    db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ?`).run(req.user!.id);
  }
  res.json({ ok: true });
});

adminRoutes.post('/push/test', requireAuth, requireApproved, async (req: AuthedRequest, res: Response) => {
  const subs = db
    .prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`)
    .all(req.user!.id) as Array<{ id: number; endpoint: string; p256dh: string; auth: string }>;

  if (subs.length === 0) {
    res.status(400).json({
      error: 'No active push subscription registered for your device. Enable Push Notifications first.',
      sent: 0,
      failed: 0,
    });
    return;
  }

  const { publicKey, privateKey } = getVapidKeys();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@xclufy.com', publicKey, privateKey);

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: 'XCLUFY Push Test',
            body: 'Real-time mobile push delivery is active for your account.',
            linkModule: 'notifications',
            timestamp: Date.now(),
          })
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const msg = (err as Error).message || 'Push delivery failed';
        errors.push(msg);
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
        }
      }
    })
  );

  if (sent === 0) {
    res.status(502).json({
      error: `Push delivery failed: ${errors[0] || 'Push service rejected subscription'}`,
      sent,
      failed,
    });
    return;
  }

  res.json({ ok: true, sent, failed });
});

// Helper used by super_admin check if needed
adminRoutes.get('/system-status', requireAuth, requireSuperAdmin, (_req: AuthedRequest, res: Response) => {
  const counts = {
    users: (db.prepare(`SELECT COUNT(*) as c FROM profiles`).get() as { c: number }).c,
    products: (db.prepare(`SELECT COUNT(*) as c FROM products`).get() as { c: number }).c,
    orders: (db.prepare(`SELECT COUNT(*) as c FROM orders`).get() as { c: number }).c,
  };
  res.json({ counts });
});
