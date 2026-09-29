import React, { useState } from 'react';
import { Article, Word } from '../types';
import {
  BookOpen,
  Bookmark,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Volume2,
  Sparkles,
  Layers,
  GraduationCap,
  Plus,
  FileText,
  Clock,
  Compass
} from 'lucide-react';

interface AIArticleCardProps {
  article: Partial<Article>;
  onSave?: (article: Article) => void;
  onOpenInReader?: (article: Article) => void;
  isSaved?: boolean;
  onAddWords?: (words: Partial<Word>[]) => void;
  onOpenCambridge?: (term: string) => void;
  compact?: boolean;
}

export const AIArticleCard: React.FC<AIArticleCardProps> = ({
  article,
  onSave,
  onOpenInReader,
  isSaved: externalIsSaved = false,
  onAddWords,
  onOpenCambridge,
  compact = false
}) => {
  const [isSavedLocally, setIsSavedLocally] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [showGrammar, setShowGrammar] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [addedWordsMap, setAddedWordsMap] = useState<Record<string, boolean>>({});

  const isSaved = externalIsSaved || isSavedLocally;

  const contentParagraphs = (article.content || '').split(/\n\n+/).filter(Boolean);
  const zhParagraphs = (article.translationZh || '').split(/\n\n+/).filter(Boolean);

  const wordCount = article.wordCount || (article.content || '').split(/\s+/).filter(Boolean).length;
  const readTime = article.readTimeMinutes || Math.max(1, Math.round(wordCount / 130));

  const grammarPoints = Array.isArray(article.grammarPoints) ? article.grammarPoints : [];
  const keyVocab = Array.isArray(article.keyVocabulary) ? article.keyVocabulary : [];

  const handleSaveArticle = () => {
    if (isSaved) return;
    const fullArticle: Article = {
      id: article.id || `art-ai-${Date.now()}`,
      title: article.title || 'Contextual Reading Article',
      subtitle: article.subtitle,
      author: article.author || 'VocabMin AI',
      source: article.source || 'AI Contextual Library',
      level: article.level || 'B2',
      category: article.category || 'Tech',
      content: article.content || '',
      translationZh: article.translationZh || '',
      summary: article.summary || '',
      wordCount,
      readTimeMinutes: readTime,
      savedWordTerms: [],
      isCustom: true,
      grammarPoints: article.grammarPoints,
      keyVocabulary: article.keyVocabulary,
      quiz: article.quiz
    };

    onSave?.(fullArticle);
    setIsSavedLocally(true);
  };

  const handleOpenReader = () => {
    const fullArticle: Article = {
      id: article.id || `art-ai-${Date.now()}`,
      title: article.title || 'Contextual Reading Article',
      subtitle: article.subtitle,
      author: article.author || 'VocabMin AI',
      source: article.source || 'AI Contextual Library',
      level: article.level || 'B2',
      category: article.category || 'Tech',
      content: article.content || '',
      translationZh: article.translationZh || '',
      summary: article.summary || '',
      wordCount,
      readTimeMinutes: readTime,
      savedWordTerms: [],
      isCustom: true,
      grammarPoints: article.grammarPoints,
      keyVocabulary: article.keyVocabulary,
      quiz: article.quiz
    };

    onOpenInReader?.(fullArticle);
  };

  const handleAddSingleWord = (w: any, index: number) => {
    const key = `vocab-${index}-${w.term}`;
    if (addedWordsMap[key]) return;

    onAddWords?.([
      {
        term: w.term,
        pos: w.pos || 'n.',
        def: w.def || '',
        defEn: w.defEn || '',
        ex: w.ex || ''
      }
    ]);
    setAddedWordsMap((prev) => ({ ...prev, [key]: true }));
  };

  const handleAddAllKeyVocab = () => {
    if (!keyVocab.length) return;
    const formatted = keyVocab.map((w: any) => ({
      term: w.term,
      pos: w.pos || 'n.',
      def: w.def || '',
      defEn: w.defEn || '',
      ex: w.ex || ''
    }));
    onAddWords?.(formatted);

    const updated = { ...addedWordsMap };
    keyVocab.forEach((w: any, idx: number) => {
      updated[`vocab-${idx}-${w.term}`] = true;
    });
    setAddedWordsMap(updated);
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  // Level badge color
  const getLevelBadgeClass = (lvl?: string) => {
    switch (lvl) {
      case 'C1':
      case 'C2':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'B2':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800';
      case 'B1':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      default:
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-200/90 dark:border-indigo-900/70 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 dark:from-slate-900/95 dark:via-slate-900 dark:to-indigo-950/40 shadow-sm overflow-hidden space-y-3 p-3.5 sm:p-4 transition-all">
      {/* Article Top Meta */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-xs">
            <BookOpen className="w-3 h-3" />
            <span>精讀文章</span>
          </span>

          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getLevelBadgeClass(article.level)}`}>
            CEFR {article.level || 'B2'}
          </span>

          {article.category && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {article.category}
            </span>
          )}

          <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 font-medium ml-1">
            <Clock className="w-3 h-3" />
            <span>{wordCount} 字 · 約 {readTime} 分鐘</span>
          </span>
        </div>

        {isSaved && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0 animate-fade-in">
            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>已收錄在庫</span>
          </span>
        )}
      </div>

      {/* Title & Source */}
      <div>
        <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-snug tracking-tight">
          {article.title || '英文閱讀文章'}
        </h3>
        {article.subtitle && (
          <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 font-medium mt-0.5">
            {article.subtitle}
          </p>
        )}
        {(article.author || article.source) && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            來源：{article.author || article.source}
          </p>
        )}
      </div>

      {/* Summary Box */}
      {article.summary && (
        <div className="p-2.5 sm:p-3 rounded-xl bg-white/90 dark:bg-slate-800/80 border border-indigo-100 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-200 leading-relaxed shadow-2xs">
          <div className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400 text-[11px] mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>文章核心主旨</span>
          </div>
          <p className="line-clamp-3">{article.summary}</p>
        </div>
      )}

      {/* Primary Action Buttons Bar */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          onClick={handleSaveArticle}
          disabled={isSaved}
          className={`flex-1 min-w-[140px] py-2 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition active:scale-[0.98] ${
            isSaved
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800 cursor-default'
              : 'bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white cursor-pointer ring-2 ring-indigo-400/20'
          }`}
        >
          {isSaved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>已收錄至文章閱讀庫</span>
            </>
          ) : (
            <>
              <Bookmark className="w-3.5 h-3.5" />
              <span>📚 一鍵收錄至文章閱讀庫</span>
            </>
          )}
        </button>

        {onOpenInReader && (
          <button
            onClick={handleOpenReader}
            className="py-2 px-3.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-2xs flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>在閱讀器中研讀</span>
          </button>
        )}
      </div>

      {/* Collapsible Disclosure Toggles */}
      <div className="pt-1 space-y-2">
        {/* 1. Bilingual Text Toggle */}
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-800/50 overflow-hidden">
          <button
            onClick={() => setShowFullText(!showFullText)}
            className="w-full py-2 px-3 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition"
          >
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              <span>中英雙語全文對照 ({contentParagraphs.length} 段)</span>
            </span>
            {showFullText ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {showFullText && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900/80 max-h-72 overflow-y-auto">
              {contentParagraphs.map((enP, idx) => (
                <div key={idx} className="space-y-1 text-xs">
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-serif">
                    {enP}
                  </p>
                  {zhParagraphs[idx] && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pl-2 border-l-2 border-indigo-400/40">
                      {zhParagraphs[idx]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Grammar Points Breakdown Toggle */}
        {grammarPoints.length > 0 && (
          <div className="rounded-xl border border-purple-200/80 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 overflow-hidden">
            <button
              onClick={() => setShowGrammar(!showGrammar)}
              className="w-full py-2 px-3 flex items-center justify-between text-xs font-bold text-purple-800 dark:text-purple-300 hover:bg-purple-100/40 dark:hover:bg-purple-950/40 transition"
            >
              <span className="flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>長難句語法深度拆解 ({grammarPoints.length} 處考點)</span>
              </span>
              {showGrammar ? (
                <ChevronUp className="w-3.5 h-3.5 text-purple-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
              )}
            </button>

            {showGrammar && (
              <div className="p-3 border-t border-purple-100 dark:border-purple-900/40 space-y-2.5 max-h-72 overflow-y-auto">
                {grammarPoints.map((gp: any, gIdx: number) => (
                  <div
                    key={gIdx}
                    className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-purple-100 dark:border-purple-900/50 space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                        {gp.grammarType || `語法剖析 #${gIdx + 1}`}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 italic">
                      "{gp.sentence}"
                    </p>

                    {gp.structure && (
                      <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900/80 text-[10px] font-mono text-purple-700 dark:text-purple-300 leading-normal border border-slate-200/60 dark:border-slate-800">
                        <span className="font-bold text-slate-400 mr-1">[結構公式]:</span>
                        {gp.structure}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {gp.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Key Vocabulary Chips Toggle */}
        {keyVocab.length > 0 && (
          <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden">
            <div className="py-2 px-3 flex items-center justify-between text-xs font-bold text-indigo-800 dark:text-indigo-300">
              <button
                onClick={() => setShowVocab(!showVocab)}
                className="flex items-center gap-1.5 hover:opacity-80 transition"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>文章核心進階生詞 ({keyVocab.length} 字)</span>
                {showVocab ? (
                  <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                )}
              </button>

              {onAddWords && (
                <button
                  onClick={handleAddAllKeyVocab}
                  className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs transition active:scale-95"
                >
                  <Plus className="w-3 h-3" />
                  <span>全部收錄至字庫</span>
                </button>
              )}
            </div>

            {showVocab && (
              <div className="p-2.5 border-t border-indigo-100 dark:border-indigo-900/40 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                {keyVocab.map((w: any, vIdx: number) => {
                  const itemKey = `vocab-${vIdx}-${w.term}`;
                  const isWordAdded = !!addedWordsMap[itemKey];

                  return (
                    <div
                      key={vIdx}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-1.5 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white capitalize">
                            {w.term}
                          </span>
                          <span className="text-[9px] font-mono px-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                            {w.pos || 'n.'}
                          </span>
                          {w.level && (
                            <span className="text-[9px] font-bold px-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                              {w.level}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                          {w.def}
                        </p>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => w.term && speak(w.term)}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="發音"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                        {onOpenCambridge && (
                          <button
                            onClick={() => w.term && onOpenCambridge(w.term)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600"
                            title="劍橋字典"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                        {onAddWords && (
                          <button
                            onClick={() => handleAddSingleWord(w, vIdx)}
                            disabled={isWordAdded}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 transition ${
                              isWordAdded
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-600 hover:text-white'
                            }`}
                          >
                            {isWordAdded ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                            <span>{isWordAdded ? '已加入' : '收錄'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
