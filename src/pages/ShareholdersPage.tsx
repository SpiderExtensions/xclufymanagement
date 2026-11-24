import React, { useEffect, useState } from 'react';
import {
  PieChart,
  Plus,
  ShieldCheck,
  UserCheck,
  ArrowRightLeft,
  Coins,
  Eye,
  History,
  Camera,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { bpsToPercent, formatBDT } from '../shared/erpMath';
import type {
  OwnershipHistoryRecord,
  ProfitDistribution,
  Shareholder,
  ShareholderInvestment,
} from '../shared/types';
import { Avatar, EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';
import { ImageCropperModal } from '../components/modals/ImageCropperModal';

interface ShareholderPortalData {
  is_admin_view: boolean;
  main_admin?: {
    name: string;
    email: string;
    avatar_url: string | null;
    equity_capital: number;
    ownership_bps: number;
    ownership_percent: number;
  };
  total_business_equity?: number;
  total_shareholders?: number;
  shareholders?: Shareholder[];
  investments: ShareholderInvestment[];
  ownership_history: OwnershipHistoryRecord[];
  profit_distributions?: ProfitDistribution[];
  approved_users?: Array<{ id: number; full_name: string; email: string; role: string }>;
  own_shareholder?: Shareholder;
  own_distributions?: Array<{
    id: number;
    period_label: string;
    period_start: string;
    period_end: string;
    ownership_bps: number;
    allocated_amount: number;
  }>;
}

const DONUT_SHADES = ['#FFFFFF', '#A1A1AA', '#71717A', '#52525B', '#D4D4D8', '#3F3F46'];

export const ShareholdersPage: React.FC = () => {
  const [data, setData] = useState<ShareholderPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [adminCapOpen, setAdminCapOpen] = useState(false);
  const [invTarget, setInvTarget] = useState<Shareholder | null>(null);
  const [profileTarget, setProfileTarget] = useState<Shareholder | null>(null);
  const [reallocOpen, setReallocOpen] = useState(false);
  const [profitOpen, setProfitOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  // Add Shareholder Form
  const [shName, setShName] = useState('');
  const [shAvatar, setShAvatar] = useState<string | null>(null);
  const [shPhone, setShPhone] = useState('');
  const [shEmail, setShEmail] = useState('');
  const [shAddress, setShAddress] = useState('');
  const [shInvAmount, setShInvAmount] = useState('0');
  const [shInvDate, setShInvDate] = useState(new Date().toISOString().slice(0, 10));
  const [allocMethod, setAllocMethod] = useState<'investment' | 'manual'>('manual');
  const [manualPct, setManualPct] = useState('0');
  const [linkedUserId, setLinkedUserId] = useState('');
  const [canViewPortal, setCanViewPortal] = useState(false);
  const [shNotes, setShNotes] = useState('');
  const [shStatus, setShStatus] = useState<'active' | 'inactive'>('active');
  const [confirmOwnership, setConfirmOwnership] = useState(false);

  // Admin capital form
  const [adminCapAmount, setAdminCapAmount] = useState('');
  const [adminCapRecalc, setAdminCapRecalc] = useState(true);

  // Investment form
  const [invAmount, setInvAmount] = useState('');
  const [invDate, setInvDate] = useState(new Date().toISOString().slice(0, 10));
  const [invType, setInvType] = useState<'additional_capital' | 'capital_withdrawal' | 'loan_advance'>('additional_capital');
  const [invMethod, setInvMethod] = useState('Bank Transfer');
  const [invRef, setInvRef] = useState('');
  const [invDesc, setInvDesc] = useState('');
  const [invRecalc, setInvRecalc] = useState(false);

  // Reallocation state
  const [reallocValues, setReallocValues] = useState<Record<string, string>>({});
  const [reallocReason, setReallocReason] = useState('');

  // Profit distribution state
  const [distLabel, setDistLabel] = useState(`Distribution ${new Date().toISOString().slice(0, 7)}`);
  const [distStart, setDistStart] = useState(`${new Date().toISOString().slice(0, 7)}-01`);
  const [distEnd, setDistEnd] = useState(new Date().toISOString().slice(0, 10));
  const [distAmount, setDistAmount] = useState('');
  const [distPreview, setDistPreview] = useState<{
    accounting_profit: number;
    distribution_amount: number;
    allocations: Array<{ shareholderId: number | null; recipientName: string; ownershipBps: number; allocatedAmount: number }>;
  } | null>(null);

  const loadShareholders = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<ShareholderPortalData>('/api/shareholders');
      setData(res);
    } catch (err: unknown) {
      setError((err as Error).message || 'Unable to load shareholder data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShareholders();
  }, []);

  const handleAddShareholder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<ShareholderPortalData>('/api/shareholders', {
        method: 'POST',
        body: JSON.stringify({
          full_name: shName,
          avatar_url: shAvatar,
          phone: shPhone,
          email: shEmail,
          address: shAddress,
          initial_investment: Number(shInvAmount || 0),
          investment_date: shInvDate,
          allocation_method: allocMethod,
          manual_ownership_percent: Number(manualPct || 0),
          linked_user_id: linkedUserId ? Number(linkedUserId) : null,
          can_view_own_portal: canViewPortal,
          notes: shNotes,
          status: shStatus,
          confirm_ownership_change: confirmOwnership,
        }),
      });
      setData(res);
      setAddOpen(false);
      setShName('');
      setShAvatar(null);
      setShInvAmount('0');
      setManualPct('0');
      setConfirmOwnership(false);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to add shareholder.');
    }
  };

  const handleAdminCapital = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch<ShareholderPortalData>('/api/shareholders/admin-capital', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(adminCapAmount),
          recalculate_ownership: adminCapRecalc,
        }),
      });
      setData(res);
      setAdminCapOpen(false);
      setAdminCapAmount('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to add Main Admin capital.');
    }
  };

  const handleRecordInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invTarget) return;
    setError('');
    try {
      const res = await apiFetch<ShareholderPortalData>(`/api/shareholders/${invTarget.id}/investments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(invAmount),
          investment_date: invDate,
          investment_type: invType,
          payment_method: invMethod,
          reference_number: invRef,
          description: invDesc,
          recalculate_ownership: invRecalc,
        }),
      });
      setData(res);
      setInvTarget(null);
      setInvAmount('');
      setInvRef('');
      setInvDesc('');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to record investment.');
    }
  };

  const openReallocModal = () => {
    if (!data?.main_admin) return;
    const init: Record<string, string> = {
      admin: String(data.main_admin.ownership_percent),
    };
    for (const sh of data.shareholders || []) {
      init[String(sh.id)] = String(sh.ownership_percent);
    }
    setReallocValues(init);
    setReallocReason('');
    setReallocOpen(true);
  };

  const handleReallocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setError('');
    try {
      const allocations = [
        { id: null, percent: Number(reallocValues.admin || 0) },
        ...(data.shareholders || []).map((s) => ({
          id: s.id,
          percent: Number(reallocValues[String(s.id)] || 0),
        })),
      ];
      const res = await apiFetch<ShareholderPortalData>('/api/shareholders/reallocate', {
        method: 'POST',
        body: JSON.stringify({ allocations, reason: reallocReason || 'Manual ownership transfer' }),
      });
      setData(res);
      setReallocOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message || 'Ownership reallocation failed.');
    }
  };

  const handlePreviewDistribution = async () => {
    const res = await apiFetch<NonNullable<typeof distPreview>>('/api/shareholders/profit-distributions/preview', {
      method: 'POST',
      body: JSON.stringify({
        period_start: distStart,
        period_end: distEnd,
        distribution_amount: Number(distAmount || 0),
      }),
    });
    setDistPreview(res);
  };

  const handleApproveDistribution = async () => {
    if (!distPreview) return;
    const res = await apiFetch<ShareholderPortalData>('/api/shareholders/profit-distributions', {
      method: 'POST',
      body: JSON.stringify({
        period_label: distLabel,
        period_start: distStart,
        period_end: distEnd,
        accounting_profit: distPreview.accounting_profit,
        distribution_amount: distPreview.distribution_amount,
      }),
    });
    setData(res);
    setProfitOpen(false);
    setDistPreview(null);
  };

  if (loading) return <SkeletonRows rows={6} />;

  // Read-only linked Shareholder Viewer Portal
  if (data && !data.is_admin_view && data.own_shareholder) {
    const own = data.own_shareholder;
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Shareholder Portfolio"
          subtitle="Read-only equity, investment, and approved profit distribution portal"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-[#121212] p-5">
            <span className="text-xs text-zinc-400">Shareholder</span>
            <div className="mt-1 text-lg font-semibold">{own.full_name}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#121212] p-5">
            <span className="text-xs text-zinc-400">Your Total Equity Investment</span>
            <div className="mt-1 font-mono text-2xl font-semibold">{formatBDT(own.total_investment)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#121212] p-5">
            <span className="text-xs text-zinc-400">Approved Ownership Share</span>
            <div className="mt-1 font-mono text-2xl font-semibold">{own.ownership_percent.toFixed(2)}%</div>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#121212] p-5 space-y-3">
          <h2 className="text-sm font-semibold">Investment History ({data.investments.length})</h2>
          {data.investments.map((inv) => (
            <div key={inv.id} className="flex justify-between py-2 border-b border-white/10 text-xs">
              <span>{inv.investment_date} · {inv.investment_type.replace(/_/g, ' ')}</span>
              <span className="font-mono font-semibold">{formatBDT(inv.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.main_admin) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-6 text-sm text-red-300">
        {error || 'Access restricted to Main Admin.'}
      </div>
    );
  }

  const shareholders = data.shareholders || [];
  const activeShareholders = shareholders.filter((s) => s.status === 'active');

  // Build SVG Donut Segments
  const segments = [
    { name: data.main_admin.name, bps: data.main_admin.ownership_bps, color: DONUT_SHADES[0] },
    ...activeShareholders.map((s, idx) => ({
      name: s.full_name,
      bps: s.ownership_bps,
      color: DONUT_SHADES[(idx + 1) % DONUT_SHADES.length],
    })),
  ].filter((seg) => seg.bps > 0);

  let cumulativePct = 0;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  const reallocSum =
    Number(reallocValues.admin || 0) +
    shareholders.reduce((s, sh) => s + Number(reallocValues[String(sh.id)] || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shareholders & Business Equity"
        subtitle="Exclusive Main Admin ownership registry, capital tracking, immutable ownership ledger, and profit distribution"
        actions={
          <>
            <button
              type="button"
              onClick={() => setAdminCapOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-white/10"
            >
              <Coins className="h-3.5 w-3.5" />
              Record My Capital
            </button>
            <button
              type="button"
              onClick={openReallocModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-white/10"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Adjust Ownership
            </button>
            <button
              type="button"
              onClick={() => {
                setDistPreview(null);
                setProfitOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-white/10"
            >
              <PieChart className="h-3.5 w-3.5" />
              Profit Distribution
            </button>
            <button
              type="button"
              onClick={() => {
                setError('');
                setAddOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              + ADD SHAREHOLDER
            </button>
          </>
        }
      />

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
          <span className="text-xs text-zinc-400">Total Business Equity</span>
          <div className="mt-1.5 font-mono text-2xl font-semibold">{formatBDT(data.total_business_equity || 0)}</div>
          <p className="mt-1 text-[11px] text-zinc-500">Distinct from operating sales revenue</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
          <span className="text-xs text-zinc-400">Main Admin Ownership</span>
          <div className="mt-1.5 font-mono text-2xl font-semibold">{data.main_admin.ownership_percent.toFixed(2)}%</div>
          <p className="mt-1 text-[11px] text-zinc-500 font-mono">
            Capital: {formatBDT(data.main_admin.equity_capital)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
          <span className="text-xs text-zinc-400">Registered Shareholders</span>
          <div className="mt-1.5 font-mono text-2xl font-semibold">{data.total_shareholders ?? 0}</div>
          <p className="mt-1 text-[11px] text-zinc-500">Active equity partners</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
          <span className="text-xs text-zinc-400">Total Active Allocation</span>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-emerald-400">
            {(
              (data.main_admin.ownership_bps +
                activeShareholders.reduce((s, sh) => s + sh.ownership_bps, 0)) /
              100
            ).toFixed(2)}%
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">Enforced strictly at 100.00%</p>
        </div>
      </div>

      {/* Ownership Donut Chart + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 flex flex-col items-center justify-center gap-5">
          <div className="w-full flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ownership Distribution</h2>
            <span className="text-xs font-mono text-zinc-500">100.00% Total</span>
          </div>

          <div className="relative h-44 w-44 flex items-center justify-center">
            <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
              {segments.map((seg, idx) => {
                const pct = seg.bps / 10000;
                const dash = pct * circumference;
                const offset = -cumulativePct * circumference;
                cumulativePct += pct;
                return (
                  <circle
                    key={idx}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={offset}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] text-zinc-500">Main Admin</span>
              <span className="font-mono text-lg font-semibold">{data.main_admin.ownership_percent.toFixed(1)}%</span>
            </div>
          </div>

          <div className="w-full space-y-2 text-xs">
            {segments.map((seg, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                  <span>{seg.name}</span>
                </div>
                <span className="font-mono font-semibold">{bpsToPercent(seg.bps).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Shareholder Registry Table */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Shareholder Registry</h2>
            <span className="text-xs text-zinc-500">Main Admin + {shareholders.length} shareholder(s)</span>
          </div>

          {/* Main Admin Row */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#171717] p-4">
            <div className="flex items-center gap-3">
              <Avatar src={data.main_admin.avatar_url} name={data.main_admin.name} size="md" />
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>{data.main_admin.name}</span>
                  <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                </div>
                <div className="text-xs text-zinc-400">Main Admin · Capital: {formatBDT(data.main_admin.equity_capital)}</div>
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-base font-semibold">{data.main_admin.ownership_percent.toFixed(2)}%</div>
              <div className="text-[11px] text-zinc-500">Controlling Owner</div>
            </div>
          </div>

          {shareholders.length === 0 ? (
            <EmptyState
              icon={<UserCheck className="h-5 w-5" />}
              title="0 Registered Shareholders"
              description="Main Admin currently holds 100.00% ownership of XCLUFY. Click + ADD SHAREHOLDER whenever you wish to bring in an equity partner."
            />
          ) : (
            <div className="divide-y divide-white/10 border border-white/10 rounded-xl">
              {shareholders.map((sh) => (
                <div key={sh.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar src={sh.avatar_url} name={sh.full_name} size="md" />
                    <div>
                      <div className="text-sm font-semibold">{sh.full_name}</div>
                      <div className="text-xs text-zinc-400 font-mono">
                        Invested: {formatBDT(sh.total_investment)} · {sh.status}
                        {sh.linked_user_name ? ` · Linked: ${sh.linked_user_name}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right font-mono">
                      <div className="text-sm font-semibold">{sh.ownership_percent.toFixed(2)}%</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInvTarget(sh)}
                      className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs hover:bg-white/10"
                    >
                      + Capital
                    </button>
                    <button
                      type="button"
                      aria-label={`View profile for ${sh.full_name}`}
                      onClick={() => setProfileTarget(sh)}
                      className="rounded-lg border border-white/15 p-1.5 hover:bg-white/10"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Investments, Ownership History & Profit Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 space-y-3">
          <h3 className="text-sm font-semibold">Recent Capital &amp; Investment Activity</h3>
          {data.investments.length === 0 ? (
            <p className="text-xs text-zinc-500">No capital contributions or withdrawals recorded yet.</p>
          ) : (
            <div className="divide-y divide-white/10 text-xs max-h-64 overflow-y-auto">
              {data.investments.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-medium">{inv.shareholder_name}</div>
                    <div className="text-zinc-500">
                      {inv.investment_date} · {inv.investment_type.replace(/_/g, ' ')} · {inv.payment_method}
                    </div>
                  </div>
                  <div
                    className={`font-mono font-semibold ${
                      inv.investment_type === 'capital_withdrawal' ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {inv.investment_type === 'capital_withdrawal' ? '-' : '+'}
                    {formatBDT(inv.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold">Immutable Ownership Change History</h3>
          </div>
          {data.ownership_history.length === 0 ? (
            <p className="text-xs text-zinc-500">No ownership transfers or dilutions have occurred.</p>
          ) : (
            <div className="divide-y divide-white/10 text-xs max-h-64 overflow-y-auto">
              {data.ownership_history.map((h) => (
                <div key={h.id} className="py-2.5 space-y-0.5">
                  <div className="flex justify-between font-medium">
                    <span>{h.entity_label}</span>
                    <span className="font-mono">
                      {bpsToPercent(h.previous_bps).toFixed(2)}% → {bpsToPercent(h.new_bps).toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-zinc-500">
                    {h.effective_date} · {h.reason} · Authorized by {h.authorized_by_name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Profit Distribution History */}
      {(data.profit_distributions?.length || 0) > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 space-y-3">
          <h3 className="text-sm font-semibold">Approved Profit Distributions</h3>
          <div className="divide-y divide-white/10 text-xs">
            {data.profit_distributions!.map((pd) => (
              <div key={pd.id} className="py-3 space-y-2">
                <div className="flex flex-wrap justify-between font-medium">
                  <span>{pd.period_label} ({pd.period_start} to {pd.period_end})</span>
                  <span className="font-mono text-emerald-400">Distributed: {formatBDT(pd.distributed_amount)}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-zinc-400 font-mono">
                  {(pd.items || []).map((it) => (
                    <span key={it.id}>
                      {it.recipient_name}: {formatBDT(it.allocated_amount)} ({bpsToPercent(it.ownership_bps).toFixed(2)}%)
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* + ADD SHAREHOLDER MODAL */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add New Shareholder"
        subtitle="Create a shareholder profile and explicitly confirm ownership allocation"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleAddShareholder} className="space-y-4">
          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#171717] p-3">
            <Avatar src={shAvatar} name={shName || 'Shareholder'} size="lg" />
            <div className="flex-1 text-xs">
              <div className="font-medium">Shareholder Photo (Optional)</div>
              <div className="text-zinc-400">Displayed in shareholder registry and profile</div>
            </div>
            <button
              type="button"
              onClick={() => setCropOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs"
            >
              <Camera className="h-3.5 w-3.5" />
              {shAvatar ? 'Change' : 'Upload'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Shareholder Full Name *" value={shName} onChange={(e) => setShName(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            <input placeholder="Phone Number" value={shPhone} onChange={(e) => setShPhone(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            <input type="email" placeholder="Email Address" value={shEmail} onChange={(e) => setShEmail(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            <input placeholder="Address" value={shAddress} onChange={(e) => setShAddress(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 text-xs">
              <span className="text-zinc-400">Initial Investment (BDT ৳)</span>
              <input type="number" min="0" step="0.01" required value={shInvAmount} onChange={(e) => setShInvAmount(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-zinc-400">Investment Date</span>
              <input type="date" required value={shInvDate} onChange={(e) => setShInvDate(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-zinc-400">Shareholder Status</span>
              <select value={shStatus} onChange={(e) => setShStatus(e.target.value as 'active' | 'inactive')} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          {/* Allocation Method */}
          <div className="rounded-xl border border-white/15 bg-[#151515] p-4 space-y-3">
            <p className="text-xs font-semibold">Ownership Allocation Method</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAllocMethod('manual')}
                className={`rounded-lg border p-3 text-left ${allocMethod === 'manual' ? 'border-white bg-white/10' : 'border-white/10'}`}
              >
                <div className="font-semibold">Method 2: Manual Ownership Allocation</div>
                <div className="text-zinc-400 mt-0.5">Explicitly enter % transferred from Main Admin ({data.main_admin.ownership_percent.toFixed(2)}% available)</div>
              </button>
              <button
                type="button"
                onClick={() => setAllocMethod('investment')}
                className={`rounded-lg border p-3 text-left ${allocMethod === 'investment' ? 'border-white bg-white/10' : 'border-white/10'}`}
              >
                <div className="font-semibold">Method 1: Investment-Based Allocation</div>
                <div className="text-zinc-400 mt-0.5">Proportional equity calculation across total approved capital</div>
              </button>
            </div>

            {allocMethod === 'manual' && (
              <label className="block space-y-1 text-xs">
                <span className="text-zinc-300">Ownership Percentage (%)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={data.main_admin.ownership_percent}
                  required
                  value={manualPct}
                  onChange={(e) => setManualPct(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#101010] px-3 py-2 text-sm font-mono"
                />
              </label>
            )}
          </div>

          {/* Optional Link to Existing Approved User */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center text-xs">
            <select value={linkedUserId} onChange={(e) => setLinkedUserId(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs">
              <option value="">No Linked Website User (Offline Shareholder)</option>
              {(data.approved_users || []).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={canViewPortal} onChange={(e) => setCanViewPortal(e.target.checked)} className="h-4 w-4 accent-white" />
              <span>Grant read-only access to own shareholder portal</span>
            </label>
          </div>

          <textarea rows={2} placeholder="Shareholder Notes" value={shNotes} onChange={(e) => setShNotes(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />

          <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 cursor-pointer">
            <input type="checkbox" required checked={confirmOwnership} onChange={(e) => setConfirmOwnership(e.target.checked)} className="mt-0.5 h-4 w-4 accent-white" />
            <span>I confirm this ownership allocation as Main Admin. All active shares will remain strictly equal to 100.00% and an immutable ownership history entry will be recorded.</span>
          </label>

          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Create Shareholder &amp; Apply Ownership
          </button>
        </form>
      </Modal>

      {/* Main Admin Capital Modal */}
      <Modal open={adminCapOpen} onClose={() => setAdminCapOpen(false)} title="Record Main Admin Equity Capital">
        <form onSubmit={handleAdminCapital} className="space-y-4">
          <input type="number" min="1" step="0.01" required placeholder="Capital Amount (৳)" value={adminCapAmount} onChange={(e) => setAdminCapAmount(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={adminCapRecalc} onChange={(e) => setAdminCapRecalc(e.target.checked)} className="h-4 w-4 accent-white" />
            <span>Recalculate investment-based ownership percentages across active equity</span>
          </label>
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Save Admin Capital Contribution
          </button>
        </form>
      </Modal>

      {/* Record Shareholder Investment / Withdrawal / Loan */}
      <Modal open={!!invTarget} onClose={() => setInvTarget(null)} title={`Record Transaction — ${invTarget?.full_name || ''}`}>
        <form onSubmit={handleRecordInvestment} className="space-y-3">
          <select value={invType} onChange={(e) => setInvType(e.target.value as typeof invType)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm">
            <option value="additional_capital">Additional Equity Capital</option>
            <option value="capital_withdrawal">Capital Withdrawal</option>
            <option value="loan_advance">Temporary Loan / Advance (Does NOT become equity)</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="1" step="0.01" required placeholder="Amount (৳)" value={invAmount} onChange={(e) => setInvAmount(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
            <input type="date" required value={invDate} onChange={(e) => setInvDate(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Payment Method" value={invMethod} onChange={(e) => setInvMethod(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            <input placeholder="Reference #" value={invRef} onChange={(e) => setInvRef(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          </div>
          <input placeholder="Description" value={invDesc} onChange={(e) => setInvDesc(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          {invType !== 'loan_advance' && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={invRecalc} onChange={(e) => setInvRecalc(e.target.checked)} className="h-4 w-4 accent-white" />
              <span>Explicitly recalculate investment-based ownership percentages</span>
            </label>
          )}
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Save Investment Record
          </button>
        </form>
      </Modal>

      {/* Manual Ownership Reallocation Modal */}
      <Modal open={reallocOpen} onClose={() => setReallocOpen(false)} title="Adjust Active Ownership Percentages" subtitle="All active shares must total strictly 100.00%">
        <form onSubmit={handleReallocate} className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span>{data.main_admin.name} (Main Admin)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={reallocValues.admin || '0'}
              onChange={(e) => setReallocValues((prev) => ({ ...prev, admin: e.target.value }))}
              className="w-28 rounded border border-white/15 bg-[#171717] px-2.5 py-1.5 text-right font-mono"
            />
          </div>
          {shareholders.map((sh) => (
            <div key={sh.id} className="flex items-center justify-between text-xs">
              <span>{sh.full_name}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={reallocValues[String(sh.id)] || '0'}
                onChange={(e) => setReallocValues((prev) => ({ ...prev, [String(sh.id)]: e.target.value }))}
                className="w-28 rounded border border-white/15 bg-[#171717] px-2.5 py-1.5 text-right font-mono"
              />
            </div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2 text-xs font-mono">
            <span>Total</span>
            <span className={Math.abs(reallocSum - 100) < 0.001 ? 'text-emerald-400' : 'text-red-400'}>
              {reallocSum.toFixed(2)}%
            </span>
          </div>
          <input required placeholder="Reason for ownership change *" value={reallocReason} onChange={(e) => setReallocReason(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs" />
          <button
            type="submit"
            disabled={Math.abs(reallocSum - 100) >= 0.001}
            className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            Confirm Ownership Update
          </button>
        </form>
      </Modal>

      {/* Profit Distribution Modal */}
      <Modal open={profitOpen} onClose={() => setProfitOpen(false)} title="Profit Distribution" subtitle="Calculate and approve profit allocation by current ownership %">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <input placeholder="Period Label" value={distLabel} onChange={(e) => setDistLabel(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2" />
            <input type="date" value={distStart} onChange={(e) => setDistStart(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2" />
            <input type="date" value={distEnd} onChange={(e) => setDistEnd(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <input type="number" min="1" step="0.01" placeholder="Amount to Distribute (৳)" value={distAmount} onChange={(e) => setDistAmount(e.target.value)} className="flex-1 rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
            <button type="button" onClick={() => void handlePreviewDistribution()} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium hover:bg-white/10">
              Preview Shares
            </button>
          </div>

          {distPreview && (
            <div className="rounded-xl border border-white/15 bg-[#161616] p-4 space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Period Accounting Profit:</span>
                <span className="font-mono font-semibold">{formatBDT(distPreview.accounting_profit)}</span>
              </div>
              <div className="divide-y divide-white/10">
                {distPreview.allocations.map((a, idx) => (
                  <div key={idx} className="flex justify-between py-2">
                    <span>{a.recipientName} ({bpsToPercent(a.ownershipBps).toFixed(2)}%)</span>
                    <span className="font-mono font-semibold text-emerald-400">{formatBDT(a.allocatedAmount)}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => void handleApproveDistribution()} className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
                Approve &amp; Save Profit Distribution
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Individual Shareholder Profile Modal */}
      <Modal
        open={!!profileTarget}
        onClose={() => setProfileTarget(null)}
        title={profileTarget?.full_name || 'Shareholder Profile'}
        subtitle={profileTarget ? `${profileTarget.email || 'No email'} · ${profileTarget.phone || 'No phone'}` : ''}
      >
        {profileTarget && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-4">
              <Avatar src={profileTarget.avatar_url} name={profileTarget.full_name} size="lg" />
              <div>
                <div className="text-base font-semibold">{profileTarget.full_name}</div>
                <div className="font-mono text-zinc-400">
                  Ownership: {profileTarget.ownership_percent.toFixed(2)}% · Equity: {formatBDT(profileTarget.total_investment)}
                </div>
                {profileTarget.address && <div className="text-zinc-500">{profileTarget.address}</div>}
              </div>
            </div>
            {profileTarget.notes && <p className="text-zinc-400">{profileTarget.notes}</p>}
            <div>
              <h4 className="font-semibold mb-1.5">Investment History</h4>
              {data.investments
                .filter((i) => i.shareholder_id === profileTarget.id)
                .map((i) => (
                  <div key={i.id} className="flex justify-between py-1.5 border-b border-white/10">
                    <span>{i.investment_date} · {i.investment_type.replace(/_/g, ' ')}</span>
                    <span className="font-mono">{formatBDT(i.amount)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </Modal>

      <ImageCropperModal
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        currentImage={shAvatar}
        onSave={(url) => setShAvatar(url)}
        title="Shareholder Photo"
      />
    </div>
  );
};
