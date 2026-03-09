'use client';

// Web Speech API type declarations (not available in all TS configs)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
}

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Drawer,
  Button,
  Space,
  Typography,
  Tag,
  Avatar,
  Segmented,
  Tooltip,
  Badge,
} from 'antd';
import {
  AudioOutlined,
  AudioMutedOutlined,
  RobotOutlined,
  UserOutlined,
  SoundOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useSessionStore } from '@/stores/session-store';

const { Text, Paragraph } = Typography;

// ─── Types ──────────────────────────────────────────────────────────────────

type BotLang = 'en' | 'hi';

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  text: string;
  timestamp: Date;
}

interface BotQuestion {
  id: string;
  text: { en: string; hi: string };
  type:
    | 'greeting'
    | 'chief_complaint'
    | 'severity'
    | 'duration'
    | 'more_symptoms'
    | 'allergies'
    | 'conditions'
    | 'summary';
  symptomId?: string;
  symptomName?: { en: string; hi: string };
}

// ─── Symptom Keywords ───────────────────────────────────────────────────────

const SYMPTOM_KEYWORDS = [
  { id: 'fever', name: 'Fever', nameHi: 'बुखार', en: ['fever', 'temperature', 'hot', 'burning', 'chills'], hi: ['bukhar', 'bukhaar', 'taap', 'बुखार', 'तापमान', 'ठंड लगना'] },
  { id: 'headache', name: 'Headache', nameHi: 'सिरदर्द', en: ['headache', 'head pain', 'head ache', 'migraine'], hi: ['sir dard', 'sar dard', 'sardard', 'सिरदर्द', 'सर दर्द', 'माइग्रेन'] },
  { id: 'cough', name: 'Cough', nameHi: 'खांसी', en: ['cough', 'coughing', 'dry cough', 'wet cough'], hi: ['khansi', 'khasi', 'खांसी', 'खाँसी', 'सूखी खांसी'] },
  { id: 'body_pain', name: 'Body Pain', nameHi: 'शरीर दर्द', en: ['body pain', 'body ache', 'bodyache', 'aching'], hi: ['shareer dard', 'badan dard', 'शरीर दर्द', 'बदन दर्द'] },
  { id: 'fatigue', name: 'Fatigue', nameHi: 'थकान', en: ['fatigue', 'tired', 'tiredness', 'weakness', 'weak', 'exhausted'], hi: ['thakan', 'kamzori', 'थकान', 'कमज़ोरी', 'कमजोरी', 'थकावट'] },
  { id: 'nausea', name: 'Nausea', nameHi: 'मतली', en: ['nausea', 'nauseous', 'queasy', 'sick'], hi: ['matli', 'jee machlana', 'मतली', 'जी मचलाना', 'उबकाई'] },
  { id: 'vomiting', name: 'Vomiting', nameHi: 'उल्टी', en: ['vomiting', 'vomit', 'throwing up', 'puke'], hi: ['ulti', 'उल्टी', 'कै'] },
  { id: 'diarrhea', name: 'Diarrhea', nameHi: 'दस्त', en: ['diarrhea', 'diarrhoea', 'loose motion', 'loose stool', 'watery stool'], hi: ['dast', 'दस्त', 'पतले दस्त', 'लूज़ मोशन'] },
  { id: 'chest_pain', name: 'Chest Pain', nameHi: 'छाती में दर्द', en: ['chest pain', 'chest', 'heart pain', 'chest tightness'], hi: ['seene mein dard', 'chhati dard', 'छाती में दर्द', 'सीने में दर्द'] },
  { id: 'breathlessness', name: 'Breathlessness', nameHi: 'सांस फूलना', en: ['breathlessness', 'breathless', 'shortness of breath', 'breathing difficulty', 'difficulty breathing'], hi: ['saans phoolna', 'sans', 'सांस फूलना', 'सांस की तकलीफ', 'दम घुटना'] },
  { id: 'abdominal_pain', name: 'Abdominal Pain', nameHi: 'पेट दर्द', en: ['abdominal pain', 'stomach pain', 'stomach ache', 'belly pain', 'tummy pain'], hi: ['pet dard', 'pet mein dard', 'पेट दर्द', 'पेट में दर्द'] },
  { id: 'dizziness', name: 'Dizziness', nameHi: 'चक्कर आना', en: ['dizziness', 'dizzy', 'giddy', 'lightheaded', 'vertigo'], hi: ['chakkar', 'chakkar aana', 'चक्कर आना', 'चक्कर', 'सिर घूमना'] },
  { id: 'sore_throat', name: 'Sore Throat', nameHi: 'गले में दर्द', en: ['sore throat', 'throat pain', 'throat infection'], hi: ['gale mein dard', 'gala dard', 'गले में दर्द', 'गला दर्द', 'गला खराब'] },
  { id: 'joint_pain', name: 'Joint Pain', nameHi: 'जोड़ों में दर्द', en: ['joint pain', 'joint ache', 'knee pain', 'joints hurting'], hi: ['jodon mein dard', 'ghutne dard', 'जोड़ों में दर्द', 'घुटने दर्द'] },
  { id: 'rash', name: 'Rash', nameHi: 'दाने', en: ['rash', 'skin rash', 'itching', 'itchy', 'hives', 'skin irritation'], hi: ['dane', 'khujli', 'दाने', 'खुजली', 'चकत्ते'] },
] as const;

