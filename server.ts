import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI
const getAIClient = (customKey?: string) => {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Comprehensive Gemini API Error Parser
export interface ParsedAIError {
  userMessage: string;
  statusCode: number;
  reason: string;
  details: string;
  suggestion: string;
}

export function parseGeminiApiError(error: any): ParsedAIError {
  const rawMsg = error?.message || String(error || '');
  const fallbackDetails = (error as any)?.fallbackDetails;
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(rawMsg);
  } catch {
    const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch {}
    }
  }

  const inner = parsedJson?.error || parsedJson || {};
  const statusNumber = inner?.code || error?.status || error?.statusCode || 500;
  const statusStr = String(inner?.status || '');
  const innerMsg = String(inner?.message || rawMsg);
  const detailsArray = Array.isArray(inner?.details) ? inner.details : [];
  const reasonCode = detailsArray[0]?.reason || statusStr || '';

  const fullDetails = fallbackDetails
    ? `${innerMsg}\n\n【模型調度診斷記錄】:\n${fallbackDetails}`
    : innerMsg;

  // 1. API Key Invalid
  if (
    reasonCode === 'API_KEY_INVALID' ||
    innerMsg.includes('API key not valid') ||
    innerMsg.includes('API_KEY_INVALID') ||
    (statusNumber === 400 && innerMsg.toLowerCase().includes('api key'))
  ) {
    return {
      statusCode: 400,
      reason: 'API_KEY_INVALID',
      userMessage: 'Google Gemini API 金鑰無效或不正確',
      details: fullDetails,
      suggestion: '請前往右上角「設定 > 雲端同步與帳號」檢查並重新輸入有效的 Google Gemini API Key。'
    };
  }

  // 2. Permission Denied / Billing
  if (
    statusNumber === 403 ||
    statusStr === 'PERMISSION_DENIED' ||
    innerMsg.includes('PERMISSION_DENIED')
  ) {
    return {
      statusCode: 403,
      reason: 'PERMISSION_DENIED',
      userMessage: 'Gemini API 存取權限不足或所在地區受限',
      details: fullDetails,
      suggestion: '請確認您的 Google AI Studio 帳號已啟用 Generative Language API，且未受到地區或組織存取限制。'
    };
  }

  // 3. Quota Exceeded / Rate Limit
  if (
    statusNumber === 429 ||
    statusStr === 'RESOURCE_EXHAUSTED' ||
    innerMsg.includes('429') ||
    innerMsg.includes('RESOURCE_EXHAUSTED') ||
    innerMsg.includes('Quota exceeded') ||
    innerMsg.toLowerCase().includes('quota')
  ) {
    return {
      statusCode: 429,
      reason: 'RESOURCE_EXHAUSTED',
      userMessage: 'Google AI 請求配額已達頻率上限 (Rate Limit)',
      details: fullDetails,
      suggestion: 'Google 免費版 API 每分鐘有 15 次請求上限。請稍候 10~20 秒後再次嘗試，或於「設定」中更換為個人的付費/專屬 API Key。'
    };
  }

  // 4. Model Not Found
  if (
    statusNumber === 404 ||
    statusStr === 'NOT_FOUND' ||
    innerMsg.includes('not found') ||
    innerMsg.includes('NOT_FOUND')
  ) {
    return {
      statusCode: 404,
      reason: 'MODEL_NOT_FOUND',
      userMessage: '指定的 Gemini AI 模型不存在或已停止維護',
      details: fullDetails,
      suggestion: '系統已自動嘗試 gemini-3.5-flash / gemini-3.8-flash 等官方穩定模型均未回應。請稍後重試，或於「設定」中檢查您的 API Key 權限。'
    };
  }

  // 5. Server Unavailable / High Demand
  if (
    statusNumber === 503 ||
    statusStr === 'UNAVAILABLE' ||
    innerMsg.includes('UNAVAILABLE') ||
    innerMsg.includes('high demand')
  ) {
    return {
      statusCode: 503,
      reason: 'UNAVAILABLE',
      userMessage: 'Google 官方 AI 伺服器節點短暫高負載',
      details: fullDetails,
      suggestion: 'Google 伺服器忙碌中，請間隔 5~10 秒後點擊重試。'
    };
  }

  // 6. Network Timeout / Connection Error
  if (
    innerMsg.includes('fetch failed') ||
    innerMsg.includes('ENOTFOUND') ||
    innerMsg.includes('ETIMEDOUT') ||
    innerMsg.includes('ECONNREFUSED')
  ) {
    return {
      statusCode: 504,
      reason: 'NETWORK_ERROR',
      userMessage: '無法連線至 Google Gemini 官方伺服器',
      details: fullDetails,
      suggestion: '請檢查伺服器主機的網際網路連線或 Proxy/VPN 設定是否正常。'
    };
  }

  // 7. General Fallback with real error details
  return {
    statusCode: typeof statusNumber === 'number' && statusNumber >= 400 && statusNumber < 600 ? statusNumber : 500,
    reason: reasonCode || 'UNKNOWN_ERROR',
    userMessage: 'AI 助手在處理您的請求時發生錯誤',
    details: fullDetails,
    suggestion: '請稍候重試。若問題持續發生，請於「設定」中檢查您的 API Key 設定。'
  };
}

// Helper: Try official models with retry and graceful fallback
async function generateWithModelFallback(
  ai: GoogleGenAI,
  config: any,
  contents: any,
  preferredModels = [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-4-argon'
  ]
) {
  let lastError: any = null;
  let quotaExhaustedError: any = null;
  const attemptedLog: string[] = [];

  for (const model of preferredModels) {
    let isFatalKeyError = false;
    let isQuotaExhausted = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config
        });
        if (response) {
          console.log(`[Gemini Fallback] Successfully generated content using model: ${model}`);
          return response;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        attemptedLog.push(`[${model}] Attempt ${attempt + 1}: ${errMsg}`);
        console.warn(`[Gemini Fallback] Model ${model} (attempt ${attempt + 1}) failed:`, errMsg);

        // If API key is invalid or permission denied, no need to loop other models
        if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid') || errMsg.includes('PERMISSION_DENIED')) {
          isFatalKeyError = true;
          break;
        }

        // If model is discontinued or not found, break immediately to try next fallback model
        if (errMsg.includes('not found') || errMsg.includes('NOT_FOUND') || errMsg.includes('404')) {
          break;
        }

        const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota exceeded') || errMsg.toLowerCase().includes('quota');
        if (is429) {
          quotaExhaustedError = err;
          isQuotaExhausted = true;
          break;
        }

        // If schema invalid (400), try fallback config without responseSchema on attempt 1
        if (attempt === 0 && (errMsg.includes('INVALID_ARGUMENT') || errMsg.includes('schema') || errMsg.includes('propertyOrdering')) && config?.responseSchema) {
          try {
            console.warn(`[Gemini Fallback] Retrying ${model} without responseSchema...`);
            const fallbackConfig = { ...config };
            delete fallbackConfig.responseSchema;
            const fallbackRes = await ai.models.generateContent({
              model,
              contents,
              config: fallbackConfig
            });
            if (fallbackRes) return fallbackRes;
          } catch (schemaErr: any) {
            // continue normal flow
          }
        }

        await new Promise((res) => setTimeout(res, 500));
      }
    }

    if (isFatalKeyError) {
      throw lastError;
    }
    if (isQuotaExhausted) continue;
  }

  // Prioritize Quota Exhausted error if any model hit 429 so quota limit is not masked by 404
  const errorToThrow = quotaExhaustedError || lastError || new Error('所有可用 Gemini 模型皆無回應，請稍後重試。');
  if (attemptedLog.length > 0) {
    (errorToThrow as any).fallbackDetails = attemptedLog.join('\n');
  }
  throw errorToThrow;
}

// Helper: Reliable bilingual word details lookup (Google Translate + Datamuse linguistic dictionary)
// Ensures that Traditional Chinese definition, English definition, and POS are ALWAYS accurately populated,
// even if AI quota is exhausted, key is not provided, or AI service is temporarily unavailable.
async function fetchBilingualWordDetails(
  cleanWord: string,
  contextSentence?: string
): Promise<{
  term: string;
  pos: string;
  def: string;
  defEn: string;
  phonetic: string;
  ex: string;
  exZh: string;
}> {
  let defZh = '';
  let defEn = '';
  let pos = 'n.';
  let phonetic = '';
  let ex = '';
  let exZh = '';

  try {
    const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&dt=bd&dt=md&q=${encodeURIComponent(cleanWord)}`;
    const res = await fetch(transUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (res.ok) {
      const data = await res.json();
      defZh = data[0]?.[0]?.[0] || '';

      if (Array.isArray(data[12])) {
        for (const group of data[12]) {
          if (group[0]) {
            const p = String(group[0]).toLowerCase();
            if (p.includes('adverb')) pos = 'adv.';
            else if (p.includes('adjective')) pos = 'adj.';
            else if (p.includes('phrasal') || p.includes('preposition') || p.includes('phrase') || p.includes('idiom')) pos = 'phr.';
            else if (p.includes('pronoun')) pos = 'other';
            else if (p.includes('verb')) pos = 'v.';
            else if (p.includes('noun')) pos = 'n.';
          }
          if (Array.isArray(group[1]) && group[1][0] && group[1][0][0]) {
            defEn = String(group[1][0][0]).trim();
            break;
          }
        }
      }

      if (pos === 'n.' && Array.isArray(data[1]) && data[1][0] && data[1][0][0]) {
        const p = String(data[1][0][0]).toLowerCase();
        if (p.includes('adverb')) pos = 'adv.';
        else if (p.includes('adjective')) pos = 'adj.';
        else if (p.includes('verb')) pos = 'v.';
      }
    }
  } catch (e) {
    console.warn('Translate lookup fallback error:', e);
  }

  // If defEn is still empty, query Datamuse linguistic dictionary API
  if (!defEn) {
    const candidateWords = [cleanWord];
    if (cleanWord.endsWith('men')) candidateWords.push(cleanWord.slice(0, -3) + 'man');
    if (cleanWord.endsWith('ies')) candidateWords.push(cleanWord.slice(0, -3) + 'y');
    if (cleanWord.endsWith('es')) candidateWords.push(cleanWord.slice(0, -2));
    if (cleanWord.endsWith('s')) candidateWords.push(cleanWord.slice(0, -1));
    if (cleanWord.endsWith('ed')) candidateWords.push(cleanWord.slice(0, -2), cleanWord.slice(0, -1));
    if (cleanWord.endsWith('ing')) candidateWords.push(cleanWord.slice(0, -3), cleanWord.slice(0, -3) + 'e');

    for (const targetWord of candidateWords) {
      if (defEn) break;
      try {
        const dmRes = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(targetWord)}&md=d`, {
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });
        if (dmRes.ok) {
          const dmData = await dmRes.json();
          if (Array.isArray(dmData) && dmData[0]?.defs && Array.isArray(dmData[0].defs)) {
            const firstDef = dmData[0].defs[0];
            if (firstDef) {
              const parts = firstDef.split('\t');
              if (parts.length > 1) {
                const dmPos = parts[0];
                if (dmPos === 'n') pos = 'n.';
                else if (dmPos === 'v') pos = 'v.';
                else if (dmPos === 'adj') pos = 'adj.';
                else if (dmPos === 'adv') pos = 'adv.';
                defEn = parts.slice(1).join(' ').trim();
              } else {
                defEn = firstDef.trim();
              }
              if (targetWord !== cleanWord && defEn) {
                defEn = `(plural or form of ${targetWord}) ${defEn}`;
              }
            }
          }
        }
      } catch (e) {
        console.warn('Datamuse lookup error:', e);
      }
    }
  }

  // Ensure defZh is not simply the raw English word itself
  if (!defZh || defZh.trim().toLowerCase() === cleanWord.toLowerCase()) {
    try {
      const simpleTrans = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(cleanWord)}`);
      if (simpleTrans.ok) {
        const simpleData = await simpleTrans.json();
        const translated = simpleData[0]?.[0]?.[0] || '';
        if (translated && translated.toLowerCase() !== cleanWord.toLowerCase()) {
          defZh = translated;
        }
      }
    } catch {}
  }

  // Contextual example sentence
  if (contextSentence && contextSentence.trim().length > 10) {
    const s = contextSentence.trim();
    if (s.length <= 160) {
      ex = s;
    } else {
      const sentences = s.split(/(?<=[.!?])\s+/);
      const escapedWord = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matched = sentences.find((sub) => new RegExp(`\\b${escapedWord}\\b`, 'i').test(sub));
      ex = matched && matched.length <= 160 ? matched : s.slice(0, 140) + '...';
    }
  } else {
    ex = `The word "${cleanWord}" is commonly used in English conversations and reading.`;
  }

  // Translate example sentence to Traditional Chinese
  if (ex) {
    try {
      const exRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(ex)}`);
      if (exRes.ok) {
        const exData = await exRes.json();
        exZh = exData[0]?.[0]?.[0] || '';
      }
    } catch {}
  }

  return {
    term: cleanWord,
    pos: pos || 'n.',
    def: defZh || `【${cleanWord}】`,
    defEn: defEn || `Definition and usage for "${cleanWord}" in context.`,
    phonetic,
    ex: ex || `This is an example sentence using ${cleanWord}.`,
    exZh: exZh || ''
  };
}

