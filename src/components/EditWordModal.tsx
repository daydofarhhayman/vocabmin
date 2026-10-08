import React, { useState, useEffect } from 'react';
import { Edit2, Plus, Trash2, X, Check, Sparkles, Loader2 } from 'lucide-react';
import { POS, Word } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { normalizePos } from '../utils/pos';
import { storage } from '../services/storage';

interface EditWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  word: Word | null;
  allWords: Word[];
  onUpdateGroup: (oldTerm: string, newWords: Partial<Word>[]) => void;
  lang: 'zh' | 'en';
}

interface DefinitionRow {
  id?: string;
  pos: POS;
  def: string;
  defEn?: string;
  ex: string;
  level: number;
  interval?: number;
  easeFactor?: number;
  timestamp?: number;
  lastReview?: number;
  nextReview?: number;
}

export const EditWordModal: React.FC<EditWordModalProps> = ({
  isOpen,
  onClose,
  word,
  allWords,
  onUpdateGroup,
  lang
}) => {
  const t = TRANSLATIONS[lang];
  const [term, setTerm] = useState('');
  const [definitions, setDefinitions] = useState<DefinitionRow[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiFetchMeaningsLoading, setIsAiFetchMeaningsLoading] = useState(false);

  // AI auto standardize / polish definition #0 without deleting other definitions
  const handleAiPolish = async () => {
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
          userPrompt: `請幫我標準化潤飾與優化單字「${cleanTerm}」，提供精準標準的詞性、中文解釋與自然的現代英文例句。`,
          rawInputWords: [cleanTerm],
          apiKey
        })
      });

      if (!res.ok) throw new Error('AI lookup failed');
      const data = await res.json();

      if (data.words && data.words.length > 0) {
        const found = data.words[0];
        setDefinitions((prev) => {
          if (prev.length === 0) {
            return [
              {
                pos: normalizePos(found.pos) || 'n.',
                def: found.def || '',
                defEn: found.defEn || '',
                ex: found.ex || '',
                level: 0
              }
            ];
          }
          // Update only definition #0, strictly preserving all other definitions
          const updated = [...prev];
          updated[0] = {
            ...updated[0],
            pos: normalizePos(found.pos) || updated[0].pos || 'n.',
            def: found.def || updated[0].def || '',
            defEn: found.defEn || updated[0].defEn || '',
            ex: found.ex || updated[0].ex || ''
          };
          return updated;
        });
      }
    } catch (err) {
      console.error('AI Polish error:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // AI fetch all common meanings (一詞多義)
  const handleAiFetchAllMeanings = async () => {
    const cleanTerm = term.trim();
    if (!cleanTerm || isAiFetchMeaningsLoading) return;

    const currentSettings = storage.getLocalSettings();
    const apiKey = currentSettings?.geminiApiKey;

    setIsAiFetchMeaningsLoading(true);
    try {
      const res = await fetch('/api/ai/word-all-meanings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
        },
        body: JSON.stringify({
          term: cleanTerm,
          apiKey
        })
      });

      if (!res.ok) throw new Error('Failed to fetch meanings');
      const data = await res.json();

      if (Array.isArray(data.meanings) && data.meanings.length > 0) {
        setDefinitions((prev) => {
          const currentCleanDefs = prev.map((p) => p.def.trim().toLowerCase());
          const newRows = [...prev];

          for (const m of data.meanings) {
            const mCleanDef = (m.def || '').trim().toLowerCase();
            // If already present in rows, skip
            if (currentCleanDefs.includes(mCleanDef)) continue;

            newRows.push({
              pos: normalizePos(m.pos) || 'n.',
              def: m.def || '',
              defEn: m.defEn || '',
              ex: m.ex || '',
              level: 0
            });
            currentCleanDefs.push(mCleanDef);
          }

          return newRows;
        });
      }
    } catch (err) {
      console.error('Fetch all meanings error:', err);
    } finally {
      setIsAiFetchMeaningsLoading(false);
    }
  };

  useEffect(() => {
    if (word) {
      setTerm(word.term);
      const related = allWords.filter(
        (w) => w.term.trim().toLowerCase() === word.term.trim().toLowerCase()
      );
      if (related.length > 0) {
        setDefinitions(
          related.map((r) => ({
            id: r.id,
            pos: r.pos,
            def: r.def,
            defEn: r.defEn || '',
            ex: r.ex || '',
            level: r.level || 0,
            interval: r.interval,
            easeFactor: r.easeFactor,
            timestamp: r.timestamp,
            lastReview: r.lastReview,
            nextReview: r.nextReview
          }))
        );
      } else {
        setDefinitions([
          {
            id: word.id,
            pos: word.pos,
            def: word.def,
            defEn: word.defEn || '',
            ex: word.ex || '',
            level: word.level || 0,
            interval: word.interval,
            easeFactor: word.easeFactor,
            timestamp: word.timestamp,
            lastReview: word.lastReview,
            nextReview: word.nextReview
          }
        ]);
      }
    }
  }, [word, allWords]);

  if (!isOpen || !word) return null;

  const handleAddDefinition = () => {
    setDefinitions((prev) => [
      ...prev,
      {
        pos: 'n.',
        def: '',
        defEn: '',
        ex: '',
        level: 0,
        interval: 1,
        easeFactor: 2.5
      }
    ]);
  };

  const handleRemoveDefinition = (index: number) => {
    if (definitions.length <= 1) return;
    setDefinitions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof DefinitionRow, value: any) => {
    setDefinitions((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTerm = term.trim();
    if (!cleanTerm) return;

    const validDefs = definitions.filter((d) => d.def.trim().length > 0);
    if (!validDefs.length) return;

    // Preserve existing SRS intervals, easeFactor, and review dates
    const updatedWords: Partial<Word>[] = validDefs.map((d) => ({
      id: d.id,
      term: cleanTerm,
      pos: d.pos,
      def: d.def.trim(),
      defEn: (d.defEn || '').trim() || undefined,
      ex: d.ex.trim(),
      level: d.level,
      interval: d.interval,
      easeFactor: d.easeFactor,
      timestamp: d.timestamp,
      lastReview: d.lastReview,
      nextReview: d.nextReview
    }));

    onUpdateGroup(word.term, updatedWords);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-enter">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 dark:border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-black text-xl">
            <Edit2 className="w-5 h-5" />
            <span>{t.title_edit}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
          {/* Term Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <label className="text-xs font-bold uppercase text-slate-400">
                {t.lbl_word} <span className="text-rose-500">*</span>
              </label>

              <div className="flex items-center gap-1.5">
                {term.trim() && (
                  <>
                    <button
                      type="button"
                      onClick={handleAiPolish}
                      disabled={isAiLoading || isAiFetchMeaningsLoading}
                      className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/60 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      title="標準化校正現有釋義"
                    >
                      {isAiLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{isAiLoading ? '校正中...' : 'AI 校正'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAiFetchAllMeanings}
                      disabled={isAiLoading || isAiFetchMeaningsLoading}
                      className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      title="自動查詢並補全此單字所有常見詞性與釋義 (一詞多義)"
                    >
                      {isAiFetchMeaningsLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{isAiFetchMeaningsLoading ? '查詢中...' : '自動補齊多義'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
            <input
              type="text"
              required
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 font-bold text-base outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Definitions List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
              <span>{t.hint_edit_multiple} ({definitions.length} 個釋義)</span>
              <button
                type="button"
                onClick={handleAddDefinition}
                className="text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.btn_add_def}</span>
              </button>
            </div>

            {definitions.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 relative group space-y-2.5"
              >
                {definitions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDefinition(idx)}
                    className="absolute top-2.5 right-2.5 text-slate-300 hover:text-rose-500 p-1"
                    title="移除此釋義"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4 sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">詞性</label>
                    <select
                      value={item.pos}
                      onChange={(e) => handleChange(idx, 'pos', e.target.value as POS)}
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

                  <div className="col-span-8 sm:col-span-6">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">
                      中文釋義 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={item.def}
                      onChange={(e) => handleChange(idx, 'def', e.target.value)}
                      placeholder="中文解釋"
                      className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-medium outline-none"
                    />
                  </div>

                  <div className="col-span-12 sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">熟練度</label>
                    <select
                      value={item.level}
                      onChange={(e) => handleChange(idx, 'level', parseInt(e.target.value, 10))}
                      className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-bold outline-none cursor-pointer"
                    >
                      <option value="0">陌生 (Lvl 0)</option>
                      <option value="1">學習中 (Lvl 1)</option>
                      <option value="2">熟悉 (Lvl 2)</option>
                      <option value="3">精通 (Lvl 3)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    英文釋義 (English Definition)
                  </label>
                  <input
                    type="text"
                    value={item.defEn || ''}
                    onChange={(e) => handleChange(idx, 'defEn', e.target.value)}
                    placeholder="例：to make something less severe (英英釋義)"
                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    英文例句
                  </label>
                  <textarea
                    value={item.ex}
                    onChange={(e) => handleChange(idx, 'ex', e.target.value)}
                    placeholder="例句..."
                    rows={2}
                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:opacity-95 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 text-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>儲存修改</span>
          </button>
        </form>
      </div>
    </div>
  );
};
