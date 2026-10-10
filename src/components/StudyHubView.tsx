import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Volume2,
  ArrowLeft,
  CheckCircle,
  ArrowRight,
  Trophy,
  Check,
  XCircle,
  RotateCcw,
  Zap,
  BookOpen,
  PenTool,
  Clock,
  Sparkles,
  CheckSquare,
  Square,
  Flame,
  HelpCircle,
  Layers,
  Tag
} from 'lucide-react';
import { Word, AppSettings } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { tts } from '../services/tts';
import { calculateNextReview } from '../services/srs';
import {
  getWordDisplayDef,
  getWordSecondaryDef,
  generateSafeQuizOptions,
  checkPolysemyAnswerMatch
} from '../utils/wordLang';
import { getAllWordCategories } from '../services/storage';
import confetti from 'canvas-confetti';

export interface ActiveStudyQuestion {
  mode: 'choice' | 'cloze';
  currentIndex: number;
  totalQuestions: number;
  term: string;
  pos: string;
  def: string;
  defEn?: string;
  sentence?: string;
  options?: string[];
  isAnswered: boolean;
  userAnswer?: string | null;
  isCorrect?: boolean;
}

interface StudyHubViewProps {
  words: Word[];
  settings: AppSettings;
  initialMode?: 'choice' | 'cloze';
  onUpdateWordReview: (wordId: string, updates: Partial<Word>) => void;
  onBatchUpdateReview?: (updates: { id: string; data: Partial<Word> }[]) => void;
  onFinishReviewSession: (count: number) => void;
  onRecordQuizActivity: (score: number) => void;
  onActiveStudyQuestionChange?: (question: ActiveStudyQuestion | null) => void;
  onBack: () => void;
}

// Result recorded for each question in a session
interface QuestionRecord {
  word: Word;
  userAnswer: string;
  isCorrect: boolean;
  timeSpent: number; // in seconds
  rating: number; // 0: Again, 1: Hard, 2: Good, 3: Easy
  previousLevel: number;
  newLevel: number;
}

// Question model
interface ReviewQuestion {
  word: Word;
  mode: 'choice' | 'cloze';
  // For multiple-choice
  options: string[];
  correctOptionIndex: number;
  acceptableOptionIndices?: number[];
  sameTermEntries?: Word[];
  // For fill-in-the-blank (cloze)
  fullSentence: string;
  clozeSentence: string;
  firstLetter: string;
  blankLength: number;
}

