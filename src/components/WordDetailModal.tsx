import React, { useEffect } from 'react';
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
  Bookmark
} from 'lucide-react';
import { WordGroup, Word, POS, AppSettings } from '../types';
import { tts } from '../services/tts';
import { getWordDisplayDef, getWordSecondaryDef } from '../utils/wordLang';
import { TRANSLATIONS } from '../utils/translations';

interface WordDetailModalProps {
  group: WordGroup | null;
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onEditWord: (word: Word) => void;
  onDeleteGroup: (term: string) => void;
  onOpenCambridge: (word: string) => void;
  onPrevWord?: () => void;
  onNextWord?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export const WordDetailModal: React.FC<WordDetailModalProps> = ({
  group,
  isOpen,
  onClose,
  settings,
  onEditWord,
  onDeleteGroup,
  onOpenCambridge,
  onPrevWord,
  onNextWord,
  hasPrev = false,
  hasNext = false,
  currentIndex,
  totalCount
}) => {
  const t = TRANSLATIONS[settings.lang];

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
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              單字詳情
            </span>
            {currentIndex !== undefined && totalCount !== undefined && (
              <span className="text-xs font-mono text-slate-400">
                {currentIndex + 1} / {totalCount}
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
        <div className="overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-5">
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
                熟練度等級
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

          {/* Definitions & Examples */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-indigo-500" />
                <span>釋義與例句 ({group.entries.length})</span>
              </h4>
            </div>

            <div className="space-y-3.5">
              {group.entries.map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/60 space-y-2.5 transition hover:border-slate-300 dark:hover:border-slate-600"
                >
                  {/* Definition line */}
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg font-mono uppercase tracking-wider border shrink-0 mt-0.5 ${getPOSColor(
                        entry.pos
                      )}`}
                    >
                      {entry.pos}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                        {getWordDisplayDef(entry, settings.lang)}
                      </p>
                      {getWordSecondaryDef(entry, settings.lang) && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {getWordSecondaryDef(entry, settings.lang)}
                        </p>
                      )}
                    </div>
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
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:px-6 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                onClose();
                onEditWord(primaryWord);
              }}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>{t.btn_edit || '編輯單字'}</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onDeleteGroup(group.term);
              }}
              className="px-3.5 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.btn_delete || '刪除'}</span>
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
