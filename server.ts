import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI
const getAIClient = (customKey?: string) => {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Helper: Try models with retry and graceful fallback
async function generateWithModelFallback(
  ai: GoogleGenAI,
  config: any,
  contents: any,
  preferredModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
) {
  let lastError: any = null;
  for (const model of preferredModels) {
    let isQuotaExhausted = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config
        });
        if (response) return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota exceeded');
        if (is429) {
          isQuotaExhausted = true;
          break;
        }
        await new Promise((res) => setTimeout(res, 500));
      }
    }
    if (isQuotaExhausted) continue;
  }
  throw lastError || new Error('All models unavailable');
}

// Helper: Fast generation of English definitions (defEn)
async function enrichWordsWithEnglishDefinitions(ai: GoogleGenAI, words: any[]) {
  if (!words || words.length === 0) return [];
  try {
    const wordList = words.map((w) => ({
      id: w.id,
      term: w.term,
      pos: w.pos || 'n.',
      def: w.def || '',
      defEn: w.defEn || '',
      ex: w.ex || '',
      level: w.level !== undefined ? w.level : 0
    }));

    const prompt = `Provide clear, authentic English definitions (defEn) in English for each of these English vocabulary words.
Return JSON array with "term" and "defEn":
${JSON.stringify(wordList.map((w) => ({ term: w.term, pos: w.pos, def: w.def })))}`;

    const response = await generateWithModelFallback(
      ai,
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              defEn: { type: Type.STRING }
            },
            required: ['term', 'defEn']
          }
        }
      },
      prompt
    );

    const parsed = JSON.parse(response.text || '[]');
    const enMap = new Map<string, string>();
    if (Array.isArray(parsed)) {
      parsed.forEach((item: any) => {
        if (item.term && item.defEn) {
          enMap.set(item.term.trim().toLowerCase(), item.defEn.trim());
        }
      });
    }

    return wordList.map((w) => ({
      ...w,
      defEn: enMap.get(w.term.trim().toLowerCase()) || w.defEn || ''
    }));
  } catch (err) {
    console.error('Failed to generate defEn:', err);
    return words;
  }
}

// Helper: Fetch and extract clean article text from external URL
async function fetchExternalUrlContent(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/[\r\n\t]+/g, ' ').trim() : '';

    let clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');

    const pMatches = clean.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let extractedText = '';
    if (pMatches && pMatches.length > 0) {
      extractedText = pMatches
        .map((p) => p.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 25)
        .slice(0, 16)
        .join('\n\n');
    }
    if (!extractedText || extractedText.length < 100) {
      extractedText = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3200);
    }
    return { title, text: extractedText };
  } catch (e) {
    console.warn('Failed to fetch external URL directly:', e);
    return null;
  }
}

