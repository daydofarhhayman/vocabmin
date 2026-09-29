import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Volume2,
  RotateCw,
  ArrowLeft,
  Filter,
  CheckCircle,
  Sparkles,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { Word, WordGroup, AppSettings } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { tts } from '../services/tts';
import { calculateNextReview } from '../services/srs';
import { getWordDisplayDef, getWordSecondaryDef } from '../utils/wordLang';
import confetti from 'canvas-confetti';

interface ReviewViewProps {
  words: Word[];
  settings: AppSettings;
  onUpdateWordReview: (wordId: string, updates: Partial<Word>) => void;
  onBatchUpdateReview?: (updates: { id: string; data: Partial<Word> }[]) => void;
  onFinishSession: (count: number) => void;
  onBack: () => void;
}

export const ReviewView: React.FC<ReviewViewProps> = ({
  words,
  settings,
  onUpdateWordReview,
  onBatchUpdateReview,
  onFinishSession,
  onBack
}) => {
  const t = TRANSLATIONS[settings.lang];
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeFilters, setActiveFilters] = useState<number[]>([0, 1, 2, 3]);
  const [isFinished, setIsFinished] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState(0);

  // Group or single cards based on settings
  const queue: WordGroup[] = useMemo(() => {
    const now = Date.now();
    const filtered = words.filter((w) => activeFilters.includes(w.level || 0));

    let cardGroups: WordGroup[] = [];

    if (settings.mergeReview ?? true) {
      const map: Record<string, Word[]> = {};
      filtered.forEach((w) => {
        const key = w.term.trim().toLowerCase();
        if (!map[key]) map[key] = [];
        map[key].push(w);
      });

      cardGroups = Object.values(map).map((entries) => {
        const minLevel = Math.min(...entries.map((e) => e.level || 0));
        const minNextReview = Math.min(...entries.map((e) => e.nextReview || now));
        const maxLastReview = Math.max(...entries.map((e) => e.lastReview || 0));
        const avgInterval = Math.round(
          entries.reduce((acc, curr) => acc + (curr.interval || 1), 0) / entries.length
        );

        return {
          term: entries[0].term,
          entries,
          minLevel,
          interval: avgInterval,
          nextReview: minNextReview,
          lastReview: maxLastReview
        };
      });
    } else {
      cardGroups = filtered.map((w) => ({
        term: w.term,
        entries: [w],
        minLevel: w.level || 0,
        interval: w.interval || 1,
        nextReview: w.nextReview || now,
        lastReview: w.lastReview || 0
      }));
    }

    // Sort: Due cards first, then by earliest nextReview
    cardGroups.sort((a, b) => {
      const aDue = a.nextReview <= now;
      const bDue = b.nextReview <= now;
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return a.nextReview - b.nextReview;
    });

    // Apply limit
    const limit = settings.reviewLimit || 30;
    return cardGroups.slice(0, limit);
  }, [words, activeFilters, settings.mergeReview, settings.reviewLimit]);

  const currentCard: WordGroup | undefined = queue[currentIndex];

  // Auto pronunciation when card appears if enabled
  useEffect(() => {
    if (currentCard && settings.autoPlayAudio && !isFlipped) {
      tts.speak(currentCard.term);
    }
  }, [currentIndex, currentCard, settings.autoPlayAudio]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const handleRate = useCallback(
    (rating: number) => {
      if (!currentCard) return;

      const batchUpdates: { id: string; data: Partial<Word> }[] = [];

      currentCard.entries.forEach((word) => {
        const nextData = calculateNextReview(word, rating);
        batchUpdates.push({ id: word.id, data: nextData });
      });

      if (onBatchUpdateReview) {
        onBatchUpdateReview(batchUpdates);
      } else {
        batchUpdates.forEach((u) => onUpdateWordReview(u.id, u.data));
      }

      setReviewedInSession((prev) => prev + 1);

      if (currentIndex + 1 >= queue.length) {
        setIsFinished(true);
        onFinishSession(reviewedInSession + 1);
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch {}
      } else {
        setIsFlipped(false);
        setCurrentIndex((prev) => prev + 1);
      }
    },
    [currentCard, currentIndex, queue.length, onBatchUpdateReview, onUpdateWordReview, onFinishSession, reviewedInSession]
  );

  // Keyboard shortcut listener (with guard against inputs/textareas)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting typing in input fields
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleFlip();
      } else if (e.code === 'ArrowRight' && isFlipped) {
        e.preventDefault();
        handleRate(2); // default Good
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        e.preventDefault();
        const map: Record<string, number> = {
          Digit1: 0,
          Digit2: 1,
          Digit3: 2,
          Digit4: 3
        };
        handleRate(map[e.code]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFlip, handleRate, isFlipped]);

  const toggleFilter = (lvl: number) => {
    setActiveFilters((prev) =>
      prev.includes(lvl) ? (prev.length > 1 ? prev.filter((x) => x !== lvl) : prev) : [...prev, lvl]
    );
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  if (!queue.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-12 px-4 animate-enter">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-xl border border-slate-100 dark:border-slate-700">
          <div className="w-20 h-20 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-5 text-3xl">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            太棒了！目前沒有到期單字
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            {t.hint_no_review_words}，或者目前設定的篩選器沒有匹配的項目。您可以調整篩選條件，或進行隨堂練習測驗！
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setActiveFilters([0, 1, 2, 3])}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition"
            >
              重設為全部熟練度
            </button>
            <button
              onClick={onBack}
              className="w-full py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold transition"
            >
              返回首頁
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-12 px-4 animate-enter">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-slate-100 dark:border-slate-700">
          <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
            今日複習進度達成！
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            本次共複習完成{' '}
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {reviewedInSession}
            </span>{' '}
            組單字卡片，間隔重複演算法已自動為您推延下次記憶強化時間！
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsFinished(false);
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-bold shadow-md transition active:scale-95"
            >
              再複習一輪
            </button>
            <button
              onClick={onBack}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-bold transition"
            >
              返回首頁
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getPOSColor = (pos: string) => {
    switch (pos) {
      case 'n.':
        return 'bg-blue-600 text-white';
      case 'v.':
        return 'bg-pink-600 text-white';
      case 'adj.':
        return 'bg-amber-600 text-white';
      case 'adv.':
        return 'bg-purple-600 text-white';
      case 'phr.':
        return 'bg-teal-600 text-white';
      default:
        return 'bg-slate-600 text-white';
    }
  };

  const daysAgo = currentCard?.lastReview
    ? Math.floor((Date.now() - currentCard.lastReview) / 86400000)
    : 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-4 animate-enter max-w-4xl mx-auto w-full px-4">
      {/* Header bar */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>

        <span className="font-mono font-black text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
          {currentIndex + 1} / {queue.length}
        </span>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-full">
          {[
            { lvl: 0, icon: '😫', label: '陌生' },
            { lvl: 1, icon: '😕', label: '學習' },
            { lvl: 2, icon: '🙂', label: '熟悉' },
            { lvl: 3, icon: '😎', label: '精通' }
          ].map((f) => (
            <button
              key={f.lvl}
              onClick={() => toggleFilter(f.lvl)}
              className={`w-7 h-7 rounded-full text-xs flex items-center justify-center transition ${
                activeFilters.includes(f.lvl)
                  ? 'bg-white dark:bg-slate-600 shadow-sm scale-110'
                  : 'opacity-40 grayscale'
              }`}
              title={f.label}
            >
              {f.icon}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Flashcard Container */}
      <div className="w-full max-w-md flex flex-col items-center">
        <div
          onClick={handleFlip}
          className={`w-full aspect-[4/5] sm:aspect-[1/1.2] relative card-flip-container cursor-pointer select-none mb-6 ${
            isFlipped ? 'flipped' : ''
          }`}
        >
          <div className="card-inner shadow-2xl rounded-[2rem] border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800">
            {/* FRONT OF CARD */}
            <div className="card-front bg-white dark:bg-slate-800 flex flex-col items-center justify-between p-7 sm:p-8">
              <div className="w-full flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      currentCard.minLevel === 3
                        ? 'bg-emerald-500'
                        : currentCard.minLevel === 2
                        ? 'bg-blue-500'
                        : currentCard.minLevel === 1
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  ></span>
                  <span>Level {currentCard.minLevel}</span>
                </span>
                <span className="font-mono">
                  {daysAgo === 0 ? '今日建立' : `${daysAgo} 天前`}
                </span>
              </div>

              {/* Main Word */}
              <div className="flex-1 flex flex-col items-center justify-center w-full my-auto">
                <h2 className="text-4xl sm:text-5xl font-black text-center text-slate-900 dark:text-white break-words w-full leading-tight tracking-tight">
                  {currentCard.term}
                </h2>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    tts.speak(currentCard.term);
                  }}
                  className="mt-6 w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:scale-110 active:scale-95 transition flex items-center justify-center shadow-md shadow-indigo-500/10"
                  title="聆聽英文發音"
                >
                  <Volume2 className="w-6 h-6" />
                </button>
              </div>

              {/* Tap to flip hint */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 animate-pulse font-medium">
                <RotateCw className="w-3.5 h-3.5" />
                <span>{t.hint_flip}</span>
              </div>
            </div>

            {/* BACK OF CARD */}
            <div className="card-back bg-white dark:bg-slate-800 flex flex-col p-6 sm:p-8 overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/80 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    {currentCard.term}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      tts.speak(currentCard.term);
                    }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                  週期: {currentCard.interval}d
                </span>
              </div>

              {/* Definitions and examples */}
              <div className="flex-1 space-y-4">
                {currentCard.entries.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-700/60"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${getPOSColor(
                          entry.pos
                        )}`}
                      >
                        {entry.pos}
                      </span>
                      <div className="flex-1">
                        <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
                          {getWordDisplayDef(entry, settings.lang)}
                        </span>
                        {getWordSecondaryDef(entry, settings.lang) && (
                          <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-normal ml-2 block sm:inline">
                            ({getWordSecondaryDef(entry, settings.lang)})
                          </span>
                        )}
                      </div>
                      {settings.basicMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            tts.speak(getWordDisplayDef(entry, settings.lang));
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-500"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {entry.ex && (
                      <div className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 flex items-start justify-between gap-2">
                        <span>"{entry.ex}"</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            tts.speak(entry.ex!);
                          }}
                          className="text-slate-400 hover:text-indigo-500 p-1 flex-shrink-0"
                          title="朗讀例句"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-center text-[11px] text-slate-400">
                點擊下方按鈕以更新間隔記憶曲線
              </div>
            </div>
          </div>
        </div>

        {/* 4-Level Rating Buttons */}
        <div className="w-full grid grid-cols-4 gap-2">
          {/* Rating 0: Again / 陌生 */}
          <button
            onClick={() => handleRate(0)}
            className="py-3 px-2 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/50 flex flex-col items-center justify-center transition active:scale-95 shadow-sm group"
          >
            <span className="text-xl mb-1 group-hover:scale-125 transition-transform">😫</span>
            <span className="text-xs font-black">{t.lvl_new}</span>
            <span className="text-[10px] font-mono opacity-70 mt-0.5">1天後</span>
          </button>

          {/* Rating 1: Hard / 學習 */}
          <button
            onClick={() => handleRate(1)}
            className="py-3 px-2 rounded-2xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50 flex flex-col items-center justify-center transition active:scale-95 shadow-sm group"
          >
            <span className="text-xl mb-1 group-hover:scale-125 transition-transform">😕</span>
            <span className="text-xs font-black">{t.lvl_learning}</span>
            <span className="text-[10px] font-mono opacity-70 mt-0.5">2~3天</span>
          </button>

          {/* Rating 2: Good / 熟悉 */}
          <button
            onClick={() => handleRate(2)}
            className="py-3 px-2 rounded-2xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/50 flex flex-col items-center justify-center transition active:scale-95 shadow-sm group"
          >
            <span className="text-xl mb-1 group-hover:scale-125 transition-transform">🙂</span>
            <span className="text-xs font-black">{t.lvl_familiar}</span>
            <span className="text-[10px] font-mono opacity-70 mt-0.5">延長週期</span>
          </button>

          {/* Rating 3: Easy / 精通 */}
          <button
            onClick={() => handleRate(3)}
            className="py-3 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50 flex flex-col items-center justify-center transition active:scale-95 shadow-sm group"
          >
            <span className="text-xl mb-1 group-hover:scale-125 transition-transform">😎</span>
            <span className="text-xs font-black">{t.lvl_mastered}</span>
            <span className="text-[10px] font-mono opacity-70 mt-0.5">大幅跳增</span>
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="mt-4 text-[11px] text-slate-400 font-medium hidden sm:block">
          {t.hint_keyboard}
        </p>
      </div>
    </div>
  );
};
