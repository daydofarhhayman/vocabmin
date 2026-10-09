import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  Trash2,
  X,
  FileSpreadsheet,
  Check,
  Sparkles,
  Volume2,
  Clipboard,
  CheckSquare,
  Square,
  AlertCircle,
  Briefcase,
  GraduationCap,
  Compass,
  HeartHandshake,
  ArrowRight,
  BookOpen,
  RotateCcw,
  ListPlus
} from 'lucide-react';
import { POS, Word } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { storage } from '../services/storage';
import { normalizePos } from '../utils/pos';
import { tts } from '../services/tts';

interface AddWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWords: (words: Partial<Word>[]) => void;
  lang: 'zh' | 'en';
  existingWords?: Word[];
  initialTerm?: string;
  categories?: string[];
  onAddCategory?: (categoryName: string) => void;
}

interface DefinitionInput {
  id?: string;
  pos: POS;
  def: string;
  defEn?: string;
  ex: string;
  selected?: boolean;
}

interface ParsedWordItem {
  term: string;
  pos: POS;
  def: string;
  defEn?: string;
  ex?: string;
  selected: boolean;
  alreadyExists: boolean;
}

// Curated high-utility thematic vocabulary packs
const THEMATIC_PACKS = [
  {
    id: 'business',
    title: '商務職場精英',
    icon: Briefcase,
    color: 'from-blue-600 to-indigo-600',
    desc: '高頻商業溝通、專案管理與策略制定必備詞彙',
    words: [
      { term: 'synergy', pos: 'n.' as POS, def: '綜效；協同效益', defEn: 'the combined power of a group working together', ex: 'The merger created remarkable operational synergy.' },
      { term: 'streamline', pos: 'v.' as POS, def: '簡化；使效率化', defEn: 'to make a process more efficient and effective', ex: 'We streamlined the approval process to save valuable time.' },
      { term: 'feasibility', pos: 'n.' as POS, def: '可行性', defEn: 'the degree to which something is easily or conveniently done', ex: 'We conducted a feasibility study before launching the project.' },
      { term: 'leverage', pos: 'v.' as POS, def: '善用；發揮槓桿作用', defEn: 'to use something to maximum advantage', ex: 'We can leverage our customer base to test new features.' },
      { term: 'benchmark', pos: 'n.' as POS, def: '基準；標竿', defEn: 'a standard or point of reference against which things are compared', ex: 'Our satisfaction rate serves as the industry benchmark.' },
      { term: 'contingency', pos: 'n.' as POS, def: '應急方案；偶發事件', defEn: 'a future event or circumstance which is possible but uncertain', ex: 'We formulated a contingency plan for unexpected supply delays.' },
      { term: 'scalable', pos: 'adj.' as POS, def: '可規模化的；可擴展的', defEn: 'able to be changed in size, volume, or scale', ex: 'Engineers designed a highly scalable cloud architecture.' },
      { term: 'alignment', pos: 'n.' as POS, def: '策略共識；協調一致', defEn: 'agreement between people or groups on objectives', ex: 'Leadership achieved full strategic alignment on key priorities.' }
    ]
  },
  {
    id: 'academic',
    title: '學術論文與寫作',
    icon: GraduationCap,
    color: 'from-purple-600 to-pink-600',
    desc: '托福/雅思/學術文獻高階論證與精準替換詞彙',
    words: [
      { term: 'ubiquitous', pos: 'adj.' as POS, def: '無所不在的；普遍存在的', defEn: 'present, appearing, or found everywhere', ex: 'Smartphones have become ubiquitous in contemporary daily life.' },
      { term: 'paradigm', pos: 'n.' as POS, def: '思維範式；典型範例', defEn: 'a typical example or established pattern of thinking', ex: 'The scientific discovery provoked a profound paradigm shift.' },
      { term: 'substantiate', pos: 'v.' as POS, def: '證實；提供證據支持', defEn: 'to provide evidence to support or prove the truth of', ex: 'Researchers substantiated their hypothesis with rigorous data.' },
      { term: 'ambiguous', pos: 'adj.' as POS, def: '模稜兩可的；不明確的', defEn: 'open to more than one interpretation; unclear', ex: 'The survey results were ambiguous and required further study.' },
      { term: 'elucidate', pos: 'v.' as POS, def: '闡明；詳細解釋', defEn: 'to make something clear; explain thoroughly', ex: 'The professor elucidated the theoretical mechanism clearly.' },
      { term: 'dichotomy', pos: 'n.' as POS, def: '二分法；對立分割', defEn: 'a division or contrast between two things represented as opposed', ex: 'There is a false dichotomy between theoretical and applied knowledge.' },
      { term: 'juxtapose', pos: 'v.' as POS, def: '並列比較；對照放置', defEn: 'to place different things together to highlight differences', ex: 'The author juxtaposes traditional values with modern perspectives.' },
      { term: 'pragmatic', pos: 'adj.' as POS, def: '務實的；實用主義的', defEn: 'dealing with things sensibly and realistically', ex: 'Adopting a pragmatic strategy resolved the team conflict quickly.' }
    ]
  },
  {
    id: 'lifestyle',
    title: '日常思維與情感地道詞',
    icon: HeartHandshake,
    color: 'from-amber-500 to-rose-500',
    desc: '英語母語者常駐心頭、富含哲理與地道語感的優美詞彙',
    words: [
      { term: 'serendipity', pos: 'n.' as POS, def: '意外之喜；機緣湊巧', defEn: 'the occurrence of finding valuable things unexpectedly', ex: 'Meeting my best friend at the airport was pure serendipity.' },
      { term: 'epiphany', pos: 'n.' as POS, def: '頓悟；突然的靈感體悟', defEn: 'a moment of sudden and profound revelation', ex: 'She experienced an epiphany while reading by the tranquil lake.' },
      { term: 'resilient', pos: 'adj.' as POS, def: '有韌性的；適應復原力強的', defEn: 'able to withstand or recover quickly from difficult situations', ex: 'The resilient team overcame several unexpected setbacks.' },
      { term: 'spontaneous', pos: 'adj.' as POS, def: '自發的；隨性自然的', defEn: 'performed or occurring as a result of sudden impulse', ex: 'We made a spontaneous decision to take a weekend road trip.' },
      { term: 'empathy', pos: 'n.' as POS, def: '同理心；同感共情', defEn: 'the ability to understand and share the feelings of another', ex: 'Listening with genuine empathy builds lasting human trust.' },
      { term: 'meticulous', pos: 'adj.' as POS, def: '一絲不苟的；極其細緻的', defEn: 'showing great attention to detail; very careful', ex: 'He crafted the woodwork with meticulous precision and patience.' },
      { term: 'proactive', pos: 'adj.' as POS, def: '積極主動的；防患未然的', defEn: 'taking action by causing change rather than reacting to it', ex: 'Taking proactive measures prevented costly system downtime.' },
      { term: 'authentic', pos: 'adj.' as POS, def: '真實的；真誠道地的', defEn: 'genuine, reliable, and true to one\'s own personality', ex: 'Audiences resonated deeply with her warm and authentic story.' }
    ]
  },
  {
    id: 'travel',
    title: '旅遊觀光與生活交流',
    icon: Compass,
    color: 'from-emerald-500 to-teal-600',
    desc: '出國旅行、生活漫步與異國文化體驗的高頻核心詞彙',
    words: [
      { term: 'itinerary', pos: 'n.' as POS, def: '旅行行程計畫', defEn: 'a planned route or journey with scheduled stops', ex: 'We finalized our comprehensive travel itinerary for Europe.' },
      { term: 'picturesque', pos: 'adj.' as POS, def: '風景如畫的；別緻雅致的', defEn: 'visually attractive, especially in a charming or quaint manner', ex: 'They stayed in a picturesque mountain village surrounded by pine trees.' },
      { term: 'hospitality', pos: 'n.' as POS, def: '熱情款待；殷勤周到', defEn: 'the friendly and generous reception of guests or strangers', ex: 'We were touched by the heartfelt hospitality of local residents.' },
      { term: 'breathtaking', pos: 'adj.' as POS, def: '壯觀的；令人屏息讚嘆的', defEn: 'astonishing or awe-inspiring in beauty or scale', ex: 'The view from the alpine summit was breathtaking.' },
      { term: 'cuisine', pos: 'n.' as POS, def: '地方特色料理；烹飪', defEn: 'a style of cooking characteristic of a particular country or culture', ex: 'Mediterranean cuisine is celebrated worldwide for fresh herbs and olive oil.' },
      { term: 'scenic', pos: 'adj.' as POS, def: '景色優美的；有自然風光的', defEn: 'providing or relating to views of impressive natural beauty', ex: 'We chose the scenic coastal railway route instead of the highway.' },
      { term: 'commute', pos: 'v.' as POS, def: '通勤；上下班往返', defEn: 'to travel regularly between one\'s home and workplace', ex: 'Many urban residents commute via electric bicycles every morning.' },
      { term: 'souvenir', pos: 'n.' as POS, def: '紀念品；紀念物', defEn: 'a token or keepsake kept as a reminder of a place or occasion', ex: 'I bought a handcrafted ceramic souvenir at the street fair.' }
    ]
  }
];

