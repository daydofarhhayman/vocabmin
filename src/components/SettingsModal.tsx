import React, { useState } from 'react';
import {
  X,
  Moon,
  Sun,
  Sliders,
  Sparkles,
  CloudCheck,
  LogIn,
  LogOut,
  ArrowRight,
  Bot,
  Layout,
  Palette,
  Info,
  ChevronDown,
  ChevronUp,
  History
} from 'lucide-react';
import { AppSettings } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { User } from 'firebase/auth';
import { CHANGELOG, APP_VERSION } from '../data/changelog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  onSyncCloud: () => void;
  onOpenAI?: () => void;
  onOpenCustomizeHome?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  user,
  onLogin,
  onLogout,
  onSyncCloud,
  onOpenAI,
  onOpenCustomizeHome
}) => {
  const t = TRANSLATIONS[settings.lang];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-enter">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 dark:border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black text-xl">
            <Sliders className="w-5 h-5" />
            <span>{t.title_settings}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 pr-1">
          {/* Home Screen Widgets & Visual Assembler Callout */}
          {onOpenCustomizeHome && (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/25 backdrop-blur space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 font-bold shrink-0">
                    <Layout className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>主畫面小工具自由拼裝工坊</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-extrabold">
                        NEW
                      </span>
                    </h4>
                    <span className="text-xs text-slate-400">
                      自選 9 款實用模組與 7 款配色
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300">
                  手機桌面模式
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                如同手機桌布的小工具編輯方式，直接在主畫面上隨心拖曳拉動您想要的小工具、任意切換整行/半行欄寬與色彩風格，所見即所得！
              </p>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCustomizeHome();
                }}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white rounded-xl text-xs font-bold shadow-md transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Palette className="w-4 h-4" />
                <span>進入主畫面桌面編輯模式（直接拖曳） →</span>
              </button>
            </div>
          )}

          {/* AI Multi-Scenario Assistant Banner */}
          {onOpenAI && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-pink-500/10 border border-purple-500/20 backdrop-blur flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-500/20 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span>AI 智能多場景語伴</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 font-extrabold">
                      4大場景
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    全能問答、生詞擴充、寫作文法診斷與實戰模擬
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenAI();
                }}
                className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow transition active:scale-95 shrink-0 ml-2"
              >
                <span>前往語伴</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Cloud Sync Account */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-3 flex items-center gap-1.5">
              <CloudCheck className="w-4 h-4" />
              <span>{t.sec_cloud}</span>
            </h4>

            {user ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-white block">
                    {user.displayName || user.email}
                  </span>
                  <span className="text-xs text-slate-400">雲端即時同步已啟用</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onSyncCloud}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
                  >
                    立即同步
                  </button>
                  <button
                    onClick={onLogout}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 transition"
                  >
                    登出
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-white block">
                    訪客本機模式 (Guest)
                  </span>
                  <span className="text-xs text-slate-400">登入後可跨裝置同步單字庫與閱讀進度</span>
                </div>
                <button
                  onClick={onLogin}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Google 登入</span>
                </button>
              </div>
            )}
          </div>

          {/* Review & Quiz Settings */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              {t.sec_review}
            </h4>

            {/* Review limit */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  {t.opt_review_limit}
                </span>
                <span className="text-xs text-slate-400">{t.desc_review_limit}</span>
              </div>
              <select
                value={settings.reviewLimit}
                onChange={(e) => onUpdateSettings({ reviewLimit: parseInt(e.target.value) })}
                className="p-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold outline-none cursor-pointer"
              >
                <option value="10">10 個</option>
                <option value="20">20 個</option>
                <option value="30">30 個</option>
                <option value="50">50 個</option>
                <option value="100">100 個</option>
                <option value="9999">無限制</option>
              </select>
            </div>

            {/* Show Timer in Review */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  顯示答題即時碼錶
                </span>
                <span className="text-xs text-slate-400">
                  在複習題目右上角顯示秒數。若感到時間壓力可關閉（背後仍會默默自適應推算）。
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.showTimerInReview ?? true}
                onChange={(e) => onUpdateSettings({ showTimerInReview: e.target.checked })}
                className="w-5 h-5 accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Show Feedback in Review */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  顯示作答速度與評級判定
                </span>
                <span className="text-xs text-slate-400">
                  答題後顯示「秒殺/流暢/猶豫」及等級變化。關閉後僅顯示簡約正確標記，無評判壓力。
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.showFeedbackInReview ?? true}
                onChange={(e) => onUpdateSettings({ showFeedbackInReview: e.target.checked })}
                className="w-5 h-5 accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Built-in SRS Decay explanation */}
            <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-700/50 border border-slate-200/60 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-1 mt-2">
              <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>智能遺忘衰減機制（系統內建常駐）</span>
              </div>
              <p className="leading-relaxed text-[11px]">
                系統會自動追蹤嚴重逾期未複習的單字，並依時間差平緩調整熟練度，無需手動開關或設定。
              </p>
            </div>
          </div>

          {/* Appearance & Language */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              {t.sec_appearance}
            </h4>

            {/* Dark Mode */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {t.opt_dark_mode}
              </span>
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={(e) => onUpdateSettings({ darkMode: e.target.checked })}
                className="w-5 h-5 accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Language */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                    {t.sec_language}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {settings.lang === 'zh'
                      ? '單字庫與複習測驗主要顯示「中文解釋」'
                      : 'Vocabulary & reviews primarily display "English definitions"'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ lang: 'zh' })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      settings.lang === 'zh'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    繁體中文
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ lang: 'en' })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      settings.lang === 'en'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>
            </div>

            {/* Cambridge Dictionary Language */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                    劍橋字典語言版本
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {(settings.cambridgeLang ?? 'en') === 'zh-tw' ? '開啟英漢雙語版頁面' : '開啟英文版頁面'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ cambridgeLang: 'en' })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      (settings.cambridgeLang ?? 'en') === 'en'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    英文版
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ cambridgeLang: 'zh-tw' })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      settings.cambridgeLang === 'zh-tw'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    英漢雙語
                  </button>
                </div>
              </div>
            </div>

            {/* Article Reader AI Lookup Mode */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                    文章閱讀 AI 查詢模式
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {settings.autoAILookup ? '點擊單字立即自動查詢 AI（耗用額度）' : '點擊單字後手動按鈕查詢（節省額度）'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ autoAILookup: false })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      !settings.autoAILookup
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    手動查詢
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ autoAILookup: true })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      settings.autoAILookup
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    自動查詢
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* About / Version + Changelog */}
          <AboutSection />
        </div>
      </div>
    </div>
  );
};

