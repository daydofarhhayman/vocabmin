/**
 * VocabMin Companion - Content Script (Manifest V3)
 * Provides floating word lookup trigger, AI grammar analysis modal, and vocabulary saving.
 */

(function () {
  // Prevent duplicate injection
  if (window.__vocabmin_companion_injected) return;
  window.__vocabmin_companion_injected = true;

  let shadowRoot = null;
  let containerHost = null;
  let activeBadge = null;
  let activeCard = null;
  let currentSelectionData = null;
  let currentWordResult = null;
  let currentSentenceResult = null;
  let activeTabName = 'definition'; // 'definition' | 'grammar'

  // Initialize Shadow DOM Container
  function ensureShadowDOM() {
    if (shadowRoot) return shadowRoot;

    containerHost = document.createElement('div');
    containerHost.id = 'vocabmin-companion-root';
    containerHost.style.position = 'absolute';
    containerHost.style.top = '0';
    containerHost.style.left = '0';
    containerHost.style.width = '100%';
    containerHost.style.height = '100%';
    containerHost.style.pointerEvents = 'none';
    containerHost.style.zIndex = '2147483647';

    // Inject styles into shadow DOM
    shadowRoot = containerHost.attachShadow({ mode: 'open' });

    // Link stylesheet
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('content.css');
    shadowRoot.appendChild(styleLink);

    document.documentElement.appendChild(containerHost);
    return shadowRoot;
  }

  // Remove existing badge
  function removeBadge() {
    if (activeBadge) {
      activeBadge.remove();
      activeBadge = null;
    }
  }

  // Remove existing card
  function removeCard() {
    if (activeCard) {
      activeCard.remove();
      activeCard = null;
      currentWordResult = null;
      currentSentenceResult = null;
    }
  }

  // Extract sentence context around selection
  function getSurroundingSentence(selection) {
    if (!selection || !selection.anchorNode) return '';
    try {
      const text = selection.anchorNode.textContent || '';
      const selected = selection.toString();
      const idx = text.indexOf(selected);
      if (idx === -1) return selected;

      // Scan left for sentence start
      let start = idx;
      while (start > 0 && !/[.!?\n]/.test(text[start - 1])) {
        start--;
      }

      // Scan right for sentence end
      let end = idx + selected.length;
      while (end < text.length && !/[.!?\n]/.test(text[end])) {
        end++;
      }
      if (end < text.length && /[.!?]/.test(text[end])) {
        end++;
      }

      const sentence = text.slice(start, end).trim();
      return sentence.length > 5 ? sentence : selected;
    } catch {
      return selection.toString().trim();
    }
  }

  // Show floating badge near selection
  function showBadge(x, y, text, sentence) {
    removeBadge();
    const root = ensureShadowDOM();

    currentSelectionData = { text, sentence, x, y };

    const isLongPhrase = text.trim().split(/\s+/).length >= 4;

    const badge = document.createElement('div');
    badge.className = 'vbm-trigger-badge';
    badge.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
      <span>${isLongPhrase ? 'AI 句型解析' : '查單字'}</span>
    `;

    // Position badge
    badge.style.left = `${Math.max(10, x)}px`;
    badge.style.top = `${Math.max(10, y - 36)}px`;

    badge.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      removeBadge();
      openModalCard(text, sentence, x, y, isLongPhrase ? 'grammar' : 'definition');
    });

    root.appendChild(badge);
    activeBadge = badge;
  }

  // Open modal card and fetch details
  function openModalCard(text, sentence, x, y, initialTab = 'definition') {
    removeBadge();
    removeCard();
    const root = ensureShadowDOM();

    activeTabName = initialTab;

    const card = document.createElement('div');
    card.className = 'vbm-card-wrapper';

    // Best position on screen
    const posX = Math.min(window.innerWidth - 410, Math.max(16, x - 100));
    const posY = Math.min(window.innerHeight - 450, Math.max(20, y + 20));

    card.style.left = `${posX}px`;
    card.style.top = `${posY}px`;

    // Render skeleton
    renderCardContent(card, {
      term: text,
      isLoading: true,
      sentence
    });

    // Make Card Draggable by Header
    makeDraggable(card);

    root.appendChild(card);
    activeCard = card;

    // Fetch details
    fetchWordAndSentenceData(text, sentence, card);
  }

  // Fetch word info + sentence analysis
  async function fetchWordAndSentenceData(text, sentence, card) {
    // 1. Fetch Word Lookup
    chrome.runtime.sendMessage(
      {
        action: 'LOOKUP_WORD',
        payload: { word: text, sentence }
      },
      (res) => {
        if (chrome.runtime.lastError || res?.error) {
          console.warn('Word lookup error:', chrome.runtime.lastError || res?.error);
        } else {
          currentWordResult = res;
          renderCardContent(card, {
            ...res,
            isLoading: false,
            sentence
          });
        }
      }
    );

    // 2. Fetch Sentence Analysis in background if multi-word or sentence
    if (sentence && sentence.length > 8) {
      chrome.runtime.sendMessage(
        {
          action: 'ANALYZE_SENTENCE',
          payload: { sentence }
        },
        (sRes) => {
          if (!chrome.runtime.lastError && !sRes?.error) {
            currentSentenceResult = sRes;
            if (activeTabName === 'grammar') {
              renderCardContent(card, {
                ...(currentWordResult || { term: text }),
                isLoading: false,
                sentence
              });
            }
          }
        }
      );
    }
  }

  // Pronounce word using Web Speech API
  function playAudio(word) {
    if (!word || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  // Render modal card content
  function renderCardContent(card, data) {
    const term = data.term || currentSelectionData?.text || '';
    const pos = data.pos || 'n.';
    const def = data.def || '';
    const defEn = data.defEn || '';
    const phonetic = data.phonetic || '';
    const ex = data.ex || '';
    const exZh = data.exZh || '';
    const sentence = data.sentence || currentSelectionData?.sentence || '';
    const isLoading = data.isLoading;
    const status = data.status || 'valid';
    const baseForm = data.baseForm || '';
    const inflectionType = data.inflectionType || '單字變形';
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    const meanings = Array.isArray(data.meanings) && data.meanings.length > 0
      ? data.meanings
      : (def ? [{ pos, def, defEn, ex, exZh }] : []);
    const source = data.source || 'cambridge';
    const sourceLabel =
      data.sourceLabel ||
      (source === 'cambridge'
        ? '劍橋英漢辭典 (Cambridge Dictionary)'
        : source === 'ai'
        ? '劍橋未收錄 · 由 Gemini AI 智能生成'
        : '雙語辭典備援');

    const cambridgeUrl = `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(term.toLowerCase())}`;

    const sourceBadgeStyle =
      source === 'cambridge'
        ? 'background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;'
        : source === 'ai'
        ? 'background:#f5f3ff; color:#6d28d9; border:1px solid #ddd6fe;'
        : 'background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;';
    const sourceIcon = source === 'cambridge' ? '🏛️' : source === 'ai' ? '✨' : '📖';

    card.innerHTML = `
      <div class="vbm-header" id="vbm-drag-handle">
        <div class="vbm-header-left">
          <span class="vbm-term-title" title="${escapeHtml(term)}">${escapeHtml(term)}</span>
          ${pos && status !== 'typo' && status !== 'invalid' ? `<span class="vbm-pos-badge">${escapeHtml(pos)}</span>` : ''}
        </div>
        <div class="vbm-header-actions">
          <button class="vbm-icon-btn" id="vbm-audio-header" title="發音朗讀">
            <svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </button>
          <a class="vbm-icon-btn" href="${cambridgeUrl}" target="_blank" rel="noopener noreferrer" title="在劍橋字典中查看">
            <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <button class="vbm-icon-btn" id="vbm-close-btn" title="關閉 (Esc)">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="vbm-tabs">
        <button class="vbm-tab ${activeTabName === 'definition' ? 'active' : ''}" data-tab="definition">📖 單字釋義</button>
        <button class="vbm-tab ${activeTabName === 'grammar' ? 'active' : ''}" data-tab="grammar">🧠 AI 句型解析</button>
      </div>

      <div class="vbm-body">
        ${isLoading ? `
          <div class="vbm-loading">
            <div class="vbm-spinner"></div>
            <span>優先檢索劍橋英漢辭典 · 若無收錄則由 AI 生成...</span>
          </div>
        ` : activeTabName === 'definition' ? `
          <!-- Source Badge -->
          <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 10px; border-radius:8px; font-size:11.5px; font-weight:600; ${sourceBadgeStyle}">
            <span>${sourceIcon} ${escapeHtml(sourceLabel)}</span>
            ${meanings.length > 1 ? `<span style="font-size:10.5px; opacity:0.85;">共 ${meanings.length} 項釋義</span>` : ''}
          </div>

          ${status === 'inflected' && baseForm && baseForm.toLowerCase() !== term.toLowerCase() ? `
            <div style="display:flex; align-items:center; justify-content:space-between; background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; padding:6px 10px; border-radius:8px; font-size:12px;">
              <span>🔄 此字為 <b>${escapeHtml(baseForm)}</b> 的${escapeHtml(inflectionType)}</span>
              <button id="vbm-switch-base-btn" data-base="${escapeHtml(baseForm)}" style="background:#2563eb; color:#fff; border:none; border-radius:6px; padding:2px 8px; font-size:11px; font-weight:600; cursor:pointer;">查原型</button>
            </div>
          ` : ''}

          ${status === 'typo' && suggestions.length > 0 ? `
            <div style="background:#fffbeb; border:1px solid #fde68a; padding:10px 12px; border-radius:10px;">
              <div style="font-size:12px; font-weight:700; color:#b45309; margin-bottom:6px;">💡 劍橋與字庫查無「${escapeHtml(term)}」，您是不是要找：</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${suggestions.map((sug) => `
                  <button class="vbm-typo-sug-btn" data-sug="${escapeHtml(sug)}" style="background:#ffffff; border:1px solid #f59e0b; color:#b45309; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:600; cursor:pointer;">
                    ${escapeHtml(sug)}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : status === 'invalid' ? `
            <div style="background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:12px; border-radius:10px; font-size:12.5px;">
              ⚠️ ${escapeHtml(data.message || `查無「${term}」之有效英文單字，請檢查拼寫。`)}
            </div>
          ` : `
            ${phonetic ? `
              <div class="vbm-phonetic-row">
                <span class="vbm-phonetic">${escapeHtml(phonetic)}</span>
                <button class="vbm-audio-btn" id="vbm-body-pronounce">🔊 美式發音</button>
              </div>
            ` : ''}

            ${meanings.length > 1 ? `
              <div class="vbm-section">
                <div class="vbm-label">勾選要收錄的釋義（可複選）</div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${meanings.map((m, idx) => `
                    <label style="display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer;">
                      <input type="checkbox" class="vbm-meaning-checkbox" data-idx="${idx}" ${idx === 0 ? 'checked' : ''} style="margin-top:3px; accent-color:#4f46e5; cursor:pointer;" />
                      <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                          <span class="vbm-pos-badge">${escapeHtml(m.pos || 'n.')}</span>
                          <span style="font-size:13.5px; font-weight:700; color:#0f172a;">${escapeHtml(m.def)}</span>
                        </div>
                        ${m.defEn ? `<div style="font-size:11.5px; color:#475569; font-style:italic;">${escapeHtml(m.defEn)}</div>` : ''}
                        ${m.ex ? `<div style="font-size:11.5px; color:#64748b; margin-top:3px; border-left:2px solid #818cf8; padding-left:6px;">${escapeHtml(m.ex)}</div>` : ''}
                      </div>
                    </label>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div class="vbm-section">
                <div class="vbm-label">繁體中文釋義</div>
                <div class="vbm-def-zh">${escapeHtml(def || '查詢中...')}</div>
              </div>

              ${defEn ? `
                <div class="vbm-section">
                  <div class="vbm-label">英英釋義</div>
                  <div class="vbm-def-en">${escapeHtml(defEn)}</div>
                </div>
              ` : ''}

              ${ex ? `
                <div class="vbm-section">
                  <div class="vbm-label">記憶例句</div>
                  <div class="vbm-box">
                    <div class="vbm-box-en">${escapeHtml(ex)}</div>
                    ${exZh ? `<div class="vbm-box-zh">${escapeHtml(exZh)}</div>` : ''}
                  </div>
                </div>
              ` : ''}
            `}

            ${sentence && sentence !== ex ? `
              <div class="vbm-section">
                <div class="vbm-label">文章上下文</div>
                <div class="vbm-box" style="border-left-color: #94a3b8; background: #f1f5f9;">
                  <div class="vbm-box-en">${escapeHtml(sentence)}</div>
                </div>
              </div>
            ` : ''}
          `}
        ` : `
          <!-- AI Grammar Breakdown Tab -->
          ${currentSentenceResult ? `
            <div class="vbm-section">
              <div class="vbm-label">整句繁中翻譯</div>
              <div class="vbm-def-zh" style="font-size: 14px;">${escapeHtml(currentSentenceResult.translation || '')}</div>
            </div>

            <div class="vbm-section">
              <div class="vbm-label">語法結構拆解</div>
              <div class="vbm-grammar-item">${escapeHtml(currentSentenceResult.grammarBreakdown || '')}</div>
            </div>

            ${currentSentenceResult.learningTip ? `
              <div class="vbm-section">
                <div class="vbm-label">學習重點提示</div>
                <div class="vbm-box" style="border-left-color: #10b981;">
                  <div>${escapeHtml(currentSentenceResult.learningTip)}</div>
                </div>
              </div>
            ` : ''}
          ` : `
            <div class="vbm-loading">
              <div class="vbm-spinner"></div>
              <span>AI 正在深入剖析句型結構與語法...</span>
            </div>
          `}
        `}
      </div>

      <div class="vbm-footer">
        <button class="vbm-save-btn" id="vbm-save-word-btn" ${status === 'typo' || status === 'invalid' ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
          <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
          <span>收錄至 VocabMin 單字庫</span>
        </button>
        <a class="vbm-cambridge-btn" href="${cambridgeUrl}" target="_blank" rel="noopener noreferrer">
          劍橋字典 ↗
        </a>
      </div>
    `;

    // Bind events
    const closeBtn = card.querySelector('#vbm-close-btn');
    if (closeBtn) closeBtn.onclick = () => removeCard();

    const audioHeader = card.querySelector('#vbm-audio-header');
    if (audioHeader) audioHeader.onclick = () => playAudio(term);

    const audioBody = card.querySelector('#vbm-body-pronounce');
    if (audioBody) audioBody.onclick = () => playAudio(term);

    // Switch to base form button
    const switchBaseBtn = card.querySelector('#vbm-switch-base-btn');
    if (switchBaseBtn) {
      switchBaseBtn.onclick = () => {
        const base = switchBaseBtn.getAttribute('data-base');
        if (base) {
          renderCardContent(card, { term: base, isLoading: true, sentence });
          fetchWordAndSentenceData(base, sentence, card);
        }
      };
    }

    // Typo suggestion buttons
    card.querySelectorAll('.vbm-typo-sug-btn').forEach((btn) => {
      btn.onclick = () => {
        const sug = btn.getAttribute('data-sug');
        if (sug) {
          renderCardContent(card, { term: sug, isLoading: true, sentence });
          fetchWordAndSentenceData(sug, sentence, card);
        }
      };
    });

    // Tab buttons
    card.querySelectorAll('.vbm-tab').forEach((tabBtn) => {
      tabBtn.onclick = () => {
        const targetTab = tabBtn.getAttribute('data-tab');
        if (targetTab !== activeTabName) {
          activeTabName = targetTab;
          renderCardContent(card, {
            ...(currentWordResult || { term, sentence }),
            isLoading: false,
            sentence
          });
        }
      };
    });

    // Save Word(s) button
    const saveBtn = card.querySelector('#vbm-save-word-btn');
    if (saveBtn && status !== 'typo' && status !== 'invalid') {
      saveBtn.onclick = () => {
        const checkboxes = card.querySelectorAll('.vbm-meaning-checkbox');
        let selectedMeanings = [];
        if (checkboxes.length > 0) {
          checkboxes.forEach((cb) => {
            if (cb.checked) {
              const idx = Number(cb.getAttribute('data-idx'));
              if (meanings[idx]) selectedMeanings.push(meanings[idx]);
            }
          });
        }
        if (selectedMeanings.length === 0) {
          selectedMeanings = meanings.length > 0
            ? [meanings[0]]
            : [{ pos, def: def || currentSelectionData?.text || '', defEn, ex, exZh }];
        }

        const wordsToSave = selectedMeanings.map((m) => ({
          term: term,
          pos: m.pos || pos || 'n.',
          def: m.def || def || currentSelectionData?.text || '',
          defEn: m.defEn || defEn || '',
          phonetic: phonetic,
          ex: m.ex || ex || '',
          exZh: m.exZh || exZh || '',
          contextSentence: sentence,
          sourceUrl: window.location.href
        }));

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span>⏳ 收錄中...</span>`;

        chrome.runtime.sendMessage({ action: 'SAVE_WORDS', words: wordsToSave }, (res) => {
          if (res?.success) {
            saveBtn.classList.add('saved');
            saveBtn.innerHTML = `
              <svg style="width:15px;height:15px;fill:currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              <span>✅ 已加入 VocabMin 單字庫 (${wordsToSave.length} 義)！</span>
            `;
          } else {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span>❌ 儲存失敗，請重試</span>`;
          }
        });
      };
    }
  }

  // Helper: Escape HTML strings
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Draggable logic for modal
  function makeDraggable(card) {
    const handle = card.querySelector('#vbm-drag-handle');
    if (!handle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handle.addEventListener('mousedown', (e) => {
      // Don't drag if clicking buttons
      if (e.target.closest('button') || e.target.closest('a')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = card.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        card.style.left = `${Math.max(10, Math.min(window.innerWidth - card.offsetWidth - 10, initialLeft + dx))}px`;
        card.style.top = `${Math.max(10, Math.min(window.innerHeight - card.offsetHeight - 10, initialTop + dy))}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // Listen for Text Selection on Page
  document.addEventListener('mouseup', (e) => {
    // If clicking inside extension shadow root, do nothing
    if (e.target.closest && e.target.closest('#vocabmin-companion-root')) return;

    // Small delay to let browser finalize selection
    setTimeout(async () => {
      const selection = window.getSelection();
      const rawText = (selection?.toString() || '').trim();

      // Validate selection
      if (!rawText || rawText.length < 2 || rawText.length > 300) {
        removeBadge();
        return;
      }

      // Check if text has English alphabets
      if (!/[a-zA-Z]/.test(rawText)) {
        removeBadge();
        return;
      }

      // Check if user disabled bubble in settings
      const settings = await chrome.storage.local.get('enable_selection_bubble');
      if (settings.enable_selection_bubble === false) return;

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect && rect.width > 0) {
          const sentence = getSurroundingSentence(selection);
          showBadge(
            rect.left + window.scrollX,
            rect.top + window.scrollY,
            rawText,
            sentence
          );
        }
      } catch {}
    }, 50);
  });

  // Close badge or card on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeBadge();
      removeCard();
    }
  });

  // Close badge on clicking elsewhere
  document.addEventListener('mousedown', (e) => {
    if (activeBadge && (!e.target.closest || !e.target.closest('#vocabmin-companion-root'))) {
      removeBadge();
    }
  });

  // Context Menu Trigger Listener (from Background Service Worker)
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'CONTEXT_MENU_TRIGGER') {
      const text = request.text;
      const initialTab = request.type === 'vocabmin_sentence' ? 'grammar' : 'definition';

      // Position in viewport center or active cursor
      const centerX = Math.max(20, Math.floor(window.innerWidth / 2) - 195);
      const centerY = Math.max(30, Math.floor(window.innerHeight / 2) - 200);

      const sentence = (request.mode === 'sentence' || text.split(/\s+/).length > 3)
        ? text
        : getSurroundingSentence(window.getSelection()) || text;

      openModalCard(text, sentence, centerX, centerY, initialTab);
      sendResponse({ success: true });
    }

    // Forward extension events to web app if on VocabMin page
    if (request.action === 'VOCABMIN_NEW_WORD_ADDED' || request.action === 'VOCABMIN_SYNC_WORDS_BULK') {
      window.postMessage({
        source: 'VOCABMIN_EXTENSION',
        action: request.action,
        payload: request.word || request.words
      }, '*');
      sendResponse({ success: true, forwarded: true });
    }
  });
})();
