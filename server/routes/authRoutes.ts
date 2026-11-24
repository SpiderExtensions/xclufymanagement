import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { db } from '../db.ts';
import {
  buildUserProfile,
  createSession,
  dispatchNotification,
  extractAuthToken,
  hashPassword,
  logAudit,
  logSecurityEvent,
  requireApproved,
  requireAuth,
  sha256,
  verifyPassword,
  type AuthedRequest,
} from '../auth.ts';

export const authRoutes = Router();

function getRpConfig(req: Request): { rpID: string; expectedOrigins: string[] } {
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
  const rpID = hostHeader.split(':')[0];
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const originHeader = req.headers.origin ? String(req.headers.origin) : null;
  const expectedOrigins = Array.from(
    new Set([
      `${proto}://${hostHeader}`,
      `https://${hostHeader}`,
      `http://${hostHeader}`,
      ...(originHeader ? [originHeader] : []),
      ...(process.env.APP_URL ? [process.env.APP_URL.replace(/\/$/, '')] : []),
    ])
  );
  return { rpID, expectedOrigins };
}

function validateAvatarDataUrl(avatar: unknown): string | null {
  if (avatar === null || avatar === '') return null;
  if (typeof avatar !== 'string') return null;
  if (
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) &&
    avatar.length <= 2_000_000
  ) {
    return avatar;
  }
  throw new Error('Invalid avatar image format or file exceeds 1.5MB limit.');
}

// Atomic registration: first user becomes super_admin + approved; every subsequent user becomes pending
authRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirm_password || '');
    const avatarUrl = validateAvatarDataUrl(req.body?.avatar_url ?? null);

    if (!fullName || fullName.length < 2) {
      res.status(400).json({ error: 'Full name is required (at least 2 characters).' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    const existing = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = hashPassword(password);
    const verifyToken = crypto.randomBytes(24).toString('hex');

    const registerTx = db.transaction(() => {
      const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM profiles`).get() as { cnt: number };
      const isFirstUser = countRow.cnt === 0;
      const role = isFirstUser ? 'super_admin' : 'sales_staff';
      const approvalStatus = isFirstUser ? 'approved' : 'pending';
      const emailVerified = isFirstUser ? 1 : 0;

      const result = db
        .prepare(
          `INSERT INTO profiles (full_name, email, phone, password_hash, avatar_url, role, approval_status, email_verified, email_verify_token)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(fullName, email, phone, passwordHash, avatarUrl, role, approvalStatus, emailVerified, verifyToken);

      const userId = Number(result.lastInsertRowid);
      db.prepare(`INSERT OR IGNORE INTO notification_preferences (user_id) VALUES (?)`).run(userId);

      return { userId, isFirstUser, role, approvalStatus };
    });

    const created = registerTx();
    const { token } = createSession(created.userId, req, res);
    const profile = buildUserProfile(created.userId);

    logAudit({
      userId: created.userId,
      userName: fullName,
      action: created.isFirstUser ? 'FIRST_MAIN_ADMIN_REGISTERED' : 'USER_REGISTERED',
      entityType: 'profile',
      entityId: created.userId,
      newValues: { email, role: created.role, approval_status: created.approvalStatus },
    });

    if (!created.isFirstUser) {
      await dispatchNotification({
        roles: ['super_admin', 'admin'],
        category: 'account',
        title: 'New User Registration Pending',
        message: `${fullName} (${email}) registered and is awaiting approval.`,
        linkModule: 'users',
      });
    }

    res.status(201).json({
      token,
      user: profile,
      is_first_admin: created.isFirstUser,
      verification_token: created.isFirstUser ? null : verifyToken,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Registration failed' });
  }
});

authRoutes.post('/login', (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db.prepare(`SELECT * FROM profiles WHERE email = ?`).get(email) as
    | {
        id: number;
        full_name: string;
        password_hash: string;
        is_active: number;
        approval_status: string;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    logSecurityEvent({
      userId: user?.id ?? null,
      eventType: 'LOGIN_FAILED',
      req,
      details: `Failed login attempt for ${email}`,
    });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.is_active !== 1 || user.approval_status === 'suspended') {
    res.status(403).json({ error: 'Your account has been suspended. Contact the Main Admin.' });
    return;
  }

  if (user.approval_status === 'rejected') {
    res.status(403).json({ error: 'Your registration request was declined by the administrator.' });
    return;
  }

  const { token } = createSession(user.id, req, res);
  const profile = buildUserProfile(user.id);

  logSecurityEvent({
    userId: user.id,
    eventType: 'LOGIN_SUCCESS',
    req,
    details: 'Password login succeeded',
  });

  res.json({ token, user: profile });
});

authRoutes.post('/logout', requireAuth, (req: AuthedRequest, res: Response) => {
  const token = extractAuthToken(req);
  if (token) {
    db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`).run(sha256(token));
  }
  res.clearCookie('xclufy_session', { path: '/' });
  res.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (req: AuthedRequest, res: Response) => {
  res.json({ user: req.user });
});

authRoutes.get('/session', (req: Request, res: Response) => {
  const token = extractAuthToken(req);
  if (!token) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const session = db
    .prepare(`SELECT user_id, expires_at FROM user_sessions WHERE token_hash = ?`)
    .get(sha256(token)) as { user_id: number; expires_at: string } | undefined;
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const user = buildUserProfile(session.user_id);
  if (!user || user.is_active !== 1) {
    res.json({ authenticated: false, user: null });
    return;
  }
  res.json({ authenticated: true, user });
});

authRoutes.post('/verify-email', requireAuth, (req: AuthedRequest, res: Response) => {
  const token = String(req.body?.token || '').trim();
  const row = db
    .prepare(`SELECT email_verify_token FROM profiles WHERE id = ?`)
    .get(req.user!.id) as { email_verify_token: string | null } | undefined;

  if (!row || !row.email_verify_token || row.email_verify_token !== token) {
    res.status(400).json({ error: 'Invalid verification token.' });
    return;
  }
  db.prepare(`UPDATE profiles SET email_verified = 1, email_verify_token = NULL WHERE id = ?`).run(req.user!.id);
  res.json({ user: buildUserProfile(req.user!.id) });
});

authRoutes.post('/request-reset', (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = db.prepare(`SELECT id, full_name FROM profiles WHERE email = ?`).get(email) as
    | { id: number; full_name: string }
    | undefined;

  if (!user) {
    res.json({ ok: true, message: 'If an account matches this email, a reset token has been issued.' });
    return;
  }

  const rawToken = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`).run(
    user.id,
    sha256(rawToken),
    expiresAt
  );

  logSecurityEvent({ userId: user.id, eventType: 'PASSWORD_RESET_REQUESTED', req, details: `Reset requested for ${email}` });

  // Return reset token directly for internal administrator/self-service workflow since no external SMTP server is configured
  res.json({
    ok: true,
    message: 'Password reset token generated. Enter this token below to set a new password.',
    reset_token: rawToken,
  });
});

authRoutes.post('/reset-password', (req: Request, res: Response) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.new_password || '');
  if (!token || newPassword.length < 8) {
    res.status(400).json({ error: 'Valid reset token and password (min 8 chars) are required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')`
    )
    .get(sha256(token)) as { id: number; user_id: number } | undefined;

  if (!row) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  const hash = hashPassword(newPassword);
  db.transaction(() => {
    db.prepare(`UPDATE profiles SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      hash,
      row.user_id
    );
    db.prepare(`UPDATE password_reset_tokens SET used = 1 WHERE id = ?`).run(row.id);
    db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(row.user_id);
  })();

  logSecurityEvent({ userId: row.user_id, eventType: 'PASSWORD_RESET_COMPLETED', req, details: 'Password reset via token' });
  res.json({ ok: true });
});

