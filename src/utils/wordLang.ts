import { Word } from '../types';

/**
 * Returns the primary definition to display based on the user's language setting.
 * When lang is 'en', returns English definition (defEn), falling back to Chinese definition (def).
 * When lang is 'zh', returns Chinese definition (def), falling back to English definition (defEn).
 */
export function getWordDisplayDef(
  word: { def?: string; defEn?: string } | Partial<Word> | undefined | null,
  lang: 'zh' | 'en' = 'zh'
): string {
  if (!word) return '';
  if (lang === 'en') {
    return (word.defEn && word.defEn.trim()) || (word.def && word.def.trim()) || '';
  }
  return (word.def && word.def.trim()) || (word.defEn && word.defEn.trim()) || '';
}

/**
 * Returns the secondary definition if available and distinct from the primary.
 * When lang is 'en', returns Chinese definition (def).
 * When lang is 'zh', returns English definition (defEn).
 */
export function getWordSecondaryDef(
  word: { def?: string; defEn?: string } | Partial<Word> | undefined | null,
  lang: 'zh' | 'en' = 'zh'
): string | undefined {
  if (!word) return undefined;
  const defZh = word.def?.trim();
  const defEn = word.defEn?.trim();

  if (lang === 'en') {
    if (defZh && defZh !== defEn) return defZh;
    return undefined;
  } else {
    if (defEn && defEn !== defZh) return defEn;
    return undefined;
  }
}

/**
 * Safe fallback distractors when user's vocabulary library or filtered category
 * does not have enough distinct words to form 4 non-overlapping options.
 */
export const SAFE_QUIZ_FALLBACK_DISTRACTORS: Record<'zh' | 'en', string[]> = {
  zh: [
    '持續堅持與專注',
    '微小但明確的進展',
    '深刻而清晰的認知',
    '靈光一現的巧思',
    '廣泛涉獵各領域',
    '縝密審視細節',
    '靈活調適與應對',
    '嚴謹客觀的分析',
    '突破常規的視角',
    '沉著穩健的決策',
    '深遠悠長的影響',
    '獨樹一幟的風格'
  ],
  en: [
    'steadfast persistence and unwavering focus',
    'incremental yet definite progress',
    'profound and crystal-clear understanding',
    'a sudden spark of ingenious insight',
    'broad exploration across diverse domains',
    'meticulous examination of intricate details',
    'flexible adaptation to evolving contexts',
    'rigorous and objective empirical analysis',
    'unconventional and innovative perspective',
    'calm and deliberate decision-making',
    'far-reaching and enduring global impact',
    'distinctive and recognizable aesthetic'
  ]
};

/**
 * Normalizes text for definition comparison (lowercased, trimmed, stripped of punctuation).
 */