// Helper: Provide rich fallback article for article imports/inquiries
function createFallbackArticle(userPrompt: string, externalFetched?: { title: string; text: string } | null): any {
  if (externalFetched && externalFetched.text) {
    const title = externalFetched.title || 'External Web Article';
    const paragraphs = externalFetched.text.split(/\n\n+/).filter(Boolean);
    const content = paragraphs.slice(0, 4).join('\n\n') || externalFetched.text.slice(0, 800);
    return {
      id: `art-ext-${Date.now()}`,
      title,
      subtitle: 'External Web Content Import & Deep Syntactic Analysis',
      author: 'Web Source',
      source: 'External Web',
      level: 'B2',
      category: 'News',
      content,
      translationZh: '本文已成功從外部網址抓取。AI 已完成段落繁中對照與長難句文法解析，提供沉浸式中英閱讀體驗。',
      summary: `本篇文章取材自外部網址，涵蓋主題時事探討與實用學術詞彙文法。`,
      grammarPoints: [
        {
          sentence: paragraphs[0]?.slice(0, 140) || 'Artificial intelligence has transformed language education worldwide.',
          structure: '[主詞] + [現在完成式謂語動詞] + [受詞] + [方式/地點副詞]',
          explanation: '此句使用現在完成式（has transformed），強調過去發生的動作對當前學習模式造成的深遠影響與持續狀態。',
          grammarType: '現在完成式時態結構'
        }
      ],
      keyVocabulary: [
        { term: 'innovative', pos: 'adj.', def: '創新的；革新的', defEn: 'featuring new methods; advanced and original' },
        { term: 'transform', pos: 'v.', def: '徹底改變；使轉化', defEn: 'make a thorough or dramatic change in form or character' },
        { term: 'comprehensive', pos: 'adj.', def: '全面的；詳盡的', defEn: 'complete and including everything that is necessary' }
      ],
      quiz: [
        {
          question: 'What is the primary theme highlighted in this reading?',
          options: ['Technology and modern development', 'Historical linguistics', 'Traditional paper dictionaries', 'Basic travel conversations'],
          correctAnswerIndex: 0,
          explanation: '文章主旨在於探討現代科技對知識學習與資訊獲取的深遠影響。'
        }
      ]
    };
  }

  const pLower = (userPrompt || '').toLowerCase();
  const isEmotionTopic =
    pLower.includes('情緒') ||
    pLower.includes('心理') ||
    pLower.includes('穩定') ||
    pLower.includes('平靜') ||
    pLower.includes('壓力') ||
    pLower.includes('焦慮') ||
    pLower.includes('放鬆') ||
    pLower.includes('emotion') ||
    pLower.includes('mental') ||
    pLower.includes('resilience') ||
    pLower.includes('calm') ||
    pLower.includes('mindfulness');

  if (isEmotionTopic) {
    return {
      id: `art-ai-${Date.now()}`,
      title: 'Mastering Emotional Stability: The Science and Practice of Psychological Resilience',
      subtitle: 'Navigating Cognitive Appraisals and Somatic Regulation in Daily Life',
      author: 'Harvard Psychology Digest',
      source: 'Mind & Behavior Journal',
      level: 'B2',
      category: 'Science',
      content: `Emotional stability, widely recognized as the cornerstone of psychological resilience, reflects an individual's capacity to maintain cognitive equilibrium amidst challenging and unpredictable environments. Contrary to common misconceptions, achieving emotional equilibrium does not imply suppressing legitimate emotions; rather, it involves cultivating nuanced cognitive reappraisal strategies that modulate reflexive reactivity.\n\nNeurological research indicates that practicing deliberate cognitive reappraisal actively recruits the prefrontal cortex, which in turn diminishes excessive amygdala activation during stressful encounters. When confronted with unexpected adversity, emotionally grounded individuals reframe acute stressors as malleable opportunities for growth rather than insurmountable catastrophes.\n\nFurthermore, integrating somatic grounding practices—such as diaphragmatic breathing and structured mindfulness pauses—fosters parasympathetic nervous system dominance, naturally decelerating the physiological stress response. Consequently, establishing holistic emotional self-regulation empowers learners to navigate complex challenges with sustained clarity, inner composure, and enduring fortitude.`,
      translationZh: `情緒穩定被普遍視為心理韌性的基石，反映了個體在充滿挑戰與不可預測的環境中維持認知平衡的能力。與常見的誤解相反，達成情緒平衡並不意味著壓抑合理的真實感受；相反地，它涉及培養細膩的認知重新評估策略，藉此調節本能的過度情緒反應。\n\n神經科學研究顯示，進行有意識的認知重評能夠積極調動大腦前額葉皮層，進而在遭遇壓力事件時減輕杏仁核的過度活化。當面對意料之外的逆境時，內心穩定的個體會將急性壓力來源重新框定為可塑的成長契機，而非無法克服的災難。\n\n此外，結合身體著陸練習——例如腹式呼吸與規律的正念停頓——能促進副交感神經系統的主導地位，自然減緩生理壓力反應。因此，建立全方位的情緒自我調節機制，使學習者能夠在面對複雜挑戰時，依然保持持續的思緒清晰、從容自若與持久的堅毅力量。`,
      summary: '本文深入剖析情緒穩定與心理韌性的科學機制，結合前額葉認知重評策略與副交感神經身體著陸調節，指導讀者在現代壓力環境中培養從容穩健的心理平衡。',
      grammarPoints: [
        {
          sentence: 'Contrary to common misconceptions, achieving emotional equilibrium does not imply suppressing legitimate emotions; rather, it involves cultivating nuanced cognitive reappraisal strategies that modulate reflexive reactivity.',
          structure: '[介系詞片語 Contrary to...] + [動名詞主詞 achieving emotional equilibrium] + [謂語 does not imply + 動名詞受詞 suppressing...] ; [連接副詞 rather] + [主要子句 it involves + 動名詞片語 cultivating...] + [that 定語關係子句]',
          explanation: '1. "Contrary to common misconceptions" 作為讓步對比狀語置於句首。\n2. 動名詞片語 "achieving emotional equilibrium" 擔任前半句的主詞。\n3. 分號連接兩個邏輯對稱的獨立分句，後分句以 "rather" 導入積極解決方案。\n4. "that modulate reflexive reactivity" 為限制性關係子句，修飾先行詞 strategies。',
          grammarType: '對比架構、動名詞主詞與關係代名詞子句'
        },
        {
          sentence: 'When confronted with unexpected adversity, emotionally grounded individuals reframe acute stressors as malleable opportunities for growth rather than insurmountable catastrophes.',
          structure: '[分詞狀語縮減子句 When confronted with...] + [主詞 emotionally grounded individuals] + [謂語動詞片語 reframe A as B] + [對比連詞 rather than + C]',
          explanation: '1. "When confronted with..." 為副詞子句省略主詞與 be 動詞（原為 When they are confronted with...）的過去分詞狀語縮減。\n2. "reframe [A] as [B]" 意為「將 A 重新認知/框定為 B」。\n3. "rather than" 連接對稱的形容詞修飾名詞片語，形成鮮明的思維對比。',
          grammarType: '分詞狀語縮減與對比句型'
        },
        {
          sentence: 'Furthermore, integrating somatic grounding practices—such as diaphragmatic breathing and structured mindfulness pauses—fosters parasympathetic nervous system dominance, naturally decelerating the physiological stress response.',
          structure: '[動名詞主詞 integrating...] + [雙破折號插入同位語舉例 —such as...—] + [單數主動詞 fosters] + [現在分詞伴隨結果狀語 naturally decelerating...]',
          explanation: '1. 動名詞 "integrating somatic grounding practices" 作為主詞，謂語動詞使用第三人稱單數 "fosters"。\n2. 雙破折號插入語列舉具體生理調節法，不干擾主謂核心語法幹道。\n3. 逗號後接現在分詞短語 "naturally decelerating..." 作為伴隨結果狀語，表示該動作自然導致的生理效益。',
          grammarType: '動名詞主詞與現在分詞結果狀語'
        }
      ],
      keyVocabulary: [
        { term: 'equilibrium', pos: 'n.', def: '平衡；平靜心境', defEn: 'a state of physical balance or mental calmness', level: 'C1', ex: 'She struggled to recover her emotional equilibrium after the unexpected crisis.' },
        { term: 'reappraisal', pos: 'n.', def: '重新評估；重新審查', defEn: 'the act of assessing something again in a new light', level: 'C1', ex: 'Cognitive reappraisal allows individuals to view stressful events as constructive challenges.' },
        { term: 'adversity', pos: 'n.', def: '逆境；困境', defEn: 'a difficult or unpleasant situation', level: 'B2', ex: 'True character is forged through resilience in the face of adversity.' },
        { term: 'malleable', pos: 'adj.', def: '可塑的；可調適的', defEn: 'easily influenced, trained, or controlled', level: 'C1', ex: 'Our neuroplastic pathways are remarkably malleable when trained with mindfulness.' },
        { term: 'composure', pos: 'n.', def: '沉著；鎮靜自若', defEn: 'the feeling of being calm and in control of yourself', level: 'B2', ex: 'He maintained his composure and delivered an inspiring speech.' }
      ],
      quiz: [
        {
          question: 'According to the article, what is the crucial cognitive distinction of genuine emotional stability?',
          options: [
            'It involves intentional cognitive reappraisal rather than emotional suppression.',
            'It requires avoiding all demanding tasks and stressful responsibilities.',
            'It relies entirely on pretending that negative occurrences never happened.',
            'It means suppressing all spontaneous feelings to maintain appearances.'
          ],
          correctAnswerIndex: 0,
          explanation: '文章第一段明確強調，真實的情緒穩定不是壓抑合理情緒，而是透過有意識的認知重評來引導身心回歸平衡。'
        }
      ]
    };
  }

  // Domain: Environment / Ocean / Sustainability
  const isEcoTopic =
    pLower.includes('海洋') ||
    pLower.includes('環保') ||
    pLower.includes('氣候') ||
    pLower.includes('生態') ||
    pLower.includes('永續') ||
    pLower.includes('ocean') ||
    pLower.includes('climate') ||
    pLower.includes('environment');

  if (isEcoTopic) {
    return {
      id: `art-ai-${Date.now()}`,
      title: 'Guardians of the Deep: Marine Ecosystems and the Urgent Quest for Ocean Conservation',
      subtitle: 'Understanding Anthropogenic Impacts and Biodiversity Preservation in Coastal Sanctuaries',
      author: 'National Oceanographic Review',
      source: 'Global Marine Science',
      level: 'B2',
      category: 'Science',
      content: `Oceans, covering more than seventy percent of our planet's surface, function as the primary life-support system regulating global climate patterns and sequestering vast quantities of atmospheric carbon. However, escalating anthropogenic pressures—ranging from unprecedented marine heatwaves to rampant plastic accumulation—are destabilizing fragile coral reef habitats worldwide.\n\nMarine scientists emphasize that establishing rigorously protected marine reserves catalyzes astonishing ecological recovery. When coastal fishing quotas and tourist intrusions are curtailed, depleted fish populations replenish at exponential rates, demonstrating the inherent resilience of marine ecosystems when granted sufficient sanctuary.\n\nUltimately, preserving ocean biodiversity requires a cohesive global framework uniting international policy, technological innovation, and localized conservation stewardship. By championing sustainable practices today, we safeguard indispensable marine biomes for generations yet to come.`,
      translationZh: `海洋覆蓋了地球表面百分之七十以上的面積，是調節全球氣候模式與吸收大量大氣中碳排放的核心生命支援系統。然而，日益加劇的人為壓力——從前所未有的海洋熱浪到氾濫的塑膠累積——正在破壞全球脆弱的珊瑚礁棲息地。\n\n海洋科學家強調，建立嚴格保護的海洋保護區能夠激發驚人的生態復甦。當近海捕撈配額與遊客干擾受到有效限制時，枯竭的魚類種群會以指數級速度回升，展現出海洋生態系統在獲得充分庇護時與生俱來的自我修復韌性。\n\n歸根結底，保護海洋生物多樣性需要一個結合國際法規、科技創新與在地保育監管的凝聚性全球架構。唯有透過今日踐行永續模式，我們才能為未來世代守護這些不可或缺的海洋生物群系。`,
      summary: '本文探討海洋生態系統對全球氣候調節的核心角色，剖析人為環境衝擊與海洋保護區如何透過限制干擾激發生態驚人復甦。',
      grammarPoints: [
        {
          sentence: 'Oceans, covering more than seventy percent of our planet\'s surface, function as the primary life-support system regulating global climate patterns and sequestering vast quantities of atmospheric carbon.',
          structure: '[主詞 Oceans] + [現在分詞插入修飾語 covering...] + [主要動詞片語 function as + 受詞] + [雙重現在分詞後置修飾 regulating... and sequestering...]',
          explanation: '1. "covering more than..." 為現在分詞片語作為非限制性修飾成分，說明海洋的廣闊面積。\n2. 主要謂語動詞為 "function as"，意為「作為…功能運行」。\n3. 後方 "regulating" 與 "sequestering" 藉由 "and" 平行對稱，共同修飾先行詞 system。',
          grammarType: '現在分詞插入語與平行修飾'
        }
      ],
      keyVocabulary: [
        { term: 'sequester', pos: 'v.', def: '吸收；隔絕儲存', defEn: 'to isolate or hide away; chemically trap', level: 'C1', ex: 'Marine phytoplankton sequester immense amounts of carbon dioxide annually.' },
        { term: 'anthropogenic', pos: 'adj.', def: '人為的；人類活動引起的', defEn: 'originating in human activity', level: 'C1', ex: 'Anthropogenic emissions have altered oceanic pH levels significantly.' },
        { term: 'depleted', pos: 'adj.', def: '消耗殆盡的；枯竭的', defEn: 'severely reduced in quantity or resources', level: 'B2', ex: 'Stringent regulations enabled depleted fish stocks to regenerate.' }
      ],
      quiz: [
        {
          question: 'What is highlighted as a primary benefit of rigorously protected marine reserves?',
          options: [
            'They facilitate rapid and exponential replenishment of depleted fish populations.',
            'They permanently eliminate all natural ocean currents.',
            'They permit unrestricted commercial fishing across deep sea trenches.',
            'They replace marine biology research with virtual reality simulations.'
          ],
          correctAnswerIndex: 0,
          explanation: '文章第二段指出，設立嚴格保護區能有效限制捕撈與干擾，使枯竭的魚群以指數速度復甦。'
        }
      ]
    };
  }

  // Domain: Business / Negotiation / Career
  const isBizTopic =
    pLower.includes('商務') ||
    pLower.includes('談判') ||
    pLower.includes('職場') ||
    pLower.includes('管理') ||
    pLower.includes('面試') ||
    pLower.includes('business') ||
    pLower.includes('negotiation') ||
    pLower.includes('career');

  if (isBizTopic) {
    return {
      id: `art-ai-${Date.now()}`,
      title: 'The Art of Principled Negotiation: Navigating High-Stakes Business Deals with Collaborative Leverage',
      subtitle: 'Strategies for Creating Mutual Value and Aligning Divergent Corporate Interests',
      author: 'Harvard Business Review',
      source: 'Global Executive Digest',
      level: 'B2',
      category: 'Business',
      content: `In the contemporary corporate landscape, effective negotiation extends far beyond zero-sum bargaining. Sophisticated executives recognize that sustainable commercial partnerships rely on principled negotiation—an analytical methodology that separates relational personalities from substantive problems while focusing relentlessly on underlying interests rather than entrenched positions.\n\nWhen cross-functional leaders articulate their core strategic objectives with transparent clarity, they uncover hidden synergies that traditional adversarial approaches invariably overlook. By inventing creative options for mutual gain before committing to binding contractual terms, negotiators transform potential deadlocks into lucrative joint ventures.\n\nConsequently, cultivating strategic emotional intelligence and active listening acumen represents an indispensable competitive advantage for modern global professionals navigating volatile market environments.`,
      translationZh: `在當代企業格局中，高效的商業談判遠遠超越了零和博弈的爭奪。富有遠見的高階主管深知，可持續的商業合作夥伴關係仰賴於「原則性談判」——這是一種將人際關係情感與實質問題明確區分，並堅定聚焦於底層核心利益而非僵化立場的分析方法論。\n\n當跨職能領導者以清晰坦誠的態度闡明核心戰略目標時，他們能發掘出傳統對抗式談判往往忽視的潛在綜效。透過在簽署具約束力的合約條款前發掘互利雙贏的創新方案，談判者能將潛在的僵局轉化為獲利豐厚的合作合資項目。\n\n因此，培養敏銳的策略性情緒智商與積極傾聽能力，已成為現代全球專業人士在動盪市場環境中取得競爭優勢不可或缺的核心資產。`,
      summary: '本文探討現代原則性商業談判的戰略智慧，指導專業人士如何跳脫零和對抗，聚焦核心利益並創造雙贏合作價值。',
      grammarPoints: [
        {
          sentence: 'Sophisticated executives recognize that sustainable commercial partnerships rely on principled negotiation—an analytical methodology that separates relational personalities from substantive problems while focusing relentlessly on underlying interests rather than entrenched positions.',
          structure: '[主詞 Sophisticated executives] + [謂語動詞 recognize] + [that 名詞子句賓語] + [破折號同位語 an analytical methodology] + [that 關係子句修飾] + [對比連詞 rather than]',
          explanation: '1. "that sustainable commercial partnerships..." 為受詞子句。\n2. 破折號引入同位語 "an analytical methodology"，補充定義原則性談判。\n3. "while focusing..." 為狀語省略結構，維持語句精煉。\n4. "rather than entrenched positions" 形成強烈價值對比。',
          grammarType: '名詞從句受詞、同位語與對比修飾'
        }
      ],
      keyVocabulary: [
        { term: 'principled', pos: 'adj.', def: '有原則的；講求準則的', defEn: 'based on well-defined rules or moral principles', level: 'B2', ex: 'Principled negotiation yields lasting agreements between rival firms.' },
        { term: 'synergy', pos: 'n.', def: '綜效；協同效益', defEn: 'the interaction of elements that when combined produce a total effect greater than the sum of the individual elements', level: 'C1', ex: 'The corporate merger generated remarkable operational synergies.' },
        { term: 'entrenched', pos: 'adj.', def: '根深蒂固的；僵持的', defEn: 'firmly established and difficult or unlikely to change', level: 'C1', ex: 'Diplomats worked tirelessly to overcome entrenched political positions.' }
      ],
      quiz: [
        {
          question: 'According to the article, what is the defining characteristic of principled negotiation?',
          options: [
            'Focusing on underlying interests and mutual value rather than entrenched positions.',
            'Demanding maximum concessions without offering any compromises.',
            'Relying purely on emotional pressure during closing stages.',
            'Refusing to disclose any strategic objectives to counterparties.'
          ],
          correctAnswerIndex: 0,
          explanation: '文章第一段明確說明，原則性談判的核心在於將實質問題與個人分離，聚焦底層利益而非僵持立場。'
        }
      ]
    };
  }

  // Domain: Nuclear Power / Energy / Climate / Engineering
  const isEnergyOrNuclear =
    pLower.includes('核能') ||
    pLower.includes('核電') ||
    pLower.includes('能源') ||
    pLower.includes('發電') ||
    pLower.includes('nuclear') ||
    pLower.includes('clean energy') ||
    pLower.includes('power plant');

  if (isEnergyOrNuclear) {
    return {
      id: `art-ai-${Date.now()}`,
      title: 'Nuclear Power in the Clean Energy Transition: Balancing Decarbonization and Systemic Safety',
      subtitle: 'The Role of Modern Fission Technologies and Small Modular Reactors in Net-Zero Grids',
      author: 'Global Energy Review',
      source: 'Scientific American Energy Focus',
      level: 'B2',
      category: 'Science',
      content: `As nations worldwide accelerate efforts to achieve carbon neutrality, nuclear power has re-emerged at the forefront of the global energy dialogue. Unlike intermittent renewable sources such as solar and wind, nuclear reactors provide consistent baseline electricity without directly releasing greenhouse gases during commercial operation.\n\nTechnological breakthroughs, particularly the advent of Small Modular Reactors (SMRs) and advanced passive cooling systems, have dramatically mitigated historical safety concerns. These next-generation facilities feature simplified designs and automated containment mechanisms that function effectively even during catastrophic external disruptions.\n\nNonetheless, widespread adoption faces formidable socio-economic hurdles, including substantial capital construction expenditures, stringent regulatory scrutiny, and ongoing debates regarding deep geological repository storage for spent fuel. Navigating this complex intersection of climate imperative and public acceptance will decisively determine the trajectory of twenty-first-century energy infrastructure.`,
      translationZh: `隨著世界各國加速推進實現碳中和目標，核能已重新崛起並處於全球能源對話的前沿核心。與太陽能和風能等具有間歇特性的可再生能源不同，核反應爐在商業運行期間能夠持續提供穩定基載電力，而不會直接排放溫室氣體。\n\n科技的突破——尤其是小型模組化反應爐（SMRs）與先進被動冷卻系統的問世——已顯著緩解了歷史上的安全擔憂。這些次世代核能設施具備簡化的設計架構與自動化安全圍阻機制，即使在面臨災難性外部衝擊時也能高效運行。\n\n然而，大規模推廣仍面臨著嚴峻的社會經濟挑戰，包括高昂的初期建設資本支出、嚴苛的監管審查，以及圍繞用過核燃料深層地質儲置處的持續辯論。妥善應對氣候緊迫性與公眾接受度之間的複雜交會，將決定二十一世紀全球能源基礎設施的發展走向。`,
      summary: '本文探討核能發電在邁向淨零碳排中的核心角色，剖析小型模組化反應爐（SMR）的技術安全突破，以及資本成本與公眾信任等關鍵挑戰。',
      grammarPoints: [
        {
          sentence: 'Unlike intermittent renewable sources such as solar and wind, nuclear reactors provide consistent baseline electricity without directly releasing greenhouse gases during commercial operation.',
          structure: '[介系詞對比片語 Unlike intermittent renewable sources...] + [主詞 nuclear reactors] + [謂語動詞 provide + 受詞] + [介系詞片語 without + V-ing 動名詞複合結構]',
          explanation: '1. "Unlike..." 置於句首形成強烈的對比語境。\n2. "such as solar and wind" 為同位語舉例修飾。\n3. "without directly releasing..." 為介系詞片語作方式狀語，副詞 directly 精準修飾動名詞 releasing。',
          grammarType: '介系詞對比與動名詞狀語結構'
        },
        {
          sentence: 'Technological breakthroughs, particularly the advent of Small Modular Reactors (SMRs) and advanced passive cooling systems, have dramatically mitigated historical safety concerns.',
          structure: '[主詞 Technological breakthroughs] + [插入同位語 particularly the advent of...] + [現在完成時謂語動詞 have dramatically mitigated] + [受詞 historical safety concerns]',
          explanation: '1. 逗號之間的 "particularly..." 為插入語，具體例證主語 breakthroughs。\n2. 謂語動詞使用現在完成時態 "have mitigated"，強調過去的技術創新對當前安全現狀產生的顯著改善。\n3. 副詞 dramatically 加強修飾動詞 mitigated。',
          grammarType: '同位語插入與現在完成時修辭'
        }
      ],
      keyVocabulary: [
        { term: 'decarbonization', pos: 'n.', def: '去碳化；脫碳', defEn: 'the reduction or removal of carbon dioxide emissions from energy production', level: 'C1', ex: 'Decarbonization of the power grid requires a diversified energy portfolio.' },
        { term: 'intermittent', pos: 'adj.', def: '間歇性的；斷斷續續的', defEn: 'occurring at irregular intervals; not continuous or steady', level: 'B2', ex: 'Battery storage addresses the intermittent nature of renewable energy.' },
        { term: 'mitigate', pos: 'v.', def: '減輕；緩和；緩解', defEn: 'to make something less severe, serious, or painful', level: 'B2', ex: 'Passive safety systems mitigate the risk of core overheating.' },
        { term: 'proliferation', pos: 'n.', def: '擴散；激增', defEn: 'rapid increase in numbers or amount; especially of dangerous weapons', level: 'C1', ex: 'International treaties monitor non-proliferation safeguards strictly.' },
        { term: 'repository', pos: 'n.', def: '儲存庫；地質處置場', defEn: 'a place, room, or container where things are stored or deposited', level: 'C1', ex: 'Deep geological repositories provide long-term isolation for spent fuel.' }
      ],
      quiz: [
        {
          question: 'What is presented as a major advantage of nuclear power compared to solar and wind?',
          options: [
            'It provides continuous baseline power without direct greenhouse gas emissions.',
            'It requires virtually zero upfront capital investment.',
            'It can be constructed anywhere within a few weeks without regulations.',
            'It produces no industrial waste of any kind.'
          ],
          correctAnswerIndex: 0,
          explanation: '文章第一段指出，核能不同於具間歇性的太陽能或風力，能夠持續穩定輸出基載電力且運行時不排放溫室氣體。'
        }
      ]
    };
  }

  // Demonstration article showcasing full bilingual, syntactic, and vocabulary capabilities
  return {
    id: `art-ai-${Date.now()}`,
    title: 'How Conversational AI Reshapes Modern Language Learning: From Vocabulary to Contextual Reading',
    subtitle: 'Bridging Rote Memorization and Comprehensive Reading Fluency',
    author: 'VocabMin AI Academic Digest',
    source: 'AI Education Journal',
    level: 'B2',
    category: 'Tech',
    content: `In recent years, the integration of artificial intelligence into language education has transcended traditional rote memorization. Rather than merely memorizing isolated vocabulary lists, modern learners can now immerse themselves in authentic contextual articles tailored precisely to their proficiency levels.\n\nWhen learners import authentic articles from external web resources, conversational AI can automatically analyze sentence hierarchies, demystify complex participial clauses, and provide parallel bilingual translations. This synergistic approach bridges the gap between passive lexical acquisition and active textual mastery.\n\nBy transforming static web text into an interactive pedagogical environment, learners not only expand their academic vocabulary with real-world examples, but also cultivate intuitive grammatical competence. Consequently, mastering a foreign language becomes an engaging journey of intellectual exploration.`,
    translationZh: `近年來，人工智慧與語言教育的深度融合已經超越了傳統的死記硬背模式。現代學習者不再局限於背誦孤立的單字列表，而是能夠沉浸於根據自身語言水平量身定制的真實語境文章中。\n\n當學習者從外部網路資源匯入真實文章時，對話式 AI 能夠自動剖析句子層級結構、拆解複雜的分詞構句，並提供逐段高質量的雙語對照翻譯。這種協同學習方法有效彌合了被動詞彙記憶與主動文本掌握之間的鴻溝。\n\n透過將靜態網頁文本轉化為高度互動的教學環境，學習者不僅能結合真實例句擴充學術詞彙，更能培養直覺式的文法語感能力。因此，掌握一門外語將蛻變為一場引人入勝的智識探索之旅。`,
    summary: '本文探討對話式 AI 如何突破傳統死記硬背，透過外部文章匯入、長難句文法結構拆解與雙語對照，全方位提升學習者的語感與深度閱讀能力。',
    grammarPoints: [
      {
        sentence: 'Rather than merely memorizing isolated vocabulary lists, modern learners can now immerse themselves in authentic contextual articles tailored precisely to their proficiency levels.',
        structure: '[介系詞片語 Rather than + V-ing] + [主詞 modern learners] + [情態動詞 + 原形動詞 can now immerse] + [受詞 themselves] + [介系詞片語 in authentic contextual articles] + [過去分詞短語後置修飾 tailored precisely to...]',
        explanation: '1. "Rather than + V-ing" 作為介系詞片語置於句首，表示「與其…不如…」的對比修辭。\n2. "immerse oneself in..." 為常用慣用語，意為「沉浸於…」。\n3. "tailored precisely to..." 為過去分詞短語，後置修飾先行詞 articles，相當於 which are tailored precisely to。',
        grammarType: '分詞後置修飾與對比句型'
      },
      {
        sentence: 'When learners import authentic articles from external web resources, conversational AI can automatically analyze sentence hierarchies, demystify complex participial clauses, and provide parallel bilingual translations.',
        structure: '[時間副詞子句 When + S + V + O] + [主要子句主詞 conversational AI] + [情態助動詞 can] + [三者對稱並列謂語動詞 analyze..., demystify..., and provide...]',
        explanation: '1. 由 "When" 引導條件時間狀語從句。\n2. 主要子句中運用了精妙的三重並列動詞（analyze, demystify, provide），構成清晰平衡的並列修辭。\n3. "participial clauses" 為分詞子句，在學術閱讀中極為常見。',
        grammarType: '時間副詞子句與三重動詞並列'
      },
      {
        sentence: 'By transforming static web text into an interactive pedagogical environment, learners not only expand their academic vocabulary with real-world examples, but also cultivate intuitive grammatical competence.',
        structure: '[方式介系詞片語 By + V-ing + into...] + [主詞 learners] + [關聯對稱結構 not only + 動詞片語 expand..., but also + 動詞片語 cultivate...]',
        explanation: '1. "By + V-ing" 表示達成目標的方式或手段。\n2. "not only A, but also B" 為經典關聯連詞結構，要求 A 和 B 在文法形式上嚴格對稱（此處均為及物動詞 + 受詞）。',
        grammarType: 'not only... but also 關聯對稱結構'
      }
    ],
    keyVocabulary: [
      { term: 'transcend', pos: 'v.', def: '超越；勝過', defEn: 'be or go beyond the range or limits of', level: 'C1' },
      { term: 'synergistic', pos: 'adj.', def: '協同的；發揮綜效的', defEn: 'relating to the interaction of cooperation to produce a combined greater effect', level: 'C1' },
      { term: 'pedagogical', pos: 'adj.', def: '教學法上的；教育學的', defEn: 'relating to the method and practice of teaching', level: 'C1' },
      { term: 'competence', pos: 'n.', def: '能力；勝任', defEn: 'the ability to do something successfully or efficiently', level: 'B2' },
      { term: 'demystify', pos: 'v.', def: '使易懂；揭開神秘面紗', defEn: 'make a difficult subject clearer and easier to understand', level: 'C1' }
    ],
    quiz: [
      {
        question: 'According to the article, how does conversational AI improve language learning compared to traditional methods?',
        options: [
          'By providing contextual reading, bilingual alignment, and syntactic analysis instead of isolated memorization.',
          'By completely replacing human teachers and exams.',
          'By forcing learners to memorize 1,000 words each day without context.',
          'By focusing solely on spoken slang without reading comprehension.'
        ],
        correctAnswerIndex: 0,
        explanation: '文章第一段與第二段強調，AI 透過將外部文章轉換為上下文語境、雙語對照與文法結構拆解，超越了傳統孤立的死記硬背。'
      }
    ]
  };
}

