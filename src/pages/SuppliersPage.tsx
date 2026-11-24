import React, { useEffect, useState } from 'react';
import { Truck, Plus, ShoppingCart, DollarSign } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import type { Product, Supplier } from '../shared/types';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

interface PurchaseOrderRow {
  id: number;
  po_number: string;
  supplier_name: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  created_at: string;
}

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [supModal, setSupModal] = useState(false);
  const [poModal, setPoModal] = useState(false);
  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // PO form
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poProductId, setPoProductId] = useState('');
  const [poQty, setPoQty] = useState('10');
  const [poCost, setPoCost] = useState('');
  const [poPaid, setPoPaid] = useState('0');
  const [poReceiveNow, setPoReceiveNow] = useState(true);

  // Payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        apiFetch<{ suppliers: Supplier[]; purchase_orders: PurchaseOrderRow[] }>('/api/suppliers'),
        apiFetch<{ products: Product[] }>('/api/products'),
      ]);
      setSuppliers(sRes.suppliers);
      setPurchaseOrders(sRes.purchase_orders);
      setProducts(pRes.products);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name, contact_person: contactPerson, phone, email, address, notes }),
    });
    setSupModal(false);
    setName('');
    setContactPerson('');
    setPhone('');
    await loadData();
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        supplier_id: Number(poSupplierId),
        items: [{ product_id: Number(poProductId), quantity: Number(poQty), unit_cost: Number(poCost) }],
        amount_paid: Number(poPaid || 0),
        receive_now: poReceiveNow,
      }),
    });
    setPoModal(false);
    await loadData();
  };

  const handlePaySupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySupplier) return;
    await apiFetch(`/api/suppliers/${paySupplier.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(payAmount), payment_method: payMethod }),
    });
    setPaySupplier(null);
    setPayAmount('');
    await loadData();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Management"
        subtitle="Manage vendors, purchase orders, stock receiving, and outstanding supplier payables"
        actions={
          <>
            <button
              type="button"
              onClick={() => setPoModal(true)}
              disabled={suppliers.length === 0 || products.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium disabled:opacity-40"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              New Purchase Order
            </button>
            <button
              type="button"
              onClick={() => setSupModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              <Plus className="h-4 w-4" />
              Add Supplier
            </button>
          </>
        }
      />

      {loading ? (
        <SkeletonRows rows={4} />
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title="No Suppliers Added"
          description="Add your fashion wholesalers and manufacturers to track purchase orders and supplier balances."
          action={
            <button
              type="button"
              onClick={() => setSupModal(true)}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              Add First Supplier
            </button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium text-right">Total Purchased</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-zinc-500">{s.address || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{s.contact_person || '—'}</div>
                      <div className="font-mono text-zinc-500">{s.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatBDT(s.total_purchased ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatBDT(s.total_paid ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={(s.outstanding_balance ?? 0) > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-500'}>
                        {formatBDT(s.outstanding_balance ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setPaySupplier(s);
                          setPayAmount(String(s.outstanding_balance || ''));
                        }}
                        className="inline-flex items-center gap-1 rounded border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10"
                      >
                        <DollarSign className="h-3 w-3" />
                        Pay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {purchaseOrders.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#121212] p-5 space-y-3">
              <h2 className="text-sm font-semibold">Purchase Order History</h2>
              <div className="divide-y divide-white/10 text-xs">
                {purchaseOrders.map((po) => (
                  <div key={po.id} className="flex flex-wrap items-center justify-between py-2.5 gap-2">
                    <div>
                      <span className="font-mono font-semibold">{po.po_number}</span>
                      <span className="mx-2 text-zinc-500">·</span>
                      <span>{po.supplier_name}</span>
                      <span className="mx-2 text-zinc-500">·</span>
                      <span className="capitalize text-zinc-400">{po.status}</span>
                    </div>
                    <div className="font-mono">
                      Total: {formatBDT(po.total_amount)} · Paid: {formatBDT(po.amount_paid)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={supModal} onClose={() => setSupModal(false)} title="Add Supplier">
        <form onSubmit={handleCreateSupplier} className="space-y-3">
          <input required placeholder="Supplier / Company Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          </div>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <textarea rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Save Supplier
          </button>
        </form>
      </Modal>

      <Modal open={poModal} onClose={() => setPoModal(false)} title="Create Purchase Order">
        <form onSubmit={handleCreatePO} className="space-y-3">
          <select required value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm">
            <option value="">Select Supplier *</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            required
            value={poProductId}
            onChange={(e) => {
              setPoProductId(e.target.value);
              const p = products.find((x) => String(x.id) === e.target.value);
              if (p) setPoCost(String(p.purchase_price));
            }}
            className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
          >
            <option value="">Select Product *</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min="1" required placeholder="Qty" value={poQty} onChange={(e) => setPoQty(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
            <input type="number" min="0" required placeholder="Unit Cost" value={poCost} onChange={(e) => setPoCost(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
            <input type="number" min="0" placeholder="Paid Now" value={poPaid} onChange={(e) => setPoPaid(e.target.value)} className="rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={poReceiveNow} onChange={(e) => setPoReceiveNow(e.target.checked)} className="h-4 w-4 accent-white" />
            <span>Receive units immediately into available inventory</span>
          </label>
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Submit Purchase Order
          </button>
        </form>
      </Modal>

      <Modal open={!!paySupplier} onClose={() => setPaySupplier(null)} title={`Pay Supplier — ${paySupplier?.name || ''}`}>
        <form onSubmit={handlePaySupplier} className="space-y-3">
          <input type="number" min="1" step="0.01" required placeholder="Payment Amount (৳)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm">
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Cash">Cash</option>
            <option value="bKash">bKash</option>
            <option value="Nagad">Nagad</option>
          </select>
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Confirm Supplier Payment
          </button>
        </form>
      </Modal>
    </div>
  );
};
