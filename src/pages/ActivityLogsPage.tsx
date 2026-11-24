import React, { useEffect, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AuditLog } from '../shared/types';
import { Avatar, EmptyState, PageHeader, SkeletonRows } from '../components/ui/Primitives';

interface AuditLogRow extends AuditLog {
  user_avatar?: string | null;
}

interface SecurityEventRow {
  id: number;
  user_id: number | null;
  user_name?: string | null;
  event_type: string;
  ip_address: string;
  user_agent: string;
  details: string;
  created_at: string;
}

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'order', label: 'Orders' },
  { value: 'product', label: 'Products' },
  { value: 'category', label: 'Categories' },
  { value: 'customer', label: 'Customers' },
  { value: 'preorder', label: 'Pre-orders' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'shareholder', label: 'Shareholders' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
  { value: 'supplier', label: 'Suppliers' },
  { value: 'profile', label: 'Users & Auth' },
  { value: 'business_settings', label: 'Settings' },
];

function prettyJson(raw: string | null): string {
  if (!raw) return '—';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export const ActivityLogsPage: React.FC = () => {
  const [tab, setTab] = useState<'audit' | 'security'>('audit');
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEventRow[]>([]);
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '150' });
      if (entityType) params.set('entity_type', entityType);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch<{ logs: AuditLogRow[]; security_events: SecurityEventRow[] }>(
        `/api/activity-logs?${params.toString()}`
      );
      setLogs(res.logs);
      setSecurityEvents(res.security_events);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, [entityType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadLogs();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Logs & Security Events"
        subtitle="Immutable system audit trail tracking operational changes, stock adjustments, and authentication events."
        actions={
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#111111] p-1">
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              tab === 'audit'
                ? 'bg-white dark:bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Audit Trail ({logs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('security')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              tab === 'security'
                ? 'bg-white dark:bg-white text-zinc-950 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Security Events ({securityEvents.length})</span>
          </button>
        </div>

        {tab === 'audit' && (
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by entity type"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search action, actor, ID..."
                aria-label="Search audit logs"
                className="w-56 rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] pl-8 pr-3 py-2 text-xs text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 dark:bg-white px-3.5 py-2 text-xs font-medium text-white dark:text-[#080808] hover:opacity-90"
            >
              Filter
            </button>
          </form>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={7} />
      ) : tab === 'audit' ? (
        logs.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="No matching audit records"
            description="System actions, orders, inventory updates, and shareholder changes appear here automatically."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#151515] text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-white/8">
                  {logs.map((log) => {
                    const isOpen = expandedId === log.id;
                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            {log.created_at}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar src={log.user_avatar} name={log.user_name || 'System'} size="sm" />
                              <span className="text-xs font-medium text-zinc-900 dark:text-white">
                                {log.user_name || 'System'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {log.action}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                            {log.entity_type} · #{log.entity_id || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {(log.previous_values || log.new_values) && (
                              <button
                                type="button"
                                onClick={() => setExpandedId(isOpen ? null : log.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 dark:border-white/15 px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
                              >
                                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                <span>{isOpen ? 'Hide Diff' : 'View Diff'}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-zinc-50 dark:bg-[#0B0B0B]">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                                    Previous Values
                                  </p>
                                  <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141414] p-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                                    {prettyJson(log.previous_values)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                                    New Values
                                  </p>
                                  <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#141414] p-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                                    {prettyJson(log.new_values)}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : securityEvents.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="No security events logged yet"
          description="Sign-ins, passkey enrollments, failed login attempts, and session revocations are recorded here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#151515] text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">IP Address</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-white/8">
                {securityEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {ev.created_at}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-zinc-900 dark:text-white">
                      {ev.event_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300">
                      {ev.user_name || (ev.user_id ? `User #${ev.user_id}` : 'Unauthenticated')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {ev.ip_address || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                      {ev.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
