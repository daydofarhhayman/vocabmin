import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  BookOpen,
  Edit2,
  Trash2,
  Clock,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Plus,
  Check,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { WordGroup, Word, POS, AppSettings } from '../types';
import { tts } from '../services/tts';
import { getWordDisplayDef, getWordSecondaryDef } from '../utils/wordLang';
import { TRANSLATIONS } from '../utils/translations';
import { storage } from '../services/storage';

interface WordDetailModalProps {
  group: WordGroup | null;
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onEditWord: (word: Word) => void;
  onDeleteGroup: (term: string) => void;
  onDeleteSingleWord?: (wordId: string, term: string, defSnippet?: string) => void;
  onAddWords?: (newWords: Partial<Word>[]) => void;
  onUpdateWordGroup?: (oldTerm: string, updatedList: Partial<Word>[]) => void;
  onOpenCambridge: (word: string) => void;
  onPrevWord?: () => void;
  onNextWord?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

interface DiscoveredMeaning {
  pos: POS;
  def: string;
  defEn?: string;
  ex?: string;
}

export const WordDetailModal: React.FC<WordDetailModalProps> = ({
  group,
  isOpen,
  onClose,
  settings,
  onEditWord,
  onDeleteGroup,
  onDeleteSingleWord,
  onAddWords,
  onOpenCambridge,
  onPrevWord,
  onNextWord,
  hasPrev = false,
  hasNext = false,
  currentIndex,
  totalCount
}) => {
  const t = TRANSLATIONS[settings.lang];

  // Inline add definition state
  const [isAddingDef, setIsAddingDef] = useState(false);
  const [newPos, setNewPos] = useState<POS>('n.');
  const [newDef, setNewDef] = useState('');
  const [newDefEn, setNewDefEn] = useState('');
  const [newEx, setNewEx] = useState('');

  // AI Discover Polysemy / other meanings state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiDiscoveredMeanings, setAiDiscoveredMeanings] = useState<DiscoveredMeaning[]>([]);
  const [aiQueried, setAiQueried] = useState(false);
  const [addedAiIndices, setAddedAiIndices] = useState<Record<number, boolean>>({});

  // Reset local state when modal opens or word group changes
  useEffect(() => {
    setIsAddingDef(false);
    setNewPos('n.');
    setNewDef('');
    setNewDefEn('');
    setNewEx('');
    setAiDiscoveredMeanings([]);
    setAiQueried(false);
    setAddedAiIndices({});
  }, [group?.term, isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || !group) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an input is focused
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrev && onPrevWord) {
        onPrevWord();
      } else if (e.key === 'ArrowRight' && hasNext && onNextWord) {
        onNextWord();
      } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        tts.speak(group.term);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, group, hasPrev, hasNext, onPrevWord, onNextWord, onClose]);

  if (!isOpen || !group) return null;

  const primaryWord = group.entries[0];
  const now = Date.now();
  const isDue = group.nextReview <= now;
  const daysUntil = Math.ceil((group.nextReview - now) / 86400000);

  const getPOSColor = (pos: POS | string) => {
    switch (pos) {
      case 'n.':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'v.':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'adj.':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'adv.':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'phr.':
        return 'bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const getLevelInfo = (level: number) => {
    switch (level) {
      case 3:
        return {
          label: t.lvl_mastered || '精通 (Lvl 3)',
          color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800'
        };
      case 2:
        return {
          label: t.lvl_familiar || '熟悉 (Lvl 2)',
          color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200/80 dark:border-blue-800'
        };
      case 1:
        return {
          label: t.lvl_learning || '學習中 (Lvl 1)',
          color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200/80 dark:border-amber-800'
        };
      default:
        return {
          label: t.lvl_new || '陌生 (Lvl 0)',
          color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200/80 dark:border-rose-800'
        };
    }
  };

  const levelInfo = getLevelInfo(group.minLevel);

  // Handle submitting inline new definition
  const handleSaveInlineDef = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDef = newDef.trim();
    if (!cleanDef || !onAddWords) return;

    onAddWords([
      {
        term: group.term,
        pos: newPos,
        def: cleanDef,
        defEn: newDefEn.trim() || undefined,
        ex: newEx.trim() || undefined,
        level: 0,
        interval: 1,
        easeFactor: 2.5
      }
    ]);

    // Reset inline form
    setNewDef('');
    setNewDefEn('');
    setNewEx('');
    setIsAddingDef(false);
  };

  // AI Discover Polysemy (一詞多義)
  const handleDiscoverPolysemy = async () => {
    if (isAiLoading) return;
    setIsAiLoading(true);
    setAiQueried(true);

    const currentSettings = storage.getLocalSettings();
    const apiKey = currentSettings?.geminiApiKey;

    try {
      const res = await fetch('/api/ai/word-all-meanings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
        },
        body: JSON.stringify({
          term: group.term,
          apiKey
        })
      });

      if (!res.ok) throw new Error('Query failed');
      const data = await res.json();

      if (Array.isArray(data.meanings)) {
        // Filter out definitions that the user already has in group.entries
        const existingDefs = group.entries.map((e) => ({
          pos: (e.pos || '').trim().toLowerCase(),
          def: e.def.trim().toLowerCase()
        }));

        const missing = (data.meanings as DiscoveredMeaning[]).filter((m) => {
          const normDef = m.def.trim().toLowerCase();
          const normPos = (m.pos || '').trim().toLowerCase();
          // Check if any existing entry matches or substantially overlaps
          const isAlreadyCovered = existingDefs.some((e) => {
            if (e.pos === normPos) {
              return (
                e.def === normDef ||
                e.def.includes(normDef) ||
                normDef.includes(e.def)
              );
            }
            return false;
          });
          return !isAlreadyCovered;
        });

        setAiDiscoveredMeanings(missing);
      }
    } catch (err) {
      console.warn('Polysemy discovery error:', err);
      setAiDiscoveredMeanings([]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // 1-Click Add Discovered AI Meaning
  const handleAddAiMeaning = (m: DiscoveredMeaning, idx: number) => {
    if (!onAddWords || addedAiIndices[idx]) return;

    onAddWords([
      {
        term: group.term,
        pos: m.pos,
        def: m.def.trim(),
        defEn: m.defEn ? m.defEn.trim() : undefined,
        ex: m.ex ? m.ex.trim() : undefined,
        level: 0,
        interval: 1,
        easeFactor: 2.5
      }
    ]);

    setAddedAiIndices((prev) => ({ ...prev, [idx]: true }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-sm animate-enter"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar with count indicator and close button */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700/60 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              單字詳情
            </span>
            {currentIndex !== undefined && totalCount !== undefined && (
              <span className="text-xs font-mono text-slate-400">
                {currentIndex + 1} / {totalCount}
              </span>
            )}
            {group.entries.length > 1 && (
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/50">
                一詞多義 ({group.entries.length} 義)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Prev / Next buttons */}
            <button
              disabled={!hasPrev}
              onClick={onPrevWord}
              title="上一個單字 (←)"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={!hasNext}
              onClick={onNextWord}
              title="下一個單字 (→)"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60 transition ml-1"
              title="關閉 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-5 flex-1">
          {/* Header Card: Word Term, Audio, Cambridge */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-slate-50 dark:from-indigo-950/30 dark:to-slate-900/40 border border-indigo-100/80 dark:border-indigo-900/40 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider block mb-1">
                Vocabulary
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white capitalize tracking-tight truncate">
                {group.term}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => tts.speak(group.term)}
                className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-md shadow-indigo-500/20 active:scale-95 transition"
                title="聆聽發音 (Space / P)"
              >
                <Volume2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => onOpenCambridge(group.term)}
                className="p-3 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-2xl border border-slate-200/80 dark:border-slate-600 shadow-sm active:scale-95 transition"
                title="劍橋字典查詢"
              >
                <BookOpen className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* SRS Progress & Level Information */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {/* Level Card */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">
                綜合熟練度
              </span>
              <span
                className={`inline-block text-xs font-bold px-2 py-0.5 rounded-lg border ${levelInfo.color}`}
              >
                {levelInfo.label}
              </span>
            </div>

            {/* SRS Review Due */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3" />
                複習狀態
              </span>
              {isDue ? (
                <span className="text-xs font-bold text-rose-500 flex items-center gap-1">
                  待複習 (Due!)
                </span>
              ) : (
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {daysUntil} 天後複習
                </span>
              )}
            </div>

            {/* Interval */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700/60 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                間隔週期
              </span>
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {group.interval} 天 (Day{group.interval > 1 ? 's' : ''})
              </span>
            </div>
          </div>

          {/* Definitions & Examples Header */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-indigo-500" />
                <span>已收錄釋義 ({group.entries.length})</span>
              </h4>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingDef((prev) => !prev)}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 transition active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingDef ? '收合表單' : '新增釋義'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDiscoverPolysemy}
                  disabled={isAiLoading}
                  className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60 transition active:scale-95 disabled:opacity-50"
                  title="由 AI 查詢此單字其他常見詞性與釋義"
                >
                  {isAiLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{isAiLoading ? '探索中...' : 'AI 探索更多釋義'}</span>
                </button>
              </div>
            </div>

            {/* Inline Add Definition Form */}
            {isAddingDef && (
              <form
                onSubmit={handleSaveInlineDef}
                className="mb-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 space-y-3 animate-enter"
              >
                <div className="flex items-center justify-between pb-1 border-b border-indigo-100 dark:border-indigo-900/40">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    為「{group.term}」追加新的詞性或釋義
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingDef(false)}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4 sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">詞性</label>
                    <select
                      value={newPos}
                      onChange={(e) => setNewPos(e.target.value as POS)}
                      className="w-full p-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold outline-none cursor-pointer"
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
                      value={newDef}
                      onChange={(e) => setNewDef(e.target.value)}
                      placeholder="例如：銀行、河岸、把...存入銀行..."
                      className="w-full p-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-medium outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    英文釋義 (選填)
                  </label>
                  <input
                    type="text"
                    value={newDefEn}
                    onChange={(e) => setNewDefEn(e.target.value)}
                    placeholder="English definition..."
                    className="w-full p-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">
                    英文例句 (選填)
                  </label>
                  <input
                    type="text"
                    value={newEx}
                    onChange={(e) => setNewEx(e.target.value)}
                    placeholder="Short natural example sentence..."
                    className="w-full p-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingDef(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-xs font-bold transition"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition active:scale-95 shadow-sm"
                  >
                    確認收錄
                  </button>
                </div>
              </form>
            )}

            {/* AI Discovered Meanings Section */}
            {aiQueried && (
              <div className="mb-4 p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/60 space-y-3 animate-enter">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>AI 聯網探測到此單字的其他常用釋義：</span>
                  </span>
                  <button
                    onClick={() => setAiQueried(false)}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isAiLoading ? (
                  <div className="py-4 text-center text-xs text-purple-600 dark:text-purple-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在全面查詢權威詞典之一詞多義...</span>
                  </div>
                ) : aiDiscoveredMeanings.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                    ✨ 棒極了！您已收錄此單字的所有主要常用釋義，目前無其他高頻義項遺漏。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {aiDiscoveredMeanings.map((m, idx) => {
                      const isAdded = !!addedAiIndices[idx];
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-purple-100 dark:border-purple-900/50 flex items-start justify-between gap-3 shadow-xs"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${getPOSColor(
                                  m.pos
                                )}`}
                              >
                                {m.pos}
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {m.def}
                              </span>
                            </div>
                            {m.defEn && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                                {m.defEn}
                              </p>
                            )}
                            {m.ex && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                "{m.ex}"
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddAiMeaning(m, idx)}
                            disabled={isAdded}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition shrink-0 active:scale-95 ${
                              isAdded
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                            }`}
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>已收錄</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>收錄此釋義</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* List of Existing Definitions */}
            <div className="space-y-3.5">
              {group.entries.map((entry, idx) => {
                const entryLevelInfo = getLevelInfo(entry.level || 0);

                return (
                  <div
                    key={entry.id || idx}
                    className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/60 space-y-2.5 transition hover:border-slate-300 dark:hover:border-slate-600 relative group"
                  >
                    {/* Top line: POS badge, Mastery Level, and individual Action buttons */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-lg font-mono uppercase tracking-wider border shrink-0 ${getPOSColor(
                            entry.pos
                          )}`}
                        >
                          {entry.pos}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${entryLevelInfo.color}`}
                        >
                          {entryLevelInfo.label}
                        </span>
                      </div>

                      {/* Per-definition Edit & Delete controls */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            onClose();
                            onEditWord(entry);
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/50 dark:hover:bg-slate-700 rounded-lg transition"
                          title="編輯此項釋義"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (group.entries.length > 1 && onDeleteSingleWord) {
                              onDeleteSingleWord(entry.id, group.term, entry.def);
                            } else {
                              onClose();
                              onDeleteGroup(group.term);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          title={group.entries.length > 1 ? '刪除此項釋義' : '刪除單字'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Definition line */}
                    <div>
                      <p className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                        {getWordDisplayDef(entry, settings.lang)}
                      </p>
                      {getWordSecondaryDef(entry, settings.lang) && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {getWordSecondaryDef(entry, settings.lang)}
                        </p>
                      )}
                    </div>

                    {/* Example Sentence */}
                    {entry.ex && (
                      <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/80 flex items-start justify-between gap-2">
                        <div className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed pl-2 border-l-2 border-indigo-400 dark:border-indigo-500">
                          "{entry.ex}"
                        </div>
                        <button
                          onClick={() => tts.speak(entry.ex!)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-lg shrink-0 transition"
                          title="朗讀例句"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:px-6 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                onClose();
                onEditWord(primaryWord);
              }}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              title="進入完整編輯視窗管理所有釋義"
            >
              <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>管理全部釋義</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onDeleteGroup(group.term);
              }}
              className="px-3.5 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
              title="從單字庫中刪除此單字及其所有詞性釋義"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>整組刪除</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200/80 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-bold transition active:scale-95"
          >
            {t.btn_cancel || '關閉'}
          </button>
        </div>
      </div>
    </div>
  );
};
