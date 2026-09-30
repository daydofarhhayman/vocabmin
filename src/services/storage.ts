import { Word, DailyStats, AppSettings, POS, Article, ReaderSettings, SentenceAnalysisData, WordAnalysisData } from '../types';
import { DEFAULT_ARTICLES } from '../utils/defaultArticles';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';

const STORAGE_KEYS = {
  WORDS: 'vocabmin_words_v3',
  STATS: 'vocabmin_stats_v3',
  SETTINGS: 'vocabmin_settings_v3',
  ARTICLES: 'vocabmin_articles_v1',
  READER_SETTINGS: 'vocabmin_reader_settings_v1',
  SENTENCE_ANALYSES: 'vocabmin_sentence_analyses_v1',
  WORD_ANALYSES: 'vocabmin_word_analyses_v1'
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 'lg',
  fontFamily: 'serif',
  lineSpacing: 'relaxed',
  showBilingual: false,
  highlightSavedWords: true,
  showSentenceAudio: true,
  showSentenceGrammar: true,
  showParagraphControls: true,
  cleanReadingMode: false,
  speechRate: 1.0,
  hideLookupTip: false
};

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  lang: 'zh',
  themeStyle: 'glass',
  listViewMode: 'grid',
  basicMode: true,
  reviewLimit: 30,
  showTimerInReview: true,
  showFeedbackInReview: true
};

// Initialize Firebase with fallback tolerance
let firebaseAuth: any = null;
let firestoreDb: any = null;
let googleProvider: any = null;

try {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBQ7hfoJkvMNRT4qPoSz5CyJ2KisOAYXSA",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "vocabmin-app.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "vocabmin-app",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "vocabmin-app.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "995953552362",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:995953552362:web:2b36cd803765a622bca093",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-TLX1STZPB3"
  };

  if (firebaseConfig.apiKey) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    firestoreDb = getFirestore(app);
    firebaseAuth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  }
} catch (e) {
  console.warn('Firebase initialization skipped or failed:', e);
}

export class StorageService {
  private currentUser: User | null = null;
  private authListener: ((user: User | null) => void) | null = null;

  constructor() {
    this.initAuth();
  }

  private initAuth() {
    if (firebaseAuth) {
      onAuthStateChanged(firebaseAuth, (user) => {
        this.currentUser = user;
        if (this.authListener) {
          this.authListener(user);
        }
      });
    }
  }

  public onAuthChanged(listener: (user: User | null) => void): () => void {
    this.authListener = listener;
    listener(this.currentUser);
    return () => {
      this.authListener = null;
    };
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public async signInWithGoogle(): Promise<User> {
    if (!firebaseAuth || !googleProvider) {
      throw new Error('Firebase Auth 尚未初始化');
    }
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    this.currentUser = result.user;
    return result.user;
  }

  public async signOut(): Promise<void> {
    if (firebaseAuth) {
      await signOut(firebaseAuth);
      this.currentUser = null;
    }
  }

  // Local Storage Methods
  public getLocalWords(): Word[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORDS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
      return [];
    } catch {
      return [];
    }
  }