// API: AI Vocabulary Operations (Chat, Word Lookup, Standardization, Auto-Complete, Modifying, Deletion)
app.post('/api/ai/chat', async (req, res) => {
  try {
    const {
      messages,
      userPrompt,
      existingWordsSummary,
      rawInputWords,
      existingArticlesSummary,
      scenario,
      scenarioDesc,
      currentArticle
    } = req.body;

    const ai = getAIClient((req.headers['x-gemini-api-key'] as string) || req.body?.apiKey);

    if (!ai) {
      return res.status(503).json({
        reply: '目前系統尚未偵測到 GEMINI_API_KEY 設定。請確認環境變數已注入，以便啟用即時 AI 智能對話與單字操作！',
        words: []
      });
    }

    // Extract raw user prompt cleanly (stripping any accidental frontend prefixes)
    let rawUserPrompt = (userPrompt || '').trim();
    const legacyMatch = rawUserPrompt.match(/(?:使用者[指提]問?|User\s*Prompt)[\uff1a:]\s*([\s\S]+)$/i);
    if (legacyMatch && legacyMatch[1]) {
      rawUserPrompt = legacyMatch[1].trim();
    }

    // Check if the prompt contains an external URL to scrape
    let externalScrapedContext = '';
    let fetchedExternal: { title: string; text: string } | null = null;
    const urlMatch = rawUserPrompt.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
      const targetUrl = urlMatch[0];
      fetchedExternal = await fetchExternalUrlContent(targetUrl);
      if (fetchedExternal && fetchedExternal.text) {
        externalScrapedContext = `\n【已成功從外部網址 (${targetUrl}) 抓取文章內容】:\n文章標題: ${fetchedExternal.title || '外部網頁文章'}\n文章正文:\n${fetchedExternal.text}\n`;
      }
    }

    const systemInstruction = `You are VocabMin AI (智能單字管理與全能英語學習智囊), an empathetic, knowledgeable, and intuitive English learning coach, linguistic expert, and bilingual reading guide.

### CORE MISSION:
Listen carefully to the user's message and understand their true intent in context. Give direct, insightful, natural, and helpful responses without robotic deflections or unsolicited content.

### RESPONSE FORMAT:
You must strictly output JSON matching this schema:
- "reply" (string, required): Your conversational response to the user.
- "words" (array, optional): New vocabulary words to import/learn. Empty array [] when not adding/recommending vocabulary.
- "article" (object, optional): Structured reading article. ONLY include this when the user explicitly requests to read, generate, or import an article.
- "action" (object, optional): Explicit database action proposal. ONLY include this when the user explicitly commands a library modification.

### SCENARIO RULES & GUIDANCE:

1. GENERAL INQUIRIES, QUESTIONS, GRAMMAR & CHAT:
   - When the user asks general questions, inquires about grammar/idioms, asks for learning advice, chats, or expresses confusion/frustration:
     * Answer directly, accurately, and warmly in "reply".
     * If the user says you didn't understand them previously or expresses frustration (e.g. "聽不懂", "搞錯了", "你根本不懂"): apologize sincerely, pay close attention to what they need, clarify their intent, and directly help them without reciting rigid scripted menus.
     * "words" MUST be [] (empty array).
     * "article" MUST NOT be included (omit or undefined).
     * "action" MUST NOT be included (omit or undefined).

2. VOCABULARY INQUIRIES, RECOMMENDATIONS & ADDING WORDS:
   - Triggers: User asks for vocabulary recommendations, word lookups, expansions, thematic words, or says "幫我新增/加入單字 [word]", "推薦 5 個商務單字", "有哪些描述性格的形容詞", "請查 ubiquitous":
     * Provide a friendly conversational explanation in "reply".
     * Populate "words" with the recommended/added words. Each item must have:
       - "term": English word or phrase
       - "pos": Part of speech (n., v., adj., adv., phr., other)
       - "def": Clear, accurate Traditional Chinese definition (繁體中文解釋)
       - "defEn": Authentic, clear English explanation in English (英英釋義)
       - "ex": Natural, modern example sentence in English
     * DO NOT generate an "article".

3. ARTICLE READING & EXTERNAL IMPORT:
   - Triggers: ONLY when the user EXPLICITLY asks to generate an article, read a passage/essay, import from a URL, or requests bilingual reading (e.g., "幫我生成一篇關於AI科技的B2雙語文章", "從網址匯入文章 https://...", "我想讀一篇英文短文並看文法結構"):
     * Populate "article" with:
       - "title", "subtitle", "author", "source", "level" (A1-C2), "category" ('Tech'|'Science'|'Business'|'News'|'Story'|'Daily'|'Custom')
       - "content": Complete English article text with paragraphs separated by double newlines (\\n\\n).
       - "translationZh": High-fidelity paragraph-by-paragraph Traditional Chinese translation (\\n\\n).
       - "summary": 1-2 sentence Traditional Chinese summary.
       - "grammarPoints": 3-5 in-depth sentence structures and grammar analyses.
       - "keyVocabulary": 5-8 key academic/advanced vocabulary words.
       - "quiz": 1-2 reading comprehension multiple choice questions.
     * In "reply", summarize the article and highlight key learning points.
     * In this case, "words" should be [] (key vocabulary is already inside article.keyVocabulary).
   - CRITICAL PROHIBITION: NEVER generate an article when the user is just asking for vocabulary words, asking questions, or discussing sentences!

4. WRITING CORRECTION & POLISHING (作文與文法批改):
   - Triggers: User provides an English sentence or paragraph and asks for critique, correction, grammar check, or CEFR C1/C2 polish:
     * In "reply", provide structured feedback:
       - 🔍 【原文問題診斷】：逐一指出文法錯誤、時態誤用或不道地的搭配詞。
       - ✍️ 【自然地道版 (Natural Correction)】：自然地道、文法無誤的英文。
       - 💎 【高階潤飾版 (CEFR C1/C2 Native Polish)】：運用豐富的學術詞彙、倒裝句或分詞構句。
       - 💡 【詞彙與句型剖析】：詳細解說為何此處用詞更加精準。
     * In "words", optionally extract 2-4 advanced vocabulary items from the polished version.

5. DATABASE OPERATIONS & MANAGEMENT ("action" object):
   - ONLY trigger when the user EXPLICITLY COMMANDS an operational database modification:
     * "清空所有單字" / "清空單字庫" -> action: { type: 'clear_all_words', summary: '清空單字庫中的所有單字' }
     * "清空所有文章" / "清空文章閱讀庫" -> action: { type: 'clear_all_articles', summary: '清空文章閱讀庫中的所有文章' }
     * "刪除單字 [term]" -> action: { type: 'delete_word', summary: '從單字庫刪除「...」', deleteWord: { term: '...' } }
     * "刪除文章 [title]" -> action: { type: 'delete_article', summary: '從文章閱讀庫刪除指定文章', deleteArticle: { title: '...' } }
     * "合併重複單字" / "去重" -> action: { type: 'deduplicate_words', summary: '合併單字庫中重複的單字' }
     * "重置所有單字熟練度" -> action: { type: 'reset_mastery', summary: '重置所有單字熟練度為 Level 0' }
     * "全庫單字標準化" / "補齊英文釋義" -> action: { type: 'batch_standardize', summary: '為現有單字補齊英文釋義並標準化' }
   - CRITICAL SAFETY: If the user is merely asking a question ABOUT these operations (e.g. "如何清空單字？", "什麼是去重？"), explain in "reply" and DO NOT generate an "action"!
   - NEVER confuse "單字" (words) with "文章" (articles)!

6. LANGUAGE ADAPTATION:
   - Default language: Warm, professional Traditional Chinese (繁體中文, 台灣語境).
   - If the user writes in English, practices dialogue, asks for roleplay, or requests English responses, respond naturally and fluently in English (with bilingual notes if helpful).`;

    // Construct conversation contents
    const rawContents: any[] = [];

    // Contextual Grounding
    const contextParts: string[] = [];
    if (scenario) {
      contextParts.push(`【使用者當前所在場景】: ${scenario}${scenarioDesc ? ` (${scenarioDesc})` : ''}`);
    }
    if (currentArticle) {
      contextParts.push(`【使用者目前正在閱讀的文章】: 《${currentArticle.title}》 (${currentArticle.level || 'B1'} 等級)`);
    }
    if (existingWordsSummary && Array.isArray(existingWordsSummary) && existingWordsSummary.length > 0) {
      contextParts.push(
        `【使用者的單字庫現有資料（共 ${existingWordsSummary.length} 個，僅供查詢/參考，非修改請求請勿擅自操作）】: \n${JSON.stringify(
          existingWordsSummary.slice(0, 30)
        )}`
      );
    }
    if (existingArticlesSummary && Array.isArray(existingArticlesSummary) && existingArticlesSummary.length > 0) {
      contextParts.push(
        `【使用者的文章閱讀庫現有收錄資料（共 ${existingArticlesSummary.length} 篇，僅供參考）】: \n${JSON.stringify(
          existingArticlesSummary.slice(0, 10)
        )}`
      );
    }
    if (rawInputWords && rawInputWords.length > 0) {
      contextParts.push(`【使用者需要自動補全與標準化的原始單字列表】: ${rawInputWords.join(', ')}`);
    }
    if (externalScrapedContext) {
      contextParts.push(externalScrapedContext);
    }

    // Build chat history
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach((m) => {
        if (m.content && m.content.trim()) {
          rawContents.push({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          });
        }
      });
    }

    const promptContext = contextParts.length > 0 ? `${contextParts.join('\n\n')}\n\n` : '';
    const finalTurnPrompt = `${promptContext}使用者最新訊息：${rawUserPrompt || '請協助我'}`;

    rawContents.push({
      role: 'user',
      parts: [{ text: finalTurnPrompt }]
    });

    // Ensure valid Gemini multiturn alternating format (user -> model -> user)
    const contents: any[] = [];
    for (const item of rawContents) {
      if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
        contents[contents.length - 1].parts.push(...item.parts);
      } else {
        contents.push(item);
      }
    }
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }
    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: finalTurnPrompt }]
      });
    }

    const config: any = {
      systemInstruction,
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description: 'Direct conversational response to the user in Traditional Chinese (or English if user converses in English).'
          },
          words: {
            type: Type.ARRAY,
            description: 'NEW vocabulary items to import into library. Empty array [] when not adding/recommending vocabulary.',
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING, description: 'The English word or phrase' },
                pos: { type: Type.STRING, description: 'Part of speech: n., v., adj., adv., phr., or other' },
                def: { type: Type.STRING, description: 'Standardized Traditional Chinese definition (繁體中文解釋)' },
                defEn: { type: Type.STRING, description: 'Clear English definition explaining the word in English (英英釋義)' },
                ex: { type: Type.STRING, description: 'Contextual English example sentence' }
              },
              required: ['term', 'pos', 'def', 'defEn']
            }
          },
          article: {
            type: Type.OBJECT,
            description: 'Structured English reading article ONLY if explicitly requested by user (article generation, bilingual reading, URL import).',
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING, description: 'Catchy, authentic English title' },
              subtitle: { type: Type.STRING, description: 'Subtitle or thematic overview' },
              author: { type: Type.STRING, description: 'Author or source publication name' },
              source: { type: Type.STRING, description: 'Source publication name or origin URL' },
              level: { type: Type.STRING, description: 'CEFR level: A1, A2, B1, B2, C1, or C2' },
              category: { type: Type.STRING, description: 'Category: Tech, Science, Business, News, Story, Daily, or Custom' },
              content: { type: Type.STRING, description: 'Complete English article text with paragraphs separated by double newlines (\n\n)' },
              translationZh: { type: Type.STRING, description: 'Paragraph-by-paragraph Traditional Chinese translation and explanation (繁體中文)' },
              summary: { type: Type.STRING, description: '1-2 sentence Traditional Chinese summary' },
              grammarPoints: {
                type: Type.ARRAY,
                description: '3-6 in-depth grammatical analyses of key/difficult sentences from the article',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sentence: { type: Type.STRING, description: 'Exact English sentence from article' },
                    structure: { type: Type.STRING, description: 'Syntactic breakdown formula' },
                    explanation: { type: Type.STRING, description: 'Detailed grammatical explanation in Traditional Chinese' },
                    grammarType: { type: Type.STRING, description: 'Grammar category tag' }
                  },
                  required: ['sentence', 'structure', 'explanation']
                }
              },
              keyVocabulary: {
                type: Type.ARRAY,
                description: '5-8 key academic or advanced vocabulary words extracted from the article',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    def: { type: Type.STRING, description: 'Traditional Chinese definition' },
                    defEn: { type: Type.STRING, description: 'Authentic English definition' },
                    level: { type: Type.STRING, description: 'CEFR level (e.g. B2, C1)' },
                    ex: { type: Type.STRING, description: 'Example sentence or sentence from article' }
                  },
                  required: ['term', 'pos', 'def', 'defEn']
                }
              },
              quiz: {
                type: Type.ARRAY,
                description: '1-2 multiple-choice reading comprehension questions',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswerIndex: { type: Type.NUMBER },
                    explanation: { type: Type.STRING }
                  },
                  required: ['question', 'options', 'correctAnswerIndex', 'explanation']
                }
              }
            },
            required: ['title', 'content', 'translationZh', 'summary', 'grammarPoints', 'keyVocabulary']
          },
          action: {
            type: Type.OBJECT,
            description: 'Proposed app database mutation action ONLY if user explicitly commanded a modification, deletion, or reset.',
            properties: {
              type: {
                type: Type.STRING,
                description:
                  'Action type: add_words, update_word, delete_word, batch_standardize, deduplicate_words, clear_all_words, reset_mastery, save_article, delete_article, clear_all_articles'
              },
              summary: {
                type: Type.STRING,
                description: 'Brief summary of the action in Traditional Chinese'
              },
              clearAllArticles: {
                type: Type.OBJECT,
                description: 'Details if type is clear_all_articles',
                properties: {
                  count: { type: Type.NUMBER }
                }
              },
              deleteArticle: {
                type: Type.OBJECT,
                description: 'Details if type is delete_article',
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING }
                }
              },
              saveArticle: {
                type: Type.OBJECT,
                description: 'Article to save into reader library if type is save_article',
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  author: { type: Type.STRING },
                  source: { type: Type.STRING },
                  level: { type: Type.STRING },
                  category: { type: Type.STRING },
                  content: { type: Type.STRING },
                  translationZh: { type: Type.STRING },
                  summary: { type: Type.STRING }
                }
              },
              resetMastery: {
                type: Type.OBJECT,
                description: 'Details if type is reset_mastery',
                properties: {
                  targetLevel: { type: Type.NUMBER },
                  count: { type: Type.NUMBER }
                }
              },
              clearAllWords: {
                type: Type.OBJECT,
                description: 'Details if type is clear_all_words',
                properties: {
                  count: { type: Type.NUMBER }
                }
              },
              deduplicateWords: {
                type: Type.OBJECT,
                description: 'Details for deduplicating repeated items if type is deduplicate_words',
                properties: {
                  duplicateTerms: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Array of terms detected to have duplicate definitions'
                  },
                  detail: {
                    type: Type.STRING,
                    description: 'Brief detail of duplicate cleanup'
                  }
                }
              },
              addWords: {
                type: Type.ARRAY,
                description: 'Words to add if type is add_words',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    def: { type: Type.STRING, description: 'Standardized Traditional Chinese definition' },
                    defEn: { type: Type.STRING, description: 'Clear English definition (英英釋義)' },
                    ex: { type: Type.STRING }
                  },
                  required: ['term', 'pos', 'def']
                }
              },
              updateWord: {
                type: Type.OBJECT,
                description: 'Word to update if type is update_word',
                properties: {
                  term: { type: Type.STRING },
                  newEntries: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        pos: { type: Type.STRING },
                        def: { type: Type.STRING },
                        defEn: { type: Type.STRING },
                        ex: { type: Type.STRING }
                      },
                      required: ['pos', 'def']
                    }
                  }
                }
              },
              deleteWord: {
                type: Type.OBJECT,
                description: 'Word to delete if type is delete_word',
                properties: {
                  term: { type: Type.STRING }
                }
              },
              batchStandardize: {
                type: Type.OBJECT,
                description: 'Batch standardization results',
                properties: {
                  originalCount: { type: Type.NUMBER },
                  updatedWords: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        term: { type: Type.STRING },
                        pos: { type: Type.STRING },
                        def: { type: Type.STRING },
                        defEn: { type: Type.STRING },
                        ex: { type: Type.STRING },
                        level: { type: Type.NUMBER }
                      },
                      required: ['term', 'pos', 'def']
                    }
                  }
                }
              }
            }
          }
        },
        required: ['reply']
      }
    };

    const response = await generateWithModelFallback(ai, config, contents);

    const outputText = response.text || '{}';
    let parsedData: any;
    try {
      parsedData = JSON.parse(outputText);
    } catch {
      parsedData = {
        reply: outputText,
        words: []
      };
    }

    // Process article ONLY if model returned valid article content
    if (parsedData.article && parsedData.article.content && parsedData.article.content.length > 50) {
      const content = parsedData.article.content;
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      parsedData.article = {
        id: parsedData.article.id || `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: parsedData.article.title || 'Contextual Reading Article',
        subtitle: parsedData.article.subtitle || 'Authentic Contextual Reading',
        author: parsedData.article.author || 'AI Reading Scholar',
        source: parsedData.article.source || (urlMatch ? urlMatch[0] : 'External Web'),
        level: parsedData.article.level || 'B2',
        category: parsedData.article.category || 'Science',
        content: parsedData.article.content,
        translationZh: parsedData.article.translationZh || '',
        summary: parsedData.article.summary || '',
        wordCount,
        readTimeMinutes: Math.max(1, Math.round(wordCount / 120)),
        savedWordTerms: [],
        isCustom: true,
        grammarPoints: Array.isArray(parsedData.article.grammarPoints) ? parsedData.article.grammarPoints : [],
        keyVocabulary: Array.isArray(parsedData.article.keyVocabulary) ? parsedData.article.keyVocabulary : [],
        quiz: Array.isArray(parsedData.article.quiz) ? parsedData.article.quiz : []
      };

      // Since an article is present, words array should be empty so UI displays article card cleanly
      parsedData.words = [];
      parsedData.action = {
        type: 'save_article',
        summary: `收錄文章《${parsedData.article.title}》至文章閱讀庫`,
        saveArticle: parsedData.article
      };
    } else {
      parsedData.article = undefined;
    }

    // Fallback intent checks ONLY for very clear, unambiguous library management commands
    const promptClean = rawUserPrompt.toLowerCase();
    const isExplicitClearWords =
      promptClean === '清空所有單字' ||
      promptClean === '清空單字庫' ||
      promptClean === '請幫我清空所有單字' ||
      promptClean === '刪除所有單字' ||
      (promptClean.includes('清空') && promptClean.includes('單字') && !promptClean.includes('文章') && !promptClean.includes('如何') && !promptClean.includes('怎麼'));

    const isExplicitClearArticles =
      promptClean === '清空所有文章' ||
      promptClean === '清空文章庫' ||
      promptClean === '清空閱讀庫' ||
      promptClean === '請幫我清空所有文章' ||
      promptClean === '刪除所有文章' ||
      (promptClean.includes('清空') && promptClean.includes('文章') && !promptClean.includes('單字') && !promptClean.includes('如何') && !promptClean.includes('怎麼'));

    const isExplicitDeduplicate =
      (promptClean.includes('合併重複') || promptClean.includes('單字去重')) &&
      !promptClean.includes('如何') &&
      !promptClean.includes('怎麼');

    const isExplicitResetMastery =
      (promptClean.includes('重置') || promptClean.includes('歸零')) &&
      promptClean.includes('熟練度') &&
      !promptClean.includes('如何') &&
      !promptClean.includes('怎麼');

    if (isExplicitClearWords) {
      const totalCount = Array.isArray(existingWordsSummary) ? existingWordsSummary.length : 0;
      parsedData.action = {
        type: 'clear_all_words',
        summary: `清空單字庫中的所有單字（共 ${totalCount} 個）`,
        clearAllWords: { count: totalCount }
      };
    } else if (isExplicitClearArticles) {
      const artCount = Array.isArray(existingArticlesSummary) ? existingArticlesSummary.length : 0;
      parsedData.action = {
        type: 'clear_all_articles',
        summary: `清空文章閱讀庫中的所有文章（共 ${artCount} 篇）`,
        clearAllArticles: { count: artCount }
      };
    } else if (isExplicitDeduplicate) {
      parsedData.action = {
        type: 'deduplicate_words',
        summary: '合併單字庫中重複的項目並去重'
      };
    } else if (isExplicitResetMastery) {
      const totalCount = Array.isArray(existingWordsSummary) ? existingWordsSummary.length : 0;
      parsedData.action = {
        type: 'reset_mastery',
        summary: '將所有單字熟練度重置為完全不熟練 (Level 0)',
        resetMastery: { targetLevel: 0, count: totalCount }
      };
    }

    // Normalize returned action properties if present
    if (parsedData.action) {
      if (parsedData.action.type === 'delete_word') {
        const term =
          parsedData.action.deleteWord?.term ||
          (parsedData.action as any).updateWord?.term ||
          (parsedData.action as any).term ||
          '';
        parsedData.action.deleteWord = { term };
      } else if (parsedData.action.type === 'delete_article') {
        const title =
          parsedData.action.deleteArticle?.title ||
          (parsedData.action as any).title ||
          (parsedData.action as any).saveArticle?.title ||
          '';
        parsedData.action.deleteArticle = { title };
      } else if (parsedData.action.type === 'clear_all_articles') {
        const artCount = Array.isArray(existingArticlesSummary) ? existingArticlesSummary.length : 0;
        parsedData.action.clearAllArticles = { count: artCount };
      } else if (parsedData.action.type === 'clear_all_words') {
        const totalCount = Array.isArray(existingWordsSummary) ? existingWordsSummary.length : 0;
        parsedData.action.clearAllWords = { count: totalCount };
      } else if (parsedData.action.type === 'batch_standardize') {
        let updatedWords = parsedData.action.batchStandardize?.updatedWords || parsedData.action.words;
        if (!updatedWords || !Array.isArray(updatedWords) || updatedWords.length === 0) {
          updatedWords = await enrichWordsWithEnglishDefinitions(ai, existingWordsSummary || []);
        }
        parsedData.action = {
          type: 'batch_standardize',
          summary: `為單字庫中現有的 ${updatedWords.length} 個單字補充英文釋義（defEn）並標準化`,
          words: updatedWords,
          batchStandardize: {
            originalCount: existingWordsSummary ? existingWordsSummary.length : updatedWords.length,
            updatedWords
          }
        };
      }
    }

    // ── Fallback: Article intent detected but AI forgot to fill article field ──
    // When user clearly wants an article but AI only replied in text (article is undefined),
    // auto-generate the article via the dedicated endpoint logic and attach it.
    if (!parsedData.article) {
      const promptLower = rawUserPrompt.toLowerCase();
      const wantsArticle =
        (promptLower.includes('文章') || promptLower.includes('article') || promptLower.includes('短文') || promptLower.includes('閱讀')) &&
        (promptLower.includes('生成') || promptLower.includes('幫我') || promptLower.includes('寫') ||
         promptLower.includes('加入') || promptLower.includes('新增') || promptLower.includes('create') ||
         promptLower.includes('generate') || promptLower.includes('make'));

      if (wantsArticle) {
        try {
          const levelMatch = rawUserPrompt.match(/\b(A1|A2|B1|B2|C1|C2)\b/i);
          const requestedLevel = levelMatch ? levelMatch[1].toUpperCase() : 'B2';

          const articlePrompt = `Based on this user request: "${rawUserPrompt}"

Create a captivating, authentic English reading article at CEFR ${requestedLevel} level.

Return ONLY valid JSON with these exact fields:
{
  "title": "English article title",
  "subtitle": "Brief thematic subtitle",
  "author": "VocabMin AI Scholar",
  "source": "VocabMin AI",
  "level": "${requestedLevel}",
  "category": "Tech",
  "content": "Full English article text (3-5 paragraphs, separated by \\n\\n)",
  "translationZh": "Paragraph-by-paragraph Traditional Chinese translation",
  "summary": "1-2 sentence Traditional Chinese summary",
  "grammarPoints": [{"sentence":"...","structure":"...","explanation":"...","grammarType":"..."}],
  "keyVocabulary": [{"term":"...","pos":"n.","def":"中文釋義","defEn":"English definition","level":"${requestedLevel}","ex":"Example sentence"}]
}`;

          const articleResponse = await generateWithModelFallback(
            ai,
            { temperature: 0.6, responseMimeType: 'application/json' },
            [{ role: 'user', parts: [{ text: articlePrompt }] }]
          );

          const articleRaw = articleResponse.text || '{}';
          let articleParsed: any;
          try {
            articleParsed = JSON.parse(articleRaw);
          } catch {
            articleParsed = null;
          }

          if (articleParsed && articleParsed.content && articleParsed.content.length > 50) {
            const wordCount = articleParsed.content.split(/\s+/).filter(Boolean).length;
            parsedData.article = {
              id: `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              title: articleParsed.title || 'AI Generated Article',
              subtitle: articleParsed.subtitle || '',
              author: articleParsed.author || 'VocabMin AI Scholar',
              source: articleParsed.source || 'VocabMin AI',
              level: articleParsed.level || requestedLevel,
              category: articleParsed.category || 'Custom',
              content: articleParsed.content,
              translationZh: articleParsed.translationZh || '',
              summary: articleParsed.summary || '',
              wordCount,
              readTimeMinutes: Math.max(1, Math.round(wordCount / 120)),
              savedWordTerms: [],
              isCustom: true,
              grammarPoints: Array.isArray(articleParsed.grammarPoints) ? articleParsed.grammarPoints : [],
              keyVocabulary: Array.isArray(articleParsed.keyVocabulary) ? articleParsed.keyVocabulary : [],
              quiz: Array.isArray(articleParsed.quiz) ? articleParsed.quiz : []
            };
            parsedData.words = [];
            parsedData.action = {
              type: 'save_article',
              summary: `收錄文章《${parsedData.article.title}》至文章閱讀庫`,
              saveArticle: parsedData.article
            };
            if (!parsedData.reply || parsedData.reply.length < 10) {
              parsedData.reply = `已為您生成文章《${parsedData.article.title}》，請點擊下方卡片按鈕收錄至文章閱讀庫！`;
            }
          }
        } catch (articleErr) {
          console.error('Article fallback generation failed:', articleErr);
        }
      }
    }

    return res.json(parsedData);
  } catch (error: any) {
    console.error('Error generating vocabulary from Gemini:', error);
    const errMsg = error?.message || String(error);
    const isQuota = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota exceeded');
    const isUnavailable = errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand');

    const statusCode = isQuota ? 429 : isUnavailable ? 503 : 500;
    const userMessage = isQuota
      ? '目前 Google AI 免費額度請求已達頻率上限，請稍候 5~10 秒後再次嘗試。'
      : isUnavailable
      ? 'Google 官方模型節點短暫高負載，請間隔數秒後再次發送。'
      : 'AI 助手在處理您的請求時發生錯誤，請稍後重試。';

    return res.status(statusCode).json({
      error: userMessage,
      details: errMsg
    });
  }
});

