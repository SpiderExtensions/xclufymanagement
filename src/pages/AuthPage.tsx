import React, { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint, ArrowRight, Eye, EyeOff, KeyRound, Camera, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { UserProfile } from '../shared/types';
import { Avatar } from '../components/ui/Primitives';
import { ImageCropperModal } from '../components/modals/ImageCropperModal';

interface AuthResponse {
  token: string;
  user: UserProfile;
  is_first_admin?: boolean;
  verification_token?: string | null;
}

export const AuthPage: React.FC<{
  onSuccess: (user: UserProfile, meta?: { isFirstAdmin?: boolean; verificationToken?: string | null }) => void;
}> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reset password state
  const [resetToken, setResetToken] = useState('');
  const [issuedResetToken, setIssuedResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const webAuthnSupported =
    typeof window !== 'undefined' && !!window.PublicKeyCredential;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const res = await apiFetch<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(res.token);
      onSuccess(res.user);
    } catch (err: unknown) {
      setError((err as Error).message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone,
          password,
          confirm_password: confirmPassword,
          avatar_url: avatarUrl,
        }),
      });
      setAuthToken(res.token);
      onSuccess(res.user, {
        isFirstAdmin: res.is_first_admin,
        verificationToken: res.verification_token,
      });
    } catch (err: unknown) {
      setError((err as Error).message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setError('');
    setInfoMsg('');
    if (!webAuthnSupported) {
      setError('Passkeys / WebAuthn are not supported on this browser. Please sign in with email and password.');
      return;
    }
    setBioLoading(true);
    try {
      const { options, challengeId } = await apiFetch<{
        options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
        challengeId: string;
      }>('/api/auth/webauthn/login/options', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() || undefined }),
      });

      const assertion = await startAuthentication({ optionsJSON: options });
      const res = await apiFetch<AuthResponse>('/api/auth/webauthn/login/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId, response: assertion }),
      });
      setAuthToken(res.token);
      onSuccess(res.user);
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Biometric passkey authentication failed.';
      setError(msg.includes('timed out') || msg.includes('NotAllowedError')
        ? 'Biometric prompt was cancelled or no passkey was found for this device.'
        : msg);
    } finally {
      setBioLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string; reset_token?: string }>('/api/auth/request-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfoMsg(res.message);
      if (res.reset_token) setIssuedResetToken(res.reset_token);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken || issuedResetToken, new_password: newPassword }),
      });
      setMode('login');
      setInfoMsg('Password updated. Sign in with your new password.');
      setIssuedResetToken('');
      setResetToken('');
      setNewPassword('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col lg:flex-row">
      {/* Left Brand Panel */}
      <div className="lg:w-[44%] border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0D0D0D] p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="XCLUFY" className="h-9 w-9 rounded-lg border border-white/15" />
            <span className="font-display text-xl font-semibold tracking-[0.18em]">XCLUFY</span>
          </div>
          <div className="mt-14 max-w-md">
            <p className="text-xs font-medium tracking-[0.15em] text-zinc-400">ENTERPRISE BUSINESS PLATFORM</p>
            <h1 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance leading-[1.15]">
              Manage Smarter. Sell Better. Stay Aesthetic.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              Unified retail ERP, point of sale, barcode inventory, thermal printing, financial ledger, and shareholder equity governance built for XCLUFY Bangladesh.
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-6 border-t border-white/10 pt-8 text-xs text-zinc-400">
          <div>
            <p className="font-medium text-white">First-Admin Bootstrap</p>
            <p className="mt-1 leading-relaxed">The first account registered automatically becomes Main Admin with 100% ownership control.</p>
          </div>
          <div>
            <p className="font-medium text-white">FIDO2 Passkey Security</p>
            <p className="mt-1 leading-relaxed">Hardware-backed fingerprint &amp; biometric login verified via WebAuthn public-key cryptography.</p>
          </div>
        </div>
      </div>

      {/* Right Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Mode Switcher */}
          <div className="flex rounded-lg border border-white/10 bg-[#121212] p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setInfoMsg(''); }}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                mode === 'login' ? 'bg-white text-[#080808]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setInfoMsg(''); }}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                mode === 'register' ? 'bg-white text-[#080808]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => { setMode('reset'); setError(''); setInfoMsg(''); }}
              className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                mode === 'reset' ? 'bg-white text-[#080808]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Reset Password
            </button>
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}
          {infoMsg && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-200">
              {infoMsg}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Sign in to XCLUFY</h2>
                <p className="mt-1 text-xs text-zinc-400">Access your approved ERP workspace</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-xs font-medium text-zinc-300">
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@xclufy.com"
                  className="w-full rounded-lg border border-white/15 bg-[#121212] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3.5 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 focus:border-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-[#080808] hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#080808] px-3 text-zinc-500">or authenticate biometrically</span>
                </div>
              </div>

              <button
                type="button"
                disabled={bioLoading || !webAuthnSupported}
                onClick={() => void handleBiometricLogin()}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-white/20 bg-[#141414] py-2.5 text-sm font-medium text-white hover:bg-[#1C1C1C] disabled:opacity-50 transition-colors"
              >
                <Fingerprint className={`h-4 w-4 ${bioLoading ? 'animate-pulse' : ''}`} />
                <span>{bioLoading ? 'Waiting for Device Biometric...' : 'Continue with Passkey / Fingerprint'}</span>
              </button>

              {!webAuthnSupported && (
                <p className="text-[11px] text-zinc-500 text-center">
                  WebAuthn passkeys require a modern HTTPS browser. Password fallback remains available.
                </p>
              )}
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Register Account</h2>
                <p className="mt-1 text-xs text-zinc-400">
                  The very first account becomes Main Admin. Subsequent registrations require Main Admin approval.
                </p>
              </div>

              <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#121212] p-3">
                <Avatar src={avatarUrl} name={fullName || 'New User'} size="lg" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-white">Profile Picture (Optional)</p>
                  <p className="text-[11px] text-zinc-400">Upload or capture from camera</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCropperOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>{avatarUrl ? 'Change' : 'Add Photo'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="reg-name" className="block text-xs font-medium text-zinc-300">Full Name</label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="reg-phone" className="block text-xs font-medium text-zinc-300">Phone Number</label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+880 1XXX-XXXXXX"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="reg-email" className="block text-xs font-medium text-zinc-300">Email Address</label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@xclufy.com"
                  className="w-full rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="reg-pass" className="block text-xs font-medium text-zinc-300">Password</label>
                  <input
                    id="reg-pass"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="reg-confirm" className="block text-xs font-medium text-zinc-300">Confirm Password</label>
                  <input
                    id="reg-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-[#080808] hover:bg-zinc-200 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{loading ? 'Creating Account...' : 'Register Account'}</span>
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Account Recovery</h2>
                <p className="mt-1 text-xs text-zinc-400">Generate a reset token and update your password securely</p>
              </div>

              <form onSubmit={handleRequestReset} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="reset-email" className="block text-xs font-medium text-zinc-300">Registered Email</label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@xclufy.com"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg border border-white/20 bg-[#161616] py-2 text-xs font-medium text-white hover:bg-[#1E1E1E]"
                >
                  Request Reset Token
                </button>
              </form>

              {issuedResetToken && (
                <div className="rounded-lg border border-white/15 bg-[#141414] p-3 text-xs space-y-1">
                  <span className="text-zinc-400">Issued Reset Token:</span>
                  <div className="font-mono text-white break-all select-all">{issuedResetToken}</div>
                </div>
              )}

              <form onSubmit={handleCompleteReset} className="space-y-3 border-t border-white/10 pt-4">
                <div className="space-y-1">
                  <label htmlFor="reset-token" className="block text-xs font-medium text-zinc-300">Reset Token</label>
                  <input
                    id="reset-token"
                    type="text"
                    required
                    value={resetToken || issuedResetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste reset token"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3.5 py-2 text-sm font-mono text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="reset-new-pass" className="block text-xs font-medium text-zinc-300">New Password</label>
                  <input
                    id="reset-new-pass"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-lg border border-white/15 bg-[#121212] px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-[#080808]"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Reset Password</span>
                </button>
              </form>
            </div>
          )}
        </motion.div>
      </div>

      <ImageCropperModal
        open={cropperOpen}
        onClose={() => setCropperOpen(false)}
        currentImage={avatarUrl}
        onSave={(url) => setAvatarUrl(url)}
        title="Profile Picture"
      />
    </div>
  );
};
