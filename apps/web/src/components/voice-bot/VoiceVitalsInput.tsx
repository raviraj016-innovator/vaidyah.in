'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, Button, Typography, Space, Tag, Tooltip } from 'antd';
import {
  AudioOutlined,
  AudioMutedOutlined,
  SoundOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { VitalsData } from '@/stores/session-store';

const { Text } = Typography;

// ─── Web Speech API types ───────────────────────────────────────────────────

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

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition ??
    null
  );
}

// ─── Vitals Parser ──────────────────────────────────────────────────────────

function parseVitalsFromSpeech(text: string): Partial<VitalsData> {
  const t = text.toLowerCase().replace(/,/g, '');
  const vitals: Partial<VitalsData> = {};

  // BP: "BP 120 over 80", "blood pressure 120/80", "BP 120 by 80"
  const bpMatch = t.match(
    /(?:bp|blood\s*pressure|बीपी|रक्तचाप)\s*(?:is\s*)?(\d{2,3})\s*(?:over|by|\/|ओवर|बाय)\s*(\d{2,3})/,
  );
  if (bpMatch) {
    vitals.systolic = parseInt(bpMatch[1], 10);
    vitals.diastolic = parseInt(bpMatch[2], 10);
  }

  // Temperature: "temperature 99.2", "temp 37 celsius", "fever 101"
  const tempMatch = t.match(
    /(?:temperature|temp|tapman|tapmaan|तापमान|बुखार)\s*(?:is\s*)?(\d{2,3}(?:\.\d{1,2})?)\s*(?:degree\s*)?(?:fahrenheit|farenheit|f|celsius|centigrade|c|°f|°c|फ़ारेनहाइट|सेल्सियस)?/,
  );
  if (tempMatch) {
    const val = parseFloat(tempMatch[1]);
    vitals.temperature = val;
    // Detect unit from speech
    if (/fahrenheit|farenheit|°f|\bf\b|फ़ारेनहाइट/.test(t.slice(t.indexOf(tempMatch[0])))) {
      vitals.temperatureUnit = 'F';
    } else if (/celsius|centigrade|°c|\bc\b|सेल्सियस/.test(t.slice(t.indexOf(tempMatch[0])))) {
      vitals.temperatureUnit = 'C';
    } else {
      // Auto-detect: >50 is likely Fahrenheit
      vitals.temperatureUnit = val > 50 ? 'F' : 'C';
    }
  }

  // Heart rate: "heart rate 82", "pulse 82", "HR 82"
  const hrMatch = t.match(
    /(?:heart\s*rate|pulse|hr|धड़कन|हार्ट\s*रेट|पल्स)\s*(?:is\s*)?(\d{2,3})\s*(?:bpm|per\s*min)?/,
  );
  if (hrMatch) {
    vitals.heartRate = parseInt(hrMatch[1], 10);
  }

  // SpO2: "SpO2 98", "oxygen 98", "O2 sat 98", "saturation 98"
  const spo2Match = t.match(
    /(?:spo2|sp\s*o\s*2|oxygen|o2\s*sat|saturation|ऑक्सीजन)\s*(?:is\s*)?(\d{2,3})\s*(?:percent|%|प्रतिशत)?/,
  );
  if (spo2Match) {
    vitals.spO2 = parseInt(spo2Match[1], 10);
  }

  // Respiratory rate: "respiratory rate 18", "RR 18", "breathing rate 18"
  const rrMatch = t.match(
    /(?:respiratory\s*rate|resp\s*rate|rr|breathing\s*rate|श्वसन\s*दर)\s*(?:is\s*)?(\d{1,2})/,
  );
  if (rrMatch) {
    vitals.respiratoryRate = parseInt(rrMatch[1], 10);
  }

  // Blood glucose: "blood glucose 110", "sugar 110", "glucose 110"
  const bgMatch = t.match(
    /(?:blood\s*glucose|blood\s*sugar|glucose|sugar|शुगर|ग्लूकोज़|ग्लूकोज)\s*(?:is\s*)?(\d{2,3})\s*(?:mg)?/,
  );
  if (bgMatch) {
    vitals.bloodGlucose = parseInt(bgMatch[1], 10);
  }

  // Weight: "weight 65", "weight 65 kg"
  const weightMatch = t.match(
    /(?:weight|वजन|वज़न)\s*(?:is\s*)?(\d{1,3}(?:\.\d{1,2})?)\s*(?:kg|kilo)?/,
  );
  if (weightMatch) {
    vitals.weight = parseFloat(weightMatch[1]);
  }

  // Height: "height 170", "height 170 cm"
  const heightMatch = t.match(
    /(?:height|ऊँचाई|ऊंचाई|lambai|लंबाई)\s*(?:is\s*)?(\d{2,3}(?:\.\d{1,2})?)\s*(?:cm|centimeter)?/,
  );
  if (heightMatch) {
    vitals.height = parseFloat(heightMatch[1]);
  }

  // Pain score: "pain 4", "pain score 4", "pain 4 out of 10"
  const painMatch = t.match(
    /(?:pain\s*(?:score)?|दर्द)\s*(?:is\s*)?(\d{1,2})\s*(?:out\s*of\s*10)?/,
  );
  if (painMatch) {
    const val = parseInt(painMatch[1], 10);
    if (val >= 0 && val <= 10) vitals.painScore = val;
  }

  return vitals;
}

