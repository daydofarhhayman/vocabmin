import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  Volume2,
  ChevronRight,
  Clock,
  Sparkles,
  Tag,
  FolderPlus,
  CheckSquare,
  Square,
  Check,
  X
} from 'lucide-react';
import { Word, WordGroup, AppSettings, POS } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { tts } from '../services/tts';
import { getAllWordCategories } from '../services/storage';
import { WordDetailModal } from './WordDetailModal';
import { CategoryManagerModal } from './CategoryManagerModal';

interface WordListViewProps {
  words: Word[];
  settings: AppSettings;
  onOpenAdd: (initialTerm?: string) => void;
  onEditWord: (word: Word) => void;
  onDeleteGroup: (term: string) => void;
  onDeleteSingleWord?: (wordId: string, term: string, defSnippet?: string) => void;
  onAddWords?: (newWords: Partial<Word>[]) => void;
  onUpdateWordGroup?: (oldTerm: string, updatedList: Partial<Word>[]) => void;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onOpenCambridge: (word: string) => void;
  onUpdateTermCategory?: (term: string, newCategory: string) => void;
  onBatchUpdateTermsCategory?: (terms: string[], newCategory: string) => void;
  onAddCategory?: (categoryName: string) => void;
  onRenameCategory?: (oldName: string, newName: string) => void;
  onDeleteCategory?: (categoryName: string) => void;
}

