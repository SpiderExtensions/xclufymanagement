import React, { useEffect, useRef, useState } from 'react';
import {
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  UserPlus,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { calculateOrderTotals, formatBDT } from '../shared/erpMath';
import type { BusinessSettings, Category, Customer, Order, PaymentMethod, Product, ProductVariant } from '../shared/types';
import { EmptyState, Modal, PageHeader } from '../components/ui/Primitives';
import { BarcodeScannerModal } from '../components/modals/BarcodeScannerModal';
import { ThermalReceiptModal } from '../components/modals/ThermalReceiptModal';

interface CartLine {
  key: string;
  productId: number;
  variantId: number | null;
  productName: string;
  variantLabel: string;
  sku: string;
  unitPrice: number;
  maxStock: number;
  quantity: number;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'bKash',
  'Nagad',
  'Rocket',
  'Bank Transfer',
  'Card',
  'Partial Payment',
  'Cash on Delivery',
  'Due Payment',
];

export const PosPage: React.FC<{ settings: BusinessSettings | null }> = ({ settings }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('');

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [guestName, setGuestName] = useState('Walk-in Guest');
  const [guestPhone, setGuestPhone] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  const [discountAmount, setDiscountAmount] = useState('0');
  const [deliveryCharge, setDeliveryCharge] = useState(String(settings?.default_delivery_charge ?? 0));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [autoFillPaid, setAutoFillPaid] = useState(true);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [variantPickProduct, setVariantPickProduct] = useState<Product | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const [statusMsg, setStatusMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Physical USB/Bluetooth keyboard scanner buffer
  const scanBufferRef = useRef<{ text: string; lastTs: number }>({ text: '', lastTs: 0 });

  const loadPosData = async () => {
    const [pRes, cRes, custRes] = await Promise.all([
      apiFetch<{ products: Product[] }>('/api/products?status=active'),
      apiFetch<{ categories: Category[] }>('/api/categories'),
      apiFetch<{ customers: Customer[] }>('/api/customers'),
    ]);
    setProducts(pRes.products);
    setCategories(cRes.categories);
    setCustomers(custRes.customers);
  };

  useEffect(() => {
    void loadPosData();
  }, []);

  const addItemToCart = (product: Product, variant: ProductVariant | null = null) => {
    setErrMsg('');
    const maxStock = variant ? variant.stock : product.available_stock;
    if (maxStock <= 0) {
      setErrMsg(`${product.name} is currently out of stock.`);
      return;
    }

    const price = variant
      ? variant.price > 0
        ? variant.price
        : product.selling_price
      : product.discount_price && product.discount_price > 0
        ? product.discount_price
        : product.selling_price;

    const variantLabel = variant
      ? [variant.size, variant.color, variant.material, variant.style].filter(Boolean).join(' / ')
      : '';
    const key = `${product.id}:${variant?.id ?? 'base'}`;

    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        if (existing.quantity >= maxStock) {
          setErrMsg(`Only ${maxStock} unit(s) available for ${product.name}.`);
          return prev;
        }
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key,
          productId: product.id,
          variantId: variant?.id ?? null,
          productName: product.name,
          variantLabel,
          sku: variant?.sku || product.sku,
          unitPrice: price,
          maxStock,
          quantity: 1,
        },
      ];
    });
  };

  const handleBarcodeLookup = async (code: string) => {
    setErrMsg('');
    try {
      const res = await apiFetch<{ match: 'product' | 'variant'; product: Product; variant: ProductVariant | null }>(
        `/api/barcodes/lookup?code=${encodeURIComponent(code)}`
      );
      if (res.match === 'variant' && res.variant) {
        addItemToCart(res.product, res.variant);
      } else if (res.product.variants?.length > 0) {
        setVariantPickProduct(res.product);
      } else {
        addItemToCart(res.product, null);
      }
      setStatusMsg(`Scanned: ${res.product.name}`);
    } catch (err: unknown) {
      setErrMsg((err as Error).message || `Barcode "${code}" not found.`);
    }
  };

  // Global listener for physical USB / Bluetooth keyboard barcode scanners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const now = Date.now();
      if (now - scanBufferRef.current.lastTs > 90) {
        scanBufferRef.current.text = '';
      }
      scanBufferRef.current.lastTs = now;

      if (e.key === 'Enter' && scanBufferRef.current.text.length >= 3) {
        const code = scanBufferRef.current.text;
        scanBufferRef.current.text = '';
        void handleBarcodeLookup(code);
        return;
      }
      if (e.key.length === 1) {
        scanBufferRef.current.text += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const preTotals = calculateOrderTotals(
    cart.map((c) => ({ quantity: c.quantity, unitPrice: c.unitPrice })),
    Number(discountAmount || 0),
    Number(deliveryCharge || 0),
    0
  );

  const effectivePaid =
    paymentMethod === 'Due Payment' || paymentMethod === 'Cash on Delivery'
      ? Number(amountPaid || 0)
      : autoFillPaid
        ? preTotals.grandTotal
        : Number(amountPaid || 0);

  const totals = calculateOrderTotals(
    cart.map((c) => ({ quantity: c.quantity, unitPrice: c.unitPrice })),
    Number(discountAmount || 0),
    Number(deliveryCharge || 0),
    effectivePaid
  );

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ customer: Customer }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name: newCustName, phone: newCustPhone, address: newCustAddress }),
    });
    setCustomers((prev) => [res.customer, ...prev]);
    setCustomerId(String(res.customer.id));
    setNewCustomerOpen(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setErrMsg('');
    setStatusMsg('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customerId ? Number(customerId) : null,
          customer_name: customerId ? undefined : guestName,
          customer_phone: customerId ? undefined : guestPhone,
          items: cart.map((c) => ({
            product_id: c.productId,
            variant_id: c.variantId,
            quantity: c.quantity,
            unit_price: c.unitPrice,
          })),
          discount_amount: Number(discountAmount || 0),
          delivery_charge: Number(deliveryCharge || 0),
          payment_method: paymentMethod,
          amount_paid: totals.amountPaid,
          order_status: paymentMethod === 'Cash on Delivery' ? 'confirmed' : 'completed',
        }),
      });
      setCompletedOrder(res.order);
      setReceiptOpen(true);
      setCart([]);
      setDiscountAmount('0');
      setAmountPaid('');
      setAutoFillPaid(true);
      await loadPosData();
    } catch (err: unknown) {
      setErrMsg((err as Error).message || 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    if (selectedCat && String(p.category_id || '') !== selectedCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Point of Sale (POS)"
        subtitle="Scan barcodes with camera or USB/Bluetooth scanner, manage cart, collect payments, and print 80mm thermal receipts"
        actions={
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90"
          >
            <ScanLine className="h-4 w-4" />
            SCAN BARCODE
          </button>
        }
      />

      {errMsg && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">
          {errMsg}
        </div>
      )}
      {statusMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Product Browser */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && search.trim()) {
                    void handleBarcodeLookup(search.trim());
                  }
                }}
                placeholder="Search product, SKU, or press Enter after scanning barcode..."
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select
              aria-label="Filter POS category"
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title="No Available Products in Catalog"
              description="Add active products with available stock to start ringing up sales in the POS."
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map((p) => {
                const displayPrice = p.discount_price && p.discount_price > 0 ? p.discount_price : p.selling_price;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (p.variants?.length > 0) {
                        setVariantPickProduct(p);
                      } else {
                        addItemToCart(p, null);
                      }
                    }}
                    className="text-left rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-3.5 hover:border-zinc-400 dark:hover:border-white/30 transition-colors flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium line-clamp-2">{p.name}</div>
                      <div className="mt-0.5 text-[11px] font-mono text-zinc-500">{p.sku}</div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-white/10 text-xs">
                      <span className="font-mono font-semibold">{formatBDT(displayPrice)}</span>
                      <span className="font-mono text-zinc-400">{p.available_stock} left</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Cart & Checkout */}
        <div className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-white/12 bg-white dark:bg-[#121212] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-3">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <ShoppingCart className="h-4 w-4" />
              <span>Order Cart ({cart.reduce((s, c) => s + c.quantity, 0)})</span>
            </div>
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])} className="text-xs text-zinc-400 hover:text-white">
                Clear
              </button>
            )}
          </div>

          {/* Customer Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="pos-customer" className="text-xs font-medium text-zinc-400">Customer</label>
              <button
                type="button"
                onClick={() => setNewCustomerOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white"
              >
                <UserPlus className="h-3.5 w-3.5" />
                New Customer
              </button>
            </div>
            <select
              id="pos-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-xs"
            >
              <option value="">Guest Checkout</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
            {!customerId && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Guest Name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#171717] px-2.5 py-1.5 text-xs"
                />
                <input
                  type="tel"
                  placeholder="Guest Phone"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#171717] px-2.5 py-1.5 text-xs"
                />
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className="max-h-60 overflow-y-auto divide-y divide-zinc-200 dark:divide-white/10">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500">Select products or scan a barcode to build an order.</p>
            ) : (
              cart.map((line) => (
                <div key={line.key} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{line.productName}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      {line.variantLabel ? `${line.variantLabel} · ` : ''}
                      {formatBDT(line.unitPrice)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${line.productName}`}
                      onClick={() =>
                        setCart((prev) =>
                          prev
                            .map((c) => (c.key === line.key ? { ...c, quantity: c.quantity - 1 } : c))
                            .filter((c) => c.quantity > 0)
                        )
                      }
                      className="rounded border border-white/15 p-1 hover:bg-white/10"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center font-mono">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${line.productName}`}
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((c) =>
                            c.key === line.key && c.quantity < c.maxStock
                              ? { ...c, quantity: c.quantity + 1 }
                              : c
                          )
                        )
                      }
                      className="rounded border border-white/15 p-1 hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${line.productName}`}
                      onClick={() => setCart((prev) => prev.filter((c) => c.key !== line.key))}
                      className="p-1 text-red-400 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals & Payment */}
          <div className="border-t border-zinc-200 dark:border-white/10 pt-3 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-zinc-400">Discount (৳)</span>
                <input
                  type="number"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#171717] px-2.5 py-1.5 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-zinc-400">Delivery Charge (৳)</span>
                <input
                  type="number"
                  min="0"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#171717] px-2.5 py-1.5 font-mono"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-zinc-400">Payment Method</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    const m = e.target.value as PaymentMethod;
                    setPaymentMethod(m);
                    if (m === 'Due Payment' || m === 'Cash on Delivery') {
                      setAutoFillPaid(false);
                      setAmountPaid('0');
                    } else if (m === 'Partial Payment') {
                      setAutoFillPaid(false);
                    } else {
                      setAutoFillPaid(true);
                    }
                  }}
                  className="w-full rounded-lg border border-white/15 bg-[#171717] px-2.5 py-1.5"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>{pm}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-zinc-400">Amount Paid (৳)</span>
                <input
                  type="number"
                  min="0"
                  value={autoFillPaid ? String(preTotals.grandTotal) : amountPaid}
                  onChange={(e) => {
                    setAutoFillPaid(false);
                    setAmountPaid(e.target.value);
                  }}
                  className="w-full rounded-lg border border-white/15 bg-[#171717] px-2.5 py-1.5 font-mono"
                />
              </label>
            </div>

            <div className="space-y-1 rounded-lg bg-zinc-100 dark:bg-[#171717] p-3 font-mono">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>{formatBDT(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-white">
                <span>Grand Total</span>
                <span>{formatBDT(totals.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Due Amount</span>
                <span className={totals.dueAmount > 0 ? 'text-amber-400 font-semibold' : ''}>
                  {formatBDT(totals.dueAmount)}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={() => void handleCheckout()}
              className="w-full rounded-lg bg-zinc-900 dark:bg-white py-3 text-sm font-semibold text-white dark:text-[#080808] hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? 'Completing Order...' : `Complete Order · ${formatBDT(totals.grandTotal)}`}
            </button>
          </div>
        </div>
      </div>

      {/* Variant Picker Modal */}
      <Modal
        open={!!variantPickProduct}
        onClose={() => setVariantPickProduct(null)}
        title={`Select Variant — ${variantPickProduct?.name || ''}`}
      >
        <div className="divide-y divide-white/10">
          {variantPickProduct?.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={v.stock <= 0}
              onClick={() => {
                addItemToCart(variantPickProduct, v);
                setVariantPickProduct(null);
              }}
              className="w-full flex items-center justify-between py-3 px-2 text-left text-sm hover:bg-white/5 disabled:opacity-40"
            >
              <div>
                <div className="font-medium">
                  {[v.size, v.color, v.material, v.style].filter(Boolean).join(' / ') || v.sku}
                </div>
                <div className="text-xs font-mono text-zinc-500">{v.sku}</div>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="font-semibold">{formatBDT(v.price || variantPickProduct.selling_price)}</div>
                <div className="text-zinc-400">{v.stock} in stock</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Quick Customer Creation Modal */}
      <Modal open={newCustomerOpen} onClose={() => setNewCustomerOpen(false)} title="Quick Add Customer">
        <form onSubmit={handleQuickCreateCustomer} className="space-y-3">
          <input
            type="text"
            required
            placeholder="Customer Name"
            value={newCustName}
            onChange={(e) => setNewCustName(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
          />
          <input
            type="tel"
            required
            placeholder="Phone Number"
            value={newCustPhone}
            onChange={(e) => setNewCustPhone(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Delivery Address"
            value={newCustAddress}
            onChange={(e) => setNewCustAddress(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-[#171717] px-3 py-2 text-sm"
          />
          <button type="submit" className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-black">
            Create &amp; Select Customer
          </button>
        </form>
      </Modal>

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => void handleBarcodeLookup(code)}
      />

      <ThermalReceiptModal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        order={completedOrder}
        settings={settings}
      />
    </div>
  );
};
