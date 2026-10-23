/**
 * VocabMin Companion - Background Service Worker (Manifest V3)
 * Handles context menus, Cambridge-first lookup, AI fallback, cross-origin fetching, and word persistence.
 */

const DEFAULT_SETTINGS = {
  vocabmin_api_url: 'https://vocabmin.ai.studio',
  gemini_api_key: '',
  enable_selection_bubble: true,
  auto_pronounce: false,
  vocabmin_saved_words: []
};

// Initialize settings and context menus on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const toUpdate = {};
  for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
    if (current[key] === undefined) {
      toUpdate[key] = val;
    }
  }
  if (Object.keys(toUpdate).length > 0) {
    await chrome.storage.local.set(toUpdate);
  }

  // Create Context Menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'vocabmin_lookup',
      title: '🔍 用 VocabMin 查詢「%s」',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'vocabmin_sentence',
      title: '🧠 AI 語法結構解析「%s」',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'vocabmin_separator',
      type: 'separator',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'vocabmin_open_app',
      title: '📖 打開 VocabMin 學習中心',
      contexts: ['page', 'selection', 'action']
    });
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'vocabmin_open_app') {
    const data = await chrome.storage.local.get('vocabmin_api_url');
    const targetUrl = data.vocabmin_api_url || 'https://vocabmin.ai.studio/';
    chrome.tabs.create({ url: targetUrl });
    return;
  }

  const selectedText = (info.selectionText || '').trim();
  if (!selectedText || !tab?.id) return;

  const isSentence = info.menuItemId === 'vocabmin_sentence' || selectedText.includes(' ');

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'CONTEXT_MENU_TRIGGER',
      type: info.menuItemId,
      text: selectedText,
      mode: isSentence ? 'sentence' : 'word'
    });
  } catch (err) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'CONTEXT_MENU_TRIGGER',
          type: info.menuItemId,
          text: selectedText,
          mode: isSentence ? 'sentence' : 'word'
        }).catch(() => {});
      }, 200);
    } catch (injectErr) {
      console.warn('Could not inject content script on this page:', injectErr);
    }
  }
});

// Normalize POS string to standard VocabMin POS tag
function normalizePosTag(raw) {
  if (!raw) return 'n.';
  const lower = String(raw).toLowerCase().trim();
  if (lower.includes('phrasal') || lower.includes('idiom') || lower.includes('prep') || lower.startsWith('phr')) return 'phr.';
  if (lower.startsWith('adv') || lower.includes('adverb')) return 'adv.';
  if (lower.startsWith('adj') || lower.includes('adjective')) return 'adj.';
  if (lower.startsWith('pron') || lower.includes('pronoun')) return 'other';
  if (lower.startsWith('v') || lower.includes('verb')) return 'v.';
  if (lower.startsWith('n') || lower.includes('noun')) return 'n.';
  return 'other';
}