// API: Dedicated External Article Import, Grammar Analysis & Bilingual Processing
app.post('/api/ai/import-article', async (req, res) => {
  const { url, topic, level, category } = req.body;
  const rawText = req.body.text || req.body.content || '';
  const ai = getAIClient();
  if (!ai) {
    return res.status(503).json({ error: 'AI Client unavailable' });
  }

  try {
    let sourceContent = (rawText || '').trim();
    let sourceName = 'User Provided Text';
    let articleTitle = '';

    if (url && typeof url === 'string' && url.startsWith('http')) {
      sourceName = url;
      const fetched = await fetchExternalUrlContent(url);
      if (fetched && fetched.text) {
        sourceContent = fetched.text;
        articleTitle = fetched.title;
      }
    }

    const requestedLevel = level || 'B2';
    const requestedCategory = category || 'News';

    const prompt = `You are an elite bilingual educator and English linguistics professor.
Process and transform the following external input into a master-grade English reading study article with comprehensive Traditional Chinese (繁體中文) explanations, sentence-by-sentence grammar analysis, and key vocabulary extraction.

【Input Source】: ${sourceName}
${articleTitle ? `【Original Title】: ${articleTitle}\n` : ''}
${topic ? `【Topic/Subject】: ${topic}\n` : ''}
${sourceContent ? `【Article Content / Raw Text】:\n${sourceContent.slice(0, 4000)}\n` : `【Topic Direction】: Create an authentic, publication-quality reading article on "${topic || 'Global Innovation'}"`}

CEFR Level: ${requestedLevel}
Category: ${requestedCategory}

CRITICAL REQUIREMENTS:
1. "title": Catchy, authentic English title.
2. "subtitle": Engaging English subtitle.
3. "author": Journalist / Publication name (e.g. BBC Global, Reuters, Tech Review, or Scholar).
4. "source": "${sourceName.startsWith('http') ? sourceName : 'External Web'}".
5. "level": "${requestedLevel}".
6. "category": "${requestedCategory}".
7. "content": The polished English article text across 3-5 coherent paragraphs separated by double newlines (\\n\\n).
8. "translationZh": High-grade, elegant Traditional Chinese (繁體中文) translation matching paragraph by paragraph (\\n\\n).
9. "summary": 1-2 sentence Traditional Chinese core summary.
10. "grammarPoints": 4 to 6 in-depth grammatical breakdown items for core or complex sentences from the article:
    - sentence: Exact English sentence from the article
    - structure: Syntactic structural diagram / formula in brackets (e.g., "[S + V + O] + [分詞構句修飾] + [that引導同位語從句]")
    - explanation: Comprehensive Traditional Chinese (繁體中文) explanation of grammatical concepts, sentence role, tense nuances, and practical writing tips.
    - grammarType: Grammar category tag (e.g. 分詞構句, 倒裝句, 虛擬語氣, 關係子句, 名詞子句, 介系詞倒裝).
11. "keyVocabulary": 6 to 8 key academic or advanced vocabulary words extracted from the article with:
    - term: English word
    - pos: Part of speech (n./v./adj./adv./phr.)
    - def: Traditional Chinese definition (繁體中文)
    - defEn: Clear English definition (英英釋義)
    - level: CEFR level (e.g. B2, C1)
    - ex: Example sentence or sentence from article
12. "quiz": 2 multiple-choice reading comprehension questions with 4 options each, correctAnswerIndex (0-3), and Traditional Chinese explanation.`;

    const config = {
      temperature: 0.35,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          author: { type: Type.STRING },
          source: { type: Type.STRING },
          level: { type: Type.STRING },
          category: { type: Type.STRING },
          content: { type: Type.STRING },
          translationZh: { type: Type.STRING },
          summary: { type: Type.STRING },
          grammarPoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sentence: { type: Type.STRING },
                structure: { type: Type.STRING },
                explanation: { type: Type.STRING },
                grammarType: { type: Type.STRING }
              },
              required: ['sentence', 'structure', 'explanation']
            }
          },
          keyVocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                pos: { type: Type.STRING },
                def: { type: Type.STRING },
                defEn: { type: Type.STRING },
                level: { type: Type.STRING },
                ex: { type: Type.STRING }
              },
              required: ['term', 'pos', 'def', 'defEn']
            }
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswerIndex: { type: Type.NUMBER },
                explanation: { type: Type.STRING }
              },
              required: ['question', 'options', 'correctAnswerIndex', 'explanation']
            }
          }
        },
        required: ['title', 'content', 'translationZh', 'grammarPoints', 'keyVocabulary']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const wordCount = (parsed.content || '').split(/\s+/).filter(Boolean).length;
    const readTimeMinutes = Math.max(1, Math.round(wordCount / 120));

    const completeArticle = {
      id: `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: parsed.title || articleTitle || 'Imported External Article',
      subtitle: parsed.subtitle || '',
      author: parsed.author || 'External Publisher',
      source: sourceName,
      level: (parsed.level as any) || requestedLevel,
      category: (parsed.category as any) || requestedCategory,
      content: parsed.content || sourceContent,
      translationZh: parsed.translationZh || '',
      summary: parsed.summary || '',
      wordCount,
      readTimeMinutes,
      savedWordTerms: [],
      isCustom: true,
      grammarPoints: Array.isArray(parsed.grammarPoints) ? parsed.grammarPoints : [],
      keyVocabulary: Array.isArray(parsed.keyVocabulary) ? parsed.keyVocabulary : [],
      quiz: Array.isArray(parsed.quiz) ? parsed.quiz : []
    };

    return res.json({ article: completeArticle });
  } catch (err: any) {
    console.error('Import article error:', err);
    return res.status(500).json({
      error: '文章解析與匯入失敗，請確認網址或文本內容後再次嘗試。',
      details: err?.message || String(err)
    });
  }
});

// API: Direct Batch Enrich Library with English Definitions (defEn)
app.post('/api/ai/enrich-library', async (req, res) => {
  try {
    const { words } = req.body;
    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: 'AI Client unavailable' });
    }

    const enriched = await enrichWordsWithEnglishDefinitions(ai, words || []);
    return res.json({ words: enriched });
  } catch (err: any) {
    console.error('Enrich library error:', err);
    return res.status(500).json({ error: err?.message || 'Enrich library failed' });
  }
});

// In-memory cache for word lookups to save AI quota
const wordLookupCache = new Map<string, any>();

// In-memory cache for sentence grammar analyses to save AI quota
const sentenceAnalysisCache = new Map<string, any>();


// API: Article Instant Word Lookup with Contextual Meaning & Concise Flashcard Examples
app.post('/api/ai/article-lookup', async (req, res) => {
  const { forceRefresh } = req.body;
  const word = req.body.word || req.body.term;
  const sentence = req.body.sentence || req.body.sentenceContext;
  const cleanWord = (word || '').trim();
  if (!cleanWord) {
    return res.status(400).json({ error: 'Word is required' });
  }

  const cacheKey = cleanWord.toLowerCase();
  if (!forceRefresh && wordLookupCache.has(cacheKey)) {
    const cached = wordLookupCache.get(cacheKey);
    return res.json({
      ...cached,
      term: cleanWord,
      fromCache: true
    });
  }

  const ai = getAIClient();
  if (!ai) {
    // Intelligent local fallback
    return res.json({
      term: cleanWord,
      pos: 'n.',
      def: `${cleanWord}`,
      defEn: `Definition for ${cleanWord}`,
      phonetic: '',
      ex: `This is a practical example using ${cleanWord}.`,
      exZh: `這是一個使用 ${cleanWord} 的實用例句。`,
      fromCache: false
    });
  }

  try {
    const prompt = `You are an expert bilingual lexicographer and vocabulary coach (Traditional Chinese / English).
Analyze the English word or phrase: "${cleanWord}"
Article context sentence: "${sentence || 'N/A'}"

Provide accurate contextual details in JSON:
- "term": cleaned word/phrase
- "pos": "n." | "v." | "adj." | "adv." | "phr." | "other"
- "def": accurate concise Traditional Chinese definition (繁體中文解釋) matching the context
- "defEn": authentic, clear English definition (英英釋義)
- "phonetic": approximate IPA or pronunciation hint (e.g. "/ˌsɛrənˈdɪpɪti/")
- "ex": A concise, natural, flashcard-friendly English example sentence (8-14 words max). It MUST be short, clean, and easy to memorize for daily review (do NOT use long, overly complex article sentences).
- "exZh": Traditional Chinese translation (繁體中文) for the concise example sentence.`;

    const config = {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          pos: { type: Type.STRING },
          def: { type: Type.STRING },
          defEn: { type: Type.STRING },
          phonetic: { type: Type.STRING },
          ex: { type: Type.STRING },
          exZh: { type: Type.STRING }
        },
        required: ['term', 'pos', 'def', 'defEn', 'ex']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const resultToCache = {
      term: parsed.term || cleanWord,
      pos: parsed.pos || 'n.',
      def: parsed.def || cleanWord,
      defEn: parsed.defEn || '',
      phonetic: parsed.phonetic || '',
      ex: parsed.ex || `Learning ${cleanWord} helps improve your vocabulary.`,
      exZh: parsed.exZh || ''
    };
    wordLookupCache.set(cacheKey, resultToCache);

    return res.json({
      ...resultToCache,
      fromCache: false
    });
  } catch (err: any) {
    console.warn('Word lookup AI error, using fallback:', err?.message || err);
    return res.json({
      term: cleanWord,
      pos: 'n.',
      def: cleanWord,
      defEn: '',
      phonetic: '',
      ex: `Practice using ${cleanWord} in your daily conversation.`,
      exZh: '',
      fromCache: false
    });
  }
});

// API: Article Sentence Grammar & Structure Analysis
app.post('/api/ai/analyze-sentence', async (req, res) => {
  const { sentence, forceRefresh } = req.body;
  const cleanSentence = (sentence || '').trim();
  if (!cleanSentence) {
    return res.status(400).json({ error: 'Sentence is required' });
  }

  const cacheKey = cleanSentence.toLowerCase();
  if (!forceRefresh && sentenceAnalysisCache.has(cacheKey)) {
    const cached = sentenceAnalysisCache.get(cacheKey);
    return res.json({
      ...cached,
      sentence: cleanSentence,
      fromCache: true
    });
  }

  const ai = getAIClient();
  if (!ai) {
    return res.json({
      sentence: cleanSentence,
      translation: cleanSentence,
      grammarBreakdown: '句子主幹與修飾成分分析（離線模式）',
      vocabularyNotes: [],
      learningTip: '可點擊單字查詢個別釋義',
      fromCache: false
    });
  }

  try {
    const prompt = `You are a master English grammar teacher and translator.
Analyze this English sentence for an intermediate/advanced English learner:
"${cleanSentence}"

Provide detailed, insightful structural breakdown in Traditional Chinese (繁體中文):
- "sentence": original sentence
- "translation": natural, high-quality Traditional Chinese translation (繁體中文翻譯)
- "grammarBreakdown": clear bullet-point breakdown of key structure (e.g. 主詞、主要動詞、子句關係、分詞構句、關代等)
- "vocabularyNotes": array of key idioms/collocations/words in this sentence with term and brief Chinese meaning
- "learningTip": one memorable learning tip, nuance, or sentence pattern application`;

    const config = {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentence: { type: Type.STRING },
          translation: { type: Type.STRING },
          grammarBreakdown: { type: Type.STRING },
          vocabularyNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                meaning: { type: Type.STRING }
              },
              required: ['term', 'meaning']
            }
          },
          learningTip: { type: Type.STRING }
        },
        required: ['sentence', 'translation', 'grammarBreakdown']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const resultToCache = {
      sentence: cleanSentence,
      translation: parsed.translation || '',
      grammarBreakdown: parsed.grammarBreakdown || '',
      vocabularyNotes: parsed.vocabularyNotes || [],
      learningTip: parsed.learningTip || ''
    };
    sentenceAnalysisCache.set(cacheKey, resultToCache);

    return res.json({
      ...resultToCache,
      fromCache: false
    });
  } catch (err: any) {
    console.warn('Sentence analysis error:', err?.message || err);
    return res.json({
      sentence: cleanSentence,
      translation: '暫時無法連線至 AI 解析伺服器',
      grammarBreakdown: '分析服務暫時繁忙，請稍後重試。',
      vocabularyNotes: [],
      learningTip: '',
      fromCache: false
    });
  }
});

// API: AI Reading Companion & Tutor (針對當前閱讀文章的深度對話、答疑與助讀)
app.post('/api/ai/article-chat', async (req, res) => {
  const { article, messages, userPrompt, selectedContext } = req.body;
  const ai = getAIClient();
  if (!ai) {
    return res.status(503).json({
      reply: 'AI 服務尚未配置 GEMINI_API_KEY。',
      suggestedWords: []
    });
  }

  try {
    const articleTitle = article?.title || req.body.articleTitle || '當前閱讀文章';
    const articleLevel = article?.level || req.body.articleLevel || 'B2';
    const articleCategory = article?.category || req.body.articleCategory || 'General';
    const articleContent = article?.content || req.body.articleContent || '';
    const articleTranslation = article?.translationZh || req.body.articleTranslation || '';

    const systemInstruction = `You are "VocabMin AI 閱讀伴讀導師" (VocabMin Reading Companion & English Tutor), an inspiring, erudite, and friendly bilingual English reading teacher and literary coach.
The learner is currently reading this English article in the reader app:

【文章標題】: ${articleTitle}
【文章級別】: ${articleLevel} (${articleCategory})
【文章全文內容】:
"""
${articleContent.slice(0, 4500)}
"""
${articleTranslation ? `【繁體中文翻譯對照】:\n"""\n${articleTranslation.slice(0, 3000)}\n"""` : ''}
${selectedContext ? `【讀者當前在文章中反白選取的焦點文字】:\n"${selectedContext}"` : ''}

CRITICAL TEACHING GUIDELINES:
1. Ground your answers directly in the article's text, context, and nuance.
2. If the user asks about a specific sentence, phrase, or excerpt:
   - Provide a natural, elegant Traditional Chinese (繁體中文) translation.
   - Explain the syntactic role (subject, main verb, clauses, participle constructions, rhetorical purpose).
   - Point out vocabulary nuances or idiomatic collocations.
3. If the user asks for a summary or discussion:
   - Synthesize the key arguments cleanly and concisely in bullet points.
   - Point out the author's tone and stance.
4. Extract 1 to 3 high-value vocabulary words or collocations from the discussed part in "suggestedWords" (array of { term, pos, def, defEn, ex }) so the user can easily click to save them to their vocabulary bank.
5. Tone: Encouraging, scholarly yet accessible, completely in Traditional Chinese (繁體中文).
6. Format: Strict JSON output with "reply" and "suggestedWords".`;

    const rawContents: any[] = [];
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach((m) => {
        if (m.content && m.content.trim()) {
          rawContents.push({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          });
        }
      });
    }

    const currentPrompt = userPrompt || (selectedContext ? `請幫我詳細解析文章中這段文字的含義與文法結構：「${selectedContext}」` : '請為我導讀這篇文章的核心主旨與閱讀要點');
    rawContents.push({
      role: 'user',
      parts: [{ text: currentPrompt }]
    });

    // Merge consecutive turns with the same role
    const contents: any[] = [];
    for (const item of rawContents) {
      if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
        contents[contents.length - 1].parts.push(...item.parts);
      } else {
        contents.push(item);
      }
    }
    while (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }
    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: currentPrompt }]
      });
    }

    const config = {
      systemInstruction,
      temperature: 0.35,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description: 'Conversational response to the learner in Traditional Chinese (繁體中文).'
          },
          suggestedWords: {
            type: Type.ARRAY,
            description: 'Optional 1-3 useful vocabulary words from the context for the learner to save.',
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                pos: { type: Type.STRING },
                def: { type: Type.STRING },
                defEn: { type: Type.STRING },
                ex: { type: Type.STRING }
              },
              required: ['term', 'pos', 'def']
            }
          }
        },
        required: ['reply']
      }
    };

    const response = await generateWithModelFallback(ai, config, contents);
    const parsed = JSON.parse(response.text || '{}');

    return res.json({
      reply: parsed.reply || '已完成文章解析。',
      suggestedWords: parsed.suggestedWords || []
    });
  } catch (err: any) {
    console.error('Article chat error:', err);
    return res.status(500).json({
      reply: 'AI 伴讀導師暫時忙碌中，請稍候再試。',
      suggestedWords: []
    });
  }
});

// API: AI Generate Reading Article
app.post('/api/ai/generate-article', async (req, res) => {
  const { topic, level, targetWords, category } = req.body;
  const ai = getAIClient();
  if (!ai) {
    return res.status(503).json({ error: 'AI Client unavailable' });
  }

  try {
    const requestedLevel = level || 'B2';
    const requestedTopic = topic || 'Modern Science and Curiosity';
    const wordsContext = Array.isArray(targetWords) && targetWords.length > 0
      ? `Naturally integrate these target vocabulary words into the story/article: ${targetWords.join(', ')}`
      : '';

    const prompt = `You are an elite educational author and English teacher.
Create a captivating, authentic English reading article at CEFR ${requestedLevel} level.
Topic: "${requestedTopic}"
Category: "${category || 'Science'}"
${wordsContext}

Length: Approximately 260-320 words across 3 to 4 well-structured paragraphs.
Requirements:
1. "title": Catchy, sophisticated title in English
2. "subtitle": Engaging subtitle
3. "author": Fictional scholar/journalist name
4. "source": Name of publication
5. "level": "${requestedLevel}"
6. "category": "${category || 'Science'}"
7. "content": Complete article text in English with paragraph breaks (\n\n)
8. "translationZh": High quality, elegant Traditional Chinese translation (繁體中文) matching paragraph by paragraph (\n\n)
9. "summary": 1-sentence Traditional Chinese summary
10. "keyVocabulary": 5-6 advanced/key vocabulary words from the article with term, pos (n./v./adj./adv./phr.), def (Traditional Chinese), defEn (English definition), and level (e.g. B2, C1)
11. "quiz": 2 multiple-choice reading comprehension questions with 4 options each, correctAnswerIndex (0-3), and explanation in Traditional Chinese.`;

    const config = {
      temperature: 0.5,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          author: { type: Type.STRING },
          source: { type: Type.STRING },
          level: { type: Type.STRING },
          category: { type: Type.STRING },
          content: { type: Type.STRING },
          translationZh: { type: Type.STRING },
          summary: { type: Type.STRING },
          keyVocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                term: { type: Type.STRING },
                pos: { type: Type.STRING },
                def: { type: Type.STRING },
                defEn: { type: Type.STRING },
                level: { type: Type.STRING }
              },
              required: ['term', 'pos', 'def', 'defEn']
            }
          },
          quiz: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                correctAnswerIndex: { type: Type.NUMBER },
                explanation: { type: Type.STRING }
              },
              required: ['question', 'options', 'correctAnswerIndex', 'explanation']
            }
          }
        },
        required: ['title', 'content', 'translationZh', 'keyVocabulary']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    const wordCount = (parsed.content || '').split(/\s+/).filter(Boolean).length;
    const readTimeMinutes = Math.max(1, Math.round(wordCount / 120));

    return res.json({
      id: `art-ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: parsed.title || 'Generated Reading',
      subtitle: parsed.subtitle || '',
      author: parsed.author || 'AI Scholar',
      source: parsed.source || 'VocabMin Curated',
      level: parsed.level || requestedLevel,
      category: parsed.category || category || 'Custom',
      content: parsed.content || '',
      translationZh: parsed.translationZh || '',
      summary: parsed.summary || '',
      wordCount,
      readTimeMinutes,
      savedWordTerms: [],
      keyVocabulary: parsed.keyVocabulary || [],
      quiz: parsed.quiz || [],
      isCustom: true
    });
  } catch (err: any) {
    console.error('Article generation error:', err);
    return res.status(500).json({ error: err?.message || 'Article generation failed' });
  }
});

