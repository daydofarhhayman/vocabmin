import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Send,
  Trash2,
  Plus,
  BookOpen,
  Volume2,
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  BookmarkCheck,
  Compass,
  PenTool,
  GraduationCap,
  Layers,
  HelpCircle,
  X,
  Square,
  Dices
} from 'lucide-react';
import { Word, AppSettings, Article, POS } from '../types';
import { AIArticleCard } from './AIArticleCard';

export type AIScenario = 'all' | 'library' | 'writing' | 'practice';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  scenario?: AIScenario;
  words?: Partial<Word>[];
  article?: Partial<Article>;
  action?: {
    type: string;
    summary?: string;
    [key: string]: any;
  };
}

interface AIAssistantViewProps {
  settings: AppSettings;
  existingWords: Word[];
  existingArticles: Article[];
  onAddWords: (newWords: Partial<Word>[]) => void;
  onUpdateWordGroup: (term: string, updatedEntries: Word[]) => void;
  onDeleteWordGroup: (term: string) => void;
  onBatchStandardizeWords: (words: Partial<Word>[]) => void;
  onDeduplicateWords: () => void;
  onClearAllWords: () => void;
  onResetAllMastery: () => void;
  onOpenCambridge: (term: string) => void;
  initialPrompt?: { id: string; text: string } | null;
  onClearInitialPrompt?: () => void;
  onSaveArticle?: (article: Article) => void;
  onOpenArticleInReader?: (article: Article) => void;
  onClearAllArticles?: () => void;
  onDeleteArticle?: (titleOrId: string) => void;
}

