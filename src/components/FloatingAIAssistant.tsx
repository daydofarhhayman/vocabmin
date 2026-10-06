import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  X,
  Send,
  MessageSquare,
  Bot,
  Layers,
  BookOpen,
  GraduationCap,
  List,
  Home,
  Settings as SettingsIcon,
  ChevronDown,
  Volume2,
  ExternalLink,
  Plus,
  Check,
  RotateCcw,
  Copy,
  Lightbulb,
  Maximize2,
  Minimize2,
  ShieldCheck,
  AlertTriangle,
  Flame,
  ArrowRight,
  Square,
  Dices,
  AlertCircle
} from 'lucide-react';
import { ViewTab, Word, Article, DailyStats, AppSettings } from '../types';
import { AIArticleCard } from './AIArticleCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { ActiveStudyQuestion } from './StudyHubView';

interface FloatingAIAssistantProps {
  currentTab: ViewTab;
  words: Word[];
  articles: Article[];
  dueWordsCount: number;
  dailyStats?: DailyStats;
  activeReaderArticleId?: string | null;
  activeStudyQuestion?: ActiveStudyQuestion | null;
  activeInspectedWord?: string | null;
  onAddWords: (newWords: Partial<Word>[]) => void;
  onOpenCambridge: (term: string) => void;
  onNavigateToTab: (tab: ViewTab) => void;
  settings: AppSettings;
  onClearAllArticles?: () => void;
  onDeleteArticle?: (titleOrId: string) => void;
  onClearAllWords?: () => void;
  onDeleteWordGroup?: (term: string) => void;
  onBatchStandardizeWords?: (words: Partial<Word>[]) => void;
  onDeduplicateWords?: () => void;
  onResetAllMastery?: () => void;
  onSaveArticle?: (article: Article) => void;
  onOpenArticleInReader?: (article: Article) => void;
  onRequestConfirm?: (config: {
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    confirmText?: string;
    onConfirm: () => void;
  }) => void;
}

export interface AIErrorInfo {
  userMessage: string;
  reason?: string;
  details?: string;
  suggestion?: string;
  statusCode?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  scenarioTab: ViewTab;
  articleId?: string;
  words?: Partial<Word>[];
  article?: Partial<Article>;
  action?: any;
  errorInfo?: AIErrorInfo;
}

interface ScenarioConfig {
  id: ViewTab;
  title: string;
  shortLabel: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accentGradient: string;
  badgeBg: string;
  badgeText: string;
  orbColor: string;
  chips: string[];
}

