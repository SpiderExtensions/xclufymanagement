import React, { useEffect, useState } from 'react';
import { Boxes, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Product } from '../shared/types';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

interface InventoryTx {
  id: number;
  product_name: string;
  product_sku: string;
  change_type: string;
  quantity_delta: number;
  previous_stock: number;
  new_stock: number;
  notes: string;
  user_name: string | null;
  created_at: string;
}

export const InventoryPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');

  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [changeType, setChangeType] = useState<'receive' | 'adjustment' | 'damaged' | 'return' | 'reserve' | 'release_reserve'>('receive');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ products: Product[]; transactions: InventoryTx[] }>('/api/inventory');
      setProducts(res.products);
      setTransactions(res.transactions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInventory();
  }, []);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setError('');
    try {
      await apiFetch('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          product_id: adjustTarget.id,
          change_type: changeType,
          quantity: Number(quantity),
          notes,
        }),
      });
      setAdjustTarget(null);
      setQuantity('1');
      setNotes('');
      await loadInventory();
    } catch (err: unknown) {
      setError((err as Error).message || 'Stock adjustment failed.');
    }
  };

  const totals = products.reduce(
    (acc, p) => ({
      available: acc.available + p.available_stock,
      reserved: acc.reserved + p.reserved_stock,
      sold: acc.sold + p.sold_stock,
      damaged: acc.damaged + p.damaged_stock,
      returned: acc.returned + p.returned_stock,
      low: acc.low + (p.available_stock > 0 && p.available_stock <= p.min_stock ? 1 : 0),
      out: acc.out + (p.available_stock <= 0 ? 1 : 0),
    }),
    { available: 0, reserved: 0, sold: 0, damaged: 0, returned: 0, low: 0, out: 0 }
  );

  const visible = products.filter((p) => {
    if (filter === 'low') return p.available_stock > 0 && p.available_stock <= p.min_stock;
    if (filter === 'out') return p.available_stock <= 0;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        subtitle="Track available, reserved, sold, damaged, returned stock, and low-stock alerts with full audit history"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Available Units', val: totals.available },
          { label: 'Reserved Units', val: totals.reserved },
          { label: 'Total Sold', val: totals.sold },
          { label: 'Damaged', val: totals.damaged },
          { label: 'Returned', val: totals.returned },
          { label: 'Low / Out SKUs', val: `${totals.low} / ${totals.out}` },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-4">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{card.label}</div>
            <div className="mt-1 font-mono text-xl font-semibold">{card.val}</div>
          </div>
        ))}
      </div>

      <div className="inline-flex rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#101010] p-1">
        {[
          { k: 'all', label: `All (${products.length})` },
          { k: 'low', label: `Low Stock (${totals.low})` },
          { k: 'out', label: `Out of Stock (${totals.out})` },
        ].map((tab) => (
          <button
            key={tab.k}
            type="button"
            onClick={() => setFilter(tab.k as typeof filter)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              filter === tab.k ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-5 w-5" />}
          title="No Matching Inventory Items"
          description="Products added to your catalog appear here for stock receiving, damage tracking, and returns."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Available</th>
                <th className="px-4 py-3 font-medium text-right">Reserved</th>
                <th className="px-4 py-3 font-medium text-right">Sold</th>
                <th className="px-4 py-3 font-medium text-right">Damaged</th>
                <th className="px-4 py-3 font-medium text-right">Returned</th>
                <th className="px-4 py-3 font-medium text-right">Min Alert</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visible.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs font-mono text-zinc-500">{p.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    <span className={p.available_stock <= 0 ? 'text-red-400' : p.available_stock <= p.min_stock ? 'text-amber-400' : ''}>
                      {p.available_stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">{p.reserved_stock}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">{p.sold_stock}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">{p.damaged_stock}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-400">{p.returned_stock}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-500">{p.min_stock}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustTarget(p);
                        setError('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Movement Log */}
      {transactions.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 space-y-3">
          <h2 className="text-sm font-semibold">Recent Stock Movements</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Delta</th>
                  <th className="py-2 pr-3 text-right">Stock</th>
                  <th className="py-2 pr-3">Notes</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transactions.slice(0, 25).map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2 pr-3 font-mono text-zinc-500">{new Date(tx.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3 font-medium">{tx.product_name}</td>
                    <td className="py-2 pr-3 capitalize text-zinc-400">{tx.change_type.replace(/_/g, ' ')}</td>
                    <td className={`py-2 pr-3 text-right font-mono ${tx.quantity_delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {tx.quantity_delta > 0 ? `+${tx.quantity_delta}` : tx.quantity_delta}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{tx.previous_stock} → {tx.new_stock}</td>
                    <td className="py-2 pr-3 text-zinc-400">{tx.notes || '—'}</td>
                    <td className="py-2 text-zinc-400">{tx.user_name || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={`Adjust Stock — ${adjustTarget?.name || ''}`}
        subtitle={`Current available stock: ${adjustTarget?.available_stock ?? 0}`}
      >
        <form onSubmit={handleAdjust} className="space-y-4">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">{error}</div>}
          <div className="space-y-1">
            <label htmlFor="adj-type" className="block text-xs font-medium text-zinc-400">Adjustment Type</label>
            <select
              id="adj-type"
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as typeof changeType)}
              className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
            >
              <option value="receive">Receive Stock (+)</option>
              <option value="return">Customer Return (+)</option>
              <option value="damaged">Damaged / Write-off (-)</option>
              <option value="reserve">Reserve Stock (-)</option>
              <option value="release_reserve">Release Reserved (+)</option>
              <option value="adjustment">Manual Adjustment (+/-)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="adj-qty" className="block text-xs font-medium text-zinc-400">Quantity</label>
            <input
              id="adj-qty"
              type="number"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="adj-notes" className="block text-xs font-medium text-zinc-400">Reason / Notes</label>
            <input
              id="adj-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Restock shipment #22"
              className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdjustTarget(null)} className="rounded-lg border border-white/15 px-4 py-2 text-xs">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black">
              Apply Adjustment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