export const WordListView: React.FC<WordListViewProps> = ({
  words,
  settings,
  onOpenAdd,
  onEditWord,
  onDeleteGroup,
  onDeleteSingleWord,
  onAddWords,
  onUpdateWordGroup,
  onUpdateSettings,
  onOpenCambridge,
  onUpdateTermCategory,
  onBatchUpdateTermsCategory,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory
}) => {
  const t = TRANSLATIONS[settings.lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'time' | 'alpha' | 'level' | 'due'>('time');
  const [pageSize, setPageSize] = useState<number>(48);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Category Manager Modal state
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  // Multi-select batch mode
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());

  // Selected word group for detailed modal
  const [selectedGroup, setSelectedGroup] = useState<WordGroup | null>(null);

  // Categories list
  const categoriesList = useMemo(() => {
    return getAllWordCategories(words, settings);
  }, [words, settings]);

  // Group multiple definitions of same term
  const groupedWords = useMemo(() => {
    const map: Record<string, Word[]> = {};
    words.forEach((w) => {
      const key = w.term.trim().toLowerCase();
      if (!map[key]) map[key] = [];
      map[key].push(w);
    });

    const groups: WordGroup[] = Object.values(map).map((entries) => {
      const minLevel = Math.min(...entries.map((e) => e.level || 0));
      const minNextReview = Math.min(...entries.map((e) => e.nextReview || Date.now()));
      const maxLastReview = Math.max(...entries.map((e) => e.lastReview || 0));
      const avgInterval = Math.round(
        entries.reduce((acc, curr) => acc + (curr.interval || 1), 0) / entries.length
      );
      // Dominant category of the entries
      const category = entries.find((e) => e.category && e.category.trim())?.category;

      return {
        term: entries[0].term,
        entries,
        minLevel,
        interval: avgInterval,
        nextReview: minNextReview,
        lastReview: maxLastReview,
        category
      };
    });

    return groups;
  }, [words]);

  // Calculate counts for categories based on word groups
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncategorized = 0;
    groupedWords.forEach((g) => {
      if (!g.category || g.category === '未分類') {
        uncategorized++;
      } else {
        counts[g.category] = (counts[g.category] || 0) + 1;
      }
    });
    return { counts, uncategorized, total: groupedWords.length };
  }, [groupedWords]);

  // Filter & Search
  const filteredGroups = useMemo(() => {
    let result = groupedWords;

    // Search term (searches term, Chinese def, English def, and examples)
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (g) =>
          g.term.toLowerCase().includes(q) ||
          g.entries.some(
            (e) =>
              e.def.toLowerCase().includes(q) ||
              (e.defEn && e.defEn.toLowerCase().includes(q)) ||
              (e.ex && e.ex.toLowerCase().includes(q))
          )
      );
    }

    // POS filter
    if (posFilter !== 'ALL') {
      result = result.filter((g) => g.entries.some((e) => e.pos === posFilter));
    }

    // Level filter (matches if any definition in the word group is at this level)
    if (levelFilter !== 'ALL') {
      const lvl = parseInt(levelFilter);
      result = result.filter((g) => g.entries.some((e) => (e.level || 0) === lvl));
    }

    // Category filter
    if (categoryFilter !== 'ALL') {
      if (categoryFilter === 'UNCATEGORIZED') {
        result = result.filter((g) => !g.category || g.category === '未分類');
      } else {
        result = result.filter((g) => g.category === categoryFilter);
      }
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === 'alpha') {
        return a.term.localeCompare(b.term);
      } else if (sortBy === 'level') {
        return b.minLevel - a.minLevel;
      } else if (sortBy === 'due') {
        return a.nextReview - b.nextReview;
      } else {
        // time (newest first)
        const timeA = Math.max(...a.entries.map((e) => e.timestamp || 0));
        const timeB = Math.max(...b.entries.map((e) => e.timestamp || 0));
        return timeB - timeA;
      }
    });

    return result;
  }, [groupedWords, searchTerm, posFilter, levelFilter, categoryFilter, sortBy]);

  // Keep selectedGroup in sync if groupedWords changes
  const currentSelectedGroup = useMemo(() => {
    if (!selectedGroup) return null;
    const clean = selectedGroup.term.trim().toLowerCase();
    return groupedWords.find((g) => g.term.trim().toLowerCase() === clean) || null;
  }, [selectedGroup, groupedWords]);

  const selectedIndex = useMemo(() => {
    if (!currentSelectedGroup) return -1;
    return filteredGroups.findIndex(
      (g) => g.term.toLowerCase() === currentSelectedGroup.term.toLowerCase()
    );
  }, [currentSelectedGroup, filteredGroups]);

  // Paginated slice
  const totalPages = Math.ceil(filteredGroups.length / pageSize) || 1;
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, currentPage, pageSize]);

  const getLevelDot = (level: number) => {
    switch (level) {
      case 3:
        return 'bg-emerald-500';
      case 2:
        return 'bg-blue-500';
      case 1:
        return 'bg-amber-500';
      default:
        return 'bg-rose-400';
    }
  };

  const toggleTermSelect = (term: string) => {
    setSelectedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] animate-enter max-w-7xl mx-auto w-full px-2 sm:px-4">
      {/* Search & Action Bar */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 mb-3 border border-slate-200/80 dark:border-slate-700/80 shadow-sm flex flex-col gap-3 flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
              <span>{t.title_list}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400">
                {filteredGroups.length}
              </span>
            </h2>

            {/* Grid / List Mode */}
            <div className="flex bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl">
              <button
                onClick={() => onUpdateSettings({ listViewMode: 'grid' })}
                className={`p-1.5 rounded-lg transition ${
                  settings.listViewMode === 'grid'
                    ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
                title="網格視圖"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => onUpdateSettings({ listViewMode: 'list' })}
                className={`p-1.5 rounded-lg transition ${
                  settings.listViewMode === 'list'
                    ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
                title="列表視圖"
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Multi-Select Toggle Button */}
            <button
              onClick={() => {
                setIsMultiSelectMode((prev) => !prev);
                setSelectedTerms(new Set());
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                isMultiSelectMode
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{isMultiSelectMode ? '取消選取' : '批次選取'}</span>
            </button>
          </div>

          {/* Filter Controls & Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search box */}
            <div className="relative flex-1 sm:w-52">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t.ph_search}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-xs font-medium border-none outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* POS Filter */}
            <select
              value={posFilter}
              onChange={(e) => {
                setPosFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-xs font-bold border-none outline-none cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">全部詞性</option>
              <option value="n.">名詞 (n.)</option>
              <option value="v.">動詞 (v.)</option>
              <option value="adj.">形容詞 (adj.)</option>
              <option value="adv.">副詞 (adv.)</option>
              <option value="phr.">片語 (phr.)</option>
            </select>

            {/* Level Filter */}
            <select
              value={levelFilter}
              onChange={(e) => {
                setLevelFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-xs font-bold border-none outline-none cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">全部熟練度</option>
              <option value="3">精通 (Lvl 3)</option>
              <option value="2">熟悉 (Lvl 2)</option>
              <option value="1">學習中 (Lvl 1)</option>
              <option value="0">陌生 (Lvl 0)</option>
            </select>

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-xs font-bold border-none outline-none cursor-pointer text-slate-700 dark:text-slate-200"
            >
              <option value="time">最新加入</option>
              <option value="alpha">字母 A-Z</option>
              <option value="level">熟練度高至低</option>
              <option value="due">到期複習優先</option>
            </select>

            {/* Add Word Button */}
            <button
              onClick={() => onOpenAdd()}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/10 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t.btn_input}</span>
            </button>
          </div>
        </div>

        {/* Category Pill Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pt-2 border-t border-slate-100 dark:border-slate-700/50">
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('ALL');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
              categoryFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <span>全部單字</span>
            <span className="text-[10px] opacity-80 font-mono tabular-nums">({categoryCounts.total})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategoryFilter('UNCATEGORIZED');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
              categoryFilter === 'UNCATEGORIZED'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <span>未分類</span>
            <span className="text-[10px] opacity-80 font-mono tabular-nums">({categoryCounts.uncategorized})</span>
          </button>

          {categoriesList.map((cat) => {
            const count = categoryCounts.counts[cat] || 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>{cat}</span>
                <span className="text-[10px] opacity-80 font-mono tabular-nums">({count})</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setIsCategoryManagerOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition flex items-center gap-1 border border-indigo-200/60 dark:border-indigo-800/40 ml-1 cursor-pointer shrink-0"
            title="管理單字自訂類別"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>自訂分類</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-16">
        {!words.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 shadow-inner">
              <Plus className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1.5">
              單字庫是完全乾淨的
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-5">
              目前尚未加入任何單字。您可以隨時點擊手動新增，打造您的專屬個人單字庫。
            </p>
            <button
              onClick={() => onOpenAdd()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              + 新增第一筆單字
            </button>
          </div>
        ) : !paginatedGroups.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
              <Search className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-600 dark:text-slate-300 mb-1">
              沒有找到符合的單字
            </h4>
            <p className="text-xs text-slate-400 mb-4">請嘗試更改搜尋關鍵字或調整篩選條件。</p>
            {searchTerm.trim() && (
              <button
                onClick={() => onOpenAdd(searchTerm.trim())}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>立即查詢並收錄「{searchTerm.trim()}」至單字庫</span>
              </button>
            )}
          </div>
        ) : settings.listViewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {paginatedGroups.map((group) => {
              const now = Date.now();
              const isDue = group.nextReview <= now;
              const isSelected = selectedTerms.has(group.term);

              return (
                <div
                  key={group.term}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleTermSelect(group.term);
                    } else {
                      setSelectedGroup(group);
                    }
                  }}
                  className={`group relative bg-white dark:bg-slate-800 rounded-2xl p-4 border transition-all duration-150 flex flex-col justify-between cursor-pointer select-none text-left min-h-[110px] ${
                    isSelected
                      ? 'border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/20 dark:bg-indigo-950/20'
                      : 'border-slate-200/80 dark:border-slate-700/80 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600/60 shadow-xs'
                  }`}
                >
                  {/* Top row: Word level indicator, Category badge & Audio speaker */}
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {isMultiSelectMode ? (
                        <span className="text-indigo-600 dark:text-indigo-400">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </span>
                      ) : (
                        <span
                          className={`w-2 h-2 rounded-full ${getLevelDot(group.minLevel)}`}
                          title={`熟練度 Lvl ${group.minLevel}`}
                        />
                      )}

                      {group.entries.length > 1 && (
                        <span className="text-[10px] font-bold font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400">
                          {group.entries.length} 義
                        </span>
                      )}
                      {isDue && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"
                          title="待複習"
                        />
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        tts.speak(group.term);
                      }}
                      className="p-1 text-slate-300 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition"
                      title="發音朗讀"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Main: English Word & Category pill */}
                  <div className="my-auto py-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white capitalize tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {group.term}
                    </h3>

                    {/* Category pill if assigned */}
                    {group.category && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 inline-flex items-center gap-1 w-fit max-w-[120px] truncate mt-0.5">
                        <Tag className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{group.category}</span>
                      </span>
                    )}

                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                      <span className="font-semibold text-slate-400 dark:text-slate-500 text-[10px] mr-1">
                        [{group.entries[0]?.pos}]
                      </span>
                      {group.entries[0]?.def}
                    </p>
                  </div>

                  {/* Bottom hint */}
                  <div className="pt-2 border-t border-slate-100/80 dark:border-slate-700/50 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                    <span className="text-[10px] font-medium tracking-wide">
                      {isMultiSelectMode ? (isSelected ? '已選取' : '點擊選取') : '點擊查看詳情'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700/60">
            {paginatedGroups.map((group) => {
              const now = Date.now();
              const isDue = group.nextReview <= now;
              const isSelected = selectedTerms.has(group.term);

              return (
                <div
                  key={group.term}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleTermSelect(group.term);
                    } else {
                      setSelectedGroup(group);
                    }
                  }}
                  className={`group px-4 py-3 sm:py-3.5 flex items-center justify-between gap-3 transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/40'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isMultiSelectMode ? (
                      <span className="text-indigo-600 dark:text-indigo-400 shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                        )}
                      </span>
                    ) : (
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${getLevelDot(group.minLevel)}`}
                        title={`熟練度 Lvl ${group.minLevel}`}
                      />
                    )}

                    <span className="text-base font-bold text-slate-800 dark:text-white capitalize tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {group.term}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        tts.speak(group.term);
                      }}
                      className="p-1 text-slate-300 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition shrink-0"
                      title="發音朗讀"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>

                    {/* Category pill in List View */}
                    {group.category && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 inline-flex items-center gap-1 shrink-0">
                        <Tag className="w-2.5 h-2.5 shrink-0" />
                        <span>{group.category}</span>
                      </span>
                    )}

                    {/* Definition preview in List View */}
                    <div className="hidden sm:flex items-center gap-1.5 min-w-0 max-w-md truncate text-xs text-slate-500 dark:text-slate-400">
                      {group.entries.slice(0, 2).map((e, idx) => (
                        <span key={idx} className="truncate">
                          <span className="font-bold text-slate-400 dark:text-slate-500 font-mono text-[10px] mr-1">
                            [{e.pos}]
                          </span>
                          <span>{e.def}</span>
                          {idx === 0 && group.entries.length > 1 && (
                            <span className="mx-1.5 opacity-40">|</span>
                          )}
                        </span>
                      ))}
                      {group.entries.length > 2 && (
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          +{group.entries.length - 2}
                        </span>
                      )}
                    </div>

                    {group.entries.length > 1 && (
                      <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400 shrink-0">
                        {group.entries.length} 釋義
                      </span>
                    )}

                    {isDue && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40 shrink-0">
                        待複習
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors shrink-0">
                    <span className="text-[11px] font-medium hidden sm:inline">
                      {isMultiSelectMode ? (isSelected ? '已選取' : '選取') : '查看詳情'}
                    </span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6 pb-6 text-xs font-bold text-slate-500">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition"
            >
              上一頁
            </button>
            <span className="px-2">
              第 {currentPage} 頁 / 共 {totalPages} 頁
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition"
            >
              下一頁
            </button>
          </div>
        )}
      </div>

      {/* Floating Multi-Select Action Toolbar */}
      {isMultiSelectMode && selectedTerms.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex flex-wrap items-center gap-3 animate-slideUp text-xs font-bold">
          <span className="text-indigo-300">已選取 {selectedTerms.size} 個單字</span>

          <button
            onClick={() => {
              if (selectedTerms.size === filteredGroups.length) {
                setSelectedTerms(new Set());
              } else {
                setSelectedTerms(new Set(filteredGroups.map((g) => g.term)));
              }
            }}
            className="text-slate-300 hover:text-white underline cursor-pointer"
          >
            {selectedTerms.size === filteredGroups.length ? '取消全選' : '全選篩選結果'}
          </button>

          {/* Batch Categorization Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800 dark:bg-slate-700 p-1 rounded-xl">
            <Tag className="w-3.5 h-3.5 text-indigo-400 ml-1.5" />
            <select
              onChange={(e) => {
                const newCat = e.target.value;
                if (!newCat) return;
                if (onBatchUpdateTermsCategory) {
                  onBatchUpdateTermsCategory(Array.from(selectedTerms), newCat);
                }
                setSelectedTerms(new Set());
                setIsMultiSelectMode(false);
              }}
              defaultValue=""
              className="bg-transparent text-white text-xs font-bold py-1 px-2 border-none outline-none cursor-pointer"
            >
              <option value="" disabled className="text-slate-800">
                批次設定分類至 ▾
              </option>
              <option value="未分類" className="text-slate-800">
                未分類 (清除分類)
              </option>
              {categoriesList.map((c) => (
                <option key={c} value={c} className="text-slate-800">
                  {c}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setIsMultiSelectMode(false);
              setSelectedTerms(new Set());
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition"
            title="關閉批次操作"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Word Detail Modal */}
      {selectedGroup && (
        <WordDetailModal
          group={selectedGroup}
          isOpen={!!selectedGroup}
          onClose={() => setSelectedGroup(null)}
          settings={settings}
          onEditWord={onEditWord}
          onDeleteGroup={onDeleteGroup}
          onDeleteSingleWord={onDeleteSingleWord}
          onAddWords={onAddWords}
          onUpdateWordGroup={onUpdateWordGroup}
          onOpenCambridge={onOpenCambridge}
          onPrevWord={() => {
            if (selectedIndex > 0) {
              setSelectedGroup(filteredGroups[selectedIndex - 1]);
            }
          }}
          onNextWord={() => {
            if (selectedIndex >= 0 && selectedIndex < filteredGroups.length - 1) {
              setSelectedGroup(filteredGroups[selectedIndex + 1]);
            }
          }}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < filteredGroups.length - 1}
          currentIndex={selectedIndex >= 0 ? selectedIndex + 1 : undefined}
          totalCount={filteredGroups.length}
        />
      )}

      {/* Category Manager Modal */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        categories={categoriesList}
        words={words}
        onAddCategory={(cat) => onAddCategory && onAddCategory(cat)}
        onRenameCategory={(oldCat, newCat) => onRenameCategory && onRenameCategory(oldCat, newCat)}
        onDeleteCategory={(cat) => onDeleteCategory && onDeleteCategory(cat)}
      />
    </div>
  );
};
