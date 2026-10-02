import React, { useState } from 'react';
import {
  X,
  Palette,
  RotateCcw,
  Check,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Columns2,
  Maximize2,
  GripVertical,
  Trash2,
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
  Wand2,
  Eye,
  Layers,
  SlidersHorizontal,
  Zap,
  Calendar,
  AlertCircle,
  Timer,
  Compass
} from 'lucide-react';
import {
  HomeConfig,
  HomeAccentColor,
  HomeCardStyle,
  COLOR_THEMES,
  WIDGET_METAS,
  WidgetId,
  DEFAULT_HOME_CONFIG,
  HOME_PRESETS,
  HomePreset
} from '../utils/homeConfig';

interface CustomizeHomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: HomeConfig;
  onChangeConfig: (newConfig: HomeConfig) => void;
  onResetConfig: () => void;
}

export const CustomizeHomeModal: React.FC<CustomizeHomeModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  onResetConfig
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'core' | 'review' | 'tools'>('all');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const currentTheme = COLOR_THEMES[config.accentColor] || COLOR_THEMES.indigo;

  // Active widgets on the canvas
  const activeWidgets = config.widgets.filter((w) => w.enabled);
  // Inactive widgets in the tray
  const inactiveWidgets = config.widgets.filter((w) => !w.enabled);

  // Widget Icon lookup
  const getWidgetIcon = (id: WidgetId, className = 'w-4 h-4') => {
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

  // Add a widget to the canvas
  const handleAddWidgetToCanvas = (id: WidgetId) => {
    const meta = WIDGET_METAS[id];
    const updated = config.widgets.map((w) => {
      if (w.id === id) {
        return {
          ...w,
          enabled: true,
          width: w.width || meta?.defaultWidth || 'half'
        };
      }
      return w;
    });
    onChangeConfig({ ...config, widgets: updated });
  };

  // Remove a widget from the canvas
  const handleRemoveWidget = (id: WidgetId) => {
    const updated = config.widgets.map((w) => {
      if (w.id === id) {
        return { ...w, enabled: false };
      }
      return w;
    });
    onChangeConfig({ ...config, widgets: updated });
  };

  // Toggle widget width between full and half
  const handleToggleWidth = (id: WidgetId) => {
    const updated = config.widgets.map((w) => {
      if (w.id === id) {
        return {
          ...w,
          width: (w.width === 'full' ? 'half' : 'full') as 'full' | 'half'
        };
      }
      return w;
    });
    onChangeConfig({ ...config, widgets: updated });
  };

  // Move active widget up in active sequence
  const handleMoveActiveUp = (widgetId: WidgetId) => {
    const activeIndices = config.widgets
      .map((w, idx) => (w.enabled ? idx : -1))
      .filter((idx) => idx !== -1);
    
    const currentActivePos = activeIndices.findIndex((idx) => config.widgets[idx].id === widgetId);
    if (currentActivePos <= 0) return;

    const fromIdx = activeIndices[currentActivePos];
    const toIdx = activeIndices[currentActivePos - 1];

    const newWidgets = [...config.widgets];
    const temp = newWidgets[fromIdx];
    newWidgets[fromIdx] = newWidgets[toIdx];
    newWidgets[toIdx] = temp;
    onChangeConfig({ ...config, widgets: newWidgets });
  };

  // Move active widget down in active sequence
  const handleMoveActiveDown = (widgetId: WidgetId) => {
    const activeIndices = config.widgets
      .map((w, idx) => (w.enabled ? idx : -1))
      .filter((idx) => idx !== -1);
    
    const currentActivePos = activeIndices.findIndex((idx) => config.widgets[idx].id === widgetId);
    if (currentActivePos < 0 || currentActivePos >= activeIndices.length - 1) return;

    const fromIdx = activeIndices[currentActivePos];
    const toIdx = activeIndices[currentActivePos + 1];

    const newWidgets = [...config.widgets];
    const temp = newWidgets[fromIdx];
    newWidgets[fromIdx] = newWidgets[toIdx];
    newWidgets[toIdx] = temp;
    onChangeConfig({ ...config, widgets: newWidgets });
  };

  // Drag and drop handlers for assembling
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newActive = [...activeWidgets];
    const [moved] = newActive.splice(draggedIndex, 1);
    newActive.splice(targetIndex, 0, moved);

    // Reconstruct full list preserving inactive at end
    const inactive = config.widgets.filter((w) => !w.enabled);
    onChangeConfig({ ...config, widgets: [...newActive, ...inactive] });

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Apply a preset
  const handleApplyPreset = (preset: HomePreset) => {
    onChangeConfig({
      accentColor: preset.accentColor,
      cardStyle: preset.cardStyle,
      widgets: preset.widgets
    });
  };

  // Filter inactive widgets
  const filteredInactive = inactiveWidgets.filter((w) => {
    const meta = WIDGET_METAS[w.id];
    if (!meta) return false;
    if (selectedCategory === 'all') return true;
    return meta.category === selectedCategory;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-enter"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200/90 dark:border-slate-700/80 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 sm:px-6 pt-4 pb-3.5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${currentTheme.primaryGradient} text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0`}
            >
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  主畫面自由拼裝工坊
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                  即時畫布拼裝
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                自由拖曳、拼貼小工具積木，切換單/雙欄寬，打造專屬主畫面！
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Toolbar: Theme Colors, Card Style, and Presets */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-50/90 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs flex-shrink-0">
          {/* Accent Color Swatches */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold text-[11px] shrink-0">主題色調:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(Object.keys(COLOR_THEMES) as HomeAccentColor[]).map((key) => {
                const item = COLOR_THEMES[key];
                const isSelected = config.accentColor === key;
                return (
                  <button
                    key={key}
                    onClick={() => onChangeConfig({ ...config, accentColor: key })}
                    className={`w-5 h-5 rounded-full ${item.swatch} transition-transform flex items-center justify-center text-white ${
                      isSelected
                        ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    title={item.name}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card Style Switcher */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <button
              onClick={() => onChangeConfig({ ...config, cardStyle: 'modern' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                config.cardStyle === 'modern'
                  ? 'bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              現代簡約
            </button>
            <button
              onClick={() => onChangeConfig({ ...config, cardStyle: 'glass' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                config.cardStyle === 'glass'
                  ? 'bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              磨砂毛玻璃
            </button>
            <button
              onClick={() => onChangeConfig({ ...config, cardStyle: 'vibrant' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                config.cardStyle === 'vibrant'
                  ? 'bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              質感微彩
            </button>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold text-[11px] hidden md:inline">推薦佈局:</span>
            {HOME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset)}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition shrink-0"
                title={preset.desc}
              >
                {preset.name.split(' ')[0]} {preset.name.split(' ')[1]}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Work Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6">
          {/* SECTION 1: INTERACTIVE CANVAS (主畫面即時拼裝畫布) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>主畫面拼貼畫布 (已拼入 {activeWidgets.length} 個小工具)</span>
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  可拖曳排序、切換整行/半行欄寬、點擊 ✕ 移出
                </span>
              </div>

              {activeWidgets.length > 0 && (
                <button
                  onClick={() => {
                    const allDisabled = config.widgets.map((w) => ({ ...w, enabled: false }));
                    onChangeConfig({ ...config, widgets: allDisabled });
                  }}
                  className="text-[11px] font-semibold text-slate-400 hover:text-rose-500 transition"
                >
                  清空畫布
                </button>
              )}
            </div>

            {/* Canvas Frame Container */}
            <div className="p-3.5 sm:p-5 rounded-3xl bg-slate-100/70 dark:bg-slate-900/60 border-2 border-dashed border-slate-200 dark:border-slate-700/80 min-h-[240px] transition-all">
              {activeWidgets.length === 0 ? (
                /* Empty Canvas State */
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 text-indigo-500 flex items-center justify-center mb-3 shadow-sm border border-slate-200/80 dark:border-slate-700">
                    <Plus className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                    畫布目前是空的
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mb-4">
                    請從下方的「小工具零件庫」挑選您喜歡的模組拼入主畫面，或直接套用上方推薦佈局。
                  </p>
                  <button
                    onClick={() => handleApplyPreset(HOME_PRESETS[0])}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition active:scale-95 flex items-center gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>一鍵套用經典推薦佈局</span>
                  </button>
                </div>
              ) : (
                /* Active Widgets Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {activeWidgets.map((widget, activeIndex) => {
                    const meta = WIDGET_METAS[widget.id];
                    if (!meta) return null;
                    const isFull = widget.width === 'full';
                    const isDragging = draggedIndex === activeIndex;
                    const isDragOver = dragOverIndex === activeIndex;

                    return (
                      <div
                        key={widget.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, activeIndex)}
                        onDragOver={(e) => handleDragOver(e, activeIndex)}
                        onDrop={(e) => handleDrop(e, activeIndex)}
                        className={`group relative rounded-2xl border p-3.5 sm:p-4 transition-all select-none cursor-move ${
                          isFull ? 'sm:col-span-2' : 'sm:col-span-1'
                        } ${
                          isDragging
                            ? 'opacity-40 scale-95 border-indigo-400'
                            : isDragOver
                            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30'
                            : 'bg-white dark:bg-slate-800/95 border-slate-200/90 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600/60'
                        }`}
                      >
                        {/* Top action row */}
                        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-700/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="p-1 rounded text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400">
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <div
                              className={`w-6 h-6 rounded-lg ${currentTheme.badgeBg} ${currentTheme.badgeText} flex items-center justify-center shrink-0 font-bold`}
                            >
                              {getWidgetIcon(widget.id, 'w-3.5 h-3.5')}
                            </div>
                            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                              {meta.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Width Toggle */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleWidth(widget.id);
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition ${
                                isFull
                                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                              }`}
                              title={isFull ? '目前整行 (100%)，點擊切換為半行 (50%)' : '目前半行 (50%)，點擊切換為整行 (100%)'}
                            >
                              {isFull ? (
                                <>
                                  <Maximize2 className="w-3 h-3" />
                                  <span>整行 100%</span>
                                </>
                              ) : (
                                <>
                                  <Columns2 className="w-3 h-3" />
                                  <span>半行 50%</span>
                                </>
                              )}
                            </button>

                            {/* Position Up / Down */}
                            <button
                              type="button"
                              disabled={activeIndex === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveActiveUp(widget.id);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                              title="上移順序"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={activeIndex === activeWidgets.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveActiveDown(widget.id);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                              title="下移順序"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            {/* Remove button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveWidget(widget.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition ml-0.5"
                              title="移出畫布（收回下方小工具庫）"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Widget mini preview body */}
                        <div className="flex items-center justify-between text-xs">
                          <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-1 pr-2">
                            {meta.desc}
                          </p>
                          <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                            順位 #{activeIndex + 1}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: WIDGET DOCK / WAREHOUSE (下方「小工具待選零件庫」) */}
          <div className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-500" />
                  <span>小工具待選零件庫 (點擊「+ 拼入主畫面」加入畫布)</span>
                </span>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    selectedCategory === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  全部 ({inactiveWidgets.length})
                </button>
                <button
                  onClick={() => setSelectedCategory('core')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    selectedCategory === 'core'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  核心
                </button>
                <button
                  onClick={() => setSelectedCategory('review')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    selectedCategory === 'review'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  學習
                </button>
                <button
                  onClick={() => setSelectedCategory('tools')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    selectedCategory === 'tools'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  工具
                </button>
              </div>
            </div>

            {filteredInactive.length === 0 ? (
              <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
                <div className="flex items-center gap-2 font-bold">
                  <Check className="w-4 h-4" />
                  <span>太厲害了！所有提供的小工具都已拼入主畫面中。</span>
                </div>
                <span className="text-[11px] opacity-80 hidden sm:inline">
                  隨時可以在上方畫布點擊 ✕ 卸載調整。
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredInactive.map((widget) => {
                  const meta = WIDGET_METAS[widget.id];
                  if (!meta) return null;

                  return (
                    <div
                      key={widget.id}
                      className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col justify-between gap-3 shadow-xs hover:border-indigo-400 dark:hover:border-indigo-500 transition group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-950 dark:group-hover:text-indigo-400 transition-colors">
                              {getWidgetIcon(widget.id, 'w-4 h-4')}
                            </div>
                            <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                              {meta.title}
                            </h4>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                            {meta.defaultWidth === 'full' ? '整行' : '半行'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {meta.desc}
                        </p>
                      </div>

                      <button
                        onClick={() => handleAddWidgetToCanvas(widget.id)}
                        className={`w-full py-2 rounded-xl text-xs font-bold ${currentTheme.btnClass} transition active:scale-95 flex items-center justify-center gap-1.5 shadow-xs`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ 拼入主畫面</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50/90 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            onClick={onResetConfig}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1.5 active:scale-95"
            title="還原為系統初始預設配置"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>恢復預設配置</span>
          </button>

          <button
            onClick={onClose}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs ${currentTheme.btnClass} shadow-md transition active:scale-95 flex items-center gap-1.5`}
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>儲存並套用主畫面</span>
          </button>
        </div>
      </div>
    </div>
  );
};
