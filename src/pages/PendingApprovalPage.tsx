import React, { useState } from 'react';
import { Clock, LogOut, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { UserProfile } from '../shared/types';
import { Avatar } from '../components/ui/Primitives';

export const PendingApprovalPage: React.FC<{
  user: UserProfile;
  verificationToken?: string | null;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}> = ({ user, verificationToken, onRefresh, onLogout }) => {
  const [tokenInput, setTokenInput] = useState(verificationToken || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: tokenInput }),
      });
      setMessage('Email address verified. Awaiting Main Admin account approval.');
      await onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/12 bg-[#111111] p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <Avatar src={user.avatar_url} name={user.full_name} size="md" />
            <div>
              <h1 className="text-lg font-semibold">{user.full_name}</h1>
              <p className="text-xs text-zinc-400">{user.email} · {user.phone || 'No phone'}</p>
            </div>
          </div>
          <span className="text-xs font-mono text-amber-300 capitalize">{user.approval_status}</span>
        </div>

        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-[#181818]">
            {user.approval_status === 'pending' ? (
              <Clock className="h-5 w-5 text-amber-300" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-red-400" />
            )}
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-medium">
              {user.approval_status === 'pending'
                ? 'Administrator Approval Required'
                : user.approval_status === 'suspended'
                  ? 'Account Suspended'
                  : 'Registration Declined'}
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {user.approval_status === 'pending'
                ? 'Your account has been registered and the Main Admin has been notified. Private business data and biometric passkey enrollment remain locked until your account is approved.'
                : 'You do not currently have access to XCLUFY. Please contact the Main Admin for assistance.'}
            </p>
          </div>
        </div>

        {user.email_verified === 0 && user.approval_status === 'pending' && (
          <form onSubmit={handleVerifyEmail} className="rounded-xl border border-white/10 bg-[#161616] p-4 space-y-3">
            <p className="text-xs font-medium text-zinc-200">Verify Email Address</p>
            {verificationToken && (
              <p className="text-[11px] text-zinc-400">
                Verification Token: <span className="font-mono text-white select-all">{verificationToken}</span>
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Enter email verification token"
                className="flex-1 rounded-lg border border-white/15 bg-[#101010] px-3 py-2 text-xs font-mono text-white"
              />
              <button
                type="submit"
                disabled={busy || !tokenInput}
                className="rounded-lg bg-white px-3.5 py-2 text-xs font-semibold text-[#080808] disabled:opacity-50"
              >
                Verify
              </button>
            </div>
            {message && <p className="text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />{message}</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </form>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#171717] py-2.5 text-sm font-medium text-white hover:bg-[#1F1F1F]"
          >
            <RefreshCw className="h-4 w-4" />
            Check Approval Status
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
