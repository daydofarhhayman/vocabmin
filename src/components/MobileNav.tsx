import React from 'react';
import { Home, GraduationCap, BookOpen, List, Sparkles } from 'lucide-react';
import { ViewTab } from '../types';

interface MobileNavProps {
  currentTab: ViewTab;
  setTab: (tab: ViewTab) => void;
  dueCount: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentTab, setTab, dueCount }) => {
  const tabs = [
    { id: 'home' as ViewTab, label: '首頁', icon: Home },
    { id: 'reader' as ViewTab, label: '文章閱讀', icon: BookOpen },
    { id: 'review' as ViewTab, label: '複習測驗', icon: GraduationCap, badge: dueCount },
    { id: 'ai' as ViewTab, label: 'AI 助手', icon: Sparkles },
    { id: 'list' as ViewTab, label: '單字庫', icon: List }
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 px-2 py-1.5 flex items-center justify-around shadow-lg">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          currentTab === tab.id ||
          (tab.id === 'review' && currentTab === 'quiz');

        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
              isActive
                ? 'text-indigo-600 dark:text-indigo-400 font-bold scale-105'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {tab.badge && tab.badge > 0 ? (
                <span className="absolute -top-1 -right-2 px-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              ) : null}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
