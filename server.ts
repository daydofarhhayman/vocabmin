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
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview'
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
            if (p.includes('noun')) pos = 'n.';
            else if (p.includes('verb')) pos = 'v.';
            else if (p.includes('adjective')) pos = 'adj.';
            else if (p.includes('adverb')) pos = 'adv.';
            else if (p.includes('preposition') || p.includes('phrase')) pos = 'phr.';
          }
          if (Array.isArray(group[1]) && group[1][0] && group[1][0][0]) {
            defEn = String(group[1][0][0]).trim();
            break;
          }
        }
      }

      if (pos === 'n.' && Array.isArray(data[1]) && data[1][0] && data[1][0][0]) {
        const p = String(data[1][0][0]).toLowerCase();
        if (p.includes('verb')) pos = 'v.';
        else if (p.includes('adjective')) pos = 'adj.';
        else if (p.includes('adverb')) pos = 'adv.';
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
      const matched = sentences.find((sub) => new RegExp(`\\b${cleanWord}\\b`, 'i').test(sub));
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

// Helper: Fetch and extract clean article text from external URL
async function fetchExternalUrlContent(url: string): Promise<{ title: string; text: string } | null> {
  try {
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

// API: AI Vocabulary Operations (Chat, Word Lookup, Standardization, Auto-Complete, Modifying, Deletion)
app.post('/api/ai/chat', async (req, res) => {
  try {
    const {
      messages,
      userPrompt,
      existingWordsSummary,
      rawInputWords,
      existingArticlesSummary,
      scenario,
      scenarioDesc,
      currentArticle,
      screenContext
    } = req.body;

    const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);

    if (!ai) {
      return res.status(503).json({
        error: '尚未配置 Google Gemini API Key',
        reason: 'NO_API_KEY',
        details: '伺服器未檢測到 GEMINI_API_KEY，且請求中未附帶使用者個人的 API Key。',
        suggestion: '請前往右上角「設定 > 雲端同步與帳號」輸入個人的 Google Gemini API Key，即可啟用即時 AI 智能對話與單字操作！',
        reply: '目前系統尚未偵測到 GEMINI_API_KEY 設定。請前往「設定」輸入您的金鑰，即可開啟 AI 智能語伴與所有學習功能！',
        words: []
      });
    }

    // Extract raw user prompt cleanly (stripping any accidental frontend prefixes)
    let rawUserPrompt = (userPrompt || '').trim();
    const legacyMatch = rawUserPrompt.match(/(?:使用者[指提]問?|User\s*Prompt)[\uff1a:]\s*([\s\S]+)$/i);
    if (legacyMatch && legacyMatch[1]) {
      rawUserPrompt = legacyMatch[1].trim();
    }

    // Check if the prompt contains an external URL to scrape
    let externalScrapedContext = '';
    let fetchedExternal: { title: string; text: string } | null = null;
    const urlMatch = rawUserPrompt.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
      const targetUrl = urlMatch[0];
      fetchedExternal = await fetchExternalUrlContent(targetUrl);
      if (fetchedExternal && fetchedExternal.text) {
        externalScrapedContext = `\n【已成功從外部網址 (${targetUrl}) 抓取文章內容】:\n文章標題: ${fetchedExternal.title || '外部網頁文章'}\n文章正文:\n${fetchedExternal.text}\n`;
      }
    }

    const systemInstruction = `You are VocabMin AI (智能單字管理與全能英語學習智囊), an empathetic, knowledgeable, and intuitive English learning coach, linguistic expert, and bilingual reading guide.

### CORE MISSION:
Listen carefully to the user's message and understand their true intent in context. Give direct, insightful, natural, and helpful responses without robotic deflections, hallucinations, or unsolicited content.

### RESPONSE FORMAT:
You must strictly output JSON matching this schema:
- "reply" (string, required): Your conversational response to the user.
- "words" (array, optional): New vocabulary words to import/learn. Empty array [] when not adding/recommending vocabulary.
- "article" (object, optional): Structured reading article. ONLY include this when the user explicitly requests to create, generate, or import a brand new article.
- "action" (object, optional): Explicit database action proposal. ONLY include this when the user explicitly commands a library modification.

### 🛑 CRITICAL ANTI-HALLUCINATION RULES (防幻覺核心準則):
1. 當使用者正在閱讀文章（情境包含【使用者目前正開啟並停留在以下文章的閱讀畫面】）時：
   - 使用者的目光「正注視著這篇文章」！
   - 當使用者提出以下需求時：
     * 「請幫我挑出此文章的難字」、「挑出生詞」、「文章中的生詞」
     * 「這篇文章在講什麼」、「總結這篇」、「段落大意」
     * 「分析這句話的文法」、「解釋這段的意思」
     * 或是任何提及該文章標題的提問
   - 你的鐵律回應要求：
     * 🚨 絕對禁止說「您沒有提供文章」、「您沒有指定哪一篇」或「我的閱讀庫中還沒有這篇文章」！因為文章就在使用者眼前！
     * 🚨 絕對禁止擅自編造或生成一篇全新、無關的假文章（嚴禁隨機輸出 Digital Nomads 或其他任何短文）！
     * 🚨 必須 100% 嚴格基於所提供之《${currentArticle?.title || '當前文章'}》完整正文進行分析與回答！
     * 當使用者要求「挑出難字/生詞」時：
       - 從該文章的真實英文正文中精選 4~8 個值得學習的進階或核心單字。
       - 在 "reply" 中給出清晰、親切的引導說明（結合文章上下文解說其含義）。
       - 在 "words" 陣列中精確輸出這 4~8 個單字（每個單字包含 term, pos, def, defEn，以及取自文章原句或原語境的 ex 例句）。
       - 嚴格禁止輸出 "article" 欄位（保持 undefined）！

2. 當使用者正在進行【單字卡片複習 / 隨堂測驗】（情境包含【使用者當前正在作答/複習的題目資訊】）時：
   - 使用者正注視著目前的題目與單字！
   - 若使用者詢問「這題怎麼解」、「為什麼選這個」、「這個單字怎麼記」、「選項有什麼差別」、「例句文法」、「造句」：
     * 🚨 必須 100% 針對當前題目的目標單字與例句進行精闢解析！
     * 🚨 絕對禁止詢問「請問你在背哪一個單字？」或「您目前在看哪道題目？」，因為題目單字、釋義與選項就在上方情境中！

3. 當使用者正在【單字詳情/編輯彈窗】（情境包含【使用者當前正開啟彈窗檢視/編輯的單字】）時：
   - 使用者正注視著該單字！
   - 必須直接針對該單字深入解答語意、語感、搭配詞與造句。
   - 若使用者提出「刪除這個單字」、「刪掉它」或「從字庫移除」，目標單字即為該單字！必須產出 action: { type: 'delete_word', summary: '...', deleteWord: { term: '...' } }。

4. 當使用者在【文章閱讀】中提出「刪除這篇文章」、「刪掉這篇」時：
   - 目標文章即為當前文章！必須產出 action: { type: 'delete_article', summary: '...', deleteArticle: { title: '...' } }。

5. 當使用者詢問資料庫統計或全庫資訊（例如：「請問我現在有幾篇文章，幾個單字？」、「我的字庫裡有哪些單字？」、「我存了幾篇？」等）：
   - 🚨 必須 100% 依據環境情境中所提供之【使用者真實資料庫數據庫統計】直接如實回答確切的數字與文章/單字清單！
   - 🚨 絕對禁止回答「我無法存取後台數據」或「看不到您的數據」，因為統計數據與清單就在情境中！

6. 當使用者在【書架總覽】（尚未開啟單篇文章）時：
   - 使用者看到的是其文章庫清單。可根據使用者已有文章庫題材進行討論，或提供閱讀規劃。
   - 只有當使用者明確表示「請幫我寫/生成/創建一篇全新文章」（例如：「幫我寫一篇關於海洋保護的B2英文短文」）時，才在 "article" 物件生成文章。

### SCENARIO RULES & GUIDANCE:

1. GENERAL INQUIRIES, QUESTIONS, GRAMMAR & CHAT:
   - When the user asks general questions, inquires about grammar/idioms, asks for learning advice, chats, or expresses confusion/frustration:
     * Answer directly, accurately, and warmly in "reply".
     * If the user says you didn't understand them previously or expresses frustration (e.g. "聽不懂", "搞錯了", "你根本不懂"): apologize sincerely, pay close attention to what they need, clarify their intent, and directly help them without reciting rigid scripted menus.
     * "words" MUST be [] (empty array).
     * "article" MUST NOT be included (omit or undefined).
     * "action" MUST NOT be included (omit or undefined).

2. VOCABULARY INQUIRIES, RECOMMENDATIONS & ADDING WORDS:
   - Triggers: User asks for vocabulary recommendations, word lookups, expansions, thematic words, or says "幫我新增/加入單字 [word]", "推薦 5 個商務單字", "有哪些描述性格的形容詞", "請查 ubiquitous":
     * Provide a friendly conversational explanation in "reply".
     * Populate "words" with the recommended/added words. Each item must have:
       - "term": English word or phrase
       - "pos": Part of speech (n., v., adj., adv., phr., other)
       - "def": Clear, accurate Traditional Chinese definition (繁體中文解釋)
       - "defEn": Authentic, clear English explanation in English (英英釋義)
       - "ex": Natural, modern example sentence in English
     * DO NOT generate an "article".

3. ARTICLE READING & EXTERNAL IMPORT:
   - Triggers: ONLY when the user EXPLICITLY asks to generate an article, read a passage/essay, import from a URL, or requests bilingual reading (e.g., "幫我生成一篇關於AI科技的B2雙語文章", "從網址匯入文章 https://...", "我想讀一篇英文短文並看文法結構"):
     * Populate "article" with:
       - "title", "subtitle", "author", "source", "level" (A1-C2), "category" ('Tech'|'Science'|'Business'|'News'|'Story'|'Daily'|'Custom')
       - "content": Complete English article text with paragraphs separated by double newlines (\\n\\n).
       - "translationZh": High-fidelity paragraph-by-paragraph Traditional Chinese translation (\\n\\n).
       - "summary": 1-2 sentence Traditional Chinese summary.
       - "grammarPoints": 3-5 in-depth sentence structures and grammar analyses.
       - "keyVocabulary": 5-8 key academic/advanced vocabulary words.
       - "quiz": 1-2 reading comprehension multiple choice questions.
     * In "reply", summarize the article and highlight key learning points.
     * In this case, "words" should be [] (key vocabulary is already inside article.keyVocabulary).
   - CRITICAL PROHIBITION: NEVER generate an article when the user is just asking for vocabulary words, asking questions, or discussing sentences!

4. WRITING CORRECTION & POLISHING (作文與文法批改):
   - Triggers: User provides an English sentence or paragraph and asks for critique, correction, grammar check, or CEFR C1/C2 polish:
     * In "reply", provide structured feedback:
       - 🔍 【原文問題診斷】：逐一指出文法錯誤、時態誤用或不道地的搭配詞。
       - ✍️ 【自然地道版 (Natural Correction)】：自然地道、文法無誤的英文。
       - 💎 【高階潤飾版 (CEFR C1/C2 Native Polish)】：運用豐富的學術詞彙、倒裝句或分詞構句。
       - 💡 【詞彙與句型剖析】：詳細解說為何此處用詞更加精準。
     * In "words", optionally extract 2-4 advanced vocabulary items from the polished version.

5. DATABASE OPERATIONS & MANAGEMENT ("action" object):
   - ONLY trigger when the user EXPLICITLY COMMANDS an operational database modification:
     * "清空所有單字" / "刪除所有單字" / "清空單字庫" -> action: { type: 'clear_all_words', summary: '清空單字庫中的所有單字' }
     * "清空所有文章" / "刪除所有文章" / "清空文章閱讀庫" -> action: { type: 'clear_all_articles', summary: '清空文章閱讀庫中的所有文章' }
     * "刪除單字 [term]" / "刪除這個單字" -> action: { type: 'delete_word', summary: '從單字庫刪除「...」', deleteWord: { term: '...' } }
     * "刪除文章 [title]" / "刪除這篇文章" -> action: { type: 'delete_article', summary: '從文章閱讀庫刪除指定文章', deleteArticle: { title: '...' } }
     * "合併重複單字" / "去重" -> action: { type: 'deduplicate_words', summary: '合併單字庫中重複的單字' }
     * "重置所有單字熟練度" -> action: { type: 'reset_mastery', summary: '重置所有單字熟練度為 Level 0' }
     * "全庫單字標準化" / "補齊英文釋義" -> action: { type: 'batch_standardize', summary: '為現有單字補齊英文釋義並標準化' }
     * "修改單字 [term]" -> action: { type: 'update_word', summary: '修改單字「...」之釋義或例句', updateWord: { term: '...' } }
   - ⚠️ CRITICAL ZERO-HALLUCINATION PROTOCOL (絕對禁止假執行幻覺):
     * You do NOT have direct execution access to alter, delete, or clear the database in the background.
     * Therefore, you MUST NEVER falsely claim in "reply" that you have already deleted or cleared anything (e.g., STRICTLY PROHIBITED phrases: "已為您清除...", "已為您刪除...", "已經清空...", "已成功刪除...").
     * When proposing an action, you MUST emit the "action" object, and your "reply" MUST politely state that you have generated a confirmation card and guide the user to click the button to confirm and execute it, e.g.:
       "已為您建立「清空文章閱讀庫」的操作確認卡片。為保障您的資料安全與避免誤觸，請點擊下方的操作卡片確認按鈕以執行清除。"
   - CRITICAL SAFETY: If the user is merely asking a question ABOUT these operations (e.g. "如何清空單字？", "什麼是去重？"), explain in "reply" and DO NOT generate an "action"!
   - NEVER confuse "單字" (words) with "文章" (articles)!

6. LANGUAGE ADAPTATION:
   - Default language: Warm, professional Traditional Chinese (繁體中文, 台灣語境).
   - If the user writes in English, practices dialogue, asks for roleplay, or requests English responses, respond naturally and fluently in English (with bilingual notes if helpful).`;

    // Construct conversation contents
    const rawContents: any[] = [];

    // Contextual Grounding (injected into systemInstruction to isolate environment from user turns)
    const contextParts: string[] = [];

    // 1. Live Screen State Awareness
    if (screenContext) {
      const screenLines: string[] = [];
      const tabNames: Record<string, string> = {
        home: '首頁概覽儀表板（學習目標卡片、待複習單字提醒、掌握度分佈）',
        review: '複習測驗（SRS 間隔重複單字卡片複習模式）',
        quiz: '隨堂測驗（多模式克漏字/拼字/選擇題題型練習）',
        reader: screenContext.isReadingArticle
          ? `文章閱讀（正在沉浸式閱讀文章《${screenContext.activeArticleTitle || ''}》）`
          : `文章閱讀（目前在書架總覽瀏覽文章列表，共 ${screenContext.totalArticlesCount || 0} 篇）`,
        list: `單字庫（全庫單字管理，共 ${screenContext.totalWordsCount || 0} 個單字）`,
        ai: 'AI 學習語伴（自由英文深度對話與全庫即時智囊）'
      };
      screenLines.push(`【使用者當前操作畫面】: ${tabNames[screenContext.currentTab] || screenContext.currentTab}`);
      if (screenContext.totalWordsCount !== undefined) {
        screenLines.push(`【單字庫總量】: ${screenContext.totalWordsCount} 個單字，【今日待複習】: ${screenContext.dueWordsCount || 0} 個單字`);
      }
      if (screenContext.dailyStreak !== undefined) {
        screenLines.push(`【連續打卡天數】: ${screenContext.dailyStreak} 天，【今日已學】: ${screenContext.learnedToday || 0} 個單字`);
      }
      if (screenContext.activeStudyQuestion) {
        const q = screenContext.activeStudyQuestion;
        const qLines: string[] = [
          `\n【🎯 使用者當前正在作答/複習的題目資訊（請直接根據此題提供解說、記憶技巧、造句或選項辨析）】:`,
          `- 練習模式: ${q.mode === 'choice' ? '四選一選擇題' : '拼寫填空題'}`,
          `- 當前進度: 第 ${q.currentIndex} 題（共 ${q.totalQuestions} 題）`,
          `- 目標單字: 「${q.term}」 (${q.pos || 'n.'})`,
          `- 繁體中文釋義: ${q.def}`,
          q.defEn ? `- 英英釋義: ${q.defEn}` : '',
          q.sentence ? `- 題目句幹/例句: "${q.sentence}"` : '',
          q.options && q.options.length > 0 ? `- 選項清單: [${q.options.join(', ')}]` : '',
          `- 作答狀態: ${q.isAnswered ? `已作答（使用者選擇: "${q.userAnswer || '無'}"，結果: ${q.isCorrect ? '✅ 答對' : '❌ 答錯'}）` : '⏳ 思考中 / 尚未送出答案'}`
        ].filter(Boolean);
        screenLines.push(qLines.join('\n'));
      }
      if (screenContext.activeInspectedWord) {
        screenLines.push(`【🔍 使用者當前正開啟彈窗檢視/編輯的單字】: 「${screenContext.activeInspectedWord}」（若使用者說「解釋這個單字」或「刪除這個單字」，請直接針對此詞處理）`);
      }
      contextParts.push(screenLines.join('\n'));
    } else if (scenario) {
      contextParts.push(`【使用者當前所在場景】: ${scenario}${scenarioDesc ? ` (${scenarioDesc})` : ''}`);
    }

    // 2. Authoritative Database Knowledge Injection (100% Truth for Word/Article Inquiries)
    const wordsTotal =
      screenContext?.totalWordsCount !== undefined
        ? screenContext.totalWordsCount
        : Array.isArray(existingWordsSummary)
        ? existingWordsSummary.length
        : undefined;

    const articlesTotal =
      screenContext?.totalArticlesCount !== undefined
        ? screenContext.totalArticlesCount
        : Array.isArray(existingArticlesSummary)
        ? existingArticlesSummary.length
        : undefined;

    if (wordsTotal !== undefined || articlesTotal !== undefined || (screenContext?.allWordTerms && screenContext.allWordTerms.length > 0)) {
      const dbInfo: string[] = [
        `【📚 使用者真實資料庫數據庫統計（100% 精準權威數據，請如實直接回答使用者的查詢）】:`,
        wordsTotal !== undefined ? `- 單字庫收錄總量: 共 ${wordsTotal} 個單字` : '',
        articlesTotal !== undefined ? `- 文章閱讀庫總量: 共 ${articlesTotal} 篇文章` : '',
        screenContext?.dueWordsCount !== undefined ? `- 今日待複習單字數: ${screenContext.dueWordsCount} 個` : '',
        screenContext?.dailyStreak !== undefined ? `- 連續打卡天數: ${screenContext.dailyStreak} 天` : '',
        screenContext?.allWordTerms && Array.isArray(screenContext.allWordTerms) && screenContext.allWordTerms.length > 0
          ? `- 使用者現有單字清單 (全部 ${screenContext.allWordTerms.length} 字): [${screenContext.allWordTerms.slice(0, 150).join(', ')}${screenContext.allWordTerms.length > 150 ? '...等' : ''}]`
          : '',
        screenContext?.allArticleTitles && Array.isArray(screenContext.allArticleTitles) && screenContext.allArticleTitles.length > 0
          ? `- 使用者現有文章清單 (全部 ${screenContext.allArticleTitles.length} 篇): [${screenContext.allArticleTitles.map((t: string) => `《${t}》`).join(', ')}]`
          : ''
      ].filter(Boolean);
      contextParts.push(dbInfo.join('\n'));
    }

    // 3. Active Article Full Details Injection (CRITICAL FOR ANTI-HALLUCINATION)
    if (currentArticle && currentArticle.title) {
      const artDetails: string[] = [
        `【⭐⭐⭐ 使用者目前正開啟並停留在以下文章的閱讀畫面（完整內文如下，請嚴格基於此文回答）⭐⭐⭐】`,
        `文章標題: 《${currentArticle.title}》`,
        currentArticle.subtitle ? `副標題: ${currentArticle.subtitle}` : '',
        `難度等級: CEFR ${currentArticle.level || 'B1'}`,
        `主題分類: ${currentArticle.category || 'General'}`,
        currentArticle.wordCount ? `文章長度: 約 ${currentArticle.wordCount} 字` : '',
        currentArticle.summary ? `核心摘要: ${currentArticle.summary}` : '',
        `\n【文章完整正文內容 (Full Article Text)】:\n${(currentArticle.content || '（無內文）').slice(0, 40000)}`,
        currentArticle.translationZh ? `\n【文章中文對照翻譯】:\n${currentArticle.translationZh.slice(0, 20000)}` : '',
        currentArticle.savedWordTerms && currentArticle.savedWordTerms.length > 0
          ? `\n【使用者已在本文中標記/收錄的生詞】: ${currentArticle.savedWordTerms.join(', ')}`
          : '',
        currentArticle.keyVocabulary && currentArticle.keyVocabulary.length > 0
          ? `\n【本文已標註的核心詞彙】: ${currentArticle.keyVocabulary.map((k: any) => k.term).join(', ')}`
          : ''
      ].filter(Boolean);
      contextParts.push(artDetails.join('\n'));
    }

    // 4. Selective summary samples injection
    if (!currentArticle && existingArticlesSummary && Array.isArray(existingArticlesSummary) && existingArticlesSummary.length > 0) {
      contextParts.push(
        `【使用者的文章閱讀庫現有收錄資料（共 ${existingArticlesSummary.length} 篇，僅供參考）】: \n${JSON.stringify(
          existingArticlesSummary.slice(0, 10)
        )}`
      );
    }

    if (existingWordsSummary && Array.isArray(existingWordsSummary) && existingWordsSummary.length > 0) {
      contextParts.push(
        `【使用者的單字庫現有資料（共 ${existingWordsSummary.length} 個，僅供查詢/參考）】: \n${JSON.stringify(
          existingWordsSummary.slice(0, 30)
        )}`
      );
    }

    if (rawInputWords && rawInputWords.length > 0) {
      contextParts.push(`【使用者需要自動補全與標準化的原始單字列表】: ${rawInputWords.join(', ')}`);
    }
    if (externalScrapedContext) {
      contextParts.push(externalScrapedContext);
    }

    // Build chat history
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

    // Pure user turn: NEVER prepend context JSON blobs directly into the user turn!
    rawContents.push({
      role: 'user',
      parts: [{ text: rawUserPrompt || '請協助我' }]
    });

    // Ensure valid Gemini multiturn alternating format (user -> model -> user)
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
        parts: [{ text: rawUserPrompt || '請協助我' }]
      });
    }

    // Integrate live environmental context into system instructions
    const fullSystemInstruction = contextParts.length > 0
      ? `${systemInstruction}\n\n### 🖥️ LIVE USER SCREEN & ENVIRONMENT GROUNDING (使用者當前真實畫面與操作情境，請嚴格基於此情境提供專屬協助):\n${contextParts.join('\n\n')}`
      : systemInstruction;

    const config: any = {
      systemInstruction: fullSystemInstruction,
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description: 'Direct conversational response to the user in Traditional Chinese (or English if user converses in English).'
          },
          words: {
            type: Type.ARRAY,
            description: 'NEW vocabulary items to import into library. Empty array [] when not adding/recommending vocabulary.',
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING, description: 'The English word or phrase' },
                pos: { type: Type.STRING, description: 'Part of speech: n., v., adj., adv., phr., or other' },
                def: { type: Type.STRING, description: 'Standardized Traditional Chinese definition (繁體中文解釋)' },
                defEn: { type: Type.STRING, description: 'Clear English definition explaining the word in English (英英釋義)' },
                ex: { type: Type.STRING, description: 'Contextual English example sentence' }
              },
              required: ['term', 'pos', 'def', 'defEn']
            }
          },
          article: {
            type: Type.OBJECT,
            description: 'Structured English reading article ONLY if explicitly requested by user (article generation, bilingual reading, URL import).',
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING, description: 'Catchy, authentic English title' },
              subtitle: { type: Type.STRING, description: 'Subtitle or thematic overview' },
              author: { type: Type.STRING, description: 'Author or source publication name' },
              source: { type: Type.STRING, description: 'Source publication name or origin URL' },
              level: { type: Type.STRING, description: 'CEFR level: A1, A2, B1, B2, C1, or C2' },
              category: { type: Type.STRING, description: 'Category: Tech, Science, Business, News, Story, Daily, or Custom' },
              content: { type: Type.STRING, description: 'Complete English article text with paragraphs separated by double newlines (\n\n)' },
              translationZh: { type: Type.STRING, description: 'Paragraph-by-paragraph Traditional Chinese translation and explanation (繁體中文)' },
              summary: { type: Type.STRING, description: '1-2 sentence Traditional Chinese summary' },
              grammarPoints: {
                type: Type.ARRAY,
                description: '3-6 in-depth grammatical analyses of key/difficult sentences from the article',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sentence: { type: Type.STRING, description: 'Exact English sentence from article' },
                    structure: { type: Type.STRING, description: 'Syntactic breakdown formula' },
                    explanation: { type: Type.STRING, description: 'Detailed grammatical explanation in Traditional Chinese' },
                    grammarType: { type: Type.STRING, description: 'Grammar category tag' }
                  },
                  required: ['sentence', 'structure', 'explanation']
                }
              },
              keyVocabulary: {
                type: Type.ARRAY,
                description: '5-8 key academic or advanced vocabulary words extracted from the article',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    def: { type: Type.STRING, description: 'Traditional Chinese definition' },
                    defEn: { type: Type.STRING, description: 'Authentic English definition' },
                    level: { type: Type.STRING, description: 'CEFR level (e.g. B2, C1)' },
                    ex: { type: Type.STRING, description: 'Example sentence or sentence from article' }
                  },
                  required: ['term', 'pos', 'def', 'defEn']
                }
              },
              quiz: {
                type: Type.ARRAY,
                description: '1-2 multiple-choice reading comprehension questions',
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
            required: ['title', 'content', 'translationZh', 'summary', 'grammarPoints', 'keyVocabulary']
          },
          action: {
            type: Type.OBJECT,
            description: 'Proposed app database mutation action ONLY if user explicitly commanded a modification, deletion, or reset.',
            properties: {
              type: {
                type: Type.STRING,
                description:
                  'Action type: add_words, update_word, delete_word, batch_standardize, deduplicate_words, clear_all_words, reset_mastery, save_article, delete_article, clear_all_articles'
              },
              summary: {
                type: Type.STRING,
                description: 'Brief summary of the action in Traditional Chinese'
              },
              clearAllArticles: {
                type: Type.OBJECT,
                description: 'Details if type is clear_all_articles',
                properties: {
                  count: { type: Type.NUMBER }
                }
              },
              deleteArticle: {
                type: Type.OBJECT,
                description: 'Details if type is delete_article',
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING }
                }
              },
              saveArticle: {
                type: Type.OBJECT,
                description: 'Article to save into reader library if type is save_article',
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  author: { type: Type.STRING },
                  source: { type: Type.STRING },
                  level: { type: Type.STRING },
                  category: { type: Type.STRING },
                  content: { type: Type.STRING },
                  translationZh: { type: Type.STRING },
                  summary: { type: Type.STRING }
                }
              },
              resetMastery: {
                type: Type.OBJECT,
                description: 'Details if type is reset_mastery',
                properties: {
                  targetLevel: { type: Type.NUMBER },
                  count: { type: Type.NUMBER }
                }
              },
              clearAllWords: {
                type: Type.OBJECT,
                description: 'Details if type is clear_all_words',
                properties: {
                  count: { type: Type.NUMBER }
                }
              },
              deduplicateWords: {
                type: Type.OBJECT,
                description: 'Details for deduplicating repeated items if type is deduplicate_words',
                properties: {
                  duplicateTerms: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Array of terms detected to have duplicate definitions'
                  },
                  detail: {
                    type: Type.STRING,
                    description: 'Brief detail of duplicate cleanup'
                  }
                }
              },
              addWords: {
                type: Type.ARRAY,
                description: 'Words to add if type is add_words',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    def: { type: Type.STRING, description: 'Standardized Traditional Chinese definition' },
                    defEn: { type: Type.STRING, description: 'Clear English definition (英英釋義)' },
                    ex: { type: Type.STRING }
                  },
                  required: ['term', 'pos', 'def']
                }
              },
              updateWord: {
                type: Type.OBJECT,
                description: 'Word to update if type is update_word',
                properties: {
                  term: { type: Type.STRING },
                  newEntries: {
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
                }
              },
              deleteWord: {
                type: Type.OBJECT,
                description: 'Word to delete if type is delete_word',
                properties: {
                  term: { type: Type.STRING }
                }
              },
              batchStandardize: {
                type: Type.OBJECT,
                description: 'Batch standardization results',
                properties: {
                  originalCount: { type: Type.NUMBER },
                  updatedWords: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        term: { type: Type.STRING },
                        pos: { type: Type.STRING },
                        def: { type: Type.STRING },
                        defEn: { type: Type.STRING },
                        ex: { type: Type.STRING },
                        level: { type: Type.NUMBER }
                      },
                      required: ['term', 'pos', 'def']
                    }
                  }
                }
              }
            }
          }
        },
        required: ['reply']
      }
    };

    const response = await generateWithModelFallback(ai, config, contents);

    const outputText = response.text || '{}';
    let parsedData: any;
    try {
      parsedData = JSON.parse(outputText);
    } catch {
      parsedData = {
        reply: outputText,
        words: []
      };
    }

    // Process article ONLY if model returned valid article content
    if (parsedData.article && parsedData.article.content && parsedData.article.content.length > 50) {
      const content = parsedData.article.content;
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      parsedData.article = {
        id: parsedData.article.id || `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: parsedData.article.title || 'Contextual Reading Article',
        subtitle: parsedData.article.subtitle || 'Authentic Contextual Reading',
        author: parsedData.article.author || 'AI Reading Scholar',
        source: parsedData.article.source || (urlMatch ? urlMatch[0] : 'External Web'),
        level: parsedData.article.level || 'B2',
        category: parsedData.article.category || 'Science',
        content: parsedData.article.content,
        translationZh: parsedData.article.translationZh || '',
        summary: parsedData.article.summary || '',
        wordCount,
        readTimeMinutes: Math.max(1, Math.round(wordCount / 120)),
        savedWordTerms: [],
        isCustom: true,
        grammarPoints: Array.isArray(parsedData.article.grammarPoints) ? parsedData.article.grammarPoints : [],
        keyVocabulary: Array.isArray(parsedData.article.keyVocabulary) ? parsedData.article.keyVocabulary : [],
        quiz: Array.isArray(parsedData.article.quiz) ? parsedData.article.quiz : []
      };

      // Since an article is present, words array should be empty so UI displays article card cleanly
      parsedData.words = [];
      parsedData.action = {
        type: 'save_article',
        summary: `收錄文章《${parsedData.article.title}》至文章閱讀庫`,
        saveArticle: parsedData.article
      };
    } else {
      parsedData.article = undefined;
    }

    // Fallback intent checks & anti-hallucination interceptor for library management commands
    const promptClean = rawUserPrompt.trim().toLowerCase();
    const isQuestionOrHowTo = /(?:如何|怎麼|怎樣|教我|什麼是|能不能|可以嗎|如果|為甚麼|為什麼)/.test(promptClean);

    // Intent: Clear all articles
    // e.g. "請幫我刪除所有文章", "清空所有文章", "刪除全部文章", "把所有文章清掉", "清空文章庫", "書架文章全部清除", "移除所有文章"
    const isExplicitClearArticles =
      !isQuestionOrHowTo &&
      (/(?:清空|清除|刪除|移除|清掉|刪掉|全刪|全清).*(?:所有|全部|所有收錄|整庫|書架上的?|全庫|全部的|當前).*(?:文章|短文)/i.test(promptClean) ||
       /(?:所有|全部|整庫|全庫|全部的).*(?:文章|短文).*(?:清空|清除|刪除|移除|清掉|刪掉)/i.test(promptClean) ||
       /(?:清空|清除|刪除).*(?:文章庫|閱讀庫|文章閱讀庫)/i.test(promptClean));

    // Intent: Clear all words
    // e.g. "清空所有單字", "請幫我刪除全部單字", "清空單字庫", "把全庫單字清除", "刪除所有生詞"
    const isExplicitClearWords =
      !isExplicitClearArticles &&
      !isQuestionOrHowTo &&
      (/(?:清空|清除|刪除|移除|清掉|刪掉|全刪|全清).*(?:所有|全部|所有收錄|整庫|全庫|全部的).*(?:單字|生詞|詞彙|單詞)/i.test(promptClean) ||
       /(?:所有|全部|整庫|全庫|全部的).*(?:單字|生詞|詞彙|單詞).*(?:清空|清除|刪除|移除|清掉|刪掉)/i.test(promptClean) ||
       /(?:清空|清除).*(?:單字庫|生詞本|生字本|詞庫|字庫)/i.test(promptClean));

    // Intent: Delete specific article
    // e.g. "刪除文章 The Psychology of Flow", "幫我刪除文章《...》", "移除文章 ..."
    const deleteArticleMatch = !isQuestionOrHowTo && !isExplicitClearArticles &&
      promptClean.match(/(?:刪除|移除|刪掉)\s*(?:文章|短文)?\s*[《「"']?([^》」"'\n\r]{2,80})[》」"']?/i);

    // Intent: Delete specific word
    // e.g. "刪除單字 serendipity", "刪除單字 apple", "移除生詞 ..."
    const deleteWordMatch = !isQuestionOrHowTo && !isExplicitClearWords && !isExplicitClearArticles &&
      promptClean.match(/(?:刪除|移除|刪掉)\s*(?:單字|單詞|生詞)?\s*[《「"']?([a-zA-Z\-\s]{2,40})[》」"']?/i);

    const isExplicitDeduplicate =
      !isQuestionOrHowTo &&
      (promptClean.includes('合併重複') || promptClean.includes('單字去重') || promptClean.includes('字庫去重') || promptClean.includes('移除重複單字'));

    const isExplicitResetMastery =
      !isQuestionOrHowTo &&
      (promptClean.includes('重置') || promptClean.includes('歸零') || promptClean.includes('重設')) &&
      promptClean.includes('熟練度');

    const isExplicitBatchEnrich =
      !currentArticle &&
      !promptClean.includes('文章') &&
      !isQuestionOrHowTo &&
      (promptClean.includes('全庫') || promptClean.includes('所有單字') || promptClean.includes('單字庫')) &&
      (promptClean.includes('補') || promptClean.includes('完善') || promptClean.includes('補充') || promptClean.includes('填上') || promptClean.includes('加上')) &&
      (promptClean.includes('解釋') || promptClean.includes('釋義') || promptClean.includes('例句') || promptClean.includes('翻譯'));

    // Check if Gemini reply hallucinated an action completion claim in prose
    const replyText = parsedData.reply || '';
    const claimsArticleCleared = /(?:已為您|已成功|已經|已幫您).*(?:清除|清空|刪除|移除).*(?:文章|短文|閱讀庫|書架)/i.test(replyText);
    const claimsWordsCleared = /(?:已為您|已成功|已經|已幫您).*(?:清除|清空|刪除|移除).*(?:單字|生詞|詞庫|字庫)/i.test(replyText);

    if (isExplicitClearArticles || claimsArticleCleared) {
      const artCount = Array.isArray(existingArticlesSummary) ? existingArticlesSummary.length : 0;
      parsedData.action = {
        type: 'clear_all_articles',
        summary: `清空文章閱讀庫中的所有文章（共 ${artCount} 篇）`,
        clearAllArticles: { count: artCount }
      };
      parsedData.reply = `已為您建立「清空文章閱讀庫」的操作確認卡片。為保障您的資料安全與避免誤觸，請點擊下方的操作卡片確認按鈕以執行清除（共 ${artCount} 篇文章）。`;
    } else if (isExplicitClearWords || claimsWordsCleared) {
      const totalCount = Array.isArray(existingWordsSummary) ? existingWordsSummary.length : 0;
      parsedData.action = {
        type: 'clear_all_words',
        summary: `清空單字庫中的所有單字（共 ${totalCount} 個）`,
        clearAllWords: { count: totalCount }
      };
      parsedData.reply = `已為您建立「清空單字庫」的操作確認卡片。為保障您的資料安全與避免誤觸，請點擊下方的操作卡片確認按鈕以執行清除（共 ${totalCount} 個單字）。`;
    } else if (deleteArticleMatch && (!parsedData.action || parsedData.action.type !== 'delete_article')) {
      const targetTitle = deleteArticleMatch[1].trim();
      parsedData.action = {
        type: 'delete_article',
        summary: `從文章閱讀庫刪除指定文章《${targetTitle}》`,
        deleteArticle: { title: targetTitle }
      };
      parsedData.reply = `已為您建立刪除文章《${targetTitle}》的確認卡片，請點擊下方卡片按鈕確認刪除。`;
    } else if (deleteWordMatch && (!parsedData.action || parsedData.action.type !== 'delete_word')) {
      const targetTerm = deleteWordMatch[1].trim().toLowerCase();
      parsedData.action = {
        type: 'delete_word',
        summary: `從單字庫刪除單字「${targetTerm}」`,
        deleteWord: { term: targetTerm }
      };
      parsedData.reply = `已為您建立刪除單字「${targetTerm}」的確認卡片，請點擊下方卡片按鈕確認刪除。`;
    } else if (isExplicitDeduplicate) {
      parsedData.action = {
        type: 'deduplicate_words',
        summary: '合併單字庫中重複的項目並去重'
      };
      if (parsedData.reply && /(?:已為您|已成功|已經|已幫您).*(?:合併|去重)/i.test(parsedData.reply)) {
        parsedData.reply = '已為您建立「合併重複單字」的操作確認卡片，請點擊下方卡片按鈕確認執行。';
      }
    } else if (isExplicitResetMastery) {
      const totalCount = Array.isArray(existingWordsSummary) ? existingWordsSummary.length : 0;
      parsedData.action = {
        type: 'reset_mastery',
        summary: '將所有單字熟練度重置為完全不熟練 (Level 0)',
        resetMastery: { targetLevel: 0, count: totalCount }
      };
      if (parsedData.reply && /(?:已為您|已成功|已經|已幫您).*(?:重置|歸零)/i.test(parsedData.reply)) {
        parsedData.reply = '已為您建立「重置單字熟練度」的操作確認卡片，請點擊下方卡片按鈕確認執行。';
      }
    } else if (isExplicitBatchEnrich && (!parsedData.action || parsedData.action.type === 'batch_standardize')) {
      const wordsToEnrich = Array.isArray(existingWordsSummary) ? existingWordsSummary : [];
      const updatedWords: any[] = [];
      for (const w of wordsToEnrich) {
        let def = (w.def || '').trim();
        let defEn = (w.defEn || '').trim();
        let ex = (w.ex || '').trim();
        let pos = w.pos || 'n.';

        // Enrich missing definitions or examples via reliable bilingual dictionary
        if (!def || def.toLowerCase() === w.term.toLowerCase() || !defEn || !ex) {
          try {
            const details = await fetchBilingualWordDetails(w.term);
            if (!def || def.toLowerCase() === w.term.toLowerCase()) def = details.def || def;
            if (!defEn) defEn = details.defEn || defEn;
            if (!ex) ex = details.ex || `Review how "${w.term}" is used in context.`;
            if (pos === 'other' && details.pos) pos = details.pos;
          } catch {}
        }
        updatedWords.push({
          ...w,
          pos,
          def: def || `【${w.term}】`,
          defEn: defEn || `English definition for ${w.term}`,
          ex: ex || `Review how "${w.term}" is used in context.`
        });
      }

      parsedData.action = {
        type: 'batch_standardize',
        summary: `為單字庫中現有的 ${updatedWords.length} 個單字補齊繁體中文釋義、英英定義與例句`,
        words: updatedWords,
        batchStandardize: {
          originalCount: wordsToEnrich.length,
          updatedWords
        }
      };
      if (!parsedData.reply || parsedData.reply.length < 15) {
        parsedData.reply = `已為您為字庫中的 ${updatedWords.length} 個單字補全繁體中文解釋、英英釋義與例句，請點擊下方「確認執行」卡片按鈕即可同步更新至單字庫！`;
      }
    }

    // Normalize returned action properties if present
    if (parsedData.action) {
      if (parsedData.action.type === 'delete_word') {
        const term =
          parsedData.action.deleteWord?.term ||
          (parsedData.action as any).updateWord?.term ||
          (parsedData.action as any).term ||
          '';
        parsedData.action.deleteWord = { term };
      } else if (parsedData.action.type === 'delete_article') {
        const title =
          parsedData.action.deleteArticle?.title ||
          (parsedData.action as any).title ||
          (parsedData.action as any).saveArticle?.title ||
          '';
        parsedData.action.deleteArticle = { title };
      } else if (parsedData.action.type === 'clear_all_articles') {
        const artCount = Array.isArray(existingArticlesSummary) ? existingArticlesSummary.length : 0;
        parsedData.action.clearAllArticles = { count: artCount };
      } else if (parsedData.action.type === 'clear_all_words') {
        const totalCount = Array.isArray(existingWordsSummary) ? existingWordsSummary.length : 0;
        parsedData.action.clearAllWords = { count: totalCount };
      } else if (parsedData.action.type === 'batch_standardize') {
        let updatedWords = parsedData.action.batchStandardize?.updatedWords || parsedData.action.words;
        if (!updatedWords || !Array.isArray(updatedWords) || updatedWords.length === 0) {
          updatedWords = await enrichWordsWithEnglishDefinitions(ai, existingWordsSummary || []);
        }
        parsedData.action = {
          type: 'batch_standardize',
          summary: `為單字庫中現有的 ${updatedWords.length} 個單字補充英文釋義（defEn）並標準化`,
          words: updatedWords,
          batchStandardize: {
            originalCount: existingWordsSummary ? existingWordsSummary.length : updatedWords.length,
            updatedWords
          }
        };
      }
    }

    // Ensure that if any database action is present, reply NEVER falsely claims the action has already been performed
    if (parsedData.action) {
      if (parsedData.action.type === 'clear_all_articles') {
        const artCount = parsedData.action.clearAllArticles?.count ?? (Array.isArray(existingArticlesSummary) ? existingArticlesSummary.length : 0);
        if (!parsedData.reply || /(?:已為您|已成功|已經|已幫您).*(?:清除|清空|刪除)/i.test(parsedData.reply)) {
          parsedData.reply = `已為您建立「清空文章閱讀庫」的操作確認卡片。為保障您的資料安全與避免誤觸，請點擊下方的操作卡片確認按鈕以執行清除（共 ${artCount} 篇文章）。`;
        }
      } else if (parsedData.action.type === 'clear_all_words') {
        const totalCount = parsedData.action.clearAllWords?.count ?? (Array.isArray(existingWordsSummary) ? existingWordsSummary.length : 0);
        if (!parsedData.reply || /(?:已為您|已成功|已經|已幫您).*(?:清除|清空|刪除)/i.test(parsedData.reply)) {
          parsedData.reply = `已為您建立「清空單字庫」的操作確認卡片。為保障您的資料安全與避免誤觸，請點擊下方的操作卡片確認按鈕以執行清除（共 ${totalCount} 個單字）。`;
        }
      } else if (parsedData.action.type === 'delete_article') {
        const title = parsedData.action.deleteArticle?.title || '';
        if (!parsedData.reply || /(?:已為您|已成功|已經|已幫您).*(?:刪除|移除)/i.test(parsedData.reply)) {
          parsedData.reply = `已為您建立刪除文章《${title}》的確認卡片，請點擊下方卡片按鈕確認刪除。`;
        }
      } else if (parsedData.action.type === 'delete_word') {
        const term = parsedData.action.deleteWord?.term || '';
        if (!parsedData.reply || /(?:已為您|已成功|已經|已幫您).*(?:刪除|移除)/i.test(parsedData.reply)) {
          parsedData.reply = `已為您建立刪除單字「${term}」的確認卡片，請點擊下方卡片按鈕確認刪除。`;
        }
      }
    }

    // ── Fallback: Article intent detected but AI forgot to fill article field ──
    // ONLY trigger when user clearly wants a BRAND NEW article generated from scratch.
    // NEVER trigger when user is reading an existing article or asking about words/analysis!
    if (!parsedData.article) {
      const promptLower = rawUserPrompt.toLowerCase();

      const isAskingAboutWords =
        promptLower.includes('難字') ||
        promptLower.includes('生詞') ||
        promptLower.includes('單字') ||
        promptLower.includes('挑出') ||
        promptLower.includes('詞彙') ||
        promptLower.includes('字彙') ||
        promptLower.includes('單詞') ||
        promptLower.includes('vocab');

      const isAskingAboutAnalysis =
        promptLower.includes('分析') ||
        promptLower.includes('總結') ||
        promptLower.includes('摘要') ||
        promptLower.includes('文法') ||
        promptLower.includes('句型') ||
        promptLower.includes('意思') ||
        promptLower.includes('翻譯') ||
        promptLower.includes('解釋');

      const wantsNewArticle =
        !currentArticle &&
        !isAskingAboutWords &&
        !isAskingAboutAnalysis &&
        (promptLower.includes('文章') || promptLower.includes('article') || promptLower.includes('短文')) &&
        (promptLower.includes('生成') || promptLower.includes('寫一篇') || promptLower.includes('創作') ||
         promptLower.includes('產生一篇') || promptLower.includes('建立一篇') ||
         promptLower.includes('generate a new') || promptLower.includes('write an article'));

      if (wantsNewArticle) {
        try {
          const levelMatch = rawUserPrompt.match(/\b(A1|A2|B1|B2|C1|C2)\b/i);
          const requestedLevel = levelMatch ? levelMatch[1].toUpperCase() : 'B2';

          const articlePrompt = `Based on this user request: "${rawUserPrompt}"

Create a captivating, authentic English reading article at CEFR ${requestedLevel} level.

Return ONLY valid JSON with these exact fields:
{
  "title": "English article title",
  "subtitle": "Brief thematic subtitle",
  "author": "VocabMin AI Scholar",
  "source": "VocabMin AI",
  "level": "${requestedLevel}",
  "category": "Tech",
  "content": "Full English article text (3-5 paragraphs, separated by \\n\\n)",
  "translationZh": "Paragraph-by-paragraph Traditional Chinese translation",
  "summary": "1-2 sentence Traditional Chinese summary",
  "grammarPoints": [{"sentence":"...","structure":"...","explanation":"...","grammarType":"..."}],
  "keyVocabulary": [{"term":"...","pos":"n.","def":"中文釋義","defEn":"English definition","level":"${requestedLevel}","ex":"Example sentence"}]
}`;

          const articleResponse = await generateWithModelFallback(
            ai,
            { temperature: 0.6, responseMimeType: 'application/json' },
            [{ role: 'user', parts: [{ text: articlePrompt }] }]
          );

          const articleRaw = articleResponse.text || '{}';
          let articleParsed: any;
          try {
            articleParsed = JSON.parse(articleRaw);
          } catch {
            articleParsed = null;
          }

          if (articleParsed && articleParsed.content && articleParsed.content.length > 50) {
            const wordCount = articleParsed.content.split(/\s+/).filter(Boolean).length;
            parsedData.article = {
              id: `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              title: articleParsed.title || 'AI Generated Article',
              subtitle: articleParsed.subtitle || '',
              author: articleParsed.author || 'VocabMin AI Scholar',
              source: articleParsed.source || 'VocabMin AI',
              level: articleParsed.level || requestedLevel,
              category: articleParsed.category || 'Custom',
              content: articleParsed.content,
              translationZh: articleParsed.translationZh || '',
              summary: articleParsed.summary || '',
              wordCount,
              readTimeMinutes: Math.max(1, Math.round(wordCount / 120)),
              savedWordTerms: [],
              isCustom: true,
              grammarPoints: Array.isArray(articleParsed.grammarPoints) ? articleParsed.grammarPoints : [],
              keyVocabulary: Array.isArray(articleParsed.keyVocabulary) ? articleParsed.keyVocabulary : [],
              quiz: Array.isArray(articleParsed.quiz) ? articleParsed.quiz : []
            };
            parsedData.words = [];
            parsedData.action = {
              type: 'save_article',
              summary: `收錄文章《${parsedData.article.title}》至文章閱讀庫`,
              saveArticle: parsedData.article
            };
            if (!parsedData.reply || parsedData.reply.length < 10) {
              parsedData.reply = `已為您生成文章《${parsedData.article.title}》，請點擊下方卡片按鈕收錄至文章閱讀庫！`;
            }
          }
        } catch (articleErr) {
          console.error('Article fallback generation failed:', articleErr);
        }
      }
    }

    return res.json(parsedData);
  } catch (error: any) {
    console.error('Error generating vocabulary from Gemini:', error);
    const parsedErr = parseGeminiApiError(error);

    return res.status(parsedErr.statusCode).json({
      error: parsedErr.userMessage,
      reason: parsedErr.reason,
      details: parsedErr.details,
      suggestion: parsedErr.suggestion
    });
  }
});

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

  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);
  if (!ai) {
    // Intelligent reliable bilingual dictionary lookup
    const fallback = await fetchBilingualWordDetails(cleanWord, sentence);
    wordLookupCache.set(cacheKey, fallback);
    return res.json({
      ...fallback,
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
      pos: parsed.pos || 'n.',
      def: defZh,
      defEn: defEn,
      phonetic: parsed.phonetic || '',
      ex: parsed.ex || `Learning ${cleanWord} helps improve your vocabulary.`,
      exZh: parsed.exZh || ''
    };
    wordLookupCache.set(cacheKey, resultToCache);

    return res.json({
      ...resultToCache,
      fromCache: false
    });
  } catch (err: any) {
    console.warn('Word lookup AI error, using bilingual fallback:', err?.message || err);
    const fallback = await fetchBilingualWordDetails(cleanWord, sentence);
    wordLookupCache.set(cacheKey, fallback);
    return res.json({
      ...fallback,
      fromCache: false
    });
  }
});

