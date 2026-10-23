import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Volume2,
  Plus,
  Check,
  Trash2,
  Maximize2,
  BookOpen,
  Target,
  Microscope,
  ArrowRight
} from 'lucide-react';
import {
  Word,
  Article,
  ViewTab,
  POS,
  AppSettings,
  DailyStats
} from '../types';
import type { ActiveStudyQuestion } from './StudyHubView';
import { tts } from '../services/tts';
import { storage } from '../services/storage';
import { normalizePos } from '../utils/pos';
import { MarkdownRenderer } from './MarkdownRenderer';

interface FloatingAIAssistantProps {
  userUid?: string | null;
  currentTab: ViewTab;
  words: Word[];
  articles: Article[];
  dueWordsCount: number;
  dailyStats: DailyStats;
  activeReaderArticleId?: string | null;
  activeStudyQuestion?: ActiveStudyQuestion | null;
  activeInspectedWord?: string | null;
  onAddWords: (newWords: Partial<Word>[]) => any;
  onUpdateWordGroup: (oldTerm: string, updatedList: Partial<Word>[], category?: string) => any;
  onBatchStandardizeWords: (updatedWords: Partial<Word>[]) => any;
  onOpenCambridge: (term: string) => void;
  onNavigateToTab: (tab: ViewTab) => void;
  settings?: AppSettings;
  onClearAllArticles?: () => any;
  onDeleteArticle?: (titleOrId: string) => any;
  onClearAllWords?: () => any;
  onDeleteWordGroup?: (term: string, skipConfirm?: boolean) => any;
  onDeduplicateWords?: () => any;
  onResetAllMastery?: () => any;
  onSaveArticle?: (article: Article) => any;
  onOpenArticleInReader?: (article: Article) => any;
  onUpdateTermCategory?: (term: string, category?: string) => any;
  onBatchUpdateTermsCategory?: (terms: string[], category?: string) => any;
  onAddCategory?: (cat: string) => any;
  onRenameCategory?: (oldCat: string, newCat: string) => any;
  onDeleteCategory?: (cat: string) => any;
  onRequestConfirm?: (config: {
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
    confirmText?: string;
    onConfirm: () => void;
  }) => void;
}

interface CopilotWord {
  term: string;
  pos: POS;
  def: string;
  defEn: string;
  ex: string;
  category?: string;
}

interface CopilotMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  recommendedWords?: CopilotWord[];
  followUpSuggestions?: string[];
  isError?: boolean;
}

