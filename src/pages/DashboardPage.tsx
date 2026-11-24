import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Wallet,
  ShoppingBag,
  Users,
  Package,
  AlertTriangle,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import type { ModuleKey } from '../shared/types';
import { AnimatedNumber, EmptyState, PageHeader, SkeletonRows } from '../components/ui/Primitives';

interface DashboardData {
  range: { range: string; start: string; end: string };
  summary: {
    totalRevenue: number;
    actualMoneyReceived: number;
    totalExpenses: number;
    cogs: number;
    grossProfit: number;
    netProfit: number;
    availableBalance: number;
    outstandingReceivables: number;
    totalBusinessEquity?: number;
  };
  counts: {
    total_orders: number;
    total_customers: number;
    total_products: number;
    inventory_value: number;
    low_stock_count: number;
    total_shareholders?: number;
  };
  can_see_shareholders: boolean;
  charts: {
    sales_series: Array<{ day: string; revenue: number; orders: number }>;
    expense_series: Array<{ day: string; expense: number }>;
    best_selling: Array<{ product_name: string; units_sold: number; revenue: number }>;
    sales_by_category: Array<{ category: string; revenue: number; units: number }>;
    order_status: Array<{ status: string; count: number }>;
  };
}

const RANGES = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'prev_month', label: 'Prev Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