// Cache for all meanings of words (polysemy / 一詞多義)
const wordAllMeaningsCache = new Map<string, any[]>();

// API: Polysemous word lookup - Returns all common definitions & parts of speech for a word
app.post('/api/ai/word-all-meanings', async (req, res) => {
  const word = req.body.word || req.body.term;
  const cleanWord = (word || '').trim();
  const forceRefresh = !!req.body.forceRefresh;

  if (!cleanWord) {
    return res.status(400).json({ error: 'Word is required' });
  }

  const cacheKey = cleanWord.toLowerCase();
  if (!forceRefresh && wordAllMeaningsCache.has(cacheKey)) {
    return res.json({
      term: cleanWord,
      meanings: wordAllMeaningsCache.get(cacheKey),
      fromCache: true
    });
  }

  const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);

  if (ai) {
    try {
      const prompt = `You are an expert bilingual lexicographer (Traditional Chinese / English).
Analyze the English word: "${cleanWord}".
Identify its distinct, common dictionary definitions and parts of speech (一詞多義).
Extract up to 4-5 most frequent and useful distinct meanings.

Return a JSON object with:
- "term": "${cleanWord}"
- "meanings": array of distinct definitions:
  - "pos": "n." | "v." | "adj." | "adv." | "phr." | "other"
  - "def": accurate, natural Traditional Chinese definition (繁體中文解釋)
  - "defEn": authentic, concise English definition (英英釋義)
  - "ex": short, natural English example sentence (8-14 words max)`;

      const config = {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            term: { type: Type.STRING },
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
          required: ['term', 'meanings']
        }
      };

      const response = await generateWithModelFallback(ai, config, prompt);
      const parsed = JSON.parse(response.text || '{}');
      if (Array.isArray(parsed.meanings) && parsed.meanings.length > 0) {
        const validMeanings = parsed.meanings.filter(
          (m: any) => m.def && m.def.toLowerCase() !== cleanWord.toLowerCase()
        );
        if (validMeanings.length > 0) {
          wordAllMeaningsCache.set(cacheKey, validMeanings);
          return res.json({
            term: cleanWord,
            meanings: validMeanings,
            fromCache: false
          });
        }
      }
    } catch (err: any) {
      console.warn('Word all meanings AI error, falling back to dictionary:', err?.message || err);
    }
  }

  // Fallback: Bilingual dictionary lookup for polysemous definitions
  try {
    const fallbackMeanings: any[] = [];
    const transUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&dt=bd&q=${encodeURIComponent(cleanWord)}`;
    const resTrans = await fetch(transUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (resTrans.ok) {
      const data = await resTrans.json();
      // data[1] is dictionary table: [ [pos_name, [def1, def2, ...]], ... ]
      if (Array.isArray(data[1])) {
        for (const posGroup of data[1]) {
          const rawPos = String(posGroup[0] || '').toLowerCase();
          let posTag = 'n.';
          if (rawPos.includes('verb')) posTag = 'v.';
          else if (rawPos.includes('noun')) posTag = 'n.';
          else if (rawPos.includes('adjective')) posTag = 'adj.';
          else if (rawPos.includes('adverb')) posTag = 'adv.';
          else if (rawPos.includes('preposition') || rawPos.includes('phrase')) posTag = 'phr.';
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

      // If no dictionary table, take primary translation
      if (fallbackMeanings.length === 0 && data[0]?.[0]?.[0]) {
        fallbackMeanings.push({
          pos: 'n.',
          def: String(data[0][0][0]).trim(),
          defEn: `English definition of ${cleanWord}`,
          ex: `The term ${cleanWord} is frequently used.`
        });
      }
    }

    wordAllMeaningsCache.set(cacheKey, fallbackMeanings);
    return res.json({
      term: cleanWord,
      meanings: fallbackMeanings,
      fromCache: false
    });
  } catch (err: any) {
    console.error('All meanings fallback failed:', err);
    return res.json({
      term: cleanWord,
      meanings: [
        {
          pos: 'n.',
          def: cleanWord,
          defEn: `Definition for ${cleanWord}`,
          ex: `Learning ${cleanWord} in context.`
        }
      ],
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
    sentenceAnalysisCache.set(cacheKey, resultToCache);

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