authRoutes.put('/profile', requireAuth, (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fullName = req.body?.full_name !== undefined ? String(req.body.full_name).trim() : req.user!.full_name;
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : req.user!.phone;
    const avatarUrl =
      req.body?.avatar_url !== undefined ? validateAvatarDataUrl(req.body.avatar_url) : req.user!.avatar_url;

    if (!fullName || fullName.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }

    db.prepare(
      `UPDATE profiles SET full_name = ?, phone = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(fullName, phone, avatarUrl, userId);

    if (req.body?.notification_prefs) {
      const p = req.body.notification_prefs;
      db.prepare(
        `INSERT INTO notification_preferences (user_id, in_app_enabled, push_enabled, account_events, business_events, shareholder_events, admin_events)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           in_app_enabled = excluded.in_app_enabled,
           push_enabled = excluded.push_enabled,
           account_events = excluded.account_events,
           business_events = excluded.business_events,
           shareholder_events = excluded.shareholder_events,
           admin_events = excluded.admin_events`
      ).run(
        userId,
        p.in_app_enabled ? 1 : 0,
        p.push_enabled ? 1 : 0,
        p.account_events ? 1 : 0,
        p.business_events ? 1 : 0,
        p.shareholder_events ? 1 : 0,
        p.admin_events ? 1 : 0
      );
    }

    res.json({ user: buildUserProfile(userId) });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Failed to update profile' });
  }
});

authRoutes.post('/change-password', requireAuth, (req: AuthedRequest, res: Response) => {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const row = db.prepare(`SELECT password_hash FROM profiles WHERE id = ?`).get(req.user!.id) as {
    password_hash: string;
  };
  if (!verifyPassword(currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  db.prepare(`UPDATE profiles SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(newPassword),
    req.user!.id
  );
  logSecurityEvent({ userId: req.user!.id, eventType: 'PASSWORD_CHANGED', req, details: 'User changed password' });
  res.json({ ok: true });
});