// Helper: Fast generation of English definitions (defEn)
async function enrichWordsWithEnglishDefinitions(ai: GoogleGenAI, words: any[]) {
  if (!words || words.length === 0) return [];
  try {
    const wordList = words.map((w) => ({
      id: w.id,
      term: w.term,
      pos: w.pos || 'n.',
      def: w.def || '',
      defEn: w.defEn || '',
      ex: w.ex || '',
      level: w.level !== undefined ? w.level : 0
    }));

    const prompt = `Provide clear, authentic English definitions (defEn) in English for each of these English vocabulary words.
Return JSON array with "term" and "defEn":
${JSON.stringify(wordList.map((w) => ({ term: w.term, pos: w.pos, def: w.def })))}`;

    const response = await generateWithModelFallback(
      ai,
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              defEn: { type: Type.STRING }
            },
            required: ['term', 'defEn']
          }
        }
      },
      prompt
    );

    const parsed = JSON.parse(response.text || '[]');
    const enMap = new Map<string, string>();
    if (Array.isArray(parsed)) {
      parsed.forEach((item: any) => {
        if (item.term && item.defEn) {
          enMap.set(item.term.trim().toLowerCase(), item.defEn.trim());
        }
      });
    }

    return wordList.map((w) => ({
      ...w,
      defEn: enMap.get(w.term.trim().toLowerCase()) || w.defEn || ''
    }));
  } catch (err) {
    console.error('Failed to generate defEn:', err);
    return words;
  }
}

// Helper: Validate external URL to prevent SSRF against private/loopback networks
function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Helper: Fetch and extract clean article text from external URL
async function fetchExternalUrlContent(url: string): Promise<{ title: string; text: string } | null> {
  try {
    if (!isSafeExternalUrl(url)) {
      console.warn('Blocked unsafe external URL:', url);
      return null;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/[\r\n\t]+/g, ' ').trim() : '';

    let clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');

    const pMatches = clean.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let extractedText = '';
    if (pMatches && pMatches.length > 0) {
      extractedText = pMatches
        .map((p) => p.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 25)
        .slice(0, 60)
        .join('\n\n');
    }
    if (!extractedText || extractedText.length < 100) {
      extractedText = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 15000);
    }
    return { title, text: extractedText };
  } catch (e) {
    console.warn('Failed to fetch external URL directly:', e);
    return null;
  }
}

// ============================================================================
// VocabMin Next-Gen AI Assistant Engine (Task-Isolated, Zero-Hallucination)
// ============================================================================

function buildCleanContextualGrounding(screenContext: any, currentArticle: any): string {
  const parts: string[] = [];

  if (screenContext) {
    const tabLabels: Record<string, string> = {
      home: '首頁概覽',
      review: 'SRS 間隔重複複習測驗',
      quiz: '多模式隨堂測驗',
      reader: screenContext.isReadingArticle ? '沉浸式雙語文章閱讀' : '文章書架列表',
      list: '個人單字庫管理',
      ai: 'VocabMin AI 語言學習工作台'
    };
    const statsLine = [
      screenContext.currentTab ? `當前畫面：${tabLabels[screenContext.currentTab] || screenContext.currentTab}` : '',
      screenContext.totalWordsCount !== undefined ? `單字總數：${screenContext.totalWordsCount} 個` : '',
      screenContext.dueWordsCount !== undefined ? `待複習：${screenContext.dueWordsCount} 個` : '',
      screenContext.totalArticlesCount !== undefined ? `收錄文章：${screenContext.totalArticlesCount} 篇` : '',
      screenContext.dailyStreak !== undefined ? `連續學習：${screenContext.dailyStreak} 天` : ''
    ]
      .filter(Boolean)
      .join(' ｜ ');

    if (statsLine) {
      parts.push(`【使用者目前學習狀態】\n${statsLine}`);
    }

    if (Array.isArray(screenContext.allCategories) && screenContext.allCategories.length > 0) {
      parts.push(`【現有自訂分類】\n${screenContext.allCategories.join('、')}`);
    }

    // Active Quiz / Review Question Grounding
    if (screenContext.activeStudyQuestion) {
      const q = screenContext.activeStudyQuestion;
      parts.push(
        [
          `【使用者當前畫面上的測驗題目（若使用者詢問「這題」、「為什麼」、「這個字」，即指以下內容）】`,
          `- 目標單字：${q.term} (${q.pos || 'n.'}) — ${q.def || ''}${q.defEn ? ` / ${q.defEn}` : ''}`,
          q.sentence ? `- 題目原句："${q.sentence}"` : '',
          Array.isArray(q.options) && q.options.length > 0 ? `- 選項：[${q.options.join(', ')}]` : '',
          `- 作答狀態：${
            q.isAnswered
              ? `已作答（選擇 "${q.userAnswer || ''}"，${q.isCorrect ? '答對' : '答錯'}）`
              : '尚未作答'
          }`
        ]
          .filter(Boolean)
          .join('\n')
      );
    }

    // Active Inspected Word Grounding
    if (screenContext.activeInspectedWord) {
      parts.push(
        `【使用者當前正開啟檢視的目標單字】：「${screenContext.activeInspectedWord}」（若使用者詢問「這個單字」或要求造句、辨析，請直接針對此單字回答）`
      );
    }
  }

  // Active Reading Article Grounding
  if (currentArticle && currentArticle.title) {
    parts.push(
      [
        `【使用者當前正在閱讀的文章（若使用者詢問文章大意、段落文法或挑出難字，請 100% 根據此文回答，嚴禁憑空捏造）】`,
        `- 標題：《${currentArticle.title}》 (CEFR ${currentArticle.level || 'B2'} / ${currentArticle.category || 'General'})`,
        currentArticle.summary ? `- 摘要：${currentArticle.summary}` : '',
        `- 英文正文：\n${String(currentArticle.content || '').slice(0, 18000)}`
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return parts.join('\n\n');
}

async function handleAIAssistantRequest(req: any, res: any) {
  try {
    const {
      mode = 'tutor',
      messages = [],
      userPrompt = '',
      targetWord = '',
      contextSentence = '',
      writingText = '',
      writingGoal = 'general',
      workshopTopic = '',
      workshopLevel = 'B2',
      workshopCount = 6,
      existingWordsSummary = [],
      rawInputWords = [],
      currentArticle = null,
      screenContext = null,
      quizWords = []
    } = req.body;

    const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);

    if (!ai) {
      return res.status(503).json({
        error: '尚未配置 Google Gemini API Key',
        reason: 'NO_API_KEY',
        details: '伺服器未檢測到 GEMINI_API_KEY，且請求中未附帶個人 API Key。',
        suggestion: '請點擊右上角「設定 > 雲端同步與帳號」填入您的 Google Gemini API Key。',
        reply: '目前尚未設定 Google Gemini API Key。請前往右上角「設定」輸入金鑰後即可啟用 AI 語言助手！',
        words: []
      });
    }

    const STRICT_LANGUAGE_RULE = `
### 語言與品質鐵律 (STRICT LANGUAGE & QUALITY RULES):
1. 你的所有中文解說、分析、提示與回饋，必須 100% 使用自然、道地的「繁體中文（台灣慣用語）」（例如使用：單字、詞彙、語境、片語、資訊、透過、專案；嚴禁夾雜簡體字、嚴禁中英半句混亂拼湊或亂碼）。
2. 英文例句、英文定義 (defEn) 與潤飾範文必須是純粹、自然、道地的母語者英文 (Authentic Native English)。
3. 嚴格遵守「零幻覺原則」：直接、精準回答使用者的問題，絕不答非所問，絕不編造不存在的系統操作或假裝已經修改資料庫。`;

    // ========================================================================
    // MODE 1: WORD X-RAY (單字深度 X 光剖析室)
    // ========================================================================
    if (mode === 'word_xray') {
      const cleanTerm = String(targetWord || userPrompt || '').trim();
      if (!cleanTerm) {
        return res.status(400).json({ error: '請輸入要剖析的英文單字或片語' });
      }

      const prompt = `請針對英文單字或片語「${cleanTerm}」進行全方位的深度語言學 X 光剖析。
${contextSentence ? `參考出現語境："${contextSentence}"\n` : ''}
${STRICT_LANGUAGE_RULE}`;

      const response = await generateWithModelFallback(
        ai,
        {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING, description: 'Canonical English word or phrase' },
              phonetic: { type: Type.STRING, description: 'IPA phonetic transcription, e.g. /juːˈbɪk.wɪ.təs/' },
              pos: { type: Type.STRING, description: 'Primary part of speech: n., v., adj., adv., or phr.' },
              cefrLevel: { type: Type.STRING, description: 'CEFR level: A1, A2, B1, B2, C1, or C2' },
              coreDefZh: { type: Type.STRING, description: '精準繁體中文核心釋義' },
              coreDefEn: { type: Type.STRING, description: 'Clear, natural English definition' },
              nuanceAndVibe: {
                type: Type.STRING,
                description: '核心語感與母語者使用情境剖析（包含正式程度、語氣褒貶、台灣學習者常見誤區）'
              },
              etymology: {
                type: Type.STRING,
                description: '字根、字首、字尾拆解與構詞由來（若為基礎字或片語則說明字源演變）'
              },
              memoryHook: {
                type: Type.STRING,
                description: '令人印象深刻的圖像記憶法、聯想口訣或故事記憶錨點（繁體中文）'
              },
              collocations: {
                type: Type.ARRAY,
                description: '3 to 4 high-frequency native collocations',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    phrase: { type: Type.STRING },
                    meaningZh: { type: Type.STRING },
                    exampleEn: { type: Type.STRING }
                  },
                  required: ['phrase', 'meaningZh', 'exampleEn']
                }
              },
              synonymsComparison: {
                type: Type.ARRAY,
                description: '2 to 3 close synonyms and how their nuances differ from the target word',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    nuanceZh: { type: Type.STRING, description: '與目標單字的語感與用法差異（繁體中文）' },
                    exampleEn: { type: Type.STRING }
                  },
                  required: ['word', 'nuanceZh', 'exampleEn']
                }
              },
              wordFamily: {
                type: Type.ARRAY,
                description: 'Derivative forms across different parts of speech',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    defZh: { type: Type.STRING }
                  },
                  required: ['term', 'pos', 'defZh']
                }
              },
              exampleSentences: {
                type: Type.ARRAY,
                description: '3 authentic example sentences in different contexts (日常對話 / 商務職場 / 學術考試)',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    contextTag: { type: Type.STRING },
                    en: { type: Type.STRING },
                    zh: { type: Type.STRING }
                  },
                  required: ['contextTag', 'en', 'zh']
                }
              }
            },
            required: [
              'term',
              'phonetic',
              'pos',
              'cefrLevel',
              'coreDefZh',
              'coreDefEn',
              'nuanceAndVibe',
              'etymology',
              'memoryHook',
              'collocations',
              'synonymsComparison',
              'wordFamily',
              'exampleSentences'
            ]
          }
        },
        [{ role: 'user', parts: [{ text: prompt }] }]
      );

      const xrayData = JSON.parse(response.text || '{}');
      return res.json({ mode: 'word_xray', xray: xrayData });
    }

    // ========================================================================
    // MODE 2: WRITING CLINIC (寫作門診與母語潤飾)
    // ========================================================================
    if (mode === 'writing_clinic') {
      const draft = String(writingText || userPrompt || '').trim();
      if (!draft) {
        return res.status(400).json({ error: '請輸入要批改或潤飾的英文句子/段落' });
      }

      const goalLabels: Record<string, string> = {
        general: '自然日常與流暢溝通 (General & Natural)',
        business: '專業商務書信與職場溝通 (Professional Business)',
        academic: '學術論文與留學考試高分寫作 (Academic / IELTS / TOEFL)',
        casual: '道地美式口語與社群表達 (Casual & Idiomatic)'
      };

      const prompt = `你是一位頂尖的英語寫作教練與母語編輯。請針對以下使用者的英文草稿（或中英夾雜草稿）進行深度批改、去中式英文 (De-Chinglish) 與分級母語潤飾。
【目標語境】：${goalLabels[writingGoal] || goalLabels.general}
【使用者原稿】：
"""
${draft}
"""
${STRICT_LANGUAGE_RULE}`;

      const response = await generateWithModelFallback(
        ai,
        {
          temperature: 0.35,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.NUMBER, description: 'Score from 0 to 100 based on grammar, naturalness, and clarity' },
              overallCommentZh: { type: Type.STRING, description: '整體點評與鼓勵（繁體中文，指出最大亮點與主要改進方向）' },
              correctedVersion: {
                type: Type.OBJECT,
                description: 'Grammatically correct and clear version preserving original structure',
                properties: {
                  text: { type: Type.STRING },
                  translationZh: { type: Type.STRING },
                  keyFixesNote: { type: Type.STRING, description: '主要修正說明（繁體中文）' }
                },
                required: ['text', 'translationZh', 'keyFixesNote']
              },
              nativeNaturalVersion: {
                type: Type.OBJECT,
                description: 'How an educated native speaker would naturally express this in the target context',
                properties: {
                  text: { type: Type.STRING },
                  translationZh: { type: Type.STRING },
                  highlightNote: { type: Type.STRING, description: '道地語感升級重點（繁體中文）' }
                },
                required: ['text', 'translationZh', 'highlightNote']
              },
              advancedC1Version: {
                type: Type.OBJECT,
                description: 'CEFR C1/C2 high-impact version with sophisticated vocabulary and syntax',
                properties: {
                  text: { type: Type.STRING },
                  translationZh: { type: Type.STRING },
                  highlightNote: { type: Type.STRING, description: '高階句型與精準用字解析（繁體中文）' }
                },
                required: ['text', 'translationZh', 'highlightNote']
              },
              diagnostics: {
                type: Type.ARRAY,
                description: 'Specific sentence-level or phrase-level error/style diagnostics',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    originalSpan: { type: Type.STRING },
                    fixedSpan: { type: Type.STRING },
                    issueType: { type: Type.STRING, description: 'e.g. 文法時態, 搭配詞誤用, 中式英文, 標點與結構' },
                    explanationZh: { type: Type.STRING }
                  },
                  required: ['originalSpan', 'fixedSpan', 'issueType', 'explanationZh']
                }
              },
              upgradedVocabulary: {
                type: Type.ARRAY,
                description: '2 to 4 high-value words or phrases introduced in the polished versions ready to save',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    def: { type: Type.STRING, description: '繁體中文釋義' },
                    defEn: { type: Type.STRING, description: 'English definition' },
                    ex: { type: Type.STRING },
                    category: { type: Type.STRING }
                  },
                  required: ['term', 'pos', 'def', 'defEn', 'ex']
                }
              }
            },
            required: [
              'overallScore',
              'overallCommentZh',
              'correctedVersion',
              'nativeNaturalVersion',
              'advancedC1Version',
              'diagnostics',
              'upgradedVocabulary'
            ]
          }
        },
        [{ role: 'user', parts: [{ text: prompt }] }]
      );

      const clinicData = JSON.parse(response.text || '{}');
      return res.json({ mode: 'writing_clinic', clinic: clinicData });
    }

    // ========================================================================
    // MODE 3: VOCAB WORKSHOP (主題生詞工坊)
    // ========================================================================
    if (mode === 'vocab_workshop') {
      const topic = String(workshopTopic || userPrompt || '日常實用高頻英文').trim();
      const level = String(workshopLevel || 'B2').trim();
      const count = Math.min(10, Math.max(3, Number(workshopCount) || 6));
      const existingTerms = Array.isArray(existingWordsSummary)
        ? existingWordsSummary
            .map((w: any) => (typeof w === 'string' ? w : w?.term))
            .filter(Boolean)
            .slice(0, 120)
        : [];

      const prompt = `請根據主題「${topic}」與目標難度「CEFR ${level}」，精心策劃 ${count} 個極具實用價值且道地的英文單字或高頻片語。
${existingTerms.length > 0 ? `請避開使用者字庫中已有的單字：[${existingTerms.join(', ')}]\n` : ''}
${STRICT_LANGUAGE_RULE}`;

      const response = await generateWithModelFallback(
        ai,
        {
          temperature: 0.5,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              themeTitle: { type: Type.STRING, description: '主題詞包標題（繁體中文）' },
              themeSummary: { type: Type.STRING, description: '本組單字的學習重點與應用場景簡介（繁體中文）' },
              SuggestedCategory: { type: Type.STRING, description: '建議歸入的分類名稱（繁體中文，如：商務職場、學術科研、旅遊生活）' },
              words: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    pos: { type: Type.STRING, description: 'n., v., adj., adv., or phr.' },
                    def: { type: Type.STRING, description: '精準繁體中文釋義' },
                    defEn: { type: Type.STRING, description: 'Clear English definition' },
                    ex: { type: Type.STRING, description: 'Natural English example sentence' },
                    exZh: { type: Type.STRING, description: '例句之繁體中文翻譯' },
                    memoryTip: { type: Type.STRING, description: '簡短字根或語感記憶提示（繁體中文）' },
                    cefrLevel: { type: Type.STRING },
                    category: { type: Type.STRING }
                  },
                  required: ['term', 'pos', 'def', 'defEn', 'ex', 'exZh', 'memoryTip', 'cefrLevel', 'category']
                }
              }
            },
            required: ['themeTitle', 'themeSummary', 'SuggestedCategory', 'words']
          }
        },
        [{ role: 'user', parts: [{ text: prompt }] }]
      );

      const workshopData = JSON.parse(response.text || '{}');
      return res.json({
        mode: 'vocab_workshop',
        workshop: workshopData,
        words: workshopData.words || []
      });
    }

    // ========================================================================
    // MODE 4: QUIZ COACH (弱點特訓隨堂考官)
    // ========================================================================
    if (mode === 'quiz_coach') {
      const targetList = Array.isArray(quizWords) && quizWords.length > 0 ? quizWords.slice(0, 8) : [];
      const customTopic = String(userPrompt || '').trim();

      const prompt =
        targetList.length > 0
          ? `請根據使用者單字庫中的以下目標單字，設計 4 道高品質、具語境深度的四選一實戰測驗題（包含情境克漏字與近義詞語感辨析）：
目標單字清單：${JSON.stringify(targetList)}
${STRICT_LANGUAGE_RULE}`
          : `請根據主題「${customTopic || 'CEFR B2 核心商務與學術字彙'}」，設計 4 道高品質、具語境深度的四選一英文單字實戰測驗題。
${STRICT_LANGUAGE_RULE}`;

      const response = await generateWithModelFallback(
        ai,
        {
          temperature: 0.45,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              quizTitle: { type: Type.STRING, description: '本次特訓標題（繁體中文）' },
              coachIntroZh: { type: Type.STRING, description: '考官開場叮嚀（繁體中文）' },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    targetTerm: { type: Type.STRING },
                    questionType: { type: Type.STRING, description: '情境克漏字 | 語感辨析 | 搭配詞實戰' },
                    stemEn: { type: Type.STRING, description: 'English sentence with ______ for the blank' },
                    stemTranslationZh: { type: Type.STRING, description: '完整句子的繁體中文翻譯' },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Exactly 4 distinct English options'
                    },
                    correctIndex: { type: Type.NUMBER, description: '0, 1, 2, or 3' },
                    explanationZh: {
                      type: Type.STRING,
                      description: '詳盡繁體中文解析：說明為何正解最適合此語境，並剖析其他干擾項的意思與不適用原因'
                    },
                    collocationTip: { type: Type.STRING, description: '本題必記搭配詞或文法重點' }
                  },
                  required: [
                    'targetTerm',
                    'questionType',
                    'stemEn',
                    'stemTranslationZh',
                    'options',
                    'correctIndex',
                    'explanationZh',
                    'collocationTip'
                  ]
                }
              }
            },
            required: ['quizTitle', 'coachIntroZh', 'questions']
          }
        },
        [{ role: 'user', parts: [{ text: prompt }] }]
      );

      const quizData = JSON.parse(response.text || '{}');
      return res.json({ mode: 'quiz_coach', quiz: quizData });
    }

    // ========================================================================
    // MODE 5: SMART CATEGORIZE (字庫 AI 智慧分類器)
    // ========================================================================
    if (mode === 'smart_categorize') {
      const wordsToClassify = Array.isArray(existingWordsSummary) ? existingWordsSummary.slice(0, 50) : [];
      const existingCats = Array.isArray(screenContext?.allCategories) ? screenContext.allCategories : [];

      if (wordsToClassify.length === 0) {
        return res.json({
          mode: 'smart_categorize',
          categorization: {
            summaryZh: '目前沒有需要分類的單字。',
            groups: []
          }
        });
      }

      const prompt = `請將以下單字依照語意與應用領域，智慧歸納至最適當的分類中。
現有分類標籤：${existingCats.length > 0 ? existingCats.join('、') : '（尚無自訂分類，請建立清晰直觀的繁體中文分類，如：商務職場、學術科研、科技數位、日常溝通、社會人文）'}
待分類單字清單：
${JSON.stringify(wordsToClassify.map((w: any) => ({ term: w.term, pos: w.pos, def: w.def })))}
${STRICT_LANGUAGE_RULE}`;

      const response = await generateWithModelFallback(
        ai,
        {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryZh: { type: Type.STRING, description: '分類規劃總結說明（繁體中文）' },
              groups: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING, description: '分類名稱' },
                    terms: { type: Type.ARRAY, items: { type: Type.STRING } },
                    reasonZh: { type: Type.STRING, description: '歸入此分類的理由說明（繁體中文）' }
                  },
                  required: ['category', 'terms', 'reasonZh']
                }
              }
            },
            required: ['summaryZh', 'groups']
          }
        },
        [{ role: 'user', parts: [{ text: prompt }] }]
      );

      const catData = JSON.parse(response.text || '{}');
      return res.json({ mode: 'smart_categorize', categorization: catData });
    }

    // ========================================================================
    // MODE 6 (DEFAULT): TUTOR (智能英語家教與隨身情境助教)
    // ========================================================================
    const rawWordsHint =
      Array.isArray(rawInputWords) && rawInputWords.length > 0
        ? `\n（請務必針對目標單字 [${rawInputWords.join(', ')}] 於 recommendedWords 陣列中輸出完整的標準化詞條資料：term, pos, def, defEn, ex）`
        : '';
    const cleanPrompt =
      (String(userPrompt || '').trim() || '請根據我目前的學習內容提供協助。') + rawWordsHint;
    const groundingText = buildCleanContextualGrounding(screenContext, currentArticle);

    const tutorSystemInstruction = `你是 VocabMin AI 首席英語學習家教與隨身語言助教。
你的任務是精準理解使用者的問題，提供條理分明、深入淺出、零幻覺的專業解答。
${STRICT_LANGUAGE_RULE}

### 回答準則：
1. **緊扣問題核心**：直接回答使用者的問題（如文法解析、句意翻譯、單字比較、記憶方法、學習建議、文章段落解讀、測驗題目解析）。
2. **善用清晰排版**：適度使用 Markdown 標題、重點粗體與條列清單，讓閱讀體驗清爽易懂。
3. **何時提供 recommendedWords**：
   - 當使用者「明確要求推薦單字、查詢特定單字、從目前閱讀的文章挑出難字/生詞、或詢問某主題有哪些英文單字」時，請將這些單字填入 \`recommendedWords\` 陣列，方便使用者一鍵加入單字庫。
   - 若使用者只是進行一般文法問答、句子翻譯或概念討論，\`recommendedWords\` 請保持空陣列 \`[]\`。
4. **延伸追問建議 (\`followUpSuggestions\`)**：
   - 根據當下話題，提供 2 到 3 個使用者可能會想繼續追問的簡短問題（每個問題 8～18 字以內）。
${groundingText ? `\n### 使用者當前畫面與學習情境參考：\n${groundingText}` : ''}`;

    const rawContents: any[] = [];
    if (Array.isArray(messages) && messages.length > 0) {
      for (const m of messages.slice(-10)) {
        const text = String(m?.content || '').trim();
        if (!text) continue;
        rawContents.push({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text }]
        });
      }
    }
    rawContents.push({
      role: 'user',
      parts: [{ text: cleanPrompt }]
    });

    // Ensure strictly alternating roles starting with 'user'
    const contents: any[] = [];
    for (const item of rawContents) {
      if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
        contents[contents.length - 1].parts.push(...item.parts);
      } else {
        contents.push(item);
      }
    }
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    const response = await generateWithModelFallback(
      ai,
      {
        systemInstruction: tutorSystemInstruction,
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: 'Clear, helpful Markdown response in Taiwan Traditional Chinese (繁體中文)'
            },
            recommendedWords: {
              type: Type.ARRAY,
              description: 'Vocabulary words to save ONLY when the user asks to look up, extract, or recommend vocabulary; otherwise empty array []',
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  pos: { type: Type.STRING, description: 'n., v., adj., adv., or phr.' },
                  def: { type: Type.STRING, description: '繁體中文釋義' },
                  defEn: { type: Type.STRING, description: 'Authentic English definition' },
                  ex: { type: Type.STRING, description: 'Natural English example sentence' },
                  category: { type: Type.STRING, description: 'Suggested category tag in Traditional Chinese' }
                },
                required: ['term', 'pos', 'def', 'defEn', 'ex']
              }
            },
            followUpSuggestions: {
              type: Type.ARRAY,
              description: '2 to 3 short follow-up questions in Traditional Chinese',
              items: { type: Type.STRING }
            }
          },
          required: ['reply', 'recommendedWords', 'followUpSuggestions']
        }
      },
      contents
    );

    let parsed: any;
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch {
      parsed = {
        reply: response.text || '抱歉，系統暫時無法解析回應，請再試一次。',
        recommendedWords: [],
        followUpSuggestions: []
      };
    }

    const words = Array.isArray(parsed.recommendedWords) ? parsed.recommendedWords : [];
    return res.json({
      mode: 'tutor',
      reply: parsed.reply || '',
      words,
      recommendedWords: words,
      followUpSuggestions: Array.isArray(parsed.followUpSuggestions) ? parsed.followUpSuggestions : []
    });
  } catch (error: any) {
    console.error('Error in VocabMin AI Assistant:', error);
    const parsedErr = parseGeminiApiError(error);
    return res.status(parsedErr.statusCode).json({
      error: parsedErr.userMessage,
      reason: parsedErr.reason,
      details: parsedErr.details,
      suggestion: parsedErr.suggestion
    });
  }
}

