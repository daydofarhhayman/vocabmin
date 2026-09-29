export type POS = 'n.' | 'v.' | 'adj.' | 'adv.' | 'phr.' | 'other';

export interface Word {
  id: string;
  term: string;
  pos: POS;
  def: string; // Traditional Chinese definition
  defEn?: string; // English definition (英英釋義)
  ex?: string;
  level: number; // 0: New, 1: Learning, 2: Familiar, 3: Mastered
  interval: number; // Days until next review
  easeFactor: number; // SM-2 ease factor (default 2.5)
  timestamp: number;
  lastReview: number;
  nextReview: number;
}

export interface WordGroup {
  term: string;
  entries: Word[];
  minLevel: number;
  interval: number;
  nextReview: number;
  lastReview: number;
}

export interface DayStat {
  added: number;
  reviewed: number;
  quizzes?: number;
}

export interface DailyStats {
  [dateString: string]: DayStat;
}

export interface AppSettings {
  darkMode: boolean;
  lang: 'zh' | 'en';
  themeStyle: 'glass' | 'simple';
  listViewMode: 'grid' | 'list';
  basicMode: boolean; // Speak on hover or extra TTS buttons
  reviewLimit: number; // Max cards per review session
  showTimerInReview?: boolean; // 是否在複習時顯示計時碼錶
  showFeedbackInReview?: boolean; // 是否在答題後顯示即時評判與速度標籤
  // Backward compatibility optional fields
  mergeReview?: boolean;
  autoPlayAudio?: boolean;
  srsDecayEnabled?: boolean;
}

export type ViewTab = 'home' | 'review' | 'quiz' | 'list' | 'settings' | 'reader' | 'ai';

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ArticleCategory = 'Tech' | 'Science' | 'Story' | 'News' | 'Business' | 'Daily' | 'Custom';

export interface ArticleKeyWord {
  term: string;
  pos: POS;
  def: string;
  defEn?: string;
  level?: CEFRLevel;
  ex?: string;
}

export interface ArticleQuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface SentenceAnalysisData {
  sentence: string;
  translation: string;
  grammarBreakdown: string;
  vocabularyNotes?: { term: string; meaning: string }[];
  learningTip?: string;
  isLoading?: boolean;
  fromCache?: boolean;
  cachedAt?: number;
}

export interface WordAnalysisData {
  term: string;
  pos: POS;
  def: string;
  defEn?: string;
  phonetic?: string;
  ex?: string;
  exZh?: string;
  fromCache?: boolean;
  cachedAt?: number;
}

export interface ArticleGrammarPoint {
  sentence: string;
  structure: string;
  explanation: string;
  grammarType?: string;
}

export interface ArticleChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  highlightedSentence?: string;
  suggestedWords?: Partial<Word>[];
}

export interface Article {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  source?: string;
  level: CEFRLevel;
  category: ArticleCategory;
  content: string; // Paragraphs separated by double newlines
  translationZh?: string; // Paragraphs translated in Traditional Chinese
  summary?: string;
  wordCount: number;
  readTimeMinutes: number;
  savedWordTerms: string[]; // Terms saved from this article
  isRead?: boolean;
  lastReadTimestamp?: number;
  keyVocabulary?: ArticleKeyWord[];
  quiz?: ArticleQuizQuestion[];
  isCustom?: boolean;
  sentenceAnalyses?: Record<string, SentenceAnalysisData>;
  grammarPoints?: ArticleGrammarPoint[];
}

export interface ReaderSettings {
  fontSize: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  fontFamily: 'sans' | 'serif' | 'mono';
  lineSpacing: 'normal' | 'relaxed' | 'loose';
  showBilingual: boolean;
  highlightSavedWords: boolean;
  showSentenceAudio?: boolean;
  showSentenceGrammar?: boolean;
  showParagraphControls?: boolean;
  cleanReadingMode?: boolean;
  speechRate: number;
  voiceURI?: string;
  hideLookupTip?: boolean;
}

export type QuizType = 'meaning' | 'spelling' | 'listening';

export interface QuizQuestion {
  id: string;
  word: Word;
  type: QuizType;
  prompt: string;
  correctAnswer: string;
  options?: string[]; // for multiple choice
}

export interface QuizResult {
  total: number;
  correctCount: number;
  wrongWords: Word[];
}