// ─── Parsers ────────────────────────────────────────────────────────────────

function extractSymptoms(text: string): Array<{ id: string; name: string; nameHi: string }> {
  const lower = text.toLowerCase();
  return SYMPTOM_KEYWORDS.filter((s) =>
    [...s.en, ...s.hi].some((kw) => lower.includes(kw.toLowerCase())),
  );
}

function parseSeverity(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(severe|very bad|worst|extreme|unbearable|intense|bahut zyada|bahut jyada|तीव्र|बहुत ज़्यादा|बहुत ज्यादा|असहनीय|गंभीर)\b/.test(lower)) return 'severe';
  if (/\b(mild|little|slight|light|thoda|halka|हल्का|थोड़ा|मामूली|कम)\b/.test(lower)) return 'mild';
  return 'moderate';
}

function parseDuration(text: string): string {
  const lower = text.toLowerCase();
  const enMatch = lower.match(/(\d+)\s*(day|days|week|weeks|month|months|hour|hours|year|years)/);
  if (enMatch) return `${enMatch[1]} ${enMatch[2]}`;

  const hiMap: Record<string, string> = {
    din: 'days', 'दिन': 'days', hafte: 'weeks', 'हफ्ते': 'weeks',
    mahine: 'months', 'महीने': 'months', ghante: 'hours', 'घंटे': 'hours',
    saal: 'years', 'साल': 'years',
  };
  const hiMatch = lower.match(/(\d+)\s*(din|hafte|mahine|ghante|saal|दिन|हफ्ते|महीने|घंटे|साल)/);
  if (hiMatch) return `${hiMatch[1]} ${hiMap[hiMatch[2]] || hiMatch[2]}`;

  if (/\b(yesterday|kal|कल)\b/.test(lower)) return '1 day';
  if (/\b(today|aaj|आज)\b/.test(lower)) return 'today';
  if (/\b(last week|pichle hafte|पिछले हफ्ते)\b/.test(lower)) return '1 week';

  return text.trim() || 'not specified';
}

function isNegative(text: string): boolean {
  return /\b(no|none|nahi|nahin|nah|nothing|kuch nahi|नहीं|ना|कुछ नहीं|कोई नहीं)\b/i.test(text);
}

// ─── Web Speech API helpers ─────────────────────────────────────────────────

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition ??
    null
  );
}

