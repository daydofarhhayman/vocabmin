import React, { useState } from 'react';
import {
  X,
  Plus,
  Clock,
  Search,
  Target,
  BookOpen,
  Flame,
  Dices,
  BookMarked,
  Quote,
  Layout,
  Check,
  Sparkles,
  Zap,
  Calendar,
  AlertCircle,
  Timer,
  Compass
} from 'lucide-react';
import {
  HomeConfig,
  WIDGET_METAS,
  WidgetId,
  COLOR_THEMES
} from '../utils/homeConfig';

interface WidgetGalleryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: HomeConfig;
  onAddWidget: (id: WidgetId) => void;
}

export const WidgetGalleryDrawer: React.FC<WidgetGalleryDrawerProps> = ({
  isOpen,
  onClose,
  config,
  onAddWidget
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'core' | 'review' | 'tools'>('all');

  if (!isOpen) return null;

  const currentTheme = COLOR_THEMES[config.accentColor] || COLOR_THEMES.indigo;

  // Active vs Inactive
  const activeIds = new Set(config.widgets.filter((w) => w.enabled).map((w) => w.id));
  const inactiveWidgets = config.widgets.filter((w) => !w.enabled);

  const getWidgetIcon = (id: WidgetId, className = 'w-5 h-5') => {
    switch (id) {
      case 'dueReview':
        return <Clock className={className} />;
      case 'quickSearch':
        return <Search className={className} />;
      case 'masteryStats':
        return <Target className={className} />;
      case 'studyPaths':
        return <BookOpen className={className} />;
      case 'dailyGoal':
        return <Flame className={className} />;
      case 'randomWord':
        return <Dices className={className} />;
      case 'recentWords':
        return <BookMarked className={className} />;
      case 'quoteOfTheDay':
        return <Quote className={className} />;
      case 'articleReading':
        return <BookOpen className={className} />;
      case 'quickAdd':
        return <Plus className={className} />;
      case 'speedQuiz':
        return <Zap className={className} />;
      case 'streakCalendar':
        return <Calendar className={className} />;
      case 'stumbleWords':
        return <AlertCircle className={className} />;
      case 'pomodoroTimer':
        return <Timer className={className} />;
      case 'rootOfTheDay':
        return <Compass className={className} />;
      default:
        return <Layout className={className} />;
    }
  };

  const filteredInactive = inactiveWidgets.filter((w) => {
    const meta = WIDGET_METAS[w.id];
    if (!meta) return false;
    if (selectedCategory === 'all') return true;
    return meta.category === selectedCategory;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-enter"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200/90 dark:border-slate-700/80 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-5 sm:px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-2xl bg-gradient-to-tr ${currentTheme.primaryGradient} text-white flex items-center justify-center shadow-md shadow-indigo-500/20`}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>小工具庫 (Widget Gallery)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  可添加 {inactiveWidgets.length} 個
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                點擊「+ 加入」或直接按住卡片拖曳至主畫面想要的位置，像手機桌面一樣隨心擺放！
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filter Chips */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700/60 flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedCategory === 'all'
                ? `${currentTheme.btnClass} shadow-xs`
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
            }`}
          >
            全部 ({inactiveWidgets.length})
          </button>
          <button
            onClick={() => setSelectedCategory('core')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedCategory === 'core'
                ? `${currentTheme.btnClass} shadow-xs`
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
            }`}
          >
            核心模組
          </button>
          <button
            onClick={() => setSelectedCategory('review')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedCategory === 'review'
                ? `${currentTheme.btnClass} shadow-xs`
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
            }`}
          >
            學習與進度
          </button>
          <button
            onClick={() => setSelectedCategory('tools')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedCategory === 'tools'
                ? `${currentTheme.btnClass} shadow-xs`
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
            }`}
          >
            實用工具
          </button>
        </div>

        {/* Widgets List */}
        <div className="overflow-y-auto custom-scrollbar p-5 space-y-3 flex-1">
          {filteredInactive.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500 flex items-center justify-center mb-2 shadow-xs">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                所有小工具皆已加入主畫面中！
              </h4>
              <p className="text-xs text-slate-400 max-w-xs">
                您可以在主畫面直接拖曳排序，或點擊個別小工具的 ✕ 符號將其移回此處。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredInactive.map((widget) => {
                const meta = WIDGET_METAS[widget.id];
                if (!meta) return null;

                return (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', `vocabmin_widget:${widget.id}`);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col justify-between gap-3 shadow-xs hover:border-indigo-400 dark:hover:border-indigo-500 transition group cursor-grab active:cursor-grabbing hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-xl ${currentTheme.badgeBg} ${currentTheme.badgeText} flex items-center justify-center shrink-0 font-bold`}
                          >
                            {getWidgetIcon(widget.id, 'w-4 h-4')}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                              {meta.title}
                            </h4>
                            <span className="text-[10px] font-mono text-slate-400">
                              預設: {meta.defaultWidth === 'full' ? '整行 (100%)' : '半行 (50%)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {meta.desc}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onAddWidget(widget.id);
                      }}
                      className={`w-full py-2 rounded-xl text-xs font-bold ${currentTheme.btnClass} shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ 加入主畫面</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
          <span>主畫面已包含 {activeIds.size} 個小工具</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold transition"
          >
            返回主畫面
          </button>
        </div>
      </div>
    </div>
  );
};
