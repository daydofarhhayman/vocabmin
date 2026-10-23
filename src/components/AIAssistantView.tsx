import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Check,
  Loader2,
  BookOpen,
  Trash2,
  Bot,
  User,
  Volume2,
  Microscope,
  PenTool,
  Layers,
  Target,
  Wrench,
  Copy,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FolderPlus,
  RefreshCw,
  HelpCircle,
  Lightbulb,
  Award,
  Flame,
  ExternalLink
} from 'lucide-react';
import { Word, POS, AppSettings, Article, ViewTab } from '../types';
import { tts } from '../services/tts';
import { storage } from '../services/storage';
import { normalizePos } from '../utils/pos';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AIAssistantViewProps {
  userUid?: string | null;
  settings?: AppSettings;
  existingWords: Word[];
  existingArticles?: Article[];
  onAddWords: (newWords: Partial<Word>[]) => any;
  onUpdateWordGroup: (oldTerm: string, updatedList: Partial<Word>[], category?: string) => any;
  onDeleteWordGroup: (term: string, skipConfirm?: boolean) => any;
  onBatchStandardizeWords: (updatedWords: Partial<Word>[]) => any;
  onDeduplicateWords: () => any;
  onClearAllWords?: () => any;
  onResetAllMastery?: () => any;
  onOpenCambridge: (term: string) => void;
  initialPrompt?: { id: string; text: string } | string | null;
  onClearInitialPrompt?: () => void;
  onSaveArticle?: (article: Article) => any;
  onOpenArticleInReader?: (article: Article) => any;
  onClearAllArticles?: () => any;
  onDeleteArticle?: (titleOrId: string) => any;
  onNavigateToTab?: (tab: ViewTab) => void;
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

type StudioTab = 'tutor' | 'xray' | 'clinic' | 'workshop' | 'quiz' | 'toolkit';

interface RecommendedWordItem {
  term: string;
  pos: POS;
  def: string;
  defEn: string;
  ex: string;
  exZh?: string;
  memoryTip?: string;
  cefrLevel?: string;
  category?: string;
}

interface TutorMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  recommendedWords?: RecommendedWordItem[];
  followUpSuggestions?: string[];
  isError?: boolean;
}

interface WordXRayResult {
  term: string;
  phonetic: string;
  pos: string;
  cefrLevel: string;
  coreDefZh: string;
  coreDefEn: string;
  nuanceAndVibe: string;
  etymology: string;
  memoryHook: string;
  collocations: { phrase: string; meaningZh: string; exampleEn: string }[];
  synonymsComparison: { word: string; nuanceZh: string; exampleEn: string }[];
  wordFamily: { term: string; pos: string; defZh: string }[];
  exampleSentences: { contextTag: string; en: string; zh: string }[];
}

interface WritingClinicResult {
  overallScore: number;
  overallCommentZh: string;
  correctedVersion: { text: string; translationZh: string; keyFixesNote: string };
  nativeNaturalVersion: { text: string; translationZh: string; highlightNote: string };
  advancedC1Version: { text: string; translationZh: string; highlightNote: string };
  diagnostics: {
    originalSpan: string;
    fixedSpan: string;
    issueType: string;
    explanationZh: string;
  }[];
  upgradedVocabulary: RecommendedWordItem[];
}

interface QuizQuestionItem {
  targetTerm: string;
  questionType: string;
  stemEn: string;
  stemTranslationZh: string;
  options: string[];
  correctIndex: number;
  explanationZh: string;
  collocationTip: string;
}

interface SmartCategoryGroup {
  category: string;
  terms: string[];
  reasonZh: string;
}