authRoutes.get('/sessions', requireAuth, (req: AuthedRequest, res: Response) => {
  const sessions = db
    .prepare(
      `SELECT id, user_agent, ip_address, expires_at, created_at FROM user_sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY created_at DESC`
    )
    .all(req.user!.id);
  res.json({ sessions, current_session_id: req.sessionId });
});

authRoutes.delete('/sessions/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  db.prepare(`DELETE FROM user_sessions WHERE id = ? AND user_id = ?`).run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

// ================= WEBAUTHN / FIDO2 BIOMETRIC PASSKEYS =================

// Step 1: Enrollment options (strictly requires approved active account)
authRoutes.post('/webauthn/register/options', requireAuth, requireApproved, async (req: AuthedRequest, res: Response) => {
  try {
    const { rpID } = getRpConfig(req);
    const existingCreds = db
      .prepare(`SELECT id, transports FROM webauthn_credentials WHERE user_id = ?`)
      .all(req.user!.id) as Array<{ id: string; transports: string }>;

    const options = await generateRegistrationOptions({
      rpName: 'XCLUFY Business Management',
      rpID,
      userName: req.user!.email,
      userDisplayName: req.user!.full_name,
      userID: new TextEncoder().encode(String(req.user!.id)),
      attestationType: 'none',
      excludeCredentials: existingCreds.map((c) => ({
        id: c.id,
        transports: JSON.parse(c.transports || '[]'),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });

    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO webauthn_challenges (id, user_id, challenge, flow, expires_at) VALUES (?, ?, ?, 'register', ?)`
    ).run(challengeId, req.user!.id, options.challenge, expiresAt);

    res.json({ options, challengeId });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message || 'Failed to generate biometric registration options' });
  }
});

authRoutes.post('/webauthn/register/verify', requireAuth, requireApproved, async (req: AuthedRequest, res: Response) => {
  try {
    const { challengeId, response, deviceName } = req.body || {};
    if (!challengeId || !response) {
      res.status(400).json({ error: 'Challenge ID and attestation response are required.' });
      return;
    }

    const challengeRow = db
      .prepare(
        `SELECT id, challenge FROM webauthn_challenges WHERE id = ? AND user_id = ? AND flow = 'register' AND expires_at > datetime('now')`
      )
      .get(challengeId, req.user!.id) as { id: string; challenge: string } | undefined;

    if (!challengeRow) {
      res.status(400).json({ error: 'Biometric registration challenge expired or invalid.' });
      return;
    }

    // Consume challenge immediately to prevent replay
    db.prepare(`DELETE FROM webauthn_challenges WHERE id = ?`).run(challengeRow.id);

    const { rpID, expectedOrigins } = getRpConfig(req);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Biometric passkey verification failed.' });
      return;
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const label = String(deviceName || 'Device Biometric Passkey').trim().slice(0, 60) || 'Device Passkey';

    db.prepare(
      `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, device_name, device_type, backed_up, transports)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      credential.id,
      req.user!.id,
      Buffer.from(credential.publicKey),
      credential.counter,
      label,
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      JSON.stringify(credential.transports || [])
    );

    logAudit({
      userId: req.user!.id,
      userName: req.user!.full_name,
      action: 'BIOMETRIC_PASSKEY_ENROLLED',
      entityType: 'webauthn_credential',
      entityId: credential.id,
      newValues: { device_name: label, device_type: credentialDeviceType },
    });
    logSecurityEvent({
      userId: req.user!.id,
      eventType: 'PASSKEY_REGISTERED',
      req,
      details: `Enrolled passkey (${label})`,
    });

    res.json({ verified: true, user: buildUserProfile(req.user!.id) });
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message || 'Biometric enrollment failed.' });
  }
});

