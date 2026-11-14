import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Article,
  ArticleKeyWord,
  ArticleQuizQuestion,
  Word,
  POS,
  CEFRLevel,
  ArticleCategory,
  ReaderSettings,
  SentenceAnalysisData,
  WordAnalysisData,
  ArticleChatMessage,
  ArticleGrammarPoint,
  AppSettings
} from '../types';
import { storage, DEFAULT_READER_SETTINGS, getAllWordCategories } from '../services/storage';
import { tts, FormattedVoiceOption } from '../services/tts';
import {
  BookOpen,
  Volume2,
  VolumeX,
  Plus,
  Check,
  Sparkles,
  Search,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  Settings2,
  HelpCircle,
  Wand2,
  Languages,
  Clock,
  FileText,
  Trash2,
  ExternalLink,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Award,
  Layers,
  Sparkle,
  Mic,
  Volume1,
  Edit3,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Bot,
  MessageSquare,
  Send,
  Copy,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ArticleReaderViewProps {
  userUid?: string;
  words: Word[];
  onAddWords: (newWords: Partial<Word>[]) => void;
  onOpenCambridge: (term: string) => void;
  onBackToHome?: () => void;
  initialArticleId?: string | null;
  onClearInitialArticleId?: () => void;
  onActiveArticleChange?: (articleId: string | null) => void;
  articles?: Article[];
  onArticlesChange?: (updated: Article[]) => void;
  appSettings?: AppSettings;
  categories?: string[];
  onAddCategory?: (categoryName: string) => void;
  onRequestConfirm?: (config: {
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    confirmText?: string;
    onConfirm: () => void;
  }) => void;
}

interface InspectedWordData {
  term: string;
  pos: POS;
  def: string;
  defEn?: string;
  phonetic?: string;
  sentenceContext: string;
  example?: string;
  exampleZh?: string;
  existingWord?: Word;
  isLoading?: boolean;
  hasAILookup?: boolean;
  needsAILookup?: boolean;
  sourceLabel?: string;
  cambridgeBlocked?: boolean;
}

interface ImportedArticleMeta {
  subtitle?: string;
  author?: string;
  source?: string;
  summary?: string;
  keyVocabulary?: ArticleKeyWord[];
  quiz?: ArticleQuizQuestion[];
  grammarPoints?: ArticleGrammarPoint[];
}

const isValidChineseDefClient = (def: string | undefined, term: string): boolean => {
  if (!def || typeof def !== 'string') return false;
  const trimmed = def.trim();
  if (!trimmed) return false;
  const cleanTerm = term.trim().toLowerCase();
  if (trimmed.toLowerCase() === cleanTerm) return false;
  if (/^【[^】]+】$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1).trim().toLowerCase();
    if (inner === cleanTerm || /^[a-zA-Z0-9\s'-]+$/.test(inner)) {
      return false;
    }
  }
  return true;
};

const extractLemmaCandidates = (rawToken: string): string[] => {
  const clean = rawToken.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').toLowerCase();
  if (!clean) return [];
  const candidates = [clean];
  // Possessive stripping
  if (clean.endsWith("'s") || clean.endsWith("’s")) {
    candidates.push(clean.slice(0, -2));
  }
  if (clean.length > 3 && clean.endsWith('s')) {
    if (clean.endsWith('ies') && clean.length > 4) candidates.push(clean.slice(0, -3) + 'y');
    if (clean.endsWith('es') && clean.length > 4) candidates.push(clean.slice(0, -2));
    if (!clean.endsWith('ss')) candidates.push(clean.slice(0, -1));
  }
  if (clean.length > 4 && clean.endsWith('ed')) {
    if (clean.endsWith('ied')) {
      candidates.push(clean.slice(0, -3) + 'y');
    } else {
      const stem = clean.slice(0, -2);
      candidates.push(stem);
      candidates.push(stem + 'e');
      if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
        candidates.push(stem.slice(0, -1));
      }
    }
  }
  if (clean.length > 4 && clean.endsWith('ing')) {
    const stem = clean.slice(0, -3);
    candidates.push(stem);
    candidates.push(stem + 'e');
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      candidates.push(stem.slice(0, -1));
    }
  }
  return Array.from(new Set(candidates.filter(Boolean)));
};

const splitIntoParagraphs = (text: string): string[] => {
  if (!text || !text.trim()) return [];
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (blocks.length === 1 && normalized.includes('\n') && normalized.length > 500) {
    return normalized.split(/\n/).map((p) => p.trim()).filter(Boolean);
  }
  return blocks;
};