const SCENARIO_CONFIGS: Record<ViewTab, ScenarioConfig> = {
  home: {
    id: 'home',
    title: '首頁・學習節奏與字庫管家',
    shortLabel: '學習管家',
    desc: '今日進度診斷、學習節奏規劃與全域字庫諮詢',
    icon: Home,
    accentGradient: 'from-purple-600 to-indigo-600',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/70',
    badgeText: 'text-purple-700 dark:text-purple-300',
    orbColor: 'from-purple-500 to-indigo-600',
    chips: [
      '根據我今日的待複習狀況，為我規劃最高效的學習順序',
      '從我目前的字庫中隨機挑選 3 個進階生詞並提示記憶技巧',
      '請給我一句今日英語勵志金句，並深度剖析其句型文法',
      '分析我近期的單字掌握趨勢，給我下週的學習衝刺建議',
      '為我推薦 3 個實用的日常英文片語並附帶地道生活情境',
      '請為我出一個快速的單字快問快答熱身'
    ]
  },
  review: {
    id: 'review',
    title: '卡片複習・記憶聯想語伴',
    shortLabel: '記憶語伴',
    desc: '字根字首剖析、神經記憶口訣、易混淆詞辨析',
    icon: GraduationCap,
    accentGradient: 'from-indigo-600 to-blue-600',
    badgeBg: 'bg-indigo-100 dark:bg-indigo-950/70',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    orbColor: 'from-indigo-500 to-blue-600',
    chips: [
      '請以「字根字首（Etymology）」深度拆解我正在背的單字',
      '為我設計一段幽默好記的「諧音或圖像記憶聯想口訣」',
      '這個單字在母語者日常中最常搭配哪些介係詞或動詞？',
      '請點出這個詞在考試中最容易犯錯的文法陷阱',
      '請提供 3 個常與此詞混淆的同義詞，並逐一比較細微語感',
      '請用這個單字造 2 句適合放入履歷或面試的高級例句'
    ]
  },
  quiz: {
    id: 'quiz',
    title: '練習測驗・解題與剖析導師',
    shortLabel: '解題導師',
    desc: '題目文法剖析、選項辨析、同反義詞衍生拓撲',
    icon: GraduationCap,
    accentGradient: 'from-emerald-600 to-teal-600',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-950/70',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    orbColor: 'from-emerald-500 to-teal-600',
    chips: [
      '幫我深入剖析目前題目的文法句型與破題邏輯',
      '為什麼其他選項不適合？請提供詳細排除理由',
      '教我下次遇到這類克漏字/填空題的高分應試技巧',
      '請針對這個考點再出一題相似難度的題目考考我',
      '這道題目中的核心字彙有哪些高頻同義替換詞？',
      '請傳授我多益/雅思閱讀題的快速關鍵字定位法'
    ]
  },
  reader: {
    id: 'reader',
    title: '文章閱讀・沉浸式長難句助教',
    shortLabel: '閱讀助教',
    desc: '段落主旨提煉、長難句成分拆解、生詞語境推導',
    icon: BookOpen,
    accentGradient: 'from-amber-600 to-orange-600',
    badgeBg: 'bg-amber-100 dark:bg-amber-950/70',
    badgeText: 'text-amber-700 dark:text-amber-300',
    orbColor: 'from-amber-500 to-orange-600',
    chips: [
      '請幫我挑出文章中的核心難字與重點生詞',
      '請總結本文的核心論點並分析作者的語氣與立場',
      '幫我深度拆解文章中最複雜的長難句結構（主幹與修飾語）',
      '請提取文章中 5 個最值得背誦的高級寫作搭配詞',
      '請針對文章內容為我出 2 道閱讀理解測驗題',
      '為我推薦並生成一篇適合我程度的 B2 雙語閱讀文章'
    ]
  },
  list: {
    id: 'list',
    title: '單字庫・字庫體檢與擴充專家',
    shortLabel: '字庫專家',
    desc: '單字庫分佈體檢、高頻主題推薦、批量完善釋義',
    icon: List,
    accentGradient: 'from-blue-600 to-cyan-600',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/70',
    badgeText: 'text-blue-700 dark:text-blue-300',
    orbColor: 'from-blue-500 to-cyan-600',
    chips: [
      '分析我現有單字庫的詞彙等級分佈，點出盲點與強項',
      '為我推薦 5 個與我現有字庫主題相符的進階高分詞彙',
      '我想針對「商務談判」主題擴充 4 個專業表達方式',
      '幫我檢查字庫是否有缺少完整例句或詞性的詞條',
      '請為我推薦 5 個高頻職場會議常用英文動詞',
      '我想學習 4 個描述情緒或心理狀態的精準英文詞彙'
    ]
  },
  ai: {
    id: 'ai',
    title: 'AI 語伴・全能語言學習智囊',
    shortLabel: '全能語伴',
    desc: '多場景全方位即時語言探索與對話',
    icon: Bot,
    accentGradient: 'from-purple-600 to-pink-600',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/70',
    badgeText: 'text-purple-700 dark:text-purple-300',
    orbColor: 'from-purple-500 to-pink-600',
    chips: [
      '請深入解析「serendipity」的精準語感與常見搭配詞',
      '請診斷我寫的這句英文文法是否自然地道：',
      '請為我出一道多益聽力常見的情境商務對話短題',
      '請教我如何用自然地道的美語表達「我贊同你的觀點」',
      '請將一段中文日常口語翻譯成地道美式英文',
      '請向我解釋現在完成式與過去簡單式的決定性差異'
    ]
  },
  settings: {
    id: 'settings',
    title: '系統設定・學習體驗優化顧問',
    shortLabel: '設定顧問',
    desc: '記憶曲線（SRS）參數調節與個人化複習建議',
    icon: SettingsIcon,
    accentGradient: 'from-slate-600 to-indigo-600',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-700 dark:text-slate-300',
    orbColor: 'from-slate-600 to-indigo-600',
    chips: [
      '記憶曲線艾賓浩斯間隔的最佳複習節奏是什麼？',
      '如何根據我的工作忙碌程度自訂每日學習目標？',
      '雲端同步備份機制的安全性與運作原理說明',
      '如何善用自訂主題色彩與字體大小提升長時間學習專注力？'
    ]
  }
};