// Decode basic HTML entities
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip HTML tags cleanly
function stripHtml(html) {
  if (!html) return '';
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

// Direct Cambridge Dictionary HTML/Markdown lookup (runs in background worker when server is offline)
async function lookupCambridgeDirect(word) {
  const cleanWord = word.trim().toLowerCase();
  if (!cleanWord || !/^[a-zA-Z\s'-]+$/.test(cleanWord)) return null;

  // 1a. Try direct fetch to Cambridge Dictionary HTML (extension service worker bypasses CORS)
  try {
    const camUrl = `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(cleanWord)}`;
    const res = await fetch(camUrl, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (res.ok && !res.url.endsWith('/english-chinese-traditional/') && !res.url.includes('/spellcheck/')) {
      const html = await res.text();
      const isSpellingPage =
        html.includes('拼寫建議') ||
        html.includes('Search suggestions for') ||
        html.includes('在該辭典中找不到');

      if (!isSpellingPage && (html.includes('ddef_d') || html.includes('def-block'))) {
        // Extract headword
        const hwMatch = html.match(/<span class="hw dhw"[^>]*>([\s\S]*?)<\/span>/i);
        const headerWord = hwMatch ? stripHtml(hwMatch[1]).toLowerCase() : cleanWord;

        // Extract US or UK IPA phonetic
        let phonetic = '';
        const usPronMatch = html.match(/class="us dpron-i[\s\S]*?<span class="ipa dipa[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const anyPronMatch = html.match(/<span class="ipa dipa[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const rawIpa = usPronMatch ? stripHtml(usPronMatch[1]) : anyPronMatch ? stripHtml(anyPronMatch[1]) : '';
        if (rawIpa) {
          phonetic = rawIpa.startsWith('/') ? rawIpa : `/${rawIpa}/`;
        }

        // Extract entry blocks by POS or def-block
        const meanings = [];
        const entryBlocks = html.split(/<div class="pr entry-body__el|<div class="entry-body__el/i);
        const blocksToScan = entryBlocks.length > 1 ? entryBlocks.slice(1) : [html];

        for (const entryHtml of blocksToScan) {
          const posMatch = entryHtml.match(/<span class="pos dpos"[^>]*>([\s\S]*?)<\/span>/i);
          const currentPos = posMatch ? normalizePosTag(stripHtml(posMatch[1])) : 'n.';

          const defBlocks = entryHtml.split(/<div class="def-block ddef_block/i).slice(1);
          for (const block of defBlocks) {
            const defEnMatch = block.match(/<div class="def ddef_d db"[^>]*>([\s\S]*?)<\/div>/i);
            const defZhMatch = block.match(/<span class="trans dtrans dtrans-se[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
            if (!defEnMatch || !defZhMatch) continue;

            const defEn = stripHtml(defEnMatch[1]).replace(/:\s*$/, '').trim();
            const defZh = stripHtml(defZhMatch[1]).trim();
            if (!defZh || !/[\u4e00-\u9fa5]/.test(defZh) || defZh.includes('{{')) continue;

            let ex = '';
            let exZh = '';
            const exBlockMatch = block.match(/<div class="examp dexamp"[^>]*>([\s\S]*?)<\/div>/i);
            if (exBlockMatch) {
              const exEnMatch = exBlockMatch[1].match(/<span class="eg deg"[^>]*>([\s\S]*?)<\/span>/i);
              const exTransMatch = exBlockMatch[1].match(/<span class="trans dtrans[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
              if (exEnMatch) ex = stripHtml(exEnMatch[1]);
              if (exTransMatch) exZh = stripHtml(exTransMatch[1]);
            }

            if (!meanings.some((m) => m.def === defZh && m.pos === currentPos)) {
              meanings.push({
                pos: currentPos,
                def: defZh,
                defEn,
                ex: ex || `Authentic usage example of "${cleanWord}".`,
                exZh: exZh || ''
              });
            }
            if (meanings.length >= 6) break;
          }
          if (meanings.length >= 6) break;
        }

        if (meanings.length > 0) {
          const isInflected = headerWord && headerWord !== cleanWord;
          return {
            term: cleanWord,
            status: isInflected ? 'inflected' : 'valid',
            baseForm: isInflected ? headerWord : undefined,
            inflectionType: isInflected ? '單字變形' : undefined,
            phonetic,
            meanings,
            source: 'cambridge',
            sourceLabel: isInflected
              ? `劍橋英漢辭典 (偵測為「${headerWord}」之變形)`
              : '劍橋英漢辭典 (Cambridge Dictionary)'
          };
        }
      }
    }
  } catch (e) {
    console.warn('Direct Cambridge HTML fetch skipped:', e?.message || e);
  }

  return null;
}

// Direct Gemini AI lookup when word is NOT in Cambridge Dictionary and VocabMin server is unreachable
async function lookupGeminiDirect(word, sentence, apiKey) {
  if (!apiKey) return null;
  const cleanWord = word.trim();
  const prompt = `You are an expert bilingual lexicographer, lemmatizer, and spelling checker (Traditional Chinese / English).
Align your definitions, parts of speech, and usage closely with authentic Cambridge English-Chinese Dictionary (劍橋英漢辭典) standards.
Evaluate the user input: "${cleanWord}"${sentence ? ` (Context: "${sentence}")` : ''}.

Categorize into one of 4 states:
1. "valid": A real recognized English word or phrase.
2. "inflected": An inflected form of a base English lemma (provide "baseForm" in lowercase and "inflectionType" in Traditional Chinese).
3. "typo": A misspelled word closely resembling 1-4 real English words (provide "suggestions" array, and empty "meanings": []).
4. "invalid": Meaningless gibberish or non-existent word (empty "meanings": []).

If "valid" or "inflected", provide 1-4 distinct meanings with:
- "pos": "n." | "v." | "adj." | "adv." | "phr." | "other"
- "def": Traditional Chinese definition (繁體中文釋義)
- "defEn": English definition (英英釋義)
- "ex": Concise English example sentence (8-14 words)
- "exZh": Traditional Chinese translation of the example sentence
Also provide "phonetic" (IPA pronunciation).
Return ONLY valid JSON: {"term":"...","status":"valid|inflected|typo|invalid","baseForm":"...","inflectionType":"...","phonetic":"...","suggestions":[],"meanings":[{"pos":"n.","def":"...","defEn":"...","ex":"...","exZh":"..."}]}`;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(8500),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) continue;
      const parsed = JSON.parse(rawText);
      return {
        term: cleanWord,
        status: parsed.status || 'valid',
        baseForm: parsed.baseForm,
        inflectionType: parsed.inflectionType,
        phonetic: parsed.phonetic || '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        meanings: Array.isArray(parsed.meanings) ? parsed.meanings : [],
        source: 'ai',
        sourceLabel:
          parsed.status === 'inflected' && parsed.baseForm
            ? `Gemini AI 智能解析 (偵測為「${parsed.baseForm}」之變形)`
            : 'Gemini AI 智能解析 (劍橋未收錄 · AI 生成)'
      };
    } catch (e) {
      console.warn(`Direct Gemini (${model}) lookup error:`, e?.message || e);
    }
  }
  return null;
}

// Fetch phonetic from Free Dictionary API if missing
async function fetchPhoneticOnly(word) {
  try {
    const dictRes = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim().toLowerCase())}`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (dictRes.ok) {
      const data = await dictRes.json();
      if (Array.isArray(data) && data[0]) {
        return data[0].phonetic || data[0].phonetics?.find((p) => p.text)?.text || '';
      }
    }
  } catch {}
  return '';
}

// Fallback bilingual lookup using open dictionary & Google Translate if API server and AI are offline
async function fallbackDictionaryLookup(word, sentence = '') {
  const cleanWord = word.trim();
  let phonetic = '';
  let defEn = '';
  let pos = 'n.';
  let ex = '';
  const meanings = [];

  // 1. Try Free Dictionary API
  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    if (dictRes.ok) {
      const data = await dictRes.json();
      if (Array.isArray(data) && data[0]) {
        phonetic = data[0].phonetic || (data[0].phonetics?.find((p) => p.text)?.text) || '';
        const meaning = data[0].meanings?.[0];
        if (meaning) {
          pos = normalizePosTag(meaning.partOfSpeech || 'n.');
          const defObj = meaning.definitions?.[0];
          if (defObj) {
            defEn = defObj.definition || '';
            ex = defObj.example || '';
          }
        }
      }
    }
  } catch {}

  // 2. Google Translate for Traditional Chinese definition
  let defZh = '';
  let exZh = '';
  try {
    const trRes = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&dt=bd&q=${encodeURIComponent(cleanWord)}`
    );
    if (trRes.ok) {
      const trData = await trRes.json();
      defZh = trData[0]?.[0]?.[0] || '';
      if (Array.isArray(trData[1])) {
        for (const group of trData[1]) {
          const gPos = normalizePosTag(group[0] || pos);
          const gDefs = Array.isArray(group[1]) ? group[1].slice(0, 3).join('；') : '';
          if (gDefs) {
            meanings.push({
              pos: gPos,
              def: gDefs,
              defEn: defEn || '',
              ex: ex || ''
            });
          }
        }
      }
      if (!meanings.length && trData[1]?.[0]?.[1]?.[0]) {
        defZh = trData[1][0][1].slice(0, 3).join('、');
      }
    }
  } catch {
    defZh = cleanWord;
  }

  if (ex && !exZh) {
    try {
      const exRes = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(ex)}`
      );
      if (exRes.ok) {
        const exData = await exRes.json();
        exZh = exData[0]?.[0]?.[0] || '';
      }
    } catch {}
  }

  const finalDef = meanings[0]?.def || defZh || cleanWord;
  const finalPos = meanings[0]?.pos || pos || 'n.';
  const finalEx = ex || (sentence ? sentence.slice(0, 120) : `I encountered the word "${cleanWord}" during reading.`);
  const finalExZh = exZh || (sentence ? '（來自您閱讀的句子）' : `我在閱讀時遇到了「${cleanWord}」這個單字。`);

  if (meanings.length === 0) {
    meanings.push({
      pos: finalPos,
      def: finalDef,
      defEn: defEn || '',
      ex: finalEx,
      exZh: finalExZh
    });
  }

  return {
    term: cleanWord,
    status: 'valid',
    pos: finalPos,
    def: finalDef,
    defEn: defEn || 'English definition unavailable in offline mode.',
    phonetic: phonetic || '',
    ex: finalEx,
    exZh: finalExZh,
    meanings,
    source: 'dictionary',
    sourceLabel: '雙語辭典備援 (離線模式)',
    fromFallback: true
  };
}

// Fallback sentence breakdown
async function fallbackSentenceAnalysis(sentence) {
  const cleanSentence = sentence.trim();
  let translation = '';
  try {
    const trRes = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(cleanSentence)}`
    );
    if (trRes.ok) {
      const trData = await trRes.json();
      translation = trData[0]?.[0]?.[0] || '';
    }
  } catch {
    translation = cleanSentence;
  }

  return {
    sentence: cleanSentence,
    translation: translation || cleanSentence,
    grammarBreakdown: '📌 句子結構概要（本地解析模式）：\n• 建議確認主要主詞與動詞\n• 請檢查是否有連接詞或關係子句引導延伸語義',
    learningTip: '可選取句中的個別關鍵單字查詢深入釋義與例句。',
    fromFallback: true
  };
}

// Normalize multi-meaning payload into unified response for content.js & popup.js
async function formatLookupPayload(cleanWord, rawData, sentence) {
  const rawMeanings = Array.isArray(rawData.meanings) ? rawData.meanings : [];
  const validMeanings = rawMeanings
    .filter((m) => m && typeof m.def === 'string' && m.def.trim().length > 0 && !m.def.includes('{{'))
    .map((m) => ({
      pos: normalizePosTag(m.pos),
      def: m.def.trim(),
      defEn: (m.defEn || '').trim(),
      ex: (m.ex || '').trim(),
      exZh: (m.exZh || '').trim()
    }));

  const primary = validMeanings[0] || {
    pos: normalizePosTag(rawData.pos || 'n.'),
    def: rawData.def || '',
    defEn: rawData.defEn || '',
    ex: rawData.ex || '',
    exZh: rawData.exZh || ''
  };

  let phonetic = rawData.phonetic || '';
  if (!phonetic && (rawData.status === 'valid' || rawData.status === 'inflected' || !rawData.status)) {
    phonetic = await fetchPhoneticOnly(rawData.baseForm || cleanWord);
  }

  let exZh = primary.exZh || rawData.exZh || '';
  if (primary.ex && !exZh) {
    try {
      const exRes = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(primary.ex)}`,
        { signal: AbortSignal.timeout(2500) }
      );
      if (exRes.ok) {
        const exData = await exRes.json();
        exZh = exData[0]?.[0]?.[0] || '';
        if (validMeanings[0]) validMeanings[0].exZh = exZh;
      }
    } catch {}
  }

  return {
    term: rawData.term || cleanWord,
    status: rawData.status || 'valid',
    baseForm: rawData.baseForm,
    inflectionType: rawData.inflectionType,
    suggestions: Array.isArray(rawData.suggestions) ? rawData.suggestions : [],
    message: rawData.message,
    pos: primary.pos || 'n.',
    def: primary.def || '',
    defEn: primary.defEn || '',
    phonetic,
    ex: primary.ex || (sentence ? sentence.slice(0, 140) : ''),
    exZh,
    meanings: validMeanings.length > 0 ? validMeanings : (primary.def ? [primary] : []),
    source: rawData.source || 'cambridge',
    sourceLabel:
      rawData.sourceLabel ||
      (rawData.source === 'cambridge'
        ? '劍橋英漢辭典 (Cambridge Dictionary)'
        : rawData.source === 'ai'
        ? 'Gemini AI 智能解析 (劍橋未收錄 · AI 生成)'
        : '雙語辭典備援')
  };
}

// Handle runtime messages from content script or popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'LOOKUP_WORD') {
    handleLookupWord(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (request.action === 'ANALYZE_SENTENCE') {
    handleAnalyzeSentence(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (request.action === 'SAVE_WORD') {
    handleSaveWord(request.word).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'SAVE_WORDS') {
    handleSaveWordsBulk(request.words).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'GET_SAVED_WORDS') {
    chrome.storage.local.get('vocabmin_saved_words').then((res) => {
      sendResponse(res.vocabmin_saved_words || []);
    });
    return true;
  }

  if (request.action === 'CLEAR_SAVED_WORDS') {
    chrome.storage.local.set({ vocabmin_saved_words: [] }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'SYNC_TO_VOCABMIN_TAB') {
    handleSyncToVocabMinTab(request.words).then(sendResponse);
    return true;
  }
});

/**
 * Lookup word with the exact same priority pipeline as AddWordModal:
 * Priority 1: Search Cambridge Dictionary (劍橋英漢辭典)
 * Priority 2: If not listed in Cambridge, use Gemini AI to generate explanations
 * Priority 3: Fallback to Bilingual Dictionary
 */
async function handleLookupWord({ word, sentence }) {
  const cleanWord = (word || '').trim();
  if (!cleanWord) return { error: '請輸入要查詢的單字' };

  const store = await chrome.storage.local.get(['vocabmin_api_url', 'gemini_api_key']);
  const apiUrl = (store.vocabmin_api_url || 'https://vocabmin.ai.studio').replace(/\/+$/, '');
  const apiKey = store.gemini_api_key || '';

  // Step 1: Direct Cambridge Dictionary lookup from extension background worker (fast & works even if server is offline)
  const directCambridge = await lookupCambridgeDirect(cleanWord);
  if (directCambridge && directCambridge.meanings && directCambridge.meanings.length > 0) {
    return await formatLookupPayload(cleanWord, directCambridge, sentence);
  }

  // Step 2: Query VocabMin Server's /api/ai/word-all-meanings (Cambridge Jina scraper -> Gemini AI -> Spellcheck)
  try {
    const res = await fetch(`${apiUrl}/api/ai/word-all-meanings`, {
      method: 'POST',
      signal: AbortSignal.timeout(11000),
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
      },
      body: JSON.stringify({ term: cleanWord, word: cleanWord, apiKey })
    });

    if (res.ok) {
      const data = await res.json();
      return await formatLookupPayload(cleanWord, data, sentence);
    }
  } catch (err) {
    console.warn('VocabMin server /api/ai/word-all-meanings unreachable, trying direct AI/dictionary fallback:', err);
  }

  // Step 3: If server was unreachable and Cambridge didn't have the word, try direct Gemini AI with user's API key
  if (apiKey) {
    const directAI = await lookupGeminiDirect(cleanWord, sentence, apiKey);
    if (directAI) {
      return await formatLookupPayload(cleanWord, directAI, sentence);
    }
  }

  // Step 4: Offline bilingual dictionary fallback
  return await fallbackDictionaryLookup(cleanWord, sentence);
}

// Sentence analysis via VocabMin API or fallback
async function handleAnalyzeSentence({ sentence }) {
  const store = await chrome.storage.local.get(['vocabmin_api_url', 'gemini_api_key']);
  const apiUrl = (store.vocabmin_api_url || 'https://vocabmin.ai.studio').replace(/\/+$/, '');
  const apiKey = store.gemini_api_key || '';

  try {
    const res = await fetch(`${apiUrl}/api/ai/analyze-sentence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
      },
      body: JSON.stringify({ sentence })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('API sentence analysis failed, falling back to translation:', err);
  }

  return await fallbackSentenceAnalysis(sentence);
}

// Save a single word entry
async function handleSaveWord(wordItem) {
  return await handleSaveWordsBulk([wordItem]);
}

// Save one or multiple word meanings into chrome.storage.local & broadcast to active VocabMin tab
async function handleSaveWordsBulk(wordItems) {
  if (!Array.isArray(wordItems) || wordItems.length === 0) {
    return { success: false, error: 'No word items provided' };
  }

  const data = await chrome.storage.local.get('vocabmin_saved_words');
  const current = data.vocabmin_saved_words || [];
  const savedEntries = [];

  for (let i = 0; i < wordItems.length; i++) {
    const wordItem = wordItems[i];
    if (!wordItem || !wordItem.term) continue;

    const cleanTerm = wordItem.term.trim().toLowerCase();
    const cleanPos = normalizePosTag(wordItem.pos || 'n.');
    const cleanDef = (wordItem.def || '').trim();

    // Deduplicate by term + pos + def (supports saving multiple distinct meanings of a polysemous word)
    const existingIndex = current.findIndex(
      (w) =>
        w.term.toLowerCase() === cleanTerm &&
        w.pos === cleanPos &&
        (w.def || '').trim().toLowerCase() === cleanDef.toLowerCase()
    );

    const entry = {
      id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${i}`,
      term: wordItem.term.trim(),
      pos: cleanPos,
      def: cleanDef,
      defEn: wordItem.defEn || '',
      phonetic: wordItem.phonetic || '',
      ex: wordItem.ex || '',
      exZh: wordItem.exZh || '',
      sourceUrl: wordItem.sourceUrl || '',
      contextSentence: wordItem.contextSentence || '',
      timestamp: Date.now()
    };

    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...entry };
    } else {
      current.unshift(entry);
    }
    savedEntries.push(entry);
  }

  await chrome.storage.local.set({ vocabmin_saved_words: current });

  // Broadcast to open VocabMin tabs if any
  try {
    const store = await chrome.storage.local.get('vocabmin_api_url');
    const customDomain = (store.vocabmin_api_url || '').replace(/\/+$/, '');
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (
        tab.url &&
        (tab.url.includes('vocabmin') ||
          tab.url.includes('localhost:3000') ||
          (customDomain && tab.url.startsWith(customDomain)))
      ) {
        if (savedEntries.length === 1) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'VOCABMIN_NEW_WORD_ADDED',
            word: savedEntries[0]
          }).catch(() => {});
        } else if (savedEntries.length > 1) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'VOCABMIN_SYNC_WORDS_BULK',
            words: savedEntries
          }).catch(() => {});
        }
      }
    }
  } catch {}

  return { success: true, count: current.length, entries: savedEntries, entry: savedEntries[0] };
}

// Sync saved words to active VocabMin tab
async function handleSyncToVocabMinTab(words) {
  const store = await chrome.storage.local.get('vocabmin_api_url');
  const targetDomain = (store.vocabmin_api_url || 'https://vocabmin.ai.studio').replace(/\/+$/, '');

  const tabs = await chrome.tabs.query({});
  let foundTab = null;
  for (const t of tabs) {
    if (
      t.url &&
      (t.url.includes('vocabmin') ||
        t.url.includes('localhost:3000') ||
        (targetDomain && t.url.startsWith(targetDomain)))
    ) {
      foundTab = t;
      break;
    }
  }

  if (foundTab) {
    try {
      await chrome.tabs.sendMessage(foundTab.id, {
        action: 'VOCABMIN_SYNC_WORDS_BULK',
        words: words
      });
      await chrome.tabs.update(foundTab.id, { active: true });
      return { success: true, tabOpened: false, message: '已成功同步至已開啟的 VocabMin 頁面！' };
    } catch {
      // Tab might not have listener loaded, proceed to open or message
    }
  }

  await chrome.tabs.create({ url: targetDomain });
  return { success: true, tabOpened: true, message: '已為您開啟 VocabMin，請於網頁中點擊同步。' };
}