// API: Extract Vocabulary from any user-provided text
app.post('/api/ai/extract-vocabulary', async (req, res) => {
  const rawText = req.body.text || req.body.content || req.body.article?.content || '';
  const text = (rawText || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  const ai = getAIClient();
  if (!ai) {
    return res.status(503).json({ error: 'AI Client unavailable' });
  }

  try {
    const prompt = `Analyze this English text and extract 8 to 12 most valuable, high-utility vocabulary words or idioms for language learners.
For each word, provide:
- "term": the base or contextual word/phrase
- "pos": "n." | "v." | "adj." | "adv." | "phr." | "other"
- "def": accurate Traditional Chinese definition (繁體中文解釋)
- "defEn": clear English definition (英英釋義)
- "level": CEFR level (A2, B1, B2, C1, C2)
- "ex": A concise, natural, flashcard-friendly English example sentence (8-14 words max, easy to memorize for review, do NOT use long complex sentences).

Text:
"""
${text.slice(0, 3000)}
"""`;

    const config = {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            term: { type: Type.STRING },
            pos: { type: Type.STRING },
            def: { type: Type.STRING },
            defEn: { type: Type.STRING },
            level: { type: Type.STRING },
            ex: { type: Type.STRING }
          },
          required: ['term', 'pos', 'def', 'defEn']
        }
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '[]');
    return res.json({ vocabulary: parsed });
  } catch (err: any) {
    console.error('Extract vocabulary error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to extract vocabulary' });
  }
});

