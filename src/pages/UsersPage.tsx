import React, { useEffect, useState } from 'react';
import { UserCog, Check, X, ShieldAlert, KeyRound } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ModuleKey, UserProfile, UserRole } from '../shared/types';
import { Avatar, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

const ROLES: UserRole[] = [
  'admin',
  'manager',
  'sales_staff',
  'inventory_manager',
  'accountant',
  'shareholder_viewer',
];

const MODULE_LABELS: Array<{ key: ModuleKey; label: string }> = [
  { key: 'dashboard', label: 'Overview Dashboard' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'pos', label: 'POS' },
  { key: 'orders', label: 'Orders' },
  { key: 'customers', label: 'Customers' },
  { key: 'preorders', label: 'Pre-orders' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'reports', label: 'Reports' },
  { key: 'barcodes', label: 'Barcodes' },
  { key: 'import_export', label: 'CSV Import / Export' },
  { key: 'users', label: 'User Management' },
  { key: 'activity_logs', label: 'Activity Logs' },
  { key: 'settings', label: 'Settings' },
];

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [permUser, setPermUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('sales_staff');
  const [editPerms, setEditPerms] = useState<ModuleKey[]>([]);
  const [approveTarget, setApproveTarget] = useState<UserProfile | null>(null);
  const [approveRole, setApproveRole] = useState<UserRole>('sales_staff');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ users: UserProfile[] }>('/api/users');
      setUsers(res.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveTarget) return;
    await apiFetch(`/api/users/${approveTarget.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ role: approveRole }),
    });
    setApproveTarget(null);
    await loadUsers();
  };

  const handleStatus = async (id: number, status: 'rejected' | 'suspended' | 'approved') => {
    await apiFetch(`/api/users/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await loadUsers();
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permUser) return;
    await apiFetch(`/api/users/${permUser.id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ role: editRole, permissions: editPerms }),
    });
    setPermUser(null);
    await loadUsers();
  };

  const handleRevokeSessions = async (id: number) => {
    await apiFetch(`/api/users/${id}/revoke-sessions`, { method: 'POST' });
    await loadUsers();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management & Permissions"
        subtitle="Approve pending registrations, assign enterprise roles, customize module access, and revoke sessions"
      />

      {loading ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Biometric</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={u.avatar_url} name={u.full_name} size="sm" />
                      <div>
                        <div className="font-medium">{u.full_name}</div>
                        <div className="text-xs text-zinc-500">{u.email} · {u.phone || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize font-mono">{u.role.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-xs capitalize">
                    <span
                      className={
                        u.approval_status === 'approved'
                          ? 'text-emerald-400'
                          : u.approval_status === 'pending'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }
                    >
                      {u.approval_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                    {u.biometric_enabled ? `${u.passkey_count} passkey(s)` : 'Disabled'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role === 'super_admin' ? (
                      <span className="text-xs font-mono text-zinc-500">Main Admin</span>
                    ) : (
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5 text-xs">
                        {u.approval_status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setApproveTarget(u);
                                setApproveRole('sales_staff');
                              }}
                              className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 font-semibold text-black"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStatus(u.id, 'rejected')}
                              className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2.5 py-1 text-red-300"
                            >
                              <X className="h-3 w-3" />
                              Reject
                            </button>
                          </>
                        )}
                        {u.approval_status === 'approved' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setPermUser(u);
                                setEditRole(u.role);
                                setEditPerms(u.permissions);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-white/15 px-2.5 py-1 hover:bg-white/10"
                            >
                              <UserCog className="h-3 w-3" />
                              Access
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRevokeSessions(u.id)}
                              className="inline-flex items-center gap-1 rounded border border-white/15 px-2.5 py-1 hover:bg-white/10"
                            >
                              <KeyRound className="h-3 w-3" />
                              Revoke
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStatus(u.id, 'suspended')}
                              className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2.5 py-1 text-red-300"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              Suspend
                            </button>
                          </>
                        )}
                        {(u.approval_status === 'suspended' || u.approval_status === 'rejected') && (
                          <button
                            type="button"
                            onClick={() => void handleStatus(u.id, 'approved')}
                            className="rounded border border-white/15 px-2.5 py-1 hover:bg-white/10"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!approveTarget} onClose={() => setApproveTarget(null)} title={`Approve ${approveTarget?.full_name || ''}`}>
        <form onSubmit={handleApprove} className="space-y-4">
          <label className="block space-y-1 text-xs">
            <span className="text-zinc-400">Assign Initial Role</span>
            <select value={approveRole} onChange={(e) => setApproveRole(e.target.value as UserRole)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm capitalize">
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Approve &amp; Grant Access
          </button>
        </form>
      </Modal>

      <Modal open={!!permUser} onClose={() => setPermUser(null)} title={`Permissions — ${permUser?.full_name || ''}`} maxWidth="max-w-xl">
        <form onSubmit={handleSavePermissions} className="space-y-4">
          <label className="block space-y-1 text-xs">
            <span className="text-zinc-400">Role</span>
            <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm capitalize">
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {MODULE_LABELS.map((m) => (
              <label key={m.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPerms.includes(m.key)}
                  onChange={(e) =>
                    setEditPerms((prev) =>
                      e.target.checked ? [...prev, m.key] : prev.filter((x) => x !== m.key)
                    )
                  }
                  className="h-4 w-4 accent-white"
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>

          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Save Permissions
          </button>
        </form>
      </Modal>
    </div>
  );
};
