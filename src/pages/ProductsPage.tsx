import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Copy, Archive, Trash2, Package, Eye, Layers } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatBDT } from '../shared/erpMath';
import type { Category, Product } from '../shared/types';
import { BarcodeSvg, EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

interface VariantDraft {
  size: string;
  color: string;
  material: string;
  style: string;
  sku: string;
  barcode: string;
  price: string;
  stock: string;
}

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'price_desc' | 'stock_asc'>('newest');

  const [formOpen, setFormOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [availableStock, setAvailableStock] = useState('0');
  const [minStock, setMinStock] = useState('5');
  const [barcode, setBarcode] = useState('');
  const [tags, setTags] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        apiFetch<{ products: Product[] }>('/api/products'),
        apiFetch<{ categories: Category[] }>('/api/categories'),
      ]);
      setProducts(pRes.products);
      setCategories(cRes.categories);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setSku('');
    setCategoryId(categories[0]?.id ? String(categories[0].id) : '');
    setDescription('');
    setImageUrl('');
    setPurchasePrice('');
    setSellingPrice('');
    setDiscountPrice('');
    setAvailableStock('0');
    setMinStock('5');
    setBarcode('');
    setTags('');
    setVariants([]);
    setError('');
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setName(p.name);
    setSku(p.sku);
    setCategoryId(p.category_id ? String(p.category_id) : '');
    setDescription(p.description || '');
    setImageUrl(p.image_url || '');
    setPurchasePrice(String(p.purchase_price));
    setSellingPrice(String(p.selling_price));
    setDiscountPrice(p.discount_price !== null ? String(p.discount_price) : '');
    setAvailableStock(String(p.available_stock));
    setMinStock(String(p.min_stock));
    setBarcode(p.barcode || '');
    setTags(p.tags || '');
    setVariants(
      (p.variants || []).map((v) => ({
        size: v.size,
        color: v.color,
        material: v.material,
        style: v.style,
        sku: v.sku,
        barcode: v.barcode,
        price: String(v.price),
        stock: String(v.stock),
      }))
    );
    setError('');
    setFormOpen(true);
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const addVariantRow = () => {
    setVariants((prev) => [
      ...prev,
      {
        size: '',
        color: '',
        material: '',
        style: '',
        sku: sku ? `${sku}-V${prev.length + 1}` : '',
        barcode: '',
        price: sellingPrice || '0',
        stock: '0',
      },
    ]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        name,
        sku,
        category_id: categoryId ? Number(categoryId) : null,
        description,
        image_url: imageUrl || null,
        purchase_price: Number(purchasePrice || 0),
        selling_price: Number(sellingPrice || 0),
        discount_price: discountPrice ? Number(discountPrice) : null,
        available_stock: Number(availableStock || 0),
        min_stock: Number(minStock || 5),
        barcode,
        tags,
        variants: variants.map((v) => ({
          ...v,
          price: Number(v.price || sellingPrice || 0),
          stock: Number(v.stock || 0),
        })),
      };

      if (editingId) {
        await apiFetch(`/api/products/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (id: number) => {
    await apiFetch(`/api/products/${id}/duplicate`, { method: 'POST' });
    await loadData();
  };

  const handleArchive = async (p: Product) => {
    await apiFetch(`/api/products/${p.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...p, status: p.status === 'archived' ? 'active' : 'archived' }),
    });
    await loadData();
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const filtered = products
    .filter((p) => {
      if (categoryFilter && String(p.category_id || '') !== categoryFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.tags.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price_desc') return b.selling_price - a.selling_price;
      if (sortBy === 'stock_asc') return a.available_stock - b.available_stock;
      return b.id - a.id;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Variants"
        subtitle="Manage XCLUFY fashion items, sizes, colors, materials, SKUs, barcodes, and pricing"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, barcode, tags..."
            className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] px-3 py-2 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="archived">Archived</option>
        </select>
        <select
          aria-label="Sort products"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#121212] px-3 py-2 text-sm"
        >
          <option value="newest">Newest First</option>
          <option value="name">Name (A-Z)</option>
          <option value="price_desc">Price (High-Low)</option>
          <option value="stock_asc">Stock (Low-High)</option>
        </select>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="No Products Found"
          description="Add your fashion accessories manually or import your existing catalog via CSV Import."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              Add First Product
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-white/10 text-xs text-zinc-500 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU / Barcode</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-white/10">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded-lg object-cover border border-zinc-200 dark:border-white/10"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#1A1A1A] flex items-center justify-center text-zinc-400">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        {p.variants?.length > 0 && (
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <Layers className="h-3 w-3" />
                            <span>{p.variants.length} variant(s)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <div>{p.sku}</div>
                    {p.barcode && <div className="text-zinc-500">{p.barcode}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {p.category_name || 'Uncategorized'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-zinc-500">
                    {formatBDT(p.purchase_price)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-medium">
                    {p.discount_price ? (
                      <div>
                        <span>{formatBDT(p.discount_price)}</span>
                        <span className="ml-1.5 text-xs text-zinc-500 line-through">{formatBDT(p.selling_price)}</span>
                      </div>
                    ) : (
                      formatBDT(p.selling_price)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">
                    <span className={p.available_stock <= p.min_stock ? 'text-amber-400 font-semibold' : ''}>
                      {p.available_stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-zinc-400">{p.status.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`View ${p.name}`}
                        onClick={() => setDetailProduct(p)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-white"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Duplicate ${p.name}`}
                        onClick={() => void handleDuplicate(p.id)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-white"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Archive ${p.name}`}
                        onClick={() => void handleArchive(p)}
                        className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-white"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => void handleDelete(p.id)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Product' : 'Add New Product'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="prod-name" className="block text-xs font-medium text-zinc-400">Product Name</label>
              <input
                id="prod-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Obsidian Acetate Sunglasses"
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="prod-sku" className="block text-xs font-medium text-zinc-400">Product SKU</label>
              <input
                id="prod-sku"
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. XC-SUN-001"
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label htmlFor="prod-cat" className="block text-xs font-medium text-zinc-400">Category</label>
              <select
                id="prod-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="prod-barcode" className="block text-xs font-medium text-zinc-400">Barcode (EAN/UPC/Code128)</label>
              <input
                id="prod-barcode"
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. 0891234567890"
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="prod-tags" className="block text-xs font-medium text-zinc-400">Tags</label>
              <input
                id="prod-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="minimal, eyewear, unisex"
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label htmlFor="prod-cost" className="block text-xs font-medium text-zinc-400">Purchase Price (৳)</label>
              <input
                id="prod-cost"
                type="number"
                step="0.01"
                min="0"
                required
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="prod-sell" className="block text-xs font-medium text-zinc-400">Selling Price (৳)</label>
              <input
                id="prod-sell"
                type="number"
                step="0.01"
                min="0"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="prod-disc" className="block text-xs font-medium text-zinc-400">Discount Price</label>
              <input
                id="prod-disc"
                type="number"
                step="0.01"
                min="0"
                value={discountPrice}
                onChange={(e) => setDiscountPrice(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="prod-stock" className="block text-xs font-medium text-zinc-400">Available Stock</label>
              <input
                id="prod-stock"
                type="number"
                min="0"
                disabled={variants.length > 0}
                value={
                  variants.length > 0
                    ? variants.reduce((s, v) => s + Number(v.stock || 0), 0)
                    : availableStock
                }
                onChange={(e) => setAvailableStock(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm font-mono disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="prod-min" className="block text-xs font-medium text-zinc-400">Min Stock</label>
              <input
                id="prod-min"
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="prod-desc" className="block text-xs font-medium text-zinc-400">Description</label>
              <textarea
                id="prod-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400">Product Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleProductImageUpload}
                className="w-full text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-[#181818] file:px-3 file:py-1.5 file:text-xs file:text-white"
              />
            </div>
          </div>

          {/* Fashion Variants */}
          <div className="border-t border-zinc-200 dark:border-white/10 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Fashion Variants</h3>
                <p className="text-[11px] text-zinc-500">Size, Color, Material, Style, Variant SKU, Barcode &amp; Stock</p>
              </div>
              <button
                type="button"
                onClick={addVariantRow}
                className="rounded-lg border border-zinc-300 dark:border-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
              >
                + Add Variant
              </button>
            </div>

            {variants.map((v, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#161616] p-3">
                <input
                  placeholder="Size"
                  value={v.size}
                  onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, size: e.target.value } : x)))}
                  className="rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs"
                />
                <input
                  placeholder="Color"
                  value={v.color}
                  onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))}
                  className="rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs"
                />
                <input
                  placeholder="Material"
                  value={v.material}
                  onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, material: e.target.value } : x)))}
                  className="rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs"
                />
                <input
                  placeholder="Style"
                  value={v.style}
                  onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, style: e.target.value } : x)))}
                  className="rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs"
                />
                <input
                  placeholder="Variant SKU"
                  required
                  value={v.sku}
                  onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, sku: e.target.value } : x)))}
                  className="rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  placeholder="Variant Barcode"
                  value={v.barcode}
                  onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, barcode: e.target.value } : x)))}
                  className="rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs font-mono"
                />
                <input
                  type="number"
                  placeholder="Price"
                  value={v.price}
                  onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))}
                  className="rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs font-mono"
                />
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    placeholder="Stock"
                    value={v.stock}
                    onChange={(e) => setVariants((prev) => prev.map((x, i) => (i === idx ? { ...x, stock: e.target.value } : x)))}
                    className="w-full rounded border border-white/15 bg-[#101010] px-2.5 py-1.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    aria-label="Remove variant"
                    onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                    className="px-2 text-red-400 hover:bg-red-500/10 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
            <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-zinc-900 dark:bg-white px-5 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              {saving ? 'Saving...' : editingId ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        title={detailProduct?.name || 'Product Details'}
        subtitle={detailProduct ? `SKU: ${detailProduct.sku} · ${detailProduct.category_name || 'Uncategorized'}` : ''}
      >
        {detailProduct && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-white/10 p-3">
                <span className="text-zinc-400">Purchase</span>
                <div className="mt-1 font-mono text-sm font-semibold">{formatBDT(detailProduct.purchase_price)}</div>
              </div>
              <div className="rounded-lg border border-white/10 p-3">
                <span className="text-zinc-400">Selling</span>
                <div className="mt-1 font-mono text-sm font-semibold">{formatBDT(detailProduct.selling_price)}</div>
              </div>
              <div className="rounded-lg border border-white/10 p-3">
                <span className="text-zinc-400">Available</span>
                <div className="mt-1 font-mono text-sm font-semibold">{detailProduct.available_stock}</div>
              </div>
              <div className="rounded-lg border border-white/10 p-3">
                <span className="text-zinc-400">Sold</span>
                <div className="mt-1 font-mono text-sm font-semibold">{detailProduct.sold_stock}</div>
              </div>
            </div>
            {(detailProduct.barcode || detailProduct.sku) && (
              <div className="rounded-lg bg-white p-3 flex justify-center">
                <BarcodeSvg value={detailProduct.barcode || detailProduct.sku} lineColor="#000000" />
              </div>
            )}
            {detailProduct.description && <p className="text-xs text-zinc-400">{detailProduct.description}</p>}
            {detailProduct.variants?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-zinc-400">Variants</h4>
                <div className="divide-y divide-white/10 border border-white/10 rounded-lg text-xs">
                  {detailProduct.variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-2.5">
                      <div>
                        <span className="font-medium">{[v.size, v.color, v.material, v.style].filter(Boolean).join(' / ') || v.sku}</span>
                        <span className="ml-2 font-mono text-zinc-500">{v.sku}</span>
                      </div>
                      <div className="font-mono">
                        {formatBDT(v.price)} · {v.stock} pcs
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