app.post('/api/ai/assistant', handleAIAssistantRequest);
app.post('/api/ai/chat', handleAIAssistantRequest);

// API: Dedicated External Article Import, Grammar Analysis & Bilingual Processing
app.post('/api/ai/import-article', async (req, res) => {
  const { url, topic, level, category } = req.body;
  const rawText = req.body.text || req.body.content || '';
  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    return res.status(503).json({ error: 'AI Client unavailable' });
  }

  try {
    let sourceContent = (rawText || '').trim();
    let sourceName = 'User Provided Text';
    let articleTitle = '';

    if (url && typeof url === 'string' && url.startsWith('http')) {
      sourceName = url;
      const fetched = await fetchExternalUrlContent(url);
      if (fetched && fetched.text) {
        sourceContent = fetched.text;
        articleTitle = fetched.title;
      }
    }

    const requestedLevel = level || 'B2';
    const requestedCategory = category || 'News';

    const prompt = `You are an elite bilingual educator and English linguistics professor.
Process and transform the following external input into a master-grade English reading study article with comprehensive Traditional Chinese (繁體中文) explanations, sentence-by-sentence grammar analysis, and key vocabulary extraction.

【Input Source】: ${sourceName}
${articleTitle ? `【Original Title】: ${articleTitle}\n` : ''}
${topic ? `【Topic/Subject】: ${topic}\n` : ''}
${sourceContent ? `【Article Content / Raw Text】:\n${sourceContent.slice(0, 12000)}\n` : `【Topic Direction】: Create an authentic, publication-quality reading article on "${topic || 'Global Innovation'}"`}

CEFR Level: ${requestedLevel}
Category: ${requestedCategory}

CRITICAL REQUIREMENTS:
1. "title": Catchy, authentic English title.
2. "subtitle": Engaging English subtitle.
3. "author": Journalist / Publication name (e.g. BBC Global, Reuters, Tech Review, or Scholar).
4. "source": "${sourceName.startsWith('http') ? sourceName : 'External Web'}".
5. "level": "${requestedLevel}".
6. "category": "${requestedCategory}".
7. "content": The COMPLETE, FAITHFUL English article text preserving ALL original paragraphs separated by double newlines (\\n\\n). Do NOT truncate, summarize, or shorten the original — include every paragraph fully.
8. "translationZh": High-grade, elegant Traditional Chinese (繁體中文) translation matching paragraph by paragraph (\\n\\n). Every paragraph in "content" must have a corresponding translation paragraph.
9. "summary": 1-2 sentence Traditional Chinese core summary.
10. "grammarPoints": 4 to 6 in-depth grammatical breakdown items for core or complex sentences from the article:
    - sentence: Exact English sentence from the article
    - structure: Syntactic structural diagram / formula in brackets (e.g., "[S + V + O] + [分詞構句修飾] + [that引導同位語從句]")
    - explanation: Comprehensive Traditional Chinese (繁體中文) explanation of grammatical concepts, sentence role, tense nuances, and practical writing tips.
    - grammarType: Grammar category tag (e.g. 分詞構句, 倒裝句, 虛擬語氣, 關係子句, 名詞子句, 介系詞倒裝).
11. "keyVocabulary": 6 to 8 key academic or advanced vocabulary words extracted from the article with:
    - term: English word
    - pos: Part of speech (n./v./adj./adv./phr.)
    - def: Traditional Chinese definition (繁體中文)
    - defEn: Clear English definition (英英釋義)
    - level: CEFR level (e.g. B2, C1)
    - ex: Example sentence or sentence from article
12. "quiz": 2 multiple-choice reading comprehension questions with 4 options each, correctAnswerIndex (0-3), and Traditional Chinese explanation.`;

    const config = {
      temperature: 0.35,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          author: { type: Type.STRING },
          source: { type: Type.STRING },
          level: { type: Type.STRING },
          category: { type: Type.STRING },
          content: { type: Type.STRING },
          translationZh: { type: Type.STRING },
          summary: { type: Type.STRING },
          grammarPoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sentence: { type: Type.STRING },
                structure: { type: Type.STRING },
                explanation: { type: Type.STRING },
                grammarType: { type: Type.STRING }
              },
              required: ['sentence', 'structure', 'explanation']
            }
          },
          keyVocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                pos: { type: Type.STRING },
                def: { type: Type.STRING },
                defEn: { type: Type.STRING },
                level: { type: Type.STRING },
                ex: { type: Type.STRING }
              },
              required: ['term', 'pos', 'def', 'defEn']
            }
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswerIndex: { type: Type.NUMBER },
                explanation: { type: Type.STRING }
              },
              required: ['question', 'options', 'correctAnswerIndex', 'explanation']
            }
          }
        },
        required: ['title', 'content', 'translationZh', 'grammarPoints', 'keyVocabulary']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const wordCount = (parsed.content || '').split(/\s+/).filter(Boolean).length;
    const readTimeMinutes = Math.max(1, Math.round(wordCount / 120));

    const rawKeyVocab = Array.isArray(parsed.keyVocabulary) ? parsed.keyVocabulary : [];
    const sanitizedKeyVocab = await Promise.all(
      rawKeyVocab.map(async (kv: any) => {
        let def = (kv.def || '').trim();
        let defEn = (kv.defEn || '').trim();
        let pos = kv.pos || 'n.';
        if (!def || def.toLowerCase() === (kv.term || '').toLowerCase() || !defEn) {
          try {
            const enriched = await fetchBilingualWordDetails(kv.term);
            if (!def || def.toLowerCase() === (kv.term || '').toLowerCase()) {
              def = enriched.def;
            }
            if (!defEn) {
              defEn = enriched.defEn;
            }
            if (enriched.pos && pos === 'n.') {
              pos = enriched.pos;
            }
          } catch {}
        }
        return {
          term: kv.term,
          pos,
          def,
          defEn,
          level: kv.level || 'B2',
          ex: kv.ex || `Review how "${kv.term}" is used in context.`
        };
      })
    );

    const completeArticle = {
      id: `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: parsed.title || articleTitle || 'Imported External Article',
      subtitle: parsed.subtitle || '',
      author: parsed.author || 'External Publisher',
      source: sourceName,
      level: (parsed.level as any) || requestedLevel,
      category: (parsed.category as any) || requestedCategory,
      content: parsed.content || sourceContent,
      translationZh: parsed.translationZh || '',
      summary: parsed.summary || '',
      wordCount,
      readTimeMinutes,
      savedWordTerms: [],
      isCustom: true,
      grammarPoints: Array.isArray(parsed.grammarPoints) ? parsed.grammarPoints : [],
      keyVocabulary: sanitizedKeyVocab,
      quiz: Array.isArray(parsed.quiz) ? parsed.quiz : []
    };

    return res.json({ article: completeArticle });
  } catch (err: any) {
    console.error('Import article error:', err);
    const parsedErr = parseGeminiApiError(err);
    return res.status(parsedErr.statusCode).json({
      error: parsedErr.userMessage,
      reason: parsedErr.reason,
      details: parsedErr.details,
      suggestion: parsedErr.suggestion
    });
  }
});

// API: Direct Batch Enrich Library with English Definitions (defEn)
app.post('/api/ai/enrich-library', async (req, res) => {
  try {
    const { words } = req.body;
    const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
    if (!ai) {
      const enriched = await Promise.all(
        (words || []).map(async (w: any) => {
          if (!w.defEn) {
            try {
              const details = await fetchBilingualWordDetails(w.term);
              return { ...w, defEn: details.defEn || '' };
            } catch {
              return w;
            }
          }
          return w;
        })
      );
      return res.json({ words: enriched });
    }
    const enriched = await enrichWordsWithEnglishDefinitions(ai, words || []);
    return res.json({ words: enriched });
  } catch (err: any) {
    console.error('Enrich library error:', err);
    return res.status(500).json({ error: err?.message || 'Enrich library failed' });
  }
});

// Bounded cache helper to prevent unbounded memory growth
function setCacheWithLimit<K, V>(map: Map<K, V>, key: K, val: V, maxEntries = 500): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, val);
}

// In-memory cache for word lookups to save AI quota
const wordLookupCache = new Map<string, any>();

// In-memory cache for sentence grammar analyses to save AI quota
const sentenceAnalysisCache = new Map<string, any>();


// API: Article Instant Word Lookup with Contextual Meaning & Concise Flashcard Examples
app.post('/api/ai/article-lookup', async (req, res) => {
  const { forceRefresh } = req.body;
  const word = req.body.word || req.body.term;
  const sentence = req.body.sentence || req.body.sentenceContext;
  const cleanWord = (word || '').trim();
  if (!cleanWord) {
    return res.status(400).json({ error: 'Word is required' });
  }

  const cleanSentence = (sentence || '').trim();
  const cacheKey = cleanSentence
    ? `${cleanWord.toLowerCase()}::${cleanSentence.toLowerCase().slice(0, 80)}`
    : cleanWord.toLowerCase();

  if (!forceRefresh && wordLookupCache.has(cacheKey)) {
    const cached = wordLookupCache.get(cacheKey);
    // Ensure cached entry is strictly valid (def is not just the English term, defEn is present)
    if (cached && cached.def && cached.def.toLowerCase() !== cleanWord.toLowerCase() && cached.defEn) {
      return res.json({
        ...cached,
        term: cleanWord,
        fromCache: true
      });
    }
  }

  // 1. FIRST PRIORITY: Authentic Cambridge Dictionary (優先查詢劍橋英漢辭典，若無收錄再交由 AI 生成)
  try {
    const cambridgeParsed = await fetchCambridgeMeanings(cleanWord);
    if (cambridgeParsed && cambridgeParsed.meanings && cambridgeParsed.meanings.length > 0) {
      const primary = cambridgeParsed.meanings[0];
      const isInflected = cambridgeParsed.isInflected && !!cambridgeParsed.baseForm;

      // Enrich phonetic & Chinese translation of example sentence if needed
      let phonetic = '';
      let exZh = '';
      try {
        const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`, {
          signal: AbortSignal.timeout(2500)
        });
        if (dictRes.ok) {
          const dictData = await dictRes.json();
          if (Array.isArray(dictData) && dictData[0]) {
            phonetic = dictData[0].phonetic || (dictData[0].phonetics?.find((p: any) => p.text)?.text) || '';
          }
        }
      } catch {}

      if (primary.ex) {
        try {
          const exRes = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(primary.ex)}`,
            { signal: AbortSignal.timeout(2500) }
          );
          if (exRes.ok) {
            const exData = await exRes.json();
            exZh = exData[0]?.[0]?.[0] || '';
          }
        } catch {}
      }

      const cambridgePayload = {
        term: cleanWord,
        status: isInflected ? 'inflected' : 'valid',
        baseForm: isInflected ? cambridgeParsed.baseForm : undefined,
        inflectionType: isInflected ? cambridgeParsed.inflectionType : undefined,
        pos: primary.pos || 'n.',
        def: primary.def,
        defEn: primary.defEn || '',
        phonetic,
        ex: primary.ex || (cleanSentence && cleanSentence.length <= 160 ? cleanSentence : `Authentic usage of "${cleanWord}".`),
        exZh,
        meanings: cambridgeParsed.meanings,
        source: 'cambridge',
        sourceLabel: isInflected
          ? `劍橋英漢辭典 (偵測為「${cambridgeParsed.baseForm}」之變形)`
          : '劍橋英漢辭典 (Cambridge Dictionary)'
      };

      setCacheWithLimit(wordLookupCache, cacheKey, cambridgePayload);
      return res.json({
        ...cambridgePayload,
        fromCache: false
      });
    }
  } catch (camErr: any) {
    console.warn('Article lookup Cambridge step skipped:', camErr?.message || camErr);
  }

  // 2. SECOND PRIORITY: Gemini AI (劍橋未收錄時使用 AI 生成解釋)
  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    // Intelligent reliable bilingual dictionary lookup
    const fallback = await fetchBilingualWordDetails(cleanWord, sentence);
    const fallbackWithSource = {
      ...fallback,
      meanings: [{ pos: fallback.pos, def: fallback.def, defEn: fallback.defEn, ex: fallback.ex }],
      source: 'dictionary',
      sourceLabel: '雙語辭典備援 (Google Dictionary)'
    };
    setCacheWithLimit(wordLookupCache, cacheKey, fallbackWithSource);
    return res.json({
      ...fallbackWithSource,
      fromCache: false
    });
  }

  try {
    const prompt = `You are an expert bilingual lexicographer and vocabulary coach (Traditional Chinese / English).
Analyze the English word or phrase: "${cleanWord}"
Article context sentence: "${sentence || 'N/A'}"

Provide accurate contextual details in JSON:
- "term": cleaned word/phrase
- "pos": "n." | "v." | "adj." | "adv." | "phr." | "other"
- "def": accurate concise Traditional Chinese definition (繁體中文解釋) matching the context. NEVER return the English word itself.
- "defEn": authentic, clear English definition (英英釋義)
- "phonetic": approximate IPA or pronunciation hint (e.g. "/ˌsɛrənˈdɪpɪti/")
- "ex": A concise, natural, flashcard-friendly English example sentence (8-14 words max). It MUST be short, clean, and easy to memorize for daily review (do NOT use long, overly complex article sentences).
- "exZh": Traditional Chinese translation (繁體中文) for the concise example sentence.`;

    const config = {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          pos: { type: Type.STRING },
          def: { type: Type.STRING },
          defEn: { type: Type.STRING },
          phonetic: { type: Type.STRING },
          ex: { type: Type.STRING },
          exZh: { type: Type.STRING }
        },
        required: ['term', 'pos', 'def', 'defEn', 'ex']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    let defZh = (parsed.def || '').trim();
    let defEn = (parsed.defEn || '').trim();

    // Guard against AI returning the English word as defZh, or missing defEn
    if (!defZh || defZh.toLowerCase() === cleanWord.toLowerCase() || !defEn) {
      const enriched = await fetchBilingualWordDetails(cleanWord, sentence);
      if (!defZh || defZh.toLowerCase() === cleanWord.toLowerCase()) {
        defZh = enriched.def;
      }
      if (!defEn) {
        defEn = enriched.defEn;
      }
    }

    const resultToCache = {
      term: parsed.term || cleanWord,
      status: 'valid',
      pos: parsed.pos || 'n.',
      def: defZh,
      defEn: defEn,
      phonetic: parsed.phonetic || '',
      ex: parsed.ex || `Learning ${cleanWord} helps improve your vocabulary.`,
      exZh: parsed.exZh || '',
      meanings: [
        {
          pos: parsed.pos || 'n.',
          def: defZh,
          defEn: defEn,
          ex: parsed.ex || `Learning ${cleanWord} helps improve your vocabulary.`
        }
      ],
      source: 'ai',
      sourceLabel: 'Gemini AI 智能解析 (劍橋未收錄 · AI 生成)'
    };
    setCacheWithLimit(wordLookupCache, cacheKey, resultToCache);

    return res.json({
      ...resultToCache,
      fromCache: false
    });
  } catch (err: any) {
    console.warn('Word lookup AI error, using bilingual fallback:', err?.message || err);
    const fallback = await fetchBilingualWordDetails(cleanWord, sentence);
    const fallbackWithSource = {
      ...fallback,
      meanings: [{ pos: fallback.pos, def: fallback.def, defEn: fallback.defEn, ex: fallback.ex }],
      source: 'dictionary',
      sourceLabel: '雙語辭典備援 (Google Dictionary)'
    };
    setCacheWithLimit(wordLookupCache, cacheKey, fallbackWithSource);
    return res.json({
      ...fallbackWithSource,
      fromCache: false
    });
  }
});

// Clean markdown artifacts from Cambridge dictionary scraped text
function cleanCambridgeMd(str: string): string {
  if (!str) return '';
  return str
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/\([^)]*https?:\/\/[^)]*\)/g, '') // remove raw markdown link URLs
    .replace(/\[\[[^\]]+\]\]/g, '') // [[ U ]], [[ C ]]
    .replace(/\[[^\]]+\]/g, '') // remaining brackets
    .replace(/[*_#]/g, '')
    .trim();
}

// Irregular inflections dictionary for high-precision lemmatization & inflection detection
const IRREGULAR_INFLECTIONS: Record<string, { base: string; type: string }> = {
  went: { base: 'go', type: '動詞過去式 (Past Tense)' },
  gone: { base: 'go', type: '動詞過去分詞 (Past Participle)' },
  ran: { base: 'run', type: '動詞過去式 (Past Tense)' },
  swam: { base: 'swim', type: '動詞過去式 (Past Tense)' },
  ate: { base: 'eat', type: '動詞過去式 (Past Tense)' },
  eaten: { base: 'eat', type: '動詞過去分詞 (Past Participle)' },
  wrote: { base: 'write', type: '動詞過去式 (Past Tense)' },
  written: { base: 'write', type: '動詞過去分詞 (Past Participle)' },
  spoke: { base: 'speak', type: '動詞過去式 (Past Tense)' },
  spoken: { base: 'speak', type: '動詞過去分詞 (Past Participle)' },
  flew: { base: 'fly', type: '動詞過去式 (Past Tense)' },
  flown: { base: 'fly', type: '動詞過去分詞 (Past Participle)' },
  drove: { base: 'drive', type: '動詞過去式 (Past Tense)' },
  driven: { base: 'drive', type: '動詞過去分詞 (Past Participle)' },
  took: { base: 'take', type: '動詞過去式 (Past Tense)' },
  taken: { base: 'take', type: '動詞過去分詞 (Past Participle)' },
  saw: { base: 'see', type: '動詞過去式 (Past Tense)' },
  seen: { base: 'see', type: '動詞過去分詞 (Past Participle)' },
  bought: { base: 'buy', type: '動詞過去式 / 過去分詞' },
  brought: { base: 'bring', type: '動詞過去式 / 過去分詞' },
  caught: { base: 'catch', type: '動詞過去式 / 過去分詞' },
  taught: { base: 'teach', type: '動詞過去式 / 過去分詞' },
  thought: { base: 'think', type: '動詞過去式 / 過去分詞' },
  built: { base: 'build', type: '動詞過去式 / 過去分詞' },
  found: { base: 'find', type: '動詞過去式 / 過去分詞' },
  gave: { base: 'give', type: '動詞過去式 (Past Tense)' },
  given: { base: 'give', type: '動詞過去分詞 (Past Participle)' },
  knew: { base: 'know', type: '動詞過去式 (Past Tense)' },
  known: { base: 'know', type: '動詞過去分詞 (Past Participle)' },
  chose: { base: 'choose', type: '動詞過去式 (Past Tense)' },
  chosen: { base: 'choose', type: '動詞過去分詞 (Past Participle)' },
  shook: { base: 'shake', type: '動詞過去式 (Past Tense)' },
  shaken: { base: 'shake', type: '動詞過去分詞 (Past Participle)' },
  stole: { base: 'steal', type: '動詞過去式 (Past Tense)' },
  stolen: { base: 'steal', type: '動詞過去分詞 (Past Participle)' },
  wore: { base: 'wear', type: '動詞過去式 (Past Tense)' },
  worn: { base: 'wear', type: '動詞過去分詞 (Past Participle)' },
  won: { base: 'win', type: '動詞過去式 / 過去分詞' },
  lost: { base: 'lose', type: '動詞過去式 / 過去分詞' },
  paid: { base: 'pay', type: '動詞過去式 / 過去分詞' },
  met: { base: 'meet', type: '動詞過去式 / 過去分詞' },
  left: { base: 'leave', type: '動詞過去式 / 過去分詞' },
  felt: { base: 'feel', type: '動詞過去式 / 過去分詞' },
  children: { base: 'child', type: '名詞複數 (Plural)' },
  men: { base: 'man', type: '名詞複數 (Plural)' },
  women: { base: 'woman', type: '名詞複數 (Plural)' },
  teeth: { base: 'tooth', type: '名詞複數 (Plural)' },
  feet: { base: 'foot', type: '名詞複數 (Plural)' },
  mice: { base: 'mouse', type: '名詞複數 (Plural)' },
  people: { base: 'person', type: '名詞複數 (Plural)' },
  better: { base: 'good', type: '形容詞/副詞比較級 (Comparative)' },
  best: { base: 'good', type: '形容詞/副詞最高級 (Superlative)' },
  worse: { base: 'bad', type: '形容詞/副詞比較級 (Comparative)' },
  worst: { base: 'bad', type: '形容詞/副詞最高級 (Superlative)' },
};

// Morphological rule analysis for common regular English inflections
function detectRuleInflection(w: string): { base: string; type: string } | null {
  const lower = w.toLowerCase().trim();
  if (IRREGULAR_INFLECTIONS[lower]) {
    return IRREGULAR_INFLECTIONS[lower];
  }
  // -ies -> -y (epiphanies -> epiphany, cherries -> cherry, studies -> study)
  if (lower.length > 4 && lower.endsWith('ies')) {
    return { base: lower.slice(0, -3) + 'y', type: '名詞複數 / 動詞第三人稱單數' };
  }
  // -ied -> -y (studied -> study, worried -> worry, applied -> apply)
  if (lower.length > 4 && lower.endsWith('ied')) {
    return { base: lower.slice(0, -3) + 'y', type: '動詞過去式 / 過去分詞' };
  }
  // -ing (running -> run, swimming -> swim, studying -> study)
  if (lower.length > 4 && lower.endsWith('ing')) {
    const stem = lower.slice(0, -3);
    // Double consonant check: running -> run, swimming -> swim, stopping -> stop
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      return { base: stem.slice(0, -1), type: '現在分詞 / 動名詞' };
    }
    return { base: stem, type: '現在分詞 / 動名詞' };
  }
  // -ed (stopped -> stop, walked -> walk)
  if (lower.length > 4 && lower.endsWith('ed')) {
    const stem = lower.slice(0, -2);
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      return { base: stem.slice(0, -1), type: '動詞過去式 / 過去分詞' };
    }
    return { base: stem, type: '動詞過去式 / 過去分詞' };
  }
  // -es (watches -> watch, boxes -> box, dishes -> dish)
  if (lower.length > 4 && lower.endsWith('es')) {
    return { base: lower.slice(0, -2), type: '名詞複數 / 動詞第三人稱單數' };
  }
  // -er comparative (happier -> happy, faster -> fast)
  if (lower.length > 4 && lower.endsWith('er')) {
    if (lower.endsWith('ier')) {
      return { base: lower.slice(0, -3) + 'y', type: '形容詞/副詞比較級 (Comparative)' };
    }
    return { base: lower.slice(0, -2), type: '形容詞/副詞比較級 (Comparative)' };
  }
  // -est superlative (happiest -> happy, fastest -> fast)
  if (lower.length > 4 && lower.endsWith('est')) {
    if (lower.endsWith('iest')) {
      return { base: lower.slice(0, -4) + 'y', type: '形容詞/副詞最高級 (Superlative)' };
    }
    return { base: lower.slice(0, -3), type: '形容詞/副詞最高級 (Superlative)' };
  }
  return null;
}

export interface CambridgeParsedResult {
  meanings: any[];
  headerWord?: string;
  isInflected: boolean;
  baseForm?: string;
  inflectionType?: string;
}

// Robust parser for Cambridge Dictionary Traditional Chinese markdown (supports both EN & ZH-TW page layouts)
function parseCambridgeMarkdown(word: string, markdown: string): CambridgeParsedResult {
  const cleanWord = word.trim().toLowerCase();
  const meanings: any[] = [];

  // Extract Cambridge entry header word (e.g. # Translation of **epiphany** or # **epiphany** 在英語-漢語（繁體）詞典中的翻譯)
  const enTitleMatch = markdown.match(/# Translation of (?:\*\*)?([^*#\n\r]+?)(?:\*\*)?(?:\s+[–\-]|in|\n|\r|$)/i);
  const zhTitleMatch = markdown.match(/# (?:\*\*)?([^*#\n\r]+?)(?:\*\*)?\s+在英語-(?:中文|漢語)/i);
  const zhAltTitleMatch = markdown.match(/# (?:\*\*)?([^*#\n\r]+?)(?:\*\*)?\s+在英(?:漢|語)/i);

  // 🚨 CRITICAL: If there is no authentic entry title header, Cambridge did NOT index this word (likely 404 or spelling suggestion page)!
  if (!enTitleMatch && !zhTitleMatch && !zhAltTitleMatch) {
    return { meanings: [], isInflected: false };
  }

  const rawHeader = (enTitleMatch?.[1] || zhTitleMatch?.[1] || zhAltTitleMatch?.[1] || '').trim().toLowerCase();
  if (!rawHeader || rawHeader.includes('拼寫建議') || rawHeader.includes('suggestion') || rawHeader.includes('找不到')) {
    return { meanings: [], isInflected: false };
  }

  const headerWord = rawHeader;

  // Check for Cambridge inflection subtitle
  // e.g. "past simple and past participle of study", "plural of epiphany", "comparative of happy"
  const inflMatch = markdown.match(
    /(past simple|past participle|present participle|plural|comparative|superlative)(?:\s+and\s+past\s+participle)?\s+of\s+\[?\*?\*?([a-zA-Z]+)/i
  );
  let inflectionType: string | undefined;
  let baseForm: string | undefined;

  if (inflMatch) {
    const rawInflType = inflMatch[1].toLowerCase();
    baseForm = inflMatch[2].toLowerCase();
    if (rawInflType.includes('past')) inflectionType = '動詞過去式 / 過去分詞';
    else if (rawInflType.includes('present')) inflectionType = '動詞現在分詞 / 動名詞';
    else if (rawInflType.includes('plural')) inflectionType = '名詞複數 (Plural)';
    else if (rawInflType.includes('comparative')) inflectionType = '形容詞/副詞比較級 (Comparative)';
    else if (rawInflType.includes('superlative')) inflectionType = '形容詞/副詞最高級 (Superlative)';
    else inflectionType = '單字變形';
  } else if (headerWord && headerWord !== cleanWord) {
    // Cambridge redirected inflection query to the base lemma (e.g. epiphanies -> epiphany)
    baseForm = headerWord;
    const ruleMatch = detectRuleInflection(cleanWord);
    inflectionType = ruleMatch?.type || '單字變形';
  } else {
    // Check local inflection rule table
    const ruleMatch = detectRuleInflection(cleanWord);
    if (ruleMatch) {
      baseForm = ruleMatch.base;
      inflectionType = ruleMatch.type;
    }
  }

  // Determine entry body start position
  const enStart = enTitleMatch ? markdown.indexOf(enTitleMatch[0]) : -1;
  const zhStart = zhTitleMatch ? markdown.indexOf(zhTitleMatch[0]) : -1;
  const zhAltStart = zhAltTitleMatch ? markdown.indexOf(zhAltTitleMatch[0]) : -1;

  const validStarts = [enStart, zhStart, zhAltStart].filter((idx) => idx >= 0);
  if (validStarts.length === 0) {
    // 🚨 ABSOLUTELY NEVER parse from position 0 (avoids capturing website navigation menus / template headers)
    return { meanings: [], isInflected: false };
  }

  const contentStart = Math.min(...validStarts);
  let content = markdown.slice(contentStart);

  // End marker: copyright footer or examples / browse header in either English or Chinese
  const endMarkers = [
    '© Cambridge University Press',
    '(Translation of',
    '(從劍橋',
    '## Examples of',
    '## Browse',
    '## 瀏覽'
  ];
  let minEnd = -1;
  for (const marker of endMarkers) {
    const idx = content.indexOf(marker);
    if (idx > 100 && (minEnd === -1 || idx < minEnd)) {
      minEnd = idx;
    }
  }
  if (minEnd > 100) {
    content = content.slice(0, minEnd);
  }

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  let currentPos = 'n.';

  const detectPos = (str: string): string | null => {
    const lower = str.toLowerCase();
    if (lower.includes('phrasal verb') || lower.includes('idiom') || lower.includes('preposition')) return 'phr.';
    if (lower.startsWith('adverb') || lower.includes('adverb')) return 'adv.';
    if (lower.startsWith('adjective') || lower.includes('adjective')) return 'adj.';
    if (lower.startsWith('pronoun') || lower.includes('pronoun')) return 'other';
    if (lower.startsWith('verb') || lower.includes('verb')) return 'v.';
    if (lower.startsWith('noun') || lower.includes('noun')) return 'n.';
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Detect POS header
    if (rawLine.startsWith('###') || rawLine.length < 35) {
      const p = detectPos(rawLine);
      if (p) currentPos = p;
    }

    const cleanedLine = cleanCambridgeMd(rawLine);
    const hasChinese = /[\u4e00-\u9fa5]/.test(rawLine);

    // Filter out CEFR lines, codes, phonetics, audio, navigation, template markers, and dictionary lists
    const isGarbageLine =
      /^(A1|A2|B1|B2|C1|C2)\b/i.test(cleanedLine) ||
      rawLine.includes('{{') ||
      rawLine.includes('}}') ||
      rawLine.includes('Beta') ||
      rawLine.includes('/help/codes.html') ||
      rawLine.includes('codes.html') ||
      rawLine.includes('Audio') ||
      rawLine.includes('Share on') ||
      rawLine.includes('在臉書上分享') ||
      rawLine.includes('Add to word list') ||
      rawLine.includes('加入詞彙表') ||
      rawLine.includes('More examples') ||
      rawLine.includes('Fewer examples') ||
      rawLine.includes('Synonyms') ||
      rawLine.includes('Grammar') ||
      rawLine.includes('英語文法') ||
      /英語.*西班牙語/i.test(rawLine) ||
      /西班牙語.*英語/i.test(rawLine) ||
      rawLine.includes('詞典中的翻譯') ||
      rawLine.includes('Cambridge English-Chinese') ||
      rawLine.includes('劍橋英語-中文') ||
      rawLine.includes('拼寫建議');

    if (isGarbageLine) continue;

    // Identify candidate English definition line
    const isEnDef =
      !hasChinese &&
      !rawLine.startsWith('#') &&
      !rawLine.startsWith('*') &&
      !rawLine.startsWith('!') &&
      cleanedLine.length >= 10 &&
      cleanedLine.length <= 400 &&
      !cleanedLine.startsWith('http') &&
      cleanedLine.split(/\s+/).length >= 2 &&
      /[a-zA-Z]{2,}/.test(cleanedLine);

    if (isEnDef && i + 1 < lines.length) {
      // Look up to 2 lines ahead for Chinese definition in case of blank/tag line
      let nextLine = '';
      let nextLineIdx = -1;
      for (let look = 1; look <= 2 && i + look < lines.length; look++) {
        const candidate = lines[i + look];
        const trimmedCandidate = candidate.trim();
        const candClean = cleanCambridgeMd(candidate);
        if (
          /[\u4e00-\u9fa5]/.test(candidate) &&
          !/^[a-zA-Z]/.test(trimmedCandidate) && // Definitions start with Chinese or brackets, never English
          !candidate.includes('{{') &&
          !candidate.includes('}}') &&
          !candidate.includes('Cambridge') &&
          !candidate.includes('詞典') &&
          !candidate.includes('分享') &&
          !candidate.includes('加入詞彙表') &&
          !candidate.includes('例句') &&
          !candidate.includes('英語文法') &&
          !candidate.includes('西班牙語') &&
          !candidate.includes('拼寫建議') &&
          candClean.length >= 1 &&
          candClean.length <= 100
        ) {
          nextLine = candidate;
          nextLineIdx = i + look;
          break;
        }
      }

      if (nextLine) {
        const defEn = cleanedLine;
        const defZh = cleanCambridgeMd(nextLine);

        // Find example sentence in subsequent lines
        let ex = '';
        for (let j = nextLineIdx + 1; j < Math.min(nextLineIdx + 8, lines.length); j++) {
          const lRaw = lines[j];
          if (lRaw.startsWith('###') || lRaw.startsWith('#')) break;
          if (lRaw.includes('{{') || lRaw.includes('}}')) continue;
          const lClean = cleanCambridgeMd(lRaw);
          if (
            (lRaw.startsWith('*') || lClean.toLowerCase().includes(cleanWord)) &&
            lClean.length >= 15 &&
            !lClean.includes('Add to word list') &&
            !lClean.includes('See more') &&
            !lClean.includes('Synonyms')
          ) {
            const matchZh = lClean.search(/[\u4e00-\u9fa5]/);
            if (matchZh > 10) {
              ex = lClean.slice(0, matchZh).trim();
            } else {
              ex = lClean;
            }
            break;
          }
        }

        if (
          defZh &&
          defZh.length >= 1 &&
          !defZh.includes('{{') &&
          !defZh.includes('英語文法') &&
          !meanings.some((m) => m.def === defZh)
        ) {
          meanings.push({
            pos: currentPos,
            def: defZh,
            defEn: defEn,
            ex: ex || `Authentic usage example of "${word}".`
          });
        }
      }
    }
  }

  return {
    meanings: meanings.slice(0, 8),
    headerWord,
    isInflected: !!(baseForm && baseForm !== cleanWord),
    baseForm: baseForm && baseForm !== cleanWord ? baseForm : undefined,
    inflectionType
  };
}

// Memory cache for Cambridge Dictionary lookups
const cambridgeMeaningsCache = new Map<string, CambridgeParsedResult>();

// Fetch authentic definitions from Cambridge Dictionary with quick timeout fallback
async function fetchCambridgeMeanings(word: string): Promise<CambridgeParsedResult | null> {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord || !/^[a-zA-Z\s'-]+$/.test(cleanWord)) return null;

  if (cambridgeMeaningsCache.has(cleanWord)) {
    const cached = cambridgeMeaningsCache.get(cleanWord)!;
    const isCorrupt = cached.meanings?.some(
      (m: any) => m.def?.includes('英語文法') || m.def?.includes('{{') || m.defEn?.includes('{{')
    );
    if (!isCorrupt && cached.meanings?.length > 0) {
      return cached;
    }
    cambridgeMeaningsCache.delete(cleanWord);
  }

  const targetUrls = [
    `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(cleanWord)}`,
    `https://dictionary.cambridge.org/zht/%E8%A9%9E%E5%85%B8/%E8%8B%B1%E8%AA%9E-%E6%BC%A2%E8%AA%9E-%E7%B9%81%E9%AB%94/${encodeURIComponent(cleanWord)}`
  ];

  const jinaKey = process.env.JINA_API_KEY;

  for (const targetUrl of targetUrls) {
    try {
      const url = `https://r.jina.ai/${targetUrl}`;
      const headers: Record<string, string> = {
        'Accept': 'text/plain',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      };
      if (jinaKey) {
        headers['Authorization'] = `Bearer ${jinaKey}`;
      }

      const res = await fetch(url, {
        signal: AbortSignal.timeout(9500),
        headers
      });

      if (!res.ok) continue;
      const markdown = await res.text();

      // 🚨 CRITICAL: Check for Cambridge Dictionary "Unlisted Word" / "Spelling Suggestions" pages
      // When a word is NOT in Cambridge Dictionary, Cambridge returns spelling advice page like "關於 ... 的拼寫建議"
      const isUnlistedOrSuggestions =
        markdown.includes('拼寫建議') ||
        markdown.includes('在拼寫或發音上近似的詞') ||
        markdown.includes('近似的詞') ||
        markdown.includes('Suggestions for') ||
        markdown.includes('Search suggestions for') ||
        markdown.includes('Did you mean') ||
        markdown.includes('No results found') ||
        markdown.includes('在該辭典中找不到') ||
        markdown.includes('找不到任何結果') ||
        markdown.includes('我們找不到');

      if (isUnlistedOrSuggestions) {
        // Word is definitely not indexed by Cambridge Dictionary! Skip Cambridge scraper and fallback to Gemini AI.
        continue;
      }

      // 🚨 CRITICAL: Legitimate entry MUST have an explicit headword title
      const hasRealEntryHeader =
        /# Translation of (?:\*\*)?([^*#\n\r]+?)(?:\*\*)?/i.test(markdown) ||
        /# (?:\*\*)?([^*#\n\r]+?)(?:\*\*)?\s+在英語-(?:中文|漢語)/i.test(markdown) ||
        /# (?:\*\*)?([^*#\n\r]+?)(?:\*\*)?\s+在英(?:漢|語)/i.test(markdown);

      if (!hasRealEntryHeader) {
        continue;
      }

      const parsedResult = parseCambridgeMarkdown(cleanWord, markdown);
      if (parsedResult && parsedResult.meanings && parsedResult.meanings.length > 0) {
        setCacheWithLimit(cambridgeMeaningsCache, cleanWord, parsedResult);
        return parsedResult;
      }
    } catch (err: any) {
      console.warn(`Cambridge direct lookup for "${cleanWord}" failed or timed out:`, err?.message || err);
    }
  }

  return null;
}

