import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Tag,
  Edit2,
  Trash2,
  Check,
  FolderOpen,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Word } from '../types';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  words: Word[];
  onAddCategory: (categoryName: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onDeleteCategory: (categoryName: string) => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  words,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Calculate word counts for each category
  const categoryWordCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncategorized = 0;

    words.forEach((w) => {
      const cat = (w.category || '').trim();
      if (!cat || cat === '未分類') {
        uncategorized++;
      } else {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });

    return { counts, uncategorized };
  }, [words]);

  if (!isOpen) return null;

  const handleCreate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) return;

    if (clean === '未分類' || clean === '全部') {
      setErrorMessage('「全部」與「未分類」為系統預設名稱，請使用其他名稱。');
      return;
    }

    if (categories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      setErrorMessage(`類別「${clean}」已存在。`);
      return;
    }

    setErrorMessage('');
    onAddCategory(clean);
    setNewCategoryName('');
  };

  const startEdit = (cat: string) => {
    setEditingCategory(cat);
    setEditInput(cat);
    setErrorMessage('');
  };

  const handleSaveEdit = (oldCat: string) => {
    const clean = editInput.trim();
    if (!clean || clean === oldCat) {
      setEditingCategory(null);
      return;
    }

    if (clean === '未分類' || clean === '全部') {
      setErrorMessage('「全部」與「未分類」為系統保留名稱。');
      return;
    }

    if (
      categories.some(
        (c) => c.toLowerCase() !== oldCat.toLowerCase() && c.toLowerCase() === clean.toLowerCase()
      )
    ) {
      setErrorMessage(`類別「${clean}」已存在。`);
      return;
    }

    setErrorMessage('');
    onRenameCategory(oldCat, clean);
    setEditingCategory(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700/60 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">
                單字庫類別管理
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                自訂專屬分類標籤，複習與整理單字更高效
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add New Category Input */}
        <form onSubmit={handleCreate} className="mb-4">
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
            新增自訂類別
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="例如：多益核心、GRE必背、醫學專業..."
                maxLength={20}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/60 text-xs font-semibold border border-slate-200 dark:border-slate-600 focus:border-indigo-500 outline-none text-slate-800 dark:text-white transition"
              />
            </div>
            <button
              type="submit"
              disabled={!newCategoryName.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>建立類別</span>
            </button>
          </div>
          {errorMessage && (
            <p className="mt-2 text-xs font-medium text-rose-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{errorMessage}</span>
            </p>
          )}
        </form>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2 mb-4">
          {/* Default Uncategorized Stats */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-700/40 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <span className="font-bold text-slate-700 dark:text-slate-200">未分類單字</span>
              <span className="text-[10px] text-slate-400">(系統預設)</span>
            </div>
            <span className="font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
              {categoryWordCounts.uncategorized} 字
            </span>
          </div>

          {/* User Categories */}
          {categories.map((cat) => {
            const count = categoryWordCounts.counts[cat] || 0;
            const isEditing = editingCategory === cat;

            return (
              <div
                key={cat}
                className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-750 border border-slate-200/70 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700/50 transition-all shadow-xs"
              >
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(cat);
                        if (e.key === 'Escape') setEditingCategory(null);
                      }}
                      autoFocus
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-bold border border-indigo-500 outline-none text-slate-800 dark:text-white"
                    />
                    <button
                      onClick={() => handleSaveEdit(cat)}
                      className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition"
                      title="確認修改"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-300 transition"
                      title="取消"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-xs" />
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                      {cat}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40">
                      {count} 字
                    </span>
                  </div>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(cat)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                      title="重命名類別"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          count > 0 &&
                          !confirm(
                            `此類別目前包含 ${count} 個單字，刪除後這些單字將會變更為「未分類」。確定要刪除類別「${cat}」嗎？`
                          )
                        ) {
                          return;
                        }
                        onDeleteCategory(cat);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      title="刪除類別"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {categories.length === 0 && (
            <div className="text-center py-6 text-xs text-slate-400">
              目前尚未建立自訂類別，可由上方輸入框建立第一個分類。
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            共 {categories.length} 個自訂類別
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