const SCENARIOS = [
  {
    id: 'all' as AIScenario,
    name: '全能英語語伴',
    desc: '單字辨析、文法疑難、生活文化與口語諮詢',
    icon: Compass,
    accent: 'from-purple-600 to-indigo-600',
    border: 'border-purple-500/30',
    tag: '萬能問答',
    chips: [
      '請解析「serendipity」的精準語感與常見搭配詞',
      '「affect」與「effect」究竟該如何正確區分？',
      '請給我 3 句在地美式口語中表達「太贊同你了」的道地說法',
      '請為我拆解「nuance」與「subtlety」在文意中的細微差別',
      '外商商務信件中，如何優雅且堅定地催促合作夥伴回覆進度？',
      '請分享 3 個英美日常文化背景中非常有趣的俚語故事'
    ]
  },
  {
    id: 'library' as AIScenario,
    name: '單字庫智慧擴充',
    desc: '特定主題/考試生詞批量提取與客製化擴充',
    icon: Layers,
    accent: 'from-blue-600 to-cyan-600',
    border: 'border-blue-500/30',
    tag: '字庫拓展',
    chips: [
      '請為我推薦 5 個多益（TOEIC）高頻商務談判單字並附英英雙解',
      '我想學習 4 個描述心理學「認知偏誤」的高級詞彙',
      '請幫我生成 5 個雅思（IELTS）寫作 7 分必備的學術替換動詞',
      '請推薦 5 個在科技創新與 AI 領域最前沿的專業英文生詞',
      '請生成 4 個日常生活高頻、但台灣學習者常講錯的地道片語',
      '為我整理 5 個描述情緒「喜怒哀樂」高階 CEFR C1 精準形容詞'
    ]
  },
  {
    id: 'writing' as AIScenario,
    name: '寫作診斷與潤飾',
    desc: '逐句病句診斷、時態修訂與 CEFR C1/C2 母語級昇華',
    icon: PenTool,
    accent: 'from-emerald-600 to-teal-600',
    border: 'border-emerald-500/30',
    tag: '文法診斷',
    chips: [
      '請幫我仔細診斷這句話的文法，並提供母語者高階潤飾版本：',
      '請將以下段落改寫為學術期刊（Academic English）正式風格：',
      '請幫我拆解這個長難句的主幹與從屬子句結構：',
      '如何將這句簡單句昇華為含有分詞構句與倒裝句的高級複合金句？',
      '請幫我把這封請假/延期 Email 潤飾得更客氣且符合外商商務禮儀：',
      '請檢查這段英文中介係詞使用是否精準自然：'
    ]
  },
  {
    id: 'practice' as AIScenario,
    name: '考題與模擬實戰',
    desc: '隨機克漏字破題、多益托福實戰測驗與面試 STAR 模擬',
    icon: GraduationCap,
    accent: 'from-amber-600 to-orange-600',
    border: 'border-amber-500/30',
    tag: '實戰模擬',
    chips: [
      '請為我出一題托福學術閱讀克漏字選擇題，附繁體中文破題思維',
      '請進行一場外商產品經理的英文面試模擬提問（STAR原則）',
      '請隨機出一題關於假設語氣（Subjunctive Mood）的進階測驗題',
      '請為我設計一題多益聽力 Part 3 常見的職場情境對話理解題',
      '請出一題易混淆動詞片語（Phrasal Verbs）測驗題附解析',
      '請為我提供一場雅思口說 Part 2 的一分鐘即席演講題目與架構提示'
    ]
  }
];

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  settings,
  existingWords,
  existingArticles,
  onAddWords,
  onUpdateWordGroup,
  onDeleteWordGroup,
  onBatchStandardizeWords,
  onDeduplicateWords,
  onClearAllWords,
  onResetAllMastery,
  onOpenCambridge,
  initialPrompt,
  onClearInitialPrompt,
  onSaveArticle,
  onOpenArticleInReader,
  onClearAllArticles,
  onDeleteArticle
}) => {
  const AI_VIEW_STORAGE_KEY = 'vocabmin_ai_assistant_view_history';
  const [activeScenario, setActiveScenario] = useState<AIScenario>('all');
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('vocabmin_ai_assistant_view_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [addedWordsMap, setAddedWordsMap] = useState<Record<string, boolean>>({});
  const [savedArticlesMap, setSavedArticlesMap] = useState<Record<string, boolean>>({});
  const [executedActions, setExecutedActions] = useState<Record<string, boolean>>({});
  const [chipOffsets, setChipOffsets] = useState<Record<string, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-persist messages to localStorage
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(AI_VIEW_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
      } else {
        localStorage.removeItem(AI_VIEW_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to save AI assistant view history:', e);
    }
  }, [messages]);

  // Cancel generation handler
  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  // Rotate recommended chips
  const handleNextChips = (scId: string) => {
    setChipOffsets((prev) => {
      const allChips = currentScenario.chips || [];
      const current = prev[scId] || 0;
      return {
        ...prev,
        [scId]: (current + 3) % (allChips.length || 1)
      };
    });
  };

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle external initial prompt if provided
  useEffect(() => {
    if (initialPrompt?.text) {
      sendMessage(initialPrompt.text);
      onClearInitialPrompt?.();
    }
  }, [initialPrompt]);

  // Current active scenario config
  const currentScenario = useMemo(() => {
    return SCENARIOS.find((s) => s.id === activeScenario) || SCENARIOS[0];
  }, [activeScenario]);

  // Speech helper
  const handleSpeak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  // Copy helper
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Send message to AI endpoint
  const sendMessage = async (promptToSend: string) => {
    const text = promptToSend.trim();
    if (!text || isLoading) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMsgId = `user-${Date.now()}`;
    const newMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      scenario: activeScenario
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      // Build lightweight summary of existing words and articles to anchor context without hallucinations
      const existingWordsSummary = existingWords.slice(0, 30).map((w) => ({
        term: w.term,
        pos: w.pos,
        def: w.def,
        level: w.level
      }));

      const existingArticlesSummary = existingArticles.slice(0, 10).map((a) => ({
        id: a.id,
        title: a.title,
        level: a.level,
        category: a.category,
        wordCount: a.wordCount
      }));

      // Map chat messages for conversation history
      const historyToSend = messages.slice(-8).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userPrompt: text,
          scenario: currentScenario.name,
          scenarioDesc: currentScenario.desc,
          messages: historyToSend,
          existingWordsSummary,
          existingArticlesSummary
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `伺服器回應錯誤 (${res.status})`);
      }

      const data = await res.json();
      const botMsgId = `bot-${Date.now()}`;
      const articleData = data.article || data.action?.saveArticle;

      const botMsg: Message = {
        id: botMsgId,
        role: 'assistant',
        content: data.reply || '處理完成。',
        timestamp: Date.now(),
        words: Array.isArray(data.words) && data.words.length > 0 ? data.words : undefined,
        article: articleData,
        action: data.action
      };

      setMessages((prev) => [...prev, botMsg]);

      // If user specifically asked to add an article and an article was returned, auto-save to library
      const promptLower = text.toLowerCase();
      if (
        articleData &&
        (promptLower.includes('加入文章') ||
          promptLower.includes('新增文章') ||
          promptLower.includes('收錄文章') ||
          promptLower.includes('加文章') ||
          promptLower.includes('加一篇'))
      ) {
        onSaveArticle?.(articleData as Article);
        setSavedArticlesMap((prev) => ({ ...prev, [articleData.id || botMsgId]: true }));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const botMsgId = `bot-abort-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: botMsgId,
            role: 'assistant',
            content: '⏹️ 已停止生成回答。',
            timestamp: Date.now()
          }
        ]);
        return;
      }
      console.error('AI chat failed:', err);
      const errMsgId = `bot-err-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: errMsgId,
          role: 'assistant',
          content: `⚠️ ${err?.message || 'AI 助手暫時無法連線，請確認網路或稍後重試。'}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  // Handle adding words to user library
  const handleAddSingleWord = (word: Partial<Word>, key: string) => {
    if (addedWordsMap[key]) return;
    onAddWords([word]);
    setAddedWordsMap((prev) => ({ ...prev, [key]: true }));
  };

  const handleAddAllWords = (wordsList: Partial<Word>[], batchKey: string) => {
    onAddWords(wordsList);
    const updated = { ...addedWordsMap };
    wordsList.forEach((_, idx) => {
      updated[`${batchKey}-${idx}`] = true;
    });
    setAddedWordsMap(updated);
  };

  // Handle explicit database action card execution
  const handleExecuteAction = (action: any, actionId: string) => {
    if (!action || executedActions[actionId]) return;

    if (action.type === 'clear_all_words') {
      onClearAllWords();
    } else if (action.type === 'clear_all_articles') {
      onClearAllArticles?.();
    } else if (action.type === 'delete_word' && action.deleteWord?.term) {
      onDeleteWordGroup(action.deleteWord.term);
    } else if (action.type === 'delete_article') {
      const target = action.deleteArticle?.title || action.deleteArticle?.id;
      if (target) onDeleteArticle?.(target);
    } else if (action.type === 'deduplicate_words') {
      onDeduplicateWords();
    } else if (action.type === 'reset_mastery') {
      onResetAllMastery();
    } else if (action.type === 'batch_standardize' && (Array.isArray(action.words) || Array.isArray(action.batchStandardize?.updatedWords))) {
      onBatchStandardizeWords(action.words || action.batchStandardize?.updatedWords);
    } else if (action.type === 'save_article' && action.saveArticle) {
      const art: Article = {
        id: action.saveArticle.id || `art-${Date.now()}`,
        title: action.saveArticle.title || '無標題文章',
        level: action.saveArticle.level || 'B1',
        category: action.saveArticle.category || 'Custom',
        content: action.saveArticle.content || '',
        translationZh: action.saveArticle.translationZh || '',
        summary: action.saveArticle.summary || '',
        wordCount: (action.saveArticle.content || '').split(/\s+/).filter(Boolean).length,
        readTimeMinutes: Math.max(1, Math.round((action.saveArticle.content || '').split(/\s+/).filter(Boolean).length / 180)),
        savedWordTerms: []
      };
      onSaveArticle?.(art);
    }

    setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4.25rem)] max-w-6xl mx-auto px-3 sm:px-6 py-4">
      {/* Top Header & Scenario Switcher */}
      <div className="flex-shrink-0 mb-3 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${currentScenario.accent} text-white flex items-center justify-center shadow-md shadow-indigo-500/20`}>
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  AI 智能多場景語伴
                </h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                  {currentScenario.tag}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {currentScenario.desc}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                title="清除目前對話紀錄"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>清空對話</span>
              </button>
            )}
          </div>
        </div>

        {/* Scenario Tabs Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SCENARIOS.map((sc) => {
            const Icon = sc.icon;
            const isActive = activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                onClick={() => setActiveScenario(sc.id)}
                className={`p-2.5 rounded-2xl text-left transition-all border flex items-center gap-2.5 ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 shadow-md border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'bg-slate-100/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60 hover:bg-white/60 dark:hover:bg-slate-800/60 opacity-80 hover:opacity-100'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive
                      ? `bg-gradient-to-tr ${sc.accent} text-white shadow-sm`
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                    {sc.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {sc.tag}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat Stream Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar rounded-2xl bg-white/40 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 p-4 sm:p-5 space-y-4">
        {messages.length === 0 ? (
          /* Honest, Clean Initial State (ZERO Hallucinated Pre-canned Dialogues) */
          <div className="flex flex-col items-center justify-center min-h-[300px] text-center max-w-xl mx-auto py-8">
            <div className={`w-14 h-14 rounded-3xl bg-gradient-to-tr ${currentScenario.accent} text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4`}>
              <currentScenario.icon className="w-7 h-7" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
              您好！我是您的 {currentScenario.name}
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 max-w-md">
              目前單字庫收錄 <span className="font-semibold text-indigo-600 dark:text-indigo-400">{existingWords.length}</span> 個單字、<span className="font-semibold text-amber-600 dark:text-amber-400">{existingArticles.length}</span> 篇閱讀文章。
              請隨時提出任何需求，我將忠實理解您的意圖，提供零預設立場、精準無幻覺的專業協助。
            </p>

            {/* Smart Scenario Starter Chips */}
            <div className="w-full text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  <span>場景推薦靈感快速發送：</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleNextChips(currentScenario.id)}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition active:scale-95"
                  title="換一批推薦靈感"
                >
                  <Dices className="w-3.5 h-3.5" />
                  <span>換一批</span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {(() => {
                  const offset = chipOffsets[currentScenario.id] || 0;
                  const allChips = currentScenario.chips || [];
                  const displayed = allChips.slice(offset, offset + 3);
                  const finalChips = displayed.length < 3 ? [...displayed, ...allChips.slice(0, 3 - displayed.length)] : displayed;
                  return finalChips.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputPrompt(chip);
                        inputRef.current?.focus();
                      }}
                      className="p-3 rounded-xl text-xs font-medium text-left bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-sm text-slate-700 dark:text-slate-200 transition flex items-center justify-between group active:scale-[0.99]"
                    >
                      <span>{chip}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
                    </button>
                  ));
                })()}
              </div>
            </div>
          </div>
        ) : (
          /* Render Messages Stream */
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${currentScenario.accent} text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}>
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[75%] space-y-3 ${isUser ? 'items-end' : 'items-start'}`}>
                  {/* Bubble Content */}
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm ${
                      isUser
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-none whitespace-pre-wrap'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Rich Article Card (If AI Generated / Imported an Article) */}
                  {!isUser && msg.article && (
                    <AIArticleCard
                      article={msg.article}
                      onSave={(art) => {
                        onSaveArticle?.(art);
                        setSavedArticlesMap((prev) => ({
                          ...prev,
                          [msg.article?.id || msg.id]: true
                        }));
                      }}
                      onOpenInReader={(art) => {
                        onOpenArticleInReader?.(art);
                      }}
                      isSaved={
                        !!savedArticlesMap[msg.article?.id || msg.id] ||
                        existingArticles.some(
                          (a) =>
                            (msg.article?.id && a.id === msg.article.id) ||
                            (msg.article?.title && a.title === msg.article.title)
                        )
                      }
                      onAddWords={onAddWords}
                      onOpenCambridge={onOpenCambridge}
                    />
                  )}

                  {/* Vocabulary Cards (If AI Recommended/Generated Words) */}
                  {!isUser && msg.words && msg.words.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>推薦生詞卡片 ({msg.words.length} 字)</span>
                        </div>

                        <button
                          onClick={() => handleAddAllWords(msg.words!, msg.id)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>一鍵全部收錄</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.words.map((w, idx) => {
                          const itemKey = `${msg.id}-${idx}`;
                          const isAdded = !!addedWordsMap[itemKey];

                          return (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between space-y-2"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-sm text-slate-900 dark:text-white capitalize">
                                      {w.term}
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">
                                      {w.pos || 'n.'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => w.term && handleSpeak(w.term)}
                                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                                      title="發音"
                                    >
                                      <Volume2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => w.term && onOpenCambridge(w.term)}
                                      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                                      title="劍橋字典查詢"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                  {w.def}
                                </p>

                                {w.defEn && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-2 mt-0.5">
                                    {w.defEn}
                                  </p>
                                )}

                                {w.ex && (
                                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 border-l-2 border-indigo-400/50 pl-1.5">
                                    {w.ex}
                                  </p>
                                )}
                              </div>

                              <button
                                onClick={() => handleAddSingleWord(w, itemKey)}
                                disabled={isAdded}
                                className={`w-full py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                                  isAdded
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 cursor-default'
                                    : 'bg-slate-100 dark:bg-slate-700/80 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {isAdded ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500" />
                                    <span>已加入字庫</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span>加入單字庫</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Explicit Action Proposal Card (Requires User Confirmation, No Surprises) */}
                  {!isUser && msg.action && msg.action.type !== 'save_article' && (
                    <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>操作提案確認</span>
                      </div>

                      <p className="text-xs text-amber-900 dark:text-amber-200">
                        {msg.action.summary || 'AI 為您擬定了一項單字庫或系統操作，請在確認後點擊執行。'}
                      </p>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleExecuteAction(msg.action, msg.id)}
                          disabled={!!executedActions[msg.id]}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition ${
                            executedActions[msg.id]
                              ? 'bg-emerald-600 text-white cursor-default'
                              : 'bg-amber-600 hover:bg-amber-700 active:scale-95 text-white'
                          }`}
                        >
                          {executedActions[msg.id] ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>已成功執行</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>確認並立即執行</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Message Bottom Toolbar (Copy / Time) */}
                  {!isUser && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 pl-1">
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-500 font-bold">已複製</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>複製</span>
                          </>
                        )}
                      </button>
                      <span>•</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-3 justify-start items-center animate-pulse">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${currentScenario.accent} text-white flex items-center justify-center shrink-0`}>
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
              <span>AI 思考分析中，正在根據【{currentScenario.name}】精準處理您的需求...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <div className="flex-shrink-0 mt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(inputPrompt);
          }}
          className="relative flex items-center"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendMessage(inputPrompt);
              }
            }}
            placeholder={`在【${currentScenario.name}】模式下輸入您的提問、英文句子或指令 (Enter 發送，Shift+Enter 換行)...`}
            className="w-full py-3.5 pl-4 pr-24 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 resize-none transition"
          />

          <div className="absolute right-2 flex items-center gap-1.5">
            {isLoading ? (
              <button
                type="button"
                onClick={handleCancelGeneration}
                className="p-2 rounded-xl text-white bg-rose-500 hover:bg-rose-600 active:scale-95 transition shadow-sm flex items-center justify-center animate-pulse"
                title="停止生成 (Cancel)"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isLoading}
                className={`p-2 rounded-xl text-white transition shadow-sm flex items-center justify-center ${
                  !inputPrompt.trim() || isLoading
                    ? 'bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : `bg-gradient-to-r ${currentScenario.accent} hover:opacity-95 active:scale-95`
                }`}
                title="發送訊息"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2">
          VocabMin AI 採用專屬教育語境調優。任何單字庫修改皆需使用者確認後才執行，絕不擅自竄改。
        </p>
      </div>
    </div>
  );
};