export interface WordAllMeaningsPayload {
  term: string;
  status: 'valid' | 'inflected' | 'typo' | 'invalid';
  baseForm?: string;
  inflectionType?: string;
  suggestions?: string[];
  meanings: any[];
  source: 'cambridge' | 'ai' | 'dictionary' | 'validator' | 'fallback';
  sourceLabel: string;
  message?: string;
}

// Cache for all meanings of words (polysemy / 一詞多義 & validation status)
const wordAllMeaningsCache = new Map<string, WordAllMeaningsPayload>();

// API: Polysemous word lookup with 4-layer validation & inflection recognition
// Priority 1: Cambridge Dictionary (劍橋權威字典) -> Priority 2: Gemini AI (嚴格防偽驗證) -> Priority 3: Datamuse & Google Dictionary Fallback
app.post('/api/ai/word-all-meanings', async (req, res) => {
  const word = req.body.word || req.body.term;
  const cleanWord = (word || '').trim();
  const forceRefresh = !!req.body.forceRefresh;

  if (!cleanWord) {
    return res.status(400).json({ error: 'Word is required' });
  }

  const cacheKey = cleanWord.toLowerCase();
  if (!forceRefresh && wordAllMeaningsCache.has(cacheKey)) {
    const cached = wordAllMeaningsCache.get(cacheKey)!;
    const isCorrupted = cached.meanings?.some(
      (m: any) =>
        m.def?.includes('英語文法') ||
        m.def?.includes('{{') ||
        m.defEn?.includes('{{') ||
        m.def?.includes('西班牙語')
    );
    if (!isCorrupted) {
      return res.json({
        ...cached,
        term: cleanWord,
        fromCache: true
      });
    } else {
      wordAllMeaningsCache.delete(cacheKey);
      cambridgeMeaningsCache.delete(cacheKey);
    }
  }

  // 1. FIRST PRIORITY: Authentic Cambridge Dictionary (優先從劍橋字典中抓資料與變形資訊)
  try {
    const cambridgeParsed = await fetchCambridgeMeanings(cleanWord);
    if (cambridgeParsed && cambridgeParsed.meanings.length > 0) {
      const isInflected = cambridgeParsed.isInflected && !!cambridgeParsed.baseForm;
      const payload: WordAllMeaningsPayload = {
        term: cleanWord,
        status: isInflected ? 'inflected' : 'valid',
        baseForm: isInflected ? cambridgeParsed.baseForm : undefined,
        inflectionType: isInflected ? cambridgeParsed.inflectionType : undefined,
        suggestions: [],
        meanings: cambridgeParsed.meanings,
        source: 'cambridge',
        sourceLabel: isInflected
          ? `劍橋英漢辭典 (偵測為「${cambridgeParsed.baseForm}」之變形)`
          : '劍橋英漢辭典 (Cambridge Dictionary)'
      };
      setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
      return res.json({
        ...payload,
        fromCache: false
      });
    }
  } catch (cambridgeErr: any) {
    console.warn('Cambridge lookup error, falling back to AI/validator:', cambridgeErr?.message || cambridgeErr);
  }

  // 2. SECOND PRIORITY: Gemini AI with Strict Anti-Hallucination & Spell Interception (劍橋無收錄才使用 AI)
  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);

  if (ai) {
    try {
      const prompt = `You are an expert bilingual lexicographer, lemmatizer, and spelling checker (Traditional Chinese / English).
Align your definitions, parts of speech, and usage closely with authentic Cambridge English-Chinese Dictionary (劍橋英漢辭典) and Oxford Learner's Dictionary standards.
Carefully evaluate the user input: "${cleanWord}".

Strictly categorize this input into one of 4 states:
1. "valid": A real, correct, recognized English word (including standard slang, idioms, and established technical terms).
2. "inflected": A grammatically valid inflected form of a base English lemma (e.g., "running" is an inflection of "run", "epiphanies" of "epiphany", "studied" of "study", "democratized" of "democratize").
3. "typo": A misspelled word that is NOT a valid English word, but closely resembles 1-4 real English words (e.g., "appte" was likely meant to be "apple", "apply", or "apt"; "definately" was meant to be "definitely").
4. "invalid": Complete nonsense, meaningless gibberish, random letter combinations, keyboard smash, or non-existent words (e.g., "denomonananana", "asdfghjkl", "qwertyui", "blablablazzz").

CRITICAL INTEGRITY & ANTI-HALLUCINATION RULES:
- If status is "invalid":
  * "meanings" MUST BE an empty array [].
  * 🚨 ABSOLUTELY FORBIDDEN: DO NOT invent fake definitions, fake slang, or pretend it is an abbreviation!
  * "suggestions" MUST BE an empty array [].
- If status is "typo":
  * "meanings" MUST BE an empty array [].
  * "suggestions": Provide 2-4 real English words the user most likely meant to type.
- If status is "inflected":
  * "baseForm": Provide the base lemma (原形單字) in lowercase (e.g., "epiphanies" -> "epiphany", "studied" -> "study").
  * "inflectionType": Specify the grammatical inflection in Traditional Chinese (繁體中文, e.g. "動詞過去式", "名詞複數", "現在分詞 / 動名詞", "形容詞比較級").
  * "meanings": Provide accurate Traditional Chinese and English definitions for this base word or inflected usage.
  * "suggestions": MUST BE an empty array [].
- If status is "valid":
  * "meanings": Extract 1-5 authentic, distinct definitions with Traditional Chinese "def", English "defEn", part of speech "pos", and natural example "ex".
  * 🚨 FIDELITY TO CAMBRIDGE DICTIONARY: Strictly follow authentic Cambridge English-Chinese Dictionary headwords. If a word only has 1 primary definition in Cambridge (e.g. "identity" strictly has only 1 definition: "身分；本身；特性"), do NOT artificially invent or split extra meanings! Only return multiple meanings when the Cambridge English-Chinese dictionary legitimately has multiple distinct entries.
  * "suggestions": MUST BE an empty array [].

Return a JSON object conforming to the schema.`;

      const config = {
        temperature: 0.1, // low temperature for maximum precision
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            term: { type: Type.STRING },
            status: {
              type: Type.STRING,
              enum: ['valid', 'inflected', 'typo', 'invalid'],
              description: 'Word validation and morphological status'
            },
            baseForm: {
              type: Type.STRING,
              description: 'Base lemma in lowercase if status is inflected'
            },
            inflectionType: {
              type: Type.STRING,
              description: 'Inflection type in Traditional Chinese if status is inflected'
            },
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of 2-4 real English words if status is typo'
            },
            meanings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pos: { type: Type.STRING },
                  def: { type: Type.STRING },
                  defEn: { type: Type.STRING },
                  ex: { type: Type.STRING }
                },
                required: ['pos', 'def']
              }
            }
          },
          required: ['term', 'status', 'meanings']
        }
      };

      const response = await generateWithModelFallback(ai, config, prompt);
      const parsed = JSON.parse(response.text || '{}');
      const status = parsed.status || 'valid';

      if (status === 'invalid') {
        const payload: WordAllMeaningsPayload = {
          term: cleanWord,
          status: 'invalid',
          suggestions: [],
          meanings: [],
          source: 'ai',
          sourceLabel: '查無此單字',
          message: `查無「${cleanWord}」之英文單字，可能包含拼寫錯誤或無意義字母組合。`
        };
        setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
        return res.json({ ...payload, fromCache: false });
      }

      if (status === 'typo') {
        const suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((s: string) => s && s.toLowerCase() !== cleanWord.toLowerCase()).slice(0, 4)
          : [];
        const payload: WordAllMeaningsPayload = {
          term: cleanWord,
          status: 'typo',
          suggestions,
          meanings: [],
          source: 'ai',
          sourceLabel: '拼寫建議 (Did you mean)'
        };
        setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
        return res.json({ ...payload, fromCache: false });
      }

      if (status === 'inflected') {
        const validMeanings = Array.isArray(parsed.meanings)
          ? parsed.meanings.filter(
              (m: any) => m.def && m.def.toLowerCase() !== cleanWord.toLowerCase()
            )
          : [];
        const payload: WordAllMeaningsPayload = {
          term: cleanWord,
          status: 'inflected',
          baseForm: (parsed.baseForm || '').toLowerCase().trim() || cleanWord,
          inflectionType: parsed.inflectionType || '單字變形',
          suggestions: [],
          meanings: validMeanings,
          source: 'ai',
          sourceLabel: `Gemini AI 智能解析 (偵測為「${(parsed.baseForm || cleanWord).toLowerCase()}」之變形)`
        };
        setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
        return res.json({ ...payload, fromCache: false });
      }

      // Valid word
      if (Array.isArray(parsed.meanings) && parsed.meanings.length > 0) {
        const validMeanings = parsed.meanings.filter(
          (m: any) => m.def && m.def.toLowerCase() !== cleanWord.toLowerCase()
        );
        if (validMeanings.length > 0) {
          const payload: WordAllMeaningsPayload = {
            term: cleanWord,
            status: 'valid',
            suggestions: [],
            meanings: validMeanings,
            source: 'ai',
            sourceLabel: 'Gemini AI 智能解析 (參照劍橋辭典標準)'
          };
          setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
          return res.json({ ...payload, fromCache: false });
        }
      }
    } catch (err: any) {
      console.warn('Word all meanings AI error, falling back to dictionary/spellcheck:', err?.message || err);
    }
  }

  // 3. THIRD PRIORITY: Spell & Dictionary Verification Fallback (無需 AI Key 亦可精準防禦拼寫與非單字)
  try {
    // 3a. Check Datamuse API for real English spelling matches
    let datamuseData: any[] = [];
    try {
      const datamuseRes = await fetch(
        `https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&max=6`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (datamuseRes.ok) {
        datamuseData = await datamuseRes.json();
      }
    } catch {}

    const isExactWord =
      Array.isArray(datamuseData) &&
      datamuseData.some((d: any) => (d.word || '').toLowerCase() === cleanWord.toLowerCase());

    if (!isExactWord) {
      const candidateWords = Array.isArray(datamuseData)
        ? datamuseData
            .map((d: any) => d.word)
            .filter((w: string) => w.toLowerCase() !== cleanWord.toLowerCase() && /^[a-zA-Z]+$/.test(w))
            .slice(0, 4)
        : [];

      if (candidateWords.length > 0) {
        // Typo detected via Datamuse spellcheck!
        const payload: WordAllMeaningsPayload = {
          term: cleanWord,
          status: 'typo',
          suggestions: candidateWords,
          meanings: [],
          source: 'validator',
          sourceLabel: '拼寫建議 (Did you mean)'
        };
        setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
        return res.json({ ...payload, fromCache: false });
      } else {
        // Pure gibberish / non-word detected (e.g. denomonananana)!
        const payload: WordAllMeaningsPayload = {
          term: cleanWord,
          status: 'invalid',
          suggestions: [],
          meanings: [],
          source: 'validator',
          sourceLabel: '查無此單字',
          message: `查無「${cleanWord}」之英文單字，請檢查拼寫是否正確。`
        };
        setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
        return res.json({ ...payload, fromCache: false });
      }
    }

    // 3b. Exact word confirmed by Datamuse, check morphological rule
    const ruleInflection = detectRuleInflection(cleanWord);

    // 3c. Query Google Dictionary for bilingual meanings
    const fallbackMeanings: any[] = [];
    const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&dt=bd&q=${encodeURIComponent(cleanWord)}`;
    const resTrans = await fetch(transUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4500)
    });

    if (resTrans.ok) {
      const data = await resTrans.json();
      // data[1] is dictionary table: [ [pos_name, [def1, def2, ...]], ... ]
      if (Array.isArray(data[1])) {
        for (const posGroup of data[1]) {
          const rawPos = String(posGroup[0] || '').toLowerCase();
          let posTag = 'n.';
          if (rawPos.includes('adverb')) posTag = 'adv.';
          else if (rawPos.includes('adjective')) posTag = 'adj.';
          else if (rawPos.includes('phrasal') || rawPos.includes('preposition') || rawPos.includes('phrase') || rawPos.includes('idiom')) posTag = 'phr.';
          else if (rawPos.includes('pronoun')) posTag = 'other';
          else if (rawPos.includes('verb')) posTag = 'v.';
          else if (rawPos.includes('noun')) posTag = 'n.';
          else posTag = 'other';

          const defsList = Array.isArray(posGroup[1]) ? posGroup[1].slice(0, 2) : [];
          for (const d of defsList) {
            if (d && !fallbackMeanings.some((m) => m.def === d)) {
              fallbackMeanings.push({
                pos: posTag,
                def: String(d).trim(),
                defEn: `Definition of ${cleanWord} as a ${rawPos}`,
                ex: `It is common to use ${cleanWord} in everyday conversations.`
              });
            }
          }
        }
      }

      // If no dictionary table, take primary translation only if it contains Chinese characters
      if (fallbackMeanings.length === 0 && data[0]?.[0]?.[0]) {
        const primaryTrans = String(data[0][0][0]).trim();
        if (/[\u4e00-\u9fa5]/.test(primaryTrans)) {
          fallbackMeanings.push({
            pos: 'n.',
            def: primaryTrans,
            defEn: `English definition of ${cleanWord}`,
            ex: `The term ${cleanWord} is frequently used.`
          });
        }
      }
    }

    if (fallbackMeanings.length > 0) {
      const payload: WordAllMeaningsPayload = {
        term: cleanWord,
        status: ruleInflection ? 'inflected' : 'valid',
        baseForm: ruleInflection?.base,
        inflectionType: ruleInflection?.type,
        suggestions: [],
        meanings: fallbackMeanings,
        source: 'dictionary',
        sourceLabel: '雙語辭典備援 (Google Dictionary)'
      };
      setCacheWithLimit(wordAllMeaningsCache, cacheKey, payload);
      return res.json({
        ...payload,
        fromCache: false
      });
    }

    // Never return fake/raw string as definition
    const payload: WordAllMeaningsPayload = {
      term: cleanWord,
      status: 'invalid',
      suggestions: [],
      meanings: [],
      source: 'fallback',
      sourceLabel: '查無此單字',
      message: `查無「${cleanWord}」之有效繁體中文釋義。`
    };
    return res.json({
      ...payload,
      fromCache: false
    });
  } catch (err: any) {
    console.error('All meanings fallback failed:', err);
    return res.json({
      term: cleanWord,
      status: 'invalid',
      suggestions: [],
      meanings: [],
      source: 'fallback',
      sourceLabel: '查無此單字',
      fromCache: false
    });
  }
});


// API: Article Sentence Grammar & Structure Analysis
app.post('/api/ai/analyze-sentence', async (req, res) => {
  const { sentence, forceRefresh } = req.body;
  const cleanSentence = (sentence || '').trim();
  if (!cleanSentence) {
    return res.status(400).json({ error: 'Sentence is required' });
  }

  const cacheKey = cleanSentence.toLowerCase();
  if (!forceRefresh && sentenceAnalysisCache.has(cacheKey)) {
    const cached = sentenceAnalysisCache.get(cacheKey);
    return res.json({
      ...cached,
      sentence: cleanSentence,
      fromCache: true
    });
  }

  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    let trans = '';
    try {
      const trRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(cleanSentence)}`);
      if (trRes.ok) {
        const trData = await trRes.json();
        trans = trData[0]?.[0]?.[0] || '';
      }
    } catch {}
    return res.json({
      sentence: cleanSentence,
      translation: trans || cleanSentence,
      grammarBreakdown: '句子主幹與修飾成分分析（離線/詞典模式）',
      vocabularyNotes: [],
      learningTip: '可點擊單字查詢個別釋義',
      fromCache: false
    });
  }

  try {
    const prompt = `You are a master English grammar teacher and translator.
Analyze this English sentence for an intermediate/advanced English learner:
"${cleanSentence}"

Provide detailed, insightful structural breakdown in Traditional Chinese (繁體中文):
- "sentence": original sentence
- "translation": natural, high-quality Traditional Chinese translation (繁體中文翻譯)
- "grammarBreakdown": clear bullet-point breakdown of key structure (e.g. 主詞、主要動詞、子句關係、分詞構句、關代等)
- "vocabularyNotes": array of key idioms/collocations/words in this sentence with term and brief Chinese meaning
- "learningTip": one memorable learning tip, nuance, or sentence pattern application`;

    const config = {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentence: { type: Type.STRING },
          translation: { type: Type.STRING },
          grammarBreakdown: { type: Type.STRING },
          vocabularyNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                meaning: { type: Type.STRING }
              },
              required: ['term', 'meaning']
            }
          },
          learningTip: { type: Type.STRING }
        },
        required: ['sentence', 'translation', 'grammarBreakdown']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const resultToCache = {
      sentence: cleanSentence,
      translation: parsed.translation || '',
      grammarBreakdown: parsed.grammarBreakdown || '',
      vocabularyNotes: parsed.vocabularyNotes || [],
      learningTip: parsed.learningTip || ''
    };
    setCacheWithLimit(sentenceAnalysisCache, cacheKey, resultToCache);

    return res.json({
      ...resultToCache,
      fromCache: false
    });
  } catch (err: any) {
    console.warn('Sentence analysis error:', err?.message || err);
    return res.json({
      sentence: cleanSentence,
      translation: '暫時無法連線至 AI 解析伺服器',
      grammarBreakdown: '分析服務暫時繁忙，請稍後重試。',
      vocabularyNotes: [],
      learningTip: '',
      fromCache: false
    });
  }
});