// Field labels for display
const VITAL_LABELS: Record<string, { en: string; hi: string }> = {
  systolic: { en: 'Systolic BP', hi: 'सिस्टोलिक BP' },
  diastolic: { en: 'Diastolic BP', hi: 'डायस्टोलिक BP' },
  temperature: { en: 'Temperature', hi: 'तापमान' },
  heartRate: { en: 'Heart Rate', hi: 'धड़कन' },
  spO2: { en: 'SpO2', hi: 'SpO2' },
  respiratoryRate: { en: 'Resp. Rate', hi: 'श्वसन दर' },
  bloodGlucose: { en: 'Glucose', hi: 'शुगर' },
  weight: { en: 'Weight', hi: 'वजन' },
  height: { en: 'Height', hi: 'ऊँचाई' },
  painScore: { en: 'Pain', hi: 'दर्द' },
};

const VITAL_UNITS: Record<string, string> = {
  systolic: 'mmHg',
  diastolic: 'mmHg',
  heartRate: 'bpm',
  spO2: '%',
  respiratoryRate: '/min',
  bloodGlucose: 'mg/dL',
  weight: 'kg',
  height: 'cm',
  painScore: '/10',
};

// ─── Component ──────────────────────────────────────────────────────────────

interface VoiceVitalsInputProps {
  onVitalsDetected: (vitals: Partial<VitalsData>) => void;
  language?: 'en' | 'hi';
}

export default function VoiceVitalsInput({ onVitalsDetected, language = 'en' }: VoiceVitalsInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [detectedVitals, setDetectedVitals] = useState<Record<string, number>>({});
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setIsSupported(getSpeechRecognition() !== null);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);

      if (finalTranscript.trim()) {
        setLastTranscript((prev) => (prev + ' ' + finalTranscript).trim());
        const parsed = parseVitalsFromSpeech(finalTranscript);
        const numericEntries = Object.entries(parsed).filter(
          ([k, v]) => typeof v === 'number' && k !== 'temperatureUnit',
        );
        if (numericEntries.length > 0) {
          setDetectedVitals((prev) => {
            const updated = { ...prev };
            for (const [k, v] of numericEntries) {
              updated[k] = v as number;
            }
            return updated;
          });
          onVitalsDetected(parsed);
        }
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognition.start();
  }, [language, onVitalsDetected]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
  }, []);

  const handleToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  const detectedCount = Object.keys(detectedVitals).length;

  return (
    <Card
      style={{
        marginBottom: 24,
        background: isListening
          ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
          : 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
        borderColor: isListening ? '#fca5a5' : '#c4b5fd',
        transition: 'all 0.3s',
      }}
      styles={{ body: { padding: '20px 24px' } }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: isListening
              ? 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
              : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            animation: isListening ? 'vitals-pulse 1.5s infinite' : 'none',
          }}
        >
          <SoundOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 2 }}>
            {language === 'hi' ? 'वॉइस से वाइटल्स बोलें' : 'Speak Vitals Hands-Free'}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isListening
              ? language === 'hi'
                ? 'सुन रहा है... बोलें: "BP 120 over 80, temperature 99.2, pulse 82"'
                : 'Listening... Say: "BP 120 over 80, temperature 99.2, pulse 82"'
              : language === 'hi'
                ? 'माइक दबाएं और वाइटल्स बोलें — फ़ॉर्म अपने आप भरेगा'
                : 'Tap mic and speak vitals — form auto-fills'}
          </Text>
        </div>
        <Tooltip title={isListening ? (language === 'hi' ? 'बंद करें' : 'Stop') : (language === 'hi' ? 'बोलना शुरू करें' : 'Start speaking')}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={isListening ? <AudioOutlined /> : <AudioMutedOutlined />}
            onClick={handleToggle}
            disabled={!isSupported}
            style={{
              width: 52,
              height: 52,
              flexShrink: 0,
              background: isListening ? '#ef4444' : '#7c3aed',
              borderColor: isListening ? '#ef4444' : '#7c3aed',
              animation: isListening ? 'vitals-pulse 1.5s infinite' : 'none',
            }}
          />
        </Tooltip>
      </div>

      {/* Live transcript */}
      {(interimText || lastTranscript) && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.8)',
            border: '1px dashed #c4b5fd',
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {lastTranscript && (
            <Text style={{ color: '#374151' }}>{lastTranscript}</Text>
          )}
          {interimText && (
            <>
              {lastTranscript ? ' ' : ''}
              <Text style={{ color: '#9ca3af' }}>
                {interimText}
                <LoadingOutlined style={{ marginLeft: 6, fontSize: 12 }} />
              </Text>
            </>
          )}
        </div>
      )}

      {/* Detected vitals tags */}
      {detectedCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(detectedVitals).map(([key, value]) => (
            <Tag
              key={key}
              color="purple"
              icon={<CheckCircleOutlined />}
              style={{ fontSize: 12, padding: '2px 8px' }}
            >
              {VITAL_LABELS[key]?.[language] ?? key}: {value}
              {VITAL_UNITS[key] ? ` ${VITAL_UNITS[key]}` : ''}
            </Tag>
          ))}
        </div>
      )}

      {!isSupported && (
        <Text type="danger" style={{ fontSize: 12 }}>
          {language === 'hi'
            ? 'आपका ब्राउज़र वॉइस का समर्थन नहीं करता। Chrome या Edge का उपयोग करें।'
            : 'Your browser does not support voice. Please use Chrome or Edge.'}
        </Text>
      )}

      <style>{`
        @keyframes vitals-pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
    </Card>
  );
}
