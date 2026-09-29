import { Word } from '../types';

/**
 * SuperMemo SM-2 Enhanced Algorithm
 * Rating:
 * 0: Again (Complete blackout / New)
 * 1: Hard (Recalled with struggle)
 * 2: Good (Normal recall with slight hesitation)
 * 3: Easy (Instant, confident recall)
 */
export function calculateNextReview(word: Word, rating: number): {
  interval: number;
  easeFactor: number;
  level: number;
  lastReview: number;
  nextReview: number;
} {
  const now = Date.now();
  let currentInterval = word.interval || 0;
  let easeFactor = word.easeFactor || 2.5;
  let newInterval = 1;

  if (rating === 0) {
    // Again / Missed completely
    newInterval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else if (rating === 1) {
    // Hard
    newInterval = currentInterval <= 1 ? 1 : Math.max(2, Math.round(currentInterval * 1.2));
    easeFactor = Math.max(1.3, easeFactor - 0.15);
  } else if (rating === 2) {
    // Good
    if (currentInterval === 0) {
      newInterval = 1;
    } else if (currentInterval === 1) {
      newInterval = 3;
    } else {
      newInterval = Math.round(currentInterval * easeFactor);
    }
  } else {
    // Easy (Rating 3)
    if (currentInterval === 0) {
      newInterval = 2;
    } else if (currentInterval === 1) {
      newInterval = 4;
    } else {
      newInterval = Math.round(currentInterval * easeFactor * 1.3);
    }
    easeFactor = Math.min(5.0, easeFactor + 0.15);
  }

  // Level classification based on stability interval
  let level = 0;
  if (newInterval >= 60) {
    level = 3; // Mastered
  } else if (newInterval >= 14) {
    level = 2; // Familiar
  } else if (newInterval >= 3) {
    level = 1; // Learning
  } else {
    level = 0; // New
  }

  const nextReview = now + newInterval * 86400000;

  return {
    interval: newInterval,
    easeFactor: parseFloat(easeFactor.toFixed(2)),
    level,
    lastReview: now,
    nextReview
  };
}

/**
 * Check and apply gentle decay for severely overdue cards automatically
 */
export function applySRSDecay(words: Word[]): { updated: Word[]; count: number } {
  const now = Date.now();
  let count = 0;

  const updated = words.map((w) => {
    if (!w.nextReview) return w;
    const overdueDays = (now - w.nextReview) / 86400000;

    // Only apply if overdue by more than 5 days, and step down by 1 level maximum
    if (overdueDays > 5 && w.level > 0) {
      const originalLevel = w.level;
      let newLevel = originalLevel;

      if (overdueDays > 14 && originalLevel >= 2) {
        newLevel = 1;
      } else if (overdueDays > 5 && originalLevel === 3) {
        newLevel = 2;
      }

      if (newLevel !== originalLevel) {
        count++;
        return {
          ...w,
          level: newLevel,
          interval: Math.max(1, Math.round(w.interval * 0.7))
        };
      }
    }
    return w;
  });

  return { updated, count };
}

/**
 * Group words with the same term into a combined structure
 */
export function groupWordsByTerm(words: Word[]): Record<string, Word[]> {
  const groups: Record<string, Word[]> = {};
  for (const w of words) {
    const key = w.term.trim().toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(w);
  }
  return groups;
}