export const ArticleReaderView: React.FC<ArticleReaderViewProps> = ({
  userUid,
  words,
  onAddWords,
  onOpenCambridge,
  onBackToHome,
  initialArticleId,
  onClearInitialArticleId,
  onActiveArticleChange,
  articles: externalArticles,
  onArticlesChange,
  appSettings,
  categories,
  onAddCategory,
  onRequestConfirm
}) => {
  const effectiveApiKey = appSettings?.geminiApiKey || storage.getLocalSettings(userUid)?.geminiApiKey;

  // State: Articles List & Active Article
  const [articles, setArticles] = useState<Article[]>(() => externalArticles || storage.getLocalArticles(userUid));
  const [activeArticleId, setActiveArticleId] = useState<string | null>(initialArticleId || null);

  // Sync active reading article with parent App so AI assistant knows exactly what is being read
  useEffect(() => {
    onActiveArticleChange?.(activeArticleId);
  }, [activeArticleId, onActiveArticleChange]);

  useEffect(() => {
    if (externalArticles) {
      setArticles(externalArticles);
    }
  }, [externalArticles]);

  useEffect(() => {
    if (initialArticleId) {
      const list = externalArticles || storage.getLocalArticles(userUid);
      setArticles(list);
      setActiveArticleId(initialArticleId);
    }
  }, [initialArticleId, externalArticles, userUid]);

  // State: Reader Settings
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    storage.getLocalReaderSettings(userUid)
  );
  useEffect(() => {
    setReaderSettings(storage.getLocalReaderSettings(userUid));
  }, [userUid]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTopBarCollapsed, setIsTopBarCollapsed] = useState(false);

  // Available Voices from Web Speech API
  const [availableVoices, setAvailableVoices] = useState<FormattedVoiceOption[]>(() =>
    tts.getFormattedEnglishVoices()
  );

  useEffect(() => {
    const updateVoices = () => {
      setAvailableVoices(tts.getFormattedEnglishVoices());
    };
    updateVoices();
    const unsubscribe = tts.subscribeVoices(updateVoices);
    return unsubscribe;
  }, []);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [levelFilter, setLevelFilter] = useState<string>('All');

  // Word Inspector Modal / Floating Card
  const [inspectedWord, setInspectedWord] = useState<InspectedWordData | null>(null);
  const [customDefEdit, setCustomDefEdit] = useState('');
  const [isEditingDef, setIsEditingDef] = useState(false);
  const [customExEdit, setCustomExEdit] = useState('');
  const [isEditingEx, setIsEditingEx] = useState(false);
  const [showOriginalContext, setShowOriginalContext] = useState(false);

  // Selected Text Lookup Pill
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [selectedSentenceContext, setSelectedSentenceContext] = useState<string>('');
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);

  // Word Save Category & Inline Category Creation
  const [selectedSaveCategory, setSelectedSaveCategory] = useState<string>('');
  const [isAddingCategoryInReader, setIsAddingCategoryInReader] = useState(false);
  const [newCategoryNameInReader, setNewCategoryNameInReader] = useState('');

  // Sentence Analysis Drawer & Background Cache
  const [analyzedSentence, setAnalyzedSentence] = useState<SentenceAnalysisData | null>(null);
  const [cachedSentenceMap, setCachedSentenceMap] = useState<Record<string, SentenceAnalysisData>>(() =>
    storage.getLocalSentenceAnalyses(userUid)
  );

  // Cached Word Lookups (Background storage cache - instant and 0 quota)
  const [cachedWordMap, setCachedWordMap] = useState<Record<string, WordAnalysisData>>(() =>
    storage.getLocalWordAnalyses(userUid)
  );

  useEffect(() => {
    setCachedSentenceMap(storage.getLocalSentenceAnalyses(userUid));
    setCachedWordMap(storage.getLocalWordAnalyses(userUid));
  }, [userUid]);

  // AI Reading Companion / Assistant (AI 伴讀導師)
  const [isAIChatDrawerOpen, setIsAIChatDrawerOpen] = useState(false);
  const [articleChatMessages, setArticleChatMessages] = useState<ArticleChatMessage[]>([]);
  const [chatInputText, setChatInputText] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatSelectedContext, setChatSelectedContext] = useState<string | null>(null);

  // Article Vocabulary / Drawer
  const [isVocabDrawerOpen, setIsVocabDrawerOpen] = useState(false);
  const [extractedKeywords, setExtractedKeywords] = useState<ArticleKeyWord[]>([]);
  const [isExtractingVocab, setIsExtractingVocab] = useState(false);

  // Quiz State
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [isQuizSubmitted, setIsQuizSubmitted] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  // Translation on demand State
  const [isTranslatingArticle, setIsTranslatingArticle] = useState(false);

  // Flashcards for saved words in article State
  const [isFlashcardOpen, setIsFlashcardOpen] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlashcardFlipped, setIsFlashcardFlipped] = useState(false);

  // Import / Custom Article Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTitle, setImportTitle] = useState('');
  const [importContent, setImportContent] = useState('');
  const [importLevel, setImportLevel] = useState<CEFRLevel>('B1');
  const [importCategory, setImportCategory] = useState<ArticleCategory>('Custom');
  const [importTranslation, setImportTranslation] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [isImportingByAI, setIsImportingByAI] = useState(false);
  const [importedArticleMeta, setImportedArticleMeta] = useState<ImportedArticleMeta | null>(null);

  // AI Generate Article Modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [genTopic, setGenTopic] = useState('');
  const [genLevel, setGenLevel] = useState<CEFRLevel>('B2');
  const [genCategory, setGenCategory] = useState<ArticleCategory>('Science');
  const [useUnmasteredWords, setUseUnmasteredWords] = useState(true);
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);

  // TTS Read-Aloud State & Refs
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [activeSpeechParagraph, setActiveSpeechParagraph] = useState<number | null>(null);
  const [activeSpeechSentenceId, setActiveSpeechSentenceId] = useState<string | null>(null);
  const ttsSessionRef = useRef<number>(0);
  const readerBodyRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const readerSettingsRef = useRef<ReaderSettings>(readerSettings);

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
  }, [readerSettings]);

  const availableCategories = useMemo(
    () => (categories && categories.length > 0 ? categories : getAllWordCategories(words)),
    [categories, words]
  );

  // In-app Notification Toast State
  const [readerToast, setReaderToast] = useState<string | null>(null);
  const showReaderToast = (msg: string) => {
    setReaderToast(msg);
    setTimeout(() => setReaderToast((curr) => (curr === msg ? null : curr)), 3000);
  };

  // Fast Word Map for Instant Lookup & Matching (also resolves inflected forms / lemmas)
  const wordLookupMap = useMemo(() => {
    const map = new Map<string, Word>();
    words.forEach((w) => {
      const clean = w.term.trim().toLowerCase();
      if (clean && !map.has(clean)) {
        map.set(clean, w);
      }
    });
    return map;
  }, [words]);

  const findLibraryWord = (rawToken: string): Word | undefined => {
    const candidates = extractLemmaCandidates(rawToken);
    for (const c of candidates) {
      const found = wordLookupMap.get(c);
      if (found) return found;
    }
    return undefined;
  };

  // Active Article Object
  const currentArticle = useMemo(() => {
    if (!activeArticleId) return null;
    return articles.find((a) => a.id === activeArticleId) || null;
  }, [articles, activeArticleId]);

  // Save Settings Helper
  const updateSettings = (newSettings: Partial<ReaderSettings>) => {
    setReaderSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      readerSettingsRef.current = updated;
      storage.saveLocalReaderSettings(updated, userUid);
      storage.saveCloudReaderSettings(updated, userUid).catch(console.error);
      return updated;
    });
  };

  // Stop TTS on unmount or article change
  useEffect(() => {
    return () => {
      ttsSessionRef.current += 1;
      tts.stop();
      setIsPlayingTTS(false);
      setActiveSpeechParagraph(null);
      setActiveSpeechSentenceId(null);
    };
  }, [activeArticleId]);

  // Reset per-article drawers/modals & initialize AI Reading Companion when active article changes
  useEffect(() => {
    setInspectedWord(null);
    setAnalyzedSentence(null);
    setSelectedText(null);
    setSelectedSentenceContext('');
    setIsQuizOpen(false);
    setIsQuizSubmitted(false);
    setQuizAnswers({});
    setIsFlashcardOpen(false);
    setIsVocabDrawerOpen(false);

    if (currentArticle) {
      const validExistingVocab = Array.isArray(currentArticle.keyVocabulary)
        ? currentArticle.keyVocabulary.filter((k) => isValidChineseDefClient(k.def, k.term))
        : [];
      setExtractedKeywords(validExistingVocab);
      setArticleChatMessages([
        {
          id: 'init-welcome',
          role: 'model',
          content: `嗨！我是本篇《**${currentArticle.title}**》的 **AI 伴讀導師** 🤖📖\n\n這是一篇 **${currentArticle.level}** (${currentArticle.category}) 級別的文章，共約 ${currentArticle.wordCount} 字。\n\n我已經深入掌握全文內容與生詞架構，能為您提供：\n1. **全文核心主旨與論點提煉**\n2. **段落結構與寫作修辭脈絡剖析**\n3. **長難句文法結構拆解與白話翻譯**\n4. **高階實用寫作句型與亮點詞彙推薦**\n\n您可以點擊下方快捷問題，或在文章中反白任意句子向我提問！`,
          timestamp: Date.now()
        }
      ]);
    } else {
      setExtractedKeywords([]);
      setArticleChatMessages([]);
      setIsAIChatDrawerOpen(false);
    }
  }, [activeArticleId]);

  // Auto-scroll AI Reading Companion to newest message
  useEffect(() => {
    if (isAIChatDrawerOpen) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [articleChatMessages, isChatSending, isAIChatDrawerOpen]);

  // Handle Text Selection for Phrase / Idiom Lookup & AI Query (scoped to English article body)
  useEffect(() => {
    const updateSelectionFromDom = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setSelectedText(null);
        setSelectedSentenceContext('');
        return;
      }

      const range = selection.getRangeAt(0);
      const containerEl = readerBodyRef.current;
      if (!containerEl || !containerEl.contains(range.commonAncestorContainer)) {
        setSelectedText(null);
        setSelectedSentenceContext('');
        return;
      }

      const anchorEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      if (anchorEl?.closest('[data-bilingual-zh="true"]')) {
        setSelectedText(null);
        setSelectedSentenceContext('');
        return;
      }

      // Remove trailing/leading whitespace and newlines so double-click selection doesn't highlight trailing spaces
      const rawText = selection.toString().trim();
      if (rawText && rawText.length >= 1 && rawText.length <= 250 && !rawText.includes('\n')) {
        const rect = range.getBoundingClientRect();
        const sentenceEl = anchorEl?.closest('[data-sentence]');
        const surroundingSentence = sentenceEl?.getAttribute('data-sentence') || rawText;
        setSelectedText(rawText);
        setSelectedSentenceContext(surroundingSentence);
        setSelectionPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 12
        });
      } else {
        setSelectedText(null);
        setSelectedSentenceContext('');
      }
    };

    const handleScrollDismiss = () => {
      setSelectedText(null);
    };

    document.addEventListener('mouseup', updateSelectionFromDom);
    document.addEventListener('touchend', updateSelectionFromDom);
    window.addEventListener('scroll', handleScrollDismiss, true);
    return () => {
      document.removeEventListener('mouseup', updateSelectionFromDom);
      document.removeEventListener('touchend', updateSelectionFromDom);
      window.removeEventListener('scroll', handleScrollDismiss, true);
    };
  }, []);

  // Update Article in Local & Cloud Storage & State
  const handleUpdateArticle = (updatedArticle: Article) => {
    const updatedList = storage.saveArticle(updatedArticle, userUid);
    setArticles(updatedList);
    onArticlesChange?.(updatedList);
    storage.saveCloudArticle(updatedArticle, userUid).catch(console.error);
  };

  // Inspect Word Click with Instant Cache & Immediate AI/Dictionary Lookup
  const handleWordClick = async (rawWord: string, sentenceContext: string, forceRefresh = false) => {
    const cleanTerm = rawWord.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
    if (!cleanTerm || cleanTerm.length < 1) return;

    const lowerTerm = cleanTerm.toLowerCase();
    const existing = findLibraryWord(cleanTerm);
    const localWordCache = storage.getLocalWordAnalyses(userUid);
    const cachedAnalysis = !forceRefresh
      ? (cachedWordMap[lowerTerm] || localWordCache[lowerTerm])
      : null;

    setIsAddingCategoryInReader(false);
    setNewCategoryNameInReader('');
    setSelectedSaveCategory(existing?.category || '');

    // Do not interrupt active full-article or sentence TTS playback when tapping a word
    if (!isPlayingTTS) {
      tts.speak(cleanTerm, {
        rate: readerSettingsRef.current.speechRate || 1.0,
        voiceURI: readerSettingsRef.current.voiceURI
      });
    }

    // 1. If in user's library (including inflected lemma match), instant display
    if (existing) {
      const matchedCache =
        cachedWordMap[existing.term.toLowerCase()] ||
        localWordCache[existing.term.toLowerCase()] ||
        cachedAnalysis;
      setInspectedWord({
        term: existing.term,
        pos: existing.pos,
        def: existing.def,
        defEn: existing.defEn || matchedCache?.defEn || '',
        phonetic: matchedCache?.phonetic || '',
        example: existing.ex || matchedCache?.ex || '',
        exampleZh: matchedCache?.exZh || '',
        sentenceContext: sentenceContext.trim(),
        existingWord: existing,
        isLoading: false,
        hasAILookup: true,
        sourceLabel: '我的單字庫'
      });
      setCustomDefEdit(existing.def);
      setIsEditingDef(false);
      setCustomExEdit(existing.ex || '');
      setIsEditingEx(false);
      setShowOriginalContext(false);
      return;
    }

    // 2. If cached in local storage (with valid Chinese definition), instant display (0 AI quota!)
    if (cachedAnalysis && isValidChineseDefClient(cachedAnalysis.def, cleanTerm)) {
      setInspectedWord({
        term: cleanTerm,
        pos: cachedAnalysis.pos || 'n.',
        def: cachedAnalysis.def,
        defEn: cachedAnalysis.defEn || '',
        phonetic: cachedAnalysis.phonetic || '',
        example: cachedAnalysis.ex || '',
        exampleZh: cachedAnalysis.exZh || '',
        sentenceContext: sentenceContext.trim(),
        existingWord: undefined,
        isLoading: false,
        hasAILookup: true,
        sourceLabel: '本地快取（免耗額度）'
      });
      setCustomDefEdit(cachedAnalysis.def);
      setIsEditingDef(false);
      setCustomExEdit(cachedAnalysis.ex || '');
      setIsEditingEx(false);
      setShowOriginalContext(false);
      return;
    }

    // 2.5 Check current article pre-extracted keyVocabulary before spending AI quota
    const articleVocabHit = !forceRefresh
      ? currentArticle?.keyVocabulary?.find(
          (k) =>
            k.term.trim().toLowerCase() === lowerTerm &&
            isValidChineseDefClient(k.def, k.term)
        )
      : undefined;
    if (articleVocabHit) {
      setInspectedWord({
        term: articleVocabHit.term,
        pos: (articleVocabHit.pos as POS) || 'n.',
        def: articleVocabHit.def,
        defEn: articleVocabHit.defEn || '',
        phonetic: '',
        example: articleVocabHit.ex || sentenceContext.trim(),
        exampleZh: '',
        sentenceContext: sentenceContext.trim(),
        existingWord: undefined,
        isLoading: false,
        hasAILookup: true,
        sourceLabel: '本篇精選生詞'
      });
      setCustomDefEdit(articleVocabHit.def);
      setIsEditingDef(false);
      setCustomExEdit(articleVocabHit.ex || sentenceContext.trim());
      setIsEditingEx(false);
      setShowOriginalContext(false);
      return;
    }

    // 3. Brand-new word tapped by user: show loading and fetch immediately
    setInspectedWord({
      term: cleanTerm,
      pos: 'n.',
      def: '',
      defEn: '',
      phonetic: '',
      example: '',
      exampleZh: '',
      sentenceContext: sentenceContext.trim(),
      existingWord: undefined,
      isLoading: true,
      hasAILookup: true,
      needsAILookup: false
    });
    setCustomDefEdit('');
    setIsEditingDef(false);
    setCustomExEdit('');
    setIsEditingEx(false);
    setShowOriginalContext(false);

    try {
      const res = await fetch('/api/ai/article-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          word: cleanTerm,
          sentence: sentenceContext,
          forceRefresh,
          apiKey: effectiveApiKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        const validDef = isValidChineseDefClient(data.def, cleanTerm) ? data.def.trim() : '';
        const analysisData: WordAnalysisData = {
          term: data.term || cleanTerm,
          pos: (data.pos as POS) || 'n.',
          def: validDef,
          defEn: data.defEn || '',
          phonetic: data.phonetic || '',
          ex: data.ex || sentenceContext.trim() || '',
          exZh: data.exZh || '',
          fromCache: data.fromCache || false,
          cachedAt: Date.now()
        };

        // Cache in background only if Chinese definition is valid
        if (validDef) {
          storage.saveWordAnalysis(cleanTerm, analysisData, userUid);
          setCachedWordMap((prev) => ({ ...prev, [lowerTerm]: analysisData }));
        }

        setInspectedWord((prev) => {
          if (!prev || prev.term.toLowerCase() !== lowerTerm) return prev;
          return {
            ...prev,
            term: analysisData.term,
            pos: analysisData.pos,
            def: validDef,
            defEn: analysisData.defEn,
            phonetic: analysisData.phonetic,
            example: analysisData.ex,
            exampleZh: analysisData.exZh,
            isLoading: false,
            needsAILookup: !validDef,
            hasAILookup: true,
            sourceLabel: data.sourceLabel || (data.fromCache ? '快取詞庫' : 'AI 與權威詞典深度解析'),
            cambridgeBlocked: Boolean(data.cambridgeBlocked)
          };
        });
        setCustomDefEdit(validDef);
        setCustomExEdit(analysisData.ex || '');
      } else {
        setInspectedWord((prev) =>
          prev ? { ...prev, isLoading: false, needsAILookup: true } : null
        );
      }
    } catch (err) {
      console.error('AI Word lookup error:', err);
      setInspectedWord((prev) =>
        prev ? { ...prev, isLoading: false, needsAILookup: true } : null
      );
    }
  };

  // Re-query word with AI — always fires regardless of autoAILookup setting (manual intent)
  const handleAILookupForCurrentWord = async () => {
    if (!inspectedWord) return;
    const cleanTerm = inspectedWord.term;
    const lowerTerm = cleanTerm.toLowerCase();

    // Show loading state immediately
    setInspectedWord((prev) =>
      prev ? { ...prev, isLoading: true, needsAILookup: false } : null
    );

    try {
      const res = await fetch('/api/ai/article-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          word: cleanTerm,
          sentence: inspectedWord.sentenceContext,
          forceRefresh: true,
          apiKey: effectiveApiKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        const validDef = isValidChineseDefClient(data.def, cleanTerm) ? data.def.trim() : '';
        const analysisData: WordAnalysisData = {
          term: data.term || cleanTerm,
          pos: (data.pos as POS) || 'n.',
          def: validDef,
          defEn: data.defEn || '',
          phonetic: data.phonetic || '',
          ex: data.ex || inspectedWord.sentenceContext || '',
          exZh: data.exZh || '',
          fromCache: false,
          cachedAt: Date.now()
        };

        if (validDef) {
          storage.saveWordAnalysis(cleanTerm, analysisData, userUid);
          setCachedWordMap((prev) => ({ ...prev, [lowerTerm]: analysisData }));
        }

        setInspectedWord((prev) =>
          prev ? {
            ...prev,
            term: analysisData.term,
            pos: analysisData.pos,
            def: validDef,
            defEn: analysisData.defEn,
            phonetic: analysisData.phonetic,
            example: analysisData.ex,
            exampleZh: analysisData.exZh,
            isLoading: false,
            needsAILookup: !validDef,
            hasAILookup: true,
            sourceLabel: data.sourceLabel || 'AI 與權威詞典深度解析',
            cambridgeBlocked: Boolean(data.cambridgeBlocked)
          } : null
        );
        setCustomDefEdit(validDef);
        setCustomExEdit(analysisData.ex || '');
      } else {
        setInspectedWord((prev) => prev ? { ...prev, isLoading: false, needsAILookup: true } : null);
      }
    } catch (err) {
      console.error('AI Word lookup error:', err);
      setInspectedWord((prev) => prev ? { ...prev, isLoading: false, needsAILookup: true } : null);
    }
  };

  // Send message to AI Reading Companion
  const handleSendArticleChat = async (customPrompt?: string, contextOverride?: string, isRetry = false) => {
    if (!currentArticle || isChatSending) return;
    const promptToSend = (customPrompt || chatInputText).trim();
    const ctx = contextOverride !== undefined ? contextOverride : chatSelectedContext;
    if (!promptToSend && !ctx) return;

    const userMsgContent = promptToSend || (ctx ? `請幫我詳細解析這段文字在文章中的含義、語境與文法：「${ctx}」` : '請為我導讀這篇文章');

    let baseHistory = articleChatMessages;
    let newHistory: ArticleChatMessage[];
    if (isRetry) {
      // Remove trailing error notice so retry replaces it cleanly without duplicating user bubble
      const last = baseHistory[baseHistory.length - 1];
      if (last && last.role === 'model' && last.id.startsWith('err-')) {
        baseHistory = baseHistory.slice(0, -1);
      }
      newHistory = baseHistory;
    } else {
      const userMsg: ArticleChatMessage = {
        id: `usr-${Date.now()}`,
        role: 'user',
        content: userMsgContent,
        timestamp: Date.now(),
        highlightedSentence: ctx || undefined
      };
      newHistory = [...baseHistory, userMsg];
      setChatInputText('');
      setChatSelectedContext(null);
    }

    setArticleChatMessages(newHistory);
    setIsChatSending(true);

    try {
      const res = await fetch('/api/ai/article-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          article: {
            title: currentArticle.title,
            level: currentArticle.level,
            category: currentArticle.category,
            content: currentArticle.content,
            translationZh: currentArticle.translationZh
          },
          messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
          userPrompt: userMsgContent,
          selectedContext: ctx || undefined,
          apiKey: effectiveApiKey
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.reply) {
        const modelMsg: ArticleChatMessage = {
          id: `mod-${Date.now()}`,
          role: 'model',
          content: data.reply,
          timestamp: Date.now(),
          suggestedWords: data.suggestedWords || []
        };
        setArticleChatMessages([...newHistory, modelMsg]);
      } else {
        const errorMsg: ArticleChatMessage = {
          id: `err-${Date.now()}`,
          role: 'model',
          content: data?.error || data?.reply || 'AI 伴讀導師暫時繁忙，請稍候重試。',
          timestamp: Date.now()
        };
        setArticleChatMessages([...newHistory, errorMsg]);
      }
    } catch (e) {
      console.error('Article chat error:', e);
      const errorMsg: ArticleChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: '網路連線異常，請稍後重試。',
        timestamp: Date.now()
      };
      setArticleChatMessages([...newHistory, errorMsg]);
    } finally {
      setIsChatSending(false);
    }
  };

  // Quick Save Word to Library
  const handleSaveInspectedWord = () => {
    if (!inspectedWord || !currentArticle) return;

    const termToSave = inspectedWord.term.trim();
    const candidateDef = isEditingDef ? customDefEdit.trim() : (inspectedWord.def || '').trim();
    if (!isValidChineseDefClient(candidateDef, termToSave)) {
      setIsEditingDef(true);
      showReaderToast('⚠️ 尚未取得有效繁體中文釋義，請點選重新查詢或手動填寫後再收錄。');
      return;
    }

    const defToSave = candidateDef;
    const exToSave = isEditingEx && customExEdit.trim()
      ? customExEdit.trim()
      : (inspectedWord.example || inspectedWord.sentenceContext || `Context from article: ${currentArticle.title}`);
    const cleanLower = termToSave.toLowerCase();

    // Check if exact (term + pos + def) is already in words
    const existingEntries = words.filter(
      (w) => w.term.trim().toLowerCase() === cleanLower
    );
    const isExactDefAlreadyInLib = existingEntries.some(
      (w) =>
        (w.pos || '').trim().toLowerCase() === (inspectedWord.pos || '').trim().toLowerCase() &&
        w.def.trim().toLowerCase() === defToSave.trim().toLowerCase()
    );

    if (isExactDefAlreadyInLib) {
      // Just record to article saved terms if not recorded
      if (!currentArticle.savedWordTerms.some((t) => t.toLowerCase() === cleanLower)) {
        const updatedSaved = [...currentArticle.savedWordTerms, termToSave];
        handleUpdateArticle({
          ...currentArticle,
          savedWordTerms: updatedSaved
        });
      }
      setInspectedWord(null);
      return;
    }

    // Create new word with concise flashcard example sentence & chosen category
    const newWord: Partial<Word> = {
      term: termToSave,
      pos: inspectedWord.pos,
      def: defToSave,
      defEn: inspectedWord.defEn || '',
      ex: exToSave,
      category: selectedSaveCategory.trim() || undefined,
      level: 0,
      interval: 1,
      easeFactor: 2.5
    };

    onAddWords([newWord]);

    // Update article saved terms
    const updatedTerms = currentArticle.savedWordTerms.some((t) => t.toLowerCase() === cleanLower)
      ? currentArticle.savedWordTerms
      : [...currentArticle.savedWordTerms, termToSave];

    handleUpdateArticle({
      ...currentArticle,
      savedWordTerms: updatedTerms
    });

    // Confetti celebration
    try {
      confetti({
        particleCount: 25,
        spread: 40,
        origin: { y: 0.7 }
      });
    } catch {}

    showReaderToast(`✅ 已收錄「${termToSave}」至單字庫`);
    setInspectedWord(null);
  };

  // Remove a saved term badge from the current article's savedWordTerms
  const handleRemoveSavedWordTerm = (termToRemove: string) => {
    if (!currentArticle) return;
    const clean = termToRemove.trim().toLowerCase();
    handleUpdateArticle({
      ...currentArticle,
      savedWordTerms: currentArticle.savedWordTerms.filter((t) => t.trim().toLowerCase() !== clean)
    });
    showReaderToast(`已從本篇移除「${termToRemove}」標記`);
  };

  // Analyze Sentence Grammar & Sentence Structure (Per Sentence or Segment)
  // Automatically caches in background so subsequent queries answer instantly with 0 AI quota consumed
  const handleAnalyzeSentence = async (sentence: string, forceRefresh = false) => {
    const clean = sentence.trim();
    if (!clean) return;
    const cleanKey = clean.toLowerCase();

    // 1. Check local background cache & article saved analyses first (saves AI quota!)
    if (!forceRefresh) {
      const articleCached = currentArticle?.sentenceAnalyses?.[cleanKey];
      const localCached = cachedSentenceMap[cleanKey] || storage.getLocalSentenceAnalyses(userUid)[cleanKey];
      const cached = articleCached || localCached;

      if (
        cached &&
        cached.translation &&
        cached.grammarBreakdown &&
        !cached.translation.includes('暫時無法連線至 AI') &&
        !cached.translation.includes('解析暫時無法完成') &&
        !cached.grammarBreakdown.includes('分析服務暫時繁忙')
      ) {
        setAnalyzedSentence({
          ...cached,
          sentence: clean,
          fromCache: true,
          isLoading: false
        });
        return;
      }
    }

    setAnalyzedSentence({
      sentence: clean,
      translation: 'AI 語法導師正在深入解析句型結構與修飾成分...',
      grammarBreakdown: '正在拆解主幹、子句關係與文法核心...',
      vocabularyNotes: [],
      learningTip: '',
      isLoading: true,
      fromCache: false
    });

    try {
      const res = await fetch('/api/ai/analyze-sentence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          sentence: clean,
          forceRefresh,
          apiKey: effectiveApiKey
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && !data?.error && !data?.isOfflineFallback && data?.translation && data?.grammarBreakdown) {
        const analysisData: SentenceAnalysisData = {
          sentence: clean,
          translation: data.translation,
          grammarBreakdown: data.grammarBreakdown,
          vocabularyNotes: data.vocabularyNotes || [],
          learningTip: data.learningTip || '',
          isLoading: false,
          fromCache: data.fromCache || false,
          cachedAt: Date.now()
        };

        setAnalyzedSentence(analysisData);

        // Save in background local storage cache
        storage.saveSentenceAnalysis(clean, analysisData, userUid);
        setCachedSentenceMap((prev) => ({ ...prev, [cleanKey]: analysisData }));

        // Also persist inside current article record
        if (currentArticle) {
          const updatedArticle: Article = {
            ...currentArticle,
            sentenceAnalyses: {
              ...(currentArticle.sentenceAnalyses || {}),
              [cleanKey]: analysisData
            }
          };
          handleUpdateArticle(updatedArticle);
        }
      } else {
        const errMsg = data?.error || data?.translation || '句型解析暫時失敗，請點擊上方重試或檢查 API Key';
        setAnalyzedSentence((prev) =>
          prev
            ? {
                ...prev,
                translation: errMsg,
                grammarBreakdown: '系統未寫入失敗快取，您可點擊右上角重新解析。',
                isLoading: false
              }
            : null
        );
      }
    } catch (err) {
      console.error('Analyze sentence error:', err);
      setAnalyzedSentence((prev) =>
        prev
          ? {
              ...prev,
              translation: '網路連線異常，解析暫時無法完成，請稍後重試。',
              grammarBreakdown: '請確認網路或後端服務正常後點擊重新解析。',
              isLoading: false
            }
          : null
      );
    }
  };

  // TTS Read Single Specific Sentence
  const handleSpeakSingleSentence = (sentenceText: string, sentenceKey: string) => {
    if (activeSpeechSentenceId === sentenceKey && isPlayingTTS) {
      ttsSessionRef.current += 1;
      tts.stop();
      setIsPlayingTTS(false);
      setActiveSpeechSentenceId(null);
      return;
    }

    const sessionId = ++ttsSessionRef.current;
    tts.stop();
    setIsPlayingTTS(true);
    setActiveSpeechParagraph(null);
    setActiveSpeechSentenceId(sentenceKey);

    tts.speak(sentenceText, {
      rate: readerSettingsRef.current.speechRate || 1.0,
      voiceURI: readerSettingsRef.current.voiceURI,
      onEnd: () => {
        if (ttsSessionRef.current !== sessionId) return;
        setIsPlayingTTS(false);
        setActiveSpeechSentenceId(null);
      },
      onCancel: () => {
        if (ttsSessionRef.current !== sessionId) return;
        setIsPlayingTTS(false);
        setActiveSpeechSentenceId(null);
      },
      onError: () => {
        if (ttsSessionRef.current !== sessionId) return;
        setIsPlayingTTS(false);
        setActiveSpeechSentenceId(null);
      }
    });
  };

  // TTS Read Starting from a Specific Paragraph
  const handleStartSpeechFrom = (startIndex: number) => {
    if (!currentArticle) return;
    const paragraphs = splitIntoParagraphs(currentArticle.content);
    if (startIndex >= paragraphs.length || startIndex < 0) return;

    const sessionId = ++ttsSessionRef.current;
    tts.stop();
    setIsPlayingTTS(true);
    setActiveSpeechSentenceId(null);
    let currentIdx = startIndex;

    const playNext = () => {
      if (ttsSessionRef.current !== sessionId) return;
      if (currentIdx >= paragraphs.length) {
        setIsPlayingTTS(false);
        setActiveSpeechParagraph(null);
        return;
      }

      setActiveSpeechParagraph(currentIdx);
      const text = paragraphs[currentIdx];

      tts.speak(text, {
        rate: readerSettingsRef.current.speechRate || 1.0,
        voiceURI: readerSettingsRef.current.voiceURI,
        onEnd: () => {
          if (ttsSessionRef.current !== sessionId) return;
          currentIdx++;
          playNext();
        },
        onCancel: () => {
          if (ttsSessionRef.current !== sessionId) return;
          setIsPlayingTTS(false);
          setActiveSpeechParagraph(null);
        },
        onError: () => {
          if (ttsSessionRef.current !== sessionId) return;
          setIsPlayingTTS(false);
          setActiveSpeechParagraph(null);
        }
      });
    };

    playNext();
  };

  // TTS Toggle Play / Pause Full Article
  const handleTogglePlayTTS = () => {
    if (isPlayingTTS) {
      ttsSessionRef.current += 1;
      tts.stop();
      setIsPlayingTTS(false);
      return;
    }
    const targetIdx = activeSpeechParagraph !== null ? activeSpeechParagraph : 0;
    handleStartSpeechFrom(targetIdx);
  };

  // TTS Stop
  const handleStopTTS = () => {
    ttsSessionRef.current += 1;
    tts.stop();
    setIsPlayingTTS(false);
    setActiveSpeechParagraph(null);
    setActiveSpeechSentenceId(null);
  };

  // TTS Previous Paragraph
  const handlePrevSpeechParagraph = () => {
    const currentIdx = activeSpeechParagraph ?? 0;
    const nextIdx = Math.max(0, currentIdx - 1);
    handleStartSpeechFrom(nextIdx);
  };

  // TTS Next Paragraph
  const handleNextSpeechParagraph = () => {
    if (!currentArticle) return;
    const paragraphs = splitIntoParagraphs(currentArticle.content);
    const currentIdx = activeSpeechParagraph ?? 0;
    const nextIdx = Math.min(paragraphs.length - 1, currentIdx + 1);
    handleStartSpeechFrom(nextIdx);
  };

  // Extract Keywords from Article
  const handleExtractKeywords = async (forceRefresh = false) => {
    if (!currentArticle) return;
    setIsVocabDrawerOpen(true);

    const existingVocab = currentArticle.keyVocabulary;
    const hasValidVocab =
      !forceRefresh &&
      Array.isArray(existingVocab) &&
      existingVocab.length > 0 &&
      existingVocab.every((k) => isValidChineseDefClient(k.def, k.term));

    if (hasValidVocab) {
      setExtractedKeywords(existingVocab);
      return;
    }

    setIsExtractingVocab(true);
    try {
      const res = await fetch('/api/ai/extract-vocabulary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          text: currentArticle.content,
          apiKey: effectiveApiKey
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const list = (data.vocabulary || []).filter((k: ArticleKeyWord) =>
          Boolean(k?.term && (isValidChineseDefClient(k.def, k.term) || k.defEn))
        );
        setExtractedKeywords(list);
        handleUpdateArticle({
          ...currentArticle,
          keyVocabulary: list
        });
        showReaderToast(`✨ 成功提煉 ${list.length} 個核心學術單字！`);
      } else {
        showReaderToast(data?.error || '提煉關鍵單字失敗，請稍候重試。');
      }
    } catch (err) {
      console.error('Extract keywords error:', err);
      showReaderToast('網路或伺服器連線異常，請稍後重試。');
    } finally {
      setIsExtractingVocab(false);
    }
  };

  // On-Demand AI Translation
  const handleTranslateArticle = async () => {
    if (!currentArticle) return;
    setIsTranslatingArticle(true);
    try {
      const res = await fetch('/api/ai/translate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          content: currentArticle.content,
          apiKey: effectiveApiKey
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.translationZh) {
        handleUpdateArticle({
          ...currentArticle,
          translationZh: data.translationZh
        });
        updateSettings({ showBilingual: true });
        showReaderToast('🌐 雙語全文翻譯已生成並切換為對照模式！');
      } else {
        showReaderToast(data?.error || '翻譯文章失敗，請檢查 API Key 或稍後重試。');
      }
    } catch (e) {
      console.error('Translation error:', e);
      showReaderToast('翻譯服務連線異常，請稍後重試。');
    } finally {
      setIsTranslatingArticle(false);
    }
  };

  // On-Demand AI Reading Quiz Generation
  const handleGenerateQuiz = async () => {
    if (!currentArticle) return;
    setIsGeneratingQuiz(true);
    try {
      const res = await fetch('/api/ai/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          title: currentArticle.title,
          content: currentArticle.content,
          apiKey: effectiveApiKey
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.quiz) && data.quiz.length > 0) {
        handleUpdateArticle({
          ...currentArticle,
          quiz: data.quiz
        });
        setIsQuizOpen(true);
        setIsQuizSubmitted(false);
        setQuizAnswers({});
        showReaderToast('📝 閱讀理解測驗已生成！');
      } else {
        showReaderToast(data?.error || '生成測驗失敗，請稍後重試。');
      }
    } catch (e) {
      console.error('Generate quiz error:', e);
      showReaderToast('測驗生成連線異常，請稍後重試。');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Batch Add Keywords to Word Library
  const handleBatchAddKeywords = (keywordsToBatch: ArticleKeyWord[]) => {
    if (!currentArticle || keywordsToBatch.length === 0) return;

    const validItems = keywordsToBatch.filter(
      (k) => isValidChineseDefClient(k.def, k.term) || (k.defEn && k.defEn.trim().length > 0)
    );

    if (validItems.length === 0) {
      showReaderToast('⚠️ 所選生詞尚無有效繁中或英文釋義，請點擊「🔄 重新提煉」或從文章內點擊查詢。');
      return;
    }

    const newWords: Partial<Word>[] = validItems.map((k) => {
      const safeDef = isValidChineseDefClient(k.def, k.term) ? k.def.trim() : k.defEn!.trim();
      return {
        term: k.term,
        pos: k.pos || 'n.',
        def: safeDef,
        defEn: k.defEn || '',
        ex: k.ex || `From article: ${currentArticle.title}`,
        category: selectedSaveCategory.trim() || undefined,
        level: 0,
        interval: 1,
        easeFactor: 2.5
      };
    });

    onAddWords(newWords);

    const existingLower = new Set(currentArticle.savedWordTerms.map((t) => t.trim().toLowerCase()));
    const updatedTerms = [...currentArticle.savedWordTerms];
    for (const k of validItems) {
      const low = k.term.trim().toLowerCase();
      if (!existingLower.has(low)) {
        existingLower.add(low);
        updatedTerms.push(k.term);
      }
    }

    handleUpdateArticle({
      ...currentArticle,
      savedWordTerms: updatedTerms
    });

    try {
      confetti({ particleCount: 35, spread: 60 });
    } catch {}

    const skippedCount = keywordsToBatch.length - validItems.length;
    showReaderToast(
      skippedCount > 0
        ? `✅ 已收錄 ${validItems.length} 個單字（略過 ${skippedCount} 個缺釋義項目）`
        : `✅ 已成功收錄 ${validItems.length} 個生詞至單字庫！`
    );
  };

  // AI Generate Article
  const handleGenerateArticle = async () => {
    setIsGeneratingArticle(true);
    try {
      // Pick up to 5 unmastered words from user library if requested
      const targetWords = useUnmasteredWords
        ? words.filter((w) => w.level === 0 || w.level === 1).slice(0, 5).map((w) => w.term)
        : [];

      const res = await fetch('/api/ai/generate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(effectiveApiKey ? { 'x-gemini-api-key': effectiveApiKey } : {})
        },
        body: JSON.stringify({
          topic: genTopic.trim() || 'Modern Science and Curiosity',
          level: genLevel,
          category: genCategory,
          targetWords,
          apiKey: effectiveApiKey
        })
      });

      if (res.ok) {
        const newArt: Article = await res.json();
        const updatedList = storage.saveArticle(newArt, userUid);
        setArticles(updatedList);
        onArticlesChange?.(updatedList);
        storage.saveCloudArticle(newArt, userUid).catch(console.error);
        setActiveArticleId(newArt.id);
        setIsGenerateModalOpen(false);
        setGenTopic('');
        showReaderToast(`📖 成功生成文章《${newArt.title}》！`);
      } else {
        showReaderToast('生成文章失敗，請稍候重試。');
      }
    } catch (err) {
      console.error('Generate article failed:', err);
      showReaderToast('網路或伺服器連線異常，請稍後重試。');
    } finally {
      setIsGeneratingArticle(false);
    }
  };

  // AI Smart URL / Raw Text Article Import
  const handleAiImportArticle = async () => {
    const cleanUrl = importUrl.trim();
    const cleanRaw = importContent.trim();
    if ((!cleanUrl && !cleanRaw) || isImportingByAI) {
      if (!cleanUrl && !cleanRaw) {
        showReaderToast('請先輸入文章網址，或在下方貼上原始英文文本');
      }
      return;
    }

    const currentSettings = storage.getLocalSettings(userUid);
    const apiKey = appSettings?.geminiApiKey || currentSettings?.geminiApiKey;

    setIsImportingByAI(true);
    try {
      const res = await fetch('/api/ai/import-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
        },
        body: JSON.stringify({
          url: cleanUrl || undefined,
          text: cleanRaw || undefined,
          level: importLevel,
          category: importCategory,
          apiKey
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.article) {
        throw new Error(data?.error || 'AI 智慧擷取文章失敗，請確認網址可公開存取或直接貼上文本');
      }

      const art = data.article;
      if (art.title) setImportTitle(art.title);
      if (art.content) setImportContent(art.content);
      if (art.translationZh) setImportTranslation(art.translationZh);
      if (art.level && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(art.level)) {
        setImportLevel(art.level as CEFRLevel);
      }
      if (art.category && ['Tech', 'Science', 'Story', 'News', 'Business', 'Daily', 'Custom'].includes(art.category)) {
        setImportCategory(art.category as ArticleCategory);
      }
      setImportedArticleMeta({
        subtitle: art.subtitle,
        author: art.author,
        source: art.source || cleanUrl || undefined,
        summary: art.summary,
        keyVocabulary: Array.isArray(art.keyVocabulary) ? art.keyVocabulary : undefined,
        quiz: Array.isArray(art.quiz) ? art.quiz : undefined,
        grammarPoints: Array.isArray(art.grammarPoints) ? art.grammarPoints : undefined
      });
      showReaderToast('✨ AI 已完成文章擷取與雙語翻譯排版！請檢視後點擊確認建立。');
    } catch (err: any) {
      showReaderToast(err?.message || 'AI 擷取文章時發生錯誤，請稍後重試');
    } finally {
      setIsImportingByAI(false);
    }
  };

  // Custom Import Article
  const handleSaveImportArticle = () => {
    if (!importTitle.trim() || !importContent.trim()) {
      showReaderToast('請填寫文章標題與內容');
      return;
    }

    const wordsCount = importContent.split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.round(wordsCount / 120));

    const prebuiltAnalyses: Record<string, SentenceAnalysisData> = {};
    if (Array.isArray(importedArticleMeta?.grammarPoints)) {
      importedArticleMeta.grammarPoints.forEach((gp) => {
        if (gp?.sentence && (gp.structure || gp.explanation)) {
          const cleanSent = gp.sentence.trim();
          const key = cleanSent.toLowerCase();
          prebuiltAnalyses[key] = {
            sentence: cleanSent,
            translation: gp.structure || gp.grammarType || '重點句型結構解析',
            grammarBreakdown: gp.explanation,
            vocabularyNotes: [],
            learningTip: gp.grammarType ? `句型核心分類：${gp.grammarType}` : '',
            isLoading: false,
            fromCache: true,
            cachedAt: Date.now()
          };
        }
      });
    }

    const newArt: Article = {
      id: `art-custom-${Date.now()}`,
      title: importTitle.trim(),
      subtitle: importedArticleMeta?.subtitle || undefined,
      author: importedArticleMeta?.author || undefined,
      source: importedArticleMeta?.source || (importUrl.trim() || undefined),
      summary: importedArticleMeta?.summary || undefined,
      level: importLevel,
      category: importCategory,
      content: importContent.trim(),
      translationZh: importTranslation.trim() || undefined,
      wordCount: wordsCount,
      readTimeMinutes: readTime,
      keyVocabulary: importedArticleMeta?.keyVocabulary,
      quiz: importedArticleMeta?.quiz,
      grammarPoints: importedArticleMeta?.grammarPoints,
      sentenceAnalyses: Object.keys(prebuiltAnalyses).length > 0 ? prebuiltAnalyses : undefined,
      savedWordTerms: [],
      isCustom: true
    };

    const updated = storage.saveArticle(newArt, userUid);
    setArticles(updated);
    onArticlesChange?.(updated);
    storage.saveCloudArticle(newArt, userUid).catch(console.error);
    setActiveArticleId(newArt.id);
    setIsImportModalOpen(false);
    setImportTitle('');
    setImportContent('');
    setImportTranslation('');
    setImportUrl('');
    setImportedArticleMeta(null);
  };

  // Filtered Articles Shelf
  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      const matchSearch =
        searchQuery === '' ||
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.summary && a.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
        a.content.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCategory =
        categoryFilter === 'All' ||
        (categoryFilter === 'Custom' ? a.isCustom : a.category === categoryFilter);

      const matchLevel = levelFilter === 'All' || a.level === levelFilter;

      return matchSearch && matchCategory && matchLevel;
    });
  }, [articles, searchQuery, categoryFilter, levelFilter]);

  // Split paragraph text into individual sentences (avoiding common abbreviations & decimals)
  const splitParagraphIntoSentences = (text: string): { id: number; text: string }[] => {
    if (!text || !text.trim()) return [];
    const DOT_TOKEN = '\u0000';
    let safeText = text
      .replace(/(\d)\.(\d)/g, `$1${DOT_TOKEN}$2`)
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|Inc|Ltd|Fig|No|Vol|Dept|Est|Approx)\./gi, `$1${DOT_TOKEN}`)
      .replace(/\b(e\.g|i\.e|U\.S|U\.K|Ph\.D|a\.m|p\.m)\./gi, (m) => m.replace(/\./g, DOT_TOKEN));

    const sentenceRegex = /[^.!?]+[.!?]+["'”’)]?|[^.!?\n]+$/g;
    const matches = safeText.match(sentenceRegex);
    if (!matches || matches.length === 0) {
      return [{ id: 0, text: text.trim() }];
    }
    return matches
      .map((s, idx) => ({ id: idx, text: s.replaceAll(DOT_TOKEN, '.').trim() }))
      .filter((item) => item.text.length > 0);
  };

  // Tokenize paragraph into interactive word spans and sentences with inline audio & grammar breakdown menu
  const renderParagraph = (paragraphText: string, pIndex: number) => {
    const sentences = splitParagraphIntoSentences(paragraphText);

    // Feature toggles for clean reading interface
    const isCleanMode = !!readerSettings.cleanReadingMode;
    const showSentenceAudio = !isCleanMode && (readerSettings.showSentenceAudio ?? true);
    const showSentenceGrammar = !isCleanMode && (readerSettings.showSentenceGrammar ?? true);
    const showSavedWordsHighlight = !isCleanMode && (readerSettings.highlightSavedWords ?? true);
    const showMicroToolbar = showSentenceAudio || showSentenceGrammar;

    return (
      <div
        key={`p-${pIndex}`}
        className={`leading-relaxed tracking-normal transition-all duration-300 ${
          activeSpeechParagraph === pIndex
            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 p-3.5 rounded-2xl ring-2 ring-indigo-400/50 -mx-3.5 shadow-sm'
            : ''
        }`}
      >
        {sentences.map((sent, sIndex) => {
          const sentenceKey = `${pIndex}-${sIndex}`;
          const isThisSentencePlaying = activeSpeechSentenceId === sentenceKey && isPlayingTTS;
          const tokens = sent.text.split(/(\s+|[.,!?;:"()—–“”/]+)/);
          const cleanSentKey = sent.text.trim().toLowerCase();
          const isSentenceAnalyzed = Boolean(
            currentArticle?.sentenceAnalyses?.[cleanSentKey] ||
            cachedSentenceMap[cleanSentKey]
          );

          return (
            <span
              key={`s-${sentenceKey}`}
              data-sentence={sent.text}
              className={`inline rounded-xl transition-all duration-200 py-0.5 px-1 mr-1.5 ${
                isThisSentencePlaying
                  ? 'bg-indigo-100/90 dark:bg-indigo-900/60 ring-2 ring-indigo-500 text-indigo-950 dark:text-indigo-100 font-medium'
                  : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
              }`}
            >
              {/* Sentence Word Tokens */}
              {tokens.map((token, tIndex) => {
                const isWord = /^[a-zA-Z0-9'’-]+$/.test(token);
                if (!isWord) {
                  return <span key={`t-${sentenceKey}-${tIndex}`}>{token}</span>;
                }

                const existingWord = findLibraryWord(token);
                const lemmaCandidates = extractLemmaCandidates(token);
                const isSavedInArticle = currentArticle?.savedWordTerms.some((t) =>
                  lemmaCandidates.includes(t.trim().toLowerCase())
                );

                // Determine visual styling
                let wordStyle =
                  'rounded px-0.5 transition-colors duration-150 inline select-text cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/40 active:bg-indigo-100 dark:active:bg-indigo-900/60 ';

                if (isSavedInArticle && showSavedWordsHighlight) {
                  wordStyle +=
                    'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-medium underline decoration-amber-400 decoration-2 underline-offset-2 hover:bg-amber-200/70 dark:hover:bg-amber-900/60';
                } else if (existingWord && showSavedWordsHighlight) {
                  if (existingWord.level >= 3) {
                    wordStyle +=
                      'text-emerald-700 dark:text-emerald-300 underline decoration-emerald-400/60 decoration-1 underline-offset-2';
                  } else if (existingWord.level === 2) {
                    wordStyle +=
                      'text-indigo-700 dark:text-indigo-300 underline decoration-indigo-400/60 decoration-1 underline-offset-2';
                  } else {
                    wordStyle +=
                      'text-teal-700 dark:text-teal-300 underline decoration-teal-400/60 decoration-1 underline-offset-2';
                  }
                }

                return (
                  <span
                    key={`w-${sentenceKey}-${tIndex}`}
                    onClick={(e) => {
                      const sel = window.getSelection();
                      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
                        return;
                      }
                      e.stopPropagation();
                      handleWordClick(token, sent.text);
                    }}
                    className={wordStyle}
                  >
                    {token}
                  </span>
                );
              })}

              {/* Per-Sentence Action Micro Toolbar (🔊 朗讀本句 & ✨ 拆解句型文法 - 支援獨立開關與純淨模式) */}
              {showMicroToolbar && (
                <span className="inline-flex items-center align-middle gap-0.5 ml-1 mr-1 px-1 py-0.5 rounded-lg bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60 shadow-xs select-none opacity-80 hover:opacity-100 transition-opacity">
                  {showSentenceAudio && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSpeakSingleSentence(sent.text, sentenceKey);
                      }}
                      className={`p-1 rounded-md transition ${
                        isThisSentencePlaying
                          ? 'bg-amber-500 text-white animate-pulse'
                          : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700'
                      }`}
                      title={isThisSentencePlaying ? '暫停朗讀本句' : '朗讀此句 (TTS)'}
                    >
                      {isThisSentencePlaying ? (
                        <Pause className="w-2.5 h-2.5" />
                      ) : (
                        <Volume2 className="w-2.5 h-2.5" />
                      )}
                    </button>
                  )}
                  {showSentenceGrammar && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAnalyzeSentence(sent.text);
                      }}
                      className={`p-1 rounded-md transition ${
                        isSentenceAnalyzed
                          ? 'text-purple-700 dark:text-purple-300 bg-purple-100/90 dark:bg-purple-900/60 hover:bg-purple-200 dark:hover:bg-purple-800 font-bold ring-1 ring-purple-300/80 dark:ring-purple-700/80 shadow-xs'
                          : 'text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-950/60 hover:text-purple-700'
                      }`}
                      title={
                        isSentenceAnalyzed
                          ? '⚡ 已存儲文法拆解（點擊秒速查看，免耗 AI 額度）'
                          : '✨ AI 拆解此句句型結構與文法'
                      }
                    >
                      <Wand2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  // ================= RENDER =================

  // 1. DETAIL / READING VIEW
  if (currentArticle) {
    const paragraphs = splitIntoParagraphs(currentArticle.content);
    const translationParagraphs = splitIntoParagraphs(currentArticle.translationZh || '');

    // Font styles based on settings
    const fontSizeClass =
      readerSettings.fontSize === 'sm'
        ? 'text-sm'
        : readerSettings.fontSize === 'base'
        ? 'text-base'
        : readerSettings.fontSize === 'lg'
        ? 'text-lg'
        : readerSettings.fontSize === 'xl'
        ? 'text-xl'
        : 'text-2xl';

    const fontFamilyClass =
      readerSettings.fontFamily === 'serif'
        ? 'font-serif'
        : readerSettings.fontFamily === 'mono'
        ? 'font-mono'
        : 'font-sans';

    const lineSpacingClass =
      readerSettings.lineSpacing === 'loose'
        ? 'space-y-8 leading-loose'
        : readerSettings.lineSpacing === 'relaxed'
        ? 'space-y-6 leading-relaxed'
        : 'space-y-4 leading-normal';

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-0 pb-24">
        {/* Floating Selection Tooltip (反白搜尋) */}
        {selectedText && selectionPosition && (
          <div
            style={{
              position: 'fixed',
              left: `${Math.max(120, Math.min(window.innerWidth - 120, selectionPosition.x))}px`,
              top: `${Math.max(60, selectionPosition.y)}px`,
              transform: 'translate(-50%, -100%)'
            }}
            className="z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-semibold animate-enter select-none border border-slate-700/50 dark:border-slate-300/50"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 dark:text-indigo-600 shrink-0" />
            <span className="max-w-[150px] sm:max-w-[220px] truncate font-medium">
              查詢「{selectedText}」
            </span>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                handleWordClick(selectedText, selectedSentenceContext || selectedText);
                setSelectedText(null);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-full text-xs font-bold transition shadow-sm hover:scale-105 active:scale-95 flex items-center gap-1 shrink-0"
            >
              <Search className="w-3 h-3" />
              <span>查詞收錄</span>
            </button>
            {selectedText.trim().split(/\s+/).length >= 2 && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  handleAnalyzeSentence(selectedText);
                  setSelectedText(null);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-full text-xs font-bold transition shadow-sm hover:scale-105 active:scale-95 flex items-center gap-1 shrink-0"
                title="分析此段選取句子的文法結構"
              >
                <Wand2 className="w-3 h-3" />
                <span>分析文法</span>
              </button>
            )}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                const targetText = selectedText;
                setChatSelectedContext(targetText);
                setIsAIChatDrawerOpen(true);
                handleSendArticleChat(undefined, targetText);
                setSelectedText(null);
              }}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-2.5 py-1 rounded-full text-xs font-bold transition shadow-sm hover:scale-105 active:scale-95 flex items-center gap-1 shrink-0"
              title="向 AI 伴讀導師提問此段內容"
            >
              <Bot className="w-3 h-3" />
              <span>伴讀提問</span>
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => setSelectedText(null)}
              className="text-slate-400 hover:text-white dark:hover:text-slate-900 px-1 py-0.5 text-xs font-bold"
              title="關閉"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Control Bar (Collapsible with Full Width Coverage) */}
        {isTopBarCollapsed ? (
          /* 1. COLLAPSED SLIM BAR */
          <div className="w-full py-2.5 mb-6 sm:mb-8 border-b border-slate-200/80 dark:border-slate-800/80 -mx-4 px-4 sm:-mx-6 sm:px-6 bg-slate-50/60 dark:bg-slate-900/60 transition-all duration-200">
            <div className="flex items-center justify-between gap-2.5 relative z-10">
              <button
                onClick={() => {
                  handleStopTTS();
                  setActiveArticleId(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>返回書架</span>
              </button>

              <div className="flex items-center gap-2">
                {/* Mini Player if TTS is playing */}
                {isPlayingTTS && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500 text-white text-xs font-bold shadow-sm animate-pulse">
                    <button onClick={handleTogglePlayTTS} title="暫停/播放">
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                    <span>
                      {activeSpeechParagraph !== null
                        ? `第 ${activeSpeechParagraph + 1}/${paragraphs.length} 段`
                        : '朗讀中'}
                    </span>
                    <button onClick={handleStopTTS} className="ml-0.5 p-0.5" title="停止">
                      <Square className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                )}

                {/* Clean Mode Indicator */}
                {readerSettings.cleanReadingMode && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold border border-emerald-300/50 dark:border-emerald-800/50">
                    <EyeOff className="w-3 h-3" />
                    <span>純淨模式</span>
                  </span>
                )}

                {/* AI Companion Quick Trigger */}
                <button
                  onClick={() => setIsAIChatDrawerOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-extrabold shadow-sm transition"
                  title="開啟 AI 閱讀伴讀導師（深入問答、主旨解析與寫作句型）"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>AI 伴讀</span>
                </button>

                {/* Expand Toolbar Button */}
                <button
                  onClick={() => setIsTopBarCollapsed(false)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-md shadow-indigo-500/20 transition group"
                  title="展開上方功能工具列"
                >
                  <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                  <span>展開功能欄</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 2. EXPANDED FULL TOOLBAR */
          <div className="w-full py-2.5 mb-6 sm:mb-8 border-b border-slate-200/80 dark:border-slate-800/80 -mx-4 px-4 sm:-mx-6 sm:px-6 bg-slate-50/60 dark:bg-slate-900/60 transition-all duration-200">
            <div className="flex flex-wrap items-center justify-between gap-2.5 relative z-10">
              <button
                onClick={() => {
                  handleStopTTS();
                  setActiveArticleId(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>返回書架</span>
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Audio Read Aloud Suite */}
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
                  <button
                    onClick={handlePrevSpeechParagraph}
                    disabled={activeSpeechParagraph === null || activeSpeechParagraph === 0}
                    className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition"
                    title="上一段"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={handleTogglePlayTTS}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition shadow-sm ${
                      isPlayingTTS
                        ? 'bg-amber-500 text-white shadow-amber-500/20 animate-pulse'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                    }`}
                    title={isPlayingTTS ? '暫停朗讀' : '語音朗讀'}
                  >
                    {isPlayingTTS ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">
                      {isPlayingTTS
                        ? activeSpeechParagraph !== null
                          ? `朗讀中 (${activeSpeechParagraph + 1}/${paragraphs.length})`
                          : '朗讀中'
                        : '語音朗讀'}
                    </span>
                  </button>

                  {isPlayingTTS && (
                    <button
                      onClick={handleStopTTS}
                      className="p-1.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                      title="停止朗讀"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}

                  <button
                    onClick={handleNextSpeechParagraph}
                    disabled={activeSpeechParagraph === null || activeSpeechParagraph >= paragraphs.length - 1}
                    className="p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition"
                    title="下一段"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>

                  {/* Speed switch */}
                  <button
                    onClick={() => {
                      const currentR = readerSettings.speechRate || 1.0;
                      const nextRate =
                        currentR === 0.75 ? 1.0 : currentR === 1.0 ? 1.25 : currentR === 1.25 ? 1.5 : currentR === 1.5 ? 2.0 : 0.75;
                      updateSettings({ speechRate: nextRate });
                    }}
                    className="px-2 py-1 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-mono font-bold transition"
                    title="點擊切換語速 (0.75x ~ 2.0x)"
                  >
                    {readerSettings.speechRate || 1.0}x
                  </button>
                </div>

                {/* Clean Reading Mode Quick Toggle */}
                <button
                  onClick={() => updateSettings({ cleanReadingMode: !readerSettings.cleanReadingMode })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                    readerSettings.cleanReadingMode
                      ? 'bg-emerald-600 text-white shadow-emerald-500/20 ring-2 ring-emerald-400/40'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title={
                    readerSettings.cleanReadingMode
                      ? '點擊退出純淨閱讀模式（恢復輔助按鈕與生詞標記）'
                      : '一鍵開啟純淨閱讀模式（隱藏朗讀、文法拆解圖標與生詞高亮）'
                  }
                >
                  {readerSettings.cleanReadingMode ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>純淨模式：開</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span className="hidden sm:inline">純淨閱讀</span>
                    </>
                  )}
                </button>

                {/* Bilingual Toggle */}
                <button
                  onClick={() => {
                    if (!currentArticle.translationZh) {
                      handleTranslateArticle();
                    } else {
                      updateSettings({ showBilingual: !readerSettings.showBilingual });
                    }
                  }}
                  disabled={isTranslatingArticle}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                    readerSettings.showBilingual && currentArticle.translationZh
                      ? 'bg-indigo-600 text-white'
                      : isTranslatingArticle
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 animate-pulse'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="切換中英雙語對照閱讀"
                >
                  {isTranslatingArticle ? (
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Languages className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {isTranslatingArticle
                      ? 'AI 翻譯中...'
                      : readerSettings.showBilingual && currentArticle.translationZh
                      ? '雙語開'
                      : '雙語對照'}
                  </span>
                </button>

                {/* AI Reading Companion & Tutor Button */}
                <button
                  onClick={() => setIsAIChatDrawerOpen(true)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                    isAIChatDrawerOpen
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white ring-2 ring-indigo-400/50 shadow-indigo-500/20'
                      : 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-slate-800'
                  }`}
                  title="開啟 AI 閱讀伴讀導師（深入問答、主旨解析與寫作句型）"
                >
                  <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>AI 伴讀導師</span>
                </button>

                {/* Article Vocab / Saved Words */}
                <button
                  onClick={() => handleExtractKeywords(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition shadow-sm relative"
                  title="檢視本篇生詞庫與重點單字"
                >
                  <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                  <span>生詞庫</span>
                  {currentArticle.savedWordTerms.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-black">
                      {currentArticle.savedWordTerms.length}
                    </span>
                  )}
                </button>

                {/* Quiz Button (Runs quiz or AI generates one) */}
                <button
                  onClick={() => {
                    if (currentArticle.quiz && currentArticle.quiz.length > 0) {
                      setIsQuizOpen(true);
                      setIsQuizSubmitted(false);
                      setQuizAnswers({});
                    } else {
                      handleGenerateQuiz();
                    }
                  }}
                  disabled={isGeneratingQuiz}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 hover:bg-emerald-100 text-xs font-bold transition shadow-sm"
                  title="閱讀理解隨堂測驗"
                >
                  {isGeneratingQuiz ? (
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <HelpCircle className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {isGeneratingQuiz
                      ? '生成題庫中...'
                      : currentArticle.quiz && currentArticle.quiz.length > 0
                      ? '隨堂測驗'
                      : 'AI 生成測驗'}
                  </span>
                </button>

                {/* Settings Trigger */}
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={`p-2 rounded-xl border transition shadow-sm ${
                    isSettingsOpen
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-indigo-300'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="閱讀器字體、語音與顯示設定"
                >
                  <Settings2 className="w-4 h-4" />
                </button>

                {/* Collapse Toolbar Button */}
                <button
                  onClick={() => {
                    setIsTopBarCollapsed(true);
                    setIsSettingsOpen(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition shadow-sm"
                  title="收起上方功能欄（讓閱讀介面最大化）"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">收起功能欄</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Display & Voice Settings Floating Dropdown */}
        {isSettingsOpen && (
          <div className="mb-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-enter">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-500" />
                <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100">閱讀與朗讀個人化設定</h4>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                收起 ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Font size */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1.5">字體大小</label>
                <div className="flex gap-1">
                  {(['sm', 'base', 'lg', 'xl'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateSettings({ fontSize: s })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        readerSettings.fontSize === s
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font family */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1.5">閱讀字體</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => updateSettings({ fontFamily: 'sans' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                      readerSettings.fontFamily === 'sans'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    無襯線
                  </button>
                  <button
                    onClick={() => updateSettings({ fontFamily: 'serif' })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-serif transition ${
                      readerSettings.fontFamily === 'serif'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    經典襯線
                  </button>
                </div>
              </div>

              {/* Speech Rate */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1.5">朗讀語速</label>
                <div className="flex gap-1">
                  {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => updateSettings({ speechRate: rate })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                        (readerSettings.speechRate || 1.0) === rate
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Highlight toggle */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1.5">生詞庫標記</label>
                <button
                  onClick={() => updateSettings({ highlightSavedWords: !readerSettings.highlightSavedWords })}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold transition ${
                    readerSettings.highlightSavedWords
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                  }`}
                >
                  {readerSettings.highlightSavedWords ? '已開啟生詞底線標記' : '已關閉生詞標記'}
                </button>
              </div>
            </div>

            {/* Granular Display & Auxiliary Feature Toggles */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                    閱讀輔助功能顯示開關 (自訂顯示或隱藏)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      updateSettings({
                        showSentenceAudio: true,
                        showSentenceGrammar: true,
                        highlightSavedWords: true,
                        showParagraphControls: true,
                        cleanReadingMode: false
                      })
                    }
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    全部開啟
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    onClick={() =>
                      updateSettings({
                        showSentenceAudio: false,
                        showSentenceGrammar: false,
                        highlightSavedWords: false,
                        showParagraphControls: false,
                        cleanReadingMode: true
                      })
                    }
                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-bold"
                  >
                    全部隱藏 (純淨)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* 1. Sentence Audio Toggle */}
                <button
                  onClick={() =>
                    updateSettings({
                      showSentenceAudio: !(readerSettings.showSentenceAudio ?? true)
                    })
                  }
                  className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                    (readerSettings.showSentenceAudio ?? true) && !readerSettings.cleanReadingMode
                      ? 'bg-indigo-50/70 border-indigo-200/80 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                    <div>
                      <div className="text-xs font-bold">逐句朗讀微圖標</div>
                      <div className="text-[10px] text-slate-400">句尾 🔊 發音按鈕</div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                      (readerSettings.showSentenceAudio ?? true) && !readerSettings.cleanReadingMode
                        ? 'bg-indigo-200/80 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}
                  >
                    {(readerSettings.showSentenceAudio ?? true) && !readerSettings.cleanReadingMode
                      ? '顯示'
                      : '已隱藏'}
                  </span>
                </button>

                {/* 2. Sentence Grammar Toggle */}
                <button
                  onClick={() =>
                    updateSettings({
                      showSentenceGrammar: !(readerSettings.showSentenceGrammar ?? true)
                    })
                  }
                  className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                    (readerSettings.showSentenceGrammar ?? true) && !readerSettings.cleanReadingMode
                      ? 'bg-purple-50/70 border-purple-200/80 text-purple-900 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-3.5 h-3.5 text-purple-500" />
                    <div>
                      <div className="text-xs font-bold">逐句文法拆解</div>
                      <div className="text-[10px] text-slate-400">句尾 ✨ 文法按鈕</div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                      (readerSettings.showSentenceGrammar ?? true) && !readerSettings.cleanReadingMode
                        ? 'bg-purple-200/80 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}
                  >
                    {(readerSettings.showSentenceGrammar ?? true) && !readerSettings.cleanReadingMode
                      ? '顯示'
                      : '已隱藏'}
                  </span>
                </button>

                {/* 3. Word Highlight Toggle */}
                <button
                  onClick={() =>
                    updateSettings({
                      highlightSavedWords: !(readerSettings.highlightSavedWords ?? true)
                    })
                  }
                  className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                    (readerSettings.highlightSavedWords ?? true) && !readerSettings.cleanReadingMode
                      ? 'bg-amber-50/70 border-amber-200/80 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BookmarkCheck className="w-3.5 h-3.5 text-amber-500" />
                    <div>
                      <div className="text-xs font-bold">生詞庫標記高亮</div>
                      <div className="text-[10px] text-slate-400">底線與色彩醒目標記</div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                      (readerSettings.highlightSavedWords ?? true) && !readerSettings.cleanReadingMode
                        ? 'bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}
                  >
                    {(readerSettings.highlightSavedWords ?? true) && !readerSettings.cleanReadingMode
                      ? '顯示'
                      : '已隱藏'}
                  </span>
                </button>

                {/* 4. Paragraph Controls Toggle */}
                <button
                  onClick={() =>
                    updateSettings({
                      showParagraphControls: !(readerSettings.showParagraphControls ?? true)
                    })
                  }
                  className={`p-2.5 rounded-2xl border text-left transition flex items-center justify-between ${
                    (readerSettings.showParagraphControls ?? true) && !readerSettings.cleanReadingMode
                      ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-emerald-500" />
                    <div>
                      <div className="text-xs font-bold">段落底部朗讀列</div>
                      <div className="text-[10px] text-slate-400">段落「從此段朗讀」</div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                      (readerSettings.showParagraphControls ?? true) && !readerSettings.cleanReadingMode
                        ? 'bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}
                  >
                    {(readerSettings.showParagraphControls ?? true) && !readerSettings.cleanReadingMode
                      ? '顯示'
                      : '已隱藏'}
                  </span>
                </button>
              </div>
            </div>

            {/* Voice Selection & Tip toggle row */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Voice Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                    <Volume2 className="w-3 h-3 text-indigo-500" />
                    <span>朗讀語音 (TTS 聲音選擇)</span>
                  </label>
                  <button
                    onClick={() => {
                      tts.speak("Hello! This is a test of your chosen reading voice.", {
                        voiceURI: readerSettings.voiceURI,
                        rate: readerSettings.speechRate || 1.0
                      });
                    }}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Play className="w-2.5 h-2.5" />
                    <span>試聽聲音</span>
                  </button>
                </div>
                <div className="relative">
                  <select
                    value={readerSettings.voiceURI || ''}
                    onChange={(e) => updateSettings({ voiceURI: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-8 cursor-pointer"
                  >
                    <option value="">預設語音 (系統智能優選美式/英式自然語音)</option>
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Show/Hide Tip Toggle */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1.5">介面提示引導</label>
                <button
                  onClick={() => updateSettings({ hideLookupTip: !readerSettings.hideLookupTip })}
                  className={`w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    !readerSettings.hideLookupTip
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 border border-transparent'
                  }`}
                >
                  <Sparkle className="w-3.5 h-3.5" />
                  <span>{!readerSettings.hideLookupTip ? '頂部查詞操作提示條：顯示中' : '頂部查詞操作提示條：已隱藏'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Article Header Card */}
        <div className="mb-8 pt-2 sm:pt-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
              {currentArticle.level}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {currentArticle.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
              <Clock className="w-3 h-3" />
              <span>約 {currentArticle.readTimeMinutes} 分鐘 ({currentArticle.wordCount} 字)</span>
            </span>
            {currentArticle.savedWordTerms.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                <BookmarkCheck className="w-3 h-3" />
                <span>已收錄 {currentArticle.savedWordTerms.length} 個生詞</span>
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-2 leading-tight">
            {currentArticle.title}
          </h1>

          {currentArticle.subtitle && (
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-medium mb-3">
              {currentArticle.subtitle}
            </p>
          )}

          {currentArticle.author && (
            <div className="text-xs text-slate-400">
              文 / {currentArticle.author} · 來源：{currentArticle.source || 'VocabMin 精選'}
            </div>
          )}

          {currentArticle.summary && (
            <div className="mt-4 p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">💡 文章核心摘要：</span>
              {currentArticle.summary}
            </div>
          )}
        </div>

        {/* Tip Box for Interactivity (Dismissible & saved in settings) */}
        {!readerSettings.hideLookupTip && (
          <div className="mb-6 p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-[11px] sm:text-xs text-indigo-800 dark:text-indigo-300 flex items-center justify-between gap-3 animate-enter">
            <div className="flex items-center gap-2">
              <Sparkle className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>
                💡 <strong>提示：</strong>手機與平板支援<strong>點擊單字直接查詞</strong>；電腦版支援<strong>反白搜尋</strong>與自由選取複製文字，兼具極致便利與純淨閱讀！
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  handleUpdateArticle({
                    ...currentArticle,
                    isRead: !currentArticle.isRead,
                    lastReadTimestamp: Date.now()
                  });
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                  currentArticle.isRead
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{currentArticle.isRead ? '已讀完' : '標記已讀'}</span>
              </button>
              <button
                onClick={() => updateSettings({ hideLookupTip: true })}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-indigo-100 dark:hover:bg-slate-800 transition text-[11px] font-bold"
                title="不再顯示此提示"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Missing translation prompt when bilingual mode is toggled on */}
        {readerSettings.showBilingual && !currentArticle.translationZh && (
          <div className="mb-6 p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-enter">
            <div>
              <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>本文尚未建立繁體中文對照譯文</span>
              </h4>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                點擊讓 AI 自動將文章譯為逐段優美繁體中文，支援雙語對照閱讀。
              </p>
            </div>
            <button
              onClick={handleTranslateArticle}
              disabled={isTranslatingArticle}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shrink-0 transition"
            >
              {isTranslatingArticle ? (
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Languages className="w-3.5 h-3.5" />
              )}
              <span>{isTranslatingArticle ? 'AI 正在翻譯全文中...' : '生成繁體中文對照'}</span>
            </button>
          </div>
        )}

        {/* Article Body Content */}
        <div
          ref={readerBodyRef}
          className={`${fontSizeClass} ${fontFamilyClass} ${lineSpacingClass} text-slate-800 dark:text-slate-100 select-text`}
        >
          {paragraphs.map((para, idx) => {
            const zhPara = translationParagraphs[idx];
            const isLastPara = idx === paragraphs.length - 1;
            const remainingZh = isLastPara && translationParagraphs.length > paragraphs.length
              ? translationParagraphs.slice(paragraphs.length)
              : [];
            const isCurrentlyPlayingThisPara = isPlayingTTS && activeSpeechParagraph === idx;

            return (
              <div
                key={`section-${idx}`}
                className={`group relative transition-all duration-200 ${
                  isCurrentlyPlayingThisPara
                    ? 'p-4 rounded-3xl bg-indigo-50/90 dark:bg-indigo-950/50 ring-2 ring-indigo-500/60 -mx-4 shadow-sm'
                    : ''
                }`}
              >
                {/* Paragraph Content */}
                {renderParagraph(para, idx)}

                {/* Paragraph Controls (Play from here) */}
                {!readerSettings.cleanReadingMode && (readerSettings.showParagraphControls ?? true) && (
                  <div className="flex items-center gap-2 mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        if (isCurrentlyPlayingThisPara) {
                          handleTogglePlayTTS();
                        } else {
                          handleStartSpeechFrom(idx);
                        }
                      }}
                      className={`text-[11px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-xl transition shadow-sm ${
                        isCurrentlyPlayingThisPara
                          ? 'bg-amber-500 text-white animate-pulse'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700'
                      }`}
                      title={isCurrentlyPlayingThisPara ? '暫停朗讀此段' : '從此段開始往後朗讀全文'}
                    >
                      {isCurrentlyPlayingThisPara ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3 text-indigo-500" />
                      )}
                      <span>{isCurrentlyPlayingThisPara ? '朗讀中 (點擊暫停)' : '從此段朗讀 ▶'}</span>
                    </button>
                  </div>
                )}

                {/* Bilingual Chinese Translation if enabled */}
                {readerSettings.showBilingual && (zhPara || remainingZh.length > 0) && (
                  <div
                    data-bilingual-zh="true"
                    className="mt-2.5 p-3 rounded-xl bg-slate-100/60 dark:bg-slate-900/60 border-l-2 border-indigo-400 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-sans space-y-2"
                  >
                    {zhPara && <p>{zhPara}</p>}
                    {remainingZh.map((extraZh, eIdx) => (
                      <p key={`extra-zh-${eIdx}`}>{extraZh}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleExtractKeywords(false)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition"
            >
              <Bookmark className="w-4 h-4" />
              <span>查看本篇生詞庫 ({currentArticle.savedWordTerms.length})</span>
            </button>

            {currentArticle.quiz && currentArticle.quiz.length > 0 && (
              <button
                onClick={() => {
                  setIsQuizOpen(true);
                  setIsQuizSubmitted(false);
                  setQuizAnswers({});
                }}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition"
              >
                <Award className="w-4 h-4" />
                <span>開始閱讀隨堂測驗</span>
              </button>
            )}
          </div>

          <button
            onClick={() => {
              handleStopTTS();
              setActiveArticleId(null);
            }}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-semibold"
          >
            ← 返回文章列表
          </button>
        </div>

        {/* Word Inspector Modal / Floating Drawer */}
        {inspectedWord && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-enter relative max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      {inspectedWord.term}
                    </h3>
                    <button
                      onClick={() =>
                        tts.speak(inspectedWord.term, {
                          rate: readerSettings.speechRate || 1.0,
                          voiceURI: readerSettings.voiceURI
                        })
                      }
                      className="p-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition"
                      title="發音朗讀"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  {inspectedWord.phonetic && (
                    <span className="text-xs font-mono text-slate-400">{inspectedWord.phonetic}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                    {inspectedWord.pos}
                  </span>
                  <button
                    onClick={() => setInspectedWord(null)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Definition Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-400">繁體中文釋義</span>
                  <button
                    onClick={() => setIsEditingDef(!isEditingDef)}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                  >
                    {isEditingDef ? '取消自訂' : '自訂釋義'}
                  </button>
                </div>

                {isEditingDef ? (
                  <input
                    type="text"
                    value={customDefEdit}
                    onChange={(e) => setCustomDefEdit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="輸入自訂繁體中文解釋..."
                  />
                ) : (
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {inspectedWord.isLoading ? (
                      <div className="py-2 space-y-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">
                          <Sparkles className="w-3.5 h-3.5 animate-spin" />
                          AI 智能結合語境解析中（精準釋義、英英解釋與短例句）...
                        </span>
                        <div className="h-4 bg-indigo-100/60 dark:bg-indigo-950/40 rounded-lg animate-pulse w-3/4"></div>
                      </div>
                    ) : (inspectedWord as any).needsAILookup ? (
                      /* Manual AI lookup button — no auto query, save quota */
                      <div className="py-1 space-y-2">
                        <p className="text-sm text-slate-400 dark:text-slate-500 italic">尚未查詢此單字的 AI 解析</p>
                        <button
                          onClick={() => handleAILookupForCurrentWord()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow transition active:scale-95"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          點擊使用 AI 查詢（精準釋義＋例句）
                        </button>
                      </div>
                    ) : (
                      <div>
                        {isValidChineseDefClient(inspectedWord.def, inspectedWord.term) ? (
                          <p className="text-base text-slate-800 dark:text-slate-100">{inspectedWord.def}</p>
                        ) : (
                          <div className="space-y-1.5 py-1">
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                              ⚠️ 尚未獲取精準中文釋義（可點「自訂釋義」手動填寫或重新查詢）
                            </p>
                            <button
                              onClick={() => handleAILookupForCurrentWord()}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-xs transition active:scale-95"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>立即查詢權威繁體中文釋義</span>
                            </button>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              inspectedWord.existingWord || cachedWordMap[inspectedWord.term.toLowerCase()]
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80'
                                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-800/80'
                            }`}
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            {inspectedWord.sourceLabel ||
                              (cachedWordMap[inspectedWord.term.toLowerCase()]
                                ? '⚡ 已存儲（免耗額度）'
                                : 'AI 與權威詞典深度解析')}
                          </span>
                          {inspectedWord.cambridgeBlocked && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                              （劍橋官網連線受限，已自動使用備援解析）
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {inspectedWord.defEn && !inspectedWord.isLoading ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 leading-relaxed">
                    <span className="font-semibold text-slate-600 dark:text-slate-300 not-italic mr-1.5">En:</span>
                    {inspectedWord.defEn}
                  </p>
                ) : !inspectedWord.isLoading && !inspectedWord.needsAILookup && (
                  <div className="mt-2 flex items-center justify-between bg-slate-50 dark:bg-slate-800/30 p-2 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
                    <span className="text-[11px] text-slate-400 italic">尚未收錄英英釋義</span>
                    <button
                      onClick={() => handleAILookupForCurrentWord()}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      補全英英釋義
                    </button>
                  </div>
                )}
              </div>

              {/* Concise Flashcard Example Sentence (Specially made for quick memorization and review) */}
              {(inspectedWord.example || isEditingEx || inspectedWord.isLoading) && (
                <div className="mb-4 p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                        🌟 精選複習例句 (易記短例句)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {inspectedWord.example && (
                        <button
                          onClick={() =>
                            tts.speak(isEditingEx && customExEdit ? customExEdit : inspectedWord.example || '', {
                              rate: readerSettings.speechRate || 1.0,
                              voiceURI: readerSettings.voiceURI
                            })
                          }
                          className="p-1 rounded-md text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition"
                          title="朗讀例句"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setIsEditingEx(!isEditingEx)}
                        className="text-[10px] text-amber-700 dark:text-amber-400 font-bold hover:underline"
                      >
                        {isEditingEx ? '完成' : '編輯'}
                      </button>
                    </div>
                  </div>

                  {inspectedWord.isLoading ? (
                    <div className="h-4 bg-amber-200/50 dark:bg-amber-900/40 rounded-lg animate-pulse w-5/6 my-1"></div>
                  ) : isEditingEx ? (
                    <input
                      type="text"
                      value={customExEdit}
                      onChange={(e) => setCustomExEdit(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="輸入自訂短例句..."
                    />
                  ) : (
                    <div>
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed italic">
                        "{inspectedWord.example || (inspectedWord.sentenceContext ? inspectedWord.sentenceContext : `Learning ${inspectedWord.term} in context improves language mastery.`)}"
                      </p>
                      {inspectedWord.exampleZh && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-sans">
                          {inspectedWord.exampleZh}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Re-query with AI button & AI companion quick link */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  onClick={() => {
                    const wordTerm = inspectedWord.term;
                    setChatSelectedContext(wordTerm);
                    setIsAIChatDrawerOpen(true);
                    handleSendArticleChat(`請針對文章《${currentArticle.title}》深度講解「${wordTerm}」在文中的語意、詞性搭配與寫作活用法。`);
                    setInspectedWord(null);
                  }}
                  className="text-[11px] text-purple-600 dark:text-purple-400 font-bold hover:underline flex items-center gap-1"
                >
                  <Bot className="w-3 h-3" />
                  <span>問 AI 伴讀此詞用法</span>
                </button>

                {!inspectedWord.existingWord && !inspectedWord.isLoading && !(inspectedWord as any).needsAILookup && (
                  <button
                    onClick={handleAILookupForCurrentWord}
                    className="text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重新以 AI 查詢</span>
                  </button>
                )}
              </div>

              {/* Collapsible Article Context Sentence */}
              {inspectedWord.sentenceContext && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowOriginalContext(!showOriginalContext)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 mb-1"
                  >
                    <span>{showOriginalContext ? '▼ 收起文章原出處長句' : '▶ 查看文章原出處長句'}</span>
                  </button>
                  {showOriginalContext && (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 animate-enter">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                        "{inspectedWord.sentenceContext}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Status and Action Buttons */}
              <div className="space-y-2">
                {inspectedWord.existingWord ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        此單字已在您的單字庫中 (熟練度 Level {inspectedWord.existingWord.level})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Category Selection before Saving */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          單字分類（選填）
                        </span>
                        {!isAddingCategoryInReader && (
                          <button
                            type="button"
                            onClick={() => setIsAddingCategoryInReader(true)}
                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            + 新增分類
                          </button>
                        )}
                      </div>
                      {isAddingCategoryInReader ? (
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={newCategoryNameInReader}
                            onChange={(e) => setNewCategoryNameInReader(e.target.value)}
                            placeholder="輸入新分類名稱..."
                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cleanCat = newCategoryNameInReader.trim();
                              if (cleanCat) {
                                onAddCategory?.(cleanCat);
                                setSelectedSaveCategory(cleanCat);
                              }
                              setNewCategoryNameInReader('');
                              setIsAddingCategoryInReader(false);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold"
                          >
                            確定
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCategoryNameInReader('');
                              setIsAddingCategoryInReader(false);
                            }}
                            className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <select
                          value={selectedSaveCategory}
                          onChange={(e) => {
                            if (e.target.value === '__ADD_NEW__') {
                              setIsAddingCategoryInReader(true);
                            } else {
                              setSelectedSaveCategory(e.target.value);
                            }
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">未分類（預設）</option>
                          {availableCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                          <option value="__ADD_NEW__">+ 新增自訂分類...</option>
                        </select>
                      )}
                    </div>

                    <button
                      onClick={handleSaveInspectedWord}
                      disabled={
                        inspectedWord.isLoading ||
                        !isValidChineseDefClient(
                          isEditingDef ? customDefEdit : inspectedWord.def,
                          inspectedWord.term
                        )
                      }
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        {inspectedWord.isLoading
                          ? '正在查詢釋義中...'
                          : isValidChineseDefClient(
                              isEditingDef ? customDefEdit : inspectedWord.def,
                              inspectedWord.term
                            )
                          ? '一鍵收錄至單字庫 (收錄易記短例句)'
                          : '請先查詢或填寫中文釋義後收錄'}
                      </span>
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      onOpenCambridge(inspectedWord.term);
                      setInspectedWord(null);
                    }}
                    className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                    <span>劍橋字典深度解析</span>
                  </button>
                  <button
                    onClick={() => setInspectedWord(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold"
                  >
                    關閉
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Sentence Analysis Drawer */}
        {analyzedSentence && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-enter max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <Wand2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>AI 句型結構與文法深度拆解</span>
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-slate-400">專為中高階學習者設計的語法解析</p>
                      {analyzedSentence.isLoading ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200/80 dark:border-purple-800/80 animate-pulse">
                          <RotateCcw className="w-2.5 h-2.5 animate-spin" />
                          AI 解析中
                        </span>
                      ) : analyzedSentence.fromCache ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">
                          ⚡ 已存儲（免耗額度）
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/80">
                          <Check className="w-2.5 h-2.5" />
                          已存入背景快取
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!analyzedSentence.isLoading && (
                    <button
                      type="button"
                      onClick={() => handleAnalyzeSentence(analyzedSentence.sentence, true)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition flex items-center gap-1 text-[11px] font-medium"
                      title="略過快取，重新連線讓 AI 再次分析此句"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">重新分析</span>
                    </button>
                  )}
                  <button
                    onClick={() => setAnalyzedSentence(null)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Original Sentence */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-slate-400 block">原句：</span>
                  <button
                    type="button"
                    onClick={() => handleSpeakSingleSentence(analyzedSentence.sentence, 'sentence-modal')}
                    className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>朗讀本句</span>
                  </button>
                </div>
                <p className="text-sm font-serif font-medium text-slate-800 dark:text-slate-100 leading-relaxed">
                  "{analyzedSentence.sentence}"
                </p>
              </div>

              {/* Content or Loading state */}
              {analyzedSentence.isLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 animate-spin">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 animate-pulse text-center">
                    AI 語法導師正在深入解析句型結構與修飾成分...
                  </p>
                  <p className="text-[11px] text-slate-400 text-center">
                    分析完成後會自動存入背景快取，下次同一句可直接秒速查看！
                  </p>
                </div>
              ) : (
                <>
                  {/* Translation */}
                  <div className="mb-4">
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1">
                      繁體中文精準意譯：
                    </span>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                      {analyzedSentence.translation}
                    </p>
                  </div>

                  {/* Grammar Breakdown */}
                  <div className="mb-4">
                    <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 block mb-1">
                      句型文法結構剖析：
                    </span>
                    <div className="p-3.5 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {analyzedSentence.grammarBreakdown}
                    </div>
                  </div>

                  {/* Vocabulary Notes */}
                  {analyzedSentence.vocabularyNotes && analyzedSentence.vocabularyNotes.length > 0 && (
                    <div className="mb-4">
                      <span className="text-[11px] font-bold text-slate-400 block mb-1">句中亮點單字與片語：</span>
                      <div className="grid grid-cols-2 gap-2">
                        {analyzedSentence.vocabularyNotes.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleWordClick(item.term, analyzedSentence.sentence)}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                          >
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 block">
                              {item.term}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{item.meaning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Learning Tip */}
                  {analyzedSentence.learningTip && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-200 mb-4">
                      <span className="font-bold mr-1">💡 實戰活用訣竅：</span>
                      {analyzedSentence.learningTip}
                    </div>
                  )}

                  {/* Cache info note */}
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between mb-4">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <span>已自動於背景快取存檔，後續查詢均不耗額度</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAnalyzeSentence(analyzedSentence.sentence, true)}
                      className="text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 font-semibold underline flex items-center gap-1 ml-2 shrink-0"
                      title="強制重新向 AI 發送請求"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>重新詢問 AI</span>
                    </button>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAnalyzedSentence(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  關閉解析
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Reading Companion & Tutor Drawer (AI 閱讀伴讀導師) */}
        {isAIChatDrawerOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg h-full shadow-2xl p-5 sm:p-6 flex flex-col border-l border-slate-200 dark:border-slate-800 animate-slideLeft">
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-black text-slate-900 dark:text-white text-base">
                        AI 閱讀伴讀導師
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                        {currentArticle.level} 級導讀
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate max-w-[240px] sm:max-w-[300px]">
                      針對《{currentArticle.title}》全文深度解讀
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setArticleChatMessages([
                        {
                          id: `init-${Date.now()}`,
                          role: 'model',
                          content: `嗨！我是本篇《**${currentArticle.title}**》的 **AI 伴讀導師** 🤖📖\n\n您可以點擊下方快捷問題，或在文章中反白任意句子向我提問！`,
                          timestamp: Date.now()
                        }
                      ]);
                      setChatSelectedContext(null);
                    }}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="重置對話"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsAIChatDrawerOpen(false)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="關閉伴讀"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Chat Messages Body */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {/* Starter Prompts */}
                {articleChatMessages.length <= 1 && (
                  <div className="space-y-2 mb-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      ✨ 點擊快速探索本文：
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { label: '📖 全文核心主旨解析', prompt: '請幫我總結這篇文章的主旨與核心論點，用清晰的繁體中文條列說明。' },
                        { label: '🔍 文章架構與論證邏輯', prompt: '請分析這篇文章的段落結構與論述邏輯，各段落如何層層遞進？' },
                        { label: '💡 提煉 3 個實用寫作句型', prompt: '請從這篇文章中挑選 3 個最實用、高階的英文寫作句型，拆解其文法並各附上 1 個應用造句。' },
                        { label: '❓ 深度理解思考題', prompt: '請針對這篇文章的深層含義出 1 道有啟發性的思考問題，並附上參考思路。' }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendArticleChat(item.prompt)}
                          disabled={isChatSending}
                          className="p-2.5 text-left rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/50 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/50 text-xs font-semibold text-indigo-900 dark:text-indigo-200 transition flex items-center justify-between group disabled:opacity-50"
                        >
                          <span>{item.label}</span>
                          <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform text-xs">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages List */}
                {articleChatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {/* User context badge if asked about selected text */}
                    {msg.highlightedSentence && msg.role === 'user' && (
                      <div className="mb-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-xl border border-indigo-200/60 dark:border-indigo-800/50 max-w-[85%] truncate">
                        📌 引用文字: "{msg.highlightedSentence}"
                      </div>
                    )}

                    <div
                      className={`max-w-[92%] sm:max-w-[88%] p-3.5 sm:p-4 rounded-3xl text-xs sm:text-sm leading-relaxed shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none'
                          : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200/50 dark:border-slate-700/50'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                      ) : (
                        <MarkdownRenderer content={msg.content} isUser={false} />
                      )}

                      {/* Suggested Words Card inside AI response */}
                      {msg.suggestedWords && msg.suggestedWords.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/80 space-y-2">
                          <span className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 block">
                            💡 推薦可收錄的生詞或片語：
                          </span>
                          <div className="space-y-1.5">
                            {msg.suggestedWords.map((sw, swIdx) => {
                              const isExactInLib = words.some(
                                (w) =>
                                  w.term.toLowerCase() === (sw.term || '').toLowerCase() &&
                                  w.def.toLowerCase() === (sw.def || '').toLowerCase()
                              );
                              const hasOtherMeanings = words.some(
                                (w) => w.term.toLowerCase() === (sw.term || '').toLowerCase()
                              );
                              return (
                                <div
                                  key={swIdx}
                                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2"
                                >
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                                        {sw.term}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        {sw.pos}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                      {sw.def}
                                    </p>
                                  </div>

                                  <button
                                    onClick={() => {
                                      if (isExactInLib) return;
                                      onAddWords([
                                        {
                                          term: sw.term,
                                          pos: sw.pos,
                                          def: sw.def,
                                          defEn: sw.defEn || '',
                                          ex: sw.ex || `From article: ${currentArticle.title}`,
                                          level: 0,
                                          interval: 1,
                                          easeFactor: 2.5
                                        }
                                      ]);
                                      if (!currentArticle.savedWordTerms.includes(sw.term!)) {
                                        handleUpdateArticle({
                                          ...currentArticle,
                                          savedWordTerms: [...currentArticle.savedWordTerms, sw.term!]
                                        });
                                      }
                                      try {
                                        confetti({ particleCount: 20, spread: 35 });
                                      } catch {}
                                    }}
                                    disabled={isExactInLib}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition shrink-0 ${
                                      isExactInLib
                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                        : hasOtherMeanings
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                                    }`}
                                  >
                                    {isExactInLib ? '已在單字庫' : hasOtherMeanings ? '+ 追加新釋義' : '+ 收錄'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Message Actions */}
                    {msg.role === 'model' && (
                      <div className="flex items-center gap-2 mt-1 px-1">
                        {msg.id.startsWith('err-') || msg.content.includes('重試') ? (
                          <button
                            onClick={() => {
                              const lastUserMsg = [...articleChatMessages].reverse().find((m) => m.role === 'user');
                              if (lastUserMsg) {
                                handleSendArticleChat(lastUserMsg.content, lastUserMsg.highlightedSentence, true);
                              }
                            }}
                            className="text-[10px] text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 font-semibold bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-lg border border-rose-200 dark:border-rose-800 transition active:scale-95"
                            title="重新發送上一條問題"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>點擊重試 🔄</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                tts.speak(msg.content, {
                                  lang: 'zh-TW',
                                  rate: readerSettings.speechRate || 1.0
                                })
                              }
                              className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-0.5"
                              title="語音朗讀"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>朗讀</span>
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                showReaderToast('📋 已複製伴讀回覆內容');
                              }}
                              className="text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-0.5"
                              title="複製內容"
                            >
                              <Copy className="w-3 h-3" />
                              <span>複製</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Sending Loader */}
                {isChatSending && (
                  <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 text-xs text-indigo-600 dark:text-indigo-400 animate-pulse">
                    <Sparkles className="w-4 h-4 animate-spin shrink-0" />
                    <span>AI 伴讀導師正在研讀文章語境與為您整理分析...</span>
                  </div>
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Bottom Context Pill & Input Form */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                {chatSelectedContext && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 text-xs text-indigo-800 dark:text-indigo-200">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-[11px] shrink-0">📌 引用選取文字：</span>
                      <span className="truncate italic font-serif">"{chatSelectedContext}"</span>
                    </div>
                    <button
                      onClick={() => setChatSelectedContext(null)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-2"
                      title="清除引用"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendArticleChat();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInputText}
                    onChange={(e) => setChatInputText(e.target.value)}
                    placeholder={
                      chatSelectedContext
                        ? '輸入對此段選取文字的提問...'
                        : '向 AI 伴讀提問文章內容、論點或難句...'
                    }
                    disabled={isChatSending}
                    className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-transparent focus:border-indigo-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={isChatSending || (!chatInputText.trim() && !chatSelectedContext)}
                    className="p-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md shadow-indigo-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    title="送出提問"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Vocabulary Drawer */}
        {isVocabDrawerOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md h-full shadow-2xl p-6 flex flex-col border-l border-slate-200 dark:border-slate-800 animate-slideLeft">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-amber-500" />
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-base">
                      本篇文章重點與已收錄生詞
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      已收錄 {currentArticle.savedWordTerms.length} 個生詞 · 支援一鍵批次擴充
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsVocabDrawerOpen(false)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* 1. Saved Words Section */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    ⭐️ 本篇已收錄生詞 ({currentArticle.savedWordTerms.length})
                  </h4>

                  {currentArticle.savedWordTerms.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50 text-center text-xs text-slate-400">
                      尚未從本篇文章收錄生詞。點擊文章中任何單字即可立即收錄！
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setIsFlashcardOpen(true);
                          setFlashcardIndex(0);
                          setIsFlashcardFlipped(false);
                        }}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 transition mb-2"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>🃏 翻牌抽考本篇生詞 ({currentArticle.savedWordTerms.length})</span>
                      </button>

                      {currentArticle.savedWordTerms.map((term) => {
                        const low = term.toLowerCase();
                        const wordObj = wordLookupMap.get(low);
                        const cachedObj = cachedWordMap[low];
                        const kvObj =
                          extractedKeywords.find((k) => k.term.toLowerCase() === low) ||
                          currentArticle.keyVocabulary?.find((k) => k.term.toLowerCase() === low);
                        const displayPos = wordObj?.pos || cachedObj?.pos || kvObj?.pos;
                        const displayDef =
                          wordObj?.def ||
                          (isValidChineseDefClient(cachedObj?.def, term) ? cachedObj?.def : '') ||
                          (isValidChineseDefClient(kvObj?.def, term) ? kvObj?.def : '') ||
                          cachedObj?.defEn ||
                          kvObj?.defEn ||
                          '點擊文章單字可重新查詢';
                        return (
                          <div
                            key={term}
                            className="p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/40 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-sm text-slate-900 dark:text-white truncate">
                                  {term}
                                </span>
                                {displayPos && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 shrink-0">
                                    {displayPos}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                                {displayDef}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => tts.speak(term, { rate: readerSettings.speechRate || 1.0, voiceURI: readerSettings.voiceURI })}
                                className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:scale-105 transition"
                                title="發音朗讀"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveSavedWordTerm(term)}
                                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition"
                                title="從本篇生詞標記移除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Key Vocabulary / AI Extracted Keywords */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      ✨ 本文推薦核心關鍵詞 (CEFR)
                    </h4>
                    <div className="flex items-center gap-2.5">
                      {extractedKeywords.length > 0 && (
                        <>
                          <button
                            onClick={() => handleExtractKeywords(true)}
                            disabled={isExtractingVocab}
                            className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 flex items-center gap-1 disabled:opacity-50"
                            title="重新以 AI 提煉本篇關鍵詞"
                          >
                            <RotateCcw className={`w-3 h-3 ${isExtractingVocab ? 'animate-spin' : ''}`} />
                            <span>重新提煉</span>
                          </button>
                          <button
                            onClick={() => handleBatchAddKeywords(extractedKeywords)}
                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>一鍵全部收錄</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isExtractingVocab ? (
                    <div className="p-6 text-center text-xs text-indigo-500 font-semibold animate-pulse">
                      <Sparkles className="w-5 h-5 animate-spin mx-auto mb-2" />
                      AI 正為您深度掃描並提煉文章高頻生詞...
                    </div>
                  ) : extractedKeywords.length === 0 ? (
                    <button
                      onClick={() => handleExtractKeywords(false)}
                      className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-600 transition flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <span>點擊一鍵提煉全篇高價值生詞</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {extractedKeywords.map((kw, kIdx) => {
                        const isAlreadySaved = words.some(
                          (w) =>
                            w.term.toLowerCase() === kw.term.toLowerCase() &&
                            w.def.toLowerCase() === (kw.def || '').toLowerCase()
                        );

                        return (
                          <div
                            key={kIdx}
                            className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                                  {kw.term}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {kw.pos}
                                </span>
                                {kw.level && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                                    {kw.level}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                {isValidChineseDefClient(kw.def, kw.term) ? (
                                  kw.def
                                ) : (
                                  <span className="text-amber-500 dark:text-amber-400 font-medium text-[11px]">
                                    ⚠️ 暫缺繁中釋義
                                  </span>
                                )}
                              </p>
                              {kw.defEn && (
                                <p className="text-[11px] text-slate-400 italic">{kw.defEn}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => tts.speak(kw.term, { rate: 1.0 })}
                                className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:scale-105"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                              {isAlreadySaved ? (
                                <span className="p-2 text-emerald-500" title="已收錄">
                                  <Check className="w-4 h-4" />
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleBatchAddKeywords([kw])}
                                  className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition"
                                  title="收錄此單字"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setIsVocabDrawerOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs"
                >
                  關閉生詞庫
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quiz Modal */}
        {isQuizOpen && currentArticle.quiz && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-enter max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                      閱讀理解與單字隨堂測驗
                    </h3>
                    <p className="text-[10px] text-slate-400">共 {currentArticle.quiz.length} 題測驗</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleGenerateQuiz}
                    disabled={isGeneratingQuiz}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold flex items-center gap-1 transition disabled:opacity-50"
                    title="由 AI 重新針對本文出一份新題目"
                  >
                    <RotateCcw className={`w-3 h-3 ${isGeneratingQuiz ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingQuiz ? '出題中...' : 'AI 重新出題'}</span>
                  </button>
                  <button
                    onClick={() => setIsQuizOpen(false)}
                    className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="space-y-6 mb-6">
                {currentArticle.quiz.map((q, qIdx) => {
                  const userAnswer = quizAnswers[qIdx];
                  const isAnswered = userAnswer !== undefined;
                  const isCorrect = isAnswered && userAnswer === q.correctAnswerIndex;

                  return (
                    <div
                      key={qIdx}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50"
                    >
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                        {qIdx + 1}. {q.question}
                      </h4>

                      <div className="space-y-2">
                        {q.options.map((opt, optIdx) => {
                          let optStyle =
                            'p-3 rounded-xl border text-xs font-semibold text-left transition w-full flex items-center justify-between ';

                          if (isQuizSubmitted) {
                            if (optIdx === q.correctAnswerIndex) {
                              optStyle +=
                                'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-800 dark:text-emerald-200';
                            } else if (userAnswer === optIdx) {
                              optStyle +=
                                'bg-red-50 dark:bg-red-950/50 border-red-500 text-red-800 dark:text-red-200';
                            } else {
                              optStyle +=
                                'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500';
                            }
                          } else {
                            if (userAnswer === optIdx) {
                              optStyle +=
                                'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300';
                            } else {
                              optStyle +=
                                'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700';
                            }
                          }

                          return (
                            <button
                              key={optIdx}
                              disabled={isQuizSubmitted}
                              onClick={() =>
                                setQuizAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))
                              }
                              className={optStyle}
                            >
                              <span>{opt}</span>
                              {isQuizSubmitted && optIdx === q.correctAnswerIndex && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              )}
                              {isQuizSubmitted &&
                                userAnswer === optIdx &&
                                optIdx !== q.correctAnswerIndex && (
                                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation */}
                      {isQuizSubmitted && (
                        <div
                          className={`mt-3 p-3 rounded-xl text-xs ${
                            isCorrect
                              ? 'bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                              : 'bg-amber-100/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                          }`}
                        >
                          <span className="font-bold mr-1">{isCorrect ? '✅ 答對了！' : '❌ 答錯了！'} 解析：</span>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quiz Submit Button */}
              {!isQuizSubmitted ? (
                <button
                  onClick={() => {
                    setIsQuizSubmitted(true);
                    // Check score
                    let correct = 0;
                    currentArticle.quiz?.forEach((q, idx) => {
                      if (quizAnswers[idx] === q.correctAnswerIndex) correct++;
                    });
                    if (correct === currentArticle.quiz?.length) {
                      try {
                        confetti({ particleCount: 50, spread: 70 });
                      } catch {}
                    }
                  }}
                  disabled={Object.keys(quizAnswers).length < (currentArticle.quiz?.length || 0)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition disabled:opacity-50"
                >
                  提交測驗答案
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsQuizSubmitted(false);
                      setQuizAnswers({});
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200"
                  >
                    重新測驗
                  </button>
                  <button
                    onClick={() => setIsQuizOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700"
                  >
                    完成並關閉
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Flashcards Review Modal for Saved Words */}
        {isFlashcardOpen && currentArticle.savedWordTerms.length > 0 && (() => {
          const safeIndex = Math.min(flashcardIndex, currentArticle.savedWordTerms.length - 1);
          const currentTerm = currentArticle.savedWordTerms[safeIndex];
          const lowTerm = (currentTerm || '').toLowerCase();
          const libWord = wordLookupMap.get(lowTerm);
          const cachedWord = cachedWordMap[lowTerm];
          const kvWord =
            extractedKeywords.find((k) => k.term.toLowerCase() === lowTerm) ||
            currentArticle.keyVocabulary?.find((k) => k.term.toLowerCase() === lowTerm);
          const flashPos = libWord?.pos || cachedWord?.pos || kvWord?.pos;
          const flashDef =
            libWord?.def ||
            (isValidChineseDefClient(cachedWord?.def, currentTerm) ? cachedWord?.def : '') ||
            (isValidChineseDefClient(kvWord?.def, currentTerm) ? kvWord?.def : '') ||
            '尚未找到中文釋義（可能已從單字庫移除）';
          const flashDefEn = libWord?.defEn || cachedWord?.defEn || kvWord?.defEn;
          const flashEx = libWord?.ex || cachedWord?.ex || kvWord?.ex;

          return (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-enter flex flex-col justify-between min-h-[380px]">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                      本篇生詞翻牌複習
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      {safeIndex + 1} / {currentArticle.savedWordTerms.length}
                    </span>
                    <button
                      onClick={() => setIsFlashcardOpen(false)}
                      className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Flip Card Area */}
                <div
                  onClick={() => setIsFlashcardFlipped(!isFlashcardFlipped)}
                  className="flex-1 my-4 p-6 rounded-2xl bg-gradient-to-br from-amber-50/50 via-slate-50 to-orange-50/40 dark:from-slate-800/80 dark:via-slate-800 dark:to-amber-950/20 border-2 border-dashed border-amber-300 dark:border-amber-700/60 flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all hover:scale-[1.01]"
                >
                  {!isFlashcardFlipped ? (
                    /* Front side */
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                          {currentTerm}
                        </h3>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            tts.speak(currentTerm, { rate: readerSettings.speechRate || 1.0, voiceURI: readerSettings.voiceURI });
                          }}
                          className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 hover:scale-110 transition"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                      {flashPos && (
                        <span className="inline-block px-2.5 py-0.5 rounded-md text-xs font-black bg-amber-200/80 dark:bg-amber-900/80 text-amber-800 dark:text-amber-200">
                          {flashPos}
                        </span>
                      )}
                      <p className="text-xs text-slate-400 pt-3">
                        👉 點擊翻牌查看繁體中文釋義與例句
                      </p>
                    </div>
                  ) : (
                    /* Back side */
                    <div className="space-y-3 animate-fadeIn">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-lg font-bold text-slate-400">{currentTerm}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            tts.speak(currentTerm, { rate: readerSettings.speechRate || 1.0, voiceURI: readerSettings.voiceURI });
                          }}
                          className="p-1.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <h4 className="text-xl font-black text-slate-900 dark:text-white">
                        {flashDef}
                      </h4>
                      {flashDefEn && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                          {flashDefEn}
                        </p>
                      )}
                      {flashEx && (
                        <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 italic text-left">
                          "{flashEx}"
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    disabled={safeIndex === 0}
                    onClick={() => {
                      setFlashcardIndex((prev) => Math.max(0, prev - 1));
                      setIsFlashcardFlipped(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold disabled:opacity-30 transition"
                  >
                    ← 上一個
                  </button>
                  <button
                    onClick={() => setIsFlashcardFlipped(!isFlashcardFlipped)}
                    className="px-4 py-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-xs font-bold"
                  >
                    {isFlashcardFlipped ? '反轉回正面' : '翻牌'}
                  </button>
                  <button
                    disabled={safeIndex === currentArticle.savedWordTerms.length - 1}
                    onClick={() => {
                      setFlashcardIndex((prev) =>
                        Math.min(currentArticle.savedWordTerms.length - 1, prev + 1)
                      );
                      setIsFlashcardFlipped(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-30 transition shadow-sm"
                  >
                    下一個 →
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Floating Quick Action Pill when collapsed (centered so it never overlaps FloatingAIAssistant) */}
        {isTopBarCollapsed && (
          <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 animate-enter">
            {isPlayingTTS && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-500/25">
                <button onClick={handleTogglePlayTTS} title="暫停/播放">
                  <Pause className="w-3.5 h-3.5" />
                </button>
                <span>朗讀中</span>
                <button onClick={handleStopTTS} className="ml-1 p-0.5" title="停止">
                  <Square className="w-3 h-3 fill-current" />
                </button>
              </div>
            )}
            <button
              onClick={() => {
                setIsTopBarCollapsed(false);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-xl shadow-indigo-500/30 transition hover:scale-105 active:scale-95"
              title="展開上方功能工具列"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>展開功能欄</span>
            </button>
          </div>
        )}

        {/* Reader In-app Toast (also visible during reading mode) */}
        {readerToast && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 px-5 py-2.5 rounded-full shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-enter pointer-events-none backdrop-blur-md">
            <span>{readerToast}</span>
          </div>
        )}
      </div>
    );
  }

  // ================= 2. SHELF / ARTICLES LIST VIEW =================
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24">
      {/* Top Banner */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                沉浸式文章閱讀器
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-medium">
                點擊即時查詞、一鍵收錄生詞庫、AI 難句語法拆解與雙語對照閱讀
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>自訂匯入文章</span>
          </button>

          <button
            onClick={() => setIsGenerateModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-purple-500/20 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 專屬撰寫文章</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-6 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋文章標題、關鍵字或內文概念..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          />
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {['All', 'Science', 'Tech', 'Story', 'News', 'Daily', 'Business', 'Custom'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                categoryFilter === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {cat === 'All'
                ? '全部領域'
                : cat === 'Science'
                ? '科普探索'
                : cat === 'Tech'
                ? '前沿科技'
                : cat === 'Story'
                ? '人文故事'
                : cat === 'News'
                ? '新聞時事'
                : cat === 'Daily'
                ? '生活休閒'
                : cat === 'Business'
                ? '商業趨勢'
                : '我的自訂'}
            </button>
          ))}

          <span className="w-px h-5 bg-slate-300 dark:bg-slate-700 shrink-0 mx-1"></span>

          {/* CEFR Level filter */}
          {['All', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                levelFilter === lvl
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {lvl === 'All' ? '全部難度' : lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Grid */}
      {filteredArticles.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-8 shadow-sm">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">
            找不到符合篩選條件的文章
          </h3>
          <p className="text-xs text-slate-400 mb-4">您可以清除搜尋條件，或點擊上方「自訂匯入」新增自己的文章！</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setCategoryFilter('All');
              setLevelFilter('All');
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
          >
            重置篩選
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredArticles.map((art) => (
            <div
              key={art.id}
              onClick={() => setActiveArticleId(art.id)}
              className="group bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div>
                {/* Meta Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                      {art.level}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">{art.category}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {art.isRead && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>已讀完</span>
                      </span>
                    )}
                    {art.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const executeDelete = () => {
                            const updated = storage.deleteArticle(art.id, userUid);
                            setArticles(updated);
                            onArticlesChange?.(updated);
                            storage.deleteCloudArticle(art.id, userUid).catch(console.error);
                            showReaderToast(`已刪除文章《${art.title}》`);
                          };
                          if (onRequestConfirm) {
                            onRequestConfirm({
                              title: '刪除自訂文章',
                              message: `確定要從書架刪除《${art.title}》嗎？刪除後將無法復原。`,
                              type: 'danger',
                              confirmText: '確認刪除',
                              onConfirm: executeDelete
                            });
                          } else if (window.confirm(`確定要刪除「${art.title}」嗎？`)) {
                            executeDelete();
                          }
                        }}
                        className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="刪除此文章"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 mb-1.5">
                  {art.title}
                </h3>

                {/* Subtitle / Summary */}
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 mb-4 leading-relaxed">
                  {art.summary || art.content.slice(0, 140) + '...'}
                </p>
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-medium">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>約 {art.readTimeMinutes} 分鐘 ({art.wordCount} 字)</span>
                </span>

                {art.savedWordTerms.length > 0 ? (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full text-[11px]">
                    <BookmarkCheck className="w-3 h-3" />
                    <span>已收錄 {art.savedWordTerms.length} 詞</span>
                  </span>
                ) : (
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                    進入閱讀 →
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Import Custom Article Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-enter max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  自訂匯入英文文章 / 閱讀素材
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportedArticleMeta(null);
                }}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* AI Smart URL / Raw Text Importer */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/90 to-purple-50/70 dark:from-indigo-950/40 dark:to-purple-950/30 border border-indigo-200/80 dark:border-indigo-800/70 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    🌐 貼上網址或原始雜亂文本，交給 AI 智慧擷取與雙語排版
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://... (可選，或直接在下方貼入原文後點擊 AI 整理)"
                    className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleAiImportArticle}
                    disabled={isImportingByAI}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isImportingByAI ? 'animate-spin' : ''}`} />
                    <span>{isImportingByAI ? '擷取整理中...' : 'AI 智慧擷取'}</span>
                  </button>
                </div>
              </div>

              {/* File Upload Shortcut */}
              <div className="p-3.5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-center hover:border-indigo-500 transition group cursor-pointer">
                <input
                  type="file"
                  id="article-file-upload-input"
                  accept=".txt,.md"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const name = file.name.replace(/\.[^/.]+$/, '');
                    setImportTitle(name);
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const text = event.target?.result as string;
                      if (text) setImportContent(text);
                    };
                    reader.readAsText(file);
                  }}
                  className="hidden"
                />
                <label htmlFor="article-file-upload-input" className="cursor-pointer block">
                  <FileText className="w-5 h-5 text-indigo-500 mx-auto mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block">
                    點此選擇檔案 (.txt / .md) 一鍵自動匯入
                  </span>
                  <span className="text-[10px] text-slate-400">
                    自動辨識檔名為標題，並將內文自動排版
                  </span>
                </label>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">文章標題 *</label>
                <input
                  type="text"
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                  placeholder="例如：The Benefits of Lifelong Learning"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">難度等級 (CEFR)</label>
                  <select
                    value={importLevel}
                    onChange={(e) => setImportLevel(e.target.value as CEFRLevel)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <option value="A2">A2 初階</option>
                    <option value="B1">B1 中階入門</option>
                    <option value="B2">B2 中高階</option>
                    <option value="C1">C1 進階</option>
                    <option value="C2">C2 精通</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">分類領域</label>
                  <select
                    value={importCategory}
                    onChange={(e) => setImportCategory(e.target.value as ArticleCategory)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <option value="Custom">自訂內容</option>
                    <option value="Tech">前沿科技</option>
                    <option value="Science">科普探索</option>
                    <option value="Story">人文故事</option>
                    <option value="News">新聞時事</option>
                    <option value="Business">商業趨勢</option>
                    <option value="Daily">生活日常</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">
                  英文內文 (請使用空行分隔段落) *
                </label>
                <textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  placeholder="在此直接貼上英文新聞、短篇故事、歷屆英文閱讀試題或部落格文章..."
                  rows={6}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">
                  繁體中文譯文 (可選，支援雙語對照閱讀)
                </label>
                <textarea
                  value={importTranslation}
                  onChange={(e) => setImportTranslation(e.target.value)}
                  placeholder="可選填繁體中文段落翻譯，閱讀時可一鍵切換雙語對照..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveImportArticle}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm transition shadow-md"
                >
                  確認建立並開始閱讀
                </button>
                <button
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportedArticleMeta(null);
                  }}
                  className="px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Generate Article Modal */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-enter">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    AI 專屬量身撰寫文章
                  </h3>
                  <p className="text-[10px] text-slate-400">客製主題、難度與融入當前難字</p>
                </div>
              </div>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">文章主題或關鍵概念</label>
                <input
                  type="text"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  placeholder="例如：咖啡沖煮科學、量子電腦簡介、商務談判心理學..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                {/* Quick Topic Chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    '人工智慧與未來工作',
                    '深度專注與時間管理',
                    '太空探險與火星基地',
                    '日常生活趣味心理學',
                    '全球綠色能源轉型'
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setGenTopic(chip)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium hover:bg-indigo-50 hover:text-indigo-600 transition"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">閱讀目標等級</label>
                  <select
                    value={genLevel}
                    onChange={(e) => setGenLevel(e.target.value as CEFRLevel)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <option value="A2">A2 初階日常</option>
                    <option value="B1">B1 中階流利</option>
                    <option value="B2">B2 中高階學術</option>
                    <option value="C1">C1 高階深度</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">主題類別</label>
                  <select
                    value={genCategory}
                    onChange={(e) => setGenCategory(e.target.value as ArticleCategory)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  >
                    <option value="Science">科普宇宙</option>
                    <option value="Tech">前沿科技</option>
                    <option value="Story">人文哲思</option>
                    <option value="News">新聞時事</option>
                    <option value="Business">商業趨勢</option>
                    <option value="Daily">生活休閒</option>
                  </select>
                </div>
              </div>

              {/* Target Words Option */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useUnmasteredWords}
                    onChange={(e) => setUseUnmasteredWords(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">
                      自動融入我目前尚未精通的單字 (SRS 記憶連動)
                    </span>
                    <span className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80">
                      AI 會將您單字庫中的不熟生詞巧妙嵌入故事句境，實戰加深記憶！
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleGenerateArticle}
                  disabled={isGeneratingArticle}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-sm transition shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingArticle ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>AI 正在撰寫文章與測驗題中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>立即生成專屬文章</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setIsGenerateModalOpen(false)}
                  disabled={isGeneratingArticle}
                  className="px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reader In-app Toast */}
      {readerToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 px-5 py-2.5 rounded-full shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-enter pointer-events-none backdrop-blur-md">
          <span>{readerToast}</span>
        </div>
      )}
    </div>
  );
};
