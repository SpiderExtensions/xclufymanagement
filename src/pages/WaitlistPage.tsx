import React, { useEffect, useState } from 'react';
import { BellRing, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Customer, ModuleKey, Product, WaitlistEntry } from '../shared/types';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

const WAITLIST_STATUSES: WaitlistEntry['status'][] = [
  'Waiting',
  'Product Available',
  'Contacted',
  'Interested',
  'Converted to Pre-order',
  'Converted to Order',
  'Cancelled',
];

export const WaitlistPage: React.FC<{ onNavigate: (mod: ModuleKey) => void }> = ({ onNavigate }) => {
  const [entries, setEntries] = useState<Array<WaitlistEntry & { current_stock?: number }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [productId, setProductId] = useState('');
  const [variantLabel, setVariantLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [priority, setPriority] = useState<WaitlistEntry['priority']>('Normal');
  const [expectedAvailability, setExpectedAvailability] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [wRes, pRes, cRes] = await Promise.all([
        apiFetch<{ entries: Array<WaitlistEntry & { current_stock?: number }> }>('/api/waitlist'),
        apiFetch<{ products: Product[] }>('/api/products'),
        apiFetch<{ customers: Customer[] }>('/api/customers'),
      ]);
      setEntries(wRes.entries);
      setProducts(pRes.products);
      setCustomers(cRes.customers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => String(c.id) === customerId);
    await apiFetch('/api/waitlist', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: cust ? cust.id : null,
        customer_name: cust ? cust.name : customerName,
        phone: cust ? cust.phone : phone,
        product_id: Number(productId),
        variant_label: variantLabel,
        quantity: Number(quantity || 1),
        priority,
        expected_availability: expectedAvailability,
        notes,
      }),
    });
    setModalOpen(false);
    setCustomerName('');
    setPhone('');
    await loadData();
  };

  const handleStatusChange = async (id: number, status: string) => {
    await apiFetch(`/api/waitlist/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadData();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Waitlist"
        subtitle="Track customer demand for out-of-stock accessories and notify staff automatically when stock returns"
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
          >
            <Plus className="h-4 w-4" />
            Add Waitlist Entry
          </button>
        }
      />

      {loading ? (
        <SkeletonRows rows={4} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-5 w-5" />}
          title="Waitlist is Empty"
          description="When a popular product sells out, add interested customers here to get notified upon restock."
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              Add Customer to Waitlist
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Stock Now</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Convert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {entries.map((w) => (
                <tr key={w.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{w.customer_name}</div>
                    <div className="text-xs font-mono text-zinc-500">{w.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{w.product_name}</div>
                    {w.variant_label && <div className="text-xs text-zinc-500">{w.variant_label}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{w.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={(w.current_stock ?? 0) > 0 ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                      {w.current_stock ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{w.priority}</td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Waitlist status for ${w.customer_name}`}
                      value={w.status}
                      onChange={(e) => void handleStatusChange(w.id, e.target.value)}
                      className="rounded border border-white/15 bg-[#171717] px-2 py-1 text-xs"
                    >
                      {WAITLIST_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          void handleStatusChange(w.id, 'Converted to Pre-order');
                          onNavigate('preorders');
                        }}
                        className="rounded border border-white/15 px-2.5 py-1 hover:bg-white/10"
                      >
                        Pre-order
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleStatusChange(w.id, 'Converted to Order');
                          onNavigate('pos');
                        }}
                        className="rounded bg-white px-2.5 py-1 font-medium text-black"
                      >
                        POS Order
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add to Customer Waitlist">
        <form onSubmit={handleCreate} className="space-y-3">
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
          >
            <option value="">Select Existing Customer (or enter below)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
            ))}
          </select>
          {!customerId && (
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
              <input required placeholder="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            </div>
          )}
          <select
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
          >
            <option value="">Select Product *</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.available_stock} in stock)</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Variant" value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs" />
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs font-mono" />
            <select value={priority} onChange={(e) => setPriority(e.target.value as WaitlistEntry['priority'])} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs">
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
          <input type="date" value={expectedAvailability} onChange={(e) => setExpectedAvailability(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <textarea rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Add to Waitlist
          </button>
        </form>
      </Modal>
    </div>
  );
};