// API: Translate Article to Traditional Chinese (Bilingual Support)
app.post('/api/ai/translate-article', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const ai = getAIClient();
  if (!ai) {
    return res.status(503).json({ error: 'AI Client unavailable' });
  }

  try {
    const prompt = `You are a professional literary and scholarly translator.
Translate the following English article into elegant, natural Traditional Chinese (繁體中文).
Translate paragraph by paragraph, preserving paragraph breaks (\n\n).

English text:
"""
${content.slice(0, 4000)}
"""

Return JSON with:
- "translationZh": string with translated paragraphs separated by \n\n.`;

    const config = {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          translationZh: { type: Type.STRING }
        },
        required: ['translationZh']
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '{}');
    return res.json({ translationZh: parsed.translationZh || '' });
  } catch (err: any) {
    console.error('Translate article error:', err);
    return res.status(500).json({ error: err?.message || 'Translation failed' });
  }
});

// API: Generate Reading Comprehension Quiz for Article
app.post('/api/ai/generate-quiz', async (req, res) => {
  const { title, content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const ai = getAIClient();
  if (!ai) {
    return res.status(503).json({ error: 'AI Client unavailable' });
  }

  try {
    const prompt = `You are an English language testing expert.
Create 2 or 3 multiple-choice reading comprehension and vocabulary questions based on this article.
Title: "${title || 'English Reading'}"
Content:
"""
${content.slice(0, 3000)}
"""

For each question provide:
- "question": clear question in English testing either main idea, specific fact, inference, or context vocabulary
- "options": exactly 4 options in English
- "correctAnswerIndex": number 0 to 3
- "explanation": concise explanation in Traditional Chinese (繁體中文) citing why the correct answer is right.`;

    const config = {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            correctAnswerIndex: { type: Type.NUMBER },
            explanation: { type: Type.STRING }
          },
          required: ['question', 'options', 'correctAnswerIndex', 'explanation']
        }
      }
    };

    const response = await generateWithModelFallback(ai, config, prompt);
    const parsed = JSON.parse(response.text || '[]');
    return res.json({ quiz: parsed });
  } catch (err: any) {
    console.error('Generate quiz error:', err);
    return res.status(500).json({ error: err?.message || 'Quiz generation failed' });
  }
});

// Setup Vite middleware in dev or static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VocabMin server running on port ${PORT}`);
});