export function normalizeDefComparison(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[，,。.;；、/\\()[\]{}'"`~!?？！：:【】「」『』]+/g, '')
    .trim();
}

/**
 * Gathers all registered definition phrases for a given target word across all entries
 * sharing the same term (case-insensitive, trimmed).
 */
export function getAllRegisteredDefsForWord(
  targetWord: Word,
  allWords: Word[],
  lang: 'zh' | 'en' = 'zh'
): {
  sameTermEntries: Word[];
  forbiddenDefs: Set<string>;
  forbiddenNormalizedDefs: Set<string>;
} {
  const normTerm = targetWord.term.trim().toLowerCase();
  const sameTermEntries = allWords.filter(
    (w) => w.term.trim().toLowerCase() === normTerm
  );

  const forbiddenDefs = new Set<string>();
  const forbiddenNormalizedDefs = new Set<string>();

  const addDef = (raw?: string) => {
    if (!raw) return;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return;
    forbiddenDefs.add(trimmed);
    const norm = normalizeDefComparison(trimmed);
    if (norm) forbiddenNormalizedDefs.add(norm);

    // Split multi-part definitions (e.g., "預訂；預約" -> "預訂", "預約")
    const parts = trimmed.split(/[；;、,/，\n]+/);
    parts.forEach((p) => {
      const pt = p.trim().toLowerCase();
      if (pt.length >= 2) {
        forbiddenDefs.add(pt);
        const normPt = normalizeDefComparison(pt);
        if (normPt) forbiddenNormalizedDefs.add(normPt);
      }
    });
  };

  sameTermEntries.forEach((entry) => {
    addDef(entry.def);
    addDef(entry.defEn);
    addDef(getWordDisplayDef(entry, lang));
    addDef(getWordSecondaryDef(entry, lang));
  });

  return { sameTermEntries, forbiddenDefs, forbiddenNormalizedDefs };
}

/**
 * Checks if a candidate distractor definition conflicts with or substantially overlaps
 * with any of the target word's registered definitions.
 */
export function isDefConflictingWithTarget(
  candidateText: string,
  forbiddenDefs: Set<string>,
  forbiddenNormalizedDefs: Set<string>
): boolean {
  if (!candidateText || !candidateText.trim()) return true;
  const clean = candidateText.trim().toLowerCase();
  if (forbiddenDefs.has(clean)) return true;

  const norm = normalizeDefComparison(clean);
  if (norm && forbiddenNormalizedDefs.has(norm)) return true;

  for (const f of forbiddenNormalizedDefs) {
    if (f.length >= 2 && norm.length >= 2) {
      if (norm === f || norm.includes(f) || f.includes(norm)) {
        return true;
      }
    }
  }
  return false;
}

export interface SafeQuizOptionsResult {
  options: string[];
  correctOptionIndex: number;
  acceptableOptionIndices: number[];
  sameTermEntries: Word[];
}

/**
 * Generates 4 strictly non-overlapping multiple-choice options for a target word.
 * - Guarantees that distractors NEVER include any of the target word's definitions in the library.
 * - Guarantees that all 4 options are distinct and unique.
 * - Uses curated safe fallbacks if candidate pool is too small.
 */
export function generateSafeQuizOptions(
  targetWord: Word,
  allWords: Word[],
  lang: 'zh' | 'en' = 'zh'
): SafeQuizOptionsResult {
  const { sameTermEntries, forbiddenDefs, forbiddenNormalizedDefs } =
    getAllRegisteredDefsForWord(targetWord, allWords, lang);

  const targetDef = getWordDisplayDef(targetWord, lang);
  const normTerm = targetWord.term.trim().toLowerCase();

  const chosenDistractors: string[] = [];
  const seenOptionTexts = new Set<string>();
  seenOptionTexts.add(normalizeDefComparison(targetDef));

  // 1. Shuffle all words to pick random distractors
  const shuffledCandidates = [...allWords].sort(() => Math.random() - 0.5);

  for (const candidate of shuffledCandidates) {
    if (candidate.term.trim().toLowerCase() === normTerm) continue;
    const candDef = getWordDisplayDef(candidate, lang);
    if (!candDef || !candDef.trim()) continue;

    const normCandDef = normalizeDefComparison(candDef);
    if (seenOptionTexts.has(normCandDef)) continue;

    if (isDefConflictingWithTarget(candDef, forbiddenDefs, forbiddenNormalizedDefs)) {
      continue;
    }

    seenOptionTexts.add(normCandDef);
    chosenDistractors.push(candDef);
    if (chosenDistractors.length >= 3) break;
  }

  // 2. Fallbacks if we still don't have 3 distractors
  const fallbackList = SAFE_QUIZ_FALLBACK_DISTRACTORS[lang] || SAFE_QUIZ_FALLBACK_DISTRACTORS.zh;
  const shuffledFallbacks = [...fallbackList].sort(() => Math.random() - 0.5);

  for (const fb of shuffledFallbacks) {
    if (chosenDistractors.length >= 3) break;
    const normFb = normalizeDefComparison(fb);
    if (seenOptionTexts.has(normFb)) continue;
    if (isDefConflictingWithTarget(fb, forbiddenDefs, forbiddenNormalizedDefs)) continue;

    seenOptionTexts.add(normFb);
    chosenDistractors.push(fb);
  }

  // 3. Assemble and shuffle all options
  const allOptions = [targetDef, ...chosenDistractors].sort(() => Math.random() - 0.5);
  const correctOptionIndex = allOptions.indexOf(targetDef);

  // 4. Determine acceptable option indices (in case any option matches an entry of this word)
  const acceptableOptionIndices: number[] = [];
  allOptions.forEach((opt, idx) => {
    if (idx === correctOptionIndex) {
      acceptableOptionIndices.push(idx);
    } else {
      const normOpt = normalizeDefComparison(opt);
      if (normOpt && forbiddenNormalizedDefs.has(normOpt)) {
        acceptableOptionIndices.push(idx);
      }
    }
  });

  return {
    options: allOptions,
    correctOptionIndex,
    acceptableOptionIndices,
    sameTermEntries
  };
}

/**
 * Checks if a chosen option matches ANY recorded definition of the target word in library.
 * Returns the matching Word entry if found, or null otherwise.
 */
export function checkPolysemyAnswerMatch(
  targetWord: Word,
  userSelectedText: string,
  allWords: Word[],
  lang: 'zh' | 'en' = 'zh'
): Word | null {
  if (!userSelectedText || !userSelectedText.trim()) return null;
  const normUser = normalizeDefComparison(userSelectedText);
  if (!normUser) return null;

  const normTerm = targetWord.term.trim().toLowerCase();
  const sameTermEntries = allWords.filter(
    (w) => w.term.trim().toLowerCase() === normTerm
  );

  for (const entry of sameTermEntries) {
    const disp = normalizeDefComparison(getWordDisplayDef(entry, lang));
    const rawDef = normalizeDefComparison(entry.def || '');
    const rawEn = normalizeDefComparison(entry.defEn || '');

    if (
      normUser === disp ||
      normUser === rawDef ||
      (rawEn && normUser === rawEn) ||
      (rawDef.length >= 2 && (normUser.includes(rawDef) || rawDef.includes(normUser)))
    ) {
      return entry;
    }
  }

  return null;
}
