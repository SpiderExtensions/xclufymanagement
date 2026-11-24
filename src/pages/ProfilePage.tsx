import React, { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import {
  Camera,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Laptop,
  ShieldCheck,
  Trash2,
  AlertCircle,
  Edit3,
} from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';
import type { PasskeyCredentialInfo, UserProfile } from '../shared/types';
import { Avatar, PageHeader } from '../components/ui/Primitives';
import { ImageCropperModal } from '../components/modals/ImageCropperModal';

interface SessionRow {
  id: string;
  user_agent: string;
  ip_address: string;
  expires_at: string;
  created_at: string;
}

export const ProfilePage: React.FC<{
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
}> = ({ user, onUserUpdated }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone);
  const [prefs, setPrefs] = useState(user.notification_prefs);
  const [cropperOpen, setCropperOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [credentials, setCredentials] = useState<PasskeyCredentialInfo[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [deviceName, setDeviceName] = useState('');
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [editingCredName, setEditingCredName] = useState('');

  const [bioState, setBioState] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [bioMsg, setBioMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const webAuthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

  const loadSecurityData = async () => {
    try {
      const [credsRes, sessRes] = await Promise.all([
        apiFetch<{ credentials: PasskeyCredentialInfo[] }>('/api/auth/webauthn/credentials'),
        apiFetch<{ sessions: SessionRow[]; current_session_id: string }>('/api/auth/sessions'),
      ]);
      setCredentials(credsRes.credentials);
      setSessions(sessRes.sessions);
      setCurrentSessionId(sessRes.current_session_id);
    } catch {
      // Ignore secondary load errors
    }
  };

  useEffect(() => {
    void loadSecurityData();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    setStatusMsg('');
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ full_name: fullName, phone, notification_prefs: prefs }),
      });
      onUserUpdated(res.user);
      setStatusMsg('Profile and notification preferences saved.');
    } catch (err: unknown) {
      setErrMsg((err as Error).message || 'Failed to update profile.');
    }
  };

  const handleSaveAvatar = async (avatarDataUrl: string | null) => {
    setErrMsg('');
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ avatar_url: avatarDataUrl }),
      });
      onUserUpdated(res.user);
      setStatusMsg(avatarDataUrl ? 'Profile picture updated.' : 'Profile picture removed.');
    } catch (err: unknown) {
      setErrMsg((err as Error).message || 'Failed to update picture.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    setStatusMsg('');
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setStatusMsg('Password updated successfully.');
    } catch (err: unknown) {
      setErrMsg((err as Error).message || 'Failed to change password.');
    }
  };

  const handleEnrollFingerprint = async () => {
    if (!webAuthnSupported) {
      setBioState('error');
      setBioMsg('This browser does not support WebAuthn Passkeys.');
      return;
    }
    setBioState('scanning');
    setBioMsg('Follow your device biometric prompt (Touch ID, Face ID, Android Fingerprint, or Windows Hello)...');
    try {
      const { options, challengeId } = await apiFetch<{
        options: Parameters<typeof startRegistration>[0]['optionsJSON'];
        challengeId: string;
      }>('/api/auth/webauthn/register/options', {
        method: 'POST',
      });

      const attestation = await startRegistration({ optionsJSON: options });
      const res = await apiFetch<{ verified: boolean; user: UserProfile }>('/api/auth/webauthn/register/verify', {
        method: 'POST',
        body: JSON.stringify({
          challengeId,
          response: attestation,
          deviceName: deviceName.trim() || navigator.platform || 'Biometric Device',
        }),
      });
      onUserUpdated(res.user);
      setDeviceName('');
      setBioState('success');
      setBioMsg('Biometric Login Enabled. Your public-key passkey is now linked to your approved account.');
      await loadSecurityData();
    } catch (err: unknown) {
      setBioState('error');
      setBioMsg((err as Error).message || 'Biometric enrollment was cancelled or failed on this device.');
    }
  };

  const handleRenameCred = async (id: string) => {
    if (!editingCredName.trim()) return;
    await apiFetch(`/api/auth/webauthn/credentials/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ device_name: editingCredName.trim() }),
    });
    setEditingCredId(null);
    await loadSecurityData();
  };

  const handleDeleteCred = async (id: string) => {
    const res = await apiFetch<{ ok: boolean; user: UserProfile }>(
      `/api/auth/webauthn/credentials/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    onUserUpdated(res.user);
    await loadSecurityData();
  };

  const handleRevokeSession = async (id: string) => {
    await apiFetch(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadSecurityData();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="My Profile & Biometric Security"
        subtitle="Manage your identity, profile picture, WebAuthn fingerprint passkeys, and active sessions"
      />

      {statusMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Profile & Account Details */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 border-b border-zinc-200 dark:border-white/10 pb-6">
              <Avatar src={user.avatar_url} name={user.full_name} size="xl" />
              <div className="flex-1 space-y-1">
                <h2 className="text-lg font-semibold">{user.full_name}</h2>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{user.role.replace('_', ' ')}</span>
                  <span className="mx-2">·</span>
                  <span className="capitalize">{user.approval_status}</span>
                  <span className="mx-2">·</span>
                  <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                {user.last_login_at && (
                  <p className="text-[11px] text-zinc-500 font-mono">
                    Last login: {new Date(user.last_login_at).toLocaleString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCropperOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-white/10 shrink-0"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Edit Photo</span>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="prof-name" className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Full Name
                  </label>
                  <input
                    id="prof-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="prof-phone" className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Phone Number
                  </label>
                  <input
                    id="prof-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#101010] px-3 py-2 text-sm text-zinc-500"
                />
              </div>

              <div className="border-t border-zinc-200 dark:border-white/10 pt-4 space-y-2.5">
                <p className="text-xs font-semibold">Notification Preferences</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {[
                    { key: 'in_app_enabled', label: 'In-App Notifications' },
                    { key: 'push_enabled', label: 'Mobile Push Notifications' },
                    { key: 'account_events', label: 'Account & Security Events' },
                    { key: 'business_events', label: 'Orders, Payments & Stock' },
                    { key: 'shareholder_events', label: 'Shareholder & Equity Events' },
                    { key: 'admin_events', label: 'Administrative Alerts' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(prefs[item.key as keyof typeof prefs])}
                        onChange={(e) =>
                          setPrefs((prev) => ({ ...prev, [item.key]: e.target.checked }))
                        }
                        className="h-4 w-4 rounded accent-white"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-zinc-900 dark:bg-white px-5 py-2 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90"
              >
                Save Profile Changes
              </button>
            </form>
          </div>

          {/* Password Management */}
          <form
            onSubmit={handleChangePassword}
            className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-semibold">Change Password</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="password"
                required
                placeholder="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="New Password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 dark:border-white/15 px-4 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              Update Password
            </button>
          </form>
        </div>

        {/* Right: Biometric WebAuthn Passkey Setup & Sessions */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Biometric / Passkey Login</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {user.biometric_enabled ? 'Biometric Login Enabled' : 'Not yet enrolled on this account'}
                </p>
              </div>
              <ShieldCheck className={`h-5 w-5 ${user.biometric_enabled ? 'text-emerald-400' : 'text-zinc-500'}`} />
            </div>

            {/* Animated Fingerprint / Circular Scanning Illustration */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#0B0B0B] py-7 px-4 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                <motion.div
                  animate={
                    bioState === 'scanning'
                      ? { rotate: 360 }
                      : { rotate: 0 }
                  }
                  transition={
                    bioState === 'scanning'
                      ? { repeat: Infinity, duration: 2.2, ease: 'linear' }
                      : { duration: 0.3 }
                  }
                  className={`absolute inset-0 rounded-full border-2 border-dashed ${
                    bioState === 'success'
                      ? 'border-emerald-400'
                      : bioState === 'error'
                        ? 'border-red-400'
                        : bioState === 'scanning'
                          ? 'border-white'
                          : 'border-zinc-400/40 dark:border-white/20'
                  }`}
                />
                <motion.div
                  animate={bioState === 'scanning' ? { scale: [1, 1.07, 1] } : { scale: 1 }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                  className={`flex h-20 w-20 items-center justify-center rounded-full border ${
                    bioState === 'success'
                      ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-300 dark:border-white/15 bg-white dark:bg-[#161616]'
                  }`}
                >
                  <Fingerprint className="h-10 w-10" />
                </motion.div>
              </div>

              <div className="mt-4 w-full space-y-2.5">
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="Device label (e.g. iPhone 15 / Pixel / MacBook)"
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#141414] px-3 py-2 text-xs text-center"
                />
                <button
                  type="button"
                  disabled={!webAuthnSupported || bioState === 'scanning'}
                  onClick={() => void handleEnrollFingerprint()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 dark:bg-white py-2.5 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90 disabled:opacity-50"
                >
                  <Fingerprint className="h-4 w-4" />
                  <span>{bioState === 'scanning' ? 'Waiting for Device Prompt...' : 'Add Your Fingerprint'}</span>
                </button>
              </div>

              {bioMsg && (
                <p
                  className={`mt-3 text-xs leading-relaxed ${
                    bioState === 'error'
                      ? 'text-red-400'
                      : bioState === 'success'
                        ? 'text-emerald-400'
                        : 'text-zinc-400'
                  }`}
                >
                  {bioMsg}
                </p>
              )}

              <p className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
                Compatibility: {webAuthnSupported ? 'WebAuthn Supported' : 'WebAuthn Unavailable'}. Fingerprint and biometric verification is handled directly by your device OS (Android, iOS Touch/Face ID, Windows Hello, macOS Touch ID). XCLUFY stores only cryptographic public keys—never fingerprint images or templates.
              </p>
            </div>

            {/* Registered Passkeys */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Registered Passkeys ({credentials.length})
              </h3>
              {credentials.length === 0 ? (
                <p className="text-xs text-zinc-500">No passkeys registered yet.</p>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-white/10 border border-zinc-200 dark:border-white/10 rounded-lg">
                  {credentials.map((cred) => (
                    <div key={cred.id} className="flex items-center justify-between gap-2 p-3 text-xs">
                      <div className="min-w-0 flex-1">
                        {editingCredId === cred.id ? (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={editingCredName}
                              onChange={(e) => setEditingCredName(e.target.value)}
                              className="w-full rounded border border-white/20 bg-[#181818] px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => void handleRenameCred(cred.id)}
                              className="rounded bg-white px-2 py-1 text-[11px] font-medium text-black"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium truncate">{cred.device_name}</div>
                            <div className="text-[11px] text-zinc-500">
                              {cred.device_type} · Added {new Date(cred.created_at).toLocaleDateString()}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`Rename ${cred.device_name}`}
                          onClick={() => {
                            setEditingCredId(cred.id);
                            setEditingCredName(cred.device_name);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${cred.device_name}`}
                          onClick={() => void handleDeleteCred(cred.id)}
                          className="p-1.5 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Sessions */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Laptop className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-semibold">Active Sessions ({sessions.length})</h3>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-white/10">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {s.id === currentSessionId ? 'Current Device Session' : 'Authenticated Session'}
                    </div>
                    <div className="truncate text-[11px] text-zinc-500">
                      {s.ip_address || 'IP'} · {s.user_agent.slice(0, 48)}
                    </div>
                  </div>
                  {s.id !== currentSessionId && (
                    <button
                      type="button"
                      onClick={() => void handleRevokeSession(s.id)}
                      className="text-xs text-red-400 hover:underline shrink-0"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ImageCropperModal
        open={cropperOpen}
        onClose={() => setCropperOpen(false)}
        currentImage={user.avatar_url}
        onSave={(url) => void handleSaveAvatar(url)}
      />
    </div>
  );
};
