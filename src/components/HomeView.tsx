import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  GraduationCap,
  Sparkles,
  List,
  Search,
  Volume2,
  Clock,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  BookMarked,
  Target,
  Dices,
  BookOpen,
  PenTool,
  Palette,
  Quote,
  Flame,
  Check,
  ChevronRight,
  X,
  GripVertical,
  Columns2,
  Maximize2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Sliders,
  Layers,
  Wand2,
  Zap,
  Calendar,
  AlertCircle,
  Timer,
  Compass,
  Play,
  Pause
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Word, ViewTab, AppSettings, DailyStats, POS } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { tts } from '../services/tts';
import { storage } from '../services/storage';
import {
  getWordDisplayDef,
  generateSafeQuizOptions,
  checkPolysemyAnswerMatch
} from '../utils/wordLang';
import { User } from 'firebase/auth';
import {
  HomeConfig,
  loadHomeConfig,
  saveHomeConfig,
  COLOR_THEMES,
  DEFAULT_HOME_CONFIG,
  getQuoteForToday,
  getRootForToday,
  EtymologyRoot,
  HomeCardStyle,
  WIDGET_METAS,
  WidgetId,
  HOME_PRESETS,
  HomeAccentColor,
  HomeWidgetItem
} from '../utils/homeConfig';
import { WidgetGalleryDrawer } from './WidgetGalleryDrawer';