// API: AI Reading Companion & Tutor (針對當前閱讀文章的深度對話、答疑與助讀)
app.post('/api/ai/article-chat', async (req, res) => {
  const { article, messages, userPrompt, selectedContext } = req.body;
  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    return res.status(503).json({
      reply: 'AI 服務尚未配置 GEMINI_API_KEY。若您有個人的金鑰，可在設定中輸入啟用！',
      suggestedWords: []
    });
  }

  try {
    const articleTitle = article?.title || req.body.articleTitle || '當前閱讀文章';
    const articleLevel = article?.level || req.body.articleLevel || 'B2';
    const articleCategory = article?.category || req.body.articleCategory || 'General';
    const articleContent = article?.content || req.body.articleContent || '';
    const articleTranslation = article?.translationZh || req.body.articleTranslation || '';

    const systemInstruction = `You are "VocabMin AI 閱讀伴讀導師" (VocabMin Reading Companion & English Tutor), an inspiring, erudite, and friendly bilingual English reading teacher and literary coach.
The learner is currently reading this English article in the reader app:

【文章標題】: ${articleTitle}
【文章級別】: ${articleLevel} (${articleCategory})
【文章全文內容】:
"""
${articleContent.slice(0, 40000)}
"""
${articleTranslation ? `【繁體中文翻譯對照】:\n"""\n${articleTranslation.slice(0, 20000)}\n"""` : ''}
${selectedContext ? `【讀者當前在文章中反白選取的焦點文字】:\n"${selectedContext}"` : ''}

CRITICAL TEACHING GUIDELINES:
1. Ground your answers directly in the article's text, context, and nuance.
2. If the user asks about a specific sentence, phrase, or excerpt:
   - Provide a natural, elegant Traditional Chinese (繁體中文) translation.
   - Explain the syntactic role (subject, main verb, clauses, participle constructions, rhetorical purpose).
   - Point out vocabulary nuances or idiomatic collocations.
3. If the user asks for a summary or discussion:
   - Synthesize the key arguments cleanly and concisely in bullet points.
   - Point out the author's tone and stance.
4. Extract 1 to 3 high-value vocabulary words or collocations from the discussed part in "suggestedWords" (array of { term, pos, def, defEn, ex }) so the user can easily click to save them to their vocabulary bank.
5. Tone: Encouraging, scholarly yet accessible, completely in Traditional Chinese (繁體中文).
6. Format: Strict JSON output with "reply" and "suggestedWords".`;

    const rawContents: any[] = [];
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach((m) => {
        if (m.content && m.content.trim()) {
          rawContents.push({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          });
        }
      });
    }

    const currentPrompt = userPrompt || (selectedContext ? `請幫我詳細解析文章中這段文字的含義與文法結構：「${selectedContext}」` : '請為我導讀這篇文章的核心主旨與閱讀要點');
    rawContents.push({
      role: 'user',
      parts: [{ text: currentPrompt }]
    });

    // Merge consecutive turns with the same role
    const contents: any[] = [];
    for (const item of rawContents) {
      if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
        contents[contents.length - 1].parts.push(...item.parts);
      } else {
        contents.push(item);
      }
    }
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }
    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: currentPrompt }]
      });
    }

    const config = {
      systemInstruction,
      temperature: 0.35,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description: 'Conversational response to the learner in Traditional Chinese (繁體中文).'
          },
          suggestedWords: {
            type: Type.ARRAY,
            description: 'Optional 1-3 useful vocabulary words from the context for the learner to save.',
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                pos: { type: Type.STRING },
                def: { type: Type.STRING },
                defEn: { type: Type.STRING },
                ex: { type: Type.STRING }
              },
              required: ['term', 'pos', 'def']
            }
          }
        },
        required: ['reply']
      }
    };

    const response = await generateWithModelFallback(ai, config, contents);
    const parsed = JSON.parse(response.text || '{}');

    return res.json({
      reply: parsed.reply || '已完成文章解析。',
      suggestedWords: parsed.suggestedWords || []
    });
  } catch (err: any) {
    console.error('Article chat error:', err);
    const parsedErr = parseGeminiApiError(err);
    return res.status(parsedErr.statusCode).json({
      error: parsedErr.userMessage,
      reason: parsedErr.reason,
      details: parsedErr.details,
      suggestion: parsedErr.suggestion,
      reply: `⚠️ ${parsedErr.userMessage}：${parsedErr.details || parsedErr.suggestion}`,
      suggestedWords: []
    });
  }
});

