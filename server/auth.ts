import crypto from 'crypto';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import * as webpush from 'web-push';
import { db, getVapidKeys } from './db.ts';
import type { ModuleKey, NotificationPrefs, UserProfile, UserRole } from '../src/shared/types.ts';

export const ALL_MODULES: ModuleKey[] = [
  'dashboard',
  'products',
  'categories',
  'inventory',
  'pos',
  'orders',
  'customers',
  'preorders',
  'waitlist',
  'shareholders',
  'suppliers',
  'income',
  'expenses',
  'transactions',
  'reports',
  'barcodes',
  'import_export',
  'notifications',
  'users',
  'activity_logs',
  'settings',
  'profile',
];

export const ROLE_DEFAULT_MODULES: Record<UserRole, ModuleKey[]> = {
  super_admin: [...ALL_MODULES],
  admin: ALL_MODULES.filter((m) => m !== 'shareholders'),
  manager: [
    'dashboard',
    'products',
    'categories',
    'inventory',
    'pos',
    'orders',
    'customers',
    'preorders',
    'waitlist',
    'suppliers',
    'income',
    'expenses',
    'transactions',
    'reports',
    'barcodes',
    'import_export',
    'notifications',
    'activity_logs',
    'profile',
  ],
  sales_staff: [
    'dashboard',
    'products',
    'categories',
    'pos',
    'orders',
    'customers',
    'preorders',
    'waitlist',
    'barcodes',
    'notifications',
    'profile',
  ],
  inventory_manager: [
    'dashboard',
    'products',
    'categories',
    'inventory',
    'suppliers',
    'preorders',
    'waitlist',
    'barcodes',
    'import_export',
    'notifications',
    'profile',
  ],
  accountant: [
    'dashboard',
    'orders',
    'customers',
    'suppliers',
    'income',
    'expenses',
    'transactions',
    'reports',
    'notifications',
    'profile',
  ],
  shareholder_viewer: ['shareholders', 'notifications', 'profile'],
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function getUserPermissions(userId: number, role: UserRole): ModuleKey[] {
  if (role === 'super_admin') return [...ALL_MODULES];
  const rows = db
    .prepare(`SELECT module_key, allowed FROM user_permissions WHERE user_id = ?`)
    .all(userId) as Array<{ module_key: string; allowed: number }>;

  if (rows.length === 0) {
    return ROLE_DEFAULT_MODULES[role] || ['profile', 'notifications'];
  }
  const map = new Map<string, boolean>();
  for (const mod of ROLE_DEFAULT_MODULES[role] || []) {
    map.set(mod, true);
  }
  for (const row of rows) {
    map.set(row.module_key, row.allowed === 1);
  }
  map.set('profile', true);
  map.set('notifications', true);
  return Array.from(map.entries())
    .filter(([, allowed]) => allowed)
    .map(([key]) => key as ModuleKey);
}

export function getNotificationPrefs(userId: number): NotificationPrefs {
  const row = db
    .prepare(`SELECT * FROM notification_preferences WHERE user_id = ?`)
    .get(userId) as
    | {
        in_app_enabled: number;
        push_enabled: number;
        account_events: number;
        business_events: number;
        shareholder_events: number;
        admin_events: number;
      }
    | undefined;

  if (!row) {
    return {
      in_app_enabled: true,
      push_enabled: true,
      account_events: true,
      business_events: true,
      shareholder_events: true,
      admin_events: true,
    };
  }
  return {
    in_app_enabled: row.in_app_enabled === 1,
    push_enabled: row.push_enabled === 1,
    account_events: row.account_events === 1,
    business_events: row.business_events === 1,
    shareholder_events: row.shareholder_events === 1,
    admin_events: row.admin_events === 1,
  };
}

export function buildUserProfile(userId: number): UserProfile | null {
  const row = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(userId) as
    | {
        id: number;
        full_name: string;
        email: string;
        phone: string;
        avatar_url: string | null;
        role: UserRole;
        approval_status: UserProfile['approval_status'];
        email_verified: number;
        is_active: number;
        last_login_at: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return null;

  const passkeys = db
    .prepare(`SELECT COUNT(*) as cnt FROM webauthn_credentials WHERE user_id = ?`)
    .get(userId) as { cnt: number };

  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    role: row.role,
    approval_status: row.approval_status,
    email_verified: row.email_verified,
    is_active: row.is_active,
    biometric_enabled: passkeys.cnt > 0,
    passkey_count: passkeys.cnt,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    permissions: getUserPermissions(row.id, row.role),
    notification_prefs: getNotificationPrefs(row.id),
  };
}

export function createSession(
  userId: number,
  req: Request,
  res: Response
): { token: string; sessionId: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 250);
  const ip = String(req.ip || req.socket.remoteAddress || '').slice(0, 64);

  db.prepare(
    `INSERT INTO user_sessions (id, user_id, token_hash, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, userId, tokenHash, userAgent, ip, expiresAt);

  db.prepare(`UPDATE profiles SET last_login_at = datetime('now') WHERE id = ?`).run(userId);

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    ...(isHttps ? { partitioned: true } : {}),
  };
  res.cookie('xclufy_session', token, cookieOptions);

  return { token, sessionId };
}

export function parseCookieToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === 'xclufy_session') {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export interface AuthedRequest extends Request {
  user?: UserProfile;
  sessionId?: string;
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return parseCookieToken(req);
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractAuthToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const session = db
    .prepare(
      `SELECT id, user_id, expires_at FROM user_sessions WHERE token_hash = ? AND expires_at > datetime('now')`
    )
    .get(sha256(token)) as { id: string; user_id: number; expires_at: string } | undefined;

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const profile = buildUserProfile(session.user_id);
  if (!profile || profile.is_active !== 1) {
    res.status(403).json({ error: 'Account is inactive or suspended' });
    return;
  }

  req.user = profile;
  req.sessionId = session.id;
  next();
}

export function requireApproved(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.approval_status !== 'approved') {
    res.status(403).json({
      error: `Account status is ${req.user.approval_status}. Administrator approval required.`,
      approval_status: req.user.approval_status,
    });
    return;
  }
  next();
}

export function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.approval_status !== 'approved' || req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Main Admin authorization required' });
    return;
  }
  next();
}

export function requireModule(moduleKey: ModuleKey) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.approval_status !== 'approved') {
      res.status(403).json({ error: 'Approved account required' });
      return;
    }
    if (req.user.role === 'super_admin' || req.user.permissions.includes(moduleKey)) {
      next();
      return;
    }
    res.status(403).json({ error: `Access denied for module: ${moduleKey}` });
  };
}

export function logAudit(params: {
  userId?: number | null;
  userName?: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  previousValues?: unknown;
  newValues?: unknown;
}): void {
  db.prepare(
    `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, previous_values, new_values)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.userId ?? null,
    params.userName || 'System',
    params.action,
    params.entityType,
    String(params.entityId ?? ''),
    params.previousValues !== undefined ? JSON.stringify(params.previousValues) : null,
    params.newValues !== undefined ? JSON.stringify(params.newValues) : null
  );
}

