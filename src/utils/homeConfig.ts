import { Word } from '../types';

export type WidgetId =
  | 'dueReview'
  | 'quickSearch'
  | 'masteryStats'
  | 'studyPaths'
  | 'recentWords'
  | 'dailyGoal'
  | 'randomWord'
  | 'quoteOfTheDay'
  | 'articleReading'
  | 'quickAdd';

export type HomeAccentColor =
  | 'indigo'
  | 'ocean'
  | 'emerald'
  | 'sunset'
  | 'cyber'
  | 'mocha'
  | 'rose';

export type HomeCardStyle = 'modern' | 'glass' | 'vibrant';

export interface HomeWidgetItem {
  id: WidgetId;
  enabled: boolean;
  width?: 'full' | 'half';
}

export interface HomeConfig {
  accentColor: HomeAccentColor;
  cardStyle: HomeCardStyle;
  widgets: HomeWidgetItem[];
}

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  desc: string;
  category: 'core' | 'review' | 'tools';
  defaultWidth: 'full' | 'half';
}

export const WIDGET_METAS: Record<WidgetId, WidgetMeta> = {
  dueReview: {
    id: 'dueReview',
    title: '今日待複習焦點',
    desc: '顯示待複習單字總量與一鍵啟動複習按鈕',
    category: 'core',
    defaultWidth: 'full'
  },
  quickSearch: {
    id: 'quickSearch',
    title: '智慧搜尋單字庫',
    desc: '即時字庫搜尋、自動補全候選詞與快速新增',
    category: 'core',
    defaultWidth: 'full'
  },
  masteryStats: {
    id: 'masteryStats',
    title: '單字熟練度分佈',
    desc: '精通、熟悉、學習中與陌生四階段進度長條圖',
    category: 'review',
    defaultWidth: 'half'
  },
  studyPaths: {
    id: 'studyPaths',
    title: '核心練習模式路徑',
    desc: '選擇題測驗、挖空填空與文章閱讀的快速捷徑',
    category: 'review',
    defaultWidth: 'half'
  },
  dailyGoal: {
    id: 'dailyGoal',
    title: '今日學習目標與進度',
    desc: '每日目標複習數進度條與連續學習打卡狀態',
    category: 'review',
    defaultWidth: 'half'
  },
  randomWord: {
    id: 'randomWord',
    title: '隨機抽詞翻牌卡',
    desc: '從單字庫隨機抽選單字，即時抽檢記憶成果',
    category: 'tools',
    defaultWidth: 'half'
  },
  recentWords: {
    id: 'recentWords',
    title: '最近收錄單字書架',
    desc: '展示最新收錄的單字卡片，支援朗讀與字典查詢',
    category: 'tools',
    defaultWidth: 'full'
  },
  quoteOfTheDay: {
    id: 'quoteOfTheDay',
    title: '每日英語名言金句',
    desc: '精選勵志金句、語音朗讀與核心重點詞彙解析',
    category: 'tools',
    defaultWidth: 'full'
  },
  articleReading: {
    id: 'articleReading',
    title: '文章閱讀與生詞筆記',
    desc: '沉浸式文章閱讀推薦、生詞紀錄與一鍵跳轉閱讀器',
    category: 'tools',
    defaultWidth: 'full'
  },
  quickAdd: {
    id: 'quickAdd',
    title: '主畫面快速記單字',
    desc: '免開啟彈窗，直接在主畫面一鍵收錄生詞',
    category: 'tools',
    defaultWidth: 'half'
  }
};

export const COLOR_THEMES: Record<
  HomeAccentColor,
  {
    name: string;
    swatch: string;
    primaryGradient: string;
    badgeBg: string;
    badgeText: string;
    borderActive: string;
    textAccent: string;
    ring: string;
    btnClass: string;
    glowBg: string;
  }
