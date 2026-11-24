import React, { useEffect, useState } from 'react';
import { Users, Plus, Search, Eye, Edit2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import type { Customer, ModuleKey, Order, Preorder, WaitlistEntry } from '../shared/types';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

interface CustomerDetail {
  customer: Customer;
  orders: Order[];
  preorders: Preorder[];
  waitlists: WaitlistEntry[];
}

export const CustomersPage: React.FC<{ onNavigate: (mod: ModuleKey) => void }> = ({ onNavigate }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [division, setDivision] = useState('');
  const [district, setDistrict] = useState('');
  const [upazila, setUpazila] = useState('');
  const [notes, setNotes] = useState('');

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ customers: Customer[] }>(
        `/api/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`
      );
      setCustomers(res.customers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDivision('');
    setDistrict('');
    setUpazila('');
    setNotes('');
    setFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
    setAddress(c.address);
    setDivision(c.division);
    setDistrict(c.district);
    setUpazila(c.upazila);
    setNotes(c.notes);
    setFormOpen(true);
  };

  const openDetail = async (id: number) => {
    const res = await apiFetch<CustomerDetail>(`/api/customers/${id}`);
    setDetail(res);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, phone, email, address, division, district, upazila, notes };
    if (editing) {
      await apiFetch(`/api/customers/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
    }
    setFormOpen(false);
    await loadCustomers();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers CRM"
        subtitle="Manage customer profiles across Bangladesh divisions, purchase histories, outstanding dues, pre-orders, and waitlists"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </button>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void loadCustomers()}
          placeholder="Search customer name, phone, email..."
          className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : customers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No Customers Recorded"
          description="Create customer profiles here or directly inside POS checkout."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              Add First Customer
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium text-right">Orders</th>
                <th className="px-4 py-3 font-medium text-right">Total Spent</th>
                <th className="px-4 py-3 font-medium text-right">Outstanding Due</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-zinc-500 font-mono">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {[c.upazila, c.district, c.division].filter(Boolean).join(', ') || c.address || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{c.total_orders ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBDT(c.total_spent ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={(c.outstanding_due ?? 0) > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-500'}>
                      {formatBDT(c.outstanding_due ?? 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`View ${c.name}`}
                        onClick={() => void openDetail(c.id)}
                        className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Customer' : 'New Customer'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            <input required placeholder="Phone (+880...)" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          </div>
          <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <input placeholder="Street / House / Road Address" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Division" value={division} onChange={(e) => setDivision(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs" />
            <input placeholder="District" value={district} onChange={(e) => setDistrict(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs" />
            <input placeholder="Upazila / Thana" value={upazila} onChange={(e) => setUpazila(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs" />
          </div>
          <textarea rows={2} placeholder="Customer Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Save Customer
          </button>
        </form>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.customer.name || 'Customer Profile'}
        subtitle={detail ? `${detail.customer.phone} · ${detail.customer.address || 'No address'}` : ''}
        maxWidth="max-w-2xl"
      >
        {detail && (
          <div className="space-y-4 text-xs">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setDetail(null);
                  onNavigate('pos');
                }}
                className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-black"
              >
                Create Order in POS
              </button>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Orders ({detail.orders.length})</h4>
              {detail.orders.length === 0 ? (
                <p className="text-zinc-500">No orders yet.</p>
              ) : (
                <div className="divide-y divide-white/10 border border-white/10 rounded-lg">
                  {detail.orders.map((o) => (
                    <div key={o.id} className="flex justify-between p-2.5 font-mono">
                      <span>{o.order_number} · {o.order_status}</span>
                      <span>{formatBDT(o.grand_total)} (Due: {formatBDT(o.due_amount)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="font-semibold mb-2">Pre-orders ({detail.preorders.length}) &amp; Waitlist ({detail.waitlists.length})</h4>
              <p className="text-zinc-400">
                Pre-orders: {detail.preorders.length} · Waitlist entries: {detail.waitlists.length}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
