import React, { useEffect, useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import type { Customer, Preorder, Product, Supplier } from '../shared/types';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

const PREORDER_STATUSES: Preorder['status'][] = [
  'Pending',
  'Advance Received',
  'Ordered',
  'In Transit',
  'Arrived',
  'Customer Notified',
  'Ready for Delivery',
  'Completed',
  'Cancelled',
];

export const PreordersPage: React.FC = () => {
  const [preorders, setPreorders] = useState<Preorder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [variantLabel, setVariantLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [advancePayment, setAdvancePayment] = useState('0');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [prRes, cRes, pRes, sRes] = await Promise.all([
        apiFetch<{ preorders: Preorder[] }>('/api/preorders'),
        apiFetch<{ customers: Customer[] }>('/api/customers'),
        apiFetch<{ products: Product[] }>('/api/products'),
        apiFetch<{ suppliers: Supplier[] }>('/api/suppliers').catch(() => ({ suppliers: [] })),
      ]);
      setPreorders(prRes.preorders);
      setCustomers(cRes.customers);
      setProducts(pRes.products);
      setSuppliers(sRes.suppliers);
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
    const prod = products.find((p) => String(p.id) === productId);

    await apiFetch('/api/preorders', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: cust ? cust.id : null,
        customer_name: cust ? cust.name : customerName,
        customer_phone: cust ? cust.phone : customerPhone,
        product_id: prod ? prod.id : null,
        product_name: prod ? prod.name : productName,
        variant_label: variantLabel,
        quantity: Number(quantity || 1),
        unit_price: Number(unitPrice || prod?.selling_price || 0),
        advance_payment: Number(advancePayment || 0),
        expected_arrival: expectedArrival,
        supplier_id: supplierId ? Number(supplierId) : null,
        notes,
      }),
    });
    setModalOpen(false);
    setCustomerName('');
    setProductName('');
    setAdvancePayment('0');
    await loadData();
  };

  const handleStatusChange = async (id: number, status: string) => {
    await apiFetch(`/api/preorders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadData();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pre-order Management"
        subtitle="Manage customer pre-orders, advance deposits, supplier arrivals, and delivery readiness without deducting physical stock early"
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
          >
            <Plus className="h-4 w-4" />
            New Pre-order
          </button>
        }
      />

      {loading ? (
        <SkeletonRows rows={5} />
      ) : preorders.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="No Pre-orders Yet"
          description="Create pre-orders for upcoming or custom-sourced accessories and track advance deposits accurately."
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              Create Pre-order
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3 font-medium">Pre-order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Advance</th>
                <th className="px-4 py-3 font-medium text-right">Remaining</th>
                <th className="px-4 py-3 font-medium">Arrival</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {preorders.map((pr) => (
                <tr key={pr.id}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{pr.preorder_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{pr.customer_name}</div>
                    <div className="text-xs text-zinc-500">{pr.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{pr.product_name}</div>
                    {pr.variant_label && <div className="text-xs text-zinc-500">{pr.variant_label}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{pr.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatBDT(pr.total_amount)}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">{formatBDT(pr.advance_payment)}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-400">{formatBDT(pr.remaining_payment)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-zinc-400">{pr.expected_arrival || 'TBD'}</td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Status for ${pr.preorder_number}`}
                      value={pr.status}
                      onChange={(e) => void handleStatusChange(pr.id, e.target.value)}
                      className="rounded border border-white/15 bg-[#171717] px-2 py-1 text-xs"
                    >
                      {PREORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Pre-order" maxWidth="max-w-2xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
            >
              <option value="">Enter New / Guest Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
            {!customerId && (
              <input
                required
                placeholder="Customer Full Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
              />
            )}
          </div>
          {!customerId && (
            <input
              placeholder="Customer Phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => String(x.id) === e.target.value);
                if (p) setUnitPrice(String(p.selling_price));
              }}
              className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
            >
              <option value="">Custom / Upcoming Product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
            {!productId && (
              <input
                required
                placeholder="Product Name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
              />
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input placeholder="Variant (Size/Color)" value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs" />
            <input type="number" min="1" required placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs font-mono" />
            <input type="number" min="0" required placeholder="Unit Price (৳)" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs font-mono" />
            <input type="number" min="0" placeholder="Advance Paid (৳)" value={advancePayment} onChange={(e) => setAdvancePayment(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-xs font-mono" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs">
              <span className="text-zinc-400">Expected Arrival Date</span>
              <input type="date" value={expectedArrival} onChange={(e) => setExpectedArrival(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-zinc-400">Supplier (Optional)</span>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm">
                <option value="">No Supplier Assigned</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>

          <textarea rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Save Pre-order
          </button>
        </form>
      </Modal>
    </div>
  );
};
