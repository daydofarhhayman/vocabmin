import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Volume2,
  CheckCircle,
  XCircle,
  RotateCcw,
  ArrowRight,
  Trophy,
  Flame,
  HelpCircle,
  Ear,
  PenTool,
  Check
} from 'lucide-react';
import { Word, QuizType, AppSettings } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { tts } from '../services/tts';
import { getWordDisplayDef, getWordSecondaryDef } from '../utils/wordLang';
import confetti from 'canvas-confetti';

interface QuizViewProps {
  words: Word[];
  settings: AppSettings;
  onRecordQuizActivity: (score: number) => void;
  onBack: () => void;
}

interface Question {
  word: Word;
  type: QuizType;
  options: string[];
  correctIndex: number;
}

export const QuizView: React.FC<QuizViewProps> = ({
  words,
  settings,
  onRecordQuizActivity,
  onBack
}) => {
  const t = TRANSLATIONS[settings.lang];
  const [selectedType, setSelectedType] = useState<QuizType>('meaning');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [isQuizFinished, setIsQuizFinished] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [spellingInput, setSpellingInput] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [wrongWords, setWrongWords] = useState<Word[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Start a new quiz session
  const startQuiz = () => {
    if (words.length < 4) {
      return;
    }

    // Shuffle words
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(questionCount, shuffled.length));

    const generated: Question[] = chosen.map((w) => {
      // Pick 3 random distractor words
      const others = words.filter((item) => item.id !== w.id && item.term !== w.term);
      const shuffledOthers = [...others].sort(() => Math.random() - 0.5).slice(0, 3);

      if (selectedType === 'meaning') {
        const correctDef = getWordDisplayDef(w, settings.lang);
        const distractors = shuffledOthers.map((o) => getWordDisplayDef(o, settings.lang));
        const allOptions = [...distractors, correctDef].sort(() => Math.random() - 0.5);
        const correctIndex = allOptions.indexOf(correctDef);
        return {
          word: w,
          type: 'meaning',
          options: allOptions,
          correctIndex
        };
      } else if (selectedType === 'listening') {
        const distractors = shuffledOthers.map((o) => o.term);
        const allOptions = [...distractors, w.term].sort(() => Math.random() - 0.5);
        const correctIndex = allOptions.indexOf(w.term);
        return {
          word: w,
          type: 'listening',
          options: allOptions,
          correctIndex
        };
      } else {
        // Spelling
        return {
          word: w,
          type: 'spelling',
          options: [],
          correctIndex: 0
        };
      }
    });

    setQuestions(generated);
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setWrongWords([]);
    setSelectedOption(null);
    setSpellingInput('');
    setIsAnswered(false);
    setIsQuizActive(true);
    setIsQuizFinished(false);
  };

  const currentQ = questions[currentIndex];

  // Auto pronounce on listening questions
  useEffect(() => {
    if (isQuizActive && currentQ && currentQ.type === 'listening' && !isAnswered) {
      tts.speak(currentQ.word.term);
    }
  }, [isQuizActive, currentIndex, currentQ, isAnswered]);

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);

    const correct = idx === currentQ.correctIndex;
    setIsCorrect(correct);

    if (correct) {
      setScore((s) => s + 10 + streak * 2);
      setStreak((st) => {
        const next = st + 1;
        setMaxStreak((m) => Math.max(m, next));
        return next;
      });
      // Play audio on correct
      tts.speak(currentQ.word.term);
    } else {
      setStreak(0);
      setWrongWords((ww) => [...ww, currentQ.word]);
    }
  };

  const handleSpellingSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !spellingInput.trim()) return;

    setIsAnswered(true);
    const correct = spellingInput.trim().toLowerCase() === currentQ.word.term.trim().toLowerCase();
    setIsCorrect(correct);

    if (correct) {
      setScore((s) => s + 15 + streak * 2);
      setStreak((st) => {
        const next = st + 1;
        setMaxStreak((m) => Math.max(m, next));
        return next;
      });
      tts.speak(currentQ.word.term);
    } else {
      setStreak(0);
      setWrongWords((ww) => [...ww, currentQ.word]);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 >= questions.length) {
      setIsQuizFinished(true);
      setIsQuizActive(false);
      onRecordQuizActivity(score);
      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch {}
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setSpellingInput('');
      setIsAnswered(false);
      setIsCorrect(false);
    }
  };

  // Setup / Welcome Screen
  if (!isQuizActive && !isQuizFinished) {
    const isEligible = words.length >= 4;

    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-6 animate-enter max-w-2xl mx-auto px-4 w-full">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-700 w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/20">
            <Sparkles className="w-8 h-8" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
            {t.quiz_title}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">{t.quiz_subtitle}</p>

          {!isEligible ? (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm text-center mb-6">
              單字庫中至少需要 4 個單字才能生成測驗選項。請先新增單字或匯入範例詞庫！
            </div>
          ) : (
            <div className="space-y-6 text-left">
              {/* Quiz Type Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  選擇測驗題型
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedType('meaning')}
                    className={`p-4 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                      selectedType === 'meaning'
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 text-indigo-900 dark:text-indigo-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <HelpCircle className="w-5 h-5 text-indigo-500 mb-2" />
                    <span className="font-bold text-sm block">{t.quiz_type_meaning}</span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      根據英文單字選出最相符的中文釋義
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedType('spelling')}
                    className={`p-4 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                      selectedType === 'spelling'
                        ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-900 dark:text-purple-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-purple-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <PenTool className="w-5 h-5 text-purple-500 mb-2" />
                    <span className="font-bold text-sm block">{t.quiz_type_spelling}</span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      看中文解釋主動輸入拼寫單字
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedType('listening')}
                    className={`p-4 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                      selectedType === 'listening'
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-500 text-teal-900 dark:text-teal-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:border-teal-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Ear className="w-5 h-5 text-teal-500 mb-2" />
                    <span className="font-bold text-sm block">{t.quiz_type_listening}</span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      聽英語發音選出正確對應單字
                    </span>
                  </button>
                </div>
              </div>

              {/* Question Count Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                  測驗題數
                </label>
                <div className="flex gap-2">
                  {[5, 10, 20, 30].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuestionCount(num)}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition ${
                        questionCount === num
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {num} 題
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Button */}
              <button
                onClick={startQuiz}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:opacity-95 text-white font-extrabold rounded-2xl shadow-xl shadow-indigo-500/20 text-base transition active:scale-95 flex items-center justify-center gap-2 mt-4"
              >
                <Sparkles className="w-5 h-5" />
                <span>開始隨堂測驗</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Quiz Finish / Results Screen
  if (isQuizFinished) {
    const totalQuestions = questions.length;
    const correctCount = totalQuestions - wrongWords.length;
    const accuracy = Math.round((correctCount / totalQuestions) * 100);

    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-6 animate-enter max-w-2xl mx-auto px-4 w-full">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-700 w-full text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-500 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-1">
            測驗完成！
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            精彩的表現！持續練習能強化大腦神經元對單字的長期記憶連結。
          </p>

          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700 mb-6">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">總得分</span>
              <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                {score}
              </div>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">正確率</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {accuracy}%
              </div>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase">最高連勝</span>
              <div className="text-2xl font-black text-amber-500 flex items-center justify-center gap-1">
                <Flame className="w-5 h-5" />
                <span>{maxStreak}</span>
              </div>
            </div>
          </div>

          {/* Missed Words Section */}
          {wrongWords.length > 0 && (
            <div className="mb-6 text-left">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500 mb-2 flex items-center gap-1">
                <XCircle className="w-4 h-4" />
                <span>需要加強的單字 ({wrongWords.length})</span>
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                {wrongWords.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/40 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {w.term}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-300">
                          {w.pos}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{getWordDisplayDef(w, settings.lang)}</p>
                    </div>
                    <button
                      onClick={() => tts.speak(w.term)}
                      className="p-2 text-slate-400 hover:text-indigo-600"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={startQuiz}
              className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition active:scale-95 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t.quiz_restart}</span>
            </button>
            <button
              onClick={() => {
                setIsQuizActive(false);
                setIsQuizFinished(false);
              }}
              className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition"
            >
              完成並返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active Quiz View
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] py-4 animate-enter max-w-xl mx-auto px-4 w-full">
      {/* Quiz Top bar: Progress, Score & Streak */}
      <div className="w-full flex items-center justify-between mb-4">
        {showExitConfirm ? (
          <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/40 p-1 rounded-xl border border-rose-200 dark:border-rose-900/50">
            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 pl-1">確定離開？</span>
            <button
              onClick={() => {
                setShowExitConfirm(false);
                setIsQuizActive(false);
              }}
              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold transition shadow-xs"
            >
              離開
            </button>
            <button
              onClick={() => setShowExitConfirm(false)}
              className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold transition"
            >
              繼續
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowExitConfirm(true)}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5"
          >
            離開測驗
          </button>
        )}

        <div className="flex items-center gap-3">
          {streak > 1 && (
            <div className="flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 animate-pulse">
              <Flame className="w-3.5 h-3.5 fill-amber-500" />
              <span>{streak} 連勝!</span>
            </div>
          )}
          <span className="text-xs font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full">
            得分: {score}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        ></div>
      </div>

      {/* Question Card */}
      <div className="w-full bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-700">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>
            題目 {currentIndex + 1} / {questions.length}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 uppercase">
            {currentQ.type}
          </span>
        </div>

        {/* Prompt */}
        <div className="my-6 text-center">
          {currentQ.type === 'meaning' && (
            <div>
              <p className="text-xs text-slate-400 mb-2">{t.quiz_prompt_meaning}</p>
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  {currentQ.word.term}
                </h2>
                <button
                  type="button"
                  onClick={() => tts.speak(currentQ.word.term)}
                  className="p-2 text-indigo-500 hover:scale-110 active:scale-95 transition"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </div>
              <span className="inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                {currentQ.word.pos}
              </span>
            </div>
          )}

          {currentQ.type === 'listening' && (
            <div>
              <p className="text-xs text-slate-400 mb-4">{t.quiz_prompt_listening}</p>
              <button
                type="button"
                onClick={() => tts.speak(currentQ.word.term)}
                className="w-20 h-20 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 mx-auto flex items-center justify-center hover:scale-110 active:scale-95 transition shadow-lg shadow-teal-500/10 mb-2"
                title="重新聆聽發音"
              >
                <Volume2 className="w-10 h-10" />
              </button>
              <span className="text-xs text-slate-400 font-medium">點擊重新聆聽</span>
            </div>
          )}

          {currentQ.type === 'spelling' && (
            <div>
              <p className="text-xs text-slate-400 mb-2">{t.quiz_prompt_spelling}</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1">
                {getWordDisplayDef(currentQ.word, settings.lang)}
              </h3>
              {getWordSecondaryDef(currentQ.word, settings.lang) && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  ({getWordSecondaryDef(currentQ.word, settings.lang)})
                </p>
              )}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
                <span>[ {currentQ.word.pos} ]</span>
                <span>長度: {currentQ.word.term.length} 個字母</span>
              </div>
            </div>
          )}
        </div>

        {/* Options for Multiple Choice or Listening */}
        {(currentQ.type === 'meaning' || currentQ.type === 'listening') && (
          <div className="space-y-3">
            {currentQ.options.map((opt, idx) => {
              let btnClass =
                'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-indigo-50/50 dark:hover:bg-slate-700';

              if (isAnswered) {
                if (idx === currentQ.correctIndex) {
                  btnClass =
                    'bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.02]';
                } else if (idx === selectedOption) {
                  btnClass = 'bg-rose-500 text-white border-rose-500';
                } else {
                  btnClass = 'opacity-40 border-slate-200 dark:border-slate-700';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => handleSelectOption(idx)}
                  className={`w-full p-4 rounded-2xl border text-left font-bold text-sm sm:text-base transition-all flex items-center justify-between ${btnClass}`}
                >
                  <span className="flex-1 pr-2">{opt}</span>
                  {isAnswered && idx === currentQ.correctIndex && (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  {isAnswered && idx === selectedOption && idx !== currentQ.correctIndex && (
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Spelling Input */}
        {currentQ.type === 'spelling' && (
          <form onSubmit={handleSpellingSubmit} className="space-y-4">
            <div className="relative">
              <input
                type="text"
                autoFocus
                disabled={isAnswered}
                value={spellingInput}
                onChange={(e) => setSpellingInput(e.target.value)}
                placeholder="在此輸入正確英文單字..."
                className={`w-full p-4 rounded-2xl border-2 font-mono text-lg font-bold outline-none text-center transition ${
                  isAnswered
                    ? isCorrect
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600'
                      : 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-600'
                    : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 dark:focus:border-indigo-500 bg-slate-50 dark:bg-slate-700/50'
                }`}
              />
            </div>

            {!isAnswered ? (
              <button
                type="submit"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition active:scale-95"
              >
                確認送出答案
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700/50 text-center">
                <span className="text-xs text-slate-400 block mb-1">正確答案是</span>
                <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                  {currentQ.word.term}
                </span>
              </div>
            )}
          </form>
        )}

        {/* Next Question Button */}
        {isAnswered && (
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 animate-enter flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isCorrect ? (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-4 h-4" /> 回答正確！
                </span>
              ) : (
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <XCircle className="w-4 h-4" /> 記起來，下次一定會！
                </span>
              )}
            </div>

            <button
              onClick={handleNextQuestion}
              className="px-6 py-2.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
            >
              <span>{currentIndex + 1 >= questions.length ? '查看結算成績' : '下一題'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
