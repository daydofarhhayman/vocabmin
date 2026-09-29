import { POS } from '../types';

/**
 * Standardize any arbitrary part-of-speech string from AI or user inputs
 * into one of VocabMin's recognized POS types: 'n.' | 'v.' | 'adj.' | 'adv.' | 'phr.' | 'other'
 */
export function normalizePos(posStr?: string): POS {
  if (!posStr) return 'n.';
  const p = posStr.trim().toLowerCase();
  if (p === 'n.' || p === 'n' || p.startsWith('n ') || p.includes('noun') || p.includes('名詞')) return 'n.';
  if (p === 'v.' || p === 'v' || p.startsWith('v ') || p.includes('verb') || p.includes('動詞')) return 'v.';
  if (p === 'adj.' || p === 'adj' || p.startsWith('adj ') || p.includes('adjective') || p.includes('形容詞')) return 'adj.';
  if (p === 'adv.' || p === 'adv' || p.startsWith('adv ') || p.includes('adverb') || p.includes('副詞')) return 'adv.';
  if (p === 'phr.' || p === 'phr' || p.startsWith('phr ') || p.includes('phrase') || p.includes('片語') || p.includes('詞組') || p.includes('短語')) return 'phr.';
  return 'other';
}