// API: AI Generate Reading Article
app.post('/api/ai/generate-article', async (req, res) => {
  const { topic, level, targetWords, category } = req.body;
  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    return res.status(503).json({ error: 'AI Client unavailable' });
  }

  try {
    const requestedLevel = level || 'B2';
    const requestedTopic = topic || 'Modern Science and Curiosity';
    const wordsContext = Array.isArray(targetWords) && targetWords.length > 0
      ? `Naturally integrate these target vocabulary words into the story/article: ${targetWords.join(', ')}`
      : '';

    const prompt = `You are an elite educational author and English teacher.
Create a captivating, authentic English reading article at CEFR ${requestedLevel} level.
Topic: "${requestedTopic}"
Category: "${category || 'Science'}"
${wordsContext}

Length: Approximately 260-320 words across 3 to 4 well-structured paragraphs.
Requirements:
1. "title": Catchy, sophisticated title in English
2. "subtitle": Engaging subtitle
3. "author": Fictional scholar/journalist name
4. "source": Name of publication
5. "level": "${requestedLevel}"
6. "category": "${category || 'Science'}"
7. "content": Complete article text in English with paragraph breaks (\n\n)
8. "translationZh": High quality, elegant Traditional Chinese translation (繁體中文) matching paragraph by paragraph (\n\n)
9. "summary": 1-sentence Traditional Chinese summary
10. "keyVocabulary": 5-6 advanced/key vocabulary words from the article with term, pos (n./v./adj./adv./phr.), def (Traditional Chinese), defEn (English definition), and level (e.g. B2, C1)
11. "quiz": 2 multiple-choice reading comprehension questions with 4 options each, correctAnswerIndex (0-3), and explanation in Traditional Chinese.`;

    const config = {
      temperature: 0.5,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          author: { type: Type.STRING },
          source: { type: Type.STRING },
          level: { type: Type.STRING },
          category: { type: Type.STRING },
          content: { type: Type.STRING },
          translationZh: { type: Type.STRING },
          summary: { type: Type.STRING },
          keyVocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                pos: { type: Type.STRING },
                def: { type: Type.STRING },
                defEn: { type: Type.STRING },
                level: { type: Type.STRING }
              },
              required: ['term', 'pos', 'def', 'defEn']
            }
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                correctAnswerIndex: { type: Type.NUMBER },
                explanation: { type: Type.STRING }
              },
              required: ['question', 'options', 'correctAnswerIndex', 'explanation']
            }
          }
        },
        required: ['title', 'content', 'translationZh', 'keyVocabulary']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const wordCount = (parsed.content || '').split(/\s+/).filter(Boolean).length;
    const readTimeMinutes = Math.max(1, Math.round(wordCount / 120));

    // Guarantee all keyVocabulary items have valid def and defEn
    const rawKeyVocab = Array.isArray(parsed.keyVocabulary) ? parsed.keyVocabulary : [];
    const sanitizedKeyVocab: any[] = [];
    for (const kv of rawKeyVocab) {
      if (kv && kv.term) {
        let defZh = (kv.def || '').trim();
        let defEn = (kv.defEn || '').trim();
        if (!defZh || defZh.toLowerCase() === kv.term.toLowerCase() || !defEn) {
          try {
            const enriched = await fetchBilingualWordDetails(kv.term);
            if (!defZh || defZh.toLowerCase() === kv.term.toLowerCase()) defZh = enriched.def;
            if (!defEn) defEn = enriched.defEn;
          } catch {}
        }
        sanitizedKeyVocab.push({
          ...kv,
          def: defZh || `【${kv.term}】`,
          defEn: defEn || `English definition for ${kv.term}`
        });
      }
    }

    return res.json({
      id: `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: parsed.title || 'Generated Reading',
      subtitle: parsed.subtitle || '',
      author: parsed.author || 'AI Scholar',
      source: parsed.source || 'VocabMin Curated',
      level: parsed.level || requestedLevel,
      category: parsed.category || category || 'Custom',
      content: parsed.content || '',
      translationZh: parsed.translationZh || '',
      summary: parsed.summary || '',
      wordCount,
      readTimeMinutes,
      savedWordTerms: [],
      keyVocabulary: sanitizedKeyVocab,
      quiz: parsed.quiz || [],
      isCustom: true
    });
  } catch (err: any) {
    console.error('Article generation error:', err);
    const parsedErr = parseGeminiApiError(err);
    return res.status(parsedErr.statusCode).json({
      error: parsedErr.userMessage,
      reason: parsedErr.reason,
      details: parsedErr.details,
      suggestion: parsedErr.suggestion
    });
  }
});

// Helper: Extract top candidate words from English text when AI is unavailable
function extractCandidateWordsFromText(text: string, limit = 8): string[] {
  const commonStopwords = new Set([
    'about', 'after', 'again', 'against', 'almost', 'along', 'already', 'also', 'although',
    'always', 'among', 'another', 'around', 'because', 'before', 'being', 'between', 'both',
    'could', 'during', 'every', 'first', 'found', 'great', 'however', 'might', 'never', 'other',
    'people', 'place', 'right', 'should', 'since', 'small', 'still', 'their', 'there', 'these',
    'thing', 'think', 'those', 'through', 'under', 'water', 'where', 'which', 'while', 'would',
    'years', 'which', 'their', 'there', 'about', 'would', 'these', 'other', 'words', 'could'
  ]);
  const tokens = text.match(/\b[a-zA-Z]{5,}\b/g) || [];
  const freq = new Map<string, number>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!commonStopwords.has(lower)) {
      freq.set(lower, (freq.get(lower) || 0) + 1);
    }
  }
  return Array.from(freq.keys())
    .sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0))
    .slice(0, limit);
}

// Helper: Translate text to Traditional Chinese via Google Translate fallback
async function fallbackTranslateToZh(text: string): Promise<string> {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const translatedParas: string[] = [];
  for (const para of paragraphs.slice(0, 8)) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(para.trim())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const joined = data[0].map((chunk: any) => chunk[0] || '').join('');
          if (joined.trim()) {
            translatedParas.push(joined.trim());
            continue;
          }
        }
      }
    } catch {}
    translatedParas.push(para);
  }
  return translatedParas.join('\n\n');
}

// API: Extract Vocabulary from any user-provided text
app.post('/api/ai/extract-vocabulary', async (req, res) => {
  const rawText = req.body.text || req.body.content || req.body.article?.content || '';
  const text = (rawText || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);

  if (!ai) {
    // Graceful offline fallback: extract candidates & enrich with dictionary
    const candidates = extractCandidateWordsFromText(text, 8);
    const enriched = await Promise.all(
      candidates.map(async (word) => {
        const details = await fetchBilingualWordDetails(word);
        return {
          term: word,
          pos: details.pos || 'n.',
          def: details.def || word,
          defEn: details.defEn || '',
          level: 'B2',
          ex: details.ex || `Review how "${word}" is used in context.`
        };
      })
    );
    return res.json({ vocabulary: enriched });
  }

  try {
    const prompt = `Analyze this English text and extract 8 to 12 most valuable, high-utility vocabulary words or idioms for language learners.
For each word, provide:
- "term": the base or contextual word/phrase
- "pos": "n." | "v." | "adj." | "adv." | "phr." | "other"
- "def": accurate Traditional Chinese definition (繁體中文解釋). NEVER return the English term itself.
- "defEn": clear authentic English definition (英英釋義)
- "level": CEFR level (A2, B1, B2, C1, C2)
- "ex": A concise, natural, flashcard-friendly English example sentence (8-14 words max, easy to memorize for review, do NOT use long complex sentences).

Text:
"""
${text.slice(0, 25000)}
"""`;

    const config = {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            term: { type: Type.STRING },
            pos: { type: Type.STRING },
            def: { type: Type.STRING },
            defEn: { type: Type.STRING },
            level: { type: Type.STRING },
            ex: { type: Type.STRING }
          },
          required: ['term', 'pos', 'def', 'defEn']
        }
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '[]');
    const sanitizedVocabulary = await Promise.all(
      (parsed || []).map(async (v: any) => {
        let def = (v.def || '').trim();
        let defEn = (v.defEn || '').trim();
        let pos = v.pos || 'other';

        if (!def || def.toLowerCase() === (v.term || '').toLowerCase() || !defEn) {
          try {
            const fallback = await fetchBilingualWordDetails(v.term);
            if (!def || def.toLowerCase() === (v.term || '').toLowerCase()) {
              def = fallback.def || def;
            }
            if (!defEn) {
              defEn = fallback.defEn || defEn;
            }
            if (pos === 'other' && fallback.pos) {
              pos = fallback.pos;
            }
          } catch {}
        }
        return {
          term: v.term,
          pos,
          def,
          defEn,
          level: v.level || 'B2',
          ex: v.ex || `Review how "${v.term}" is used in context.`
        };
      })
    );
    return res.json({ vocabulary: sanitizedVocabulary });
  } catch (err: any) {
    console.warn('Extract vocabulary AI error, falling back to dictionary lookup:', err?.message || err);
    const candidates = extractCandidateWordsFromText(text, 8);
    const enriched = await Promise.all(
      candidates.map(async (word) => {
        const details = await fetchBilingualWordDetails(word);
        return {
          term: word,
          pos: details.pos || 'n.',
          def: details.def || word,
          defEn: details.defEn || '',
          level: 'B2',
          ex: details.ex || `Review how "${word}" is used in context.`
        };
      })
    );
    return res.json({ vocabulary: enriched });
  }
});

// API: Translate Article to Traditional Chinese (Bilingual Support)
app.post('/api/ai/translate-article', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    const fallbackZh = await fallbackTranslateToZh(content);
    return res.json({ translationZh: fallbackZh });
  }

  try {
    const prompt = `You are a professional literary and scholarly translator.
Translate the following English article into elegant, natural Traditional Chinese (繁體中文).
Translate paragraph by paragraph, preserving paragraph breaks (\n\n).

English text:
"""
${content.slice(0, 30000)}
"""

Return JSON with:
- "translationZh": string with translated paragraphs separated by \n\n.`;

    const config = {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translationZh: { type: Type.STRING }
        },
        required: ['translationZh']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const translation = parsed.translationZh || '';
    if (!translation) {
      const fallbackZh = await fallbackTranslateToZh(content);
      return res.json({ translationZh: fallbackZh });
    }
    return res.json({ translationZh: translation });
  } catch (err: any) {
    console.warn('Translate article AI error, using fallback:', err?.message || err);
    const fallbackZh = await fallbackTranslateToZh(content);
    return res.json({ translationZh: fallbackZh });
  }
});

// API: Generate Reading Comprehension Quiz for Article
app.post('/api/ai/generate-quiz', async (req, res) => {
  const { title, content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    return res.json({
      quiz: [
        {
          question: `What is the primary subject or theme discussed in "${title || 'the article'}"?`,
          options: [
            'The central perspectives and key developments presented in the passage.',
            'A completely unrelated historical myth from ancient civilizations.',
            'A fictional fairy tale designed strictly for young infants.',
            'An instructional manual for assembling household appliances.'
          ],
          correctAnswerIndex: 0,
          explanation: '文章主旨圍繞文本所陳述的核心觀點與發展脈絡展開。'
        }
      ]
    });
  }

  try {
    const prompt = `You are an English language testing expert.
Create 2 or 3 multiple-choice reading comprehension and vocabulary questions based on this article.
Title: "${title || 'English Reading'}"
Content:
"""
${content.slice(0, 20000)}
"""

For each question provide:
- "question": clear question in English testing either main idea, specific fact, inference, or context vocabulary
- "options": exactly 4 options in English
- "correctAnswerIndex": number 0 to 3
- "explanation": concise explanation in Traditional Chinese (繁體中文) citing why the correct answer is right.`;

    const config = {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            correctAnswerIndex: { type: Type.NUMBER },
            explanation: { type: Type.STRING }
          },
          required: ['question', 'options', 'correctAnswerIndex', 'explanation']
        }
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '[]');
    return res.json({ quiz: parsed });
  } catch (err: any) {
    console.warn('Generate quiz AI error, providing fallback quiz:', err?.message || err);
    return res.json({
      quiz: [
        {
          question: `What is the primary subject or theme discussed in "${title || 'the article'}"?`,
          options: [
            'The central perspectives and key developments presented in the passage.',
            'A completely unrelated historical myth from ancient civilizations.',
            'A fictional fairy tale designed strictly for young infants.',
            'An instructional manual for assembling household appliances.'
          ],
          correctAnswerIndex: 0,
          explanation: '文章主旨圍繞文本所陳述的核心觀點與發展脈絡展開。'
        }
      ]
    });
  }
});

// Setup Vite middleware in dev or static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VocabMin server running on port ${PORT}`);
});