export const FloatingAIAssistant: React.FC<FloatingAIAssistantProps> = ({
  currentTab,
  words,
  articles,
  dueWordsCount,
  dailyStats,
  activeReaderArticleId,
  activeStudyQuestion,
  activeInspectedWord,
  onAddWords,
  onOpenCambridge,
  onNavigateToTab,
  settings,
  onClearAllArticles,
  onDeleteArticle,
  onClearAllWords,
  onDeleteWordGroup,
  onBatchStandardizeWords,
  onDeduplicateWords,
  onResetAllMastery,
  onSaveArticle,
  onOpenArticleInReader,
  onRequestConfirm
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const FLOATING_AI_STORAGE_KEY = 'vocabmin_floating_ai_history';
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('vocabmin_floating_ai_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [addedWordsMap, setAddedWordsMap] = useState<Record<string, boolean>>({});
  const [savedArticlesMap, setSavedArticlesMap] = useState<Record<string, boolean>>({});
  const [executedActions, setExecutedActions] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [chipOffsets, setChipOffsets] = useState<Record<string, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-persist messages to localStorage
  useEffect(() => {
    try {
      if (messages.length > 0) {
        localStorage.setItem(FLOATING_AI_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
      } else {
        localStorage.removeItem(FLOATING_AI_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to save floating AI chat history:', e);
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

  // Next chips generator
  const handleNextChips = (scId: string) => {
    setChipOffsets((prev) => {
      const allChips = scenario.chips || [];
      const current = prev[scId] || 0;
      return {
        ...prev,
        [scId]: (current + 3) % (allChips.length || 1)
      };
    });
  };

  // Current reading article if in reader mode
  const currentArticle = useMemo(() => {
    if (currentTab !== 'reader' || !activeReaderArticleId) return null;
    return articles.find((a) => a.id === activeReaderArticleId) || null;
  }, [currentTab, activeReaderArticleId, articles]);

  // Active scenario config dynamically tailored to user's live screen state
  const scenario = useMemo(() => {
    const base = SCENARIO_CONFIGS[currentTab] || SCENARIO_CONFIGS.home;
    if (currentTab === 'reader') {
      if (currentArticle) {
        return {
          ...base,
          title: `文章伴讀・《${currentArticle.title}》`,
          shortLabel: '文章伴讀',
          desc: `CEFR ${currentArticle.level || 'B1'} 等級 (${currentArticle.wordCount || 0} 字)・全篇解析、生詞提煉、長難句拆解`,
          chips: [
            `請幫我挑出《${currentArticle.title}》這篇文章中的核心難字與重點詞彙`,
            `請為我總結《${currentArticle.title}》的核心寓意與段落重點`,
            `幫我深度拆解文章中最具代表性的長難句文法結構`,
            `作者在這篇文章中想要傳達什麼情感與核心立場？`,
            `文章中有哪些適合用於英文寫作與口說的實用亮點搭配詞？`,
            `請針對這篇文章的內容出 2 道閱讀理解測驗題考考我`
          ]
        };
      } else {
        return {
          ...base,
          title: '文章閱讀・書架總覽顧問',
          shortLabel: '書架顧問',
          desc: `目前書架共有 ${articles.length} 篇文章・讀物推薦、難度評估與新主題文章生成`,
          chips: [
            `根據我的程度，推薦我現在先讀書架上的哪一篇文章？`,
            `請幫我生成一篇關於AI與科技創新的 B2 雙語短文收錄到書架`,
            `書架現有文章的主題分佈與最佳進階閱讀順序是什麼？`,
            `我想讀一篇短篇故事，幫我寫一篇適合休閒閱讀的文章`
          ]
        };
      }
    }
    if (currentTab === 'home') {
      return {
        ...base,
        desc: `連續打卡 ${dailyStats?.streak || 0} 天・待複習 ${dueWordsCount} 字・今日已學 ${dailyStats?.learnedToday || 0} 字`,
        chips: [
          '根據我今日的待複習狀況，為我規劃最高效的學習順序',
          '分析我目前最常遺忘的生疏單字，並給予深度記憶建議',
          '今天只有 10 分鐘，請為我推薦極速微學習菜單',
          '教我如何利用間隔重複(SRS)最高效穩固長期記憶'
        ]
      };
    }
    if ((currentTab === 'review' || currentTab === 'quiz') && activeStudyQuestion) {
      const q = activeStudyQuestion;
      const isChoice = q.mode === 'choice';
      return {
        ...base,
        title: `${currentTab === 'review' ? '複習導師' : '解題導師'}・第 ${q.currentIndex}/${q.totalQuestions} 題「${q.term}」`,
        shortLabel: currentTab === 'review' ? '複習導師' : '解題導師',
        desc: `目標單字：${q.term} (${q.pos || 'n.'})・${q.def}・${isChoice ? '四選一題型' : '例句填空題'}`,
        chips: [
          `💡 請以字根字首（Etymology）拆解「${q.term}」，並分享好記的聯想記憶口訣`,
          `❓ 深入剖析這道題目題幹的語法結構與破題邏輯`,
          `⚠️ 為什麼其他干擾選項不適合？請提供辨析理由`,
          `🗣️ 請用「${q.term}」造 2 個在商務職場或學術寫作中最道地的範例`,
          `🔄「${q.term}」有哪些常見的同義詞與易混淆詞？語感差別為何？`
        ]
      };
    }
    if (currentTab === 'list' && activeInspectedWord) {
      return {
        ...base,
        title: `單字詳情顧問・「${activeInspectedWord}」`,
        shortLabel: '單字顧問',
        desc: `正在檢視/編輯「${activeInspectedWord}」・詞性釋義、深度語感與造句活用`,
        chips: [
          `請深入解析「${activeInspectedWord}」的精準語感與常見搭配詞`,
          `為「${activeInspectedWord}」提供 2 個適合用於雅思/托福寫作的高階範例`,
          `「${activeInspectedWord}」有哪些常見的同義詞與易混淆詞？語感差別為何？`,
          `為「${activeInspectedWord}」設計一段好記的聯想記憶法`
        ]
      };
    }
    return base;
  }, [currentTab, currentArticle, articles.length, dailyStats, dueWordsCount, activeStudyQuestion, activeInspectedWord]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Action execution with prominent modal popup (彈窗確認)
  const handleExecuteAction = useCallback((action: any, actionId: string) => {
    if (!action || executedActions[actionId]) return;

    const actionType = action.type;

    if (actionType === 'clear_all_articles') {
      const artCount = articles.length;
      if (onRequestConfirm) {
        onRequestConfirm({
          title: '🚨 清空文章閱讀庫確認',
          message: `確定要清空文章閱讀庫中的所有 ${artCount} 篇文章嗎？\n此操作將永久清除所有儲存的文章，無法復原。`,
          type: 'danger',
          confirmText: '確定全部清空',
          onConfirm: () => {
            onClearAllArticles?.();
            setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-done-${Date.now()}`,
                role: 'assistant',
                content: `✅ 已成功為您清空文章閱讀庫中的所有文章！`,
                timestamp: Date.now(),
                scenarioTab: currentTab
              }
            ]);
          }
        });
      } else {
        onClearAllArticles?.();
        setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      }
    } else if (actionType === 'clear_all_words') {
      const wordCount = words.length;
      if (onRequestConfirm) {
        onRequestConfirm({
          title: '🚨 清空單字庫確認',
          message: `確定要清空單字庫中的所有 ${wordCount} 個單字嗎？\n此操作將永久清除所有單字卡片與複習記錄，無法復原。`,
          type: 'danger',
          confirmText: '確定全部清空',
          onConfirm: () => {
            onClearAllWords?.();
            setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-done-${Date.now()}`,
                role: 'assistant',
                content: `✅ 已成功為您清空單字庫中的所有單字！`,
                timestamp: Date.now(),
                scenarioTab: currentTab
              }
            ]);
          }
        });
      } else {
        onClearAllWords?.();
        setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      }
    } else if (actionType === 'delete_article') {
      const targetTitle = action.deleteArticle?.title || action.deleteArticle?.id;
      if (onRequestConfirm) {
        onRequestConfirm({
          title: '🗑️ 刪除文章確認',
          message: `確定要從閱讀庫中刪除《${targetTitle || '這篇文章'}》嗎？`,
          type: 'danger',
          confirmText: '確定刪除',
          onConfirm: () => {
            if (targetTitle) onDeleteArticle?.(targetTitle);
            setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-done-${Date.now()}`,
                role: 'assistant',
                content: `✅ 已成功刪除文章《${targetTitle}》！`,
                timestamp: Date.now(),
                scenarioTab: currentTab
              }
            ]);
          }
        });
      } else {
        if (targetTitle) onDeleteArticle?.(targetTitle);
        setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      }
    } else if (actionType === 'delete_word') {
      const term = action.deleteWord?.term;
      if (onRequestConfirm) {
        onRequestConfirm({
          title: '🗑️ 刪除單字確認',
          message: `確定要從單字庫中刪除「${term}」及其所有釋義嗎？`,
          type: 'danger',
          confirmText: '確定刪除',
          onConfirm: () => {
            if (term) onDeleteWordGroup?.(term);
            setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-done-${Date.now()}`,
                role: 'assistant',
                content: `✅ 已從單字庫中刪除單字「${term}」！`,
                timestamp: Date.now(),
                scenarioTab: currentTab
              }
            ]);
          }
        });
      } else {
        if (term) onDeleteWordGroup?.(term);
        setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      }
    } else if (actionType === 'reset_mastery') {
      if (onRequestConfirm) {
        onRequestConfirm({
          title: '🔄 重置熟練度確認',
          message: `確定要將所有單字的熟練度全部歸零、重新進入艾賓浩斯記憶複習週期嗎？`,
          type: 'warning',
          confirmText: '確定重置',
          onConfirm: () => {
            onResetAllMastery?.();
            setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-done-${Date.now()}`,
                role: 'assistant',
                content: `✅ 已成功將所有單字的熟練度重置為完全不熟練！`,
                timestamp: Date.now(),
                scenarioTab: currentTab
              }
            ]);
          }
        });
      } else {
        onResetAllMastery?.();
        setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      }
    } else if (actionType === 'deduplicate_words') {
      if (onRequestConfirm) {
        onRequestConfirm({
          title: '✨ 合併重複單字確認',
          message: `確定要掃描單字庫並合併所有大小寫或重複的詞條嗎？`,
          type: 'info',
          confirmText: '確認合併',
          onConfirm: () => {
            onDeduplicateWords?.();
            setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
            setMessages((prev) => [
              ...prev,
              {
                id: `bot-done-${Date.now()}`,
                role: 'assistant',
                content: `✅ 單字庫重複項目已成功合併整理！`,
                timestamp: Date.now(),
                scenarioTab: currentTab
              }
            ]);
          }
        });
      } else {
        onDeduplicateWords?.();
        setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      }
    } else if (actionType === 'batch_standardize' && (Array.isArray(action.words) || Array.isArray(action.batchStandardize?.updatedWords))) {
      onBatchStandardizeWords?.(action.words || action.batchStandardize?.updatedWords);
      setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-done-${Date.now()}`,
          role: 'assistant',
          content: `✅ 已完成批量單字標準化更新！`,
          timestamp: Date.now(),
          scenarioTab: currentTab
        }
      ]);
    } else if (actionType === 'save_article' && action.saveArticle) {
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
      setExecutedActions((prev) => ({ ...prev, [actionId]: true }));
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-done-${Date.now()}`,
          role: 'assistant',
          content: `✅ 已成功將文章《${art.title}》收錄至文章閱讀庫！`,
          timestamp: Date.now(),
          scenarioTab: currentTab
        }
      ]);
    }
  }, [
    articles.length,
    words.length,
    currentTab,
    executedActions,
    onRequestConfirm,
    onClearAllArticles,
    onClearAllWords,
    onDeleteArticle,
    onDeleteWordGroup,
    onResetAllMastery,
    onDeduplicateWords,
    onBatchStandardizeWords,
    onSaveArticle
  ]);

  // Pronounce helper
  const handleSpeak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  // Copy helper
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Send message to AI endpoint with rich scenario grounding
  const handleSendMessage = async (promptToSend: string) => {
    const text = promptToSend.trim();
    if (!text || isLoading) return;

    // Check if the user is confirming a pending action.
    // IMPORTANT: Only treat as confirmation when:
    //   1. There IS a pending (un-executed) action waiting.
    //   2. The message is a very short, standalone confirmation phrase (≤ 6 chars),
    //      NOT a full sentence like「幫我確認一下單字數量」which happens to contain「確認」.
    const trimmedLower = text.toLowerCase().trim();
    const STANDALONE_CONFIRMS = ['確認', '確定', '執行', '好', '是', 'yes', 'ok', 'confirm', '好的', '對', '沒錯'];
    const isStandaloneConfirm = STANDALONE_CONFIRMS.includes(trimmedLower);

    if (isStandaloneConfirm) {
      const pendingMsg = [...messages].reverse().find((m) => m.action && !executedActions[m.id]);
      if (pendingMsg && pendingMsg.action) {
        handleExecuteAction(pendingMsg.action, pendingMsg.id);
        setInputText('');
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      scenarioTab: currentTab,
      articleId: currentArticle?.id
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      // Screen context object so AI knows exact live user situation
      const screenContext = {
        currentTab,
        scenarioTitle: scenario.title,
        scenarioDesc: scenario.desc,
        totalWordsCount: words.length,
        dueWordsCount,
        dailyStreak: dailyStats?.streak || 0,
        learnedToday: dailyStats?.learnedToday || 0,
        isReadingArticle: !!currentArticle,
        activeArticleTitle: currentArticle?.title || null,
        activeStudyQuestion: (currentTab === 'review' || currentTab === 'quiz') ? activeStudyQuestion : null,
        activeInspectedWord: activeInspectedWord || null
      };

      // Full current article details to eliminate hallucination completely
      const currentArticlePayload = currentArticle
        ? {
            id: currentArticle.id,
            title: currentArticle.title,
            subtitle: currentArticle.subtitle,
            level: currentArticle.level,
            category: currentArticle.category,
            wordCount: currentArticle.wordCount,
            summary: currentArticle.summary,
            content: currentArticle.content, // FULL ARTICLE CONTENT
            translationZh: currentArticle.translationZh,
            savedWordTerms: currentArticle.savedWordTerms,
            keyVocabulary: currentArticle.keyVocabulary?.map((k) => ({
              term: k.term,
              pos: k.pos,
              def: k.def,
              level: k.level
            })),
            grammarPoints: currentArticle.grammarPoints?.map((g) => ({
              sentence: g.sentence,
              structure: g.structure,
              explanation: g.explanation
            }))
          }
        : undefined;

      // Sample of user words for vocabulary relevance
      const existingWordsSummary = words.slice(0, 30).map((w) => ({
        term: w.term,
        pos: w.pos,
        def: w.def,
        level: w.level
      }));

      // Existing articles summary across the library
      const existingArticlesSummary = articles.slice(0, 20).map((a) => ({
        id: a.id,
        title: a.title,
        level: a.level,
        category: a.category,
        wordCount: a.wordCount,
        summary: a.summary
      }));

      // Isolate history to current tab & current article to prevent context bleeding
      const historyToSend = messages
        .filter((m) => {
          if (m.scenarioTab !== currentTab) return false;
          if (currentTab === 'reader' && currentArticle) {
            return m.articleId === currentArticle.id || !m.articleId;
          }
          return true;
        })
        .slice(-6)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          content: m.content
        }));

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings?.geminiApiKey ? { 'x-gemini-api-key': settings.geminiApiKey } : {})
        },
        signal: controller.signal,
        body: JSON.stringify({
          userPrompt: text,
          scenario: scenario.title,
          scenarioDesc: scenario.desc,
          screenContext,
          currentArticle: currentArticlePayload,
          messages: historyToSend,
          existingWordsSummary,
          existingArticlesSummary,
          apiKey: settings?.geminiApiKey
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errObj: any = new Error(errJson?.error || `連線回應異常 (${res.status})`);
        errObj.errorInfo = {
          userMessage: errJson?.error || `連線回應異常 (${res.status})`,
          reason: errJson?.reason,
          details: errJson?.details,
          suggestion: errJson?.suggestion,
          statusCode: res.status
        };
        throw errObj;
      }

      const data = await res.json();
      const articleData = data.article || data.action?.saveArticle;
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data.reply || '已為您完成分析。',
        timestamp: Date.now(),
        scenarioTab: currentTab,
        words: Array.isArray(data.words) && data.words.length > 0 ? data.words : undefined,
        article: articleData,
        action: data.action
      };

      setMessages((prev) => [...prev, botMsg]);

      // If user specifically commanded to add/save an article and article data was returned, auto-save to library
      if (
        articleData &&
        (trimmedLower.includes('加入文章') ||
          trimmedLower.includes('新增文章') ||
          trimmedLower.includes('收錄文章') ||
          trimmedLower.includes('加文章') ||
          trimmedLower.includes('加一篇'))
      ) {
        onSaveArticle?.(articleData as Article);
        setSavedArticlesMap((prev) => ({ ...prev, [articleData.id || botMsg.id]: true }));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-abort-${Date.now()}`,
            role: 'assistant',
            content: '⏹️ 已依您的要求停止生成。',
            timestamp: Date.now(),
            scenarioTab: currentTab
          }
        ]);
        return;
      }
      console.error('Floating AI error:', err);
      const errorInfo: AIErrorInfo = err?.errorInfo || {
        userMessage: err?.message || 'AI 助手暫時無法連線，請確認網路連線或稍後重試。',
        details: err?.stack || String(err),
        suggestion: '請確認伺服器連線正常，或於「設定」中重新檢查 API Key。',
        statusCode: 500
      };

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${errorInfo.userMessage}`,
          errorInfo,
          timestamp: Date.now(),
          scenarioTab: currentTab
        }
      ]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Add words
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

  const ScenarioIcon = scenario.icon;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. FLOATING ORB (小球) - Fixed at Bottom-Right across ALL pages           */}
      {/* ========================================================================= */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 select-none group">
        {!isOpen && (
          <div className="relative flex items-center">
            {/* Scenario Tooltip Pill on Hover */}
            <div className="absolute right-full mr-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-1 group-hover:translate-x-0 hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 dark:bg-slate-800/95 text-white text-xs font-bold shadow-lg backdrop-blur-md whitespace-nowrap border border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{scenario.shortLabel}：點擊獲得即時場景協助</span>
            </div>

            {/* The Floating AI Orb Button */}
            <button
              onClick={() => {
                setIsOpen(true);
                setIsMinimized(false);
              }}
              className={`relative w-14 h-14 rounded-full bg-gradient-to-tr ${scenario.orbColor} text-white shadow-xl shadow-indigo-500/30 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-indigo-500/50 ring-4 ring-white/80 dark:ring-slate-800/80 cursor-pointer overflow-hidden`}
              title={`${scenario.title} - 點擊召喚 AI 助手`}
            >
              {/* Subtle inner rotating shimmer */}
              <div className="absolute inset-0 bg-white/20 opacity-0 hover:opacity-100 transition-opacity rounded-full"></div>
              
              {/* Pulsing Aura Ring */}
              <div className="absolute -inset-1 rounded-full bg-white/30 animate-ping opacity-20 pointer-events-none"></div>

              {/* Icon */}
              <div className="relative z-10 flex flex-col items-center justify-center">
                <Sparkles className="w-6 h-6 animate-pulse" />
                <span className="text-[8px] font-black tracking-tighter uppercase mt-0.5">
                  AI
                </span>
              </div>

              {/* Status Dot */}
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-900"></span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. CONTEXTUAL AI MODAL / DRAWER (場景對話面板)                            */}
      {/* ========================================================================= */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-6 pointer-events-none">
          {/* Backdrop on mobile */}
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity sm:hidden pointer-events-auto"
          />

          {/* Assistant Floating Window / Panel */}
          <div
            className={`pointer-events-auto w-full sm:w-[460px] md:w-[480px] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 overflow-hidden ${
              isMinimized
                ? 'h-16'
                : 'h-[85vh] sm:h-[640px] max-h-[90vh]'
            }`}
          >
            {/* Header */}
            <div className={`p-4 bg-gradient-to-r ${scenario.accentGradient} text-white flex items-center justify-between shadow-sm shrink-0`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                  <ScenarioIcon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-extrabold text-sm truncate">
                      {scenario.shortLabel}
                    </h3>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-white/20 text-white">
                      當前場景
                    </span>
                  </div>
                  <p className="text-[11px] text-white/80 truncate">
                    {scenario.desc}
                  </p>
                </div>
              </div>

              {/* Header Controls */}
              <div className="flex items-center gap-1 shrink-0">
                {messages.length > 0 && !isMinimized && (
                  <button
                    onClick={() => setMessages([])}
                    className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
                    title="清空目前對話"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition hidden sm:block"
                  title={isMinimized ? '展開面板' : '縮小面板'}
                >
                  {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition"
                  title="關閉小助手"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* When not minimized, render body */}
            {!isMinimized && (
              <>
                {/* Current Active Context Anchor Tag */}
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                    <span className="truncate">
                      {currentArticle
                        ? `正在閱讀：《${currentArticle.title}》`
                        : currentTab === 'review'
                        ? `今日待複習：${dueWordsCount} 字`
                        : currentTab === 'quiz'
                        ? `實戰測驗模式中`
                        : currentTab === 'list'
                        ? `單字庫總計：${words.length} 字`
                        : `首頁儀表板`}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                    即時零幻覺
                  </span>
                </div>

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3.5 bg-slate-50/40 dark:bg-slate-900/40">
                  {messages.length === 0 ? (
                    /* Initial Zero-Preset State (Clean, Honest, Tailored to the Scene) */
                    <div className="flex flex-col items-center justify-center min-h-[260px] text-center px-2 py-4">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${scenario.accentGradient} text-white flex items-center justify-center shadow-md shadow-indigo-500/20 mb-3`}>
                        <Sparkles className="w-6 h-6" />
                      </div>

                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                        您好！我是您的【{scenario.shortLabel}】
                      </h4>

                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-xs leading-relaxed">
                        已為您連線當前「{scenario.title}」場景。點擊下方快捷靈感，或直接輸入任何英文疑問：
                      </p>

                      {/* Tailored Scenario Chips with Next Chips button */}
                      <div className="w-full space-y-2 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-amber-500" />
                            <span>推薦靈感（點擊發送）：</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleNextChips(scenario.id)}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            <Dices className="w-3 h-3" />
                            <span>換一批</span>
                          </button>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          {(() => {
                            const offset = chipOffsets[scenario.id] || 0;
                            const slice = scenario.chips.slice(offset, offset + 3);
                            const list = slice.length < 3
                              ? [...slice, ...scenario.chips.slice(0, 3 - slice.length)]
                              : slice;
                            return list.map((chip, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSendMessage(chip)}
                                className="p-2.5 rounded-xl text-xs text-left bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-700 dark:text-slate-200 transition flex items-center justify-between group shadow-xs active:scale-[0.99]"
                              >
                                <span className="line-clamp-2">{chip}</span>
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition shrink-0 ml-1.5" />
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Messages List */
                    messages.map((msg) => {
                      const isUser = msg.role === 'user';
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          {!isUser && (
                            <div className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${scenario.accentGradient} text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs`}>
                              <Bot className="w-3.5 h-3.5" />
                            </div>
                          )}

                          <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
                            {/* Detailed Error Card or Standard Message Text Bubble */}
                            {!isUser && msg.errorInfo ? (
                              <div className="p-3.5 rounded-2xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-slate-800 dark:text-slate-100 space-y-2.5 shadow-xs rounded-tl-none">
                                <div className="flex items-start gap-2.5">
                                  <div className="w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-bold text-xs text-rose-700 dark:text-rose-400">
                                        {msg.errorInfo.userMessage}
                                      </h4>
                                      {msg.errorInfo.statusCode && (
                                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-200/80 dark:bg-rose-900/80 text-rose-800 dark:text-rose-300">
                                          HTTP {msg.errorInfo.statusCode}
                                        </span>
                                      )}
                                    </div>
                                    {msg.errorInfo.suggestion && (
                                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                                        💡 {msg.errorInfo.suggestion}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 pt-1 border-t border-rose-200/60 dark:border-rose-900/40">
                                  {(msg.errorInfo.reason === 'API_KEY_INVALID' || msg.errorInfo.reason === 'NO_API_KEY') && (
                                    <button
                                      onClick={() => {
                                        setIsOpen(false);
                                        onNavigateToTab('settings');
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[11px] font-bold flex items-center gap-1 transition"
                                    >
                                      <SettingsIcon className="w-3 h-3" />
                                      <span>前往設定 API Key</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
                                      if (lastUserMsg) {
                                        handleSendMessage(lastUserMsg.content);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100/50 text-[11px] font-semibold flex items-center gap-1 transition"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>重新嘗試</span>
                                  </button>
                                </div>

                                {/* Collapsible Technical Error Details */}
                                {msg.errorInfo.details && (
                                  <details className="text-[10px] text-slate-500 dark:text-slate-400 group">
                                    <summary className="cursor-pointer select-none text-rose-600 dark:text-rose-400 hover:underline font-mono">
                                      ▶ 展開技術錯誤細節 (Technical Details)
                                    </summary>
                                    <div className="mt-1.5 p-2 rounded-lg bg-slate-900 text-slate-200 font-mono text-[10px] break-all max-h-32 overflow-y-auto whitespace-pre-wrap leading-tight">
                                      {msg.errorInfo.details}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ) : (
                              /* Standard Message Text Bubble with Markdown rendering */
                              <div
                                className={`p-3 rounded-2xl text-xs leading-relaxed shadow-xs ${
                                  isUser
                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none whitespace-pre-wrap'
                                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-tl-none'
                                }`}
                              >
                                {isUser ? (
                                  msg.content
                                ) : (
                                  <MarkdownRenderer content={msg.content} isUser={false} />
                                )}
                              </div>
                            )}

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
                                  articles.some(
                                    (a) =>
                                      (msg.article?.id && a.id === msg.article.id) ||
                                      (msg.article?.title && a.title === msg.article.title)
                                  )
                                }
                                onAddWords={onAddWords}
                                onOpenCambridge={onOpenCambridge}
                                compact={true}
                              />
                            )}

                            {/* Recommended Words Card List */}
                            {!isUser && msg.words && msg.words.length > 0 && (
                              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                                    <Layers className="w-3.5 h-3.5" />
                                    <span>生詞卡片 ({msg.words.length} 字)</span>
                                  </span>

                                  <button
                                    onClick={() => handleAddAllWords(msg.words!, msg.id)}
                                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-md text-[10px] font-bold flex items-center gap-1 transition"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>全部收錄</span>
                                  </button>
                                </div>

                                <div className="space-y-1.5">
                                  {msg.words.map((w, wIdx) => {
                                    const itemKey = `${msg.id}-${wIdx}`;
                                    const isAdded = !!addedWordsMap[itemKey];

                                    return (
                                      <div
                                        key={wIdx}
                                        className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-extrabold text-xs text-slate-900 dark:text-white capitalize">
                                              {w.term}
                                            </span>
                                            <span className="text-[9px] font-bold px-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                              {w.pos || 'n.'}
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                                            {w.def}
                                          </p>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => w.term && handleSpeak(w.term)}
                                            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                            title="朗讀"
                                          >
                                            <Volume2 className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => w.term && onOpenCambridge(w.term)}
                                            className="p-1 rounded text-slate-400 hover:text-indigo-600"
                                            title="劍橋字典"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => handleAddSingleWord(w, itemKey)}
                                            disabled={isAdded}
                                            className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition ${
                                              isAdded
                                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-600 hover:text-white'
                                            }`}
                                          >
                                            {isAdded ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                                            <span>{isAdded ? '已加入' : '收錄'}</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Explicit Action Proposal Card (Requires User Confirmation via Modal Popup) */}
                            {!isUser && msg.action && msg.action.type !== 'save_article' && (
                              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/15 via-amber-500/10 to-red-500/10 dark:from-amber-950/60 dark:to-red-950/40 border border-amber-500/30 dark:border-amber-700/50 space-y-2.5 shadow-sm">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <span>系統操作提案確認</span>
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                    executedActions[msg.id]
                                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                                  }`}>
                                    {executedActions[msg.id] ? '已完成' : '待確認'}
                                  </span>
                                </div>

                                <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed font-medium">
                                  {msg.action.summary || 'AI 為您擬定了一項重要操作，為保障資料安全，請點擊下方按鈕彈出確認視窗。'}
                                </p>

                                <div className="pt-1">
                                  <button
                                    onClick={() => handleExecuteAction(msg.action, msg.id)}
                                    disabled={!!executedActions[msg.id]}
                                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-98 ${
                                      executedActions[msg.id]
                                        ? 'bg-emerald-600 text-white cursor-default'
                                        : 'bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:opacity-95 text-white cursor-pointer ring-2 ring-amber-400/30'
                                    }`}
                                  >
                                    {executedActions[msg.id] ? (
                                      <>
                                        <Check className="w-4 h-4" />
                                        <span>已確認並執行完成</span>
                                      </>
                                    ) : (
                                      <>
                                        <ShieldCheck className="w-4 h-4" />
                                        <span>🚨 點擊開啟確認視窗</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Toolbar */}
                            {!isUser && (
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 pl-1">
                                <button
                                  onClick={() => handleCopy(msg.id, msg.content)}
                                  className="hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition"
                                >
                                  {copiedId === msg.id ? (
                                    <>
                                      <Check className="w-2.5 h-2.5 text-emerald-500" />
                                      <span className="text-emerald-500 font-bold">已複製</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-2.5 h-2.5" />
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

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="flex gap-2.5 justify-start items-center animate-pulse">
                      <div className={`w-7 h-7 rounded-xl bg-gradient-to-tr ${scenario.accentGradient} text-white flex items-center justify-center shrink-0`}>
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      </div>
                      <div className="p-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
                        <span>AI 正在為您針對「{scenario.shortLabel}」場景深度思考中...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Bar */}
                <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage(inputText);
                    }}
                    className="relative flex items-center"
                  >
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleSendMessage(inputText);
                        }
                      }}
                      placeholder={`針對【${scenario.shortLabel}】場景提問 (Enter 發送)...`}
                      className="w-full py-2.5 pl-3.5 pr-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 outline-none text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 resize-none transition"
                    />

                    {isLoading ? (
                      <button
                        type="button"
                        onClick={handleCancelGeneration}
                        className="absolute right-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs transition"
                        title="停止生成"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>停止</span>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className={`absolute right-1.5 p-2 rounded-lg text-white transition ${
                          !inputText.trim()
                            ? 'bg-slate-300 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                            : `bg-gradient-to-r ${scenario.accentGradient} hover:opacity-95 active:scale-95 shadow-xs`
                        }`}
                        title="發送"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
