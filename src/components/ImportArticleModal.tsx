import React, { useState } from 'react';
import {
  Globe,
  FileText,
  Sparkles,
  X,
  Languages,
  GraduationCap,
  Layers,
  ArrowRight,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { CEFRLevel, ArticleCategory } from '../types';

interface ImportArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    mode: 'url' | 'text';
    url?: string;
    topic?: string;
    text?: string;
    level: CEFRLevel;
    category: ArticleCategory;
  }) => void;
  isLoading?: boolean;
}

export const ImportArticleModal: React.FC<ImportArticleModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading
}) => {
  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [level, setLevel] = useState<CEFRLevel>('B2');
  const [category, setCategory] = useState<ArticleCategory>('News');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'url' && !url.trim() && !topic.trim()) return;
    if (mode === 'text' && !text.trim()) return;

    onSubmit({
      mode,
      url: url.trim() || undefined,
      topic: topic.trim() || undefined,
      text: text.trim() || undefined,
      level,
      category
    });
  };

  const sampleLinks = [
    { label: 'BBC 科技新聞', url: 'https://www.bbc.com/news/technology' },
    { label: 'NASA 航太探索', topic: 'NASA James Webb Space Telescope deep universe discoveries' },
    { label: '經濟學人綠色能源', topic: 'Global Renewable Energy and Next-Gen Battery Technologies' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-enter">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold">外部網路文章匯入與 AI 智慧解析</h2>
              <p className="text-xs text-indigo-100 opacity-90">
                自動抓取內容、建立繁中段落對照、文法深度分析與重點生詞
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
                mode === 'url'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>外部網址或主題抓取</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('text')}
              className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
                mode === 'text'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>貼上自訂英文長文</span>
            </button>
          </div>

          {/* Mode: URL or Topic */}
          {mode === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  外部網頁 URL 網址（支援 BBC、CNN、維基百科、專欄文章等）:
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/article/english-news..."
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="text-center text-[11px] font-bold text-slate-400">
                — 或輸入想讓 AI 從外部網路檢索的主題 —
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  主題關鍵字或新聞事件:
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例如：NASA James Webb Space Discovery, Global Economy Trends..."
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Sample Quick Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] font-bold text-slate-400">推薦主題範例：</span>
                {sampleLinks.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (s.url) setUrl(s.url);
                      if (s.topic) setTopic(s.topic);
                    }}
                    className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition border border-slate-200/60 dark:border-slate-700"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode: Paste Text */}
          {mode === 'text' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                貼上完整英文文章、新聞、社論或論文摘要:
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="在此貼上英文文章正文（AI 將自動逐段翻譯成繁體中文、進行深度文法剖析並提取重點生詞）..."
                className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-serif"
              />
            </div>
          )}

          {/* Parameters: Level & Category */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                目標難度級別 (CEFR):
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CEFRLevel)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
              >
                <option value="A2">A2 (初級英語)</option>
                <option value="B1">B1 (中級生活)</option>
                <option value="B2">B2 (中高階閱讀 - 推薦)</option>
                <option value="C1">C1 (高階學術/商務)</option>
                <option value="C2">C2 (精通母語級)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                主題分類:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ArticleCategory)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
              >
                <option value="News">News (國際新聞)</option>
                <option value="Tech">Tech (科技創新)</option>
                <option value="Science">Science (自然科學)</option>
                <option value="Business">Business (國際商務)</option>
                <option value="Story">Story (文學故事)</option>
                <option value="Daily">Daily (生活日常)</option>
                <option value="Custom">Custom (自訂主題)</option>
              </select>
            </div>
          </div>

          {/* Built-in Features checklist */}
          <div className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 space-y-1.5 text-xs text-indigo-950 dark:text-indigo-200">
            <div className="font-bold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 匯入自動處理項目（已全數啟用）：</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-[11px]">
              <span className="flex items-center gap-1">✅ 繁體中文段落對照</span>
              <span className="flex items-center gap-1">✅ 核心長難句文法精析</span>
              <span className="flex items-center gap-1">✅ 高頻生詞英漢雙釋義</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              取消
            </button>

            <button
              type="submit"
              disabled={
                isLoading ||
                (mode === 'url' && !url.trim() && !topic.trim()) ||
                (mode === 'text' && !text.trim())
              }
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white text-xs font-bold shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoading ? '正在聯網抓取與解析中...' : '🚀 立即進行 AI 深度解析與建庫'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