interface HomeViewProps {
  words: Word[];
  setTab: (tab: ViewTab) => void;
  onOpenAdd: () => void;
  onSelectWord: (word: Word) => void;
  settings: AppSettings;
  dueWordsCount: number;
  dailyStats?: DailyStats;
  onOpenCambridge?: (term: string) => void;
  user?: User | null;
  onStartAIChat?: (prompt: string) => void;
  onAddWords?: (newWords: Partial<Word>[]) => void;
  homeConfig?: HomeConfig;
  onOpenCustomizeHome?: () => void;
  onUpdateHomeConfig?: (newConfig: HomeConfig) => void;
  isEditMode?: boolean;
  onToggleEditMode?: (mode: boolean) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  words,
  setTab,
  onOpenAdd,
  onSelectWord,
  settings,
  dueWordsCount,
  dailyStats,
  onOpenCambridge,
  user,
  onStartAIChat,
  onAddWords,
  homeConfig: propHomeConfig,
  onOpenCustomizeHome,
  onUpdateHomeConfig,
  isEditMode: propIsEditMode,
  onToggleEditMode
}) => {
  const t = TRANSLATIONS[settings.lang];
  const [searchTerm, setSearchTerm] = useState('');

  // Home Screen Customization Configuration
  const [localHomeConfig, setLocalHomeConfig] = useState<HomeConfig>(() => loadHomeConfig());
  const [internalEditMode, setInternalEditMode] = useState(false);
  const [isWidgetGalleryOpen, setIsWidgetGalleryOpen] = useState(false);

  // Drag and drop state for live reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync prop changes
  useEffect(() => {
    if (propHomeConfig) {
      setLocalHomeConfig(propHomeConfig);
    }
  }, [propHomeConfig]);

  const homeConfig = propHomeConfig || localHomeConfig;

  // Edit Mode state
  const isEditMode = propIsEditMode !== undefined ? propIsEditMode : internalEditMode;
  const setIsEditMode = (mode: boolean) => {
    setInternalEditMode(mode);
    if (onToggleEditMode) {
      onToggleEditMode(mode);
    }
  };

  const handleUpdateHomeConfig = (newConfig: HomeConfig) => {
    setLocalHomeConfig(newConfig);
    saveHomeConfig(newConfig);
    if (onUpdateHomeConfig) {
      onUpdateHomeConfig(newConfig);
    }
  };

  const handleResetHomeConfig = () => {
    setLocalHomeConfig(DEFAULT_HOME_CONFIG);
    saveHomeConfig(DEFAULT_HOME_CONFIG);
    if (onUpdateHomeConfig) {
      onUpdateHomeConfig(DEFAULT_HOME_CONFIG);
    }
  };

  const currentTheme = COLOR_THEMES[homeConfig.accentColor] || COLOR_THEMES.indigo;

  // Daily target setting (stored locally)
  const [dailyGoalTarget, setDailyGoalTarget] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('vocabmin_daily_target');
      return saved ? parseInt(saved, 10) : 15;
    } catch {
      return 15;
    }
  });

  const handleUpdateDailyTarget = (newTarget: number) => {
    const val = Math.max(5, Math.min(100, newTarget));
    setDailyGoalTarget(val);
    try {
      localStorage.setItem('vocabmin_daily_target', val.toString());
    } catch {}
  };

  // Random Word Widget State
  const [randomWordIndex, setRandomWordIndex] = useState<number>(0);
  const [isRandomRevealed, setIsRandomRevealed] = useState(false);

  useEffect(() => {
    if (words.length > 0) {
      setRandomWordIndex(Math.floor(Math.random() * words.length));
      setIsRandomRevealed(false);
    }
  }, [words.length]);

  const handleDrawRandomWord = () => {
    if (!words.length) return;
    const nextIndex = Math.floor(Math.random() * words.length);
    setRandomWordIndex(nextIndex);
    setIsRandomRevealed(false);
  };

  // Quick Add Widget State
  const [quickTerm, setQuickTerm] = useState('');
  const [quickDef, setQuickDef] = useState('');
  const [quickPos, setQuickPos] = useState<POS>('n.');
  const [quickAddSuccess, setQuickAddSuccess] = useState(false);

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTerm = quickTerm.trim();
    const cleanDef = quickDef.trim();
    if (!cleanTerm || !cleanDef) return;

    if (onAddWords) {
      onAddWords([
        {
          term: cleanTerm,
          def: cleanDef,
          pos: quickPos,
          level: 0,
          interval: 1,
          easeFactor: 2.5
        }
      ]);
    }

    setQuickTerm('');
    setQuickDef('');
    setQuickAddSuccess(true);
    setTimeout(() => setQuickAddSuccess(false), 2500);
  };

  // Speed Quiz Widget State & Logic
  const [speedQuizTargetWord, setSpeedQuizTargetWord] = useState<Word | null>(null);
  const [speedQuizOptions, setSpeedQuizOptions] = useState<
    { text: string; isCorrect: boolean; isAcceptable?: boolean }[]
  >([]);
  const [speedQuizSelectedIdx, setSpeedQuizSelectedIdx] = useState<number | null>(null);
  const [speedQuizAnswered, setSpeedQuizAnswered] = useState(false);
  const [speedQuizScore, setSpeedQuizScore] = useState(0);

  const initSpeedQuiz = () => {
    if (!words.length) {
      setSpeedQuizTargetWord(null);
      setSpeedQuizOptions([]);
      setSpeedQuizSelectedIdx(null);
      setSpeedQuizAnswered(false);
      return;
    }

    const validWords = words.filter((w) => w.def && w.def.trim().length > 0);
    const pool = validWords.length > 0 ? validWords : words;
    const target = pool[Math.floor(Math.random() * pool.length)];

    const safeOpts = generateSafeQuizOptions(target, pool, settings.lang);
    const options = safeOpts.options.map((text, idx) => ({
      text,
      isCorrect: idx === safeOpts.correctOptionIndex,
      isAcceptable: safeOpts.acceptableOptionIndices.includes(idx)
    }));

    setSpeedQuizTargetWord(target);
    setSpeedQuizOptions(options);
    setSpeedQuizSelectedIdx(null);
    setSpeedQuizAnswered(false);
  };

  useEffect(() => {
    initSpeedQuiz();
  }, [words.length]);

  const handleSelectSpeedQuizOption = (idx: number) => {
    if (speedQuizAnswered || !speedQuizTargetWord) return;
    setSpeedQuizSelectedIdx(idx);
    setSpeedQuizAnswered(true);

    const chosen = speedQuizOptions[idx];
    let isCorrect = !!(chosen?.isCorrect || chosen?.isAcceptable);

    if (!isCorrect && chosen?.text) {
      const secMatch = checkPolysemyAnswerMatch(speedQuizTargetWord, chosen.text, words, settings.lang);
      if (secMatch) {
        isCorrect = true;
        setSpeedQuizOptions((prev) =>
          prev.map((opt, i) => (i === idx ? { ...opt, isAcceptable: true } : opt))
        );
      }
    }

    if (isCorrect) {
      setSpeedQuizScore((prev) => prev + 1);
      tts.speak(speedQuizTargetWord.term);
      try {
        confetti({ particleCount: 20, spread: 50 });
      } catch {}
    }
  };

  // Pomodoro Timer Widget State & Logic
  const [pomoPresetMinutes, setPomoPresetMinutes] = useState<number>(25);
  const [pomoSecondsLeft, setPomoSecondsLeft] = useState<number>(25 * 60);
  const [pomoIsActive, setPomoIsActive] = useState<boolean>(false);
  const [pomoSessionsCompleted, setPomoSessionsCompleted] = useState<number>(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const saved = localStorage.getItem(`vocabmin_pomo_${today}`);
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (pomoIsActive && pomoSecondsLeft > 0) {
      timer = setInterval(() => {
        setPomoSecondsLeft((prev) => {
          if (prev <= 1) {
            setPomoIsActive(false);
            const nextCompleted = pomoSessionsCompleted + 1;
            setPomoSessionsCompleted(nextCompleted);
            try {
              const today = new Date().toISOString().split('T')[0];
              localStorage.setItem(`vocabmin_pomo_${today}`, nextCompleted.toString());
              confetti({ particleCount: 40, spread: 70 });
            } catch {}
            return pomoPresetMinutes * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [pomoIsActive, pomoSecondsLeft, pomoPresetMinutes, pomoSessionsCompleted]);

  const handleSwitchPomoPreset = (mins: number) => {
    setPomoIsActive(false);
    setPomoPresetMinutes(mins);
    setPomoSecondsLeft(mins * 60);
  };

  const handleTogglePomo = () => {
    setPomoIsActive((prev) => !prev);
  };

  const handleResetPomo = () => {
    setPomoIsActive(false);
    setPomoSecondsLeft(pomoPresetMinutes * 60);
  };

  // 7-Day Streak Calendar Calculation
  const weekCalendarDays = useMemo(() => {
    const days: {
      dateStr: string;
      dayLabel: string;
      dateNum: number;
      isToday: boolean;
      isCompleted: boolean;
      count: number;
    }[] = [];

    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const stat = dailyStats?.[dateStr];
      const count = (stat?.reviewed || 0) + (stat?.added || 0) + (stat?.quizzes || 0);
      const isCompleted = count > 0;
      const isToday = i === 0;

      const weekdayNamesZh = ['日', '一', '二', '三', '四', '五', '六'];
      const weekdayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayLabel = settings.lang === 'zh' ? weekdayNamesZh[d.getDay()] : weekdayNamesEn[d.getDay()];

      days.push({
        dateStr,
        dayLabel,
        dateNum: d.getDate(),
        isToday,
        isCompleted,
        count
      });
    }

    return days;
  }, [dailyStats, settings.lang]);

  // Stumble Weak Words (Lvl 0 and 1)
  const stumbleWordsList = useMemo(() => {
    const weak = words.filter((w) => (w.level || 0) <= 1);
    return weak.slice(0, 3);
  }, [words]);

  // Root of the day
  const rootData = useMemo(() => getRootForToday(), []);

  // Level counts
  const levelCounts = useMemo(() => {
    const counts = [0, 0, 0, 0];
    words.forEach((w) => {
      const lvl = Math.min(3, Math.max(0, w.level || 0));
      counts[lvl]++;
    });
    return counts;
  }, [words]);

  // Overall Mastery rate
  const masteryPercentage = useMemo(() => {
    if (!words.length) return 0;
    const score =
      levelCounts[3] * 1.0 + levelCounts[2] * 0.7 + levelCounts[1] * 0.35 + levelCounts[0] * 0.0;
    return Math.round((score / words.length) * 100);
  }, [words.length, levelCounts]);

  // Search suggestions
  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return words
      .filter(
        (w) =>
          w.term.toLowerCase().includes(q) ||
          w.def.toLowerCase().includes(q) ||
          (w.defEn && w.defEn.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [searchTerm, words]);

  // Today's stats & streak
  const todayKey = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayStat = dailyStats?.[todayKey] || { added: 0, reviewed: 0, quizzes: 0 };

  // Calculate learning streak
  const streakDays = useMemo(() => {
    if (!dailyStats) return 1;
    let count = 0;
    const date = new Date();

    for (let i = 0; i < 30; i++) {
      const dKey = date.toISOString().split('T')[0];
      const s = dailyStats[dKey];
      if (s && (s.reviewed > 0 || s.added > 0 || (s.quizzes || 0) > 0)) {
        count++;
        date.setDate(date.getDate() - 1);
      } else {
        if (i === 0) {
          date.setDate(date.getDate() - 1);
          continue;
        }
        break;
      }
    }
    return Math.max(1, count);
  }, [dailyStats]);

  const dateFormatted = useMemo(() => {
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(new Date());
  }, []);

  const userName = useMemo(() => {
    return user?.displayName || user?.email?.split('@')[0] || '';
  }, [user]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了，注意休息';
    if (hour < 11) return '早安，開始今日單字記憶';
    if (hour < 14) return '午安，抽空複習幾組單字';
    if (hour < 18) {
      return userName ? `下午好，${userName}` : '下午好';
    }
    return '晚安，回顧今日學習進度';
  }, [userName]);

  // Recent words preview (up to 4 items)
  const recentWords = useMemo(() => {
    return [...words].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 4);
  }, [words]);

  // Daily quote
  const dailyQuote = useMemo(() => getQuoteForToday(), []);

  // Card style utility class
  const getCardStyleClass = (style: HomeCardStyle) => {
    switch (style) {
      case 'glass':
        return 'bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 shadow-md';
      case 'vibrant':
        return `bg-gradient-to-br ${currentTheme.glowBg} bg-white/95 dark:bg-slate-800/90 border ${currentTheme.borderActive} shadow-sm`;
      case 'modern':
      default:
        return 'bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-sm';
    }
  };

  const cardStyleClass = getCardStyleClass(homeConfig.cardStyle);

  // Enabled widgets list
  const enabledWidgets = useMemo(() => {
    return homeConfig.widgets.filter((w) => w.enabled);
  }, [homeConfig.widgets]);

  const inactiveWidgets = useMemo(() => {
    return homeConfig.widgets.filter((w) => !w.enabled);
  }, [homeConfig.widgets]);

  // In-place edit operations
  const handleToggleWidth = (id: WidgetId) => {
    const updated = homeConfig.widgets.map((w) => {
      if (w.id === id) {
        return {
          ...w,
          width: (w.width === 'full' ? 'half' : 'full') as 'full' | 'half'
        };
      }
      return w;
    });
    handleUpdateHomeConfig({ ...homeConfig, widgets: updated });
  };

  const handleRemoveWidget = (id: WidgetId) => {
    const updated = homeConfig.widgets.map((w) => {
      if (w.id === id) {
        return { ...w, enabled: false };
      }
      return w;
    });
    handleUpdateHomeConfig({ ...homeConfig, widgets: updated });
  };

  const handleAddWidget = (id: WidgetId) => {
    const meta = WIDGET_METAS[id];
    const updated = homeConfig.widgets.map((w) => {
      if (w.id === id) {
        return {
          ...w,
          enabled: true,
          width: w.width || meta?.defaultWidth || 'half'
        };
      }
      return w;
    });
    handleUpdateHomeConfig({ ...homeConfig, widgets: updated });
  };

  const handleAddWidgetAtIndex = (id: WidgetId, targetIndex: number) => {
    const meta = WIDGET_METAS[id];
    const enabled = homeConfig.widgets.filter((w) => w.enabled);
    const disabled = homeConfig.widgets.filter((w) => !w.enabled && w.id !== id);
    const existing = homeConfig.widgets.find((w) => w.id === id);

    const newWidget: HomeWidgetItem = {
      id,
      enabled: true,
      width: existing?.width || meta?.defaultWidth || 'half'
    };

    const insertAt = Math.max(0, Math.min(enabled.length, targetIndex));
    enabled.splice(insertAt, 0, newWidget);

    handleUpdateHomeConfig({
      ...homeConfig,
      widgets: [...enabled, ...disabled]
    });
  };

  // Reordering in place
  const handleMoveUp = (enabledIndex: number) => {
    if (enabledIndex <= 0) return;
    const enabled = homeConfig.widgets.filter((w) => w.enabled);
    const disabled = homeConfig.widgets.filter((w) => !w.enabled);

    const temp = enabled[enabledIndex];
    enabled[enabledIndex] = enabled[enabledIndex - 1];
    enabled[enabledIndex - 1] = temp;

    handleUpdateHomeConfig({ ...homeConfig, widgets: [...enabled, ...disabled] });
  };

  const handleMoveDown = (enabledIndex: number) => {
    const enabled = homeConfig.widgets.filter((w) => w.enabled);
    const disabled = homeConfig.widgets.filter((w) => !w.enabled);
    if (enabledIndex >= enabled.length - 1) return;

    const temp = enabled[enabledIndex];
    enabled[enabledIndex] = enabled[enabledIndex + 1];
    enabled[enabledIndex + 1] = temp;

    handleUpdateHomeConfig({ ...homeConfig, widgets: [...enabled, ...disabled] });
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', `home_index:${index}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');

    // Case 1: Dragged from gallery drawer
    if (data && data.startsWith('vocabmin_widget:')) {
      const widgetId = data.replace('vocabmin_widget:', '') as WidgetId;
      handleAddWidgetAtIndex(widgetId, targetIndex);
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Case 2: Reordering directly on home screen
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const enabled = homeConfig.widgets.filter((w) => w.enabled);
    const disabled = homeConfig.widgets.filter((w) => !w.enabled);

    const [moved] = enabled.splice(draggedIndex, 1);
    enabled.splice(targetIndex, 0, moved);

    handleUpdateHomeConfig({
      ...homeConfig,
      widgets: [...enabled, ...disabled]
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Unified Widget Wrapper for In-place editing
  const renderWidgetWrapper = (
    widget: HomeWidgetItem,
    index: number,
    content: React.ReactNode
  ) => {
    const meta = WIDGET_METAS[widget.id];
    const isFull = widget.width === 'full';
    const colSpan = isFull ? 'lg:col-span-12' : 'lg:col-span-6';
    const isDragging = draggedIndex === index;
    const isDragOver = dragOverIndex === index;

    return (
      <div
        key={widget.id}
        draggable={isEditMode}
        onDragStart={(e) => isEditMode && handleDragStart(e, index)}
        onDragOver={(e) => isEditMode && handleDragOver(e, index)}
        onDrop={(e) => isEditMode && handleDrop(e, index)}
        onDragEnd={() => isEditMode && handleDragEnd()}
        className={`col-span-1 ${colSpan} transition-all duration-200 relative ${
          isEditMode
            ? `rounded-3xl p-1.5 border-2 border-dashed ${
                isDragging
                  ? 'opacity-35 scale-95 border-indigo-500 ring-2 ring-indigo-400'
                  : isDragOver
                  ? 'border-indigo-600 ring-4 ring-indigo-500/30 bg-indigo-50/25 dark:bg-indigo-950/40 scale-[1.01]'
                  : 'border-indigo-400/80 dark:border-indigo-500/70 hover:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/15 shadow-md hover:shadow-lg'
              }`
            : ''
        }`}
      >
        {/* iOS-Style Minus/Delete Button at top-left corner */}
        {isEditMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveWidget(widget.id);
            }}
            className="absolute -top-2.5 -left-2.5 z-30 w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center font-black text-xs shadow-lg transition-transform hover:scale-110 active:scale-90 cursor-pointer border-2 border-white dark:border-slate-800"
            title="移除此小工具（移回小工具庫）"
          >
            <X className="w-3.5 h-3.5 stroke-[3]" />
          </button>
        )}

        {/* Drop Insertion Indicator */}
        {isEditMode && isDragOver && (
          <div className="absolute inset-0 rounded-3xl z-20 pointer-events-none border-2 border-indigo-500 bg-indigo-500/15 backdrop-blur-xs flex items-center justify-center drop-indicator-pulse">
            <span className="px-3.5 py-1.5 rounded-full bg-indigo-600 text-white font-extrabold text-xs shadow-lg flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>放置於此位置</span>
            </span>
          </div>
        )}

        {/* In-place Floating Control Bar on Top of Widget */}
        {isEditMode && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-1.5 rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-md text-xs select-none">
            {/* Left: Drag Handle & Title */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="p-1 text-slate-400 cursor-grab active:cursor-grabbing hover:text-indigo-500 transition rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                title="按住拖曳調整擺放順序"
              >
                <GripVertical className="w-4 h-4" />
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100 truncate text-[11px] sm:text-xs">
                {meta?.title || widget.id}
              </span>
            </div>

            {/* Right: Width toggle & Move buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Width Toggle: 100% vs 50% */}
              <button
                type="button"
                onClick={() => handleToggleWidth(widget.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition ${
                  isFull
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                }`}
                title={isFull ? '目前整行 (100%)，點擊切換為半行 (50%)' : '目前半行 (50%)，點擊切換為整行 (100%)'}
              >
                {isFull ? (
                  <>
                    <Maximize2 className="w-2.5 h-2.5" />
                    <span>整行 100%</span>
                  </>
                ) : (
                  <>
                    <Columns2 className="w-2.5 h-2.5" />
                    <span>半行 50%</span>
                  </>
                )}
              </button>

              {/* Move Up/Left */}
              <button
                type="button"
                disabled={index === 0}
                onClick={() => handleMoveUp(index)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 transition"
                title="往前移動順序"
              >
                <ArrowUp className="w-3 h-3" />
              </button>

              {/* Move Down/Right */}
              <button
                type="button"
                disabled={index === enabledWidgets.length - 1}
                onClick={() => handleMoveDown(index)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-20 transition"
                title="往後移動順序"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Real Live Widget Display */}
        <div className={isEditMode ? 'opacity-95' : ''}>
          {content}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-7 px-3 sm:px-6 space-y-5 animate-enter relative">
      {/* 1. Mobile-OS Style In-Place Edit Mode Control Bar (貼近手機桌面編輯模式) */}
      {isEditMode ? (
        <section className="sticky top-2 z-40 p-3 sm:p-4 rounded-3xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-2 border-indigo-500/80 shadow-2xl flex flex-col gap-3 animate-enter">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>📱 手機桌面編輯模式</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                    直接拖曳 · 所見即所得
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 hidden sm:block">
                  想要什麼就自己拉！直接拖曳卡片排版、點擊 ✕ 移除、切換 100%/50% 欄寬，拉成什麼樣主畫面就是什麼樣！
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Add widget button */}
              <button
                type="button"
                onClick={() => setIsWidgetGalleryOpen(true)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs ${currentTheme.btnClass} shadow-sm transition active:scale-95 flex items-center gap-1.5`}
              >
                <Plus className="w-4 h-4" />
                <span>+ 新增小工具 ({inactiveWidgets.length})</span>
              </button>

              {/* Reset button */}
              <button
                type="button"
                onClick={handleResetHomeConfig}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition flex items-center gap-1"
                title="恢復系統預設"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">恢復預設</span>
              </button>

              {/* Done button */}
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="px-4 py-1.5 rounded-xl font-black text-xs bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-md transition active:scale-95 flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>完成</span>
              </button>
            </div>
          </div>

          {/* Color theme swatches & card styles inside edit bar */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Color Swatches */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">焦點色彩:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(Object.keys(COLOR_THEMES) as HomeAccentColor[]).map((key) => {
                  const item = COLOR_THEMES[key];
                  const isSelected = homeConfig.accentColor === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleUpdateHomeConfig({ ...homeConfig, accentColor: key })}
                      className={`w-5 h-5 rounded-full ${item.swatch} transition-transform flex items-center justify-center text-white ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      title={item.name}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card Style Selector */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-0.5 rounded-xl">
              <button
                onClick={() => handleUpdateHomeConfig({ ...homeConfig, cardStyle: 'modern' })}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                  homeConfig.cardStyle === 'modern'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-400'
                }`}
              >
                現代
              </button>
              <button
                onClick={() => handleUpdateHomeConfig({ ...homeConfig, cardStyle: 'glass' })}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                  homeConfig.cardStyle === 'glass'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-400'
                }`}
              >
                毛玻璃
              </button>
              <button
                onClick={() => handleUpdateHomeConfig({ ...homeConfig, cardStyle: 'vibrant' })}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                  homeConfig.cardStyle === 'vibrant'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-400'
                }`}
              >
                微彩
              </button>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-400 hidden sm:inline">推薦佈局:</span>
              {HOME_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    handleUpdateHomeConfig({
                      accentColor: p.accentColor,
                      cardStyle: p.cardStyle,
                      widgets: p.widgets
                    })
                  }
                  className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700 text-[10px] font-medium text-slate-600 dark:text-slate-300 transition"
                  title={p.desc}
                >
                  {p.name.split(' ')[1]}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* Normal Header Banner */
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {dateFormatted}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>{greeting}</span>
            </h1>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              透過智能間隔演算法持續溫習，將短時記憶穩固為長期知識資產。
            </p>
          </div>

          {/* Top Actions & Quick Metrics */}
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
            <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
              <div>
                <span className="text-slate-400 block text-[10px]">單字總量</span>
                <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                  {words.length}
                </span>
              </div>
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
              <div>
                <span className="text-slate-400 block text-[10px]">掌握度</span>
                <span className={`text-base sm:text-lg font-bold tabular-nums ${currentTheme.textAccent}`}>
                  {masteryPercentage}%
                </span>
              </div>
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
              <div>
                <span className="text-slate-400 block text-[10px]">待複習</span>
                <span
                  className={`text-base sm:text-lg font-bold tabular-nums ${
                    dueWordsCount > 0 ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'
                  }`}
                >
                  {dueWordsCount}
                </span>
              </div>
            </div>

            {/* Enter In-Place Edit Mode Button */}
            <button
              onClick={() => setIsEditMode(true)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 border ${currentTheme.badgeBg} ${currentTheme.badgeText} border-indigo-200/50 dark:border-indigo-800/50 hover:shadow-xs`}
              title="進入主畫面桌面編輯模式"
            >
              <Palette className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">編輯桌面</span>
            </button>
          </div>
        </section>
      )}

      {/* 2. Direct In-Place Modular Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {enabledWidgets.length === 0 ? (
          /* Empty home screen state */
          <div className="col-span-1 lg:col-span-12 py-16 text-center flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center mb-3 shadow-xs">
              <Plus className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
              主畫面目前沒有任何小工具
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              點擊下方按鈕打開小工具庫，挑選您喜歡的模組隨心拖曳拼出主畫面！
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsWidgetGalleryOpen(true)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold ${currentTheme.btnClass} shadow-md transition active:scale-95 flex items-center gap-1.5`}
              >
                <Plus className="w-4 h-4" />
                <span>+ 打開小工具庫新增</span>
              </button>
              <button
                onClick={handleResetHomeConfig}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                恢復經典配置
              </button>
            </div>
          </div>
        ) : (
          enabledWidgets.map((widget, index) => {
            switch (widget.id) {
              /* WIDGET 1: Due Review Focus Anchor */
              case 'dueReview':
                return renderWidgetWrapper(
                  widget,
                  index,
                  dueWordsCount > 0 ? (
                    <div
                      className={`p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${cardStyleClass} border-teal-200/80 dark:border-teal-800/50`}
                    >
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-teal-500 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/20 shrink-0">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                              今日待複習單字
                            </h2>
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-teal-500 text-white tabular-nums">
                              {dueWordsCount} 個單字
                            </span>
                          </div>
                          <p className="hidden sm:block text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                            及時複習可維持大腦間隔記憶曲線，預防遺忘，預計僅需 3~5 分鐘。
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => !isEditMode && setTab('review')}
                        className={`px-5 py-2.5 ${currentTheme.btnClass} active:scale-95 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition whitespace-nowrap shrink-0`}
                      >
                        <span>開始今日複習</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm ${cardStyleClass}`}
                    >
                      <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        <span className="hidden sm:inline">
                          今日所有到期單字已複習完畢！記憶狀態處於最佳階段，可隨時進行隨堂測驗或新增生詞。
                        </span>
                        <span className="sm:hidden font-medium">今日到期單字已全數複習完畢！</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => !isEditMode && setTab('quiz')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${currentTheme.textAccent} hover:bg-slate-100 dark:hover:bg-slate-700/60 transition`}
                        >
                          隨堂測驗鞏固 →
                        </button>
                        <button
                          onClick={() => !isEditMode && setTab('ai')}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI 語伴對話 →</span>
                        </button>
                      </div>
                    </div>
                  )
                );

              /* WIDGET 2: Quick Search & AI Bar */
              case 'quickSearch':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className="relative z-30">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      {/* Search Input Box */}
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              if (searchResults.length > 0) {
                                onSelectWord(searchResults[0]);
                                setSearchTerm('');
                              }
                            }
                          }}
                          disabled={isEditMode}
                          placeholder="搜尋字庫單字、中文釋義或詞性..."
                          className={`w-full pl-10 pr-12 py-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-sm ${currentTheme.ring} outline-none text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition`}
                        />
                        {searchTerm && (
                          <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1"
                          >
                            清除
                          </button>
                        )}

                        {/* Autocomplete Dropdown */}
                        {!isEditMode && searchResults.length > 0 && (
                          <div className="absolute w-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-40 max-h-72 overflow-y-auto">
                            {searchResults.map((item) => (
                              <div
                                key={item.id}
                                onClick={() => {
                                  onSelectWord(item);
                                  setSearchTerm('');
                                }}
                                className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/60 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-0 flex items-center justify-between group transition"
                              >
                                <div className="min-w-0 pr-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900 dark:text-white capitalize group-hover:text-indigo-600 transition-colors">
                                      {item.term}
                                    </span>
                                    <span className="text-[10px] font-semibold text-slate-400">
                                      {item.pos}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    {getWordDisplayDef(item, settings.lang)}
                                  </p>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                                  查看 →
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add Word Action Button */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => !isEditMode && onOpenAdd()}
                          className={`px-4 py-3 bg-gradient-to-r ${currentTheme.primaryGradient} active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm transition whitespace-nowrap`}
                          title="單筆手動新增單字"
                        >
                          <Plus className="w-4 h-4" />
                          <span>新增單字</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );

              /* WIDGET 3: Vocabulary Mastery & SRS Distribution */
              case 'masteryStats':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-4`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-indigo-500" />
                        <span>單字熟練度分佈</span>
                      </h3>
                      <span className={`text-xs font-bold tabular-nums ${currentTheme.textAccent}`}>
                        掌握 {masteryPercentage}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="h-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                        {words.length > 0 ? (
                          <>
                            <div
                              style={{ width: `${(levelCounts[3] / words.length) * 100}%` }}
                              className="bg-emerald-500 h-full transition-all duration-500"
                              title={`精通: ${levelCounts[3]} 字`}
                            />
                            <div
                              style={{ width: `${(levelCounts[2] / words.length) * 100}%` }}
                              className="bg-blue-500 h-full transition-all duration-500"
                              title={`熟悉: ${levelCounts[2]} 字`}
                            />
                            <div
                              style={{ width: `${(levelCounts[1] / words.length) * 100}%` }}
                              className="bg-amber-500 h-full transition-all duration-500"
                              title={`學習中: ${levelCounts[1]} 字`}
                            />
                            <div
                              style={{ width: `${(levelCounts[0] / words.length) * 100}%` }}
                              className="bg-rose-500 h-full transition-all duration-500"
                              title={`陌生: ${levelCounts[0]} 字`}
                            />
                          </>
                        ) : (
                          <div className="w-full h-full bg-slate-200 dark:bg-slate-700" />
                        )}
                      </div>

                      {/* Legend */}
                      <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 pt-1 text-xs">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span>{t.lvl_mastered}</span>
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                            {levelCounts[3]} 字
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <span>{t.lvl_familiar}</span>
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                            {levelCounts[2]} 字
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            <span>{t.lvl_learning}</span>
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                            {levelCounts[1]} 字
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            <span>{t.lvl_new}</span>
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                            {levelCounts[0]} 字
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-700/60 pt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>今日活躍</span>
                      <div className="flex items-center gap-2 font-medium">
                        <span>複習 {todayStat.reviewed || 0}</span>
                        <span aria-hidden="true">·</span>
                        <span>新增 {todayStat.added || 0}</span>
                        <span aria-hidden="true">·</span>
                        <span>測驗 {todayStat.quizzes || 0}</span>
                      </div>
                    </div>
                  </div>
                );

              /* WIDGET 4: Core Study Paths (Focused Quiz & Review Modes) */
              case 'studyPaths':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          學習測驗模式
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        多維度複習鞏固
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Multiple Choice Review */}
                      <div
                        onClick={() => !isEditMode && setTab('review')}
                        className={`p-3.5 rounded-xl cursor-pointer group flex flex-col justify-between transition hover:shadow bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-500`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          {dueWordsCount > 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500 text-white tabular-nums">
                              {dueWordsCount} 待複習
                            </span>
                          )}
                        </div>
                        <div className="mt-3">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            選擇題辨析
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            快速中英四選一精準判別
                          </p>
                        </div>
                      </div>

                      {/* Cloze Fill-in Review */}
                      <div
                        onClick={() => !isEditMode && setTab('quiz')}
                        className={`p-3.5 rounded-xl cursor-pointer group flex flex-col justify-between transition hover:shadow bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 hover:border-purple-400 dark:hover:border-purple-500`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <PenTool className="w-4 h-4" />
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                            拼寫填空
                          </span>
                        </div>
                        <div className="mt-3">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            例句拼寫題
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            根據語境與字義完整拼寫
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );

              /* WIDGET: Speed Quiz (4-Option Fast Challenge) */
              case 'speedQuiz':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3.5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center">
                          <Zap className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>單字即時速測</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                              快問快答
                            </span>
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-300">
                          <Flame className="w-3.5 h-3.5 fill-current" />
                          <span>連對 {speedQuizScore}</span>
                        </span>
                        <button
                          onClick={initSpeedQuiz}
                          disabled={isEditMode}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                          title="換一題"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {speedQuizTargetWord ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-base sm:text-lg text-slate-900 dark:text-white capitalize">
                              {speedQuizTargetWord.term}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              {speedQuizTargetWord.pos}
                            </span>
                            {words.filter((w) => w.term.trim().toLowerCase() === speedQuizTargetWord.term.trim().toLowerCase()).length > 1 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
                                一詞多義
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => tts.speak(speedQuizTargetWord.term)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                            title="發音"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {speedQuizOptions.map((opt, optIdx) => {
                            let btnStyle = 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400 dark:hover:border-indigo-500';
                            const isChosen = speedQuizSelectedIdx === optIdx;
                            const isMatch = opt.isCorrect || (isChosen && opt.isAcceptable);

                            if (speedQuizAnswered) {
                              if (opt.isCorrect) {
                                btnStyle = 'bg-emerald-500 text-white border-emerald-500 font-bold shadow-sm shadow-emerald-500/20';
                              } else if (isChosen && opt.isAcceptable) {
                                btnStyle = 'bg-teal-600 text-white border-teal-600 font-bold shadow-sm shadow-teal-500/20';
                              } else if (isChosen) {
                                btnStyle = 'bg-rose-500 text-white border-rose-500 font-bold';
                              } else {
                                btnStyle = 'opacity-40 bg-slate-100 dark:bg-slate-800 text-slate-400 border-transparent';
                              }
                            }

                            return (
                              <button
                                key={optIdx}
                                disabled={isEditMode || speedQuizAnswered}
                                onClick={() => handleSelectSpeedQuizOption(optIdx)}
                                className={`p-2.5 rounded-xl border text-xs text-left transition font-medium flex items-center justify-between gap-2 ${btnStyle}`}
                              >
                                <span className="line-clamp-2">{opt.text}</span>
                                {speedQuizAnswered && isMatch && (
                                  <Check className="w-3.5 h-3.5 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {speedQuizAnswered && (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              {speedQuizOptions[speedQuizSelectedIdx ?? 0]?.isCorrect || speedQuizOptions[speedQuizSelectedIdx ?? 0]?.isAcceptable
                                ? (speedQuizOptions[speedQuizSelectedIdx ?? 0]?.isAcceptable && !speedQuizOptions[speedQuizSelectedIdx ?? 0]?.isCorrect
                                    ? '💡 認可其它收錄釋義，回答正確！'
                                    : '🎉 太棒了，回答正確！')
                                : `💡 正確釋義為：${getWordDisplayDef(speedQuizTargetWord, settings.lang)}`}
                            </span>
                            <button
                              onClick={initSpeedQuiz}
                              className={`px-3 py-1 rounded-lg text-xs font-bold ${currentTheme.btnClass} transition shrink-0`}
                            >
                              下一題 →
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-400">
                        單字庫暫無可用題目，請先收錄單字即可解鎖速測！
                      </div>
                    )}
                  </div>
                );

              /* WIDGET: 7-Day Streak Calendar */
              case 'streakCalendar':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3.5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/60 text-orange-500 flex items-center justify-center">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            7 天打卡週曆
                          </h3>
                          <span className="text-[10px] text-slate-400">
                            連續打卡 {streakDays} 天 · 持之以恆
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <Flame className="w-3.5 h-3.5 fill-current" />
                        <span>{streakDays} 天紀錄</span>
                      </span>
                    </div>

                    {/* 7 Days Grid */}
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                      {weekCalendarDays.map((d) => (
                        <div
                          key={d.dateStr}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition ${
                            d.isToday
                              ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/40 ring-2 ring-indigo-400/20'
                              : d.isCompleted
                              ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/20'
                              : 'border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 text-slate-400'
                          }`}
                        >
                          <span className="text-[10px] font-medium text-slate-400 block mb-0.5">
                            {d.dayLabel}
                          </span>
                          <span
                            className={`text-xs font-bold mb-1.5 ${
                              d.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {d.dateNum}
                          </span>
                          <div className="w-5 h-5 rounded-full flex items-center justify-center">
                            {d.isCompleted ? (
                              <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            ) : d.isToday ? (
                              <div className="w-4 h-4 rounded-full border-2 border-dashed border-indigo-400 animate-pulse" />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                            )}
                          </div>
                          <span className="text-[9px] font-mono mt-1 text-slate-400">
                            {d.count > 0 ? `${d.count}詞` : '-'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      <span>過去一週打卡率: {weekCalendarDays.filter((d) => d.isCompleted).length} / 7 天</span>
                      <button
                        onClick={() => !isEditMode && setTab('list')}
                        className={`font-semibold ${currentTheme.textAccent} hover:underline`}
                      >
                        單字庫學習進度 →
                      </button>
                    </div>
                  </div>
                );

              /* WIDGET: Stumble Words (Level 0/1 Weak Spot Spotlight) */
              case 'stumbleWords':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3.5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-500 flex items-center justify-center">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            生疏弱點攻堅
                          </h3>
                          <span className="text-[10px] text-slate-400">
                            優先複習熟悉度較低的生詞 (Lvl 0~1)
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => !isEditMode && setTab('review')}
                        className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                      >
                        <span>專項複習</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {stumbleWordsList.length > 0 ? (
                      <div className="space-y-2">
                        {stumbleWordsList.map((w) => (
                          <div
                            key={w.id}
                            onClick={() => !isEditMode && onSelectWord(w)}
                            className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 hover:border-rose-400 dark:hover:border-rose-500/80 transition cursor-pointer group flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-3">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors capitalize">
                                  {w.term}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400">
                                  {w.pos}
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                                  Lvl {w.level || 0}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                {getWordDisplayDef(w, settings.lang)}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  tts.speak(w.term);
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                                title="發音"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-400 flex flex-col items-center gap-1.5">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-0.5" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">目前沒有生疏弱點！</span>
                        <span>所有單字皆已熟悉或已熟練記憶，繼續保持。</span>
                      </div>
                    )}
                  </div>
                );

              /* WIDGET: Pomodoro Focus Timer */
              case 'pomodoroTimer': {
                const pomoMinutes = Math.floor(pomoSecondsLeft / 60);
                const pomoSecs = pomoSecondsLeft % 60;
                const formattedTime = `${String(pomoMinutes).padStart(2, '0')}:${String(pomoSecs).padStart(2, '0')}`;
                const totalTargetSecs = pomoPresetMinutes * 60;
                const progressPercent = Math.round(((totalTargetSecs - pomoSecondsLeft) / totalTargetSecs) * 100);

                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                          <Timer className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            專注學習番茄鐘
                          </h3>
                          <span className="text-[10px] text-slate-400">
                            今日已完成 {pomoSessionsCompleted} 輪專注
                          </span>
                        </div>
                      </div>

                      {/* Presets Switcher */}
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
                        {[15, 25, 45].map((m) => (
                          <button
                            key={m}
                            disabled={isEditMode || pomoIsActive}
                            onClick={() => handleSwitchPomoPreset(m)}
                            className={`px-2 py-0.5 rounded-md transition ${
                              pomoPresetMinutes === m
                                ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                          >
                            {m}m
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Clock & Controls */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="text-3xl sm:text-4xl font-mono font-black tracking-wider text-slate-900 dark:text-white tabular-nums">
                          {formattedTime}
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {pomoIsActive
                            ? '專注背單字中，心無旁騖...'
                            : pomoSecondsLeft === totalTargetSecs
                            ? '隨時準備開啟專注心流'
                            : '已暫停計時'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleTogglePomo}
                          disabled={isEditMode}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition ${
                            pomoIsActive
                              ? 'bg-amber-500 hover:bg-amber-600 text-white'
                              : 'bg-teal-600 hover:bg-teal-700 text-white'
                          }`}
                        >
                          {pomoIsActive ? (
                            <>
                              <Pause className="w-3.5 h-3.5 fill-current" />
                              <span>暫停</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>開始專注</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleResetPomo}
                          disabled={isEditMode}
                          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                          title="重置"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Mini Progress */}
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${progressPercent}%` }}
                        className="h-full bg-teal-500 transition-all duration-300 rounded-full"
                      />
                    </div>
                  </div>
                );
              }

              /* WIDGET: Root of the Day (Etymology) */
              case 'rootOfTheDay':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3.5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center">
                          <Compass className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>每日詞根解密</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                              詞源串記
                            </span>
                          </h3>
                          <span className="text-[10px] text-slate-400">
                            掌握核心詞根，舉一反三快速倍增字彙量
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-extrabold text-sky-600 dark:text-sky-400">
                          {rootData.origin}
                        </span>
                      </div>
                    </div>

                    {/* Root Highlight Banner */}
                    <div className="p-3 rounded-xl bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-purple-500/10 border border-sky-200/60 dark:border-sky-800/50 flex items-center justify-between">
                      <div>
                        <span className="text-lg font-black text-sky-700 dark:text-sky-300 font-mono">
                          {rootData.root}
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">
                          核心字義：{rootData.meaning}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-400 italic">
                        每日一根
                      </span>
                    </div>

                    {/* Example Derived Words */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {rootData.examples.map((exItem) => (
                        <div
                          key={exItem.word}
                          className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 hover:border-sky-400/80 transition group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-slate-900 dark:text-white capitalize group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                              {exItem.word}
                            </span>
                            <button
                              onClick={() => tts.speak(exItem.word)}
                              className="p-1 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition"
                              title="發音"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-[10px] font-mono text-sky-600 dark:text-sky-400 block mt-1">
                            {exItem.breakdown}
                          </span>
                          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">
                            {exItem.def}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );

              /* WIDGET 5: Daily Goal & Streak Progress */
              case 'dailyGoal': {
                const reviewedToday = todayStat.reviewed || 0;
                const goalPercent = Math.min(100, Math.round((reviewedToday / dailyGoalTarget) * 100));
                const isGoalReached = reviewedToday >= dailyGoalTarget;

                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3.5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/60 text-orange-500 flex items-center justify-center">
                          <Flame className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            今日學習目標
                          </h3>
                          <span className="text-[10px] text-slate-400">
                            連續學習打卡 {streakDays} 天
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateDailyTarget(dailyGoalTarget - 5)}
                          className="px-2 py-0.5 rounded text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                          title="減少目標"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">
                          目標: {dailyGoalTarget}
                        </span>
                        <button
                          onClick={() => handleUpdateDailyTarget(dailyGoalTarget + 5)}
                          className="px-2 py-0.5 rounded text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                          title="增加目標"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Goal Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-500 dark:text-slate-400">
                          已複習 {reviewedToday} / {dailyGoalTarget} 字
                        </span>
                        <span className={`font-bold font-mono ${currentTheme.textAccent}`}>
                          {goalPercent}%
                        </span>
                      </div>

                      <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${goalPercent}%` }}
                          className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${currentTheme.primaryGradient}`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-700/60">
                      {isGoalReached ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>太棒了！今日複習目標已達成 🎉</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          再複習 {Math.max(0, dailyGoalTarget - reviewedToday)} 字即可達成目標
                        </span>
                      )}

                      <button
                        onClick={() => !isEditMode && setTab('review')}
                        className={`text-xs font-bold ${currentTheme.textAccent} hover:underline`}
                      >
                        去複習 →
                      </button>
                    </div>
                  </div>
                );
              }

              /* WIDGET 6: Random Word Flashcard */
              case 'randomWord': {
                const currentWord = words[randomWordIndex];

                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3 flex flex-col justify-between min-h-[140px]`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center">
                          <Dices className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          隨機抽詞翻牌卡
                        </h3>
                      </div>

                      <button
                        onClick={handleDrawRandomWord}
                        disabled={!words.length || isEditMode}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition flex items-center gap-1"
                        title="抽取另一個單字"
                      >
                        <span>抽新詞</span>
                      </button>
                    </div>

                    {!currentWord ? (
                      <div className="py-4 text-center text-xs text-slate-400">
                        尚未新增單字，點擊右上角新增以啟用隨機抽詞！
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h4 className="text-lg font-black text-slate-900 dark:text-white capitalize">
                              {currentWord.term}
                            </h4>
                            <button
                              onClick={() => tts.speak(currentWord.term)}
                              className="p-1 text-slate-400 hover:text-indigo-500"
                              title="朗讀"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                            {currentWord.pos}
                          </span>
                        </div>

                        {/* Flip or Reveal */}
                        {isRandomRevealed ? (
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs animate-enter">
                            <p className="font-semibold text-slate-800 dark:text-slate-100">
                              {getWordDisplayDef(currentWord, settings.lang)}
                            </p>
                            {currentWord.ex && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1 pl-1 border-l-2 border-indigo-400">
                                "{currentWord.ex}"
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => !isEditMode && setIsRandomRevealed(true)}
                            className="w-full py-2.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-400 hover:text-indigo-500 transition text-center"
                          >
                            點擊翻開查看釋義與例句
                          </button>
                        )}
                      </div>
                    )}

                    {currentWord && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        <span>熟練度: Lvl {currentWord.level || 0}</span>
                        <button
                          onClick={() => !isEditMode && onSelectWord(currentWord)}
                          className={`font-semibold ${currentTheme.textAccent} hover:underline`}
                        >
                          查看完整詳情 →
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              /* WIDGET 7: Living Vocabulary Shelf - Recent Words */
              case 'recentWords':
                return renderWidgetWrapper(
                  widget,
                  index,
                  recentWords.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookMarked className="w-4 h-4 text-slate-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            最近收錄單字
                          </h3>
                        </div>
                        <button
                          onClick={() => !isEditMode && setTab('list')}
                          className={`text-xs font-semibold ${currentTheme.textAccent} hover:underline flex items-center gap-1`}
                        >
                          <span>查看完整單字庫</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {recentWords.map((word) => (
                          <div
                            key={word.id}
                            onClick={() => !isEditMode && onSelectWord(word)}
                            className={`p-3.5 rounded-xl cursor-pointer group flex flex-col justify-between transition hover:shadow ${cardStyleClass}`}
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-bold text-sm text-slate-900 dark:text-white group-hover:${currentTheme.textAccent} transition-colors capitalize`}>
                                    {word.term}
                                  </span>
                                  <span className="text-[10px] font-semibold text-slate-400">
                                    {word.pos}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    tts.speak(word.term);
                                  }}
                                  className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                                  title="發音"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                {getWordDisplayDef(word, settings.lang)}
                              </p>
                            </div>

                            <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-[11px] text-slate-400">
                              <div className="flex items-center gap-1">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    word.level === 3
                                      ? 'bg-emerald-500'
                                      : word.level === 2
                                      ? 'bg-blue-500'
                                      : word.level === 1
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                />
                                <span>
                                  {word.level === 3
                                    ? '精通'
                                    : word.level === 2
                                    ? '熟悉'
                                    : word.level === 1
                                    ? '學習中'
                                    : '陌生'}
                                </span>
                              </div>
                              {onOpenCambridge && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCambridge(word.term);
                                  }}
                                  className="hover:text-indigo-500 transition flex items-center gap-0.5"
                                  title="劍橋字典"
                                >
                                  <span>字典</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={`p-4 rounded-2xl ${cardStyleClass} text-center text-xs text-slate-400`}>
                      目前尚無最近單字收錄記錄
                    </div>
                  )
                );

              /* WIDGET 8: Daily Quote of the Day */
              case 'quoteOfTheDay':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} border-indigo-200/50 dark:border-indigo-800/40 relative overflow-hidden`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center shrink-0">
                          <Quote className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block mb-1">
                            每日一句 (Quote of the Day)
                          </span>
                          <p className="text-sm sm:text-base font-serif italic text-slate-800 dark:text-slate-100">
                            "{dailyQuote.quote}"
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {dailyQuote.translation} — <span className="font-semibold">{dailyQuote.author}</span>
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => tts.speak(dailyQuote.quote)}
                        className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition shrink-0"
                        title="朗讀名言"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Vocabulary highlight badge */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">焦點單字:</span>
                        <span className="font-bold text-slate-800 dark:text-white capitalize">
                          {dailyQuote.vocabulary.word}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {dailyQuote.vocabulary.pos}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {dailyQuote.vocabulary.def}
                        </span>
                      </div>

                      <button
                        onClick={() => !isEditMode && onOpenCambridge?.(dailyQuote.vocabulary.word)}
                        className={`font-semibold ${currentTheme.textAccent} hover:underline`}
                      >
                        字典查詢 →
                      </button>
                    </div>
                  </div>
                );

              /* WIDGET: Article Reading Feature Spotlight */
              case 'articleReading': {
                const articlesList = storage.getLocalArticles();
                const featuredArticle = articlesList[0];

                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center shadow-xs">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>沉浸式文章閱讀</span>
                            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300">
                              點擊查詞收錄
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            邊讀邊學，遇生詞點擊即查即錄 · 語境造句深度記憶
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => !isEditMode && setTab('reader')}
                        className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <span>進入閱讀庫 ({articlesList.length})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {featuredArticle && (
                      <div
                        onClick={() => !isEditMode && setTab('reader')}
                        className="p-4 rounded-xl bg-gradient-to-br from-amber-50/50 via-slate-50 to-orange-50/30 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 hover:border-amber-400 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-white">
                              今日精選 · {featuredArticle.level}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {featuredArticle.category}
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>約 {featuredArticle.readTimeMinutes} 分鐘</span>
                          </span>
                        </div>

                        <h4 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors mb-1">
                          {featuredArticle.title}
                        </h4>

                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
                          {featuredArticle.summary || featuredArticle.content.slice(0, 120) + '...'}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-amber-200/40 dark:border-slate-700/60 text-xs">
                          <span className="text-slate-400">
                            {featuredArticle.savedWordTerms.length > 0
                              ? `已收錄 ${featuredArticle.savedWordTerms.length} 個生詞`
                              : '支援即時點詞查義與發音'}
                          </span>
                          <span className="font-extrabold text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                            <span>立即閱讀</span>
                            <span>→</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              /* WIDGET 9: Quick Add Scratchpad */
              case 'quickAdd':
                return renderWidgetWrapper(
                  widget,
                  index,
                  <div className={`p-4 sm:p-5 rounded-2xl ${cardStyleClass} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500 flex items-center justify-center">
                          <Plus className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          快速收錄便簽
                        </h3>
                      </div>

                      {quickAddSuccess && (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-enter">
                          <Check className="w-3.5 h-3.5" />
                          <span>收錄成功！</span>
                        </span>
                      )}
                    </div>

                    <form onSubmit={handleQuickAddSubmit} className="space-y-2.5">
                      <div className="grid grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={quickTerm}
                          onChange={(e) => setQuickTerm(e.target.value)}
                          placeholder="英文單字 (例如: epiphany)"
                          disabled={isEditMode}
                          className="col-span-7 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none focus:border-indigo-500"
                          required
                        />

                        <select
                          value={quickPos}
                          onChange={(e) => setQuickPos(e.target.value as POS)}
                          disabled={isEditMode}
                          className="col-span-5 px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none cursor-pointer"
                        >
                          <option value="n.">名詞 (n.)</option>
                          <option value="v.">動詞 (v.)</option>
                          <option value="adj.">形容詞 (adj.)</option>
                          <option value="adv.">副詞 (adv.)</option>
                          <option value="phr.">片語 (phr.)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={quickDef}
                          onChange={(e) => setQuickDef(e.target.value)}
                          placeholder="中文釋義 (例如: 頓悟，靈光一現)"
                          disabled={isEditMode}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs font-medium outline-none focus:border-indigo-500"
                          required
                        />

                        <button
                          type="submit"
                          disabled={isEditMode}
                          className={`px-4 py-2 rounded-xl text-xs font-bold ${currentTheme.btnClass} shadow-sm shrink-0 active:scale-95 transition`}
                        >
                          收錄
                        </button>
                      </div>
                    </form>
                  </div>
                );

              default:
                return null;
            }
          })
        )}

        {/* In edit mode: Inviting Dashed Add-Widget Card at bottom of grid */}
        {isEditMode && inactiveWidgets.length > 0 && (
          <div
            onClick={() => setIsWidgetGalleryOpen(true)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverIndex(enabledWidgets.length);
            }}
            onDrop={(e) => handleDrop(e, enabledWidgets.length)}
            className={`col-span-1 lg:col-span-12 p-6 rounded-3xl border-2 border-dashed transition-all flex flex-col sm:flex-row items-center justify-center gap-3 cursor-pointer group select-none shadow-sm ${
              dragOverIndex === enabledWidgets.length
                ? 'border-indigo-500 bg-indigo-100/40 dark:bg-indigo-900/40 ring-4 ring-indigo-500/20 scale-[1.01]'
                : 'border-indigo-300 dark:border-indigo-700 hover:border-indigo-500 dark:hover:border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:scale-[1.01]'
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center group-hover:rotate-90 transition-transform">
              <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-center sm:text-left">
              <span className="text-sm font-bold block text-slate-800 dark:text-slate-100">
                ＋ 拖曳小工具至此處放置，或點選從小工具庫新增
              </span>
              <span className="text-xs text-slate-400">
                尚有 {inactiveWidgets.length} 個模組可自由加入主畫面
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Quiet Secondary Utility Row */}
      {!isEditMode && (
        <div className="flex items-center justify-between px-2 pt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <button
            onClick={() => setTab('list')}
            className={`hover:${currentTheme.textAccent} transition flex items-center gap-1`}
          >
            <List className="w-3.5 h-3.5" />
            <span>查看單字庫列表 ({words.length})</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditMode(true)}
              className={`hover:${currentTheme.textAccent} transition flex items-center gap-1`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>進入桌面編輯模式</span>
            </button>
            <button
              onClick={onOpenAdd}
              className={`hover:${currentTheme.textAccent} transition flex items-center gap-1`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>單筆手動新增</span>
            </button>
          </div>
        </div>
      )}

      {/* Widget Gallery Drawer (iOS-style bottom slide-up sheet) */}
      <WidgetGalleryDrawer
        isOpen={isWidgetGalleryOpen}
        onClose={() => setIsWidgetGalleryOpen(false)}
        config={homeConfig}
        onAddWidget={(id) => {
          handleAddWidget(id);
        }}
      />
    </div>
  );
};