// ── About + Changelog sub-component ──────────────────────────────────────────
const TYPE_META: Record<string, { label: string; color: string }> = {
  feat:     { label: '新功能',  color: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300' },
  fix:      { label: '問題修復', color: 'bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300' },
  improve:  { label: '優化改進', color: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300' },
  breaking: { label: '重大變更', color: 'bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300' },
};

const AboutSection: React.FC = () => {
  const [showChangelog, setShowChangelog] = useState(false);

  return (
    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 space-y-3">
      {/* Title row */}
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" />
        <span>關於 VocabMin</span>
      </h4>

      {/* App name + version + GitHub */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-slate-800 dark:text-white">VocabMin</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300">
              v{APP_VERSION}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">AI 驅動的英文單字學習工具</p>
        </div>
        <a
          href="https://github.com/daydofarhhayman/vocabmin"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-xl bg-slate-800 dark:bg-slate-600 hover:bg-slate-700 dark:hover:bg-slate-500 text-white text-xs font-bold transition flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span>GitHub</span>
        </a>
      </div>

      {/* Changelog toggle button */}
      <button
        type="button"
        onClick={() => setShowChangelog((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
      >
        <span className="flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-indigo-500" />
          更新日誌
        </span>
        {showChangelog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* Changelog list */}
      {showChangelog && (
        <div className="space-y-3 pt-1">
          {CHANGELOG.map((entry, idx) => {
            const meta = TYPE_META[entry.type] || TYPE_META.feat;
            return (
              <div
                key={entry.version}
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  idx === 0
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800/60'
                    : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/60'
                }`}
              >
                {/* Version header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-extrabold ${idx === 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>
                    v{entry.version}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-slate-400 text-[10px] ml-auto">{entry.date}</span>
                </div>
                {/* Changes */}
                <ul className="space-y-0.5 pl-0.5">
                  {entry.changes.map((change, cIdx) => (
                    <li key={cIdx} className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
