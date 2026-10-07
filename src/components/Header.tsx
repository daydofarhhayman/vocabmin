import React from 'react';
import {
  BookOpen,
  Home,
  GraduationCap,
  Sparkles,
  List,
  Settings,
  Sun,
  Moon,
  Cloud,
  CloudCheck,
  User as UserIcon,
  LogIn,
  LogOut
} from 'lucide-react';
import { ViewTab, AppSettings } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { User } from 'firebase/auth';
import { COLOR_THEMES, HomeAccentColor } from '../utils/homeConfig';

interface HeaderProps {
  currentTab: ViewTab;
  setTab: (tab: ViewTab) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onOpenSettings: () => void;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  dueCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setTab,
  settings,
  onUpdateSettings,
  onOpenSettings,
  user,
  onLogin,
  onLogout,
  dueCount
}) => {
  const t = TRANSLATIONS[settings.lang];
  const accentKey = (settings.accentColor as HomeAccentColor) || 'indigo';
  const theme = COLOR_THEMES[accentKey] || COLOR_THEMES.indigo;
  const brandName = settings.appNickname?.trim() || 'VocabMin';

  return (
    <header className="glass-panel sticky top-0 z-40 flex-shrink-0 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => setTab('home')}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className={`w-10 h-10 bg-gradient-to-tr ${theme.primaryGradient} rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-200`}>
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-extrabold tracking-tight bg-gradient-to-r ${theme.primaryGradient} bg-clip-text text-transparent`}>
                {brandName}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block font-medium">
              {t.app_tagline}
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          <button
            onClick={() => setTab('home')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              currentTab === 'home'
                ? `bg-white dark:bg-slate-700 ${theme.textAccent} shadow-sm`
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>{t.nav_home}</span>
          </button>

          <button
            onClick={() => setTab('review')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 relative ${
              currentTab === 'review' || currentTab === 'quiz'
                ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>複習測驗</span>
            {dueCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                {dueCount > 99 ? '99+' : dueCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('reader')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              currentTab === 'reader'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform" />
            <span>文章閱讀</span>
          </button>

          <button
            onClick={() => setTab('list')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              currentTab === 'list'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>{t.nav_list}</span>
          </button>

          <button
            onClick={() => setTab('ai')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              currentTab === 'ai'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
            <span>{t.nav_ai}</span>
          </button>
        </nav>

        {/* Right Tools: Auth, Dark Mode, Settings */}
        <div className="flex items-center gap-2">
          {/* User Status / Login */}
          {user ? (
            user.isAnonymous ? (
              <div className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-800/60 text-xs">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                <span className="font-semibold text-purple-700 dark:text-purple-300">訪客體驗</span>
                <button
                  onClick={onLogout}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition ml-0.5"
                  title="登出訪客帳號"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold max-w-[90px] sm:max-w-[130px] truncate text-slate-700 dark:text-slate-200">
                  {user.displayName || user.email?.split('@')[0] || 'User'}
                </span>
                <button
                  onClick={onLogout}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  title="登出帳號"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          ) : (
            <button
              onClick={onLogin}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-xs font-bold flex items-center gap-1.5 transition"
              title="登入帳號"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">登入</span>
            </button>
          )}

          {/* Dark Mode Toggle */}
          <button
            onClick={() => onUpdateSettings({ darkMode: !settings.darkMode })}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={settings.darkMode ? '切換淺色模式' : '切換深色模式'}
            aria-label="Toggle dark mode"
          >
            {settings.darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="系統設定"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
