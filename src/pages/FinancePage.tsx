import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, Receipt, Wallet } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

interface IncomeRecord {
  id: number;
  category: string;
  amount: number;
  income_date: string;
  payment_method: string;
  description: string;
}

interface PaymentRecord {
  id: number;
  order_number: string | null;
  customer_name: string | null;
  amount: number;
  payment_method: string;
  payment_type: string;
  created_at: string;
}

interface ExpenseRecord {
  id: number;
  category: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  vendor_name: string;
  description: string;
}

interface LedgerRecord {
  id: number;
  entry_type: string;
  direction: 'in' | 'out';
  amount: number;
  category: string;
  payment_method: string;
  reference_id: string;
  description: string;
  entry_date: string;
  created_by_name: string | null;
}

const INCOME_CATEGORIES = ['Product Sales', 'Customer Payments', 'Pre-order Advances', 'Due Collections', 'Other Income'];
const EXPENSE_CATEGORIES = ['Product Purchasing', 'Delivery', 'Packaging', 'Marketing', 'Transportation', 'Software', 'Other Expenses'];

export const FinancePage: React.FC<{ mode: 'income' | 'expenses' | 'transactions' }> = ({ mode }) => {
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [orderPayments, setOrderPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [category, setCategory] = useState(mode === 'income' ? 'Other Income' : 'Delivery');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [vendorName, setVendorName] = useState('');
  const [description, setDescription] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      if (mode === 'income') {
        const res = await apiFetch<{ income_records: IncomeRecord[]; order_payments: PaymentRecord[] }>('/api/income');
        setIncomeRecords(res.income_records);
        setOrderPayments(res.order_payments);
      } else if (mode === 'expenses') {
        const res = await apiFetch<{ expenses: ExpenseRecord[] }>('/api/expenses');
        setExpenses(res.expenses);
      } else {
        const res = await apiFetch<{ transactions: LedgerRecord[] }>('/api/transactions');
        setLedger(res.transactions);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCategory(mode === 'income' ? 'Other Income' : 'Delivery');
    void loadData();
  }, [mode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'income') {
      await apiFetch('/api/income', {
        method: 'POST',
        body: JSON.stringify({
          category,
          amount: Number(amount),
          income_date: date,
          payment_method: paymentMethod,
          description,
        }),
      });
    } else if (mode === 'expenses') {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category,
          amount: Number(amount),
          expense_date: date,
          payment_method: paymentMethod,
          vendor_name: vendorName,
          description,
        }),
      });
    }
    setModalOpen(false);
    setAmount('');
    setDescription('');
    setVendorName('');
    await loadData();
  };

  const title =
    mode === 'income'
      ? 'Income & Cash Collections'
      : mode === 'expenses'
        ? 'Expense Management'
        : 'Financial Transactions Ledger';

  const subtitle =
    mode === 'income'
      ? 'Track product sales collections, due collections, pre-order advances, and operating income (strictly separated from shareholder equity)'
      : mode === 'expenses'
        ? 'Record purchasing, delivery, packaging, marketing, transport, software, and operational expenses'
        : 'Unified immutable double-direction cash ledger across sales, collections, supplier payments, and operating expenses';

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          mode !== 'transactions' ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              <Plus className="h-4 w-4" />
              {mode === 'income' ? 'Record Income' : 'Record Expense'}
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <SkeletonRows rows={5} />
      ) : mode === 'income' ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 space-y-3">
            <h2 className="text-sm font-semibold">Order Payments, Advances &amp; Due Collections ({orderPayments.length})</h2>
            {orderPayments.length === 0 ? (
              <p className="text-xs text-zinc-500">No order payments or advances collected yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-400">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Reference</th>
                      <th className="py-2 pr-3">Method</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {orderPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 pr-3 font-mono text-zinc-400">{new Date(p.created_at).toLocaleString()}</td>
                        <td className="py-2.5 pr-3 capitalize">{p.payment_type.replace(/_/g, ' ')}</td>
                        <td className="py-2.5 pr-3 font-mono">{p.order_number || p.customer_name || '—'}</td>
                        <td className="py-2.5 pr-3">{p.payment_method}</td>
                        <td className="py-2.5 text-right font-mono text-emerald-400 font-semibold">{formatBDT(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 space-y-3">
            <h2 className="text-sm font-semibold">Manual Operating Income Entries ({incomeRecords.length})</h2>
            {incomeRecords.length === 0 ? (
              <p className="text-xs text-zinc-500">No manual operating income entries logged yet.</p>
            ) : (
              <div className="divide-y divide-white/10 text-xs">
                {incomeRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="font-medium">{r.category}</div>
                      <div className="text-zinc-500">{r.income_date} · {r.payment_method} {r.description ? `· ${r.description}` : ''}</div>
                    </div>
                    <div className="font-mono text-emerald-400 font-semibold">{formatBDT(r.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : mode === 'expenses' ? (
        expenses.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No Expenses Recorded"
            description="Log delivery, packaging, marketing, purchasing, and operational expenses to compute accurate Net Profit."
            action={
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
              >
                Record First Expense
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Vendor / Description</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{ex.expense_date}</td>
                    <td className="px-4 py-3 font-medium">{ex.category}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {[ex.vendor_name, ex.description].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">{ex.payment_method}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-400 font-semibold">{formatBDT(ex.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : ledger.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="Financial Ledger Empty"
          description="Every order payment, due collection, supplier payout, and expense automatically posts to this ledger."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium text-right">Cash Flow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{l.entry_date}</td>
                  <td className="px-4 py-3 font-medium">{l.category}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{l.description}</td>
                  <td className="px-4 py-3 text-xs">{l.payment_method}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    <span className={`inline-flex items-center gap-1 ${l.direction === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {l.direction === 'in' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      {l.direction === 'in' ? '+' : '-'}{formatBDT(l.amount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={mode === 'income' ? 'Record Operating Income' : 'Record Expense'}
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs text-zinc-400">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm">
              {(mode === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs text-zinc-400">Amount (৳)</label>
              <input type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm font-mono" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-zinc-400">Date</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-zinc-400">Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm">
              <option value="Cash">Cash</option>
              <option value="bKash">bKash</option>
              <option value="Nagad">Nagad</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
            </select>
          </div>
          {mode === 'expenses' && (
            <input placeholder="Vendor / Payee (Optional)" value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          )}
          <textarea rows={2} placeholder="Description / Reference" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Save Entry
          </button>
        </form>
      </Modal>
    </div>
  );
};