const DEFAULT_TUTOR_WELCOME: TutorMessage = {
  id: 'welcome-v2',
  role: 'model',
  content:
    '您好！我是全新升級的 **VocabMin AI 語言學習智囊**。\n\n為了提供您最精準、零幻覺的學習體驗，我現在具備五大專業模組：\n- **💬 智慧家教**：解答任何英文文法、句型結構、翻譯與語感問題\n- **🔬 單字 X 光室**：一鍵拆解字根字首、母語搭配詞、近義詞比較與記憶口訣\n- **✍️ 寫作潤飾門診**：中式英文診斷 + 母語自然版 / C1 高階學術版三階改寫\n- **🧪 主題生詞工坊**：依考試或情境量身打造專屬單字包，自動過濾已學單字\n- **🎯 弱點隨堂考官**：直接從您的待複習單字即時生成情境克漏字特訓',
  followUpSuggestions: [
    '分辨 affect 與 effect 的用法差異',
    '商業書信中「期待您的回覆」有哪些道地說法？',
    '過去完成式與現在完成式怎麼區分？'
  ]
};

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  userUid,
  settings,
  existingWords,
  existingArticles = [],
  onAddWords,
  onBatchStandardizeWords,
  onDeduplicateWords,
  onOpenCambridge,
  initialPrompt,
  onClearInitialPrompt,
  onBatchUpdateTermsCategory,
  onAddCategory
}) => {
  const storageScope = userUid || 'guest';
  const tutorStorageKey = `vocabmin_ai_studio_tutor_v2_${storageScope}`;

  const [activeTab, setActiveTab] = useState<StudioTab>('tutor');
  const [savedTermsToast, setSavedTermsToast] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Set of lowercase terms already in user's vocabulary
  const existingTermsSet = useMemo(() => {
    const set = new Set<string>();
    existingWords.forEach((w) => {
      if (w.term) set.add(w.term.trim().toLowerCase());
    });
    return set;
  }, [existingWords]);

  // Unique words summary for context
  const uniqueExistingWords = useMemo(() => {
    const map = new Map<string, Word>();
    existingWords.forEach((w) => {
      const key = w.term.trim().toLowerCase();
      if (!map.has(key)) map.set(key, w);
    });
    return Array.from(map.values());
  }, [existingWords]);

  const uncategorizedWords = useMemo(() => {
    return uniqueExistingWords.filter(
      (w) => !w.category || w.category === '未分類' || w.category.trim() === ''
    );
  }, [uniqueExistingWords]);

  // ==========================================================================
  // 1. TUTOR STATE
  // ==========================================================================
  const [messages, setMessages] = useState<TutorMessage[]>(() => {
    try {
      const saved = localStorage.getItem(tutorStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [DEFAULT_TUTOR_WELCOME];
  });
  const [tutorInput, setTutorInput] = useState('');
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(tutorStorageKey, JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages, tutorStorageKey]);

  useEffect(() => {
    if (activeTab === 'tutor') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTutorLoading, activeTab]);

  // ==========================================================================
  // 2. WORD X-RAY STATE
  // ==========================================================================
  const [xrayInput, setXrayInput] = useState('');
  const [xrayContext, setXrayContext] = useState('');
  const [isXrayLoading, setIsXrayLoading] = useState(false);
  const [xrayResult, setXrayResult] = useState<WordXRayResult | null>(null);
  const [xrayError, setXrayError] = useState<string | null>(null);

  // ==========================================================================
  // 3. WRITING CLINIC STATE
  // ==========================================================================
  const [clinicInput, setClinicInput] = useState('');
  const [clinicGoal, setClinicGoal] = useState<'general' | 'business' | 'academic' | 'casual'>('general');
  const [isClinicLoading, setIsClinicLoading] = useState(false);
  const [clinicResult, setClinicResult] = useState<WritingClinicResult | null>(null);
  const [clinicError, setClinicError] = useState<string | null>(null);

  // ==========================================================================
  // 4. VOCAB WORKSHOP STATE
  // ==========================================================================
  const [workshopTopic, setWorkshopTopic] = useState('TOEIC 商務談判與職場溝通');
  const [workshopLevel, setWorkshopLevel] = useState<'A2' | 'B1' | 'B2' | 'C1' | 'C2'>('B2');
  const [workshopCount, setWorkshopCount] = useState<number>(6);
  const [isWorkshopLoading, setIsWorkshopLoading] = useState(false);
  const [workshopResult, setWorkshopResult] = useState<{
    themeTitle: string;
    themeSummary: string;
    SuggestedCategory: string;
    words: RecommendedWordItem[];
  } | null>(null);
  const [workshopError, setWorkshopError] = useState<string | null>(null);

  // ==========================================================================
  // 5. QUIZ COACH STATE
  // ==========================================================================
  const [quizSourceMode, setQuizSourceMode] = useState<'library' | 'custom'>('library');
  const [customQuizTopic, setCustomQuizTopic] = useState('CEFR B2 核心高頻字彙');
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizCoachIntro, setQuizCoachIntro] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionItem[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizError, setQuizError] = useState<string | null>(null);

  // ==========================================================================
  // 6. SMART TOOLKIT STATE
  // ==========================================================================
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categoryPlan, setCategoryPlan] = useState<{
    summaryZh: string;
    groups: SmartCategoryGroup[];
  } | null>(null);
  const [appliedCategoryGroups, setAppliedCategoryGroups] = useState<Record<string, boolean>>({});
  const [isEnrichingLibrary, setIsEnrichingLibrary] = useState(false);
  const [toolkitStatusMsg, setToolkitStatusMsg] = useState<string | null>(null);

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

  // Handle initialPrompt if jumped from another screen
  useEffect(() => {
    const promptStr =
      typeof initialPrompt === 'string'
        ? initialPrompt.trim()
        : initialPrompt?.text?.trim() || '';
    if (promptStr) {
      setActiveTab('tutor');
      handleSendTutorPrompt(promptStr);
      onClearInitialPrompt?.();
    }
  }, [initialPrompt]);

  const handleSaveSingleWord = (item: RecommendedWordItem) => {
    const cleanTerm = item.term.trim();
    if (!cleanTerm) return;
    onAddWords([
      {
        term: cleanTerm,
        pos: normalizePos(item.pos),
        def: item.def.trim(),
        defEn: (item.defEn || '').trim(),
        ex: (item.ex || '').trim(),
        category: item.category || '未分類'
      }
    ]);
    setSavedTermsToast((prev) => ({ ...prev, [cleanTerm.toLowerCase()]: true }));
  };

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // --------------------------------------------------------------------------
  // HANDLER 1: Tutor Chat
  // --------------------------------------------------------------------------
  const handleSendTutorPrompt = async (overrideText?: string) => {
    const promptText = (overrideText ?? tutorInput).trim();
    if (!promptText || isTutorLoading) return;

    if (!overrideText) setTutorInput('');

    const userMsg: TutorMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: promptText
    };

    const historyForApi = messages
      .filter((m) => !m.isError && m.id !== 'welcome-v2')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setIsTutorLoading(true);

    try {
      const response = await apiFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'tutor',
          userPrompt: promptText,
          messages: historyForApi,
          screenContext: {
            currentTab: 'ai',
            totalWordsCount: uniqueExistingWords.length,
            totalArticlesCount: existingArticles.length,
            allCategories: settings?.customCategories || []
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'AI 服務暫時無回應');
      }

      const modelMsg: TutorMessage = {
        id: `m-${Date.now()}`,
        role: 'model',
        content: data.reply || '已為您整理分析結果。',
        recommendedWords: Array.isArray(data.recommendedWords) ? data.recommendedWords : [],
        followUpSuggestions: Array.isArray(data.followUpSuggestions) ? data.followUpSuggestions : []
      };

      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          content: `⚠️ **連線或金鑰提示**：${err.message || '請檢查網路連線或至右上角「設定」確認您的 Gemini API Key。'}`,
          isError: true
        }
      ]);
    } finally {
      setIsTutorLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // HANDLER 2: Word X-Ray
  // --------------------------------------------------------------------------
  const handleRunWordXRay = async (overrideWord?: string) => {
    const wordToAnalyze = (overrideWord ?? xrayInput).trim();
    if (!wordToAnalyze || isXrayLoading) return;
    if (overrideWord) setXrayInput(overrideWord);

    setIsXrayLoading(true);
    setXrayError(null);

    try {
      const response = await apiFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'word_xray',
          targetWord: wordToAnalyze,
          contextSentence: xrayContext.trim()
        })
      });
      const data = await response.json();
      if (!response.ok || !data.xray) {
        throw new Error(data.error || '無法剖析該單字，請稍後再試');
      }
      setXrayResult(data.xray);
    } catch (err: any) {
      setXrayError(err.message || '剖析失敗，請確認 API Key 設定');
    } finally {
      setIsXrayLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // HANDLER 3: Writing Clinic
  // --------------------------------------------------------------------------
  const handleRunWritingClinic = async () => {
    const text = clinicInput.trim();
    if (!text || isClinicLoading) return;

    setIsClinicLoading(true);
    setClinicError(null);

    try {
      const response = await apiFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'writing_clinic',
          writingText: text,
          writingGoal: clinicGoal
        })
      });
      const data = await response.json();
      if (!response.ok || !data.clinic) {
        throw new Error(data.error || '寫作門診分析失敗，請稍後再試');
      }
      setClinicResult(data.clinic);
    } catch (err: any) {
      setClinicError(err.message || '分析失敗，請確認 API Key 設定');
    } finally {
      setIsClinicLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // HANDLER 4: Vocab Workshop
  // --------------------------------------------------------------------------
  const handleRunWorkshop = async (overrideTopic?: string) => {
    const topic = (overrideTopic ?? workshopTopic).trim();
    if (!topic || isWorkshopLoading) return;
    if (overrideTopic) setWorkshopTopic(overrideTopic);

    setIsWorkshopLoading(true);
    setWorkshopError(null);

    try {
      const response = await apiFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'vocab_workshop',
          workshopTopic: topic,
          workshopLevel,
          workshopCount,
          existingWordsSummary: uniqueExistingWords.map((w) => w.term)
        })
      });
      const data = await response.json();
      if (!response.ok || !data.workshop) {
        throw new Error(data.error || '生成主題單字失敗，請稍後再試');
      }
      setWorkshopResult(data.workshop);
    } catch (err: any) {
      setWorkshopError(err.message || '生成失敗，請確認 API Key 設定');
    } finally {
      setIsWorkshopLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // HANDLER 5: Quiz Coach
  // --------------------------------------------------------------------------
  const handleStartQuizCoach = async () => {
    if (isQuizLoading) return;
    setIsQuizLoading(true);
    setQuizError(null);
    setSelectedAnswers({});

    // Pick lowest-level / due words from user's library
    const candidateWords = [...uniqueExistingWords]
      .sort((a, b) => (a.level || 0) - (b.level || 0))
      .slice(0, 8)
      .map((w) => ({ term: w.term, pos: w.pos, def: w.def }));

    try {
      const response = await apiFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'quiz_coach',
          quizWords: quizSourceMode === 'library' && candidateWords.length >= 2 ? candidateWords : [],
          userPrompt: quizSourceMode === 'custom' || candidateWords.length < 2 ? customQuizTopic : ''
        })
      });
      const data = await response.json();
      if (!response.ok || !data.quiz || !Array.isArray(data.quiz.questions)) {
        throw new Error(data.error || '生成特訓題目失敗');
      }
      setQuizTitle(data.quiz.quizTitle || 'AI 弱點實戰隨堂特訓');
      setQuizCoachIntro(data.quiz.coachIntroZh || '');
      setQuizQuestions(data.quiz.questions);
    } catch (err: any) {
      setQuizError(err.message || '無法產生隨堂測驗，請檢查設定');
    } finally {
      setIsQuizLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // HANDLER 6: Smart Toolkit (Categorize & Enrich)
  // --------------------------------------------------------------------------
  const handleRunSmartCategorize = async () => {
    if (isCategorizing || uncategorizedWords.length === 0) return;
    setIsCategorizing(true);
    setToolkitStatusMsg(null);
    setAppliedCategoryGroups({});

    try {
      const response = await apiFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'smart_categorize',
          existingWordsSummary: uncategorizedWords.slice(0, 45).map((w) => ({
            term: w.term,
            pos: w.pos,
            def: w.def
          })),
          screenContext: {
            allCategories: settings?.customCategories || []
          }
        })
      });
      const data = await response.json();
      if (!response.ok || !data.categorization) {
        throw new Error(data.error || '智慧分類分析失敗');
      }
      setCategoryPlan(data.categorization);
    } catch (err: any) {
      setToolkitStatusMsg(`⚠️ ${err.message || '分析失敗'}`);
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleApplyCategoryGroup = (group: SmartCategoryGroup) => {
    if (!group.category || !Array.isArray(group.terms) || group.terms.length === 0) return;
    onAddCategory?.(group.category);
    onBatchUpdateTermsCategory?.(group.terms, group.category);
    setAppliedCategoryGroups((prev) => ({ ...prev, [group.category]: true }));
  };

  const handleApplyAllCategoryGroups = () => {
    if (!categoryPlan?.groups) return;
    categoryPlan.groups.forEach((group) => {
      if (!appliedCategoryGroups[group.category]) {
        onAddCategory?.(group.category);
        onBatchUpdateTermsCategory?.(group.terms, group.category);
      }
    });
    const nextMap: Record<string, boolean> = {};
    categoryPlan.groups.forEach((g) => {
      nextMap[g.category] = true;
    });
    setAppliedCategoryGroups(nextMap);
    setToolkitStatusMsg('✅ 已成功將所有建議分類套用至您的單字庫！');
  };

  const handleBatchEnrichMissing = async () => {
    const incompleteWords = existingWords.filter(
      (w) => !w.defEn || !w.ex || !w.def || w.def.trim().toLowerCase() === w.term.trim().toLowerCase()
    );
    if (incompleteWords.length === 0) {
      setToolkitStatusMsg('✨ 您的單字庫中所有單字皆已具備完整中英釋義與例句！');
      return;
    }

    setIsEnrichingLibrary(true);
    setToolkitStatusMsg(null);
    try {
      const response = await apiFetch('/api/ai/enrich-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: incompleteWords.slice(0, 25)
        })
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.words)) {
        throw new Error(data.error || '補齊失敗');
      }
      onBatchStandardizeWords(data.words);
      setToolkitStatusMsg(`✅ 已成功為 ${data.words.length} 個單字補齊道地英英釋義與例句！`);
    } catch (err: any) {
      setToolkitStatusMsg(`⚠️ ${err.message || '補齊過程發生錯誤'}`);
    } finally {
      setIsEnrichingLibrary(false);
    }
  };

  const STUDIO_TABS: {
    id: StudioTab;
    label: string;
    sub: string;
    icon: React.ReactNode;
    badge?: string | number;
  }[] = [
    {
      id: 'tutor',
      label: '智慧家教',
      sub: '文法・翻譯・精準問答',
      icon: <Bot className="w-4 h-4" />
    },
    {
      id: 'xray',
      label: '單字 X 光室',
      sub: '字根・搭配詞・近義辨析',
      icon: <Microscope className="w-4 h-4" />
    },
    {
      id: 'clinic',
      label: '寫作潤飾門診',
      sub: '去中式英文・三階改寫',
      icon: <PenTool className="w-4 h-4" />
    },
    {
      id: 'workshop',
      label: '主題生詞工坊',
      sub: '情境詞包・一鍵收錄',
      icon: <Layers className="w-4 h-4" />
    },
    {
      id: 'quiz',
      label: '弱點隨堂考官',
      sub: '個人字庫實戰出題',
      icon: <Target className="w-4 h-4" />
    },
    {
      id: 'toolkit',
      label: '字庫智慧整理',
      sub: 'AI 自動分類・補齊釋義',
      icon: <Wrench className="w-4 h-4" />,
      badge: uncategorizedWords.length > 0 ? uncategorizedWords.length : undefined
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 pb-24 pt-2 animate-enter">
      {/* Studio Hero Header & Mode Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-4 sm:p-6 mb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  VocabMin AI 語言學習工作台
                </h1>
                <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                  Zero-Hallucination Engine
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                專為台灣學習者打造的五大專屬 AI 模組 — 語意清晰、繁體中文精準解析、零幻覺干擾
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 self-start md:self-auto">
            <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              個人字庫：<strong className="text-slate-800 dark:text-slate-200">{uniqueExistingWords.length}</strong> 字
            </span>
            {uncategorizedWords.length > 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <button
                  onClick={() => setActiveTab('toolkit')}
                  className="text-amber-600 dark:text-amber-400 font-semibold hover:underline"
                >
                  {uncategorizedWords.length} 字未分類
                </button>
              </>
            )}
          </div>
        </div>

        {/* 6-Mode Navigation Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {STUDIO_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                    : 'bg-slate-50/70 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 border-slate-200/70 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div
                    className={`p-1.5 rounded-xl ${
                      isActive ? 'bg-white/20 text-white' : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400'
                    }`}
                  >
                    {tab.icon}
                  </div>
                  {tab.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                        isActive
                          ? 'bg-white text-indigo-700'
                          : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </div>
                <div className="font-bold text-xs sm:text-sm leading-tight">{tab.label}</div>
                <div
                  className={`text-[10px] mt-0.5 line-clamp-1 ${
                    isActive ? 'text-indigo-100' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {tab.sub}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: 智慧家教 (AI TUTOR CHAT)                                       */}
      {/* ==================================================================== */}
      {activeTab === 'tutor' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col h-[calc(100vh-290px)] min-h-[520px] overflow-hidden">
          {/* Top Bar */}
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                一對一英語家教（支援文法拆解、中英精譯、同義詞比較、例句造句）
              </span>
            </div>
            <button
              onClick={() => setMessages([DEFAULT_TUTOR_WELCOME])}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="清除對話紀錄"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清除對話</span>
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'model' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] sm:max-w-[78%] space-y-3 ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm shadow-sm'
                        : msg.isError
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200 border border-rose-200 dark:border-rose-800/60'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60 rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                  </div>

                  {/* Recommended Words Cards (if any) */}
                  {msg.recommendedWords && msg.recommendedWords.length > 0 && (
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          推薦收錄單字 ({msg.recommendedWords.length})
                        </span>
                        <button
                          onClick={() => {
                            msg.recommendedWords?.forEach((w) => handleSaveSingleWord(w));
                          }}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                        >
                          全部加入字庫
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.recommendedWords.map((w, idx) => {
                          const key = w.term.trim().toLowerCase();
                          const isSaved = existingTermsSet.has(key) || savedTermsToast[key];
                          return (
                            <div
                              key={`${w.term}-${idx}`}
                              className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/70 flex flex-col justify-between gap-2"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                                      {w.term}
                                    </span>
                                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                                      {w.pos}
                                    </span>
                                    <button
                                      onClick={() => speak(w.term)}
                                      className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                                      title="發音"
                                    >
                                      <Volume2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => handleSaveSingleWord(w)}
                                    disabled={isSaved}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                                      isSaved
                                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                                        : 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white'
                                    }`}
                                  >
                                    {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                    <span>{isSaved ? '已收錄' : '收錄'}</span>
                                  </button>
                                </div>
                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1">
                                  {w.def}
                                </div>
                                {w.defEn && (
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                    {w.defEn}
                                  </div>
                                )}
                              </div>
                              {w.ex && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 italic border-t border-slate-100 dark:border-slate-800 pt-1.5">
                                  "{w.ex}"
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Suggestion Pills */}
                  {msg.role === 'model' &&
                    msg.followUpSuggestions &&
                    msg.followUpSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.followUpSuggestions.map((sug, i) => (
                          <button
                            key={i}
                            onClick={() => handleSendTutorPrompt(sug)}
                            disabled={isTutorLoading}
                            className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
                          >
                            <span>{sug}</span>
                            <ArrowRight className="w-3 h-3 opacity-60" />
                          </button>
                        ))}
                      </div>
                    )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isTutorLoading && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 rounded-2xl px-4 py-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                  正在思考並整理繁體中文詳解...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendTutorPrompt();
            }}
            className="p-3 sm:p-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tutorInput}
                onChange={(e) => setTutorInput(e.target.value)}
                placeholder="詢問任何英文問題，例如：「怎麼區分借東西 borrow 跟 lend？」或「幫我查 meticulous」..."
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button
                type="submit"
                disabled={!tutorInput.trim() || isTutorLoading}
                className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center gap-2 shadow-sm transition-all shrink-0"
              >
                {isTutorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">發送</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: 單字 X 光室 (WORD X-RAY)                                      */}
      {/* ==================================================================== */}
      {activeTab === 'xray' && (
        <div className="space-y-5">
          {/* Search & Quick Pick Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <Microscope className="w-5 h-5 text-indigo-600" />
              <span>單字深度 X 光剖析室</span>
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunWordXRay();
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-3"
            >
              <div className="md:col-span-5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  目標英文單字或片語 *
                </label>
                <input
                  type="text"
                  value={xrayInput}
                  onChange={(e) => setXrayInput(e.target.value)}
                  placeholder="例如：ubiquitous, mitigate, take for granted..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div className="md:col-span-5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                  出現的句子語境（選填，有助於一字多義精準定位）
                </label>
                <input
                  type="text"
                  value={xrayContext}
                  onChange={(e) => setXrayContext(e.target.value)}
                  placeholder="貼上您讀到這個單字的原句（選填）..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div className="md:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={!xrayInput.trim() || isXrayLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  {isXrayLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Microscope className="w-4 h-4" />
                  )}
                  <span>立即剖析</span>
                </button>
              </div>
            </form>

            {/* Quick pick from user's own library */}
            {uniqueExistingWords.length > 0 && (
              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400">從您的字庫快速點選：</span>
                {uniqueExistingWords.slice(0, 10).map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleRunWordXRay(w.term)}
                    disabled={isXrayLoading}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 transition-colors"
                  >
                    {w.term}
                  </button>
                ))}
              </div>
            )}
          </div>

          {xrayError && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-sm text-rose-700 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{xrayError}</span>
            </div>
          )}

          {isXrayLoading && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                正在進行語言學 X 光掃描（字根拆解、母語搭配詞、近義詞語感比較）...
              </div>
            </div>
          )}

          {xrayResult && !isXrayLoading && (
            <div className="space-y-4 animate-enter">
              {/* Hero Word Card */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                        {xrayResult.term}
                      </h3>
                      <span className="text-sm font-mono text-slate-500 dark:text-slate-400">
                        {xrayResult.phonetic}
                      </span>
                      <button
                        onClick={() => speak(xrayResult.term)}
                        className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 transition-colors"
                        title="聆聽發音"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {xrayResult.pos}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-violet-100 dark:bg-violet-950/80 text-violet-700 dark:text-violet-300">
                        CEFR {xrayResult.cefrLevel}
                      </span>
                    </div>
                    <div className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400 mt-2">
                      {xrayResult.coreDefZh}
                    </div>
                    <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {xrayResult.coreDefEn}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      onClick={() => onOpenCambridge(xrayResult.term)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>劍橋字典</span>
                    </button>
                    <button
                      onClick={() =>
                        handleSaveSingleWord({
                          term: xrayResult.term,
                          pos: normalizePos(xrayResult.pos),
                          def: xrayResult.coreDefZh,
                          defEn: xrayResult.coreDefEn,
                          ex: xrayResult.exampleSentences?.[0]?.en || ''
                        })
                      }
                      disabled={
                        existingTermsSet.has(xrayResult.term.trim().toLowerCase()) ||
                        savedTermsToast[xrayResult.term.trim().toLowerCase()]
                      }
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                    >
                      {existingTermsSet.has(xrayResult.term.trim().toLowerCase()) ||
                      savedTermsToast[xrayResult.term.trim().toLowerCase()] ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>已收錄於字庫</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>加入單字庫</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 3 Core Pillars: Etymology, Memory Hook, Nuance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                  <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 rounded-2xl p-4">
                    <div className="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-1.5">
                      <Lightbulb className="w-4 h-4" />
                      <span>秒記口訣與記憶錨點</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {xrayResult.memoryHook}
                    </p>
                  </div>

                  <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 rounded-2xl p-4">
                    <div className="text-xs font-black text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5 mb-1.5">
                      <Layers className="w-4 h-4" />
                      <span>字根字首與構詞拆解</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {xrayResult.etymology}
                    </p>
                  </div>

                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 rounded-2xl p-4">
                    <div className="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>母語者語感與常見誤區</span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {xrayResult.nuanceAndVibe}
                    </p>
                  </div>
                </div>
              </div>

              {/* Collocations & Synonyms Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Collocations */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" />
                    <span>母語高頻搭配詞 (Collocations)</span>
                  </h4>
                  <div className="space-y-2.5">
                    {xrayResult.collocations?.map((col, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">
                            {col.phrase}
                          </span>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {col.meaningZh}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                          "{col.exampleEn}"
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Synonyms Nuance Comparison */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-violet-500" />
                    <span>近義詞微妙語感辨析</span>
                  </h4>
                  <div className="space-y-2.5">
                    {xrayResult.synonymsComparison?.map((syn, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <button
                            onClick={() => handleRunWordXRay(syn.word)}
                            className="font-bold text-sm text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                          >
                            <span>{syn.word}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200">{syn.nuanceZh}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                          "{syn.exampleEn}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Example Sentences & Word Family */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-3">
                    多語境實戰例句
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {xrayResult.exampleSentences?.map((ex, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                              {ex.contextTag}
                            </span>
                            <button
                              onClick={() => speak(ex.en)}
                              className="text-slate-400 hover:text-indigo-600"
                              title="朗讀例句"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100">
                            {ex.en}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                          {ex.zh}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {xrayResult.wordFamily && xrayResult.wordFamily.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-400">衍生詞性家族：</span>
                    {xrayResult.wordFamily.map((wf, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRunWordXRay(wf.term)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors"
                      >
                        <strong className="text-slate-800 dark:text-slate-200">{wf.term}</strong>{' '}
                        <span className="text-slate-400 font-mono">({wf.pos})</span>{' '}
                        <span className="text-slate-600 dark:text-slate-300">{wf.defZh}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: 寫作潤飾門診 (WRITING CLINIC)                                  */}
      {/* ==================================================================== */}
      {activeTab === 'clinic' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-indigo-600" />
                  <span>寫作門診與母語三階潤飾</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  輸入您的英文草稿（不會寫的詞可直接夾雜中文），AI 將為您診斷病句並提供三種層次的道地改寫
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start">
                {(
                  [
                    { id: 'general', label: '日常自然' },
                    { id: 'business', label: '專業商務' },
                    { id: 'academic', label: '學術考試' },
                    { id: 'casual', label: '美式口語' }
                  ] as const
                ).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setClinicGoal(g.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      clinicGoal === g.id
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={4}
              value={clinicInput}
              onChange={(e) => setClinicInput(e.target.value)}
              placeholder="請輸入您想批改或潤飾的英文句子/段落（例如：I very like this project, hope we can 儘快達成共識 and make good result...）"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400 font-semibold">範例測試：</span>
                {[
                  'Thank you for help me yesterday, I will give you the report before Friday.',
                  'Because the weather is very bad, so our flight was delay for three hours.',
                  'More and more people think AI will 取代傳統工作 in the future.'
                ].map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => setClinicInput(sample)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    範例 {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={handleRunWritingClinic}
                disabled={!clinicInput.trim() || isClinicLoading}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center gap-2 shadow-sm"
              >
                {isClinicLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>開始門診批改</span>
              </button>
            </div>
          </div>

          {clinicError && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 text-sm text-rose-700 dark:text-rose-200">
              {clinicError}
            </div>
          )}

          {clinicResult && !isClinicLoading && (
            <div className="space-y-4 animate-enter">
              {/* Score & Overall Feedback */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex flex-col items-center justify-center shrink-0 shadow-md">
                  <span className="text-xl font-black leading-none">{clinicResult.overallScore}</span>
                  <span className="text-[10px] opacity-80 mt-0.5">語感評分</span>
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">
                    主治教練總評
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {clinicResult.overallCommentZh}
                  </p>
                </div>
              </div>

              {/* 3-Tier Rewrites */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    key: 'corrected',
                    badge: 'STEP 1 • 文法修正版',
                    color: 'emerald',
                    data: clinicResult.correctedVersion,
                    note: clinicResult.correctedVersion?.keyFixesNote
                  },
                  {
                    key: 'native',
                    badge: 'STEP 2 • 母語自然版 (推薦)',
                    color: 'indigo',
                    data: clinicResult.nativeNaturalVersion,
                    note: clinicResult.nativeNaturalVersion?.highlightNote
                  },
                  {
                    key: 'c1',
                    badge: 'STEP 3 • CEFR C1 高階精煉版',
                    color: 'violet',
                    data: clinicResult.advancedC1Version,
                    note: clinicResult.advancedC1Version?.highlightNote
                  }
                ].map((tier) => (
                  <div
                    key={tier.key}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300">
                          {tier.badge}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => speak(tier.data?.text || '')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600"
                            title="朗讀"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleCopyText(tier.key, tier.data?.text || '')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600"
                            title="複製句子"
                          >
                            {copiedKey === tier.key ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
                        {tier.data?.text}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {tier.data?.translationZh}
                      </p>
                    </div>
                    {tier.note && (
                      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-indigo-600 dark:text-indigo-300 font-medium">
                        💡 {tier.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Error Diagnostics */}
              {clinicResult.diagnostics && clinicResult.diagnostics.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-3">
                    逐處細節診斷與去中式英文解析
                  </h4>
                  <div className="space-y-2.5">
                    {clinicResult.diagnostics.map((d, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                              {d.issueType}
                            </span>
                            <span className="text-xs line-through text-rose-500 font-medium">
                              {d.originalSpan}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              {d.fixedSpan}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {d.explanationZh}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upgraded Vocabulary to Save */}
              {clinicResult.upgradedVocabulary && clinicResult.upgradedVocabulary.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white mb-3">
                    本次潤飾亮點詞彙（可一鍵收入字庫）
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {clinicResult.upgradedVocabulary.map((w, i) => {
                      const key = w.term.trim().toLowerCase();
                      const isSaved = existingTermsSet.has(key) || savedTermsToast[key];
                      return (
                        <div
                          key={i}
                          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm text-slate-900 dark:text-white">
                                {w.term}
                              </span>
                              <button
                                onClick={() => handleSaveSingleWord(w)}
                                disabled={isSaved}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
                                  isSaved
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                              >
                                {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                <span>{isSaved ? '已收錄' : '收錄'}</span>
                              </button>
                            </div>
                            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                              {w.pos} {w.def}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 italic">"{w.ex}"</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: 主題生詞工坊 (VOCAB WORKSHOP)                                  */}
      {/* ==================================================================== */}
      {activeTab === 'workshop' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>主題生詞工坊（自動避開您字庫中已有的單字）</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  想學習的主題、考試或生活場景
                </label>
                <input
                  type="text"
                  value={workshopTopic}
                  onChange={(e) => setWorkshopTopic(e.target.value)}
                  placeholder="例如：TOEIC 商務談判、IELTS 環境生態、軟體工程會議..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-500 mb-1">CEFR 難度等級</label>
                <select
                  value={workshopLevel}
                  onChange={(e) => setWorkshopLevel(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value="A2">A2 初中級基礎</option>
                  <option value="B1">B1 中級實用</option>
                  <option value="B2">B2 中高級核心</option>
                  <option value="C1">C1 高階流利學術</option>
                  <option value="C2">C2 母語精通級</option>
                </select>
              </div>
              <div className="md:col-span-3 flex items-end gap-2">
                <select
                  value={workshopCount}
                  onChange={(e) => setWorkshopCount(Number(e.target.value))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                >
                  <option value={4}>4 字</option>
                  <option value={6}>6 字</option>
                  <option value={8}>8 字</option>
                </select>
                <button
                  onClick={() => handleRunWorkshop()}
                  disabled={!workshopTopic.trim() || isWorkshopLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isWorkshopLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>生成詞包</span>
                </button>
              </div>
            </div>

            {/* Topic Presets */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs font-bold text-slate-400">熱門主題一鍵選：</span>
              {[
                'TOEIC 多益商務書信與合約',
                'IELTS 雅思高分轉折與論述詞彙',
                'AI 人工智慧與科技趨勢',
                '美劇高頻道地慣用片語',
                '跨國遠端工作與敏捷開發會議',
                '情緒與人際微妙關係形容詞'
              ].map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleRunWorkshop(preset)}
                  disabled={isWorkshopLoading}
                  className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {workshopError && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">
              {workshopError}
            </div>
          )}

          {workshopResult && !isWorkshopLoading && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4 animate-enter">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {workshopResult.themeTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {workshopResult.themeSummary}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (workshopResult.SuggestedCategory) {
                      onAddCategory?.(workshopResult.SuggestedCategory);
                    }
                    workshopResult.words.forEach((w) =>
                      handleSaveSingleWord({
                        ...w,
                        category: w.category || workshopResult.SuggestedCategory || '未分類'
                      })
                    );
                  }}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 self-start sm:self-center shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>一鍵全數收入單字庫 ({workshopResult.words.length})</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {workshopResult.words.map((w, idx) => {
                  const key = w.term.trim().toLowerCase();
                  const isSaved = existingTermsSet.has(key) || savedTermsToast[key];
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-slate-900 dark:text-white">
                              {w.term}
                            </span>
                            <button
                              onClick={() => speak(w.term)}
                              className="p-1 text-slate-400 hover:text-indigo-600"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                              {w.pos}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              handleSaveSingleWord({
                                ...w,
                                category: w.category || workshopResult.SuggestedCategory || '未分類'
                              })
                            }
                            disabled={isSaved}
                            className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 ${
                              isSaved
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                          >
                            {isSaved ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            <span>{isSaved ? '已收錄' : '加入字庫'}</span>
                          </button>
                        </div>

                        <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1.5">
                          {w.def}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {w.defEn}
                        </div>

                        {w.memoryTip && (
                          <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-xl">
                            💡 記憶提示：{w.memoryTip}
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 text-xs space-y-0.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">"{w.ex}"</p>
                        {w.exZh && <p className="text-slate-500 dark:text-slate-400">{w.exZh}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: 弱點隨堂考官 (QUIZ COACH)                                      */}
      {/* ==================================================================== */}
      {activeTab === 'quiz' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  <span>AI 弱點特訓隨堂考官</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  直接抽取您單字庫中熟練度較低的單字，即時編寫全新情境克漏字與語感辨析題
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuizSourceMode('library')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    quizSourceMode === 'library'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  從我的弱點字庫出題 ({uniqueExistingWords.length} 字)
                </button>
                <button
                  onClick={() => setQuizSourceMode('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    quizSourceMode === 'custom'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  自訂主題出題
                </button>
              </div>
            </div>

            {quizSourceMode === 'custom' && (
              <input
                type="text"
                value={customQuizTopic}
                onChange={(e) => setCustomQuizTopic(e.target.value)}
                placeholder="輸入想測驗的主題，例如：多益易混淆動詞、高階形容詞..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm"
              />
            )}

            <button
              onClick={handleStartQuizCoach}
              disabled={isQuizLoading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm flex items-center gap-2 shadow-sm"
            >
              {isQuizLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{quizQuestions.length > 0 ? '重新生成一組新考題' : '開始生成 4 題實戰特訓'}</span>
            </button>
          </div>

          {quizError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">
              {quizError}
            </div>
          )}

          {quizQuestions.length > 0 && !isQuizLoading && (
            <div className="space-y-4 animate-enter">
              <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-200">
                    {quizTitle}
                  </h3>
                  {quizCoachIntro && (
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                      {quizCoachIntro}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-black text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl">
                  <Award className="w-4 h-4" />
                  <span>
                    得分：
                    {
                      Object.entries(selectedAnswers).filter(
                        ([qIdx, ansIdx]) => quizQuestions[Number(qIdx)]?.correctIndex === ansIdx
                      ).length
                    }{' '}
                    / {quizQuestions.length}
                  </span>
                </div>
              </div>

              {quizQuestions.map((q, qIdx) => {
                const chosen = selectedAnswers[qIdx];
                const isAnswered = chosen !== undefined;
                return (
                  <div
                    key={qIdx}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        Q{qIdx + 1} • {q.questionType}
                      </span>
                      <button
                        onClick={() => speak(q.stemEn.replace(/_{2,}/g, q.options[q.correctIndex] || ''))}
                        className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>朗讀完整句</span>
                      </button>
                    </div>

                    <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-relaxed">
                      {q.stemEn}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect = oIdx === q.correctIndex;
                        const isSelected = chosen === oIdx;
                        let btnStyle =
                          'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-indigo-400';
                        if (isAnswered) {
                          if (isCorrect) {
                            btnStyle =
                              'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-800 dark:text-emerald-200 font-bold';
                          } else if (isSelected) {
                            btnStyle =
                              'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200';
                          } else {
                            btnStyle = 'opacity-50 bg-slate-50 dark:bg-slate-800/40 border-slate-200';
                          }
                        }

                        return (
                          <button
                            key={oIdx}
                            disabled={isAnswered}
                            onClick={() =>
                              setSelectedAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                            }
                            className={`p-3 rounded-2xl border text-left text-sm flex items-center justify-between transition-all ${btnStyle}`}
                          >
                            <span>
                              <strong className="mr-2 font-mono">
                                {String.fromCharCode(65 + oIdx)}.
                              </strong>
                              {opt}
                            </span>
                            {isAnswered && isCorrect && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                            {isAnswered && isSelected && !isCorrect && (
                              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {isAnswered && (
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 space-y-2 text-xs sm:text-sm animate-enter">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          📖 句意翻譯：{q.stemTranslationZh}
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 leading-relaxed">
                          💡 <strong>考官詳解：</strong>
                          {q.explanationZh}
                        </div>
                        {q.collocationTip && (
                          <div className="text-indigo-600 dark:text-indigo-400 font-semibold">
                            🔑 重點筆記：{q.collocationTip}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 6: 字庫智慧整理 (SMART LIBRARY TOOLKIT)                           */}
      {/* ==================================================================== */}
      {activeTab === 'toolkit' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" />
                <span>字庫確定性智慧整理中心</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                透過視覺化預覽與一鍵確認管理您的單字庫，安全可靠、不會因自然語言誤判而誤刪資料
              </p>
            </div>

            {toolkitStatusMsg && (
              <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300">
                {toolkitStatusMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Tool 1: AI Auto Categorize */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      1. 未分類單字 AI 智慧歸類
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                      {uncategorizedWords.length} 個未分類
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    由 AI 自動掃描您尚未分類的單字，依語意與領域規劃分類群組，預覽滿意後即可一鍵套用。
                  </p>
                </div>
                <button
                  onClick={handleRunSmartCategorize}
                  disabled={isCategorizing || uncategorizedWords.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  {isCategorizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FolderPlus className="w-4 h-4" />
                  )}
                  <span>
                    {uncategorizedWords.length === 0 ? '所有單字皆已分類' : '開始 AI 分類規劃'}
                  </span>
                </button>
              </div>

              {/* Tool 2: Enrich Missing Definitions */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white mb-1.5">
                    2. 補齊缺漏英英釋義與例句
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    自動檢查字庫中缺少英英定義 (defEn) 或例句的單字，並批次為您補齊道地雙語資料。
                  </p>
                </div>
                <button
                  onClick={handleBatchEnrichMissing}
                  disabled={isEnrichingLibrary || existingWords.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-40 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  {isEnrichingLibrary ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>一鍵檢查並補齊資料</span>
                </button>
              </div>

              {/* Tool 3: Deduplicate */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-white mb-1.5">
                    3. 單字庫重複項目合併去重
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    安全合併重複建立的相同單字與詞性，並保留您最高的學習熟練度紀錄。
                  </p>
                </div>
                <button
                  onClick={() => {
                    onDeduplicateWords();
                    setToolkitStatusMsg('✅ 已執行單字庫重複項目合併與清理！');
                  }}
                  disabled={existingWords.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>執行合併去重</span>
                </button>
              </div>
            </div>
          </div>

          {/* Categorization Plan Preview */}
          {categoryPlan && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4 animate-enter">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    AI 智慧分類建議預覽
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {categoryPlan.summaryZh}
                  </p>
                </div>
                <button
                  onClick={handleApplyAllCategoryGroups}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 self-start sm:self-center"
                >
                  <Check className="w-4 h-4" />
                  <span>一鍵套用所有分類</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {categoryPlan.groups.map((grp, idx) => {
                  const isApplied = appliedCategoryGroups[grp.category];
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                            📁 {grp.category} ({grp.terms.length})
                          </span>
                          <button
                            onClick={() => handleApplyCategoryGroup(grp)}
                            disabled={isApplied}
                            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
                              isApplied
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                          >
                            {isApplied ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            <span>{isApplied ? '已套用' : '套用此組'}</span>
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {grp.reasonZh}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {grp.terms.map((t, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