export const AddWordModal: React.FC<AddWordModalProps> = ({
  isOpen,
  onClose,
  onAddWords,
  lang,
  existingWords = [],
  initialTerm = '',
  categories = [],
  onAddCategory
}) => {
  const t = TRANSLATIONS[lang];
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'packs'>('single');

  // Single word state
  const [term, setTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('未分類');
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [definitions, setDefinitions] = useState<DefinitionInput[]>([
    { pos: 'n.', def: '', ex: '', selected: true }
  ]);
  const [lookupSource, setLookupSource] = useState<'cambridge' | 'ai' | 'dictionary' | null>(null);
  const [lookupSourceLabel, setLookupSourceLabel] = useState<string | null>(null);
  const [candidateSuggestions, setCandidateSuggestions] = useState<string[]>([]);
  const [detectedClipboard, setDetectedClipboard] = useState<string | null>(null);

  // Inflection lemmatization & typo interception states
  const [inflectionInfo, setInflectionInfo] = useState<{ baseForm: string; type: string } | null>(null);
  const [typoSuggestions, setTypoSuggestions] = useState<string[]>([]);
  const [isInvalidWord, setIsInvalidWord] = useState(false);
  const [invalidWordMessage, setInvalidWordMessage] = useState<string | null>(null);

  // Batch import state
  const [batchText, setBatchText] = useState('');
  const [isBatchParsing, setIsBatchParsing] = useState(false);
  const [parsedWordsList, setParsedWordsList] = useState<ParsedWordItem[]>([]);
  const [batchStatusMessage, setBatchStatusMessage] = useState<string | null>(null);

  // Thematic pack selection state
  const [selectedPackId, setSelectedPackId] = useState<string>('business');

  // Fast existing words lookup set
  const existingTermsMap = useMemo(() => {
    const map = new Map<string, Word[]>();
    existingWords.forEach((w) => {
      const clean = w.term.trim().toLowerCase();
      if (!map.has(clean)) map.set(clean, []);
      map.get(clean)!.push(w);
    });
    return map;
  }, [existingWords]);

  // Check if current typed term already exists in user's library
  const currentMatchingWords = useMemo(() => {
    const clean = term.trim().toLowerCase();
    if (!clean) return [];
    return existingTermsMap.get(clean) || [];
  }, [term, existingTermsMap]);

  // Pre-fill initialTerm if passed (e.g. from search click)
  useEffect(() => {
    if (initialTerm && initialTerm.trim()) {
      const clean = initialTerm.trim();
      setTerm(clean);
      setActiveTab('single');
      // Auto-trigger lookup if it looks like an English word
      if (/^[a-zA-Z\s'-]+$/.test(clean)) {
        handleLookupWord(clean);
      }
    }
  }, [initialTerm]);

  // Check clipboard on modal open
  useEffect(() => {
    if (!isOpen) return;
    const checkClipboard = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          const clean = (text || '').trim();
          // If clipboard contains a short English word/phrase (2-30 chars, letters only)
          if (clean && clean.length >= 2 && clean.length <= 32 && /^[a-zA-Z\s'-]+$/.test(clean)) {
            setDetectedClipboard(clean);
          }
        }
      } catch {
        // Clipboard read permission might be denied or unprompted; silently ignore
      }
    };
    checkClipboard();
  }, [isOpen]);

  // Debounced auto-suggestions from Datamuse as user types
  useEffect(() => {
    const clean = term.trim().toLowerCase();
    if (clean.length < 2 || !/^[a-zA-Z]+$/.test(clean)) {
      setCandidateSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.datamuse.com/sug?s=${encodeURIComponent(clean)}&max=5`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const wordsFound = data.map((d: any) => d.word).filter((w: string) => w.toLowerCase() !== clean);
            setCandidateSuggestions(wordsFound.slice(0, 4));
          }
        }
      } catch {}
    }, 280);

    return () => clearTimeout(timer);
  }, [term]);

  if (!isOpen) return null;

  // Multi-definition lookup (Priority: Cambridge Dictionary -> AI Generation -> Bilingual Fallback)
  const [isAllMeaningsLoading, setIsAllMeaningsLoading] = useState(false);

  const handleLookupAllMeanings = async (targetTerm?: string) => {
    const cleanTerm = (targetTerm || term).trim();
    if (!cleanTerm || isAllMeaningsLoading) return;

    const currentSettings = storage.getLocalSettings();
    const apiKey = currentSettings?.geminiApiKey;

    setIsAllMeaningsLoading(true);
    setLookupSource(null);
    setLookupSourceLabel(null);
    setInflectionInfo(null);
    setTypoSuggestions([]);
    setIsInvalidWord(false);
    setInvalidWordMessage(null);

    try {
      const res = await fetch('/api/ai/word-all-meanings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
        },
        body: JSON.stringify({
          term: cleanTerm,
          apiKey
        })
      });

      if (!res.ok) throw new Error('Query failed');
      const data = await res.json();

      // 1. Invalid Word (無意義亂碼 / 查無此英文單字)
      if (data.status === 'invalid') {
        setIsInvalidWord(true);
        setInvalidWordMessage(data.message || `查無「${cleanTerm}」之英文單字，可能包含拼寫錯誤或無意義字母組合。`);
        setTypoSuggestions([]);
        setInflectionInfo(null);
        setLookupSource(null);
        setLookupSourceLabel(null);
        setDefinitions([{ pos: 'n.', def: '', ex: '', selected: true }]);
        return;
      }

      // 2. Typo Interception (拼寫錯誤 / 您是不是要找)
      if (data.status === 'typo') {
        const sugs = Array.isArray(data.suggestions) ? data.suggestions : [];
        setTypoSuggestions(sugs);
        setIsInvalidWord(false);
        setInvalidWordMessage(null);
        setInflectionInfo(null);
        setLookupSource(null);
        setLookupSourceLabel(null);
        setDefinitions([{ pos: 'n.', def: '', ex: '', selected: true }]);
        return;
      }

      // 3. Inflection Recognition (單字變形識別)
      if (data.status === 'inflected' && data.baseForm && data.baseForm.toLowerCase() !== cleanTerm.toLowerCase()) {
        setInflectionInfo({
          baseForm: data.baseForm,
          type: data.inflectionType || '單字變形'
        });
      } else {
        setInflectionInfo(null);
      }

      // 4. Populate Valid Definitions
      if (Array.isArray(data.meanings) && data.meanings.length > 0) {
        setLookupSource(data.source || 'cambridge');
        setLookupSourceLabel(
          data.sourceLabel ||
            (data.source === 'cambridge'
              ? '劍橋英漢辭典 (Cambridge Dictionary)'
              : 'Gemini AI 智能解析')
        );

        const existingDefsForTerm = existingTermsMap.get(cleanTerm.toLowerCase()) || [];

        setDefinitions(
          data.meanings.map((m: any, idx: number) => {
            const normDef = (m.def || '').trim().toLowerCase();
            const normPos = normalizePos(m.pos);
            const isAlreadyInLib = existingDefsForTerm.some(
              (e) =>
                (e.pos || '').trim().toLowerCase() === normPos.toLowerCase() &&
                e.def.trim().toLowerCase() === normDef
            );

            return {
              id: `def-item-${Date.now()}-${idx}`,
              pos: normPos,
              def: (m.def || '').trim(),
              defEn: m.defEn ? m.defEn.trim() : undefined,
              ex: m.ex ? m.ex.trim() : '',
              selected: !isAlreadyInLib // 未收錄之釋義預設勾選
            };
          })
        );
      } else {
        setIsInvalidWord(true);
        setInvalidWordMessage(`查無「${cleanTerm}」之有效繁體中文釋義。`);
        setDefinitions([{ pos: 'n.', def: '', ex: '', selected: true }]);
      }
    } catch (err) {
      console.warn('Lookup all meanings error:', err);
    } finally {
      setIsAllMeaningsLoading(false);
    }
  };

  // Direct alias: Single word lookup also queries multiple meanings
  const handleLookupWord = handleLookupAllMeanings;

  const handleSelectSuggestion = (suggestedWord: string) => {
    setTerm(suggestedWord);
    setCandidateSuggestions([]);
    setIsInvalidWord(false);
    setInvalidWordMessage(null);
    setTypoSuggestions([]);
    setInflectionInfo(null);
    handleLookupAllMeanings(suggestedWord);
  };

  // Apply "Did You Mean" typo suggestion
  const handleApplyTypoCorrection = (correctedWord: string) => {
    setTerm(correctedWord);
    setTypoSuggestions([]);
    setIsInvalidWord(false);
    setInvalidWordMessage(null);
    setInflectionInfo(null);
    handleLookupAllMeanings(correctedWord);
  };

  // Switch to base lemma for inflected forms
  const handleSwitchToBaseForm = (baseWord: string) => {
    setTerm(baseWord);
    setInflectionInfo(null);
    setTypoSuggestions([]);
    setIsInvalidWord(false);
    setInvalidWordMessage(null);
    handleLookupAllMeanings(baseWord);
  };

  const handleApplyClipboard = () => {
    if (!detectedClipboard) return;
    setTerm(detectedClipboard);
    setIsInvalidWord(false);
    setInvalidWordMessage(null);
    setTypoSuggestions([]);
    setInflectionInfo(null);
    handleLookupAllMeanings(detectedClipboard);
    setDetectedClipboard(null);
  };

  const handleAddDefBlock = () => {
    setDefinitions((prev) => [...prev, { pos: 'n.', def: '', ex: '', selected: true }]);
  };

  const handleRemoveDefBlock = (index: number) => {
    if (definitions.length <= 1) return;
    setDefinitions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleDefSelected = (index: number) => {
    setDefinitions((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, selected: item.selected === false ? true : false } : item
      )
    );
  };

  const handleToggleSelectAllDefs = (selectAll: boolean) => {
    setDefinitions((prev) => prev.map((item) => ({ ...item, selected: selectAll })));
  };

  const handleDefChange = (index: number, field: keyof DefinitionInput, value: string) => {
    setDefinitions((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Check if definition already exists in user's library
  const isDefAlreadyInLibrary = (pos: POS, defText: string) => {
    if (!defText.trim()) return false;
    return currentMatchingWords.some(
      (w) => w.pos === pos && w.def.trim().toLowerCase() === defText.trim().toLowerCase()
    );
  };

  // Save single word with multiple selected definitions
  const handleSaveSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTerm = term.trim();
    if (!cleanTerm) return;

    let validDefs = definitions.filter((d) => d.selected !== false && d.def.trim().length > 0);
    // Fallback: If user unchecked everything, take any non-empty definitions
    if (!validDefs.length) {
      validDefs = definitions.filter((d) => d.def.trim().length > 0);
    }
    if (!validDefs.length) return;

    const cleanCategory = selectedCategory.trim();
    const finalCategory = !cleanCategory || cleanCategory === '未分類' ? undefined : cleanCategory;

    const newWords: Partial<Word>[] = validDefs.map((d) => ({
      term: cleanTerm,
      pos: d.pos,
      def: d.def.trim(),
      defEn: (d.defEn || '').trim() || undefined,
      ex: d.ex.trim(),
      category: finalCategory,
      level: 0,
      interval: 1,
      easeFactor: 2.5
    }));

    onAddWords(newWords);
    // Reset form
    setTerm('');
    setDefinitions([{ pos: 'n.', def: '', ex: '', selected: true }]);
    setLookupSource(null);
    setLookupSourceLabel(null);
    setCandidateSuggestions([]);
    onClose();
  };

  // Batch Parser: Parse lines or CSV or comma lists
  const handleParseBatchList = async () => {
    const raw = batchText.trim();
    if (!raw || isBatchParsing) return;

    setIsBatchParsing(true);
    setBatchStatusMessage('🔍 正在智慧解析單字清單並自動查詢釋義...');

    try {
      // 1. Check if it's CSV or TSV format
      const { added } = storage.parseBulkText(raw);
      if (added.length > 0) {
        const parsedItems: ParsedWordItem[] = added.map((w) => ({
          term: w.term || '',
          pos: normalizePos(w.pos),
          def: w.def || '',
          defEn: w.defEn,
          ex: w.ex,
          selected: true,
          alreadyExists: existingTermsMap.has((w.term || '').trim().toLowerCase())
        }));
        setParsedWordsList(parsedItems);
        setBatchStatusMessage(`✅ 成功辨識 ${parsedItems.length} 個單字，請檢視勾選後一鍵儲存！`);
        setIsBatchParsing(false);
        return;
      }

      // 2. Otherwise split by lines or commas or semicolons
      const tokens = raw
        .split(/[\r\n,;]+/)
        .map((t) => t.trim().replace(/^[\d+.\-*•\s]+/, '')) // strip leading numbers/bullets
        .filter((t) => t.length > 0 && /^[a-zA-Z\s'-]+$/.test(t));

      const uniqueTerms = Array.from(new Set(tokens)).slice(0, 30); // Max 30 words per batch

      if (uniqueTerms.length === 0) {
        setBatchStatusMessage('⚠️ 未能從輸入內容中提取到有效英文單字，請檢查文字格式。');
        setIsBatchParsing(false);
        return;
      }

      setBatchStatusMessage(`🔄 正在為 ${uniqueTerms.length} 個單字批次查詢權威中文釋義與例句...`);

      const currentSettings = storage.getLocalSettings();
      const apiKey = currentSettings?.geminiApiKey;

      // Parallel lookup with throttling
      const parsedItems: ParsedWordItem[] = [];
      for (const t of uniqueTerms) {
        try {
          const res = await fetch('/api/ai/article-lookup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
            },
            body: JSON.stringify({ word: t, apiKey })
          });
          if (res.ok) {
            const data = await res.json();
            parsedItems.push({
              term: t,
              pos: normalizePos(data.pos),
              def: data.def || `【${t}】`,
              defEn: data.defEn,
              ex: data.ex,
              selected: true,
              alreadyExists: existingTermsMap.has(t.toLowerCase())
            });
          } else {
            parsedItems.push({
              term: t,
              pos: 'n.',
              def: `【${t}】`,
              selected: true,
              alreadyExists: existingTermsMap.has(t.toLowerCase())
            });
          }
        } catch {
          parsedItems.push({
            term: t,
            pos: 'n.',
            def: `【${t}】`,
            selected: true,
            alreadyExists: existingTermsMap.has(t.toLowerCase())
          });
        }
      }

      setParsedWordsList(parsedItems);
      setBatchStatusMessage(`✨ 已完成 ${parsedItems.length} 個單字的自動補全！`);
    } catch (err) {
      console.error('Batch parse error:', err);
      setBatchStatusMessage('解析過程發生錯誤，請稍後重試。');
    } finally {
      setIsBatchParsing(false);
    }
  };

  // AI Extract Vocabulary from raw paragraph or reading notes
  const handleAIExtractFromText = async () => {
    const raw = batchText.trim();
    if (!raw || isBatchParsing) return;

    setIsBatchParsing(true);
    setBatchStatusMessage('🧠 AI 正在閱讀段落並為您提煉關鍵生詞與釋義...');

    const currentSettings = storage.getLocalSettings();
    const apiKey = currentSettings?.geminiApiKey;

    try {
      const res = await fetch('/api/ai/extract-vocabulary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
        },
        body: JSON.stringify({
          text: raw,
          apiKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.vocabulary) ? data.vocabulary : [];
        if (list.length > 0) {
          const parsedItems: ParsedWordItem[] = list.map((v: any) => ({
            term: v.term,
            pos: normalizePos(v.pos),
            def: v.def || '',
            defEn: v.defEn,
            ex: v.ex,
            selected: true,
            alreadyExists: existingTermsMap.has((v.term || '').trim().toLowerCase())
          }));
          setParsedWordsList(parsedItems);
          setBatchStatusMessage(`🎉 AI 已成功為您提煉 ${parsedItems.length} 個核心學術單字！`);
        } else {
          setBatchStatusMessage('未能在該段落中提煉出合適單字，請嘗試包含更多英文內容。');
        }
      } else {
        setBatchStatusMessage('AI 提煉生詞失敗，請檢查網路連線或 API Key。');
      }
    } catch (err) {
      console.error('AI extraction error:', err);
      setBatchStatusMessage('連線異常，請稍後重試。');
    } finally {
      setIsBatchParsing(false);
    }
  };

  const handleToggleSelectAll = (select: boolean) => {
    setParsedWordsList((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleToggleSelectItem = (index: number) => {
    setParsedWordsList((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSaveSelectedBatch = () => {
    const selectedItems = parsedWordsList.filter((item) => item.selected && item.term.trim());
    if (!selectedItems.length) return;

    const cleanCategory = selectedCategory.trim();
    const finalCategory = !cleanCategory || cleanCategory === '未分類' ? undefined : cleanCategory;

    const newWords: Partial<Word>[] = selectedItems.map((item) => ({
      term: item.term.trim(),
      pos: item.pos,
      def: item.def.trim(),
      defEn: item.defEn,
      ex: item.ex,
      category: finalCategory,
      level: 0,
      interval: 1,
      easeFactor: 2.5
    }));

    onAddWords(newWords);
    setParsedWordsList([]);
    setBatchText('');
    onClose();
  };

  // Thematic Pack selection
  const activePack = THEMATIC_PACKS.find((p) => p.id === selectedPackId) || THEMATIC_PACKS[0];

  const handleAddThematicPackWords = (wordsToAdd: typeof activePack.words) => {
    const packCat =
      activePack.id === 'business'
        ? '商務職場'
        : activePack.id === 'academic'
        ? '學術寫作'
        : '日常實用';

    const newWords: Partial<Word>[] = wordsToAdd.map((w) => ({
      term: w.term,
      pos: w.pos,
      def: w.def,
      defEn: w.defEn,
      ex: w.ex,
      category: packCat,
      level: 0,
      interval: 1,
      easeFactor: 2.5
    }));
    onAddWords(newWords);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-enter">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-slate-100 dark:border-slate-700 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-700 mb-3.5 flex-shrink-0">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-black text-xl tracking-tight">
            <Plus className="w-5 h-5" />
            <span>收錄單字至字庫</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            title="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-700/60 rounded-2xl mb-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'single'
                ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>📝 單詞新增</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('batch')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'batch'
                ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>⚡ 智慧批次辨識</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('packs')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'packs'
                ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>✨ 精選主題詞包</span>
          </button>
        </div>

        {/* ─── TAB 1: SINGLE WORD ─── */}
        {activeTab === 'single' && (
          <form onSubmit={handleSaveSingle} className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
            {/* Clipboard Quick-Fill Banner if detected */}
            {detectedClipboard && (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between text-xs animate-enter">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <Clipboard className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span className="font-medium">
                    偵測到剪貼簿內容：<strong className="font-bold underline">{detectedClipboard}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleApplyClipboard}
                  className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shadow-sm transition active:scale-95 flex-shrink-0"
                >
                  一鍵帶入
                </button>
              </div>
            )}

            {/* Word Input Area */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase text-slate-400">
                  {t.lbl_word} <span className="text-rose-500">*</span>
                </label>

                {term.trim() && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleLookupAllMeanings()}
                      disabled={isAllMeaningsLoading}
                      className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/80 dark:border-emerald-800 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      title="優先從劍橋字典 (Cambridge Dictionary) 抓取多種解釋，若無收錄則由 AI 智能生成"
                    >
                      {isAllMeaningsLoading ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                          <span>正在檢索劍橋字典 / AI 備援...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-sm">🏛️</span>
                          <span>查詢多種釋義 (優先劍橋 / AI 備援)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  autoFocus
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setIsInvalidWord(false);
                    setInvalidWordMessage(null);
                    setTypoSuggestions([]);
                    setInflectionInfo(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (term.trim() && (!definitions.length || !definitions[0].def.trim())) {
                        e.preventDefault();
                        handleLookupAllMeanings(term.trim());
                      }
                    }
                  }}
                  placeholder="例如：epiphany, resilient, present, run..."
                  className="w-full p-3.5 pr-12 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 font-bold text-base outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-white"
                />
                {term.trim() && (
                  <button
                    type="button"
                    onClick={() => tts.speak(term)}
                    className="absolute right-3 p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                    title="朗讀試聽發音"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Inflected Form Banner (變形識別 + 一鍵切換至原形) */}
              {inflectionInfo && (
                <div className="mt-2.5 p-3.5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/50 border border-indigo-200/90 dark:border-indigo-800 text-xs text-indigo-950 dark:text-indigo-200 flex items-center justify-between gap-3 animate-enter shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl flex-shrink-0">💡</span>
                    <div>
                      <div className="font-bold flex items-center gap-1.5 flex-wrap">
                        <span>偵測為單字變形：</span>
                        <span className="font-black underline decoration-indigo-400">{term.trim()}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-700">
                          {inflectionInfo.type}
                        </span>
                      </div>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        建議收錄原形「<strong>{inflectionInfo.baseForm}</strong>」以利系統化學習，亦可直接收錄此變形。
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSwitchToBaseForm(inflectionInfo.baseForm)}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                    title={`點擊立即將輸入框改為「${inflectionInfo.baseForm}」並重新載入原形多種釋義`}
                  >
                    <span>切換為原形</span>
                    <span className="font-mono underline">{inflectionInfo.baseForm}</span>
                  </button>
                </div>
              )}

              {/* Typo Interception Banner & "Did You Mean" Suggestion Chips (錯字攔截 + 您是不是要找) */}
              {typoSuggestions.length > 0 && (
                <div className="mt-2.5 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-200 space-y-2 animate-enter shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg flex-shrink-0">🤔</span>
                    <div>
                      <span className="font-bold">
                        字典中查無「{term.trim()}」，您是不是要找以下單字？
                      </span>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        偵測到疑似拼寫錯誤，點擊下方建議詞即可一鍵替換並查詢釋義：
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    {typoSuggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleApplyTypoCorrection(sug)}
                        className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm border border-amber-300/80 dark:border-amber-700 cursor-pointer"
                      >
                        <span>✨</span>
                        <span>{sug}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Invalid Word Alert Box (無意義亂碼 / 非英文單字攔截) */}
              {isInvalidWord && (
                <div className="mt-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/90 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5 animate-enter shadow-sm">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      查無「{term.trim()}」之有效英文單字
                    </span>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {invalidWordMessage || '此輸入可能包含非標準拼寫、隨機字母組合或無意義字元。系統已為您攔截假釋義生成，請檢查拼寫後重新輸入。'}
                    </p>
                  </div>
                </div>
              )}

              {/* Lookup Source Banner */}
              {lookupSource && (
                <div
                  className={`mt-2 p-3 rounded-2xl border text-xs flex items-center justify-between animate-enter ${
                    lookupSource === 'cambridge'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : lookupSource === 'ai'
                      ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200'
                      : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {lookupSource === 'cambridge' ? '🏛️' : lookupSource === 'ai' ? '✨' : '📖'}
                    </span>
                    <div>
                      <span className="font-bold">
                        {lookupSource === 'cambridge'
                          ? '優先自劍橋字典 (Cambridge Dictionary) 抓取資料'
                          : lookupSource === 'ai'
                          ? '劍橋字典無此詞，由 Gemini AI 智能解析多種釋義'
                          : '雙語辭典備援查詢'}
                      </span>
                      <span className="opacity-80 ml-1.5">
                        ・共為您整理 {definitions.length} 種釋義
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      lookupSource === 'cambridge'
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                        : lookupSource === 'ai'
                        ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300'
                        : 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300'
                    }`}
                  >
                    {lookupSource === 'cambridge' ? '權威劍橋辭典' : lookupSource === 'ai' ? 'AI 智能備援' : '雙語辭典'}
                  </span>
                </div>
              )}

              {/* Duplicate Detection Warning */}
              {currentMatchingWords.length > 0 && (
                <div className="mt-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">字庫中已收錄「{term.trim()}」：</span>
                    <span className="opacity-90">
                      {currentMatchingWords.map((w) => `[${w.pos}] ${w.def}`).join('； ')}
                    </span>
                    <p className="text-[11px] opacity-75 mt-0.5">
                      您可以勾選或追加新的詞性與釋義，儲存後將自動整合至同一個單字卡中！
                    </p>
                  </div>
                </div>
              )}

              {/* Candidate Suggestion Chips */}
              {candidateSuggestions.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400">推薦聯想詞：</span>
                  {candidateSuggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      className="px-2.5 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-100 dark:bg-slate-700 dark:hover:bg-indigo-900/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 text-xs font-semibold transition"
                    >
                      +{sug}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category Selector */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200/80 dark:border-slate-700 space-y-1.5">
              <label className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 block">
                單字分類 (Category)
              </label>
              {!isAddingNewCat ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsAddingNewCat(true);
                        } else {
                          setSelectedCategory(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-800 dark:text-white outline-none cursor-pointer"
                    >
                      <option value="未分類">未分類 (預設)</option>
                      {(categories || []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__NEW__">+ 新增自訂類別...</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                    placeholder="輸入新類別名稱..."
                    maxLength={20}
                    autoFocus
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-indigo-500 text-xs font-bold text-slate-800 dark:text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newCatInput.trim();
                      if (clean && clean !== '未分類') {
                        if (onAddCategory) onAddCategory(clean);
                        setSelectedCategory(clean);
                      }
                      setIsAddingNewCat(false);
                      setNewCatInput('');
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    確定
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNewCat(false);
                      setNewCatInput('');
                    }}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>

            {/* Definitions & POS List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
                <div className="flex items-center gap-2">
                  <span>釋義清單 (共 {definitions.length} 項)</span>
                  {definitions.length > 1 && (
                    <div className="flex items-center gap-1.5 ml-2 normal-case font-semibold text-[11px]">
                      <button
                        type="button"
                        onClick={() => handleToggleSelectAllDefs(true)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        全選
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSelectAllDefs(false)}
                        className="text-slate-400 hover:underline"
                      >
                        全不選
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddDefBlock}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.btn_add_def}</span>
                </button>
              </div>

              {definitions.map((defItem, idx) => (
                <div
                  key={defItem.id || idx}
                  className={`p-4 rounded-2xl border transition relative group space-y-2.5 ${
                    defItem.selected !== false
                      ? 'bg-slate-50 dark:bg-slate-700/40 border-slate-200/90 dark:border-slate-600'
                      : 'bg-slate-50/40 dark:bg-slate-800/30 border-slate-200/40 dark:border-slate-700/40 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/50 dark:border-slate-700/50">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={defItem.selected !== false}
                        onChange={() => handleToggleDefSelected(idx)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                      />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        收錄此釋義 (釋義 #{idx + 1})
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      {isDefAlreadyInLibrary(defItem.pos, defItem.def) && (
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-300/80 dark:border-amber-800">
                          已收錄於字庫
                        </span>
                      )}
                      {definitions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDefBlock(idx)}
                          className="text-slate-300 hover:text-rose-500 p-1 rounded-lg transition"
                          title="移除此釋義"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4 sm:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">
                        詞性
                      </label>
                      <select
                        value={defItem.pos}
                        onChange={(e) => handleDefChange(idx, 'pos', e.target.value as POS)}
                        className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="n.">名詞 (n.)</option>
                        <option value="v.">動詞 (v.)</option>
                        <option value="adj.">形容詞 (adj.)</option>
                        <option value="adv.">副詞 (adv.)</option>
                        <option value="phr.">片語 (phr.)</option>
                        <option value="other">其他</option>
                      </select>
                    </div>

                    <div className="col-span-8 sm:col-span-9">
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">
                        中文釋義 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required={defItem.selected !== false}
                        value={defItem.def}
                        onChange={(e) => handleDefChange(idx, 'def', e.target.value)}
                        placeholder="請輸入中文解釋..."
                        className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-medium outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">
                      英英釋義 (選填 / 劍橋・AI 自動填寫)
                    </label>
                    <input
                      type="text"
                      value={defItem.defEn || ''}
                      onChange={(e) => handleDefChange(idx, 'defEn', e.target.value)}
                      placeholder="例：authentic English definition"
                      className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs font-medium outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">
                      英文實用例句 (選填)
                    </label>
                    <textarea
                      value={defItem.ex}
                      onChange={(e) => handleDefChange(idx, 'ex', e.target.value)}
                      placeholder="請輸入英文例句..."
                      rows={2}
                      className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-xs outline-none resize-none leading-relaxed"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:opacity-95 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 text-sm transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                {definitions.filter((d) => d.selected !== false && d.def.trim().length > 0).length > 1
                  ? `一次收錄所選 ${definitions.filter((d) => d.selected !== false && d.def.trim().length > 0).length} 項釋義至單字庫`
                  : '收錄至單字庫'}
              </span>
            </button>
          </form>
        )}

        {/* ─── TAB 2: SMART BATCH IMPORT & AI PARSE ─── */}
        {activeTab === 'batch' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
            {/* Input Instruction */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>全能智慧輸入支援：</span>
              </p>
              <p className="opacity-90">
                1. <strong>單字清單</strong>：每行一個單字，或逗號分隔（如 <code>epiphany, resilient, serendipity</code>）
              </p>
              <p className="opacity-90">
                2. <strong>文章/筆記段落</strong>：直接貼上一段英文短文，點擊「AI 提煉生詞」即可自動提取！
              </p>
              <p className="opacity-90">
                3. <strong>Excel / CSV 表格</strong>：相容 <code>"單字","詞性","解釋","例句"</code>
              </p>
            </div>

            {/* Textarea */}
            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              disabled={isBatchParsing}
              placeholder={`可在此直接貼上單字列表，例如：\nepiphany\nserendipity\nresilient\n\n或貼上整段英文筆記，讓 AI 自動提煉核心學術生詞！`}
              className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 font-mono text-xs outline-none resize-none leading-relaxed min-h-[140px] text-slate-800 dark:text-slate-100"
            />

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleParseBatchList}
                disabled={isBatchParsing || !batchText.trim()}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isBatchParsing ? 'animate-spin' : ''}`} />
                <span>⚡ 批次解析清單並補齊釋義</span>
              </button>

              <button
                type="button"
                onClick={handleAIExtractFromText}
                disabled={isBatchParsing || !batchText.trim()}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>🧠 AI 提煉文章段落生詞</span>
              </button>
            </div>

            {/* Status Feedback Message */}
            {batchStatusMessage && (
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium px-1 animate-enter">
                {batchStatusMessage}
              </p>
            )}

            {/* Parsed List Preview Table */}
            {parsedWordsList.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700 animate-enter">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      待收錄預覽清單 ({parsedWordsList.filter((p) => p.selected).length}/{parsedWordsList.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(true)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                    >
                      全選
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(false)}
                      className="text-slate-500 hover:underline font-bold"
                    >
                      取消全選
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {parsedWordsList.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleToggleSelectItem(idx)}
                      className={`p-3 rounded-2xl border transition flex items-start gap-3 cursor-pointer ${
                        item.selected
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800'
                          : 'bg-slate-50 dark:bg-slate-700/20 border-slate-200 dark:border-slate-700 opacity-60'
                      }`}
                    >
                      <div className="mt-0.5 text-indigo-600 dark:text-indigo-400">
                        {item.selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-800 dark:text-white">
                            {item.term}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {item.pos}
                          </span>
                          {item.alreadyExists && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                              字庫已有
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                          {item.def}
                        </p>
                        {item.defEn && (
                          <p className="text-[11px] text-slate-400 truncate">
                            {item.defEn}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Batch Category Selector */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    批次收錄分類至：
                  </span>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-800 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="未分類">未分類 (預設)</option>
                    {(categories || []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleSaveSelectedBatch}
                  disabled={parsedWordsList.filter((p) => p.selected).length === 0}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 text-sm transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    一鍵收錄所選 ({parsedWordsList.filter((p) => p.selected).length}) 個單字至字庫
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: THEMATIC PACKS ─── */}
        {activeTab === 'packs' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
            {/* Pack Category Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {THEMATIC_PACKS.map((pack) => {
                const Icon = pack.icon;
                const isSelected = selectedPackId === pack.id;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setSelectedPackId(pack.id)}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-700/30 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${pack.color} text-white flex items-center justify-center`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1">
                      {pack.title}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {pack.words.length} 個精選詞
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Pack Detail */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200/80 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-sm text-slate-800 dark:text-white flex items-center gap-2">
                    <span>{activePack.title}</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">{activePack.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddThematicPackWords(activePack.words)}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 text-white font-bold rounded-xl text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  <span>整包加入 ({activePack.words.length})</span>
                </button>
              </div>

              {/* Word List within Pack */}
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {activePack.words.map((w) => {
                  const alreadySaved = existingTermsMap.has(w.term.toLowerCase());
                  return (
                    <div
                      key={w.term}
                      className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-800 dark:text-white">
                            {w.term}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {w.pos}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              tts.speak(w.term);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 transition"
                            title="朗讀"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                          {w.def}
                        </p>
                      </div>

                      <div className="flex-shrink-0">
                        {alreadySaved ? (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                            ✓ 已收錄
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddThematicPackWords([w])}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold transition active:scale-95"
                          >
                            + 加入
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
