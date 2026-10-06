/**
 * VocabMin Companion - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const wordCountBadge = document.getElementById('word-count-badge');

  // Tab 1 Elements
  const wordsListContainer = document.getElementById('words-list-container');
  const wordsEmptyState = document.getElementById('words-empty-state');
  const wordsFilterInput = document.getElementById('words-filter-input');
  const btnSyncVocabmin = document.getElementById('btn-sync-vocabmin');
  const btnExportWords = document.getElementById('btn-export-words');
  const btnClearWords = document.getElementById('btn-clear-words');

  // Tab 2 Elements
  const quickLookupInput = document.getElementById('quick-lookup-input');
  const btnQuickLookup = document.getElementById('btn-quick-lookup');
  const lookupResultContainer = document.getElementById('lookup-result-container');

  // Tab 3 Elements
  const settingApiUrl = document.getElementById('setting-api-url');
  const settingApiKey = document.getElementById('setting-api-key');
  const settingEnableBubble = document.getElementById('setting-enable-bubble');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const settingsFeedback = document.getElementById('settings-feedback');

  // Footer Element
  const btnOpenVocabminApp = document.getElementById('btn-open-vocabmin-app');

  let allSavedWords = [];

  // Tab Switching
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      navBtns.forEach((b) => b.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(`pane-${target}`);
      if (pane) pane.classList.add('active');
    });
  });

  // Audio pronounce helper
  function playAudio(text) {
    if (!text || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    } catch {}
  }

  // Load and Render Saved Words
  async function loadSavedWords() {
    const data = await chrome.storage.local.get('vocabmin_saved_words');
    allSavedWords = data.vocabmin_saved_words || [];
    renderSavedWords(allSavedWords);
  }

  function renderSavedWords(words) {
    wordCountBadge.textContent = words.length;

    if (!words || words.length === 0) {
      wordsListContainer.innerHTML = '';
      wordsEmptyState.style.display = 'block';
      return;
    }

    wordsEmptyState.style.display = 'none';
    wordsListContainer.innerHTML = words.map((w, idx) => `
      <div class="word-card" data-index="${idx}">
        <div class="word-card-top">
          <div class="word-term-group">
            <span class="word-term">${escapeHtml(w.term)}</span>
            ${w.pos ? `<span class="word-pos">${escapeHtml(w.pos)}</span>` : ''}
            ${w.phonetic ? `<span class="word-phonetic">${escapeHtml(w.phonetic)}</span>` : ''}
          </div>
          <div class="word-card-actions">
            <button class="icon-btn btn-play-audio" data-term="${escapeHtml(w.term)}" title="發音">🔊</button>
            <button class="icon-btn btn-remove-word" data-id="${w.id || idx}" title="刪除">✕</button>
          </div>
        </div>
        <div class="word-def">${escapeHtml(w.def)}</div>
        ${w.ex ? `<div class="word-ex">${escapeHtml(w.ex)}</div>` : ''}
      </div>
    `).join('');

    // Attach card event listeners
    wordsListContainer.querySelectorAll('.btn-play-audio').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        playAudio(btn.getAttribute('data-term'));
      };
    });

    wordsListContainer.querySelectorAll('.btn-remove-word').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const wordId = btn.getAttribute('data-id');
        const updated = allSavedWords.filter((w, i) => (w.id ? w.id !== wordId : i !== Number(wordId)));
        allSavedWords = updated;
        await chrome.storage.local.set({ vocabmin_saved_words: updated });
        renderSavedWords(allSavedWords);
      };
    });
  }

  // Filter words
  wordsFilterInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      renderSavedWords(allSavedWords);
      return;
    }
    const filtered = allSavedWords.filter(
      (w) =>
        w.term.toLowerCase().includes(query) ||
        (w.def && w.def.toLowerCase().includes(query)) ||
        (w.ex && w.ex.toLowerCase().includes(query))
    );
    renderSavedWords(filtered);
  });

  // Export words as JSON
  btnExportWords.addEventListener('click', () => {
    if (allSavedWords.length === 0) {
      alert('目前沒有收錄任何生字！');
      return;
    }
    const jsonStr = JSON.stringify(allSavedWords, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      alert(`已成功複製 ${allSavedWords.length} 個單字資料 (JSON 格式) 到剪貼簿！可直接於 VocabMin 網頁端匯入。`);
    }).catch(() => {
      alert('複製失敗，請手動複製。');
    });
  });

  // Clear words
  btnClearWords.addEventListener('click', async () => {
    if (allSavedWords.length === 0) return;
    if (confirm(`確定要清空已收錄的 ${allSavedWords.length} 個單字嗎？`)) {
      allSavedWords = [];
      await chrome.storage.local.set({ vocabmin_saved_words: [] });
      renderSavedWords([]);
    }
  });

  // Sync to VocabMin Tab
  btnSyncVocabmin.addEventListener('click', () => {
    if (allSavedWords.length === 0) {
      alert('目前沒有收錄任何生字可供同步！');
      return;
    }
    btnSyncVocabmin.textContent = '⏳ 同步中...';
    btnSyncVocabmin.disabled = true;

    chrome.runtime.sendMessage(
      { action: 'SYNC_TO_VOCABMIN_TAB', words: allSavedWords },
      (res) => {
        btnSyncVocabmin.disabled = false;
        btnSyncVocabmin.textContent = '🔄 同步到網頁';
        if (res?.success) {
          alert(res.message || '已成功傳送單字到 VocabMin 頁面！');
        } else {
          alert('同步發生錯誤，請先打開 VocabMin 網頁。');
        }
      }
    );
  });

  // Quick Lookup
  async function performQuickLookup() {
    const query = quickLookupInput.value.trim();
    if (!query) return;

    lookupResultContainer.innerHTML = `
      <div style="text-align: center; padding: 25px 0; color: #64748b;">
        <div style="font-size: 20px; margin-bottom: 6px;">⏳</div>
        <div>正在查詢「${escapeHtml(query)}」...</div>
      </div>
    `;

    chrome.runtime.sendMessage(
      {
        action: 'LOOKUP_WORD',
        payload: { word: query, sentence: '' }
      },
      (res) => {
        if (!res || res.error) {
          lookupResultContainer.innerHTML = `<div style="color: #ef4444; padding: 10px;">查詢失敗：${escapeHtml(res?.error || '網路異常')}</div>`;
          return;
        }

        const term = res.term || query;
        const pos = res.pos || 'n.';
        const def = res.def || '';
        const defEn = res.defEn || '';
        const phonetic = res.phonetic || '';
        const ex = res.ex || '';
        const exZh = res.exZh || '';

        lookupResultContainer.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div>
              <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(term)}</div>
              <div style="display:flex; gap: 6px; align-items:center; margin-top:2px;">
                <span style="font-size:11px; background:#e0e7ff; color:#4338ca; padding:1px 5px; border-radius:4px; font-weight:600;">${escapeHtml(pos)}</span>
                ${phonetic ? `<span style="color:#6366f1; font-size:12px;">${escapeHtml(phonetic)}</span>` : ''}
                <button id="lookup-speak-btn" style="border:none; background:none; cursor:pointer;">🔊</button>
              </div>
            </div>
            <button id="lookup-add-btn" class="btn-sm btn-primary">+ 加入生字庫</button>
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 6px;">${escapeHtml(def)}</div>
          ${defEn ? `<div style="font-size: 12px; color: #475569; font-style: italic; margin-bottom: 8px;">${escapeHtml(defEn)}</div>` : ''}
          ${ex ? `
            <div style="background:#f8fafc; border-left:3px solid #6366f1; padding:6px 8px; border-radius:0 6px 6px 0; font-size:12px;">
              <div style="font-weight:500; color:#1e293b;">${escapeHtml(ex)}</div>
              ${exZh ? `<div style="color:#64748b; margin-top:2px;">${escapeHtml(exZh)}</div>` : ''}
            </div>
          ` : ''}
        `;

        document.getElementById('lookup-speak-btn').onclick = () => playAudio(term);
        const addBtn = document.getElementById('lookup-add-btn');
        addBtn.onclick = () => {
          chrome.runtime.sendMessage({
            action: 'SAVE_WORD',
            word: { term, pos, def, defEn, phonetic, ex, exZh }
          }, (saveRes) => {
            if (saveRes?.success) {
              addBtn.disabled = true;
              addBtn.textContent = '✅ 已加入';
              addBtn.style.background = '#10b981';
              loadSavedWords();
            }
          });
        };
      }
    );
  }

  btnQuickLookup.addEventListener('click', performQuickLookup);
  quickLookupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performQuickLookup();
  });

  // Settings
  async function loadSettings() {
    const store = await chrome.storage.local.get([
      'vocabmin_api_url',
      'gemini_api_key',
      'enable_selection_bubble'
    ]);
    settingApiUrl.value = store.vocabmin_api_url || 'https://vocabmin.ai.studio';
    settingApiKey.value = store.gemini_api_key || '';
    settingEnableBubble.checked = store.enable_selection_bubble !== false;
  }

  btnSaveSettings.addEventListener('click', async () => {
    const newUrl = settingApiUrl.value.trim().replace(/\/+$/, '') || 'https://vocabmin.ai.studio';
    const newKey = settingApiKey.value.trim();
    const newBubble = settingEnableBubble.checked;

    await chrome.storage.local.set({
      vocabmin_api_url: newUrl,
      gemini_api_key: newKey,
      enable_selection_bubble: newBubble
    });

    settingsFeedback.style.color = '#10b981';
    settingsFeedback.textContent = '✅ 設定已成功儲存！';
    setTimeout(() => {
      settingsFeedback.textContent = '';
    }, 2500);
  });

  // Test Connection
  btnTestConnection.addEventListener('click', async () => {
    const testUrl = settingApiUrl.value.trim().replace(/\/+$/, '') || 'https://vocabmin.ai.studio';
    settingsFeedback.style.color = '#64748b';
    settingsFeedback.textContent = `⏳ 正在連線至 ${testUrl}...`;

    try {
      const startTime = Date.now();
      const res = await fetch(`${testUrl}/api/ai/article-lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settingApiKey.value.trim() ? { 'x-gemini-api-key': settingApiKey.value.trim() } : {})
        },
        body: JSON.stringify({ word: 'serendipity' })
      });
      const latency = Date.now() - startTime;

      if (res.ok) {
        settingsFeedback.style.color = '#10b981';
        settingsFeedback.textContent = `✅ 連線成功！(延遲: ${latency}ms)`;
      } else {
        settingsFeedback.style.color = '#f59e0b';
        settingsFeedback.textContent = `⚠️ 伺服器回應狀態碼: ${res.status}（若離線將自動啟用本地詞典備用線路）`;
      }
    } catch (err) {
      settingsFeedback.style.color = '#ef4444';
      settingsFeedback.textContent = `❌ 無法連線 (${err.message})。離線時將自動使用本地詞典！`;
    }
  });

  // Open VocabMin App
  btnOpenVocabminApp.addEventListener('click', async () => {
    const store = await chrome.storage.local.get('vocabmin_api_url');
    const targetUrl = store.vocabmin_api_url || 'https://vocabmin.ai.studio';
    chrome.tabs.create({ url: targetUrl });
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial load
  loadSavedWords();
  loadSettings();
});
