// ============================================================
// VocabMin 版本號與更新日誌
// 每次發布新版本時，在此檔案頂部新增一筆記錄即可。
// SettingsModal 會自動讀取並顯示最新版本號與更新日誌。
// ============================================================

export interface ChangelogEntry {
  version: string;
  date: string;       // YYYY-MM-DD
  type: 'feat' | 'fix' | 'improve' | 'breaking';
  changes: string[];  // 繁體中文說明
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.3.5',
    date: '2026-09-30',
    type: 'improve',
    changes: [
      '🧹 精簡設定頁面：移除與設定無關的橫幅廣告卡片（AI 語伴宣傳、桌面小工具宣傳）',
      '📑 重構設定分類架構：依功能清晰劃分為「雲端同步與帳號」、「閱讀與字典設定」、「複習與測驗設定」、「介面與外觀」及「關於與更新日誌」',
      '🎨 優化字典與閱讀設定排版，設定更一目了然且容易操作',
    ]
  },
  {
    version: '1.3.4',
    date: '2026-09-30',
    type: 'feat',
    changes: [
      '✨ 文章閱讀：點擊單字不再自動耗用 AI 額度，改為顯示「點擊使用 AI 查詢」按鈕，由使用者手動觸發',
      '✨ 設定頁新增「文章閱讀 AI 查詢模式」：可切換手動/自動查詢',
      '✨ 設定頁新增「劍橋字典語言版本」：可選擇英文版或英漢雙語版',
    ]
  },
  {
    version: '1.3.3',
    date: '2026-09-30',
    type: 'fix',
    changes: [
      '🐛 修復外部網址文章匯入不完整問題（段落上限 16→60，內容截斷 4000→12000 字元）',
      '🐛 修復 AI 助手生成文章後未顯示「收錄文章」按鈕的問題，新增文章意圖補救機制',
    ]
  },
  {
    version: '1.3.2',
    date: '2026-09-30',
    type: 'fix',
    changes: [
      '🐛 修復 AI 確認視窗出現不穩定問題：將「確認」偵測從廣泛字串比對改為精確白名單',
      '✏️ 修正確認卡片按鈕文字，移除誤導性的「立即執行」字樣',
    ]
  },
  {
    version: '1.3.1',
    date: '2026-09-30',
    type: 'feat',
    changes: [
      '✨ 設定頁新增「關於 VocabMin」區塊，顯示版本號與 GitHub 連結',
      '✨ 新增集中管理的更新日誌系統（本頁）',
    ]
  },
  {
    version: '1.3.0',
    date: '2026-09-29',
    type: 'improve',
    changes: [
      '🚀 全面重構 AI 意圖理解系統，解決 AI 經常聽不懂指令的問題',
      '🚀 前端 userPrompt 改為只傳純文字，場景資訊獨立傳送，避免污染 AI 判斷',
      '🚀 後端新增統一 generateWithModelFallback()，模型順序：Flash → Flash Lite → 2.5 Flash',
      '🚀 移除危險的 setTimeout 自動觸發執行，所有危險操作皆需手動確認',
      '📦 新增雲端部署設定（Render / Vercel / Docker）',
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-28',
    type: 'feat',
    changes: [
      '🎉 VocabMin 初始版本發布',
      '📚 單字庫、SRS 智能複習、文章閱讀器',
      '🤖 AI 多場景語伴（單字庫 / 文章閱讀 / 複習測驗 / 寫作診斷）',
      '☁️ Firebase 雲端同步',
    ]
  }
];

// 當前版本號（永遠取第一筆）
export const APP_VERSION = CHANGELOG[0].version;
