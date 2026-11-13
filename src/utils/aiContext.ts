import { DailyStats, Word } from '../types';

export interface AIStudyContextStats {
  totalWordsCount: number;
  totalDefinitionsCount: number;
  dailyStreak: number;
  levelDistribution: {
    level0: number;
    level1: number;
    level2: number;
    level3: number;
  };
  categoryBreakdown: Record<string, number>;
  existingWordsSummary: Array<{
    term: string;
    pos: string;
    def: string;
    category: string;
    level: number;
  }>;
}

function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildAIStudyContextStats(words: Word[], dailyStats?: DailyStats): AIStudyContextStats {
  const uniqueMap = new Map<string, Word>();
  const minLevelMap = new Map<string, number>();

  for (const w of words) {
    const key = (w.term || '').trim().toLowerCase();
    if (!key) continue;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, w);
      minLevelMap.set(key, w.level ?? 0);
    } else {
      const prevLv = minLevelMap.get(key) ?? 0;
      const currLv = w.level ?? 0;
      if (currLv < prevLv) {
        minLevelMap.set(key, currLv);
      }
    }
  }

  const levelDistribution = { level0: 0, level1: 0, level2: 0, level3: 0 };
  const categoryBreakdown: Record<string, number> = {};
  const existingWordsSummary: AIStudyContextStats['existingWordsSummary'] = [];

  for (const [key, w] of uniqueMap.entries()) {
    const lv = minLevelMap.get(key) ?? 0;
    if (lv <= 0) levelDistribution.level0 += 1;
    else if (lv === 1) levelDistribution.level1 += 1;
    else if (lv === 2) levelDistribution.level2 += 1;
    else levelDistribution.level3 += 1;

    const cat = w.category?.trim() || '未分類';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;

    if (existingWordsSummary.length < 200) {
      existingWordsSummary.push({
        term: w.term,
        pos: w.pos,
        def: w.def,
        category: cat,
        level: lv
      });
    }
  }

  let dailyStreak = 0;
  if (dailyStats) {
    const now = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dKey = formatLocalDateKey(d);
      const s = dailyStats[dKey];
      if (s && (s.reviewed > 0 || s.added > 0 || (s.quizzes || 0) > 0)) {
        dailyStreak += 1;
      } else {
        if (i === 0) continue;
        break;
      }
    }
  }

  return {
    totalWordsCount: uniqueMap.size,
    totalDefinitionsCount: words.length,
    dailyStreak,
    levelDistribution,
    categoryBreakdown,
    existingWordsSummary
  };
}