> = {
  indigo: {
    name: '經典靛藍 (Indigo)',
    swatch: 'bg-indigo-600',
    primaryGradient: 'from-indigo-600 to-purple-600',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    badgeText: 'text-indigo-600 dark:text-indigo-400',
    borderActive: 'border-indigo-400/80 dark:border-indigo-500/80',
    textAccent: 'text-indigo-600 dark:text-indigo-400',
    ring: 'focus:ring-indigo-500',
    btnClass: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    glowBg: 'from-indigo-50/50 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/10'
  },
  ocean: {
    name: '湛藍海洋 (Ocean)',
    swatch: 'bg-sky-500',
    primaryGradient: 'from-blue-600 to-cyan-500',
    badgeBg: 'bg-sky-50 dark:bg-sky-950/60',
    badgeText: 'text-sky-600 dark:text-sky-400',
    borderActive: 'border-sky-400/80 dark:border-sky-500/80',
    textAccent: 'text-sky-600 dark:text-sky-400',
    ring: 'focus:ring-sky-500',
    btnClass: 'bg-sky-600 hover:bg-sky-700 text-white',
    glowBg: 'from-sky-50/50 to-blue-50/30 dark:from-sky-950/20 dark:to-blue-950/10'
  },
  emerald: {
    name: '翡翠森林 (Emerald)',
    swatch: 'bg-emerald-500',
    primaryGradient: 'from-emerald-600 to-teal-500',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-600 dark:text-emerald-400',
    borderActive: 'border-emerald-400/80 dark:border-emerald-500/80',
    textAccent: 'text-emerald-600 dark:text-emerald-400',
    ring: 'focus:ring-emerald-500',
    btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    glowBg: 'from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10'
  },
  sunset: {
    name: '夕陽珊瑚 (Sunset)',
    swatch: 'bg-rose-500',
    primaryGradient: 'from-rose-500 to-amber-500',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
    badgeText: 'text-rose-600 dark:text-rose-400',
    borderActive: 'border-rose-400/80 dark:border-rose-500/80',
    textAccent: 'text-rose-600 dark:text-rose-400',
    ring: 'focus:ring-rose-500',
    btnClass: 'bg-rose-600 hover:bg-rose-700 text-white',
    glowBg: 'from-rose-50/50 to-amber-50/30 dark:from-rose-950/20 dark:to-amber-950/10'
  },
  cyber: {
    name: '霓虹魅紫 (Cyber)',
    swatch: 'bg-purple-600',
    primaryGradient: 'from-purple-600 to-pink-500',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/60',
    badgeText: 'text-purple-600 dark:text-purple-400',
    borderActive: 'border-purple-400/80 dark:border-purple-500/80',
    textAccent: 'text-purple-600 dark:text-purple-400',
    ring: 'focus:ring-purple-500',
    btnClass: 'bg-purple-600 hover:bg-purple-700 text-white',
    glowBg: 'from-purple-50/50 to-pink-50/30 dark:from-purple-950/20 dark:to-pink-950/10'
  },
  mocha: {
    name: '溫暖琥珀 (Amber)',
    swatch: 'bg-amber-500',
    primaryGradient: 'from-amber-600 to-orange-500',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
    badgeText: 'text-amber-700 dark:text-amber-400',
    borderActive: 'border-amber-400/80 dark:border-amber-500/80',
    textAccent: 'text-amber-600 dark:text-amber-400',
    ring: 'focus:ring-amber-500',
    btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    glowBg: 'from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10'
  },
  rose: {
    name: '優雅薔薇 (Rose)',
    swatch: 'bg-pink-500',
    primaryGradient: 'from-pink-600 to-rose-500',
    badgeBg: 'bg-pink-50 dark:bg-pink-950/60',
    badgeText: 'text-pink-600 dark:text-pink-400',
    borderActive: 'border-pink-400/80 dark:border-pink-500/80',
    textAccent: 'text-pink-600 dark:text-pink-400',
    ring: 'focus:ring-pink-500',
    btnClass: 'bg-pink-600 hover:bg-pink-700 text-white',
    glowBg: 'from-pink-50/50 to-rose-50/30 dark:from-pink-950/20 dark:to-rose-950/10'
  }
};