  public saveLocalWords(words: Word[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(words));
    } catch (e) {
      console.error('Failed to save words locally:', e);
    }
  }

  public getLocalStats(): DailyStats {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STATS);
      if (data) return JSON.parse(data);
      const today = new Date().toISOString().split('T')[0];
      const initial: DailyStats = {
        [today]: { added: 0, reviewed: 0, quizzes: 0 }
      };
      localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(initial));
      return initial;
    } catch {
      return {};
    }
  }

  public saveLocalStats(stats: DailyStats): void {
    try {
      localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
    } catch (e) {
      console.error('Failed to save stats locally:', e);
    }
  }

  public getLocalSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (data) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }

  public saveLocalSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings locally:', e);
    }
  }

  // Articles & Reader Storage Methods
  public getLocalArticles(): Article[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ARTICLES);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      // Initialize with default curated articles on first load
      localStorage.setItem(STORAGE_KEYS.ARTICLES, JSON.stringify(DEFAULT_ARTICLES));
      return DEFAULT_ARTICLES;
    } catch {
      return [];
    }
  }

  public clearAllArticles(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ARTICLES, JSON.stringify([]));
    } catch (e) {
      console.error('Failed to clear articles locally:', e);
    }
  }

  public saveLocalArticles(articles: Article[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ARTICLES, JSON.stringify(articles));
    } catch (e) {
      console.error('Failed to save articles locally:', e);
    }
  }

  public saveArticle(article: Article): Article[] {
    const list = this.getLocalArticles();
    const idx = list.findIndex((a) => a.id === article.id);
    let updated: Article[];
    if (idx >= 0) {
      updated = [...list];
      updated[idx] = article;
    } else {
      updated = [article, ...list];
    }
    this.saveLocalArticles(updated);
    return updated;
  }

  public deleteArticle(id: string): Article[] {
    const list = this.getLocalArticles();
    const updated = list.filter((a) => a.id !== id);
    this.saveLocalArticles(updated);
    return updated;
  }

  public getLocalReaderSettings(): ReaderSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.READER_SETTINGS);
      if (data) {
        return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(data) };
      }
    } catch {}
    return { ...DEFAULT_READER_SETTINGS };
  }

  public saveLocalReaderSettings(settings: ReaderSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.READER_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save reader settings locally:', e);
    }
  }

  public getLocalSentenceAnalyses(): Record<string, SentenceAnalysisData> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SENTENCE_ANALYSES);
      if (data) {
        return JSON.parse(data);
      }
    } catch {}
    return {};
  }

  public saveSentenceAnalysis(sentence: string, analysis: SentenceAnalysisData): void {
    try {
      const all = this.getLocalSentenceAnalyses();
      const cleanKey = sentence.trim().toLowerCase();
      all[cleanKey] = {
        ...analysis,
        cachedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEYS.SENTENCE_ANALYSES, JSON.stringify(all));
    } catch (e) {
      console.error('Failed to save sentence analysis locally:', e);
    }
  }

  public getLocalWordAnalyses(): Record<string, WordAnalysisData> {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WORD_ANALYSES);
      if (data) {
        return JSON.parse(data);
      }
    } catch {}
    return {};
  }

  public saveWordAnalysis(term: string, analysis: WordAnalysisData): void {
    try {
      const all = this.getLocalWordAnalyses();
      const cleanKey = term.trim().toLowerCase();
      all[cleanKey] = {
        ...analysis,
        cachedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEYS.WORD_ANALYSES, JSON.stringify(all));
    } catch (e) {
      console.error('Failed to save word analysis locally:', e);
    }
  }

  // Cloud Synchronization Methods
  public async syncFromCloud(): Promise<{ words?: Word[]; stats?: DailyStats; settings?: AppSettings } | null> {
    if (!this.currentUser || !firestoreDb) return null;
    const uid = this.currentUser.uid;

    try {
      // 0. Check meta to determine if user has synced before
      const metaSnap = await getDoc(doc(firestoreDb, 'users', uid, 'data', 'meta'));
      const hasSyncedBefore = metaSnap.exists();

      // 1. Settings
      let cloudSettings: AppSettings | undefined;
      const settingsSnap = await getDoc(doc(firestoreDb, 'users', uid, 'data', 'settings'));
      if (settingsSnap.exists()) {
        cloudSettings = { ...DEFAULT_SETTINGS, ...settingsSnap.data() } as AppSettings;
      }

      // 2. Stats
      let cloudStats: DailyStats | undefined;
      const statsSnap = await getDoc(doc(firestoreDb, 'users', uid, 'data', 'stats'));
      if (statsSnap.exists()) {
        cloudStats = statsSnap.data() as DailyStats;
      }

      // 3. Words
      let cloudWords: Word[] | undefined;
      const wordsSnap = await getDocs(collection(firestoreDb, 'users', uid, 'words'));
      if (!wordsSnap.empty) {
        cloudWords = [];
        wordsSnap.forEach((docSnap) => cloudWords!.push(docSnap.data() as Word));
        cloudWords.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      } else if (hasSyncedBefore) {
        // User has a cloud database profile and intentionally has 0 words in the library!
        cloudWords = [];
      }

      return {
        words: cloudWords,
        stats: cloudStats,
        settings: cloudSettings
      };
    } catch (e) {
      console.error('Error syncing from cloud:', e);
      return null;
    }
  }

  // Full reconciliation: upserts active items AND removes deleted items from Firestore
  public async syncToCloud(words: Word[], stats: DailyStats, settings: AppSettings): Promise<void> {
    if (!this.currentUser || !firestoreDb) return;
    const uid = this.currentUser.uid;

    try {
      // 1. Settings & Stats & Meta
      await setDoc(doc(firestoreDb, 'users', uid, 'data', 'settings'), settings);
      await setDoc(doc(firestoreDb, 'users', uid, 'data', 'stats'), stats);
      await setDoc(doc(firestoreDb, 'users', uid, 'data', 'meta'), {
        hasSynced: true,
        wordCount: words.length,
        lastSyncedAt: Date.now()
      });

      // 2. Words reconciliation: delete obsolete docs, upsert active docs
      const existingWordsSnap = await getDocs(collection(firestoreDb, 'users', uid, 'words'));
      const activeWordIds = new Set(words.map((w) => w.id));

      const obsoleteWordRefs: any[] = [];
      existingWordsSnap.forEach((docSnap) => {
        if (!activeWordIds.has(docSnap.id)) {
          obsoleteWordRefs.push(docSnap.ref);
        }
      });

      // Batch delete obsolete words
      for (let i = 0; i < obsoleteWordRefs.length; i += 400) {
        const batch = writeBatch(firestoreDb);
        const chunk = obsoleteWordRefs.slice(i, i + 400);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      // Batch upsert active words
      for (let i = 0; i < words.length; i += 400) {
        const batch = writeBatch(firestoreDb);
        const chunk = words.slice(i, i + 400);
        chunk.forEach((w) => {
          batch.set(doc(firestoreDb, 'users', uid, 'words', w.id), w);
        });
        await batch.commit();
      }
    } catch (e) {
      console.error('Failed to sync to cloud:', e);
    }
  }

  // Direct Cloud Database Mutations (Immediate Firestore Execution)
  public async clearCloudWords(): Promise<void> {
    if (!this.currentUser || !firestoreDb) return;
    const uid = this.currentUser.uid;

    try {
      const snap = await getDocs(collection(firestoreDb, 'users', uid, 'words'));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(firestoreDb);
        const chunk = docs.slice(i, i + 400);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await setDoc(doc(firestoreDb, 'users', uid, 'data', 'meta'), {
        hasSynced: true,
        wordCount: 0,
        lastClearedAt: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to clear cloud words:', e);
    }
  }

  public async deleteCloudWordsByTerm(term: string): Promise<void> {
    if (!this.currentUser || !firestoreDb) return;
    const uid = this.currentUser.uid;
    const clean = term.trim().toLowerCase();

    try {
      const snap = await getDocs(collection(firestoreDb, 'users', uid, 'words'));
      const toDelete: any[] = [];
      snap.forEach((d) => {
        const data = d.data() as Word;
        if (data.term && data.term.trim().toLowerCase() === clean) {
          toDelete.push(d.ref);
        }
      });
      for (let i = 0; i < toDelete.length; i += 400) {
        const batch = writeBatch(firestoreDb);
        const chunk = toDelete.slice(i, i + 400);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
    } catch (e) {
      console.error('Failed to delete cloud words by term:', e);
    }
  }

  public async saveCloudWordsOnly(words: Word[]): Promise<void> {
    if (!this.currentUser || !firestoreDb) return;
    const uid = this.currentUser.uid;

    try {
      const existingWordsSnap = await getDocs(collection(firestoreDb, 'users', uid, 'words'));
      const activeWordIds = new Set(words.map((w) => w.id));

      const obsoleteRefs: any[] = [];
      existingWordsSnap.forEach((docSnap) => {
        if (!activeWordIds.has(docSnap.id)) {
          obsoleteRefs.push(docSnap.ref);
        }
      });

      for (let i = 0; i < obsoleteRefs.length; i += 400) {
        const batch = writeBatch(firestoreDb);
        const chunk = obsoleteRefs.slice(i, i + 400);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      for (let i = 0; i < words.length; i += 400) {
        const batch = writeBatch(firestoreDb);
        const chunk = words.slice(i, i + 400);
        chunk.forEach((w) => {
          batch.set(doc(firestoreDb, 'users', uid, 'words', w.id), w);
        });
        await batch.commit();
      }

      await setDoc(doc(firestoreDb, 'users', uid, 'data', 'meta'), {
        hasSynced: true,
        wordCount: words.length,
        lastSyncedAt: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to save cloud words only:', e);
    }
  }

  // Safe Export JSON without memory leak
  public exportJSON(words: Word[], stats: DailyStats, settings: AppSettings): void {
    const backup = {
      vocab_data: words,
      vocab_stats: stats,
      settings: settings,
      version: '7.2-react',
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabmin_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Free memory immediately
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Safe Export CSV without memory leak
  public exportCSV(words: Word[]): void {
    const headers = ['Word', 'POS', 'Chinese Definition', 'English Definition', 'Example', 'Level', 'Interval'];
    const rows = words.map((w) => [
      `"${(w.term || '').replace(/"/g, '""')}"`,
      `"${(w.pos || 'n.').replace(/"/g, '""')}"`,
      `"${(w.def || '').replace(/"/g, '""')}"`,
      `"${(w.defEn || '').replace(/"/g, '""')}"`,
      `"${(w.ex || '').replace(/"/g, '""')}"`,
      w.level || 0,
      w.interval || 1
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabmin_words_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Bulk parser for CSV and TSV (Excel paste)
  public parseBulkText(text: string): { added: Word[]; skipped: number; invalid: number } {
    const lines = text.split(/\r?\n/);
    const result: Word[] = [];
    let skipped = 0;
    let invalid = 0;

    const detectPOS = (str: string): POS => {
      if (!str) return 'n.';
      const clean = str.toLowerCase().replace(/[^a-z]/g, '');
      if (clean === 'n' || clean === 'noun') return 'n.';
      if (clean === 'v' || clean === 'verb') return 'v.';
      if (clean === 'adj' || clean === 'adjective') return 'adj.';
      if (clean === 'adv' || clean === 'adverb') return 'adv.';
      if (clean === 'phr' || clean === 'phrase') return 'phr.';
      return 'other';
    };

    const parseLine = (line: string): string[] => {
      if (line.includes('\t') && !line.includes('","')) {
        return line.split('\t').map((s) => s.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      }
      const row: string[] = [];
      let current = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuote && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuote = !inQuote;
          }
        } else if (c === ',' && !inQuote) {
          row.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
      row.push(current.trim());
      return row;
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (index === 0 && (trimmed.toLowerCase().includes('word,pos') || trimmed.toLowerCase().includes('word\tpos'))) {
        return; // skip header
      }

      const cols = parseLine(trimmed);
      if (cols.length < 2) {
        invalid++;
        return;
      }

      const term = cols[0];
      let pos: POS = 'n.';
      let def = '';
      let ex = '';
      let level = 0;

      if (cols.length >= 5) {
        pos = detectPOS(cols[1]);
        def = cols[2];
        ex = cols[3];
        level = parseInt(cols[4]) || 0;
      } else if (cols.length === 4) {
        pos = detectPOS(cols[1]);
        def = cols[2];
        ex = cols[3];
      } else if (cols.length === 3) {
        const p = detectPOS(cols[1]);
        if (p !== 'other' || cols[1].length <= 5) {
          pos = p;
          def = cols[2];
        } else {
          def = cols[1];
          ex = cols[2];
        }
      } else {
        def = cols[1];
      }

      if (term && def) {
        const now = Date.now();
        const id = 'w-' + now + '-' + Math.random().toString(36).substring(2, 7) + '-' + index;
        result.push({
          id,
          term,
          pos,
          def,
          ex,
          level: Math.min(3, Math.max(0, level)),
          interval: 1,
          easeFactor: 2.5,
          timestamp: now,
          lastReview: now,
          nextReview: now + 86400000
        });
      } else {
        invalid++;
      }
    });

    return { added: result, skipped, invalid };
  }
}

export const storage = new StorageService();
