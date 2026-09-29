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