export const DEFAULT_HOME_CONFIG: HomeConfig = {
  accentColor: 'indigo',
  cardStyle: 'modern',
  widgets: [
    { id: 'dueReview', enabled: true, width: 'full' },
    { id: 'quickSearch', enabled: true, width: 'full' },
    { id: 'masteryStats', enabled: true, width: 'half' },
    { id: 'studyPaths', enabled: true, width: 'half' },
    { id: 'dailyGoal', enabled: true, width: 'half' },
    { id: 'randomWord', enabled: true, width: 'half' },
    { id: 'recentWords', enabled: true, width: 'full' },
    { id: 'articleReading', enabled: true, width: 'full' },
    { id: 'quoteOfTheDay', enabled: true, width: 'full' },
    { id: 'quickAdd', enabled: false, width: 'half' }
  ]
};

const STORAGE_KEY_HOME_CONFIG = 'vocabmin_home_config_v2';

export function loadHomeConfig(): HomeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HOME_CONFIG);
    if (!raw) return DEFAULT_HOME_CONFIG;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_HOME_CONFIG;

    // Ensure all widgets exist even if config was saved with earlier versions
    const existingIds = new Set(parsed.widgets?.map((w: any) => w.id) || []);
    const mergedWidgets: HomeWidgetItem[] = [...(parsed.widgets || [])];

    DEFAULT_HOME_CONFIG.widgets.forEach((def) => {
      if (!existingIds.has(def.id)) {
        mergedWidgets.push(def);
      }
    });

    return {
      accentColor: parsed.accentColor || 'indigo',
      cardStyle: parsed.cardStyle || 'modern',
      widgets: mergedWidgets
    };
  } catch {
    return DEFAULT_HOME_CONFIG;
  }
}

export function saveHomeConfig(config: HomeConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_HOME_CONFIG, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save home config:', e);
  }
}

// Daily Quotes Library for the Quote Widget
export interface DailyQuote {
  quote: string;
  translation: string;
  author: string;
  vocabulary: { word: string; pos: string; def: string };
}

export const DAILY_QUOTES: DailyQuote[] = [
  {
    quote: "Continuous improvement is better than delayed perfection.",
    translation: "持續不斷的改進勝過遲到的完美。",
    author: "Mark Twain",
    vocabulary: { word: "continuous", pos: "adj.", def: "持續不斷的，連續的" }
  },
  {
    quote: "The roots of education are bitter, but the fruit is sweet.",
    translation: "教育的根是苦的，但其果實是甜美的。",
    author: "Aristotle",
    vocabulary: { word: "bitter", pos: "adj.", def: "痛苦的；苦澀的" }
  },
  {
    quote: "Small daily improvements over time lead to stunning results.",
    translation: "持之以恆的微小進步，終將成就驚人的成果。",
    author: "Robin Sharma",
    vocabulary: { word: "stunning", pos: "adj.", def: "令人驚嘆的，極好的" }
  },
  {
    quote: "Knowledge has to be improved, challenged, and increased constantly.",
    translation: "知識必須不斷被改善、挑戰和累積。",
    author: "Peter Drucker",
    vocabulary: { word: "constantly", pos: "adv.", def: "持續地，不斷地" }
  },
  {
    quote: "It does not matter how slowly you go as long as you do not stop.",
    translation: "走得多慢並不重要，只要你不停下腳步。",
    author: "Confucius",
    vocabulary: { word: "matter", pos: "v.", def: "要緊，重要" }
  },
  {
    quote: "Action is the foundational key to all success.",
    translation: "行動是通往所有成功的根本關鍵。",
    author: "Pablo Picasso",
    vocabulary: { word: "foundational", pos: "adj.", def: "基礎的，根本的" }
  },
  {
    quote: "Success is the sum of small efforts, repeated day in and day out.",
    translation: "成功是每日反覆微小努力的總和累積。",
    author: "Robert Collier",
    vocabulary: { word: "effort", pos: "n.", def: "努力，精力" }
  }
];