export function logSecurityEvent(params: {
  userId?: number | null;
  eventType: string;
  req?: Request;
  details: string;
}): void {
  const ip = params.req ? String(params.req.ip || params.req.socket.remoteAddress || '').slice(0, 64) : '';
  const ua = params.req ? String(params.req.headers['user-agent'] || '').slice(0, 250) : '';
  db.prepare(
    `INSERT INTO security_events (user_id, event_type, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?)`
  ).run(params.userId ?? null, params.eventType, ip, ua, params.details);
}

export async function dispatchNotification(params: {
  userIds?: number[];
  roles?: UserRole[];
  category: 'account' | 'business' | 'shareholder' | 'admin';
  title: string;
  message: string;
  linkModule?: string;
}): Promise<{ created: number; pushSent: number; pushFailed: number }> {
  let targetIds: number[] = [];
  if (params.userIds && params.userIds.length > 0) {
    targetIds = params.userIds;
  } else if (params.roles && params.roles.length > 0) {
    const placeholders = params.roles.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT id FROM profiles WHERE approval_status = 'approved' AND is_active = 1 AND role IN (${placeholders})`
      )
      .all(...params.roles) as Array<{ id: number }>;
    targetIds = rows.map((r) => r.id);
  } else {
    const rows = db
      .prepare(`SELECT id FROM profiles WHERE approval_status = 'approved' AND is_active = 1`)
      .all() as Array<{ id: number }>;
    targetIds = rows.map((r) => r.id);
  }

  const prefColumn =
    params.category === 'account'
      ? 'account_events'
      : params.category === 'shareholder'
        ? 'shareholder_events'
        : params.category === 'admin'
          ? 'admin_events'
          : 'business_events';

  let created = 0;
  const pushUserIds: number[] = [];

  for (const uid of new Set(targetIds)) {
    const prefs = getNotificationPrefs(uid);
    const categoryAllowed = prefs[prefColumn];
    if (!categoryAllowed) continue;

    if (prefs.in_app_enabled) {
      db.prepare(
        `INSERT INTO notifications (user_id, category, title, message, link_module) VALUES (?, ?, ?, ?, ?)`
      ).run(uid, params.category, params.title, params.message, params.linkModule || null);
      created += 1;
    }
    if (prefs.push_enabled) {
      pushUserIds.push(uid);
    }
  }

  let pushSent = 0;
  let pushFailed = 0;

  if (pushUserIds.length > 0) {
    const { publicKey, privateKey } = getVapidKeys();
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@xclufy.com';
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const placeholders = pushUserIds.map(() => '?').join(',');
    const subs = db
      .prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`)
      .all(...pushUserIds) as Array<{ id: number; endpoint: string; p256dh: string; auth: string }>;

    const payload = JSON.stringify({
      title: params.title,
      body: params.message,
      category: params.category,
      linkModule: params.linkModule || 'notifications',
      timestamp: Date.now(),
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          pushSent += 1;
        } catch (err: unknown) {
          pushFailed += 1;
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
          }
        }
      })
    );
  }

  return { created, pushSent, pushFailed };
}
