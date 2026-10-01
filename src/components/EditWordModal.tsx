import React, { useState, useEffect } from 'react';
import { Edit2, Plus, Trash2, X, Check, Sparkles } from 'lucide-react';
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

  // AI auto standardize / polish current word
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
        setDefinitions((prev) => [
          {
            id: prev[0]?.id,
            pos: normalizePos(found.pos) || prev[0]?.pos || 'n.',
            def: found.def || prev[0]?.def || '',
            defEn: found.defEn || prev[0]?.defEn || '',
            ex: found.ex || prev[0]?.ex || '',
            level: prev[0]?.level || 0
          }
        ]);
      }
    } catch (err) {
      console.error('AI Polish error:', err);
    } finally {
      setIsAiLoading(false);
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
            level: r.level || 0
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
            level: word.level || 0
          }
        ]);
      }
    }
  }, [word, allWords]);

  if (!isOpen || !word) return null;

  const handleAddDefinition = () => {
    setDefinitions((prev) => [...prev, { pos: 'n.', def: '', defEn: '', ex: '', level: 0 }]);
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

    const updatedWords: Partial<Word>[] = validDefs.map((d) => ({
      id: d.id,
      term: cleanTerm,
      pos: d.pos,
      def: d.def.trim(),
      defEn: (d.defEn || '').trim() || undefined,
      ex: d.ex.trim(),
      level: d.level
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase text-slate-400">
                {t.lbl_word} <span className="text-rose-500">*</span>
              </label>

              {term.trim() && (
                <button
                  type="button"
                  onClick={handleAiPolish}
                  disabled={isAiLoading}
                  className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/60 transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                  <span>{isAiLoading ? 'AI 聯網重整中...' : 'AI 聯網校正與標準化'}</span>
                </button>
              )}
            </div>
            <input
              type="text"
              required
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 font-bold text-base outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
              <span>{t.hint_edit_multiple}</span>
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
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 relative group"
              >
                {definitions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDefinition(idx)}
                    className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 p-1"
                    title="移除此釋義"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <div className="grid grid-cols-12 gap-2 mb-2">
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

                  <div className="col-span-8 sm:col-span-9">
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
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:opacity-95 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 text-sm transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>儲存修改</span>
          </button>
        </form>
      </div>
    </div>
  );
};