export const FloatingAIAssistant: React.FC<FloatingAIAssistantProps> = ({
  userUid,
  currentTab,
  words,
  articles,
  dueWordsCount,
  activeReaderArticleId,
  activeStudyQuestion,
  activeInspectedWord,
  onAddWords,
  onNavigateToTab,
  settings
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedToastMap, setSavedToastMap] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const speak = (text: string) => {
    tts.speak(text, {
      rate: settings?.speechRate ?? 1.0,
      voiceURI: settings?.voiceURI
    });
  };

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const currentSettings = settings || storage.getLocalSettings(userUid || undefined);
    const apiKey = currentSettings?.geminiApiKey?.trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };
    if (apiKey) {
      headers['x-gemini-api-key'] = apiKey;
    }
    return fetch(url, {
      ...options,
      headers
    });
  };

  const storageScope = userUid || 'guest';
  const storageKey = `vocabmin_copilot_v2_${storageScope}`;

  const [messages, setMessages] = useState<CopilotMessage[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'copilot-init',
        role: 'model',
        content:
          '嗨！我是您的 **隨身情境英語助教**。\n我會自動感知您目前正在進行的**複習題目**、**閱讀文章**或**檢視單字**，隨時為您提供精準的繁體中文解析！'
      }
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  const existingTermsSet = useMemo(() => {
    const s = new Set<string>();
    words.forEach((w) => {
      if (w.term) s.add(w.term.trim().toLowerCase());
    });
    return s;
  }, [words]);

  const activeArticle = useMemo(() => {
    if (currentTab !== 'reader' || !activeReaderArticleId) return null;
    return articles.find((a) => a.id === activeReaderArticleId) || null;
  }, [currentTab, activeReaderArticleId, articles]);

  // Dynamic Contextual Chips based on what the user is looking at right now
  const contextualChips = useMemo(() => {
    if (activeInspectedWord) {
      return [
        `拆解「${activeInspectedWord}」的字根、語感與記憶口訣`,
        `「${activeInspectedWord}」有哪些常見搭配詞與近義詞差異？`,
        `幫我用「${activeInspectedWord}」造 3 個不同情境的實用句子`
      ];
    }
    if ((currentTab === 'review' || currentTab === 'quiz') && activeStudyQuestion) {
      const t = activeStudyQuestion.term;
      return [
        `解析這道題目的語境與「${t}」的用法`,
        `提供「${t}」的秒記口訣與字根拆解`,
        activeStudyQuestion.options && activeStudyQuestion.options.length > 0
          ? `比較本題四個選項 [${activeStudyQuestion.options.join(', ')}] 的意思差別`
          : `幫我用「${t}」造兩個實用生活例句`
      ];
    }
    if (activeArticle) {
      return [
        `用繁體中文總結《${activeArticle.title}》的核心重點`,
        `從這篇文章挑出 5 個值得收錄的核心生詞`,
        `挑出本文中結構最複雜的 2 個長難句並解析文法`
      ];
    }
    return [
      '推薦 5 個職場高頻英文單字',
      '幫我分辨英文各種時態的核心語感',
      '如何有效利用間隔重複法背單字？'
    ];
  }, [currentTab, activeStudyQuestion, activeInspectedWord, activeArticle]);

  // Active Context Banner Info
  const activeContextBanner = useMemo(() => {
    if (activeInspectedWord) {
      return {
        icon: <Microscope className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />,
        label: `當前鎖定單字：${activeInspectedWord}`
      };
    }
    if ((currentTab === 'review' || currentTab === 'quiz') && activeStudyQuestion) {
      return {
        icon: <Target className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />,
        label: `當前測驗目標：${activeStudyQuestion.term} (${activeStudyQuestion.def})`
      };
    }
    if (activeArticle) {
      return {
        icon: <BookOpen className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />,
        label: `正在閱讀：《${activeArticle.title}》`
      };
    }
    return null;
  }, [currentTab, activeStudyQuestion, activeInspectedWord, activeArticle]);

  // Hide Floating Orb when user is already inside the full-page AI Studio
  if (currentTab === 'ai') {
    return null;
  }

  const handleSaveWord = (w: CopilotWord) => {
    const cleanTerm = w.term.trim();
    if (!cleanTerm) return;
    onAddWords([
      {
        term: cleanTerm,
        pos: normalizePos(w.pos),
        def: w.def.trim(),
        defEn: (w.defEn || '').trim(),
        ex: (w.ex || '').trim(),
        category: w.category || '未分類'
      }
    ]);
    setSavedToastMap((prev) => ({ ...prev, [cleanTerm.toLowerCase()]: true }));
  };

  const handleSend = async (overridePrompt?: string) => {
    const promptText = (overridePrompt ?? input).trim();
    if (!promptText || isLoading) return;
    if (!overridePrompt) setInput('');

    const userMsg: CopilotMessage = {
      id: `cu-${Date.now()}`,
      role: 'user',
      content: promptText
    };

    const historyForApi = messages
      .filter((m) => !m.isError && m.id !== 'copilot-init')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await apiFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'tutor',
          userPrompt: promptText,
          messages: historyForApi,
          currentArticle: activeArticle,
          screenContext: {
            currentTab,
            totalWordsCount: words.length,
            dueWordsCount,
            totalArticlesCount: articles.length,
            isReadingArticle: !!activeArticle,
            activeArticleTitle: activeArticle?.title,
            activeStudyQuestion:
              currentTab === 'review' || currentTab === 'quiz' ? activeStudyQuestion : null,
            activeInspectedWord,
            allCategories: settings?.customCategories || []
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'AI 助教暫時無法回應');
      }

      const botMsg: CopilotMessage = {
        id: `cb-${Date.now()}`,
        role: 'model',
        content: data.reply || '已為您整理分析結果。',
        recommendedWords: Array.isArray(data.recommendedWords) ? data.recommendedWords : [],
        followUpSuggestions: Array.isArray(data.followUpSuggestions) ? data.followUpSuggestions : []
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `cerr-${Date.now()}`,
          role: 'model',
          content: `⚠️ **提示**：${err.message || '請確認網路連線或至右上角「設定」檢查 Gemini API Key。'}`,
          isError: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 group flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-xl shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all"
          title="開啟隨身 AI 情境助教"
        >
          <div className="relative flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
            {activeContextBanner && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-indigo-600" />
            )}
          </div>
          <span className="text-xs sm:text-sm font-black tracking-wide">AI 隨身助教</span>
        </button>
      )}

      {/* Copilot Drawer */}
      {isOpen && (
        <div className="fixed inset-x-3 bottom-20 sm:inset-x-auto sm:bottom-6 sm:right-6 z-50 sm:w-[430px] h-[72vh] max-h-[640px] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-enter">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-black leading-tight">VocabMin 隨身情境助教</div>
                <div className="text-[11px] text-indigo-100">即時感知畫面・繁體中文精準解析</div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onNavigateToTab('ai');
                }}
                className="p-1.5 rounded-xl hover:bg-white/20 text-white/90 transition-colors"
                title="展開完整 AI 語言工作台"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setMessages([
                    {
                      id: 'copilot-init',
                      role: 'model',
                      content: '對話已重置！請點選下方情境問題或直接輸入您的疑問。'
                    }
                  ])
                }
                className="p-1.5 rounded-xl hover:bg-white/20 text-white/90 transition-colors"
                title="清空對話"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                title="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Context Pill Banner */}
          {activeContextBanner && (
            <div className="px-4 py-2 bg-indigo-50/80 dark:bg-indigo-950/50 border-b border-indigo-100 dark:border-indigo-900/60 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
              {activeContextBanner.icon}
              <span className="truncate">{activeContextBanner.label}</span>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'model' && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className="max-w-[85%] space-y-2">
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : m.isError
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200 border border-rose-200'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/60 rounded-bl-sm'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <MarkdownRenderer content={m.content} />
                    )}
                  </div>

                  {/* Recommended Words */}
                  {m.recommendedWords && m.recommendedWords.length > 0 && (
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/50 rounded-xl p-2.5 space-y-2">
                      {m.recommendedWords.map((w, i) => {
                        const key = w.term.trim().toLowerCase();
                        const isSaved = existingTermsSet.has(key) || savedToastMap[key];
                        return (
                          <div
                            key={i}
                            className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                  {w.term}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {w.pos}
                                </span>
                                <button
                                  onClick={() => speak(w.term)}
                                  className="text-slate-400 hover:text-indigo-600"
                                >
                                  <Volume2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                {w.def}
                              </div>
                            </div>
                            <button
                              onClick={() => handleSaveWord(w)}
                              disabled={isSaved}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold shrink-0 flex items-center gap-1 ${
                                isSaved
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                              }`}
                            >
                              {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                              <span>{isSaved ? '已收錄' : '收錄'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Follow-up suggestions */}
                  {m.role === 'model' &&
                    m.followUpSuggestions &&
                    m.followUpSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.followUpSuggestions.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(s)}
                            disabled={isLoading}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 flex items-center gap-1"
                          >
                            <span>{s}</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                {m.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>正在根據您當前的學習畫面分析解答...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Contextual Action Chips */}
          <div className="px-3 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {contextualChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => handleSend(chip)}
                disabled={isLoading}
                className="text-[11px] font-semibold whitespace-nowrap px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 transition-colors shrink-0"
              >
                ✨ {chip}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="詢問當前題目、單字或文章內容..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition-all shrink-0"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
};