export const DashboardPage: React.FC<{
  onNavigate: (mod: ModuleKey) => void;
}> = ({ onNavigate }) => {
  const [range, setRange] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ range });
      if (range === 'custom' && customFrom && customTo) {
        qs.set('from', customFrom);
        qs.set('to', customTo);
      }
      const res = await apiFetch<DashboardData>(`/api/dashboard?${qs.toString()}`);
      setData(res);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo)) return;
    void loadDashboard();
  }, [range, customFrom, customTo]);

  const maxChartRev = Math.max(
    1,
    ...(data?.charts.sales_series.map((s) => s.revenue) || [1]),
    ...(data?.charts.expense_series.map((e) => e.expense) || [1])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview Dashboard"
        subtitle="Real-time financial position, sales velocity, inventory valuation, and operational metrics"
        actions={
          <>
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              New POS Order
            </button>
            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-white/10 whitespace-nowrap shrink-0"
            >
              <Package className="h-3.5 w-3.5" />
              Products
            </button>
          </>
        }
      />

      {/* Period Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#101010] p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                range === r.key
                  ? 'bg-white text-black shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Start date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs"
            />
            <span className="text-xs text-zinc-500">to</span>
            <input
              type="date"
              aria-label="End date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#141414] px-2.5 py-1.5 text-xs"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {loading || !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          {/* Primary Financial KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Total Revenue</span>
                <TrendingUp className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">
                <AnimatedNumber value={data.summary.totalRevenue} formatter={(v) => formatBDT(v)} />
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Gross Profit: <span className="font-mono text-zinc-900 dark:text-zinc-200">{formatBDT(data.summary.grossProfit)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Actual Money Received</span>
                <Wallet className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">
                <AnimatedNumber value={data.summary.actualMoneyReceived} formatter={(v) => formatBDT(v)} />
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Receivables Due: <span className="font-mono text-amber-500">{formatBDT(data.summary.outstandingReceivables)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Net Profit</span>
                <ArrowUpRight className="h-4 w-4 text-zinc-400" />
              </div>
              <div
                className={`mt-2 font-mono text-2xl font-semibold tracking-tight ${
                  data.summary.netProfit >= 0 ? 'text-emerald-500' : 'text-red-400'
                }`}
              >
                <AnimatedNumber value={data.summary.netProfit} formatter={(v) => formatBDT(v)} />
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Operating Expenses: <span className="font-mono text-zinc-900 dark:text-zinc-200">{formatBDT(data.summary.totalExpenses)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Available Business Balance</span>
                <Wallet className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-tight">
                <AnimatedNumber value={data.summary.availableBalance} formatter={(v) => formatBDT(v)} />
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                COGS: <span className="font-mono text-zinc-900 dark:text-zinc-200">{formatBDT(data.summary.cogs)}</span>
              </p>
            </div>
          </div>

          {/* Secondary Operational Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="text-left rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#101010] p-4 hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Total Orders</span>
              <div className="mt-1.5 font-mono text-xl font-semibold">{data.counts.total_orders}</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('customers')}
              className="text-left rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#101010] p-4 hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Total Customers</span>
              <div className="mt-1.5 font-mono text-xl font-semibold">{data.counts.total_customers}</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="text-left rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#101010] p-4 hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Total Products</span>
              <div className="mt-1.5 font-mono text-xl font-semibold">{data.counts.total_products}</div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-left rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#101010] p-4 hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
            >
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Inventory Value</span>
              <div className="mt-1.5 font-mono text-xl font-semibold">{formatBDT(data.counts.inventory_value)}</div>
            </button>

            {data.can_see_shareholders && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('shareholders')}
                  className="text-left rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#101010] p-4 hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
                >
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Total Business Equity</span>
                  <div className="mt-1.5 font-mono text-xl font-semibold">
                    {formatBDT(data.summary.totalBusinessEquity || 0)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('shareholders')}
                  className="text-left rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#101010] p-4 hover:border-zinc-400 dark:hover:border-white/25 transition-colors"
                >
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Shareholders</span>
                  <div className="mt-1.5 font-mono text-xl font-semibold">{data.counts.total_shareholders || 0}</div>
                </button>
              </>
            )}
          </div>

          {data.counts.low_stock_count > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-3.5 text-sm">
              <div className="flex items-center gap-3 text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {data.counts.low_stock_count} product(s) are currently at or below minimum stock thresholds.
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="text-xs font-medium text-white underline underline-offset-4 shrink-0"
              >
                Inspect Inventory
              </button>
            </div>
          )}

          {/* Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Bar Chart */}
            <div className="lg:col-span-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">Sales Revenue Timeline</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Daily recognized sales from confirmed orders</p>
                </div>
                <span className="text-xs font-mono text-zinc-400">BDT (৳)</span>
              </div>

              {data.charts.sales_series.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBag className="h-5 w-5" />}
                  title="No Sales Recorded Yet"
                  description="Complete your first POS or manual order to visualize daily revenue and profit trends."
                  action={
                    <button
                      type="button"
                      onClick={() => onNavigate('pos')}
                      className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
                    >
                      Open POS
                    </button>
                  }
                />
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="flex items-end gap-2 h-48 border-b border-zinc-200 dark:border-white/10 pb-2">
                    {data.charts.sales_series.map((pt) => {
                      const heightPct = Math.max(6, Math.round((pt.revenue / maxChartRev) * 100));
                      return (
                        <div key={pt.day} className="flex-1 flex flex-col items-center justify-end h-full group min-w-[18px]">
                          <div className="text-[10px] font-mono text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                            {formatBDT(pt.revenue)}
                          </div>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full max-w-[36px] rounded-t-md bg-zinc-900 dark:bg-white/90 group-hover:bg-zinc-700 dark:group-hover:bg-white transition-all"
                            title={`${pt.day}: ${formatBDT(pt.revenue)} (${pt.orders} orders)`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                    <span>{data.charts.sales_series[0]?.day}</span>
                    <span>{data.charts.sales_series[data.charts.sales_series.length - 1]?.day}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Best Selling & Categories */}
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-6">
              <div>
                <h2 className="text-base font-semibold">Best-Selling Products</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Ranked by units sold</p>
                {data.charts.best_selling.length === 0 ? (
                  <p className="mt-4 text-xs text-zinc-500">No product sales yet in this period.</p>
                ) : (
                  <div className="mt-4 divide-y divide-zinc-200 dark:divide-white/10">
                    {data.charts.best_selling.map((item) => (
                      <div key={item.product_name} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="min-w-0 pr-3">
                          <div className="truncate font-medium">{item.product_name}</div>
                          <div className="text-xs text-zinc-500 font-mono">{item.units_sold} sold</div>
                        </div>
                        <div className="font-mono text-sm font-medium shrink-0">{formatBDT(item.revenue)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-200 dark:border-white/10 pt-5">
                <h3 className="text-sm font-semibold">Sales by Category</h3>
                {data.charts.sales_by_category.length === 0 ? (
                  <p className="mt-3 text-xs text-zinc-500">No category revenue recorded yet.</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {data.charts.sales_by_category.map((cat) => (
                      <div key={cat.category} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-600 dark:text-zinc-300">{cat.category} · {cat.units} pcs</span>
                        <span className="font-mono font-medium">{formatBDT(cat.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Order Status Breakdown */}
          {data.charts.order_status.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-zinc-400" />
                  <span>Order Status Distribution</span>
                </div>
                <div className="flex flex-wrap items-center gap-6 text-xs">
                  {data.charts.order_status.map((st) => (
                    <div key={st.status} className="flex items-center gap-2">
                      <span className="capitalize text-zinc-500 dark:text-zinc-400">{st.status}:</span>
                      <span className="font-mono font-semibold">{st.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