export interface HomePreset {
  id: string;
  name: string;
  desc: string;
  accentColor: HomeAccentColor;
  cardStyle: HomeCardStyle;
  widgets: HomeWidgetItem[];
}

export const HOME_PRESETS: HomePreset[] = [
  {
    id: 'classic',
    name: '🌟 經典全能',
    desc: '標準豐富配置，包含待複習、搜尋、掌握度統計、路徑捷徑與生詞書架',
    accentColor: 'indigo',
    cardStyle: 'modern',
    widgets: [
      { id: 'dueReview', enabled: true, width: 'full' },
      { id: 'quickSearch', enabled: true, width: 'full' },
      { id: 'masteryStats', enabled: true, width: 'half' },
      { id: 'studyPaths', enabled: true, width: 'half' },
      { id: 'dailyGoal', enabled: true, width: 'half' },
      { id: 'randomWord', enabled: true, width: 'half' },
      { id: 'recentWords', enabled: true, width: 'full' },
      { id: 'quoteOfTheDay', enabled: true, width: 'full' },
      { id: 'quickAdd', enabled: false, width: 'half' }
    ]
  },
  {
    id: 'focus_srs',
    name: '🎯 衝刺複習',
    desc: '專為每日記憶複習打造，突顯今日待複習、每日目標進度與熟練度進度',
    accentColor: 'emerald',
    cardStyle: 'modern',
    widgets: [
      { id: 'dueReview', enabled: true, width: 'full' },
      { id: 'dailyGoal', enabled: true, width: 'half' },
      { id: 'masteryStats', enabled: true, width: 'half' },
      { id: 'studyPaths', enabled: true, width: 'full' },
      { id: 'randomWord', enabled: true, width: 'half' },
      { id: 'quickSearch', enabled: true, width: 'half' },
      { id: 'recentWords', enabled: false, width: 'full' },
      { id: 'quoteOfTheDay', enabled: false, width: 'full' },
      { id: 'quickAdd', enabled: false, width: 'half' }
    ]
  },
  {
    id: 'minimal_speed',
    name: '⚡ 極簡高效',
    desc: '極速直達，僅保留搜尋、待複習卡片與主畫面生詞快速便簽',
    accentColor: 'ocean',
    cardStyle: 'glass',
    widgets: [
      { id: 'quickSearch', enabled: true, width: 'full' },
      { id: 'dueReview', enabled: true, width: 'full' },
      { id: 'quickAdd', enabled: true, width: 'half' },
      { id: 'randomWord', enabled: true, width: 'half' },
      { id: 'masteryStats', enabled: false, width: 'half' },
      { id: 'studyPaths', enabled: false, width: 'half' },
      { id: 'dailyGoal', enabled: false, width: 'half' },
      { id: 'recentWords', enabled: false, width: 'full' },
      { id: 'quoteOfTheDay', enabled: false, width: 'full' }
    ]
  },
  {
    id: 'literary',
    name: '📖 文藝晨讀',
    desc: '結合每日英語金句、最近收錄書架與隨機抽詞翻牌，陶冶語感',
    accentColor: 'rose',
    cardStyle: 'vibrant',
    widgets: [
      { id: 'quoteOfTheDay', enabled: true, width: 'full' },
      { id: 'randomWord', enabled: true, width: 'half' },
      { id: 'recentWords', enabled: true, width: 'half' },
      { id: 'dueReview', enabled: true, width: 'full' },
      { id: 'quickSearch', enabled: true, width: 'full' },
      { id: 'dailyGoal', enabled: false, width: 'half' },
      { id: 'masteryStats', enabled: false, width: 'half' },
      { id: 'studyPaths', enabled: false, width: 'half' },
      { id: 'quickAdd', enabled: false, width: 'half' }
    ]
  }
];

export function getQuoteForToday(): DailyQuote {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24
  );
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}