authRoutes.get('/webauthn/credentials', requireAuth, (req: AuthedRequest, res: Response) => {
  const credentials = db
    .prepare(
      `SELECT id, device_name, device_type, backed_up, created_at, last_used_at
       FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(req.user!.id);
  res.json({ credentials });
});

authRoutes.patch('/webauthn/credentials/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const name = String(req.body?.device_name || '').trim().slice(0, 60);
  if (!name) {
    res.status(400).json({ error: 'Device name is required.' });
    return;
  }
  const info = db
    .prepare(`UPDATE webauthn_credentials SET device_name = ? WHERE id = ? AND user_id = ?`)
    .run(name, req.params.id, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Passkey not found.' });
    return;
  }
  res.json({ ok: true });
});

authRoutes.delete('/webauthn/credentials/:id', requireAuth, (req: AuthedRequest, res: Response) => {
  const info = db
    .prepare(`DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?`)
    .run(req.params.id, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Passkey not found.' });
    return;
  }
  logAudit({
    userId: req.user!.id,
    userName: req.user!.full_name,
    action: 'BIOMETRIC_PASSKEY_REVOKED',
    entityType: 'webauthn_credential',
    entityId: req.params.id,
  });
  res.json({ ok: true, user: buildUserProfile(req.user!.id) });
});

// Biometric login options (supports email-scoped or discoverable passkey)
authRoutes.post('/webauthn/login/options', async (req: Request, res: Response) => {
  try {
    const { rpID } = getRpConfig(req);
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : '';
    let allowCredentials: Array<{ id: string; transports?: string[] }> | undefined;

    if (email) {
      const user = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(email) as { id: number } | undefined;
      if (user) {
        const creds = db
          .prepare(`SELECT id, transports FROM webauthn_credentials WHERE user_id = ?`)
          .all(user.id) as Array<{ id: string; transports: string }>;
        allowCredentials = creds.map((c) => ({
          id: c.id,
          transports: JSON.parse(c.transports || '[]'),
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      ...(allowCredentials && allowCredentials.length > 0 ? { allowCredentials } : {}),
    });

    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO webauthn_challenges (id, user_id, challenge, flow, expires_at) VALUES (?, NULL, ?, 'login', ?)`
    ).run(challengeId, options.challenge, expiresAt);

    res.json({ options, challengeId });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message || 'Failed to initiate passkey login' });
  }
});

authRoutes.post('/webauthn/login/verify', async (req: Request, res: Response) => {
  try {
    const { challengeId, response } = req.body || {};
    if (!challengeId || !response?.id) {
      res.status(400).json({ error: 'Challenge and passkey assertion are required.' });
      return;
    }

    const challengeRow = db
      .prepare(
        `SELECT id, challenge FROM webauthn_challenges WHERE id = ? AND flow = 'login' AND expires_at > datetime('now')`
      )
      .get(challengeId) as { id: string; challenge: string } | undefined;

    if (!challengeRow) {
      res.status(400).json({ error: 'Biometric login challenge expired or invalid.' });
      return;
    }
    db.prepare(`DELETE FROM webauthn_challenges WHERE id = ?`).run(challengeRow.id);

    const credRow = db
      .prepare(`SELECT * FROM webauthn_credentials WHERE id = ?`)
      .get(response.id) as
      | {
          id: string;
          user_id: number;
          public_key: Buffer;
          counter: number;
          transports: string;
        }
      | undefined;

    if (!credRow) {
      res.status(401).json({ error: 'Passkey is not registered on XCLUFY.' });
      return;
    }

    const userRow = db
      .prepare(`SELECT id, full_name, approval_status, is_active FROM profiles WHERE id = ?`)
      .get(credRow.user_id) as
      | { id: number; full_name: string; approval_status: string; is_active: number }
      | undefined;

    if (!userRow || userRow.is_active !== 1 || userRow.approval_status !== 'approved') {
      res.status(403).json({ error: 'Account is not approved or has been suspended.' });
      return;
    }

    const { rpID, expectedOrigins } = getRpConfig(req);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credRow.id,
        publicKey: new Uint8Array(credRow.public_key),
        counter: credRow.counter,
        transports: JSON.parse(credRow.transports || '[]'),
      },
    });

    if (!verification.verified) {
      logSecurityEvent({
        userId: userRow.id,
        eventType: 'PASSKEY_LOGIN_FAILED',
        req,
        details: 'Passkey signature verification failed',
      });
      res.status(401).json({ error: 'Passkey verification failed.' });
      return;
    }

    db.prepare(
      `UPDATE webauthn_credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?`
    ).run(verification.authenticationInfo.newCounter, credRow.id);

    const { token } = createSession(userRow.id, req, res);
    logSecurityEvent({
      userId: userRow.id,
      eventType: 'PASSKEY_LOGIN_SUCCESS',
      req,
      details: 'Logged in using biometric passkey',
    });

    res.json({ token, user: buildUserProfile(userRow.id) });
  } catch (err: unknown) {
    res.status(401).json({ error: (err as Error).message || 'Biometric login failed' });
  }
});
