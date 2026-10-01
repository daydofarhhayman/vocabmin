import React, { useState } from 'react';
import { Plus, Trash2, X, FileSpreadsheet, Check, Sparkles, ArrowRight } from 'lucide-react';
import { POS, Word } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { storage } from '../services/storage';
import { normalizePos } from '../utils/pos';

interface AddWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWords: (words: Partial<Word>[]) => void;
  lang: 'zh' | 'en';
}

interface DefinitionInput {
  pos: POS;
  def: string;
  defEn?: string;
  ex: string;
}

export const AddWordModal: React.FC<AddWordModalProps> = ({
  isOpen,
  onClose,
  onAddWords,
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single word state
  const [term, setTerm] = useState('');
  const [definitions, setDefinitions] = useState<DefinitionInput[]>([
    { pos: 'n.', def: '', ex: '' }
  ]);

  // Bulk state
  const [bulkText, setBulkText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  if (!isOpen) return null;

  // AI Auto-Complete single word
  const handleAiAutoComplete = async () => {
    const cleanTerm = term.trim();
    if (!cleanTerm || isAiLoading) return;

    const currentSettings = storage.getLocalSettings();
    const apiKey = currentSettings?.geminiApiKey;

    setIsAiLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
        },
        body: JSON.stringify({
          userPrompt: `請幫我標準化查詢這個英文單字「${cleanTerm}」，自動補齊標準詞性、清晰的繁體中文解釋與實用例句。`,
          rawInputWords: [cleanTerm],
          apiKey
        })
      });

      if (!res.ok) throw new Error('AI lookup failed');
      const data = await res.json();

      if (data.words && data.words.length > 0) {
        const matching = data.words.filter(
          (w: any) => w.term && w.term.trim().toLowerCase() === cleanTerm.toLowerCase()
        );
        const toUse = matching.length > 0 ? matching : [data.words[0]];
        setDefinitions(
          toUse.map((found: any) => ({
            pos: normalizePos(found.pos),
            def: found.def || '',
            defEn: found.defEn || '',
            ex: found.ex || ''
          }))
        );
      }
    } catch (err) {
      console.error('AI Auto-complete error:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAddDefBlock = () => {
    setDefinitions((prev) => [...prev, { pos: 'n.', def: '', ex: '' }]);
  };

  const handleRemoveDefBlock = (index: number) => {
    if (definitions.length <= 1) return;
    setDefinitions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDefChange = (index: number, field: keyof DefinitionInput, value: string) => {
    setDefinitions((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSaveSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTerm = term.trim();
    if (!cleanTerm) return;

    const validDefs = definitions.filter((d) => d.def.trim().length > 0);
    if (!validDefs.length) return;

    const newWords: Partial<Word>[] = validDefs.map((d) => ({
      term: cleanTerm,
      pos: d.pos,
      def: d.def.trim(),
      defEn: (d.defEn || '').trim() || undefined,
      ex: d.ex.trim(),
      level: 0,
      interval: 1,
      easeFactor: 2.5
    }));

    onAddWords(newWords);
    // Reset form
    setTerm('');
    setDefinitions([{ pos: 'n.', def: '', ex: '' }]);
    onClose();
  };

  const handleSaveBulk = () => {
    if (!bulkText.trim()) return;
    const { added } = storage.parseBulkText(bulkText);
    if (added.length > 0) {
      onAddWords(added);
      setBulkText('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-enter">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 dark:border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black text-xl">
            <Plus className="w-5 h-5" />
            <span>{t.title_add}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-700/60 rounded-xl mb-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'single'
                ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.tab_single}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'bulk'
                ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.tab_bulk}
          </button>
        </div>

        {/* Single Word Form */}
        {activeTab === 'single' ? (
          <form onSubmit={handleSaveSingle} className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase text-slate-400">
                  {t.lbl_word} <span className="text-rose-500">*</span>
                </label>

                {term.trim() && (
                  <button
                    type="button"
                    onClick={handleAiAutoComplete}
                    disabled={isAiLoading}
                    className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                    <span>{isAiLoading ? 'AI 聯網補全中...' : 'AI 聯網自動補齊與標準化'}</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="例如：epiphany, resilient, take for granted"
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 font-bold text-base outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Definitions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <span>釋義清單 (可多個詞性)</span>
                <button
                  type="button"
                  onClick={handleAddDefBlock}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.btn_add_def}</span>
                </button>
              </div>

              {definitions.map((defItem, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 relative group"
                >
                  {definitions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDefBlock(idx)}
                      className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 p-1"
                      title="移除此釋義"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <div className="grid grid-cols-12 gap-2 mb-2">
                    <div className="col-span-4 sm:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">
                        詞性
                      </label>
                      <select
                        value={defItem.pos}
                        onChange={(e) => handleDefChange(idx, 'pos', e.target.value as POS)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="n.">名詞 (n.)</option>
                        <option value="v.">動詞 (v.)</option>
                        <option value="adj.">形容詞 (adj.)</option>
                        <option value="adv.">副詞 (adv.)</option>
                        <option value="phr.">片語 (phr.)</option>
                        <option value="other">其他</option>
                      </select>
                    </div>

                    <div className="col-span-8 sm:col-span-9">
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">
                        中文釋義 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={defItem.def}
                        onChange={(e) => handleDefChange(idx, 'def', e.target.value)}
                        placeholder="請輸入中文解釋"
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-medium outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">
                      英文釋義 (選填 / AI 可自動填寫)
                    </label>
                    <input
                      type="text"
                      value={defItem.defEn || ''}
                      onChange={(e) => handleDefChange(idx, 'defEn', e.target.value)}
                      placeholder="例：to make something less severe (英英釋義)"
                      className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-medium outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">
                      英文例句 (選填)
                    </label>
                    <textarea
                      value={defItem.ex}
                      onChange={(e) => handleDefChange(idx, 'ex', e.target.value)}
                      placeholder="請輸入英文例句..."
                      rows={2}
                      className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs outline-none resize-none leading-relaxed"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 text-sm transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{t.btn_save}</span>
            </button>
          </form>
        ) : (
          /* Bulk Import */
          <div className="flex-1 flex flex-col space-y-3">
            <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300">
              <p className="font-bold mb-1 flex items-center gap-1">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>自動偵測支援格式：</span>
              </p>
              <p className="opacity-90">1. Excel 直接複製貼上 (Tab 分隔)</p>
              <p className="opacity-90">
                2. 標準 CSV 格式：
                <code className="ml-1 font-mono bg-blue-100 dark:bg-blue-900/60 px-1 py-0.5 rounded">
                  "單字","詞性","解釋","例句"
                </code>
              </p>
            </div>

            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`"apple","n.","蘋果；蘋果公司產品","I eat an apple every day."\n"eloquent","adj.","口才流利的；有說服力的","She gave an eloquent speech."`}
              className="flex-1 w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 font-mono text-xs outline-none resize-none leading-relaxed min-h-[220px]"
            />

            <button
              type="button"
              onClick={handleSaveBulk}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 text-sm transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{t.btn_import}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
