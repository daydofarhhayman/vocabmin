import React, { useState } from 'react';
import {
  X,
  Sliders,
  CloudCheck,
  LogIn,
  LogOut,
  Info,
  ChevronDown,
  ChevronUp,
  History,
  BookOpen,
  Palette,
  Check,
  Layout,
  Sparkles
} from 'lucide-react';
import { AppSettings } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { User } from 'firebase/auth';
import { CHANGELOG, APP_VERSION } from '../data/changelog';
import { COLOR_THEMES, HomeAccentColor } from '../utils/homeConfig';

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
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            title="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Categorized Settings */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
          {/* ── 1. 雲端同步與帳號 (Cloud & Account) ── */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
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
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 transition flex items-center gap-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>登出</span>
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
            {/* Custom Gemini API Key */}
            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Google Gemini API Key（選填）</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  {settings.geminiApiKey ? '✅ 已配置專屬金鑰' : '未配置（自動使用內建雙語詞典與伺服器通道）'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                若您擁有個人 Google AI Studio API Key，可在此貼上以享最高優先級與專屬配額。若未提供，系統亦會自動透過權威雙語詞典與伺服器通道提供繁中與英英釋義。
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => onUpdateSettings({ geminiApiKey: e.target.value.trim() })}
                  placeholder="輸入您的 Gemini API Key (AIzaSy...)"
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {settings.geminiApiKey && (
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ geminiApiKey: '' })}
                    className="px-2.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-300 transition"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── 2. 閱讀與字典設定 (Reading & Dictionary) ── */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>閱讀與字典設定</span>
            </h4>

            {/* Article Reader AI Lookup Mode */}
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
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  手動查詢
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ autoAILookup: true })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    settings.autoAILookup
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  自動查詢
                </button>
              </div>
            </div>

            {/* Cambridge Dictionary Language */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  劍橋字典語言版本
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {(settings.cambridgeLang ?? 'en') === 'zh-tw' ? '開啟英漢雙語繁中頁面' : '開啟英英完整頁面'}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ cambridgeLang: 'en' })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    (settings.cambridgeLang ?? 'en') === 'en'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  英文版
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ cambridgeLang: 'zh-tw' })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    settings.cambridgeLang === 'zh-tw'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  英漢雙語
                </button>
              </div>
            </div>
          </div>

          {/* ── 3. 複習與測驗設定 (Review & Quiz) ── */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-500" />
              <span>{t.sec_review}</span>
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

          {/* ── 4. 介面與外觀個性化 (Appearance & Personalization) ── */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-indigo-500" />
              <span>介面與外觀個性化</span>
            </h4>

            {/* Accent Theme Colors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  主題色彩風格
                </span>
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {COLOR_THEMES[(settings.accentColor as HomeAccentColor) || 'indigo']?.name || '經典靛藍'}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-2 pt-1">
                {(Object.keys(COLOR_THEMES) as HomeAccentColor[]).map((cKey) => {
                  const item = COLOR_THEMES[cKey];
                  const isSelected = ((settings.accentColor as HomeAccentColor) || 'indigo') === cKey;
                  return (
                    <button
                      key={cKey}
                      type="button"
                      onClick={() => onUpdateSettings({ accentColor: cKey as any })}
                      className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition ${
                        isSelected
                          ? 'bg-white dark:bg-slate-800 shadow-sm ring-2 ring-indigo-500'
                          : 'hover:bg-white/60 dark:hover:bg-slate-800/60'
                      }`}
                      title={item.name}
                    >
                      <div
                        className={`w-7 h-7 rounded-full ${item.swatch} flex items-center justify-center shadow-xs transition-transform group-hover:scale-110`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate w-full text-center">
                        {item.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom App / Learning Space Name */}
            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                    學習空間自訂名稱
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    顯示於左上角 Logo 與專屬學習空間
                  </span>
                </div>
                {settings.appNickname && settings.appNickname !== 'VocabMin' && (
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ appNickname: 'VocabMin' })}
                    className="text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold"
                  >
                    恢復預設
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={18}
                  value={settings.appNickname ?? 'VocabMin'}
                  onChange={(e) => onUpdateSettings({ appNickname: e.target.value })}
                  placeholder="輸入您的專屬 App 空間名稱..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Font Scale */}
            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  閱讀字體大小
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  調節單字與閱讀文章字體舒適度
                </span>
              </div>
              <div className="flex gap-1.5">
                {[
                  { key: 'normal', label: '標準' },
                  { key: 'medium', label: '舒適' },
                  { key: 'large', label: '放大' }
                ].map((sizeOpt) => {
                  const isCur = (settings.fontSize || 'normal') === sizeOpt.key;
                  return (
                    <button
                      key={sizeOpt.key}
                      type="button"
                      onClick={() => onUpdateSettings({ fontSize: sizeOpt.key as any })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        isCur
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      {sizeOpt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card Texture Style */}
            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  卡片視覺風格
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {settings.themeStyle === 'simple' ? '極簡純色俐落無光暈' : '現代毛玻璃微光半透明'}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ themeStyle: 'glass' })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    settings.themeStyle !== 'simple'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  微光玻璃
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ themeStyle: 'simple' })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    settings.themeStyle === 'simple'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  極簡純色
                </button>
              </div>
            </div>

            {/* Dark Mode */}
            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  {t.opt_dark_mode}
                </span>
                <span className="text-xs text-slate-400">切換深色主題護眼模式</span>
              </div>
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={(e) => onUpdateSettings({ darkMode: e.target.checked })}
                className="w-5 h-5 accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Language */}
            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
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
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  繁體中文
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ lang: 'en' })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    settings.lang === 'en'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Customize Home Layout Shortcut Button */}
            {onOpenCustomizeHome && (
              <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCustomizeHome();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-indigo-500" />
                    <span>首頁小工具桌面自由排版模式</span>
                  </span>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                    進入拖曳編輯 →
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* ── 5. 關於與更新日誌 (About & Changelog) ── */}
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
        <Info className="w-3.5 h-3.5 text-indigo-500" />
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
