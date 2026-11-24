import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { BarChart3, Download, Printer } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { EmptyState, PageHeader, SkeletonRows } from '../components/ui/Primitives';

const REPORT_TYPES = [
  { key: 'profit_loss', label: 'Profit & Loss' },
  { key: 'daily_sales', label: 'Daily Sales' },
  { key: 'weekly_sales', label: 'Weekly Sales' },
  { key: 'monthly_sales', label: 'Monthly Sales' },
  { key: 'yearly_sales', label: 'Yearly Sales' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'inventory', label: 'Inventory Valuation' },
  { key: 'best_selling', label: 'Best-Selling Products' },
  { key: 'customer_purchases', label: 'Customer Purchases' },
  { key: 'preorders', label: 'Pre-orders' },
  { key: 'waitlists', label: 'Waitlists' },
  { key: 'outstanding_dues', label: 'Outstanding Dues' },
  { key: 'cash_flow', label: 'Cash Flow' },
  { key: 'shareholder_investments', label: 'Shareholder Investments (Admin)', adminOnly: true },
  { key: 'ownership_distribution', label: 'Ownership Distribution (Admin)', adminOnly: true },
  { key: 'profit_distribution', label: 'Profit Distribution (Admin)', adminOnly: true },
];

export const ReportsPage: React.FC<{ isSuperAdmin: boolean }> = ({ isSuperAdmin }) => {
  const [reportType, setReportType] = useState('profit_loss');
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ rows: Array<Record<string, unknown>> }>(
        `/api/reports?type=${encodeURIComponent(reportType)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      setRows(res.rows);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load report.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, [reportType, from, to]);

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    const csv = Papa.unparse(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xclufy-${reportType}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports & Analytics"
        subtitle="Generate real-time sales, profit & loss, inventory, dues, cash flow, and equity reports with CSV & PDF print export"
        actions={
          <>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 no-print">
        <select
          aria-label="Report type"
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm"
        >
          {REPORT_TYPES.filter((r) => !r.adminOnly || isSuperAdmin).map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm" />
        <span className="text-xs text-zinc-500">to</span>
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm" />
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-300">{error}</div>}

      {loading ? (
        <SkeletonRows rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No Records for Selected Report"
          description="Try widening the date range or recording transactions in the selected category."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400">
                {columns.map((col) => (
                  <th key={col} className="px-4 py-3 font-medium capitalize">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((col) => {
                    const val = r[col];
                    const isNum = typeof val === 'number';
                    return (
                      <td key={col} className={`px-4 py-2.5 ${isNum ? 'font-mono' : ''}`}>
                        {val === null || val === undefined ? '—' : isNum ? val.toLocaleString() : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
