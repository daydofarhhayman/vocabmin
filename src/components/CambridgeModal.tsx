import React from 'react';
import { ExternalLink, X, BookOpen, Volume2 } from 'lucide-react';
import { tts } from '../services/tts';

interface CambridgeModalProps {
  word: string;
  isOpen: boolean;
  onClose: () => void;
}

export const CambridgeModal: React.FC<CambridgeModalProps> = ({ word, isOpen, onClose }) => {
  if (!isOpen || !word) return null;

  const dictionaryUrl = `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-enter">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-lg">
            <BookOpen className="w-5 h-5" />
            <span>劍橋字典查詢 (Cambridge)</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-bold text-indigo-500 tracking-wider">查詢詞彙</span>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white capitalize">{word}</h2>
            </div>
            <button
              onClick={() => tts.speak(word)}
              className="p-3 bg-white dark:bg-slate-800 rounded-full shadow-sm text-indigo-600 dark:text-indigo-400 hover:scale-110 active:scale-95 transition"
              title="英式/美式發音朗讀"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            您可在 Cambridge 劍橋權威英漢雙解字典中查看完整英英例句、同義詞、音標及發音示範。
          </p>

          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-500 break-all">
            {dictionaryUrl}
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              返回應用
            </button>
            <a
              href={dictionaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex items-center gap-2 transition active:scale-95"
            >
              <span>前往劍橋線上字典</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