export const StudyHubView: React.FC<StudyHubViewProps> = ({
  words,
  settings,
  initialMode = 'choice',
  onUpdateWordReview,
  onBatchUpdateReview,
  onFinishReviewSession,
  onRecordQuizActivity,
  onActiveStudyQuestionChange,
  onBack
}) => {
  const t = TRANSLATIONS[settings.lang];

  // 1. Setup State: Mode ('choice' = 選擇題, 'cloze' = 例句挖空填充題)
  const [reviewMode, setReviewMode] = useState<'choice' | 'cloze'>(initialMode);

  // 2. Proficiency Level Filter Checkboxes (0: 陌生, 1: 學習中, 2: 熟悉, 3: 精通)
  // Default to [0, 1] to focus on unfamiliar words, but user can freely toggle any
  const [selectedLevels, setSelectedLevels] = useState<number[]>([0, 1]);
  const [reviewLimit, setReviewLimit] = useState<number>(20);

  // 2.5 Category Filter ('all' = 全部, 'uncategorized' = 未分類, or custom category name)
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Available categories union from settings and words
  const availableCategories = useMemo(() => {
    return getAllWordCategories(words, settings);
  }, [words, settings]);

  // Word counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncategorized = 0;
    words.forEach((w) => {
      const cat = (w.category || '').trim();
      if (!cat || cat === '未分類') {
        uncategorized++;
      } else {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return { counts, uncategorized, total: words.length };
  }, [words]);

  // 3. Session Active State
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [isSessionFinished, setIsSessionFinished] = useState<boolean>(false);

  // 4. Questions & Progression
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [sessionRecords, setSessionRecords] = useState<QuestionRecord[]>([]);

  // 5. Real-time Timer State
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const timerRef = useRef<any>(null);

  // 6. Current Question Answer State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [typedInput, setTypedInput] = useState<string>('');
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [lastFeedback, setLastFeedback] = useState<{
    isCorrect: boolean;
    timeSpent: number;
    rating: number;
    prevLevel: number;
    newLevel: number;
    speedTag: string;
    secondaryMatch?: Word | null;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const autoNextTimerRef = useRef<any>(null);

  // Count words in each proficiency level (respecting chosen category)
  const levelCounts = useMemo(() => {
    const counts = [0, 0, 0, 0];
    words.forEach((w) => {
      // Category match
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'uncategorized' && w.category && w.category !== '未分類') return;
        if (selectedCategory !== 'uncategorized' && w.category !== selectedCategory) return;
      }
      const lvl = Math.min(3, Math.max(0, w.level || 0));
      counts[lvl]++;
    });
    return counts;
  }, [words, selectedCategory]);

  // Candidates based on selected levels and selected category
  const filteredCandidates = useMemo(() => {
    return words.filter((w) => {
      // Level filter
      const matchLevel = selectedLevels.includes(w.level || 0);
      if (!matchLevel) return false;

      // Category filter
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'uncategorized') return !w.category || w.category === '未分類';
      return w.category === selectedCategory;
    });
  }, [words, selectedLevels, selectedCategory]);

  // Toggle level checkbox
  const handleToggleLevel = (lvl: number) => {
    setSelectedLevels((prev) => {
      if (prev.includes(lvl)) {
        // Keep at least one level selected
        if (prev.length === 1) return prev;
        return prev.filter((l) => l !== lvl);
      } else {
        return [...prev, lvl].sort();
      }
    });
  };

  // Select all or select only weak
  const handleSelectAllLevels = () => {
    setSelectedLevels([0, 1, 2, 3]);
  };
  const handleSelectWeakOnly = () => {
    setSelectedLevels([0, 1]);
  };

  // Helper: Generate Cloze Sentence with first letter hint
  const generateClozeData = useCallback((word: Word) => {
    const term = word.term.trim();
    const firstLetter = term.charAt(0);
    const blankLength = Math.max(2, term.length - 1);
    const blanks = '_'.repeat(blankLength);

    let rawSentence = word.ex ? word.ex.trim() : '';

    // If no existing example sentence, generate a natural sentence based on POS
    if (!rawSentence) {
      switch (word.pos) {
        case 'v.':
          rawSentence = `It is important to ${term} all procedures carefully.`;
          break;
        case 'n.':
          rawSentence = `The ${term} played a key role in the project's success.`;
          break;
        case 'adj.':
          rawSentence = `The results were extremely ${term} and exceeded our expectations.`;
          break;
        case 'adv.':
          rawSentence = `The speaker explained the topic ${term} to the entire audience.`;
          break;
        case 'phr.':
          rawSentence = `We must remember to ${term} when working under pressure.`;
          break;
        default:
          rawSentence = `Please pay attention to the term ${term} in this context.`;
          break;
      }
    }

    // Replace term in rawSentence while keeping case and punctuation
    // Create regex matching term with optional suffixes (s, ed, ing, d, es)
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b(${escapedTerm}[a-z]*)\\b`, 'i');

    let clozeSentence = '';
    const match = rawSentence.match(regex);

    if (match && match[0]) {
      const matchedWord = match[0];
      const matchFirst = matchedWord.charAt(0);
      const matchRestBlanks = '_'.repeat(Math.max(2, matchedWord.length - 1));
      clozeSentence = rawSentence.replace(regex, `${matchFirst}${matchRestBlanks}`);
    } else {
      // Fallback: append cloze prompt
      clozeSentence = `${rawSentence} [Target: ${firstLetter}${blanks}]`;
    }

    return {
      fullSentence: rawSentence,
      clozeSentence,
      firstLetter,
      blankLength
    };
  }, []);

  // Start Review Session
  const handleStartSession = () => {
    if (filteredCandidates.length === 0) return;

    // Shuffle and pick limit
    const shuffled = [...filteredCandidates].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(reviewLimit, shuffled.length));

    // Construct questions
    const generatedQuestions: ReviewQuestion[] = chosen.map((w) => {
      const safeOpts = generateSafeQuizOptions(w, words, settings.lang);
      const clozeData = generateClozeData(w);

      return {
        word: w,
        mode: reviewMode,
        options: safeOpts.options,
        correctOptionIndex: safeOpts.correctOptionIndex,
        acceptableOptionIndices: safeOpts.acceptableOptionIndices,
        sameTermEntries: safeOpts.sameTermEntries,
        fullSentence: clozeData.fullSentence,
        clozeSentence: clozeData.clozeSentence,
        firstLetter: clozeData.firstLetter,
        blankLength: clozeData.blankLength
      };
    });

    setQuestions(generatedQuestions);
    setCurrentIndex(0);
    setSessionRecords([]);
    setSelectedOption(null);
    setTypedInput('');
    setIsAnswered(false);
    setLastFeedback(null);
    setIsSessionActive(true);
    setIsSessionFinished(false);

    // Start timer for first question
    const now = performance.now();
    setStartTime(now);
    setElapsedTime(0);
  };

  // Timer tick for real-time timer display
  useEffect(() => {
    if (isSessionActive && !isAnswered && !isSessionFinished) {
      timerRef.current = setInterval(() => {
        setElapsedTime((performance.now() - startTime) / 1000);
      }, 50);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSessionActive, isAnswered, isSessionFinished, startTime]);

  // Focus input automatically for cloze mode
  useEffect(() => {
    if (isSessionActive && reviewMode === 'cloze' && !isAnswered && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSessionActive, reviewMode, currentIndex, isAnswered]);

  const currentQ = questions[currentIndex];

  // Inform parent / Floating AI Assistant about the active question on screen
  useEffect(() => {
    if (isSessionActive && currentQ && !isSessionFinished) {
      onActiveStudyQuestionChange?.({
        mode: reviewMode,
        currentIndex: currentIndex + 1,
        totalQuestions: questions.length,
        term: currentQ.word.term,
        pos: currentQ.word.pos,
        def: currentQ.word.def,
        defEn: currentQ.word.defEn,
        sentence: currentQ.fullSentence || currentQ.word.ex,
        options: currentQ.options,
        isAnswered,
        userAnswer: reviewMode === 'choice' ? (selectedOption !== null ? currentQ.options[selectedOption] : null) : typedInput,
        isCorrect: lastFeedback?.isCorrect
      });
    } else {
      onActiveStudyQuestionChange?.(null);
    }
  }, [
    isSessionActive,
    isSessionFinished,
    currentQ,
    currentIndex,
    questions.length,
    reviewMode,
    isAnswered,
    selectedOption,
    typedInput,
    lastFeedback,
    onActiveStudyQuestionChange
  ]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      onActiveStudyQuestionChange?.(null);
    };
  }, [onActiveStudyQuestionChange]);

  // Core Evaluation & Adaptive Mastery Calculation based on Response Time
  const evaluateAnswer = useCallback(
    (isCorrect: boolean, userAnswer: string, secondaryMatch?: Word | null) => {
      if (!currentQ || isAnswered) return;

      const finishTime = performance.now();
      const timeSpent = Math.max(0.3, parseFloat(((finishTime - startTime) / 1000).toFixed(1)));
      setIsAnswered(true);

      const currentWord = currentQ.word;
      const prevLevel = currentWord.level || 0;

      let rating = 0;
      let speedTag = '';

      if (!isCorrect) {
        // Wrong answer: Reset / downgrade to Level 0 (Again)
        rating = 0;
        speedTag = '❌ 答錯 · 需重新排入複習';
      } else if (secondaryMatch && secondaryMatch.id !== currentWord.id) {
        // Correct through secondary polysemous meaning in library!
        rating = 2; // Count as Good recall
        speedTag = `💡 正確！認可本單字另一收錄釋義 [${secondaryMatch.pos}] ${secondaryMatch.def}`;
      } else {
        // Correct answer: Derive rating from timeSpent
        if (reviewMode === 'choice') {
          // Multiple Choice Thresholds:
          // < 2.5s: Instant recall (Easy / Rating 3)
          // 2.5s ~ 5.5s: Good recall (Good / Rating 2)
          // > 5.5s: Struggle / hesitation (Hard / Rating 1)
          if (timeSpent < 2.5) {
            rating = 3;
            speedTag = `⚡ 秒殺反應 (${timeSpent}s) · 熟練度大幅提升`;
          } else if (timeSpent <= 5.5) {
            rating = 2;
            speedTag = `👍 反應流暢 (${timeSpent}s) · 熟練度穩定升級`;
          } else {
            rating = 1;
            speedTag = `💡 思考較久 (${timeSpent}s) · 判定為猶豫作答`;
          }
        } else {
          // Cloze (Typing) Thresholds:
          // < 4.0s: Super fast typing & recall (Easy / Rating 3)
          // 4.0s ~ 9.0s: Normal fluent typing (Good / Rating 2)
          // > 9.0s: Slow / hesitant typing (Hard / Rating 1)
          if (timeSpent < 4.0) {
            rating = 3;
            speedTag = `⚡ 極速拼寫 (${timeSpent}s) · 熟練度大幅提升`;
          } else if (timeSpent <= 9.0) {
            rating = 2;
            speedTag = `👍 拼寫流暢 (${timeSpent}s) · 熟練度穩定升級`;
          } else {
            rating = 1;
            speedTag = `💡 猶豫較久 (${timeSpent}s) · 判定為略有生疏`;
          }
        }
      }

      // Calculate SRS next review & new proficiency level
      const srsResult = calculateNextReview(currentWord, rating);
      const newLevel = srsResult.level;

      // Persist to real app state
      onUpdateWordReview(currentWord.id, srsResult);

      // Also boost the secondary polysemous entry so it reflects user mastery!
      if (secondaryMatch && secondaryMatch.id !== currentWord.id) {
        const secSrs = calculateNextReview(secondaryMatch, rating);
        onUpdateWordReview(secondaryMatch.id, secSrs);
      }

      // Play audio on correct answer
      if (isCorrect) {
        tts.speak(currentWord.term);
      }

      const feedback = {
        isCorrect,
        timeSpent,
        rating,
        prevLevel,
        newLevel,
        speedTag,
        secondaryMatch
      };

      setLastFeedback(feedback);

      const record: QuestionRecord = {
        word: currentWord,
        userAnswer,
        isCorrect,
        timeSpent,
        rating,
        previousLevel: prevLevel,
        newLevel
      };

      setSessionRecords((prev) => [...prev, record]);

      // If correct and user doesn't click next, auto-advance after 1.8s
      if (isCorrect) {
        autoNextTimerRef.current = setTimeout(() => {
          handleNextQuestion();
        }, 1800);
      }
    },
    [currentQ, isAnswered, startTime, reviewMode, onUpdateWordReview]
  );

  // Handle Option Click (Choice Mode)
  const handleSelectOption = (index: number) => {
    if (isAnswered || !currentQ) return;
    setSelectedOption(index);
    const chosenText = currentQ.options[index];

    const isPrimaryCorrect = index === currentQ.correctOptionIndex;
    const isAcceptable = (currentQ.acceptableOptionIndices || []).includes(index);

    let isCorrect = isPrimaryCorrect || isAcceptable;
    let secondaryMatch: Word | null = null;

    if (!isPrimaryCorrect) {
      secondaryMatch = checkPolysemyAnswerMatch(currentQ.word, chosenText, words, settings.lang);
      if (secondaryMatch) {
        isCorrect = true;
      }
    }

    evaluateAnswer(isCorrect, chosenText, secondaryMatch);
  };

  // Handle Cloze Submit
  const handleClozeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentQ) return;

    const cleanInput = typedInput.trim().toLowerCase();
    const correctTerm = currentQ.word.term.trim().toLowerCase();

    // Check exact match (or handles minor variations)
    const isCorrect = cleanInput === correctTerm;
    evaluateAnswer(isCorrect, typedInput);
  };

  // Advance to Next Question or Finish
  const handleNextQuestion = () => {
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);

    if (currentIndex + 1 >= questions.length) {
      // Session finished
      setIsSessionFinished(true);
      setIsSessionActive(false);

      // Record daily stats
      const correctCount = sessionRecords.filter((r) => r.isCorrect).length;
      onFinishReviewSession(sessionRecords.length);
      onRecordQuizActivity(correctCount * 10);

      try {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.6 }
        });
      } catch {}
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setTypedInput('');
      setIsAnswered(false);
      setLastFeedback(null);

      // Reset timer
      const now = performance.now();
      setStartTime(now);
      setElapsedTime(0);
    }
  };

  // Keyboard navigation for options (1, 2, 3, 4) & Enter for next
  useEffect(() => {
    if (!isSessionActive || isSessionFinished) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter or Space to go next when already answered
      if (isAnswered) {
        if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleNextQuestion();
        }
        return;
      }

      // Choice mode keyboard numbers 1..4
      if (reviewMode === 'choice' && currentQ) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < currentQ.options.length) {
            e.preventDefault();
            handleSelectOption(idx);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionActive, isSessionFinished, isAnswered, reviewMode, currentQ]);

  // Restart session with current settings
  const handleRestart = () => {
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    handleStartSession();
  };

  // Retry only wrong words from this session
  const handleRetryWrongWords = () => {
    const wrong = sessionRecords.filter((r) => !r.isCorrect).map((r) => r.word);
    if (wrong.length === 0) return;

    const generatedQuestions: ReviewQuestion[] = wrong.map((w) => {
      const safeOpts = generateSafeQuizOptions(w, words, settings.lang);
      const clozeData = generateClozeData(w);

      return {
        word: w,
        mode: reviewMode,
        options: safeOpts.options,
        correctOptionIndex: safeOpts.correctOptionIndex,
        acceptableOptionIndices: safeOpts.acceptableOptionIndices,
        sameTermEntries: safeOpts.sameTermEntries,
        fullSentence: clozeData.fullSentence,
        clozeSentence: clozeData.clozeSentence,
        firstLetter: clozeData.firstLetter,
        blankLength: clozeData.blankLength
      };
    });

    setQuestions(generatedQuestions);
    setCurrentIndex(0);
    setSessionRecords([]);
    setSelectedOption(null);
    setTypedInput('');
    setIsAnswered(false);
    setLastFeedback(null);
    setIsSessionActive(true);
    setIsSessionFinished(false);

    const now = performance.now();
    setStartTime(now);
    setElapsedTime(0);
  };

  // Helper colors
  const getLevelBadge = (level: number) => {
    switch (level) {
      case 3:
        return { label: '精通', color: 'bg-emerald-500 text-white', dot: 'bg-emerald-500' };
      case 2:
        return { label: '熟悉', color: 'bg-blue-500 text-white', dot: 'bg-blue-500' };
      case 1:
        return { label: '學習中', color: 'bg-amber-500 text-white', dot: 'bg-amber-500' };
      default:
        return { label: '陌生', color: 'bg-rose-500 text-white', dot: 'bg-rose-500' };
    }
  };

  // Session stats calculations
  const correctRecords = useMemo(() => sessionRecords.filter((r) => r.isCorrect), [sessionRecords]);
  const avgTime = useMemo(() => {
    if (!sessionRecords.length) return 0;
    const total = sessionRecords.reduce((acc, curr) => acc + curr.timeSpent, 0);
    return parseFloat((total / sessionRecords.length).toFixed(1));
  }, [sessionRecords]);

  const speedBreakdown = useMemo(() => {
    const easy = sessionRecords.filter((r) => r.isCorrect && r.rating === 3).length;
    const good = sessionRecords.filter((r) => r.isCorrect && r.rating === 2).length;
    const hard = sessionRecords.filter((r) => r.isCorrect && r.rating === 1).length;
    const missed = sessionRecords.filter((r) => !r.isCorrect).length;
    return { easy, good, hard, missed };
  }, [sessionRecords]);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 animate-enter space-y-6">
      {/* 1. Header Navigation Bar */}
      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1 text-xs font-bold"
            title="返回首頁"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">返回首頁</span>
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>智能單字複習</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                反應時長演算
              </span>
            </h1>
          </div>
        </div>

        {/* Back to Setup if active */}
        {isSessionActive && (
          <button
            onClick={() => {
              setIsSessionActive(false);
              setIsSessionFinished(false);
              if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            結束當前複習
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VIEW A: SETUP / CONFIGURATION DASHBOARD (When not running a session)       */}
      {/* ========================================================================= */}
      {!isSessionActive && !isSessionFinished && (
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-7 animate-enter max-w-2xl mx-auto">
          {/* Mode Selector: 選擇題 vs 例句挖空填充題 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>請選擇複習題型模式</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Option 1: 選擇題模式 */}
              <div
                onClick={() => setReviewMode('choice')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between ${
                  reviewMode === 'choice'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 dark:border-indigo-500 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      reviewMode === 'choice'
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {reviewMode === 'choice' && <Check className="w-3 h-3" />}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    選擇題模式
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    單字出現後提供選項，只有一個是正確解答。支援鍵盤 1~4 快速作答。
                  </p>
                </div>
              </div>

              {/* Option 2: 例句挖空填空題 */}
              <div
                onClick={() => setReviewMode('cloze')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between ${
                  reviewMode === 'cloze'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 dark:border-indigo-500 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                    <PenTool className="w-5 h-5" />
                  </div>
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      reviewMode === 'cloze'
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {reviewMode === 'cloze' && <Check className="w-3 h-3" />}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    例句挖空填充題
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    展示完整英文例句並將單字挖空，提供該單字首字母與中文釋義，手打拼寫出正確單字。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section: 單字類別依據 (Review by Category) */}
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-700/70 pt-5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>依單字類別進行複習</span>
              </label>
              <span className="text-xs text-slate-400 font-medium">
                可鎖定特定分類精準突破
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <span>🌟 全部單字</span>
                <span className="text-[10px] opacity-80 font-mono tabular-nums">({categoryCounts.total})</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategory('uncategorized')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'uncategorized'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <span>未分類</span>
                <span className="text-[10px] opacity-80 font-mono tabular-nums">({categoryCounts.uncategorized})</span>
              </button>

              {availableCategories.map((cat) => {
                const count = categoryCounts.counts[cat] || 0;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    <span>🏷️ {cat}</span>
                    <span className="text-[10px] opacity-80 font-mono tabular-nums">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: 自由勾選熟練度 (Proficiency Level Filter Checkboxes) */}
          <div className="space-y-3 border-t border-slate-100 dark:border-slate-700/70 pt-5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>勾選本次複習的單字熟練度</span>
              </label>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectWeakOnly}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  僅選不熟 (0~1)
                </button>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <button
                  type="button"
                  onClick={handleSelectAllLevels}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  全選
                </button>
              </div>
            </div>

            {/* Checkbox grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { lvl: 0, label: '陌生', badge: 'Level 0', color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/40' },
                { lvl: 1, label: '學習中', badge: 'Level 1', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/40' },
                { lvl: 2, label: '熟悉', badge: 'Level 2', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/40' },
                { lvl: 3, label: '精通', badge: 'Level 3', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/40' }
              ].map((item) => {
                const isChecked = selectedLevels.includes(item.lvl);
                const count = levelCounts[item.lvl];

                return (
                  <div
                    key={item.lvl}
                    onClick={() => handleToggleLevel(item.lvl)}
                    className={`p-3 rounded-xl border transition cursor-pointer select-none flex flex-col justify-between ${
                      isChecked
                        ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/40 text-slate-900 dark:text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${item.bg} ${item.color}`}>
                        {item.badge}
                      </span>
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <span className="font-bold text-xs">{item.label}</span>
                      <span className="text-[11px] text-slate-400 ml-1 font-mono tabular-nums">
                        ({count} 字)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between px-1">
              <span>
                符合勾選條件的單字庫：
                <strong className="text-slate-900 dark:text-white tabular-nums">
                  {filteredCandidates.length}
                </strong>{' '}
                字
              </span>
              <span>複習後將依回答快慢自動更新間隔評級</span>
            </div>
          </div>

          {/* Section: 複習數量設定 */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-700/70 pt-5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              單次複習題數：
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[10, 20, 30, filteredCandidates.length].map((num, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReviewLimit(num)}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    reviewLimit === num
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {idx === 3 ? '全部符合' : `${num} 題`}
                </button>
              ))}
            </div>
          </div>

          {/* Explain Time-to-Mastery Algorithm */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>作答時間自適應熟練度推算法：</span>
            </div>
            <p className="leading-relaxed">
              • <strong>極速秒殺</strong> (選擇題 &lt;2.5s / 填空 &lt;4.0s)：提取反射迅速，直接判定為 Easy，熟練度升為精通，大幅延長複習間隔。<br />
              • <strong>流暢提取</strong> (選擇題 2.5~5.5s / 填空 4~9s)：思維平穩，判定為 Good，熟練度正常升級。<br />
              • <strong>猶豫遲疑</strong> (超過基準)：思考時間較久，判定為 Hard，縮短下次間隔以鞏固記憶。<br />
              • <strong>答錯</strong>：自動重置為陌生 (Level 0)，下次週期立即再次出現。
            </p>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartSession}
            disabled={filteredCandidates.length === 0}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-95 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/20 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>開始智能複習 ({Math.min(reviewLimit, filteredCandidates.length)} 題)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW B: ACTIVE RUNNING QUESTION INTERFACE                                   */}
      {/* ========================================================================= */}
      {isSessionActive && currentQ && (
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-700/80 shadow-lg max-w-xl mx-auto space-y-6 animate-enter">
          {/* Header: Progress, Level Badge, and Real-Time Live Stopwatch */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/70 pb-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-400">
                題目：
                <span className="text-slate-900 dark:text-white tabular-nums">
                  {currentIndex + 1}
                </span>{' '}
                / {questions.length}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  getLevelBadge(currentQ.word.level || 0).color
                }`}
              >
                當前: {getLevelBadge(currentQ.word.level || 0).label}
              </span>
              {currentQ.word.category && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40">
                  🏷️ {currentQ.word.category}
                </span>
              )}
            </div>

            {/* Stopwatch Timer Display (Respects settings.showTimerInReview) */}
            {(settings.showTimerInReview ?? true) && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 font-mono text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums shadow-inner">
                <Clock className="w-3.5 h-3.5 text-indigo-500 animate-spin-slow" />
                <span>{elapsedTime.toFixed(1)}s</span>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* QUESTION TYPE 1: 選擇題 (Multiple Choice)                            */}
          {/* ------------------------------------------------------------------- */}
          {reviewMode === 'choice' && (
            <div className="space-y-6">
              {/* Question Word Prompt */}
              <div className="text-center py-2 space-y-2">
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                  請選擇該單字正確的解釋
                </span>

                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                    {currentQ.word.term}
                  </h2>
                  <button
                    onClick={() => tts.speak(currentQ.word.term)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    title="朗讀發音"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2 flex-wrap pt-0.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60 uppercase">
                    詞性：[{currentQ.word.pos}]
                  </span>
                  {(currentQ.sameTermEntries?.length || 1) > 1 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>一詞多義（收錄 {currentQ.sameTermEntries?.length} 義）</span>
                    </span>
                  )}
                </div>

                {/* Example sentence context hint for polysemy disambiguation */}
                {currentQ.word.ex && currentQ.word.ex.trim() && (
                  <div className="max-w-md mx-auto mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-750/70 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 italic text-center">
                    <span className="font-semibold text-slate-400 not-italic mr-1.5">例句情境：</span>
                    "{currentQ.word.ex.trim()}"
                  </div>
                )}
              </div>

              {/* 4 Multiple Choice Options */}
              <div className="space-y-2.5">
                {currentQ.options.map((option, idx) => {
                  const isSelected = selectedOption === idx;
                  const isPrimaryCorrect = idx === currentQ.correctOptionIndex;
                  const isSecondaryCorrect = (currentQ.acceptableOptionIndices || []).includes(idx);
                  const isAnyCorrect = isPrimaryCorrect || isSecondaryCorrect;

                  let style =
                    'bg-slate-50 dark:bg-slate-700/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700';

                  if (isAnswered) {
                    if (isPrimaryCorrect) {
                      style =
                        'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-800 dark:text-emerald-200 font-bold';
                    } else if (isSelected && isSecondaryCorrect) {
                      style =
                        'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-800 dark:text-teal-200 font-bold';
                    } else if (isSelected && !isAnyCorrect) {
                      style =
                        'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-800 dark:text-rose-200 font-bold';
                    } else {
                      style = 'opacity-35 border-slate-200 dark:border-slate-700';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(idx)}
                      disabled={isAnswered}
                      className={`w-full p-3.5 rounded-xl border text-xs sm:text-sm font-semibold transition text-left flex items-center justify-between cursor-pointer ${style}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-slate-200/80 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="line-clamp-2">{option}</span>
                        {isAnswered && isSelected && isSecondaryCorrect && !isPrimaryCorrect && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 ml-1 shrink-0">
                            認可其它收錄釋義
                          </span>
                        )}
                      </div>
                      {isAnswered && isPrimaryCorrect && (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      {isAnswered && isSelected && isSecondaryCorrect && !isPrimaryCorrect && (
                        <Check className="w-4 h-4 text-teal-600 shrink-0" />
                      )}
                      {isAnswered && isSelected && !isAnyCorrect && (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* "我忘記了" Action Button */}
              {!isAnswered && (
                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => evaluateAnswer(false, '我忘記了')}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-300 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>我忘記了 (直接看答案)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------------- */}
          {/* QUESTION TYPE 2: 例句挖空填充題 (Cloze Fill-in-the-Blank)              */}
          {/* ------------------------------------------------------------------- */}
          {reviewMode === 'cloze' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest block text-center">
                  例句挖空：請手打拼寫出正確單字
                </span>

                {/* Example sentence with cloze blank */}
                <div className="p-4 sm:p-5 rounded-2xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/40 text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-100 font-medium">
                  {isAnswered ? (
                    <p>{currentQ.fullSentence}</p>
                  ) : (
                    <p className="font-serif tracking-wide">{currentQ.clozeSentence}</p>
                  )}
                </div>

                {/* Hint: POS & Definition */}
                <div className="flex items-center justify-between px-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 uppercase">
                      [{currentQ.word.pos}]
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {getWordDisplayDef(currentQ.word, settings.lang)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[11px] text-purple-600 dark:text-purple-400 font-bold">
                    <span>首字母：</span>
                    <span className="uppercase text-sm underline">{currentQ.firstLetter}</span>
                    <span>({currentQ.word.term.length} 字母)</span>
                  </div>
                </div>
              </div>

              {/* Typing Input Box */}
              <form onSubmit={handleClozeSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={typedInput}
                    onChange={(e) => setTypedInput(e.target.value)}
                    disabled={isAnswered}
                    placeholder={`請輸入完整單字 (以 ${currentQ.firstLetter} 開頭)...`}
                    className={`w-full py-3.5 pl-4 pr-12 text-center text-lg sm:text-xl font-bold rounded-xl border outline-none transition font-mono ${
                      isAnswered
                        ? lastFeedback?.isCorrect
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                  />
                  {/* Speaker in input */}
                  {isAnswered && (
                    <button
                      type="button"
                      onClick={() => tts.speak(currentQ.word.term)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {!isAnswered ? (
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!typedInput.trim()}
                      className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition cursor-pointer"
                    >
                      提交解答 (按 Enter)
                    </button>
                    <button
                      type="button"
                      onClick={() => evaluateAnswer(false, '我忘記了')}
                      className="px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-dashed border-slate-300 dark:border-slate-700 hover:border-rose-300 transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      title="直接揭曉正確單字"
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>我忘記了</span>
                    </button>
                  </div>
                ) : null}
              </form>
            </div>
          )}

          {/* ------------------------------------------------------------------- */}
          {/* FEEDBACK & ADAPTIVE TIME RESULTS BANNER                             */}
          {/* ------------------------------------------------------------------- */}
          {isAnswered && lastFeedback && (
            <div className="space-y-4 animate-enter border-t border-slate-100 dark:border-slate-700/70 pt-4">
              {/* Dynamic Speed & Mastery Badge (Respects settings.showFeedbackInReview) */}
              <div
                className={`p-3.5 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-bold ${
                  lastFeedback.isCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {lastFeedback.isCorrect ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                  <span>
                    {(settings.showFeedbackInReview ?? true)
                      ? lastFeedback.speedTag
                      : lastFeedback.isCorrect
                      ? '回答正確'
                      : '未掌握 · 已加入待複習'}
                  </span>
                </div>

                {/* Level change indication (only if showFeedbackInReview is enabled) */}
                {(settings.showFeedbackInReview ?? true) && (
                  <div className="flex items-center gap-1.5 text-xs opacity-75">
                    <span>
                      Level {lastFeedback.prevLevel} → Level {lastFeedback.newLevel}
                    </span>
                  </div>
                )}
              </div>

              {/* Show correct word if missed */}
              {!lastFeedback.isCorrect && (
                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <div>
                    <span>正確單字：</span>
                    <strong className="text-sm font-bold text-indigo-600 dark:text-indigo-400 ml-1">
                      {currentQ.word.term}
                    </strong>
                    <span className="text-slate-400 ml-1">[{currentQ.word.pos}]</span>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      {getWordDisplayDef(currentQ.word, settings.lang)}
                    </p>
                  </div>
                  <button
                    onClick={() => tts.speak(currentQ.word.term)}
                    className="p-2 text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Polysemy reminder if word has other meanings in library */}
              {(() => {
                const otherMeanings = words.filter(
                  (w) =>
                    w.term.trim().toLowerCase() === currentQ.word.term.trim().toLowerCase() &&
                    w.id !== currentQ.word.id
                );
                if (otherMeanings.length === 0) return null;

                const isSecondaryAccepted = !!lastFeedback.secondaryMatch;

                return (
                  <div
                    className={`p-3 rounded-xl text-xs border space-y-1.5 ${
                      isSecondaryAccepted
                        ? 'bg-teal-50/80 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 border-teal-200 dark:border-teal-900/60'
                        : 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-900/50'
                    }`}
                  >
                    <span
                      className={`font-bold flex items-center gap-1.5 ${
                        isSecondaryAccepted
                          ? 'text-teal-700 dark:text-teal-300'
                          : 'text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isSecondaryAccepted
                        ? '💡 答題判定：您選擇了此單字的另一項收錄釋義，已認可判定為正確！'
                        : '💡 一詞多義提醒（字庫中收錄的全部義項）：'}
                    </span>
                    <div
                      className={`space-y-1 pl-2 border-l-2 text-[11px] ${
                        isSecondaryAccepted
                          ? 'border-teal-300 dark:border-teal-700'
                          : 'border-indigo-300 dark:border-indigo-700'
                      }`}
                    >
                      <p>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          [{currentQ.word.pos}]
                        </span>{' '}
                        {currentQ.word.def}
                        <span className="opacity-70 ml-1.5">
                          {isSecondaryAccepted ? '(題幹預設目標)' : '(本題所測)'}
                        </span>
                      </p>
                      {otherMeanings.map((om, oIdx) => {
                        const isChosenEntry = lastFeedback.secondaryMatch?.id === om.id;
                        return (
                          <p
                            key={oIdx}
                            className={
                              isChosenEntry
                                ? 'font-bold text-teal-700 dark:text-teal-300'
                                : 'opacity-80'
                            }
                          >
                            <span className="font-mono font-bold">[{om.pos}]</span> {om.def}
                            {isChosenEntry && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-teal-200/60 dark:bg-teal-850 text-teal-800 dark:text-teal-200 text-[10px]">
                                ✔ 您所選取的釋義 (已認可)
                              </span>
                            )}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Manual Next Question Button */}
              <button
                onClick={handleNextQuestion}
                className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
              >
                <span>下一題 (Enter / 空白鍵)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW C: SESSION FINISHED SUMMARY DASHBOARD                                  */}
      {/* ========================================================================= */}
      {isSessionFinished && (
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-700/80 shadow-xl max-w-xl mx-auto space-y-6 animate-enter">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center mx-auto shadow-md">
              <Trophy className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              複習測驗圓滿完成！
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              系統已根據您的作答反應時間，精準調校各單字的記憶間隔與熟練度評級。
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/40">
                🏷️ 複習類別：{selectedCategory === 'all' ? '全部單字' : selectedCategory === 'uncategorized' ? '未分類' : selectedCategory}
              </span>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200/70 dark:border-slate-700">
              <span className="text-[11px] text-slate-400 block font-semibold">正確率</span>
              <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                {sessionRecords.length > 0
                  ? Math.round((correctRecords.length / sessionRecords.length) * 100)
                  : 0}
                %
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200/70 dark:border-slate-700">
              <span className="text-[11px] text-slate-400 block font-semibold">平均耗時</span>
              <span className="text-xl sm:text-2xl font-black text-teal-600 dark:text-teal-400 tabular-nums">
                {avgTime}s
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200/70 dark:border-slate-700">
              <span className="text-[11px] text-slate-400 block font-semibold">完成題數</span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                {sessionRecords.length} 題
              </span>
            </div>
          </div>

          {/* Speed & Mastery Distribution Breakdown */}
          <div className="space-y-2.5 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-xs">
            <div className="font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
              <span>反應時長熟練度分佈：</span>
              <span className="text-slate-400 text-[11px]">共 {sessionRecords.length} 題</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                <span className="flex items-center gap-1">
                  <span>⚡ 秒殺精通 (Easy)</span>
                </span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                  {speedBreakdown.easy} 題
                </strong>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                <span className="flex items-center gap-1">
                  <span>👍 良好流暢 (Good)</span>
                </span>
                <strong className="text-blue-600 dark:text-blue-400 font-bold tabular-nums">
                  {speedBreakdown.good} 題
                </strong>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                <span className="flex items-center gap-1">
                  <span>💡 思考較久 (Hard)</span>
                </span>
                <strong className="text-amber-600 dark:text-amber-400 font-bold tabular-nums">
                  {speedBreakdown.hard} 題
                </strong>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                <span className="flex items-center gap-1">
                  <span>❌ 答錯需加強</span>
                </span>
                <strong className="text-rose-600 dark:text-rose-400 font-bold tabular-nums">
                  {speedBreakdown.missed} 題
                </strong>
              </div>
            </div>
          </div>

          {/* Wrong words list if any */}
          {speedBreakdown.missed > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span>本次答錯單字清單 ({speedBreakdown.missed})：</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {sessionRecords
                  .filter((r) => !r.isCorrect)
                  .map((rec, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white mr-1.5">
                          {rec.word.term}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase mr-1">
                          [{rec.word.pos}]
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {getWordDisplayDef(rec.word, settings.lang)}
                        </span>
                      </div>
                      <button
                        onClick={() => tts.speak(rec.word.term)}
                        className="p-1 text-slate-400 hover:text-indigo-600"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Action CTAs */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            {speedBreakdown.missed > 0 && (
              <button
                onClick={handleRetryWrongWords}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition shadow"
              >
                <RotateCcw className="w-4 h-4" />
                <span>針對答錯單字重測 ({speedBreakdown.missed})</span>
              </button>
            )}

            <button
              onClick={handleRestart}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition shadow"
            >
              <RotateCcw className="w-4 h-4" />
              <span>再測一輪 (相同設定)</span>
            </button>

            <button
              onClick={() => {
                setIsSessionFinished(false);
                setIsSessionActive(false);
              }}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white rounded-xl text-xs sm:text-sm font-bold transition"
            >
              調整熟練度或題型
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
