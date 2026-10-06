import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Word, WordGroup, DailyStats, AppSettings, ViewTab, POS, Article } from './types';
import { storage, DEFAULT_SETTINGS } from './services/storage';
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

export default function App() {
  // Core Data State
  const [words, setWords] = useState<Word[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeStudyQuestion, setActiveStudyQuestion] = useState<ActiveStudyQuestion | null>(null);

  // Authentication State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
      minLevel,
      interval: avgInterval,
      nextReview: minNextReview,
      lastReview: maxLastReview
    });
  }, [words]);

  const handleUpdateHomeConfig = useCallback((newConfig: HomeConfig) => {
    setHomeConfig(newConfig);
    saveHomeConfig(newConfig);
  }, []);

  const handleResetHomeConfig = useCallback(() => {
    setHomeConfig(DEFAULT_HOME_CONFIG);
    saveHomeConfig(DEFAULT_HOME_CONFIG);
  }, []);

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
      storage.saveCloudArticles(updated).catch(console.error);
    }
  }, [user]);

  const handleOpenArticleInReader = useCallback((article: Article) => {
    const updated = storage.saveArticle(article, user?.uid);
    setArticles(updated);
    if (user) {
      storage.saveCloudArticles(updated).catch(console.error);
    }
    setActiveReaderArticleId(article.id);
    setCurrentTab('reader');
    showToast(`📖 已在閱讀器開啟文章《${article.title}》`);
  }, [user, showToast]);

  const handleSaveArticle = useCallback((article: Article) => {
    const updated = storage.saveArticle(article, user?.uid);
    setArticles(updated);
    if (user) {
      storage.saveCloudArticles(updated).catch(console.error);
    }
    showToast(`📚 已成功收錄文章《${article.title}》至文章閱讀庫！`);
  }, [user, showToast]);

  const handleClearAllArticles = useCallback(() => {
    storage.clearAllArticles(user?.uid);
    setArticles([]);
    if (user) {
      storage.clearCloudArticles().catch(console.error);
    }
    showToast('已清空文章閱讀庫中的所有文章');
  }, [user, showToast]);

  const handleDeleteArticle = useCallback((id: string) => {
    const updated = storage.deleteArticle(id, user?.uid);
    setArticles(updated);
    if (user) {
      storage.deleteCloudArticle(id).catch(console.error);
    }
    showToast('已從文章閱讀庫刪除指定文章');
  }, [user, showToast]);

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

        setSettings(localSettings);
        setDailyStats(localStats);
        setArticles(localArticles);

        const { updated } = applySRSDecay(localWords);
        setWords(updated);

        // 2. Reconcile with cloud database (Firestore is authoritative)
        try {
          const cloudData = await storage.syncFromCloud();
          if (cloudData) {
            setWords(cloudData.words);
            storage.saveLocalWords(cloudData.words, currentUser.uid);

            if (cloudData.articles !== undefined) {
              setArticles(cloudData.articles);
              storage.saveLocalArticles(cloudData.articles, currentUser.uid);
            }
            if (cloudData.stats) {
              setDailyStats(cloudData.stats);
              storage.saveLocalStats(cloudData.stats, currentUser.uid);
            }
            if (cloudData.settings) {
              setSettings(cloudData.settings);
              storage.saveLocalSettings(cloudData.settings, currentUser.uid);
            }
          }
        } catch (syncErr) {
          console.warn('Initial cloud sync error:', syncErr);
        }
      } else {
        // Logged out: Clear all in-memory state completely
        setWords([]);
        setDailyStats({});
        setArticles([]);
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
      const today = new Date().toISOString().split('T')[0];
      setDailyStats((prev) => {
        const current = prev[today] || { added: 0, reviewed: 0, quizzes: 0 };
        const updated = {
          ...prev,
          [today]: {
            ...current,
            [type]: (current[type] || 0) + increment
          }
        };
        storage.saveLocalStats(updated);
        return updated;
      });
    },
    []
  );

  // Settings update handler
  const handleUpdateSettings = useCallback(
    (newSettings: Partial<AppSettings>) => {
      setSettings((prev) => {
        const merged = { ...prev, ...newSettings };
        storage.saveLocalSettings(merged);
        if (user) {
          storage.syncToCloud(words, dailyStats, merged);
        }
        return merged;
      });

      // Synchronize accentColor with homeConfig so the entire app matches
      if (newSettings.accentColor) {
        setHomeConfig((prevHome) => {
          const updatedHome = { ...prevHome, accentColor: newSettings.accentColor as any };
          saveHomeConfig(updatedHome);
          return updatedHome;
        });
      }
    },
    [words, dailyStats, user]
  );

  // Add words (with deduplication against identical term + pos + def)
  const handleAddWords = useCallback(
    (newWordItems: Partial<Word>[]) => {
      const now = Date.now();

      setWords((prev) => {
        // Build duplicate check set from existing words
        const existingKeys = new Set(
          prev.map(
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
          // If already in library, skip adding exact duplicate
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
          return prev;
        }

        const updated = [...created, ...prev];
        storage.saveLocalWords(updated);
        recordActivity('added', created.length);
        showToast(`成功新增 ${created.length} 個單字！`);

        if (user) {
          storage.syncToCloud(updated, dailyStats, settings);
        }
        return updated;
      });
    },
    [dailyStats, settings, user, recordActivity, showToast]
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
    (wordId: string, updates: Partial<Word>) => {
      setWords((prev) => {
        const updated = prev.map((w) => (w.id === wordId ? { ...w, ...updates } : w));
        storage.saveLocalWords(updated);
        return updated;
      });
    },
    []
  );

  // Batch word review updates
  const handleBatchUpdateReview = useCallback(
    (batch: { id: string; data: Partial<Word> }[]) => {
      setWords((prev) => {
        const map = new Map(batch.map((b) => [b.id, b.data]));
        const updated = prev.map((w) => {
          if (map.has(w.id)) {
            return { ...w, ...map.get(w.id)! };
          }
          return w;
        });
        storage.saveLocalWords(updated);
        return updated;
      });
      recordActivity('reviewed', batch.length);
    },
    [recordActivity]
  );

  // Edit word group (update all definitions with same term)
  const handleUpdateWordGroup = useCallback(
    (oldTerm: string, updatedList: Partial<Word>[]) => {
      setWords((prev) => {
        // Remove old entries
        const clean = prev.filter(
          (w) => w.term.trim().toLowerCase() !== oldTerm.trim().toLowerCase()
        );
        const now = Date.now();
        const newEntries: Word[] = updatedList.map((item, idx) => ({
          id: item.id || `w-${now}-${idx}`,
          term: item.term || oldTerm,
          pos: item.pos || 'n.',
          def: item.def || '',
          defEn: item.defEn !== undefined ? item.defEn : undefined,
          ex: item.ex || '',
          level: item.level !== undefined ? item.level : 0,
          interval: item.interval || 1,
          easeFactor: item.easeFactor || 2.5,
          timestamp: item.timestamp || now,
          lastReview: item.lastReview || now,
          nextReview: item.nextReview || now + 86400000
        }));

        const finalWords = [...newEntries, ...clean];
        storage.saveLocalWords(finalWords);
        if (user) {
          storage.syncToCloud(finalWords, dailyStats, settings);
        }
        return finalWords;
      });
      showToast('單字修改成功！');
    },
    [dailyStats, settings, user, showToast]
  );

  // Deduplicate words: merge repeated items with same term and pos/def, keeping highest mastery and SRS stats
  const handleDeduplicateWords = useCallback(() => {
    let originalCount = 0;
    let cleanCount = 0;
    const mergedTermsSet = new Set<string>();

    setWords((prev) => {
      originalCount = prev.length;
      const termMap = new Map<string, Word[]>();

      prev.forEach((w) => {
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
      storage.saveLocalWords(deduplicated);
      if (user) {
        storage.syncToCloud(deduplicated, dailyStats, settings);
      }
      return deduplicated;
    });

    const removedCount = originalCount - cleanCount;
    return {
      originalCount,
      cleanCount,
      removedCount,
      mergedTerms: Array.from(mergedTermsSet)
    };
  }, [dailyStats, settings, user]);

  // Clear all words
  const handleClearAllWords = useCallback(() => {
    let count = 0;
    setWords((prev) => {
      count = prev.length;
      storage.saveLocalWords([]);
      if (user) {
        storage.clearCloudWords().catch((err) => console.error('Cloud clear error:', err));
      }
      return [];
    });
    showToast(`已成功清空單字庫（共清除 ${count} 個單字）`);
    return count;
  }, [user, showToast]);

  // Reset all words mastery to 0
  const handleResetAllMastery = useCallback(() => {
    let count = 0;
    setWords((prev) => {
      count = prev.length;
      const updated = prev.map((w) => ({
        ...w,
        level: 0,
        interval: 1,
        easeFactor: 2.5,
        lastReview: 0,
        nextReview: Date.now()
      }));
      storage.saveLocalWords(updated);
      if (user) {
        storage.saveCloudWordsOnly(updated).catch((err) => console.error('Cloud reset error:', err));
      }
      return updated;
    });
    showToast(`已成功將全庫 ${count} 個單字熟練度重置為完全不熟練 (Level 0)！`);
    return count;
  }, [user, showToast]);

  // Delete word group
  const handleDeleteWordGroup = useCallback(
    (term: string) => {
      setConfirmConfig({
        isOpen: true,
        title: '刪除單字',
        message: `確定要從單字庫中刪除「${term}」及其所有詞性釋義嗎？`,
        type: 'danger',
        confirmText: '確認刪除',
        onConfirm: () => {
          const clean = term.trim().toLowerCase();
          setWords((prev) => {
            const updated = prev.filter(
              (w) => w.term.trim().toLowerCase() !== clean
            );
            storage.saveLocalWords(updated);
            if (user) {
              storage.deleteCloudWordsByTerm(clean).catch((err) =>
                console.error('Cloud delete term error:', err)
              );
            }
            return updated;
          });
          setConfirmConfig((c) => ({ ...c, isOpen: false }));
          showToast(`已刪除「${term}」`);
        }
      });
    },
    [user, showToast]
  );

  // Import / Export
  const handleExportJSON = () => {
    storage.exportJSON(words, dailyStats, settings);
    showToast('備份 JSON 已匯出！');
  };

  const handleExportCSV = () => {
    storage.exportCSV(words);
    showToast('單字 CSV 清單已匯出！');
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        let count = 0;
        if (data.vocab_data && Array.isArray(data.vocab_data)) {
          setWords((prev) => {
            const currentIds = new Set(prev.map((w) => w.id));
            const merged = [...prev];
            data.vocab_data.forEach((w: Word) => {
              if (!currentIds.has(w.id)) {
                merged.unshift(w);
                count++;
              }
            });
            storage.saveLocalWords(merged);
            return merged;
          });
        }
        if (data.vocab_stats) {
          setDailyStats((prev) => {
            const merged = { ...prev, ...data.vocab_stats };
            storage.saveLocalStats(merged);
            return merged;
          });
        }
        showToast(`成功匯入 ${count} 個單字！`);
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
        setWords([]);
        setDailyStats({});
        storage.saveLocalWords([]);
        storage.saveLocalStats({});
        setConfirmConfig((c) => ({ ...c, isOpen: false }));
        setIsSettingsOpen(false);
        showToast('所有資料已清空');
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
      setUser(null);
      setWords([]);
      setDailyStats({});
      setArticles([]);
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
    await storage.syncToCloud(words, dailyStats, settings, articles);
    showToast('已同步最新進度至雲端！');
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
            onFinishReviewSession={(count) => recordActivity('reviewed', count)}
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
            onUpdateSettings={handleUpdateSettings}
            onOpenCambridge={(term) => setCambridgeWord(term)}
          />
        )}

        {currentTab === 'reader' && (
          <ArticleReaderView
            words={words}
            articles={articles}
            onArticlesChange={handleArticlesChange}
            onAddWords={handleAddWords}
            onOpenCambridge={(term) => setCambridgeWord(term)}
            onBackToHome={() => setCurrentTab('home')}
            initialArticleId={activeReaderArticleId}
            onActiveArticleChange={setActiveReaderArticleId}
            appSettings={settings}
          />
        )}

        {currentTab === 'ai' && (
          <AIAssistantView
            settings={settings}
            existingWords={words}
            existingArticles={articles}
            onAddWords={handleAddWords}
            onUpdateWordGroup={handleUpdateWordGroup}
            onDeleteWordGroup={handleDeleteWordGroup}
            onBatchStandardizeWords={(updatedList) => {
              setWords((prev) => {
                const updateByTerm = new Map(
                  updatedList.map((u) => [(u.term || '').trim().toLowerCase(), u])
                );
                const merged = prev.map((w) => {
                  const u = updateByTerm.get((w.term || '').trim().toLowerCase());
                  if (u) {
                    return {
                      ...w,
                      pos: u.pos || w.pos,
                      def: u.def || w.def,
                      defEn: u.defEn !== undefined ? u.defEn : w.defEn,
                      ex: u.ex !== undefined ? u.ex : w.ex
                    };
                  }
                  return w;
                });
                storage.saveLocalWords(merged);
                if (user) {
                  storage.saveCloudWordsOnly(merged).catch(console.error);
                }
                return merged;
              });
              showToast('成功完成單字庫標準化更新！');
            }}
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
        currentTab={currentTab}
        words={words}
        articles={articles}
        dueWordsCount={dueWordsCount}
        dailyStats={dailyStats}
        activeReaderArticleId={activeReaderArticleId}
        activeStudyQuestion={activeStudyQuestion}
        activeInspectedWord={editModalWord?.term || detailWordGroup?.term || null}
        onAddWords={handleAddWords}
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
          />
        )}

        {detailWordGroup && (
          <WordDetailModal
            group={detailWordGroup}
            isOpen={!!detailWordGroup}
            onClose={() => setDetailWordGroup(null)}
            settings={settings}
            onEditWord={(w) => {
              setDetailWordGroup(null);
              setEditModalWord(w);
            }}
            onDeleteGroup={handleDeleteWordGroup}
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
