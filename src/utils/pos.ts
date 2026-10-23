import { POS } from '../types';

/**
 * Standardize any arbitrary part-of-speech string from AI or user inputs
 * into one of VocabMin's recognized POS types: 'n.' | 'v.' | 'adj.' | 'adv.' | 'phr.' | 'other'
 */
export function normalizePos(posStr?: string): POS {
  if (!posStr) return 'n.';
  const p = posStr.trim().toLowerCase();
  if (p === 'phr.' || p === 'phr' || p.startsWith('phr ') || p.includes('phrase') || p.includes('idiom') || p.includes('片語') || p.includes('詞組') || p.includes('短語')) return 'phr.';
  if (p === 'adv.' || p === 'adv' || p.startsWith('adv ') || p.includes('adverb') || p.includes('副詞')) return 'adv.';
  if (p === 'adj.' || p === 'adj' || p.startsWith('adj ') || p.includes('adjective') || p.includes('形容詞')) return 'adj.';
  if (p === 'pron.' || p === 'pron' || p.includes('pronoun') || p.includes('代名詞') || p === 'prep.' || p === 'prep' || p.includes('preposition') || p.includes('介系詞') || p === 'conj.' || p === 'conj' || p.includes('conjunction') || p.includes('連接詞')) return 'other';
  if (p === 'n.' || p === 'n' || p.startsWith('n ') || /\bnoun\b/.test(p) || p.includes('名詞')) return 'n.';
  if (p === 'v.' || p === 'v' || p.startsWith('v ') || p.startsWith('vt') || p.startsWith('vi') || /\bverb\b/.test(p) || p.includes('動詞')) return 'v.';
  return 'other';
}