function speak(text: string, lang: BotLang, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  utterance.rate = lang === 'hi' ? 0.9 : 0.95;
  utterance.pitch = 1;

  // Try to pick a voice for the language
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = lang === 'hi' ? 'hi' : 'en';
  const match = voices.find((v) => v.lang.startsWith(langPrefix) && v.lang.includes('IN'))
    ?? voices.find((v) => v.lang.startsWith(langPrefix));
  if (match) utterance.voice = match;

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

// ─── Component ──────────────────────────────────────────────────────────────

interface VoiceBotProps {
  open: boolean;
  onClose: () => void;
}

export default function VoiceBot({ open, onClose }: VoiceBotProps) {
  const addSymptom = useSessionStore((s) => s.addSymptom);
  const addTranscriptEntry = useSessionStore((s) => s.addTranscriptEntry);
  const existingSymptoms = useSessionStore((s) => s.symptoms);
  const patient = useSessionStore((s) => s.patient);

  const [lang, setLang] = useState<BotLang>('en');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(false);

  // Conversation state
  const questionQueueRef = useRef<BotQuestion[]>([]);
  const detectedSymptomsRef = useRef<Array<{ id: string; name: string; nameHi: string; severity: string; duration: string }>>([]);
  const currentQuestionRef = useRef<BotQuestion | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stoppedRef = useRef(false);
  const existingSymptomsRef = useRef(existingSymptoms);
  existingSymptomsRef.current = existingSymptoms;

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText]);

  // Check browser support (avoid SSR hydration mismatch)
  useEffect(() => {
    setIsSupported(getSpeechRecognition() !== null);
  }, []);

  // Load voices (Chrome loads them async)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  const addMessage = useCallback((role: 'bot' | 'user', text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, text, timestamp: new Date() },
    ]);
  }, []);

  // ─── Refs to break circular callback dependencies ─────────────────────
  const processAnswerRef = useRef<(text: string) => void>(() => {});
  const askNextRef = useRef<() => void>(() => {});

  // ─── Listen for answer ──────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) {
      addMessage('bot', lang === 'hi'
        ? 'आपका ब्राउज़र वॉइस रिकग्निशन का समर्थन नहीं करता। कृपया Chrome या Edge का उपयोग करें।'
        : 'Your browser does not support voice recognition. Please use Chrome or Edge.',
      );
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
      if (final) {
        setInterimText('');
        addMessage('user', final);
        addTranscriptEntry({
          id: `vb-${Date.now()}`,
          speaker: 'patient',
          text: final,
          timestamp: new Date().toISOString(),
        });
        processAnswerRef.current(final);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      setInterimText('');
      if (event.error === 'no-speech') {
        addMessage('bot', lang === 'hi'
          ? 'कोई आवाज़ नहीं सुनी। कृपया माइक बटन दबाकर फिर से बोलें।'
          : 'No speech detected. Please press the mic button and try again.',
        );
      } else if (event.error !== 'aborted') {
        addMessage('bot', lang === 'hi'
          ? 'आवाज़ सुनने में दिक्कत हुई। फिर से कोशिश करें।'
          : 'Error listening. Please try again.',
        );
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognition.start();
  }, [lang, addMessage, addTranscriptEntry]);

  // ─── Process the user's answer based on current question ────────────────

  const processAnswer = useCallback((text: string) => {
    const question = currentQuestionRef.current;
    if (!question) return;

    switch (question.type) {
      case 'chief_complaint':
      case 'more_symptoms': {
        if (question.type === 'more_symptoms' && isNegative(text)) {
          askNextRef.current();
          return;
        }
        const found = extractSymptoms(text);
        if (found.length === 0) {
          // No known symptoms matched — add as free-text symptom
          const freeId = `custom_${Date.now()}`;
          detectedSymptomsRef.current.push({
            id: freeId, name: text.slice(0, 50), nameHi: text.slice(0, 50),
            severity: 'moderate', duration: '',
          });
          // Skip severity/duration for chief complaint but still queue them
          questionQueueRef.current.unshift(
            {
              id: `sev_${freeId}`, type: 'severity', symptomId: freeId,
              symptomName: { en: text.slice(0, 50), hi: text.slice(0, 50) },
              text: {
                en: `How severe is this problem? Say mild, moderate, or severe.`,
                hi: `यह समस्या कितनी गंभीर है? हल्का, मध्यम, या तीव्र बताएं।`,
              },
            },
            {
              id: `dur_${freeId}`, type: 'duration', symptomId: freeId,
              symptomName: { en: text.slice(0, 50), hi: text.slice(0, 50) },
              text: {
                en: `How long have you had this problem?`,
                hi: `यह समस्या कब से है?`,
              },
            },
          );
        } else {
          // Add severity/duration questions for each found symptom
          const newQuestions: BotQuestion[] = [];
          for (const s of found) {
            if (detectedSymptomsRef.current.some((ds) => ds.id === s.id)) continue;
            detectedSymptomsRef.current.push({ id: s.id, name: s.name, nameHi: s.nameHi, severity: 'moderate', duration: '' });
            newQuestions.push(
              {
                id: `sev_${s.id}`, type: 'severity', symptomId: s.id,
                symptomName: { en: s.name, hi: s.nameHi },
                text: {
                  en: `How severe is your ${s.name}? Say mild, moderate, or severe.`,
                  hi: `आपका ${s.nameHi} कितना गंभीर है? हल्का, मध्यम, या तीव्र बताएं।`,
                },
              },
              {
                id: `dur_${s.id}`, type: 'duration', symptomId: s.id,
                symptomName: { en: s.name, hi: s.nameHi },
                text: {
                  en: `How long have you had ${s.name}? For example, 2 days, 1 week.`,
                  hi: `${s.nameHi} कब से है? जैसे 2 दिन, 1 हफ्ता।`,
                },
              },
            );
          }
          questionQueueRef.current.unshift(...newQuestions);
        }
        askNextRef.current();
        break;
      }

      case 'severity': {
        const severity = parseSeverity(text);
        const sym = detectedSymptomsRef.current.find((s) => s.id === question.symptomId);
        if (sym) sym.severity = severity;
        askNextRef.current();
        break;
      }

      case 'duration': {
        const duration = parseDuration(text);
        const sym = detectedSymptomsRef.current.find((s) => s.id === question.symptomId);
        if (sym) sym.duration = duration;
        // Add symptom to session store immediately after duration is collected
        if (sym) {
          const alreadyExists = existingSymptomsRef.current.some((es) => es.id === sym.id);
          if (!alreadyExists) {
            addSymptom({ id: sym.id, name: sym.name, severity: sym.severity, duration: sym.duration });
          }
        }
        askNextRef.current();
        break;
      }

      case 'allergies': {
        if (!isNegative(text)) {
          // Add allergy info to transcript for reference
          addTranscriptEntry({
            id: `vb-allergy-${Date.now()}`,
            speaker: 'system',
            text: `Allergies reported: ${text}`,
            textHi: `एलर्जी: ${text}`,
            timestamp: new Date().toISOString(),
          });
        }
        askNextRef.current();
        break;
      }

      case 'conditions': {
        if (!isNegative(text)) {
          addTranscriptEntry({
            id: `vb-conditions-${Date.now()}`,
            speaker: 'system',
            text: `Chronic conditions reported: ${text}`,
            textHi: `पुरानी बीमारी: ${text}`,
            timestamp: new Date().toISOString(),
          });
        }
        askNextRef.current();
        break;
      }

      default:
        askNextRef.current();
    }
  }, [addSymptom, addTranscriptEntry]);

  // ─── Ask next question in queue ─────────────────────────────────────────

  const askNext = useCallback(() => {
    if (stoppedRef.current) return;

    const next = questionQueueRef.current.shift();
    if (!next) {
      // All questions done — speak summary
      const summaryText = lang === 'hi'
        ? `धन्यवाद। मैंने ${detectedSymptomsRef.current.length} लक्षण दर्ज किए हैं। नर्स अब इसकी समीक्षा करेंगी।`
        : `Thank you. I have recorded ${detectedSymptomsRef.current.length} symptom${detectedSymptomsRef.current.length !== 1 ? 's' : ''}. The nurse will now review your information.`;

      addMessage('bot', summaryText);
      addTranscriptEntry({
        id: `vb-summary-${Date.now()}`,
        speaker: 'system',
        text: `Voice assessment completed. ${detectedSymptomsRef.current.length} symptoms recorded.`,
        textHi: `वॉइस मूल्यांकन पूर्ण। ${detectedSymptomsRef.current.length} लक्षण दर्ज किए गए।`,
        timestamp: new Date().toISOString(),
      });

      setIsSpeaking(true);
      speak(summaryText, lang, () => {
        setIsSpeaking(false);
        setIsDone(true);
      });
      currentQuestionRef.current = null;
      return;
    }

    currentQuestionRef.current = next;
    const questionText = next.text[lang];
    addMessage('bot', questionText);

    // Speak the question, then auto-start listening (or auto-advance for greeting)
    setIsSpeaking(true);
    speak(questionText, lang, () => {
      setIsSpeaking(false);
      if (stoppedRef.current) return;
      if (next.type === 'greeting') {
        // Auto-advance to first real question after greeting
        setTimeout(() => {
          if (!stoppedRef.current) askNextRef.current();
        }, 500);
      } else {
        // Small delay before listening
        setTimeout(() => {
          if (!stoppedRef.current) startListening();
        }, 300);
      }
    });
  }, [lang, addMessage, addTranscriptEntry, startListening]);

  // Keep callback refs in sync so circular calls always use latest versions
  processAnswerRef.current = processAnswer;
  askNextRef.current = askNext;

  // ─── Start conversation ─────────────────────────────────────────────────

  const startConversation = useCallback(() => {
    setIsStarted(true);
    setIsDone(false);
    setMessages([]);
    stoppedRef.current = false;
    detectedSymptomsRef.current = [];
    currentQuestionRef.current = null;

    const patientName = patient?.name || (lang === 'hi' ? 'मरीज़' : 'patient');
    const greetingEn = `Hello ${patientName}! I'm Vaidyah, your health assistant. I'll ask you a few questions about your health today.`;
    const greetingHi = `नमस्ते ${patientName}! मैं वैद्य हूँ, आपकी स्वास्थ्य सहायक। आज मैं आपसे आपके स्वास्थ्य के बारे में कुछ सवाल पूछूंगी।`;

    // Build question queue
    questionQueueRef.current = [
      {
        id: 'greeting', type: 'greeting',
        text: { en: greetingEn, hi: greetingHi },
      },
      {
        id: 'chief', type: 'chief_complaint',
        text: {
          en: 'What is the main problem you are facing today? Please describe your symptoms.',
          hi: 'आज आपकी मुख्य समस्या क्या है? कृपया अपने लक्षण बताएं।',
        },
      },
      {
        id: 'more', type: 'more_symptoms',
        text: {
          en: 'Do you have any other symptoms? Say yes and describe, or say no.',
          hi: 'क्या कोई और लक्षण हैं? हाँ बोलें और बताएं, या ना बोलें।',
        },
      },
      {
        id: 'allergies', type: 'allergies',
        text: {
          en: 'Are you allergic to any medications or food? Say the names, or say none.',
          hi: 'क्या आपको किसी दवा या खाने से एलर्जी है? नाम बताएं या नहीं बोलें।',
        },
      },
      {
        id: 'conditions', type: 'conditions',
        text: {
          en: 'Do you have any long-term conditions like diabetes, blood pressure, or asthma?',
          hi: 'क्या आपको कोई पुरानी बीमारी है जैसे डायबिटीज, ब्लड प्रेशर, या अस्थमा?',
        },
      },
    ];

    // Start by asking the first question (greeting)
    askNext();
  }, [lang, patient, askNext]);

  // ─── Reset ──────────────────────────────────────────────────────────────

  const resetConversation = useCallback(() => {
    stoppedRef.current = true;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    setIsStarted(false);
    setIsDone(false);
    setIsListening(false);
    setIsSpeaking(false);
    setInterimText('');
    setMessages([]);
    questionQueueRef.current = [];
    detectedSymptomsRef.current = [];
    currentQuestionRef.current = null;
  }, []);

  // ─── Manual mic trigger ─────────────────────────────────────────────────

  const handleMicClick = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else if (!isSpeaking && isStarted && !isDone) {
      startListening();
    }
  }, [isListening, isSpeaking, isStarted, isDone, startListening]);

  // ─── Stop on close ─────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    stoppedRef.current = true;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    setIsListening(false);
    setIsSpeaking(false);
    onClose();
  }, [onClose]);

  // isSupported is set via useEffect above to avoid SSR hydration mismatch

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined style={{ color: '#7c3aed', fontSize: 18 }} />
          <span>{lang === 'hi' ? 'वॉइस मूल्यांकन' : 'Voice Assessment'}</span>
          <Badge
            status={isDone ? 'success' : isStarted ? 'processing' : 'default'}
            text={
              <Text type="secondary" style={{ fontSize: 11 }}>
                {isDone
                  ? lang === 'hi' ? 'पूर्ण' : 'Done'
                  : isStarted
                    ? lang === 'hi' ? 'चालू' : 'Active'
                    : lang === 'hi' ? 'तैयार' : 'Ready'}
              </Text>
            }
          />
        </Space>
      }
      open={open}
      onClose={handleClose}
      width={420}
      placement="right"
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Language toggle */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {lang === 'hi' ? 'भाषा चुनें' : 'Select language'}
            </Text>
            <Segmented
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'हिन्दी' },
              ]}
              value={lang}
              onChange={(v) => setLang(v as BotLang)}
              disabled={isStarted && !isDone}
              size="small"
            />
          </Space>
        </div>

        {/* Chat messages area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: '#fff',
          }}
        >
          {!isStarted && !isDone && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <RobotOutlined style={{ fontSize: 48, color: '#d9d9d9', display: 'block', marginBottom: 16 }} />
              <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {lang === 'hi'
                  ? 'वैद्य वॉइस बॉट मरीज़ से सवाल पूछेगा और फॉर्म अपने आप भरेगा।'
                  : 'Vaidyah Voice Bot will ask the patient questions and auto-fill the consultation form.'}
              </Paragraph>
              <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 24 }}>
                {lang === 'hi'
                  ? 'कृपया माइक्रोफ़ोन की अनुमति दें।'
                  : 'Please allow microphone access when prompted.'}
              </Paragraph>
              {!isSupported && (
                <Paragraph type="danger" style={{ fontSize: 12 }}>
                  {lang === 'hi'
                    ? 'आपका ब्राउज़र वॉइस रिकग्निशन का समर्थन नहीं करता। कृपया Chrome या Edge का उपयोग करें।'
                    : 'Your browser does not support Speech Recognition. Please use Chrome or Edge.'}
                </Paragraph>
              )}
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={startConversation}
                disabled={!isSupported}
                style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
              >
                {lang === 'hi' ? 'शुरू करें' : 'Start Assessment'}
              </Button>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 8,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
              }}
            >
              <Avatar
                size={28}
                icon={msg.role === 'bot' ? <RobotOutlined /> : <UserOutlined />}
                style={{
                  background: msg.role === 'bot' ? '#7c3aed' : '#52c41a',
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: msg.role === 'bot' ? '2px 12px 12px 12px' : '12px 2px 12px 12px',
                  background: msg.role === 'bot' ? '#f6f0ff' : '#f0fdf4',
                  border: `1px solid ${msg.role === 'bot' ? '#e8daff' : '#d1fae5'}`,
                }}
              >
                <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{msg.text}</Text>
                <div style={{ textAlign: 'right', marginTop: 2 }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {msg.timestamp.toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </div>
              </div>
            </div>
          ))}

          {/* Interim (live) transcription */}
          {interimText && (
            <div style={{ display: 'flex', gap: 8, flexDirection: 'row-reverse', alignItems: 'flex-start' }}>
              <Avatar size={28} icon={<UserOutlined />} style={{ background: '#52c41a', flexShrink: 0 }} />
              <div
                style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: '12px 2px 12px 12px',
                  background: '#f0fdf4',
                  border: '1px dashed #86efac',
                }}
              >
                <Text style={{ fontSize: 13, color: '#6b7280' }}>{interimText}</Text>
                <LoadingOutlined style={{ marginLeft: 6, fontSize: 12, color: '#52c41a' }} />
              </div>
            </div>
          )}

          {/* Speaking indicator */}
          {isSpeaking && (
            <div style={{ textAlign: 'center', padding: 4 }}>
              <Space>
                <SoundOutlined style={{ color: '#7c3aed', fontSize: 14 }} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {lang === 'hi' ? 'बोल रहा है...' : 'Speaking...'}
                </Text>
              </Space>
            </div>
          )}

          {/* Done summary */}
          {isDone && detectedSymptomsRef.current.length > 0 && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Text strong style={{ fontSize: 12, color: '#16a34a' }}>
                  <CheckCircleOutlined style={{ marginRight: 4 }} />
                  {lang === 'hi' ? 'दर्ज लक्षण:' : 'Recorded Symptoms:'}
                </Text>
                {detectedSymptomsRef.current.map((s) => (
                  <div key={s.id} style={{ paddingLeft: 16 }}>
                    <Tag color={s.severity === 'severe' ? 'red' : s.severity === 'mild' ? 'green' : 'orange'}>
                      {s.severity}
                    </Tag>
                    <Text style={{ fontSize: 12 }}>
                      {lang === 'hi' ? s.nameHi : s.name}
                      {s.duration ? ` (${s.duration})` : ''}
                    </Text>
                  </div>
                ))}
              </Space>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom controls */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #f0f0f0',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {isStarted && !isDone && (
            <>
              <Tooltip title={lang === 'hi' ? (isListening ? 'सुन रहा है...' : 'बोलने के लिए दबाएं') : (isListening ? 'Listening...' : 'Press to speak')}>
                <Button
                  type={isListening ? 'primary' : 'default'}
                  shape="circle"
                  size="large"
                  icon={isListening ? <AudioOutlined /> : <AudioMutedOutlined />}
                  onClick={handleMicClick}
                  disabled={isSpeaking}
                  style={
                    isListening
                      ? {
                          background: '#ef4444',
                          borderColor: '#ef4444',
                          animation: 'voicebot-pulse 1.5s infinite',
                        }
                      : {}
                  }
                />
              </Tooltip>
              <Text type="secondary" style={{ fontSize: 11, minWidth: 80, textAlign: 'center' }}>
                {isSpeaking
                  ? lang === 'hi' ? 'बोल रहा है...' : 'Speaking...'
                  : isListening
                    ? lang === 'hi' ? 'सुन रहा है...' : 'Listening...'
                    : lang === 'hi' ? 'माइक दबाएं' : 'Tap mic'}
              </Text>
            </>
          )}

          {isDone && (
            <Button
              icon={<ReloadOutlined />}
              onClick={resetConversation}
            >
              {lang === 'hi' ? 'फिर से करें' : 'Start Over'}
            </Button>
          )}
        </div>
      </div>

      {/* Pulse animation for mic */}
      <style>{`
        @keyframes voicebot-pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
    </Drawer>
  );
}
