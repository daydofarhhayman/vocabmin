/**
 * VocabMin Companion - Background Service Worker (Manifest V3)
 * Handles context menus, API calls, cross-origin fetching, and word persistence.
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
  // Setup default storage values
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
    // If content script was not injected on that tab, try scripting injection fallback
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      // Retry sending message
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

// Fallback bilingual lookup using open dictionary & Google Translate if API server is offline
async function fallbackDictionaryLookup(word, sentence = '') {
  const cleanWord = word.trim();
  let phonetic = '';
  let defEn = '';
  let pos = 'other';
  let ex = '';

  // 1. Try Free Dictionary API
  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    if (dictRes.ok) {
      const data = await dictRes.json();
      if (Array.isArray(data) && data[0]) {
        phonetic = data[0].phonetic || (data[0].phonetics?.find(p => p.text)?.text) || '';
        const meaning = data[0].meanings?.[0];
        if (meaning) {
          const rawPos = meaning.partOfSpeech || 'n.';
          pos = rawPos.startsWith('n') ? 'n.' :
                rawPos.startsWith('v') ? 'v.' :
                rawPos.startsWith('adj') ? 'adj.' :
                rawPos.startsWith('adv') ? 'adv.' : 'phr.';
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
      // If multiple dictionary definitions exist
      if (trData[1]?.[0]?.[1]?.[0]) {
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

  return {
    term: cleanWord,
    pos: pos || 'n.',
    def: defZh || cleanWord,
    defEn: defEn || 'English definition unavailable in offline mode.',
    phonetic: phonetic || '',
    ex: ex || (sentence ? sentence.slice(0, 120) : `I encountered the word "${cleanWord}" during reading.`),
    exZh: exZh || (sentence ? '（來自您閱讀的句子）' : `我在閱讀時遇到了「${cleanWord}」這個單字。`),
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

// Handle runtime messages from content script or popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'LOOKUP_WORD') {
    handleLookupWord(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // Keep message channel open for async response
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

// Lookup word via VocabMin API or fallback
async function handleLookupWord({ word, sentence }) {
  const store = await chrome.storage.local.get(['vocabmin_api_url', 'gemini_api_key']);
  const apiUrl = (store.vocabmin_api_url || 'https://vocabmin.ai.studio').replace(/\/+$/, '');
  const apiKey = store.gemini_api_key || '';

  try {
    const res = await fetch(`${apiUrl}/api/ai/article-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
      },
      body: JSON.stringify({ word, sentence })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('API lookup failed, falling back to local bilingual dictionary:', err);
  }

  return await fallbackDictionaryLookup(word, sentence);
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

// Save word into chrome.storage.local & optionally broadcast to active VocabMin tab
async function handleSaveWord(wordItem) {
  const data = await chrome.storage.local.get('vocabmin_saved_words');
  const current = data.vocabmin_saved_words || [];

  const cleanTerm = (wordItem.term || '').trim().toLowerCase();
  // Deduplicate
  const existingIndex = current.findIndex(w => w.term.toLowerCase() === cleanTerm && w.pos === wordItem.pos);

  const entry = {
    id: 'ext_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    term: wordItem.term.trim(),
    pos: wordItem.pos || 'n.',
    def: wordItem.def || '',
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

  await chrome.storage.local.set({ vocabmin_saved_words: current });

  // Broadcast to open VocabMin tabs if any
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && (tab.url.includes('vocabmin') || tab.url.includes('localhost:3000'))) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'VOCABMIN_NEW_WORD_ADDED',
          word: entry
        }).catch(() => {});
      }
    }
  } catch {}

  return { success: true, count: current.length, entry };
}

// Sync saved words to active VocabMin tab
async function handleSyncToVocabMinTab(words) {
  const store = await chrome.storage.local.get('vocabmin_api_url');
  const targetDomain = store.vocabmin_api_url || 'https://vocabmin.ai.studio';

  const tabs = await chrome.tabs.query({});
  let foundTab = null;
  for (const t of tabs) {
    if (t.url && (t.url.includes('vocabmin') || t.url.includes('localhost:3000'))) {
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

  // If no tab found, open a new VocabMin tab
  await chrome.tabs.create({ url: targetDomain });
  return { success: true, tabOpened: true, message: '已為您開啟 VocabMin，請於網頁中點擊同步。' };
}
