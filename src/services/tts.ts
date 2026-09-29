// Reliable SpeechSynthesis service with bug fixes for Chrome/WebKit garbage collection

export interface FormattedVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  label: string;
  isRecommended?: boolean;
}

class TTSService {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voiceLoaded: boolean = false;
  private listeners: (() => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
          this.notifyListeners();
        };
      }
    }
  }

  public subscribeVoices(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  private loadVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.voices = window.speechSynthesis.getVoices();
    this.voiceLoaded = this.voices.length > 0;
  }

  public getAvailableEnglishVoices(): SpeechSynthesisVoice[] {
    if (!this.voices.length) this.loadVoices();
    return this.voices.filter((v) => v.lang.startsWith('en'));
  }

  public getFormattedEnglishVoices(): FormattedVoiceOption[] {
    const list = this.getAvailableEnglishVoices();
    if (!list.length) return [];

    return list.map((v) => {
      const isUS = v.lang.toLowerCase().includes('us');
      const isGB = v.lang.toLowerCase().includes('gb') || v.lang.toLowerCase().includes('uk');
      const isAU = v.lang.toLowerCase().includes('au');
      const isCA = v.lang.toLowerCase().includes('ca');
      
      let regionTag = '美音 (US)';
      if (isGB) regionTag = '英音 (UK)';
      else if (isAU) regionTag = '澳音 (AU)';
      else if (isCA) regionTag = '加音 (CA)';
      else if (!isUS) regionTag = `英語 (${v.lang})`;

      const isNatural = v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Neural') || v.name.includes('Google');
      const cleanName = v.name.replace(/\(.*?\)/g, '').replace(/Microsoft|Google|Apple|English/g, '').trim() || v.name;

      const label = `${regionTag} - ${cleanName}${isNatural ? ' ⭐ 精品' : ''}`;

      return {
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        label,
        isRecommended: isNatural || isUS || isGB
      };
    });
  }

  public getEnglishVoice(preferredVoiceURI?: string): SpeechSynthesisVoice | null {
    if (!this.voices.length) this.loadVoices();
    if (preferredVoiceURI) {
      const match = this.voices.find((v) => v.voiceURI === preferredVoiceURI);
      if (match) return match;
    }
    // Prefer natural / premium US or UK English voice
    const preferred = this.voices.find(
      (v) =>
        (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Alex')) &&
        (v.lang.startsWith('en-US') || v.lang.startsWith('en-GB'))
    );
    if (preferred) return preferred;
    return this.voices.find((v) => v.lang.startsWith('en')) || null;
  }

  public speak(
    text: string,
    options?: {
      rate?: number;
      pitch?: number;
      voiceURI?: string;
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (options?.onError) options.onError('SpeechSynthesis not supported');
      return;
    }

    const clean = text.trim();
    if (!clean) return;

    this.stop();

    try {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-US';
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;

      const voice = this.getEnglishVoice(options?.voiceURI);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => {
        this.activeUtterance = null;
        if (options?.onEnd) options.onEnd();
      };

      utterance.onerror = (e) => {
        this.activeUtterance = null;
        // Don't treat user-interrupted or cancelled speech as error
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('TTS Speech error:', e);
          if (options?.onError) options.onError(e);
        }
      };

      // Keep strong reference to prevent GC from killing utterance prematurely
      this.activeUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('TTS speak invocation error:', err);
      if (options?.onError) options.onError(err);
    }
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.activeUtterance = null;
    }
  }

  public pause(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
  }

  public resume(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  }
}

export const tts = new TTSService();
