import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Word, WordGroup, DailyStats, AppSettings, ViewTab, POS, Article } from './types';
import { storage, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, getLocalDateString, getAllWordCategories } from './services/storage';
import { applySRSDecay } from './services/srs';
import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';
import { HomeView } from './components/HomeView';
import { FloatingAIAssistant } from './components/FloatingAIAssistant';
import { ConfirmModal } from './components/ConfirmModal';

// Performance optimization: Lazy-load heavy views & modals
const StudyHubView = lazy(() => import('./components/StudyHubView').then((m) => ({ default: m.StudyHubView })));
const WordListView = lazy(() => import('./components/WordListView').then((m) => ({ default: m.WordListView })));
const AIAssistantView = lazy(() => import('./components/AIAssistantView').then((m) => ({ default: m.AIAssistantView })));
const ArticleReaderView = lazy(() => import('./components/ArticleReaderView').then((m) => ({ default: m.ArticleReaderView })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const AddWordModal = lazy(() => import('./components/AddWordModal').then((m) => ({ default: m.AddWordModal })));
const EditWordModal = lazy(() => import('./components/EditWordModal').then((m) => ({ default: m.EditWordModal })));
const WordDetailModal = lazy(() => import('./components/WordDetailModal').then((m) => ({ default: m.WordDetailModal })));
const CambridgeModal = lazy(() => import('./components/CambridgeModal').then((m) => ({ default: m.CambridgeModal })));
import { BookOpen } from 'lucide-react';
import { LoginView } from './components/LoginView';
import { normalizePos } from './utils/pos';
import { User } from 'firebase/auth';
import { HomeConfig, loadHomeConfig, saveHomeConfig, DEFAULT_HOME_CONFIG } from './utils/homeConfig';
import type { ActiveStudyQuestion } from './components/StudyHubView';

const normalizeCategory = (cat?: string): string | undefined => {
  const clean = (cat || '').trim();
  if (!clean || clean === '未分類' || clean.toLowerCase() === 'uncategorized') {
    return undefined;
  }
  return clean;
};

const mergeArticleRecords = (
  cloudArticles: Article[] | undefined,
  localArticles: Article[],
  lastSyncedAt?: number
): { merged: Article[]; changed: boolean } => {
  if (cloudArticles === undefined) {
    return { merged: localArticles, changed: false };
  }

  const cloudMap = new Map<string, Article>();
  cloudArticles.forEach((a) => {
    if (a && a.id) cloudMap.set(a.id, a);
  });

  let changed = false;
  const mergedMap = new Map<string, Article>(cloudMap);

  localArticles.forEach((localArt) => {
    if (!localArt || !localArt.id) return;
    const cloudArt = cloudMap.get(localArt.id);
    if (!cloudArt) {
      const idMatch = localArt.id.match(/(\d{13})/);
      const artTs = localArt.lastReadTimestamp || (idMatch ? Number(idMatch[1]) : 0);
      if (lastSyncedAt && lastSyncedAt > 0 && artTs > 0 && artTs <= lastSyncedAt) {
        // Existed before last cloud sync and is missing remotely -> deleted on another device
        return;
      }
      mergedMap.set(localArt.id, localArt);
      changed = true;
    } else {
      const unionTerms = Array.from(
        new Set([...(cloudArt.savedWordTerms || []), ...(localArt.savedWordTerms || [])])
      );
      const localLastRead = localArt.lastReadTimestamp || 0;
      const cloudLastRead = cloudArt.lastReadTimestamp || 0;
      const mergedAnalyses = localArt.sentenceAnalyses
        ? { ...(cloudArt.sentenceAnalyses || {}), ...localArt.sentenceAnalyses }
        : cloudArt.sentenceAnalyses;

      const hasMoreTerms = unionTerms.length > (cloudArt.savedWordTerms || []).length;
      const hasTranslationDiff = Boolean(localArt.translationZh && !cloudArt.translationZh);
      const hasQuizDiff = Boolean(
        localArt.quiz && localArt.quiz.length > 0 && (!cloudArt.quiz || cloudArt.quiz.length === 0)
      );
      const hasVocabDiff = Boolean(
        localArt.keyVocabulary &&
          localArt.keyVocabulary.length > 0 &&
          (!cloudArt.keyVocabulary || cloudArt.keyVocabulary.length === 0)
      );
      const hasGrammarDiff = Boolean(
        localArt.grammarPoints &&
          localArt.grammarPoints.length > 0 &&
          (!cloudArt.grammarPoints || cloudArt.grammarPoints.length === 0)
      );
      const hasAnalysisDiff =
        Boolean(localArt.sentenceAnalyses) &&
        Object.keys(localArt.sentenceAnalyses || {}).some(
          (k) => !cloudArt.sentenceAnalyses || !cloudArt.sentenceAnalyses[k]
        );
      const hasReadDiff =
        localLastRead > cloudLastRead || Boolean(localArt.isRead && !cloudArt.isRead);

      if (
        hasReadDiff ||
        hasMoreTerms ||
        hasTranslationDiff ||
        hasQuizDiff ||
        hasVocabDiff ||
        hasGrammarDiff ||
        hasAnalysisDiff
      ) {
        changed = true;
        mergedMap.set(localArt.id, {
          ...cloudArt,
          translationZh: cloudArt.translationZh || localArt.translationZh,
          quiz: cloudArt.quiz && cloudArt.quiz.length > 0 ? cloudArt.quiz : localArt.quiz,
          keyVocabulary:
            cloudArt.keyVocabulary && cloudArt.keyVocabulary.length > 0
              ? cloudArt.keyVocabulary
              : localArt.keyVocabulary,
          grammarPoints:
            cloudArt.grammarPoints && cloudArt.grammarPoints.length > 0
              ? cloudArt.grammarPoints
              : localArt.grammarPoints,
          sentenceAnalyses: mergedAnalyses,
          savedWordTerms: unionTerms,
          isRead: Boolean(cloudArt.isRead || localArt.isRead),
          lastReadTimestamp: Math.max(cloudLastRead, localLastRead) || undefined
        });
      }
    }
  });

  return { merged: Array.from(mergedMap.values()), changed };
};

export default function App() {
  // Core Data State
  const [words, setWords] = useState<Word[]>([]);
  const wordsRef = useRef<Word[]>([]);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
  const [articles, setArticles] = useState<Article[]>([]);
  const articlesRef = useRef<Article[]>([]);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);
  const [dailyStats, setDailyStats] = useState<DailyStats>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const allCategories = useMemo(
    () => getAllWordCategories(words, settings),
    [words, settings]
  );
  const [activeStudyQuestion, setActiveStudyQuestion] = useState<ActiveStudyQuestion | null>(null);

  // Authentication State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Navigation State
  const [currentTab, setCurrentTab] = useState<ViewTab>('home');
  const [initialAIPrompt, setInitialAIPrompt] = useState<{ id: string; text: string } | null>(null);
  const [activeReaderArticleId, setActiveReaderArticleId] = useState<string | null>(null);

  // Modals & UI Feedback State
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialTerm, setAddModalInitialTerm] = useState<string>('');
  const [editModalWord, setEditModalWord] = useState<Word | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHomeEditMode, setIsHomeEditMode] = useState(false);
  const [homeConfig, setHomeConfig] = useState<HomeConfig>(() => loadHomeConfig());
  const [cambridgeWord, setCambridgeWord] = useState<string | null>(null);
  const [detailWordGroup, setDetailWordGroup] = useState<WordGroup | null>(null);

  const handleOpenWordDetail = useCallback((selectedWord: Word) => {
    const matchingEntries = words.filter(
      (w) => w.term.trim().toLowerCase() === selectedWord.term.trim().toLowerCase()
    );
    const entries = matchingEntries.length > 0 ? matchingEntries : [selectedWord];
    const minLevel = Math.min(...entries.map((e) => e.level || 0));
    const minNextReview = Math.min(...entries.map((e) => e.nextReview || Date.now()));
    const maxLastReview = Math.max(...entries.map((e) => e.lastReview || 0));
    const avgInterval = Math.round(
      entries.reduce((acc, curr) => acc + (curr.interval || 1), 0) / entries.length
    );

    setDetailWordGroup({
      term: selectedWord.term,
      entries,
      category: entries.find((e) => e.category)?.category || selectedWord.category,
      minLevel,
      interval: avgInterval,
      nextReview: minNextReview,
      lastReview: maxLastReview
    });
  }, [words]);

  // Keep detailWordGroup reactive to changes in words
  const currentDetailWordGroup = useMemo<WordGroup | null>(() => {
    if (!detailWordGroup) return null;
    const clean = detailWordGroup.term.trim().toLowerCase();
    const matchingEntries = words.filter((w) => w.term.trim().toLowerCase() === clean);
    if (matchingEntries.length === 0) return null;
    const minLevel = Math.min(...matchingEntries.map((e) => e.level || 0));
    const minNextReview = Math.min(...matchingEntries.map((e) => e.nextReview || Date.now()));
    const maxLastReview = Math.max(...matchingEntries.map((e) => e.lastReview || 0));
    const avgInterval = Math.round(
      matchingEntries.reduce((acc, curr) => acc + (curr.interval || 1), 0) / matchingEntries.length
    );
    return {
      term: matchingEntries[0].term,
      entries: matchingEntries,
      category: matchingEntries.find((e) => e.category)?.category,
      minLevel,
      interval: avgInterval,
      nextReview: minNextReview,
      lastReview: maxLastReview
    };
  }, [detailWordGroup, words]);

  const handleUpdateHomeConfig = useCallback((newConfig: HomeConfig) => {
    setHomeConfig(newConfig);
    saveHomeConfig(newConfig, user?.uid);
    if (user) {
      storage.saveCloudHomeConfig(newConfig, user.uid).catch(console.error);
    }
  }, [user]);

  const handleResetHomeConfig = useCallback(() => {
    setHomeConfig(DEFAULT_HOME_CONFIG);
    saveHomeConfig(DEFAULT_HOME_CONFIG, user?.uid);
    if (user) {
      storage.saveCloudHomeConfig(DEFAULT_HOME_CONFIG, user.uid).catch(console.error);
    }
  }, [user]);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info' | 'success';
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 3000);
  }, []);

  const handleArticlesChange = useCallback((updated: Article[]) => {
    setArticles(updated);
    storage.saveLocalArticles(updated, user?.uid);
    if (user) {
      storage.saveCloudArticles(updated, user.uid).catch(console.error);
    }
  }, [user]);

  const handleOpenArticleInReader = useCallback((article: Article) => {
    const updated = storage.saveArticle(article, user?.uid);
    setArticles(updated);
    if (user) {
      storage.saveCloudArticles(updated, user.uid).catch(console.error);
    }
    setActiveReaderArticleId(article.id);
    setCurrentTab('reader');
    showToast(`📖 已在閱讀器開啟文章《${article.title}》`);
  }, [user, showToast]);

  const handleSaveArticle = useCallback((article: Article) => {
    const updated = storage.saveArticle(article, user?.uid);
    setArticles(updated);
    if (user) {
      storage.saveCloudArticles(updated, user.uid).catch(console.error);
    }
    showToast(`📚 已成功收錄文章《${article.title}》至文章閱讀庫！`);
  }, [user, showToast]);

  const handleClearAllArticles = useCallback(() => {
    storage.clearAllArticles(user?.uid);
    setArticles([]);
    if (user) {
      storage.clearCloudArticles(user.uid).catch(console.error);
    }
    showToast('已清空文章閱讀庫中的所有文章');
  }, [user, showToast]);

  const handleDeleteArticle = useCallback((idOrTitle: string) => {
    const clean = (idOrTitle || '').trim().toLowerCase();
    const matched = articles.find(
      (a) => a.id === idOrTitle || (a.title && a.title.trim().toLowerCase() === clean)
    );
    const targetId = matched ? matched.id : idOrTitle;
    const targetTitle = matched ? matched.title : idOrTitle;

    const updated = storage.deleteArticle(targetId, user?.uid);
    setArticles(updated);
    if (user) {
      storage.deleteCloudArticle(targetId, user.uid).catch(console.error);
    }
    showToast(`已從文章閱讀庫刪除文章「${targetTitle}」`);
  }, [articles, user, showToast]);

  // 1. Initial Load: Listen to Firebase Auth state & load user-scoped data
  useEffect(() => {
    const unsubscribe = storage.onAuthChanged(async (currentUser, isReady) => {
      setIsAuthChecking(false);
      setUser(currentUser);

      if (currentUser) {
        const welcomeName = currentUser.isAnonymous
          ? '訪客朋友'
          : (currentUser.displayName || currentUser.email?.split('@')[0] || '使用者');
        showToast(`歡迎回來，${welcomeName}`);

        // 1. Load user-scoped local cache for instant UI rendering
        const localWords = storage.getLocalWords(currentUser.uid);
        const localStats = storage.getLocalStats(currentUser.uid);
        const localSettings = storage.getLocalSettings(currentUser.uid);
        const localArticles = storage.getLocalArticles(currentUser.uid);
        const localHome = loadHomeConfig(currentUser.uid);

        setSettings(localSettings);
        setDailyStats(localStats);
        setArticles(localArticles);
        setHomeConfig(localHome);

        const { updated } = applySRSDecay(localWords);
        wordsRef.current = updated;
        setWords(updated);

        // 2. Reconcile with cloud database (Firestore is authoritative, but protect unsynced local words)
        try {
          const cloudData = await storage.syncFromCloud(currentUser.uid);
          if (cloudData) {
            let authoritativeWords: Word[];

            if (cloudData.words.length === 0 && localWords.length > 0) {
              const lastSyncedAt = cloudData.lastSyncedAt || 0;
              const hasUnsyncedLocal =
                !lastSyncedAt || localWords.some((lw) => (lw.timestamp || 0) > lastSyncedAt);
              if (hasUnsyncedLocal) {
                // Cloud has 0 words, but local has unsynced words (e.g. first login or offline creation):
                // Seed local words into cloud rather than wiping them out!
                authoritativeWords = localWords;
                storage.saveCloudWordsOnly(localWords, currentUser.uid).catch(console.error);
              } else {
                authoritativeWords = [];
              }
            } else if (cloudData.words.length > 0) {
              const cloudIds = new Set(cloudData.words.map((w) => w.id));
              const lastSyncedAt = cloudData.lastSyncedAt || 0;
              // Detect any words created locally after lastSyncedAt that haven't reached cloud yet;
              // older local words missing from cloud were deleted on another device.
              const localUnsynced = localWords.filter(
                (lw) => !cloudIds.has(lw.id) && (lw.timestamp || 0) > lastSyncedAt
              );
              if (localUnsynced.length > 0) {
                authoritativeWords = [...localUnsynced, ...cloudData.words];
                storage.saveCloudWordsOnly(authoritativeWords, currentUser.uid).catch(console.error);
              } else {
                authoritativeWords = cloudData.words;
              }
            } else {
              authoritativeWords = [];
            }

            // Apply SRS decay to authoritative words so overdue cards decay accurately
            const { updated: cloudWordsDecayed, count: decayedCount } = applySRSDecay(authoritativeWords);
            wordsRef.current = cloudWordsDecayed;
            setWords(cloudWordsDecayed);
            storage.saveLocalWords(cloudWordsDecayed, currentUser.uid);
            if (decayedCount > 0) {
              storage.saveCloudWordsOnly(cloudWordsDecayed, currentUser.uid).catch(console.error);
            }

            if (cloudData.articles !== undefined) {
              const { merged: mergedArticles, changed: articlesChanged } = mergeArticleRecords(
                cloudData.articles,
                localArticles,
                cloudData.lastSyncedAt
              );
              articlesRef.current = mergedArticles;
              setArticles(mergedArticles);
              storage.saveLocalArticles(mergedArticles, currentUser.uid);
              if (articlesChanged) {
                storage.saveCloudArticles(mergedArticles, currentUser.uid).catch(console.error);
              }
            }
            if (cloudData.stats) {
              setDailyStats(cloudData.stats);
              storage.saveLocalStats(cloudData.stats, currentUser.uid);
            }
            if (cloudData.settings) {
              setSettings(cloudData.settings);
              storage.saveLocalSettings(cloudData.settings, currentUser.uid);
            }
            if ((cloudData as any).homeConfig) {
              setHomeConfig((cloudData as any).homeConfig);
              saveHomeConfig((cloudData as any).homeConfig, currentUser.uid);
            }
            if ((cloudData as any).readerSettings) {
              storage.saveLocalReaderSettings((cloudData as any).readerSettings, currentUser.uid);
            }
          }
        } catch (syncErr) {
          console.warn('Initial cloud sync error:', syncErr);
        }
      } else {
        // Logged out: Clear all in-memory state completely
        wordsRef.current = [];
        setWords([]);
        setDailyStats({});
        setArticles([]);
        setSettings(DEFAULT_SETTINGS);
        setHomeConfig(DEFAULT_HOME_CONFIG);
      }
    });

    return () => unsubscribe();
  }, [showToast]);

  // Apply Dark Mode, Font Scale & Theme class to HTML root
  useEffect(() => {
    const root = document.documentElement;
    if (settings.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    if (settings.themeStyle === 'simple') {
      document.body.classList.add('theme-simple');
    } else {
      document.body.classList.remove('theme-simple');
    }

    root.classList.toggle('font-scale-medium', settings.fontSize === 'medium');
    root.classList.toggle('font-scale-large', settings.fontSize === 'large');
  }, [settings.darkMode, settings.themeStyle, settings.fontSize]);

  // Count due words today
  const dueWordsCount = useMemo(() => {
    const now = Date.now();
    return words.filter((w) => (w.nextReview || 0) <= now).length;
  }, [words]);

  // Record daily activity helper
  const recordActivity = useCallback(
    (type: 'added' | 'reviewed' | 'quizzes', increment: number = 1) => {
      const today = getLocalDateString();
      setDailyStats((prev) => {
        const current = prev[today] || { added: 0, reviewed: 0, quizzes: 0 };
        const updated = {
          ...prev,
          [today]: {
            ...current,
            [type]: (current[type] || 0) + increment
          }
        };
        storage.saveLocalStats(updated, user?.uid);
        if (user) {
          storage.saveCloudStats(updated, user.uid).catch(console.error);
        }
        return updated;
      });
    },
    [user]
  );

  // Settings update handler
  const handleUpdateSettings = useCallback(
    (newSettings: Partial<AppSettings>) => {
      setSettings((prev) => {
        const base = settingsRef.current || prev;
        const merged = { ...base, ...newSettings };
        settingsRef.current = merged;
        storage.saveLocalSettings(merged, user?.uid);
        if (user) {
          storage.saveCloudSettings(merged, user.uid);
        }
        return merged;
      });

      // Synchronize accentColor with homeConfig so the entire app matches
      if (newSettings.accentColor) {
        setHomeConfig((prevHome) => {
          const updatedHome = { ...prevHome, accentColor: newSettings.accentColor as any };
          saveHomeConfig(updatedHome, user?.uid);
          return updatedHome;
        });
      }
    },
    [user]
  );

  // Add words (with deduplication against identical term + pos + def)
  const handleAddWords = useCallback(
    (newWordItems: Partial<Word>[]) => {
      const now = Date.now();
      const currentWords = wordsRef.current;
      const existingKeys = new Set(
        currentWords.map(
          (w) =>
            `${w.term.trim().toLowerCase()}||${(w.pos || '').trim().toLowerCase()}||${w.def
              .trim()
              .toLowerCase()}`
        )
      );

      const created: Word[] = [];
      for (let idx = 0; idx < newWordItems.length; idx++) {
        const item = newWordItems[idx];
        const term = (item.term || '').trim();
        const pos = normalizePos(item.pos);
        const def = (item.def || '').trim();
        if (!term || !def) continue;

        const key = `${term.toLowerCase()}||${pos.toLowerCase()}||${def.toLowerCase()}`;
        if (existingKeys.has(key)) {
          continue;
        }
        existingKeys.add(key);

        created.push({
          id: item.id || `w-${now}-${Math.random().toString(36).substring(2, 7)}-${idx}`,
          term,
          pos,
          def,
          defEn: (item.defEn || '').trim() || undefined,
          ex: (item.ex || '').trim(),
          category: normalizeCategory(item.category),
          level: item.level !== undefined ? item.level : 0,
          interval: item.interval || 1,
          easeFactor: item.easeFactor || 2.5,
          timestamp: now,
          lastReview: now,
          nextReview: now + 86400000
        });
      }

      if (created.length === 0) {
        showToast('所選單字已全部存在於單字庫中，未重複新增。');
        return;
      }

      const updated = [...created, ...currentWords];
      wordsRef.current = updated;
      setWords(updated);
      storage.saveLocalWords(updated, user?.uid);
      recordActivity('added', created.length);
      showToast(`成功新增 ${created.length} 個單字！`);

      if (user) {
        storage.upsertCloudWords(created, user.uid).catch(console.error);
      }
    },
    [user, recordActivity, showToast]
  );

  // Listen for words synced from VocabMin Companion Chrome Extension
  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.data?.source === 'VOCABMIN_EXTENSION') {
        if (event.data.action === 'VOCABMIN_NEW_WORD_ADDED' && event.data.payload) {
          handleAddWords([event.data.payload]);
          showToast(`已從擴充功能收錄單字：${event.data.payload.term}`);
        } else if (event.data.action === 'VOCABMIN_SYNC_WORDS_BULK' && Array.isArray(event.data.payload)) {
          handleAddWords(event.data.payload);
          showToast(`已成功同步 ${event.data.payload.length} 個擴充功能收錄的單字！`);
        }
      }
    };
    window.addEventListener('message', handleExtensionMessage);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [handleAddWords, showToast]);

  // Single word review update
  const handleUpdateWordReview = useCallback(
    (wordId: string, updates: Partial<Word>, skipStatsCount: boolean = false) => {
      const currentWords = wordsRef.current;
      const updated = currentWords.map((w) => (w.id === wordId ? { ...w, ...updates } : w));
      wordsRef.current = updated;
      setWords(updated);
      storage.saveLocalWords(updated, user?.uid);
      if (user) {
        storage.updateCloudWord(wordId, updates, user.uid).catch(console.error);
      }
      if (!skipStatsCount) {
        recordActivity('reviewed', 1);
      }
    },
    [user, recordActivity]
  );

  // Batch word review updates
  const handleBatchUpdateReview = useCallback(
    (batch: { id: string; data: Partial<Word> }[]) => {
      const currentWords = wordsRef.current;
      const map = new Map(batch.map((b) => [b.id, b.data]));
      const updated = currentWords.map((w) => {
        if (map.has(w.id)) {
          return { ...w, ...map.get(w.id)! };
        }
        return w;
      });
      wordsRef.current = updated;
      setWords(updated);
      storage.saveLocalWords(updated, user?.uid);
      if (user) {
        storage.batchUpdateCloudWords(batch, user.uid).catch(console.error);
      }
      recordActivity('reviewed', batch.length);
    },
    [user, recordActivity]
  );

  // Edit word group (update all definitions with same term, strictly preserving existing SRS stats)
  const handleUpdateWordGroup = useCallback(
    (oldTerm: string, updatedList: Partial<Word>[]) => {
      const cleanOldTerm = oldTerm.trim().toLowerCase();
      const currentWords = wordsRef.current;
      const oldEntries = currentWords.filter(
        (w) => w.term.trim().toLowerCase() === cleanOldTerm
      );
      const clean = currentWords.filter(
        (w) => w.term.trim().toLowerCase() !== cleanOldTerm
      );
      const now = Date.now();
      const seenIds = new Set(clean.map((w) => w.id));
      const seenSemanticKeys = new Set(
        clean.map(
          (w) =>
            `${w.term.trim().toLowerCase()}||${(w.pos || '').trim().toLowerCase()}||${w.def
              .trim()
              .toLowerCase()}`
        )
      );

      const newEntries: Word[] = [];
      updatedList.forEach((item, idx) => {
        const matchedOld =
          (item.id && oldEntries.find((o) => o.id === item.id)) ||
          oldEntries.find(
            (o) =>
              o.pos === item.pos &&
              o.def.trim().toLowerCase() === (item.def || '').trim().toLowerCase()
          );

        const nextTerm = (item.term || oldTerm).trim();
        const nextPos = normalizePos(item.pos || matchedOld?.pos);
        const nextDef = (item.def !== undefined ? item.def : matchedOld?.def || '').trim();
        const candidateId =
          item.id || matchedOld?.id || `w-${now}-${Math.random().toString(36).substring(2, 7)}-${idx}`;
        const semanticKey = `${nextTerm.toLowerCase()}||${nextPos.toLowerCase()}||${nextDef.toLowerCase()}`;

        // Deduplicate if renamed into an existing term/definition or duplicated in the edit list
        if (seenIds.has(candidateId) || seenSemanticKeys.has(semanticKey)) {
          return;
        }
        seenIds.add(candidateId);
        seenSemanticKeys.add(semanticKey);

        newEntries.push({
          id: candidateId,
          term: nextTerm,
          pos: nextPos,
          def: nextDef,
          defEn: item.defEn !== undefined ? item.defEn : matchedOld?.defEn,
          ex: item.ex !== undefined ? item.ex : matchedOld?.ex || '',
          category:
            item.category !== undefined
              ? normalizeCategory(item.category)
              : normalizeCategory(matchedOld?.category),
          level: item.level !== undefined ? item.level : matchedOld?.level ?? 0,
          interval: item.interval || matchedOld?.interval || 1,
          easeFactor: item.easeFactor || matchedOld?.easeFactor || 2.5,
          timestamp: matchedOld?.timestamp || item.timestamp || now,
          lastReview: matchedOld?.lastReview || item.lastReview || now,
          nextReview: matchedOld?.nextReview || item.nextReview || now + 86400000
        });
      });

      const finalWords = [...newEntries, ...clean];
      wordsRef.current = finalWords;
      setWords(finalWords);
      storage.saveLocalWords(finalWords, user?.uid);
      if (user) {
        storage.reconcileCloudWordGroup(oldEntries.map((o) => o.id), newEntries, user.uid).catch(console.error);
      }

      // If oldTerm was renamed completely away, update savedWordTerms in articles
      const stillHasOldTerm = finalWords.some(
        (w) => w.term.trim().toLowerCase() === cleanOldTerm
      );
      if (!stillHasOldTerm && articlesRef.current.length > 0) {
        const renamedToTerm = newEntries[0]?.term?.trim();
        let articlesChanged = false;
        const nextArticles = articlesRef.current.map((art) => {
          const existingTerms = art.savedWordTerms || [];
          if (!existingTerms.some((t) => t.trim().toLowerCase() === cleanOldTerm)) {
            return art;
          }
          articlesChanged = true;
          const mapped = existingTerms
            .map((t) => (t.trim().toLowerCase() === cleanOldTerm ? renamedToTerm || '' : t))
            .filter(Boolean);
          const deduped: string[] = [];
          const seenTermLower = new Set<string>();
          mapped.forEach((t) => {
            const lower = t.trim().toLowerCase();
            if (!seenTermLower.has(lower)) {
              seenTermLower.add(lower);
              deduped.push(t);
            }
          });
          return { ...art, savedWordTerms: deduped };
        });
        if (articlesChanged) {
          articlesRef.current = nextArticles;
          setArticles(nextArticles);
          storage.saveLocalArticles(nextArticles, user?.uid);
          if (user) {
            storage.saveCloudArticles(nextArticles, user.uid).catch(console.error);
          }
        }
      }

      showToast('單字修改成功！');
    },
    [user, showToast]
  );

  // Category Management Handlers
  const handleAddCategory = useCallback(
    (newCat: string) => {
      const clean = newCat.trim();
      if (!clean || clean === '未分類') return;
      const baseSettings = settingsRef.current || settings;
      const currentCats = getAllWordCategories(wordsRef.current, baseSettings);
      if (currentCats.some((c) => c.trim().toLowerCase() === clean.toLowerCase())) return;

      const updated = [...currentCats, clean];
      handleUpdateSettings({ customCategories: updated });
      showToast(`已建立分類「${clean}」`);
    },
    [settings, handleUpdateSettings, showToast]
  );

  const handleRenameCategory = useCallback(
    async (oldName: string, newName: string) => {
      const cleanOld = oldName.trim();
      const cleanNew = newName.trim();
      if (!cleanOld || !cleanNew || cleanOld.toLowerCase() === cleanNew.toLowerCase()) return;

      const baseSettings = settingsRef.current || settings;
      const currentCats = getAllWordCategories(wordsRef.current, baseSettings);
      const updatedCats = currentCats.map((c) =>
        c.trim().toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c
      );
      const updatedSettings = { ...baseSettings, customCategories: updatedCats };
      settingsRef.current = updatedSettings;
      setSettings(updatedSettings);
      storage.saveLocalSettings(updatedSettings, user?.uid);

      const currentWords = wordsRef.current;
      const affectedIds: string[] = [];
      const nextWords = currentWords.map((w) => {
        if (w.category && w.category.trim().toLowerCase() === cleanOld.toLowerCase()) {
          affectedIds.push(w.id);
          return { ...w, category: cleanNew };
        }
        return w;
      });

      wordsRef.current = nextWords;
      setWords(nextWords);
      storage.saveLocalWords(nextWords, user?.uid);

      // DIRECT CLOUD MUTATION (Immediate Firestore Execution):
      if (user) {
        try {
          await storage.renameCloudCategory(cleanOld, cleanNew, affectedIds, user.uid);
          await storage.saveCloudSettings(updatedSettings, user.uid);
        } catch (err) {
          console.error('Failed to rename cloud category directly:', err);
        }
      }

      showToast(`已將分類「${cleanOld}」更名為「${cleanNew}」`);
    },
    [settings, user, showToast]
  );

  const handleDeleteCategory = useCallback(
    async (categoryName: string) => {
      const clean = categoryName.trim();
      if (!clean) return;

      const baseSettings = settingsRef.current || settings;
      const currentCats = getAllWordCategories(wordsRef.current, baseSettings);
      const updatedCats = currentCats.filter((c) => c.trim().toLowerCase() !== clean.toLowerCase());
      const updatedSettings = { ...baseSettings, customCategories: updatedCats };
      settingsRef.current = updatedSettings;
      setSettings(updatedSettings);
      storage.saveLocalSettings(updatedSettings, user?.uid);

      const currentWords = wordsRef.current;
      const affectedIds: string[] = [];
      const nextWords = currentWords.map((w) => {
        if (w.category && w.category.trim().toLowerCase() === clean.toLowerCase()) {
          affectedIds.push(w.id);
          const copy = { ...w };
          delete copy.category;
          return copy;
        }
        return w;
      });

      wordsRef.current = nextWords;
      setWords(nextWords);
      storage.saveLocalWords(nextWords, user?.uid);

      // DIRECT CLOUD MUTATION (Immediate Firestore Execution):
      if (user) {
        try {
          await storage.deleteCloudCategory(clean, affectedIds, user.uid);
          await storage.saveCloudSettings(updatedSettings, user.uid);
        } catch (err) {
          console.error('Failed to delete cloud category directly:', err);
        }
      }

      showToast(`已刪除分類「${clean}」，原單字已設為未分類`);
    },
    [settings, user, showToast]
  );

  const handleUpdateTermCategory = useCallback(
    async (term: string, newCategory?: string) => {
      const cleanTerm = term.trim().toLowerCase();
      const cleanCat = newCategory?.trim();
      const baseSettings = settingsRef.current || settings;
      const currentCats = getAllWordCategories(wordsRef.current, baseSettings);
      const matchedCat = cleanCat ? currentCats.find((c) => c.trim().toLowerCase() === cleanCat.toLowerCase()) : undefined;
      const finalCat = !cleanCat || cleanCat === '未分類' ? undefined : (matchedCat || cleanCat);

      const currentWords = wordsRef.current;
      const affectedIds: string[] = [];
      const nextWords = currentWords.map((w) => {
        if (w.term.trim().toLowerCase() === cleanTerm) {
          affectedIds.push(w.id);
          const copy = { ...w };
          if (finalCat) {
            copy.category = finalCat;
          } else {
            delete copy.category;
          }
          return copy;
        }
        return w;
      });

      wordsRef.current = nextWords;
      setWords(nextWords);
      storage.saveLocalWords(nextWords, user?.uid);

      if (finalCat) {
        if (!currentCats.some((c) => c.trim().toLowerCase() === finalCat.toLowerCase())) {
          const updatedCats = [...currentCats, finalCat];
          const updatedSettings = { ...baseSettings, customCategories: updatedCats };
          settingsRef.current = updatedSettings;
          setSettings(updatedSettings);
          storage.saveLocalSettings(updatedSettings, user?.uid);
          if (user) {
            storage.saveCloudSettings(updatedSettings, user.uid).catch(console.error);
          }
        }
      }

      // DIRECT CLOUD MUTATION (Immediate Firestore Execution):
      if (user) {
        try {
          await storage.batchUpdateCloudWordsCategory(affectedIds, finalCat, [term], user.uid);
        } catch (err) {
          console.error('Failed to update cloud word category directly:', err);
        }
      }

      showToast(finalCat ? `已將「${term}」歸類至「${finalCat}」` : `已取消「${term}」的分類`);
    },
    [settings, user, showToast]
  );

  const handleBatchUpdateTermsCategory = useCallback(
    async (terms: string[], newCategory?: string) => {
      if (!terms.length) return;
      const termsSet = new Set(terms.map((t) => t.trim().toLowerCase()));
      const cleanCat = newCategory?.trim();
      const baseSettings = settingsRef.current || settings;
      const currentCats = getAllWordCategories(wordsRef.current, baseSettings);
      const matchedCat = cleanCat ? currentCats.find((c) => c.trim().toLowerCase() === cleanCat.toLowerCase()) : undefined;
      const finalCat = !cleanCat || cleanCat === '未分類' ? undefined : (matchedCat || cleanCat);

      const currentWords = wordsRef.current;
      const affectedIds: string[] = [];
      const affectedTerms: string[] = [];

      const nextWords = currentWords.map((w) => {
        if (termsSet.has(w.term.trim().toLowerCase())) {
          affectedIds.push(w.id);
          affectedTerms.push(w.term);
          const copy = { ...w };
          if (finalCat) {
            copy.category = finalCat;
          } else {
            delete copy.category;
          }
          return copy;
        }
        return w;
      });

      wordsRef.current = nextWords;
      setWords(nextWords);
      storage.saveLocalWords(nextWords, user?.uid);

      if (finalCat) {
        if (!currentCats.some((c) => c.trim().toLowerCase() === finalCat.toLowerCase())) {
          const updatedCats = [...currentCats, finalCat];
          const updatedSettings = { ...baseSettings, customCategories: updatedCats };
          settingsRef.current = updatedSettings;
          setSettings(updatedSettings);
          storage.saveLocalSettings(updatedSettings, user?.uid);
          if (user) {
            storage.saveCloudSettings(updatedSettings, user.uid).catch(console.error);
          }
        }
      }

      // DIRECT CLOUD MUTATION (Immediate Firestore Execution):
      if (user) {
        try {
          await storage.batchUpdateCloudWordsCategory(affectedIds, finalCat, affectedTerms, user.uid);
        } catch (err) {
          console.error('Failed to batch update cloud words category directly:', err);
        }
      }

      showToast(
        finalCat
          ? `已將 ${terms.length} 個單字批次歸類至「${finalCat}」`
          : `已將 ${terms.length} 個單字設為未分類`
      );
    },
    [settings, user, showToast]
  );

  // Deduplicate words: merge repeated items with same term and pos/def, keeping highest mastery and SRS stats
  const handleDeduplicateWords = useCallback(() => {
    let originalCount = 0;
    let cleanCount = 0;
    const mergedTermsSet = new Set<string>();

    const currentWords = wordsRef.current;
    originalCount = currentWords.length;
    const termMap = new Map<string, Word[]>();

    currentWords.forEach((w) => {
      const key = w.term.trim().toLowerCase();
      if (!termMap.has(key)) termMap.set(key, []);
      termMap.get(key)!.push(w);
    });

    const deduplicated: Word[] = [];

    termMap.forEach((entries) => {
      // Group entries by normalized (pos + def)
      const defMap = new Map<string, Word[]>();
      entries.forEach((e) => {
        const normDef = `${(e.pos || 'n.').trim().toLowerCase()}||${e.def.trim().toLowerCase()}`;
        if (!defMap.has(normDef)) defMap.set(normDef, []);
        defMap.get(normDef)!.push(e);
      });

      if (entries.length > defMap.size) {
        mergedTermsSet.add(entries[0].term);
      }

      defMap.forEach((duplicates) => {
        // If duplicates exist, pick the best stats
        const best = duplicates.reduce((prevBest, cur) => {
          return (cur.level || 0) > (prevBest.level || 0) ? cur : prevBest;
        }, duplicates[0]);

        const maxLevel = Math.max(...duplicates.map((d) => d.level || 0));
        const maxEase = Math.max(...duplicates.map((d) => d.easeFactor || 2.5));
        const maxInterval = Math.max(...duplicates.map((d) => d.interval || 1));
        const maxLastReview = Math.max(...duplicates.map((d) => d.lastReview || 0));
        const minNextReview = Math.min(
          ...duplicates.map((d) => d.nextReview || Date.now() + 86400000)
        );
        // Longest example sentence
        const bestEx =
          duplicates
            .map((d) => d.ex || '')
            .filter(Boolean)
            .sort((a, b) => b.length - a.length)[0] ||
          best.ex ||
          '';

        const bestDefEn = duplicates.find((d) => d.defEn && d.defEn.trim())?.defEn || best.defEn;

        deduplicated.push({
          ...best,
          defEn: bestDefEn,
          level: maxLevel,
          easeFactor: maxEase,
          interval: maxInterval,
          lastReview: maxLastReview,
          nextReview: minNextReview,
          ex: bestEx
        });
      });
    });

    cleanCount = deduplicated.length;
    wordsRef.current = deduplicated;
    setWords(deduplicated);
    storage.saveLocalWords(deduplicated, user?.uid);
    if (user) {
      storage.saveCloudWordsOnly(deduplicated, user.uid).catch(console.error);
    }

    const removedCount = originalCount - cleanCount;
    return {
      originalCount,
      cleanCount,
      removedCount,
      mergedTerms: Array.from(mergedTermsSet)
    };
  }, [user]);

  // Clear all words
  const pruneArticlesSavedTerms = useCallback(
    (removedTermsLower: Set<string> | null) => {
      const currentArticles = articlesRef.current;
      if (!currentArticles.length) return;
      let anyChanged = false;
      const nextArticles = currentArticles.map((art) => {
        const existing = art.savedWordTerms || [];
        if (!existing.length) return art;
        const filtered = removedTermsLower
          ? existing.filter((t) => !removedTermsLower.has(t.trim().toLowerCase()))
          : [];
        if (filtered.length !== existing.length) {
          anyChanged = true;
          return { ...art, savedWordTerms: filtered };
        }
        return art;
      });
      if (anyChanged) {
        articlesRef.current = nextArticles;
        setArticles(nextArticles);
        storage.saveLocalArticles(nextArticles, user?.uid);
        if (user) {
          storage.saveCloudArticles(nextArticles, user.uid).catch(console.error);
        }
      }
    },
    [user]
  );

  const handleClearAllWords = useCallback(() => {
    const count = wordsRef.current.length;
    wordsRef.current = [];
    setWords([]);
    storage.saveLocalWords([], user?.uid);
    if (user) {
      storage.clearCloudWords(user.uid).catch((err) => console.error('Cloud clear error:', err));
    }
    pruneArticlesSavedTerms(null);
    showToast(`已成功清空單字庫（共清除 ${count} 個單字）`);
    return count;
  }, [user, showToast, pruneArticlesSavedTerms]);

  // Reset all words mastery to 0
  const handleResetAllMastery = useCallback(() => {
    const currentWords = wordsRef.current;
    const count = currentWords.length;
    const updated = currentWords.map((w) => ({
      ...w,
      level: 0,
      interval: 1,
      easeFactor: 2.5,
      lastReview: 0,
      nextReview: Date.now()
    }));
    wordsRef.current = updated;
    setWords(updated);
    storage.saveLocalWords(updated, user?.uid);
    if (user) {
      storage.saveCloudWordsOnly(updated, user.uid).catch((err) => console.error('Cloud reset error:', err));
    }
    showToast(`已成功將全庫 ${count} 個單字熟練度重置為完全不熟練 (Level 0)！`);
    return count;
  }, [user, showToast]);

  // Delete word group
  const handleDeleteWordGroup = useCallback(
    (term: string, skipConfirm?: boolean) => {
      const executeDelete = () => {
        const clean = term.trim().toLowerCase();
        const currentWords = wordsRef.current;
        const updated = currentWords.filter(
          (w) => w.term.trim().toLowerCase() !== clean
        );
        wordsRef.current = updated;
        setWords(updated);
        storage.saveLocalWords(updated, user?.uid);
        if (user) {
          storage.deleteCloudWordsByTerm(clean, user.uid).catch((err) =>
            console.error('Cloud delete term error:', err)
          );
        }
        pruneArticlesSavedTerms(new Set([clean]));
        setConfirmConfig((c) => ({ ...c, isOpen: false }));
        showToast(`已刪除「${term}」`);
      };

      if (skipConfirm) {
        executeDelete();
        return;
      }

      setConfirmConfig({
        isOpen: true,
        title: '刪除單字',
        message: `確定要從單字庫中刪除「${term}」及其所有詞性釋義嗎？`,
        type: 'danger',
        confirmText: '確認刪除',
        onConfirm: executeDelete
      });
    },
    [user, showToast, pruneArticlesSavedTerms]
  );

  // Delete a single definition of a word without affecting other definitions
  const handleDeleteSingleWord = useCallback(
    (wordId: string, term: string, defSnippet?: string) => {
      setConfirmConfig({
        isOpen: true,
        title: '刪除單字釋義',
        message: `確定要刪除「${term}」的此項釋義${defSnippet ? `「${defSnippet}」` : ''}嗎？`,
        type: 'danger',
        confirmText: '確認刪除',
        onConfirm: () => {
          const currentWords = wordsRef.current;
          const updated = currentWords.filter((w) => w.id !== wordId);
          wordsRef.current = updated;
          setWords(updated);
          storage.saveLocalWords(updated, user?.uid);
          if (user) {
            storage.deleteCloudWordById(wordId, user.uid).catch((err) =>
              console.error('Cloud delete word error:', err)
            );
          }
          const cleanTerm = term.trim().toLowerCase();
          const stillHasTerm = updated.some((w) => w.term.trim().toLowerCase() === cleanTerm);
          if (!stillHasTerm) {
            pruneArticlesSavedTerms(new Set([cleanTerm]));
          }
          setConfirmConfig((c) => ({ ...c, isOpen: false }));
          showToast(`已刪除「${term}」的該項釋義`);
        }
      });
    },
    [user, showToast, pruneArticlesSavedTerms]
  );

  // Batch standardize words
  const handleBatchStandardizeWords = useCallback(
    (updatedList: Partial<Word>[]) => {
      const currentWords = wordsRef.current;
      const termFreq = new Map<string, number>();
      currentWords.forEach((w) => {
        const k = (w.term || '').trim().toLowerCase();
        if (k) termFreq.set(k, (termFreq.get(k) || 0) + 1);
      });

      const updateById = new Map<string, Partial<Word>>();
      const updateByTermPos = new Map<string, Partial<Word>>();
      const updateByTerm = new Map<string, Partial<Word>>();
      updatedList.forEach((u) => {
        if (u.id) updateById.set(u.id, u);
        const cleanTerm = (u.term || '').trim().toLowerCase();
        if (!cleanTerm) return;
        const normUPos = u.pos ? normalizePos(u.pos).toLowerCase() : '';
        if (normUPos) {
          updateByTermPos.set(`${cleanTerm}||${normUPos}`, u);
        }
        updateByTerm.set(cleanTerm, u);
      });

      const changedBatch: { id: string; data: Partial<Word> }[] = [];
      const merged = currentWords.map((w) => {
        const cleanTerm = (w.term || '').trim().toLowerCase();
        const normWPos = normalizePos(w.pos).toLowerCase();
        const u =
          updateById.get(w.id) ||
          updateByTermPos.get(`${cleanTerm}||${normWPos}`) ||
          (termFreq.get(cleanTerm) === 1 ? updateByTerm.get(cleanTerm) : undefined);

        if (u) {
          const nextPos = u.pos && u.pos.trim() ? normalizePos(u.pos) : w.pos;
          const nextDef = u.def && u.def.trim() ? u.def.trim() : w.def;
          const nextDefEn = u.defEn && u.defEn.trim() ? u.defEn.trim() : w.defEn;
          const nextEx = u.ex && u.ex.trim() ? u.ex.trim() : w.ex;
          changedBatch.push({
            id: w.id,
            data: { pos: nextPos, def: nextDef, defEn: nextDefEn, ex: nextEx }
          });
          return {
            ...w,
            pos: nextPos,
            def: nextDef,
            defEn: nextDefEn,
            ex: nextEx
          };
        }
        return w;
      });
      wordsRef.current = merged;
      setWords(merged);
      storage.saveLocalWords(merged, user?.uid);
      if (user && changedBatch.length > 0) {
        storage.batchUpdateCloudWords(changedBatch, user.uid).catch(console.error);
      }
      showToast('成功完成單字庫標準化更新！');
    },
    [user, showToast]
  );

  // Import / Export
  const handleExportJSON = () => {
    storage.exportJSON(wordsRef.current, dailyStats, settings, articles, homeConfig);
    showToast('備份 JSON 已匯出！');
  };

  const handleExportCSV = () => {
    storage.exportCSV(wordsRef.current);
    showToast('單字 CSV 清單已匯出！');
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
          showToast('JSON 內容無效，無法匯入');
          return;
        }

        const now = Date.now();
        const currentIds = new Set(wordsRef.current.map((w) => w.id));
        const currentSemanticKeys = new Set(
          wordsRef.current.map(
            (w) =>
              `${(w.term || '').trim().toLowerCase()}||${(w.pos || '').trim().toLowerCase()}||${(w.def || '').trim().toLowerCase()}`
          )
        );

        const mergeWordsArray = (rawList: any[]) => {
          let importedCount = 0;
          const merged = [...wordsRef.current];
          rawList.forEach((raw: Partial<Word>, idx: number) => {
            if (!raw || typeof raw !== 'object') return;
            const term = (raw.term || '').trim();
            const def = (raw.def || '').trim();
            if (!term || !def) return;
            const pos = normalizePos(raw.pos);
            const semanticKey = `${term.toLowerCase()}||${pos.toLowerCase()}||${def.toLowerCase()}`;
            const safeId =
              (raw.id && String(raw.id).trim()) ||
              `w-${now}-${Math.random().toString(36).substring(2, 7)}-${idx}`;
            if (!currentIds.has(safeId) && !currentSemanticKeys.has(semanticKey)) {
              currentIds.add(safeId);
              currentSemanticKeys.add(semanticKey);
              merged.unshift({
                id: safeId,
                term,
                pos,
                def,
                defEn: raw.defEn ? String(raw.defEn).trim() : undefined,
                ex: raw.ex ? String(raw.ex).trim() : '',
                category: normalizeCategory(raw.category),
                level: typeof raw.level === 'number' ? raw.level : 0,
                interval: typeof raw.interval === 'number' && raw.interval > 0 ? raw.interval : 1,
                easeFactor: typeof raw.easeFactor === 'number' && raw.easeFactor > 0 ? raw.easeFactor : 2.5,
                timestamp: raw.timestamp || now,
                lastReview: raw.lastReview || now,
                nextReview: raw.nextReview || now + 86400000
              });
              importedCount++;
            }
          });
          return { merged, importedCount };
        };

        // Support top-level array export (e.g., Chrome extension backup)
        if (Array.isArray(data)) {
          const { merged, importedCount } = mergeWordsArray(data);
          wordsRef.current = merged;
          setWords(merged);
          storage.saveLocalWords(merged, user?.uid);
          if (user) {
            storage.saveCloudWordsOnly(merged, user.uid).catch(console.error);
          }
          showToast(`成功匯入 ${importedCount} 個單字${user ? '，已自動同步至雲端資料庫！' : '！'}`);
          return;
        }

        let count = 0;
        let mergedWordsList: Word[] = wordsRef.current;
        let mergedStatsData: DailyStats = dailyStats;
        let mergedSettingsData: AppSettings = settings;
        let mergedArticlesData: Article[] = articlesRef.current;
        let mergedHomeConfigData: HomeConfig = homeConfig;
        let mergedReaderSettingsData = storage.getLocalReaderSettings(user?.uid);

        const rawWords = Array.isArray(data.vocab_data)
          ? data.vocab_data
          : Array.isArray(data.words)
          ? data.words
          : null;

        if (rawWords) {
          const { merged, importedCount } = mergeWordsArray(rawWords);
          count = importedCount;
          mergedWordsList = merged;
          wordsRef.current = merged;
          setWords(merged);
          storage.saveLocalWords(merged, user?.uid);
        }
        if (data.vocab_stats && typeof data.vocab_stats === 'object') {
          const mergedStats = { ...dailyStats, ...data.vocab_stats };
          mergedStatsData = mergedStats;
          setDailyStats(mergedStats);
          storage.saveLocalStats(mergedStats, user?.uid);
        }
        if (data.settings && typeof data.settings === 'object') {
          const { geminiApiKey: importedKey, ...restSettings } = data.settings;
          mergedSettingsData = {
            ...settings,
            ...restSettings,
            geminiApiKey: settings.geminiApiKey || importedKey || ''
          };
          setSettings(mergedSettingsData);
          storage.saveLocalSettings(mergedSettingsData, user?.uid);
        }
        if (Array.isArray(data.articles) && data.articles.length > 0) {
          const { merged: nextArticles, changed: artChanged } = mergeArticleRecords(
            articlesRef.current,
            data.articles,
            undefined
          );
          if (artChanged) {
            mergedArticlesData = nextArticles;
            articlesRef.current = nextArticles;
            setArticles(nextArticles);
            storage.saveLocalArticles(nextArticles, user?.uid);
          }
        }
        if (data.homeConfig && typeof data.homeConfig === 'object') {
          mergedHomeConfigData = { ...homeConfig, ...data.homeConfig };
          setHomeConfig(mergedHomeConfigData);
          saveHomeConfig(mergedHomeConfigData, user?.uid);
        }
        if (data.readerSettings && typeof data.readerSettings === 'object') {
          mergedReaderSettingsData = { ...mergedReaderSettingsData, ...data.readerSettings };
          storage.saveLocalReaderSettings(mergedReaderSettingsData, user?.uid);
        }

        if (user) {
          storage.syncToCloud(
            mergedWordsList,
            mergedStatsData,
            mergedSettingsData,
            mergedArticlesData,
            mergedHomeConfigData,
            mergedReaderSettingsData,
            user.uid
          ).catch(console.error);
        }

        showToast(`成功匯入 ${count} 個單字，已自動同步至雲端資料庫！`);
      } catch (err) {
        showToast('JSON 格式錯誤，請檢查檔案');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    setConfirmConfig({
      isOpen: true,
      title: '清空所有資料',
      message: '確定要清空所有單字庫與學習記錄嗎？本操作無法復原。',
      type: 'danger',
      confirmText: '確定全部清空',
      onConfirm: () => {
        wordsRef.current = [];
        setWords([]);
        setDailyStats({});
        storage.saveLocalWords([], user?.uid);
        storage.saveLocalStats({}, user?.uid);
        if (user) {
          storage.clearCloudWords(user.uid).catch(console.error);
          storage.saveCloudStats({}, user.uid).catch(console.error);
        }
        pruneArticlesSavedTerms(null);
        setConfirmConfig((c) => ({ ...c, isOpen: false }));
        setIsSettingsOpen(false);
        showToast('所有單字與學習記錄已從本地與雲端清空！');
      }
    });
  };

  // Authentication Handlers
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await storage.signInWithGoogle();
      showToast('Google 帳號登入成功！');
    } catch (e: any) {
      console.error('Google login error details:', e);
      const code = e?.code || '';
      const domain = window.location.hostname;

      if (code === 'auth/unauthorized-domain' || (e?.message && e.message.includes('unauthorized-domain'))) {
        setLoginError(`網域未授權：當前網域「${domain}」尚未加入 Firebase 授權名單。\n請至 Firebase 控制台 (Authentication > Settings > Authorized domains) 新增此網域。`);
      } else if (code === 'auth/popup-blocked') {
        setLoginError('瀏覽器封鎖了登入彈跳視窗，請允許開啟彈跳視窗後重試。');
      } else if (code === 'auth/operation-not-allowed') {
        setLoginError('Firebase 控制台尚未啟用 Google 登入提供者。\n請至 Firebase 控制台 > Authentication > Sign-in method 啟用「Google」。');
      } else if (code === 'auth/popup-closed-by-user') {
        // User closed the popup, cancel without heavy error
      } else {
        setLoginError(`登入失敗：${e?.message || '發生未知錯誤，請稍後重試'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAnonymousLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await storage.signInAnonymously();
      showToast('已進入訪客體驗模式！');
    } catch (e: any) {
      console.error('Anonymous login error details:', e);
      const code = e?.code || '';
      if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
        setLoginError('Firebase 控制台尚未啟用「匿名登入 (Anonymous)」提供者。\n\n請前往 Firebase 控制台 (console.firebase.google.com) > Authentication > Sign-in method，將「匿名 (Anonymous)」切換為啟用即可！');
      } else {
        setLoginError(`訪客登入失敗：${e?.message || '請確認網路連線後重試'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLinkGoogle = async () => {
    try {
      await storage.linkWithGoogle();
      showToast('已成功將匿名帳號綁定至 Google！');
    } catch (e: any) {
      console.error('Link Google error details:', e);
      if (e?.code === 'auth/credential-already-in-use') {
        showToast('此 Google 帳號已被其他帳號使用，無法重複連結');
      } else {
        showToast(`帳號綁定失敗：${e?.message || '請稍後重試'}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await storage.signOut();
      wordsRef.current = [];
      articlesRef.current = [];
      setUser(null);
      setWords([]);
      setDailyStats({});
      setArticles([]);
      setSettings(DEFAULT_SETTINGS);
      setHomeConfig(DEFAULT_HOME_CONFIG);
      setCurrentTab('home');
      setIsSettingsOpen(false);
      setCambridgeWord(null);
      setEditModalWord(null);
      setDetailWordGroup(null);
      showToast('已安全登出並清空本機暫存資料');
    } catch (e: any) {
      console.error('Logout error:', e);
      showToast('登出時發生異常');
    }
  };

  const handleManualSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const res = await storage.syncToCloud(
        wordsRef.current,
        dailyStats,
        settings,
        articles,
        homeConfig,
        undefined,
        user.uid
      );
      if (res.success) {
        showToast(`✅ 雲端同步成功！已成功推播 ${res.wordCount} 個單字至雲端`);
      } else {
        showToast(`❌ 同步失敗：${res.error || '請檢查網路連線或 Firebase 權限'}`);
      }
    } catch (err: any) {
      showToast(`❌ 同步異常：${err?.message || '發生未知錯誤'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromCloud = async () => {
    if (!user) return;
    setIsSyncing(true);
    try {
      const cloudData = await storage.syncFromCloud(user.uid);
      if (cloudData) {
        const cloudWords = Array.isArray(cloudData.words) ? cloudData.words : [];
        const { updated, count: decayedCount } = applySRSDecay(cloudWords);
        wordsRef.current = updated;
        setWords(updated);
        storage.saveLocalWords(updated, user.uid);
        if (decayedCount > 0) {
          storage.saveCloudWordsOnly(updated, user.uid).catch(console.error);
        }
        if (cloudData.settings) {
          setSettings(cloudData.settings);
          storage.saveLocalSettings(cloudData.settings, user.uid);
        }
        if (cloudData.stats) {
          setDailyStats(cloudData.stats);
          storage.saveLocalStats(cloudData.stats, user.uid);
        }
        if (cloudData.articles !== undefined) {
          articlesRef.current = cloudData.articles;
          setArticles(cloudData.articles);
          storage.saveLocalArticles(cloudData.articles, user.uid);
        }
        if (cloudData.homeConfig) {
          setHomeConfig(cloudData.homeConfig);
          saveHomeConfig(cloudData.homeConfig, user.uid);
        }
        if (cloudData.readerSettings) {
          storage.saveLocalReaderSettings(cloudData.readerSettings, user.uid);
        }
        showToast(`✅ 成功自雲端同步最新資料（共 ${updated.length} 個單字）！`);
      } else {
        showToast('⚠️ 無法連線至雲端資料庫，請檢查網路連線');
      }
    } catch (err: any) {
      showToast(`❌ 下載失敗：${err?.message || '發生未知錯誤'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // 1. Splash Screen: When verifying authentication on startup
  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/25 mb-4 animate-bounce">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="text-base font-bold text-slate-700 dark:text-slate-200">
          VocabMin
        </div>
        <div className="text-xs text-slate-400 mt-1 animate-pulse">
          正在同步認證狀態...
        </div>
      </div>
    );
  }

  // 2. Login Screen: When user is not authenticated
  if (!user) {
    return (
      <LoginView
        onGoogleLogin={handleGoogleLogin}
        onAnonymousLogin={handleAnonymousLogin}
        isLoggingIn={isLoggingIn}
        loginError={loginError}
        onClearError={() => setLoginError(null)}
        isDarkMode={settings.darkMode}
        onToggleDarkMode={() => handleUpdateSettings({ darkMode: !settings.darkMode })}
      />
    );
  }

  const currentAccent = (settings.accentColor as string) || 'indigo';
  const ambientGlowMap: Record<string, [string, string]> = {
    indigo: ['bg-indigo-300 dark:bg-indigo-900/40', 'bg-purple-300 dark:bg-purple-900/40'],
    ocean: ['bg-sky-300 dark:bg-sky-900/40', 'bg-blue-300 dark:bg-blue-900/40'],
    emerald: ['bg-emerald-300 dark:bg-emerald-900/40', 'bg-teal-300 dark:bg-teal-900/40'],
    sunset: ['bg-rose-300 dark:bg-rose-900/40', 'bg-amber-300 dark:bg-amber-900/40'],
    cyber: ['bg-purple-300 dark:bg-purple-900/40', 'bg-pink-300 dark:bg-pink-900/40'],
    mocha: ['bg-amber-300 dark:bg-amber-900/40', 'bg-orange-300 dark:bg-orange-900/40'],
    rose: ['bg-pink-300 dark:bg-pink-900/40', 'bg-rose-300 dark:bg-rose-900/40']
  };
  const [ambientGlowTop, ambientGlowBottom] = ambientGlowMap[currentAccent] || ambientGlowMap.indigo;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      {/* Decorative ambient background with dynamic theme colors */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none opacity-40 dark:opacity-20 transition-all duration-700">
        <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] ${ambientGlowTop} rounded-full blur-[130px] mix-blend-multiply filter transition-colors duration-700`}></div>
        <div className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] ${ambientGlowBottom} rounded-full blur-[130px] mix-blend-multiply filter transition-colors duration-700`}></div>
      </div>

      {/* Header */}
      <Header
        currentTab={currentTab}
        setTab={setCurrentTab}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onOpenSettings={() => setIsSettingsOpen(true)}
        user={user}
        onLogin={handleGoogleLogin}
        onLogout={handleLogout}
        dueCount={dueWordsCount}
      />

      {/* Main View Router */}
      <main
        className={`flex-1 w-full max-w-7xl mx-auto overflow-y-auto ${
          currentTab === 'reader'
            ? 'px-2.5 sm:px-6 pt-0 pb-24 lg:pb-6'
            : 'p-2.5 sm:p-6 pb-24 lg:pb-6'
        }`}
      >
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center min-h-[50vh] py-16 gap-3">
              <div className="w-9 h-9 border-3 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 animate-pulse">
                載入中...
              </span>
            </div>
          }
        >
        {currentTab === 'home' && (
          <HomeView
            words={words}
            setTab={setCurrentTab}
            onOpenAdd={(term?: string) => {
              setAddModalInitialTerm(term || '');
              setIsAddModalOpen(true);
            }}
            onSelectWord={handleOpenWordDetail}
            settings={settings}
            dueWordsCount={dueWordsCount}
            dailyStats={dailyStats}
            onOpenCambridge={(term) => setCambridgeWord(term)}
            user={user}
            onStartAIChat={(prompt) => {
              const clean = prompt.trim();
              if (clean) {
                setInitialAIPrompt({
                  id: `ai-${Date.now()}`,
                  text: clean
                });
              }
              setCurrentTab('ai');
            }}
            onAddWords={handleAddWords}
            homeConfig={homeConfig}
            isEditMode={isHomeEditMode}
            onToggleEditMode={setIsHomeEditMode}
            onOpenCustomizeHome={() => setIsHomeEditMode(true)}
            onUpdateHomeConfig={handleUpdateHomeConfig}
          />
        )}

        {(currentTab === 'review' || currentTab === 'quiz') && (
          <StudyHubView
            words={words}
            settings={settings}
            initialMode={currentTab === 'quiz' ? 'cloze' : 'choice'}
            onUpdateWordReview={handleUpdateWordReview}
            onBatchUpdateReview={handleBatchUpdateReview}
            onFinishReviewSession={() => {}}
            onRecordQuizActivity={(score) => recordActivity('quizzes', 1)}
            onActiveStudyQuestionChange={setActiveStudyQuestion}
            onBack={() => setCurrentTab('home')}
          />
        )}

        {currentTab === 'list' && (
          <WordListView
            words={words}
            settings={settings}
            onOpenAdd={(term?: string) => {
              setAddModalInitialTerm(term || '');
              setIsAddModalOpen(true);
            }}
            onEditWord={(w) => setEditModalWord(w)}
            onDeleteGroup={handleDeleteWordGroup}
            onDeleteSingleWord={handleDeleteSingleWord}
            onAddWords={handleAddWords}
            onUpdateWordGroup={handleUpdateWordGroup}
            onUpdateSettings={handleUpdateSettings}
            onOpenCambridge={(term) => setCambridgeWord(term)}
            onUpdateTermCategory={handleUpdateTermCategory}
            onBatchUpdateTermsCategory={handleBatchUpdateTermsCategory}
            onAddCategory={handleAddCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
          />
        )}

        {currentTab === 'reader' && (
          <ArticleReaderView
            userUid={user?.uid}
            words={words}
            articles={articles}
            onArticlesChange={handleArticlesChange}
            onAddWords={handleAddWords}
            onOpenCambridge={(term) => setCambridgeWord(term)}
            onBackToHome={() => setCurrentTab('home')}
            initialArticleId={activeReaderArticleId}
            onActiveArticleChange={setActiveReaderArticleId}
            appSettings={settings}
            categories={allCategories}
            onAddCategory={handleAddCategory}
            onRequestConfirm={(config) => {
              setConfirmConfig({
                isOpen: true,
                title: config.title,
                message: config.message,
                type: config.type || 'warning',
                confirmText: config.confirmText || '確定',
                onConfirm: () => {
                  setConfirmConfig((c) => ({ ...c, isOpen: false }));
                  config.onConfirm();
                }
              });
            }}
          />
        )}

        {currentTab === 'ai' && (
          <AIAssistantView
            userUid={user?.uid}
            settings={settings}
            existingWords={words}
            existingArticles={articles}
            dueWordsCount={dueWordsCount}
            dailyStats={dailyStats}
            onAddWords={handleAddWords}
            onUpdateWordGroup={handleUpdateWordGroup}
            onDeleteWordGroup={handleDeleteWordGroup}
            onBatchStandardizeWords={handleBatchStandardizeWords}
            onDeduplicateWords={handleDeduplicateWords}
            onClearAllWords={handleClearAllWords}
            onResetAllMastery={handleResetAllMastery}
            onOpenCambridge={(term) => setCambridgeWord(term)}
            initialPrompt={initialAIPrompt}
            onClearInitialPrompt={() => setInitialAIPrompt(null)}
            onSaveArticle={handleSaveArticle}
            onOpenArticleInReader={handleOpenArticleInReader}
            onClearAllArticles={handleClearAllArticles}
            onDeleteArticle={handleDeleteArticle}
            onNavigateToTab={(tab) => setCurrentTab(tab)}
            onUpdateTermCategory={handleUpdateTermCategory}
            onBatchUpdateTermsCategory={handleBatchUpdateTermsCategory}
            onAddCategory={handleAddCategory}
            onRenameCategory={handleRenameCategory}
            onDeleteCategory={handleDeleteCategory}
            onRequestConfirm={(config) => {
              setConfirmConfig({
                isOpen: true,
                title: config.title,
                message: config.message,
                type: config.type || 'warning',
                confirmText: config.confirmText || '確定',
                onConfirm: () => {
                  setConfirmConfig((c) => ({ ...c, isOpen: false }));
                  config.onConfirm();
                }
              });
            }}
          />
        )}
        </Suspense>
      </main>

      {/* Floating Contextual AI Assistant Orb & Drawer */}
      <FloatingAIAssistant
        userUid={user?.uid}
        currentTab={currentTab}
        words={words}
        articles={articles}
        dueWordsCount={dueWordsCount}
        dailyStats={dailyStats}
        activeReaderArticleId={activeReaderArticleId}
        activeStudyQuestion={activeStudyQuestion}
        activeInspectedWord={editModalWord?.term || detailWordGroup?.term || null}
        onAddWords={handleAddWords}
        onUpdateWordGroup={handleUpdateWordGroup}
        onBatchStandardizeWords={handleBatchStandardizeWords}
        onOpenCambridge={(term) => setCambridgeWord(term)}
        onNavigateToTab={(tab) => setCurrentTab(tab)}
        settings={settings}
        onClearAllArticles={handleClearAllArticles}
        onDeleteArticle={handleDeleteArticle}
        onClearAllWords={handleClearAllWords}
        onDeleteWordGroup={handleDeleteWordGroup}
        onDeduplicateWords={handleDeduplicateWords}
        onResetAllMastery={handleResetAllMastery}
        onSaveArticle={handleSaveArticle}
        onOpenArticleInReader={handleOpenArticleInReader}
        onUpdateTermCategory={handleUpdateTermCategory}
        onBatchUpdateTermsCategory={handleBatchUpdateTermsCategory}
        onAddCategory={handleAddCategory}
        onRenameCategory={handleRenameCategory}
        onDeleteCategory={handleDeleteCategory}
        onRequestConfirm={(config) => {
          setConfirmConfig({
            isOpen: true,
            title: config.title,
            message: config.message,
            type: config.type || 'warning',
            confirmText: config.confirmText || '確定',
            onConfirm: () => {
              setConfirmConfig((c) => ({ ...c, isOpen: false }));
              config.onConfirm();
            }
          });
        }}
      />

      {/* Mobile Bottom Navigation */}
      <MobileNav
        currentTab={currentTab}
        setTab={setCurrentTab}
        dueCount={dueWordsCount}
      />

      {/* Global Modals (Lazy Loaded on Demand) */}
      <Suspense fallback={null}>
        {isAddModalOpen && (
          <AddWordModal
            isOpen={isAddModalOpen}
            onClose={() => {
              setIsAddModalOpen(false);
              setAddModalInitialTerm('');
            }}
            onAddWords={handleAddWords}
            lang={settings.lang}
            existingWords={words}
            initialTerm={addModalInitialTerm}
            categories={allCategories}
            onAddCategory={handleAddCategory}
            apiKey={settings.geminiApiKey}
          />
        )}

        {editModalWord && (
          <EditWordModal
            isOpen={!!editModalWord}
            onClose={() => setEditModalWord(null)}
            word={editModalWord}
            allWords={words}
            onUpdateGroup={handleUpdateWordGroup}
            lang={settings.lang}
            categories={allCategories}
            onAddCategory={handleAddCategory}
            apiKey={settings.geminiApiKey}
          />
        )}

        {currentDetailWordGroup && (
          <WordDetailModal
            group={currentDetailWordGroup}
            isOpen={!!currentDetailWordGroup}
            onClose={() => setDetailWordGroup(null)}
            settings={settings}
            onEditWord={(w) => {
              setDetailWordGroup(null);
              setEditModalWord(w);
            }}
            onDeleteGroup={handleDeleteWordGroup}
            onDeleteSingleWord={handleDeleteSingleWord}
            onAddWords={handleAddWords}
            onUpdateWordGroup={handleUpdateWordGroup}
            onOpenCambridge={(term) => setCambridgeWord(term)}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onOpenAI={() => {
              setIsSettingsOpen(false);
              setCurrentTab('ai');
            }}
            user={user}
            onLogin={handleGoogleLogin}
            onLogout={handleLogout}
            onLinkGoogle={handleLinkGoogle}
            onSyncCloud={handleManualSync}
            onPullCloud={handlePullFromCloud}
            onExportJSON={handleExportJSON}
            onExportCSV={handleExportCSV}
            onImportJSON={handleImportJSON}
            wordsCount={words.length}
            isSyncing={isSyncing}
            onOpenCustomizeHome={() => {
              setIsSettingsOpen(false);
              setCurrentTab('home');
              setIsHomeEditMode(true);
              showToast('🎨 已進入主畫面桌面編輯模式，想要什麼直接拖曳排版！');
            }}
          />
        )}

        {cambridgeWord && (
          <CambridgeModal
            word={cambridgeWord || ''}
            isOpen={!!cambridgeWord}
            onClose={() => setCambridgeWord(null)}
            lang={settings.cambridgeLang ?? 'en'}
          />
        )}
      </Suspense>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        confirmText={confirmConfig.confirmText}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((c) => ({ ...c, isOpen: false }))}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-2.5 rounded-full shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-enter pointer-events-none">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
