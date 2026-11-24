import React, { useEffect, useState } from 'react';
import { FolderTree, Plus, Edit2, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Category } from '../shared/types';
import { EmptyState, Modal, PageHeader, SkeletonRows } from '../components/ui/Primitives';

export const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [error, setError] = useState('');

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ categories: Category[] }>('/api/categories');
      setCategories(res.categories);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setStatus('active');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setDescription(c.description || '');
    setStatus(c.status);
    setError('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await apiFetch(`/api/categories/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name, description, status }),
        });
      } else {
        await apiFetch('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name, description, status }),
        });
      }
      setModalOpen(false);
      await loadCategories();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to save category.');
    }
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
    await loadCategories();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Category Management"
        subtitle="Organize sunglasses, bandanas, rings, chains, necklaces, bracelets, and custom fashion lines"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        }
      />

      {loading ? (
        <SkeletonRows rows={4} />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="h-5 w-5" />}
          title="No Categories Created"
          description="Create custom categories such as Sunglasses, Bandanas, Rings, Chains, Necklaces, or Bracelets."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              Create First Category
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{cat.name}</h2>
                  <span className="text-xs font-mono text-zinc-500 capitalize">{cat.status}</span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {cat.description || 'No description provided'}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-200 dark:border-white/10 pt-3 text-xs">
                <span className="font-mono text-zinc-400">{cat.product_count ?? 0} product(s)</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${cat.name}`}
                    onClick={() => openEdit(cat)}
                    className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${cat.name}`}
                    onClick={() => void handleDelete(cat.id)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Category' : 'New Category'}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">{error}</div>}
          <div className="space-y-1">
            <label htmlFor="cat-name" className="block text-xs font-medium text-zinc-400">Category Name</label>
            <input
              id="cat-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sunglasses"
              className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="cat-desc" className="block text-xs font-medium text-zinc-400">Description</label>
            <textarea
              id="cat-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="cat-status" className="block text-xs font-medium text-zinc-400">Status</label>
            <select
              id="cat-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
              className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-white/15 px-4 py-2 text-xs">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]">
              Save Category
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
