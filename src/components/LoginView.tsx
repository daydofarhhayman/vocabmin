import React from 'react';
import {
  BookOpen,
  Sparkles,
  Zap,
  CloudCheck,
  ShieldCheck,
  Sun,
  Moon,
  ArrowRight,
  AlertCircle
} from 'lucide-react';

interface LoginViewProps {
  onGoogleLogin: () => Promise<void>;
  onAnonymousLogin: () => Promise<void>;
  isLoggingIn: boolean;
  loginError: string | null;
  onClearError: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onGoogleLogin,
  onAnonymousLogin,
  isLoggingIn,
  loginError,
  onClearError,
  isDarkMode,
  onToggleDarkMode
}) => {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300 relative overflow-hidden select-none">
      {/* Decorative Ambient Background Glows */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none opacity-50 dark:opacity-25">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-400 dark:bg-indigo-600 rounded-full blur-[140px] mix-blend-multiply filter"></div>
        <div className="absolute top-1/2 -right-32 w-96 h-96 bg-purple-400 dark:bg-purple-600 rounded-full blur-[140px] mix-blend-multiply filter"></div>
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-teal-400 dark:bg-teal-600 rounded-full blur-[140px] mix-blend-multiply filter"></div>
      </div>

      {/* Top Navbar */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            VocabMin
          </span>
        </div>

        <button
          onClick={onToggleDarkMode}
          className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition"
          title={isDarkMode ? '切換淺色模式' : '切換深色模式'}
          aria-label="Toggle dark mode"
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-slate-600" />
          )}
        </button>
      </header>

      {/* Main Hero & Auth Card */}
      <main className="w-full max-w-5xl mx-auto px-6 py-6 sm:py-12 flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16">
        {/* Left Side: Brand Value Proposition */}
        <div className="flex-1 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 text-indigo-600 dark:text-indigo-400 text-xs font-bold tracking-wide animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            <span>全新 v1.5 智慧英文伴讀架構</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight sm:leading-tight">
            讓每一次英文閱讀，
            <br />
            都化為
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-teal-500 bg-clip-text text-transparent">
              永久長期記憶
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
            結合艾賓浩斯 SRS 間隔重複演算法、Gemini 深度閱讀語境剖析與長難句語法拆解。登入即可享有專屬單字庫與即時雲端同步！
          </p>

          {/* Highlights List */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 text-left">
              <Zap className="w-5 h-5 text-amber-500 mb-1.5" />
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">SRS 間隔重複</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">抗遺忘智慧複習曲線</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 text-left">
              <Sparkles className="w-5 h-5 text-indigo-500 mb-1.5" />
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">AI 語法長難句</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">主謂賓結構深度解析</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 text-left">
              <CloudCheck className="w-5 h-5 text-teal-500 mb-1.5" />
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">跨裝置雲端同步</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">學習進度隨時無縫接軌</div>
            </div>
          </div>
        </div>

        {/* Right Side: Authentication Box */}
        <div className="w-full max-w-md">
          <div className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl p-7 sm:p-9 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xl shadow-indigo-500/10 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                歡迎使用 VocabMin
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                請選擇登入方式以載入您的個人單字庫
              </p>
            </div>

            {/* Error Message Box */}
            {loginError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed whitespace-pre-line">
                  {loginError}
                </div>
                <button
                  onClick={onClearError}
                  className="text-rose-400 hover:text-rose-600 font-bold ml-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Auth Buttons */}
            <div className="space-y-3.5">
              {/* Option 1: Google Login (Recommended) */}
              <button
                onClick={onGoogleLogin}
                disabled={isLoggingIn}
                className="w-full py-3.5 px-5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-3 group relative overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {/* Official Google G Logo */}
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>使用 Google 帳號登入 (推薦)</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 dark:border-slate-800 w-full"></div>
                <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  或快速開始
                </span>
              </div>

              {/* Option 2: Anonymous Login (Guest Trial) */}
              <button
                onClick={onAnonymousLogin}
                disabled={isLoggingIn}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4 text-indigo-200 group-hover:rotate-12 transition-transform" />
                <span>訪客體驗（免註冊匿名登入）</span>
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Note & Security Pledge */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                💡 訪客模式可直接體驗全部功能，日後隨時可於設定中一鍵升級綁定 Google 帳號保留單字。
              </p>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>採用 Google Firebase 企業級資料安全架構</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-4 text-center text-xs text-slate-400 dark:text-slate-600">
        VocabMin 智慧英文學習平台 • v1.5.0
      </footer>
    </div>
  );
};
