import React, { useEffect, useState } from 'react';
import { Barcode, Printer, ScanLine, Search } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import type { Product } from '../shared/types';
import { BarcodeSvg, EmptyState, PageHeader, SkeletonRows } from '../components/ui/Primitives';
import { BarcodeScannerModal } from '../components/modals/BarcodeScannerModal';

export const BarcodeManagementPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookupResult, setLookupResult] = useState<string>('');

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ products: Product[] }>('/api/products');
      setProducts(res.products);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const handleAssignBarcode = async (product: Product) => {
    const generated = `880${String(product.id).padStart(5, '0')}${Math.floor(1000 + Math.random() * 8999)}`;
    await apiFetch(`/api/products/${product.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...product, barcode: generated }),
    });
    await loadProducts();
  };

  const handleBarcodeDetected = async (code: string) => {
    try {
      const res = await apiFetch<{ product: Product }>(`/api/barcodes/lookup?code=${encodeURIComponent(code)}`);
      setLookupResult(`Matched: ${res.product.name} (${res.product.sku}) — ${formatBDT(res.product.selling_price)}`);
      setSearch(code);
    } catch (err: unknown) {
      setLookupResult((err as Error).message || `No match for ${code}`);
    }
  };

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barcode Management"
        subtitle="Generate Code-128 labels, assign unique barcodes, and test hardware or camera barcode scanning"
        actions={
          <>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              <ScanLine className="h-4 w-4" />
              Test Barcode Scanner
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium"
            >
              <Printer className="h-4 w-4" />
              Print Labels
            </button>
          </>
        }
      />

      {lookupResult && (
        <div className="rounded-xl border border-white/15 bg-[#141414] px-4 py-3 text-xs font-mono text-zinc-200">
          {lookupResult}
        </div>
      )}

      <div className="relative max-w-md no-print">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by product name, SKU, or barcode..."
          className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Barcode className="h-5 w-5" />}
          title="No Products for Barcode Labels"
          description="Add products or import a CSV catalog to generate and print barcode labels."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const code = p.barcode || p.sku;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs font-mono text-zinc-500">
                      {p.sku} · {formatBDT(p.selling_price)}
                    </div>
                  </div>
                  {!p.barcode && (
                    <button
                      type="button"
                      onClick={() => void handleAssignBarcode(p)}
                      className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-medium hover:bg-white/10 no-print"
                    >
                      Assign Barcode
                    </button>
                  )}
                </div>
                <div className="rounded-lg bg-white p-2.5 flex justify-center">
                  <BarcodeSvg value={code} height={38} width={1.3} lineColor="#000000" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => void handleBarcodeDetected(code)}
      />
    </div>
  );
};
