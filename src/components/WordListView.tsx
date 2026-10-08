import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  Volume2,
  ChevronRight,
  Clock,
  Sparkles
} from 'lucide-react';
import { Word, WordGroup, AppSettings, POS } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { tts } from '../services/tts';
import { WordDetailModal } from './WordDetailModal';

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
  onOpenCambridge
}) => {
  const t = TRANSLATIONS[settings.lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'time' | 'alpha' | 'level' | 'due'>('time');
  const [pageSize, setPageSize] = useState<number>(48);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Selected word group for detailed modal
  const [selectedGroup, setSelectedGroup] = useState<WordGroup | null>(null);

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

      return {
        term: entries[0].term,
        entries,
        minLevel,
        interval: avgInterval,
        nextReview: minNextReview,
        lastReview: maxLastReview
      };
    });

    return groups;
  }, [words]);

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
  }, [groupedWords, searchTerm, posFilter, levelFilter, sortBy]);

  // Keep selectedGroup in sync if groupedWords changes (e.g. after edit/delete/add definition)
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

  // Paginated slice to maintain high frame-rate and memory efficiency
  const totalPages = Math.ceil(filteredGroups.length / pageSize) || 1;
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, currentPage, pageSize]);

  const getLevelBadge = (level: number) => {
    switch (level) {
      case 3:
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/40';
      case 2:
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/40';
      case 1:
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/40';
      default:
        return 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200/70 dark:border-rose-800/40';
    }
  };

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

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] animate-enter max-w-7xl mx-auto w-full px-2 sm:px-4">
      {/* Search & Action Bar */}
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 mb-4 border border-slate-200/80 dark:border-slate-700/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 flex-shrink-0">
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
        </div>

        {/* Filter Controls & Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative flex-1 sm:w-56">
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
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/10 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t.btn_input}</span>
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
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-sm"
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
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>立即查詢並收錄「{searchTerm.trim()}」至單字庫</span>
              </button>
            )}
          </div>
        ) : settings.listViewMode === 'grid' ? (
          /* GRID VIEW - Pure English Words Only, Clean & Uncluttered */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {paginatedGroups.map((group) => {
              const now = Date.now();
              const isDue = group.nextReview <= now;

              return (
                <div
                  key={group.term}
                  onClick={() => setSelectedGroup(group)}
                  className="group relative bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700/80 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600/60 transition-all duration-150 flex flex-col justify-between cursor-pointer select-none text-left min-h-[96px]"
                >
                  {/* Top row: Word level indicator & Audio speaker */}
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${getLevelDot(group.minLevel)}`}
                        title={`熟練度 Lvl ${group.minLevel}`}
                      />
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

                  {/* Main: English Word Prominent & Definition preview */}
                  <div className="my-auto py-1">
                    <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white capitalize tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {group.term}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      <span className="font-semibold text-slate-400 dark:text-slate-500 text-[10px] mr-1">
                        [{group.entries[0]?.pos}]
                      </span>
                      {group.entries[0]?.def}
                    </p>
                  </div>

                  {/* Bottom hint: subtle click-to-view indicator */}
                  <div className="pt-2 border-t border-slate-100/80 dark:border-slate-700/50 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                    <span className="text-[10px] font-medium tracking-wide">點擊查看詳情</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW - English Word Rows with Definition Previews */
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-700/60">
            {paginatedGroups.map((group) => {
              const now = Date.now();
              const isDue = group.nextReview <= now;

              return (
                <div
                  key={group.term}
                  onClick={() => setSelectedGroup(group)}
                  className="group px-4 py-3 sm:py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${getLevelDot(group.minLevel)}`}
                      title={`熟練度 Lvl ${group.minLevel}`}
                    />

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
                    <span className="text-[11px] font-medium hidden sm:inline">查看詳情</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              上一頁
            </button>
            <span className="text-xs font-bold text-slate-500 font-mono">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              下一頁
            </button>
          </div>
        )}
      </div>

      {/* Word Detail Modal */}
      <WordDetailModal
        isOpen={!!currentSelectedGroup}
        group={currentSelectedGroup}
        onClose={() => setSelectedGroup(null)}
        settings={settings}
        onEditWord={(w) => {
          setSelectedGroup(null);
          onEditWord(w);
        }}
        onDeleteGroup={(term) => {
          setSelectedGroup(null);
          onDeleteGroup(term);
        }}
        onDeleteSingleWord={onDeleteSingleWord}
        onAddWords={onAddWords}
        onUpdateWordGroup={onUpdateWordGroup}
        onOpenCambridge={(term) => {
          onOpenCambridge(term);
        }}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex >= 0 && selectedIndex < filteredGroups.length - 1}
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
        currentIndex={selectedIndex >= 0 ? selectedIndex : undefined}
        totalCount={filteredGroups.length}
      />
    </div>
  );
};
