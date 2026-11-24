import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  autoMapCsvHeaders,
  validateCsvRows,
  type CsvTargetField,
  type CsvValidatedProduct,
} from '../shared/erpMath';
import type { Product } from '../shared/types';
import { PageHeader } from '../components/ui/Primitives';

const TARGET_FIELDS: Array<{ value: CsvTargetField; label: string }> = [
  { value: 'ignore', label: 'Ignore Column' },
  { value: 'name', label: 'Product Name *' },
  { value: 'sku', label: 'Product SKU *' },
  { value: 'selling_price', label: 'Selling Price *' },
  { value: 'purchase_price', label: 'Purchase Price' },
  { value: 'discount_price', label: 'Discount Price' },
  { value: 'available_stock', label: 'Available Stock' },
  { value: 'min_stock', label: 'Minimum Stock' },
  { value: 'category', label: 'Category' },
  { value: 'barcode', label: 'Barcode (Preserves Leading 0s)' },
  { value: 'description', label: 'Description' },
  { value: 'tags', label: 'Tags' },
];

export const CsvImportPage: React.FC = () => {
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CsvTargetField>>({});
  const [validated, setValidated] = useState<CsvValidatedProduct[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>('skip');
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    errors: Array<{ rowIndex: number; sku: string; reason: string }>;
  } | null>(null);
  const [fileName, setFileName] = useState('');

  const loadExisting = async () => {
    const res = await apiFetch<{ products: Product[] }>('/api/products');
    setExistingProducts(res.products);
  };

  useEffect(() => {
    void loadExisting();
  }, []);

  useEffect(() => {
    if (rawRows.length === 0) {
      setValidated([]);
      return;
    }
    const existingSkus = new Set(existingProducts.map((p) => p.sku.toLowerCase()));
    const existingBarcodes = new Set(existingProducts.map((p) => p.barcode).filter(Boolean));
    setValidated(validateCsvRows(rawRows, mapping, existingSkus, existingBarcodes));
  }, [rawRows, mapping, existingProducts]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      // Crucial: do NOT auto-cast numbers so leading zeros in barcodes stay intact!
      dynamicTyping: false,
      complete: (results) => {
        const cols = results.meta.fields || [];
        setHeaders(cols);
        setRawRows(results.data || []);
        setMapping(autoMapCsvHeaders(cols));
      },
    });
  };

  const handleImport = async () => {
    const rowsToSend = validated.filter((r) => r.status === 'valid' || (r.status === 'duplicate' && duplicateStrategy === 'update'));
    if (rowsToSend.length === 0) return;
    setImporting(true);
    try {
      const res = await apiFetch<NonNullable<typeof report>>('/api/products/import-csv', {
        method: 'POST',
        body: JSON.stringify({ rows: rowsToSend, duplicate_strategy: duplicateStrategy }),
      });
      setReport(res);
      await loadExisting();
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadErrors = () => {
    const errRows = validated.filter((r) => r.status !== 'valid');
    const csv = Papa.unparse(
      errRows.map((r) => ({
        row: r.rowIndex,
        sku: r.sku,
        name: r.name,
        barcode: r.barcode,
        status: r.status,
        issues: r.issues.join('; '),
      }))
    );
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xclufy-csv-import-issues.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCatalog = () => {
    const csv = Papa.unparse(
      existingProducts.map((p) => ({
        name: p.name,
        sku: p.sku,
        category: p.category_name || '',
        purchase_price: p.purchase_price,
        selling_price: p.selling_price,
        discount_price: p.discount_price ?? '',
        available_stock: p.available_stock,
        min_stock: p.min_stock,
        barcode: p.barcode,
        status: p.status,
        tags: p.tags,
      }))
    );
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xclufy-products-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = validated.filter((r) => r.status === 'valid').length;
  const dupCount = validated.filter((r) => r.status === 'duplicate').length;
  const errCount = validated.filter((r) => r.status === 'error').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import / Export Center"
        subtitle="Intelligent UTF-8 CSV product importer (Bangla & English) with column mapping, duplicate detection, and leading-zero preservation"
        actions={
          <button
            type="button"
            onClick={handleExportCatalog}
            disabled={existingProducts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 px-4 py-2 text-xs font-medium hover:bg-white/10 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Export Catalog CSV ({existingProducts.length})
          </button>
        }
      />

      {/* Upload Dropzone */}
      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-white/20 bg-white dark:bg-[#111111] p-8 text-center">
        <FileSpreadsheet className="mx-auto h-9 w-9 text-zinc-400" />
        <h2 className="mt-3 text-base font-semibold">Upload Your Existing Product CSV File</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Supports UTF-8, Bangla &amp; English headers, quoted fields, and leading zeros in EAN/UPC barcodes. No existing records are overwritten unless explicitly chosen.
        </p>
        <div className="mt-5">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-5 py-2.5 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90">
            <Upload className="h-4 w-4" />
            <span>{fileName ? `Selected: ${fileName}` : 'Choose CSV File'}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {report && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>CSV Import Completed</span>
          </div>
          <p className="text-xs text-zinc-200 font-mono">
            Imported: {report.imported} · Updated: {report.updated} · Skipped: {report.skipped} · Errors: {report.errors.length}
          </p>
        </div>
      )}

      {headers.length > 0 && (
        <div className="space-y-6">
          {/* Column Mapping */}
          <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Column Mapping ({headers.length} CSV columns)</h3>
                <p className="text-xs text-zinc-500">Auto-detected fields can be adjusted manually before importing</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <span className="text-zinc-400">On Duplicate SKU:</span>
                  <select
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value as 'skip' | 'update')}
                    className="rounded-lg border border-white/15 bg-[#171717] px-2.5 py-1.5 text-xs"
                  >
                    <option value="skip">Skip Existing</option>
                    <option value="update">Update Existing</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {headers.map((h) => (
                <div key={h} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 dark:border-white/10 p-2.5">
                  <span className="text-xs font-mono truncate max-w-[140px]" title={h}>{h}</span>
                  <select
                    aria-label={`Map column ${h}`}
                    value={mapping[h] || 'ignore'}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [h]: e.target.value as CsvTargetField }))}
                    className="rounded border border-white/15 bg-[#171717] px-2 py-1 text-xs"
                  >
                    {TARGET_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Summary & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-4">
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <span>Total Rows: {validated.length}</span>
              <span className="text-emerald-400">Valid: {validCount}</span>
              <span className="text-amber-400">Duplicates: {dupCount}</span>
              <span className="text-red-400">Errors: {errCount}</span>
            </div>
            <div className="flex items-center gap-2">
              {(dupCount > 0 || errCount > 0) && (
                <button
                  type="button"
                  onClick={handleDownloadErrors}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  Download Issue Report
                </button>
              )}
              <button
                type="button"
                disabled={importing || (validCount === 0 && !(duplicateStrategy === 'update' && dupCount > 0))}
                onClick={() => void handleImport()}
                className="rounded-lg bg-zinc-900 dark:bg-white px-5 py-2 text-xs font-semibold text-white dark:text-[#080808] disabled:opacity-40"
              >
                {importing ? 'Importing...' : `Import ${duplicateStrategy === 'update' ? validCount + dupCount : validCount} Products`}
              </button>
            </div>
          </div>

          {/* Preview Table */}
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400">
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Barcode</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right">Selling</th>
                  <th className="px-3 py-2.5 text-right">Stock</th>
                  <th className="px-3 py-2.5">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {validated.slice(0, 100).map((r) => (
                  <tr key={r.rowIndex}>
                    <td className="px-3 py-2 font-mono text-zinc-500">{r.rowIndex}</td>
                    <td className="px-3 py-2 font-medium">{r.name || '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.sku || '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.barcode || '—'}</td>
                    <td className="px-3 py-2 text-zinc-400">{r.category}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.selling_price}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.available_stock}</td>
                    <td className="px-3 py-2">
                      {r.status === 'valid' ? (
                        <span className="text-emerald-400">Ready</span>
                      ) : (
                        <span className={r.status === 'duplicate' ? 'text-amber-400' : 'text-red-400'}>
                          {r.issues.join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
