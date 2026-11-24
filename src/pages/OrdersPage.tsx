import React, { useEffect, useState } from 'react';
import { Printer, Search, ShoppingBag, DollarSign } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import type { BusinessSettings, Order } from '../shared/types';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';
import { ThermalReceiptModal } from '../components/modals/ThermalReceiptModal';

export const OrdersPage: React.FC<{ settings: BusinessSettings | null }> = ({ settings }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [dueOrder, setDueOrder] = useState<Order | null>(null);
  const [dueAmount, setDueAmount] = useState('');
  const [dueMethod, setDueMethod] = useState('bKash');

  const loadOrders = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (statusFilter) qs.set('status', statusFilter);
      const res = await apiFetch<{ orders: Order[] }>(`/api/orders?${qs.toString()}`);
      setOrders(res.orders);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, [statusFilter]);

  const handleStatusChange = async (orderId: number, status: string) => {
    await apiFetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status: status }),
    });
    await loadOrders();
  };

  const handleCollectDue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueOrder) return;
    await apiFetch(`/api/orders/${dueOrder.id}/payment`, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(dueAmount), payment_method: dueMethod }),
    });
    setDueOrder(null);
    setDueAmount('');
    await loadOrders();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Orders"
        subtitle="Track order statuses, collect outstanding customer dues, and reprint 80mm thermal receipts"
      />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadOrders()}
            placeholder="Search order #, customer, phone..."
            className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          aria-label="Filter order status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="processing">Processing</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-5 w-5" />}
          title="No Orders Yet"
          description="Completed POS and customer orders will appear here with payment status and receipt reprinting."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3 font-medium">Order ID</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Paid</th>
                <th className="px-4 py-3 font-medium text-right">Due</th>
                <th className="px-4 py-3 font-medium">Order Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{o.order_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-xs text-zinc-500">{o.customer_phone || 'Guest'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatBDT(o.grand_total)}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatBDT(o.amount_paid)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={o.due_amount > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-500'}>
                      {formatBDT(o.due_amount)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Order status for ${o.order_number}`}
                      value={o.order_status}
                      onChange={(e) => void handleStatusChange(o.id, e.target.value)}
                      className="rounded border border-white/15 bg-[#171717] px-2 py-1 text-xs capitalize"
                    >
                      <option value="pending">pending</option>
                      <option value="confirmed">confirmed</option>
                      <option value="processing">processing</option>
                      <option value="shipped">shipped</option>
                      <option value="delivered">delivered</option>
                      <option value="completed">completed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {o.due_amount > 0 && o.order_status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => {
                            setDueOrder(o);
                            setDueAmount(String(o.due_amount));
                          }}
                          className="inline-flex items-center gap-1 rounded border border-amber-500/30 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/10"
                        >
                          <DollarSign className="h-3 w-3" />
                          Collect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setReceiptOrder(o)}
                        className="inline-flex items-center gap-1 rounded border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10"
                      >
                        <Printer className="h-3 w-3" />
                        Receipt
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!dueOrder} onClose={() => setDueOrder(null)} title={`Collect Due — ${dueOrder?.order_number || ''}`}>
        <form onSubmit={handleCollectDue} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs text-zinc-400">Amount (৳)</label>
            <input
              type="number"
              step="0.01"
              min="1"
              max={dueOrder?.due_amount}
              required
              value={dueAmount}
              onChange={(e) => setDueAmount(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-zinc-400">Payment Method</label>
            <select
              value={dueMethod}
              onChange={(e) => setDueMethod(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
            >
              <option value="Cash">Cash</option>
              <option value="bKash">bKash</option>
              <option value="Nagad">Nagad</option>
              <option value="Rocket">Rocket</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Record Due Payment
          </button>
        </form>
      </Modal>

      <ThermalReceiptModal
        open={!!receiptOrder}
        onClose={() => setReceiptOrder(null)}
        order={receiptOrder}
        settings={settings}
      />
    </div>
  );
};
