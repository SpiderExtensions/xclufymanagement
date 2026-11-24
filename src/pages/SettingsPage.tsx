import React, { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  Fingerprint,
  Moon,
  Printer,
  Save,
  Sun,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { BusinessSettings, ModuleKey, UserProfile } from '../shared/types';
import { PageHeader } from '../components/ui/Primitives';

export const SettingsPage: React.FC<{
  settings: BusinessSettings | null;
  onSettingsUpdated: (settings: BusinessSettings) => void;
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  onNavigate: (mod: ModuleKey) => void;
  user: UserProfile;
}> = ({ settings, onSettingsUpdated, theme, onThemeChange, onNavigate, user }) => {
  const [businessName, setBusinessName] = useState(settings?.business_name || 'XCLUFY');
  const [tagline, setTagline] = useState(settings?.tagline || 'Manage Smarter. Sell Better. Stay Aesthetic.');
  const [logoUrl, setLogoUrl] = useState<string | null>(settings?.logo_url || null);
  const [address, setAddress] = useState(settings?.address || '');
  const [phone, setPhone] = useState(settings?.phone || '');
  const [email, setEmail] = useState(settings?.email || '');
  const [openingBalance, setOpeningBalance] = useState(String(settings?.opening_balance ?? 0));
  const [defaultDelivery, setDefaultDelivery] = useState(String(settings?.default_delivery_charge ?? 80));
  const [lowStockThreshold, setLowStockThreshold] = useState(String(settings?.low_stock_threshold ?? 5));
  const [receiptHeader, setReceiptHeader] = useState(settings?.receipt_header || 'XCLUFY');
  const [receiptFooter, setReceiptFooter] = useState(
    settings?.receipt_footer || 'Thank you for shopping with XCLUFY.'
  );

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!settings) return;
    setBusinessName(settings.business_name);
    setTagline(settings.tagline);
    setLogoUrl(settings.logo_url);
    setAddress(settings.address);
    setPhone(settings.phone);
    setEmail(settings.email);
    setOpeningBalance(String(settings.opening_balance));
    setDefaultDelivery(String(settings.default_delivery_charge));
    setLowStockThreshold(String(settings.low_stock_threshold));
    setReceiptHeader(settings.receipt_header);
    setReceiptFooter(settings.receipt_footer);
  }, [settings]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setLogoUrl(canvas.toDataURL('image/png', 0.92));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await apiFetch<{ settings: BusinessSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          business_name: businessName,
          tagline,
          logo_url: logoUrl,
          address,
          phone,
          email,
          opening_balance: Number(openingBalance) || 0,
          default_delivery_charge: Number(defaultDelivery) || 0,
          low_stock_threshold: Number(lowStockThreshold) || 5,
          receipt_header: receiptHeader,
          receipt_footer: receiptFooter,
        }),
      });
      onSettingsUpdated(res.settings);
      setStatusMsg('Business settings saved and synced across POS, receipts, and financial summaries.');
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System & Business Settings"
        subtitle="Configure XCLUFY branding, BDT store defaults, 80mm thermal receipt copy, and workspace appearance."
      />

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <form onSubmit={handleSave} className="space-y-6 xl:col-span-2">
          {/* Business Identity */}
          <section className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111] p-6 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-zinc-200 dark:border-white/10 pb-3">
              <Building2 className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Business Profile</h2>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-[#181818]">
                {logoUrl ? (
                  <img src={logoUrl} alt="Business logo" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-xl font-bold tracking-wider text-zinc-900 dark:text-white">
                    {businessName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Brand Logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="sr-only" />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl(null)}
                    className="ml-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  >
                    Remove
                  </button>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Displayed in workspace header and printed receipts.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Business Name</span>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Currency (Standard)</span>
                <input
                  type="text"
                  readOnly
                  value="BDT (৳) — Bangladesh Taka"
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#0B0B0B] px-3 py-2 text-sm font-mono text-zinc-500 dark:text-zinc-400"
                />
              </label>

              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Brand Tagline</span>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Contact Phone</span>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+880 1..."
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Business Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hello@xclufy.com"
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
                />
              </label>

              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Store / Office Address</span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Dhaka, Bangladesh"
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
                />
              </label>
            </div>
          </section>

          {/* Financial & Operational Defaults */}
          <section className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111] p-6 space-y-5">
            <div className="flex items-center gap-2.5 border-b border-zinc-200 dark:border-white/10 pb-3">
              <Printer className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                Store Defaults &amp; 80mm Thermal Receipts
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Opening Balance (৳)</span>
                <input
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 font-mono text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Default Delivery Charge (৳)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={defaultDelivery}
                  onChange={(e) => setDefaultDelivery(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 font-mono text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Low Stock Alert Threshold</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 font-mono text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </label>

              <label className="block space-y-1.5 sm:col-span-3">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Thermal Receipt Header</span>
                <input
                  type="text"
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </label>

              <label className="block space-y-1.5 sm:col-span-3">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Thermal Receipt Footer</span>
                <textarea
                  rows={2}
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-[#080808] hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Business Settings'}</span>
              </button>
            </div>
          </section>
        </form>

        {/* Right Column: Appearance, Receipt Preview & Quick Links */}
        <div className="space-y-6">
          <section className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111] p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Workspace Appearance</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pure Obsidian Black (#080808) is the flagship XCLUFY theme. Switch to Light mode for bright retail counters.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
                  theme === 'dark'
                    ? 'border-white bg-white text-[#080808]'
                    : 'border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10'
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                <span>Pure Dark</span>
              </button>
              <button
                type="button"
                onClick={() => onThemeChange('light')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
                  theme === 'light'
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 dark:border-white/15 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                <span>Light Mode</span>
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111] p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Security &amp; Alerts</h2>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#171717] px-4 py-3 text-left text-xs hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
              >
                <span className="flex items-center gap-2.5 font-medium text-zinc-900 dark:text-white">
                  <Fingerprint className="h-4 w-4 text-zinc-500 dark:text-zinc-300" />
                  <span>Biometric Passkeys &amp; Password</span>
                </span>
                <span className="font-mono text-zinc-500 dark:text-zinc-400">
                  {user.passkey_count > 0 ? `${user.passkey_count} active` : 'Setup'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#171717] px-4 py-3 text-left text-xs hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
              >
                <span className="flex items-center gap-2.5 font-medium text-zinc-900 dark:text-white">
                  <Bell className="h-4 w-4 text-zinc-500 dark:text-zinc-300" />
                  <span>Web Push &amp; Alert Preferences</span>
                </span>
                <span className="font-mono text-zinc-500 dark:text-zinc-400">Configure</span>
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111] p-6 space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              80mm Thermal Receipt Preview
            </h3>
            <div className="mx-auto w-full max-w-[260px] rounded-lg border border-zinc-300 bg-white p-4 font-mono text-[11px] text-black shadow-sm">
              <div className="text-center font-bold text-sm">{receiptHeader || businessName}</div>
              <div className="text-center text-[10px] text-zinc-600">{tagline}</div>
              {address && <div className="mt-1 text-center text-[10px]">{address}</div>}
              {phone && <div className="text-center text-[10px]">Tel: {phone}</div>}
              <div className="my-2 border-t border-dashed border-black/40" />
              <div className="flex justify-between">
                <span>1x Sample Accessory</span>
                <span>৳1,250.00</span>
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600">
                <span>Delivery</span>
                <span>৳{Number(defaultDelivery || 0).toFixed(2)}</span>
              </div>
              <div className="my-2 border-t border-dashed border-black/40" />
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>৳{(1250 + (Number(defaultDelivery) || 0)).toFixed(2)}</span>
              </div>
              <div className="mt-3 text-center text-[10px] text-zinc-700">{receiptFooter}</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
