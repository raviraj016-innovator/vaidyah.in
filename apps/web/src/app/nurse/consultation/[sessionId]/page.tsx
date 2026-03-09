'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  App,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  List,
  Timeline,
  Select,
  Button,
  Descriptions,
  Empty,
  Divider,
  Tooltip,
  Alert,
} from 'antd';
import {
  AudioOutlined,
  AudioMutedOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  MedicineBoxOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  QuestionCircleOutlined,
  HeartOutlined,
  WarningOutlined,
  FileSearchOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore, TranscriptEntry } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import api from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import VoiceBot from '@/components/voice-bot/VoiceBot';

// ---------------------------------------------------------------------------
// Symptom taxonomy for manual entry
// ---------------------------------------------------------------------------

const SYMPTOM_OPTIONS = [
  { value: 'fever', label: 'Fever', labelHi: 'बुखार' },
  { value: 'headache', label: 'Headache', labelHi: 'सिरदर्द' },
  { value: 'cough', label: 'Cough', labelHi: 'खांसी' },
  { value: 'body_pain', label: 'Body Pain', labelHi: 'शरीर दर्द' },
  { value: 'fatigue', label: 'Fatigue', labelHi: 'थकान' },
  { value: 'nausea', label: 'Nausea', labelHi: 'मतली' },
  { value: 'vomiting', label: 'Vomiting', labelHi: 'उल्टी' },
  { value: 'diarrhea', label: 'Diarrhea', labelHi: 'दस्त' },
  { value: 'chest_pain', label: 'Chest Pain', labelHi: 'छाती में दर्द' },
  { value: 'breathlessness', label: 'Breathlessness', labelHi: 'सांस फूलना' },
  { value: 'abdominal_pain', label: 'Abdominal Pain', labelHi: 'पेट दर्द' },
  { value: 'dizziness', label: 'Dizziness', labelHi: 'चक्कर आना' },
  { value: 'sore_throat', label: 'Sore Throat', labelHi: 'गले में दर्द' },
  { value: 'joint_pain', label: 'Joint Pain', labelHi: 'जोड़ों में दर्द' },
  { value: 'rash', label: 'Rash', labelHi: 'दाने' },
];

const SEVERITY_COLORS: Record<string, string> = {
  mild: 'green',
  moderate: 'orange',
  severe: 'red',
};


// ---------------------------------------------------------------------------
// Voice Waveform Component (Canvas-based)
// ---------------------------------------------------------------------------

function VoiceWaveform({
  isActive,
  isPaused: waveformPaused,
  width = 280,
  height = 60,
}: {
  isActive: boolean;
  isPaused: boolean;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BAR_COUNT = 32;
    const BAR_WIDTH = width / BAR_COUNT - 2;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < BAR_COUNT; i++) {
        let barHeight: number;

        if (!isActive) {
          // Flat line when not recording
          barHeight = 2;
        } else if (waveformPaused) {
          // Frozen sine wave when paused (use last phase, no increment)
          barHeight =
            Math.abs(Math.sin((i / BAR_COUNT) * Math.PI * 2 + phaseRef.current)) *
              (height * 0.7) +
            4;
        } else {
          // Animated sine wave when actively recording
          barHeight =
            Math.abs(
              Math.sin((i / BAR_COUNT) * Math.PI * 2 + phaseRef.current) *
                Math.sin((i / BAR_COUNT) * Math.PI * 1.5 + phaseRef.current * 0.7),
            ) *
              (height * 0.8) +
            4;
        }

        const x = i * (BAR_WIDTH + 2);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = isActive
          ? waveformPaused
            ? '#faad14' // orange when paused
            : '#52c41a' // green when recording
          : '#d9d9d9'; // gray when not recording
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, barHeight, 2);
        ctx.fill();
      }

      if (isActive && !waveformPaused) {
        phaseRef.current += 0.08;
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isActive, waveformPaused, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        display: 'block',
        margin: '0 auto 12px auto',
        borderRadius: 8,
        background: '#fafafa',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Follow-up question type (bilingual with category)
// ---------------------------------------------------------------------------

interface FollowUpQuestion {
  text: string;
  textHi: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Contradiction detection types
// ---------------------------------------------------------------------------

interface Contradiction {
  id: string;
  description: string;
  descriptionHi: string;
  severity: 'high' | 'medium' | 'low';
  suggestedAction: string;
  suggestedActionHi: string;
  dismissed: boolean;
}


const CONTRADICTION_COLORS: Record<string, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#3b82f6',
};


// ---------------------------------------------------------------------------
// ABDM Health Record types
// ---------------------------------------------------------------------------

interface ABDMHealthRecord {
  medications: { name: string; dosage: string; frequency: string }[];
  allergies: { substance: string; severity: string }[];
  conditions: { name: string; diagnosedYear: number }[];
  lastVisit: string;
}


const CATEGORY_LABELS: Record<string, { en: string; hi: string }> = {
  symptom_exploration: { en: 'Symptom', hi: 'लक्षण' },
  history: { en: 'History', hi: 'इतिहास' },
  medical_history: { en: 'Medical', hi: 'चिकित्सा' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ConsultationPageInner() {
  const router = useRouter();
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? (params.sessionId[0] ?? '') : (params.sessionId ?? '');
  const { language } = useTranslation();
  const { message } = App.useApp();

  const patient = useSessionStore((s) => s.patient);
  const vitals = useSessionStore((s) => s.vitals);
  const symptoms = useSessionStore((s) => s.symptoms);
  const transcript = useSessionStore((s) => s.transcript);
  const isRecording = useSessionStore((s) => s.isRecording);
  const addSymptom = useSessionStore((s) => s.addSymptom);
  const removeSymptom = useSessionStore((s) => s.removeSymptom);
  const addTranscriptEntry = useSessionStore((s) => s.addTranscriptEntry);
  const setRecording = useSessionStore((s) => s.setRecording);

  const [isPaused, setIsPaused] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [voiceBotOpen, setVoiceBotOpen] = useState(false);

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const isPausedRef = useRef(false);

  const currentTranscript = transcript;

  // Session timer
  const startedAt = useSessionStore((s) => s.startedAt);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // Cleanup audio resources on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      mediaRecorderRef.current?.stop?.();
      mediaStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    };
  }, []);

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  // Contradiction detection state
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [contradictionsLoading, setContradictionsLoading] = useState(false);

  const handleDismissContradiction = useCallback((id: string) => {
    setContradictions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, dismissed: true } : c)),
    );
  }, []);

  const handleFetchContradictions = useCallback(async () => {
    setContradictionsLoading(true);
    try {
      const { data } = await api.post(endpoints.nlu.contradictions, {
        conversation_history: currentTranscript.map((e) => ({
          role: e.speaker === 'nurse' ? 'doctor' : e.speaker,
          text: e.text,
        })),
        extracted_symptoms: symptoms.map((s) => ({
          name: s.name,
          severity: s.severity ?? 'moderate',
        })),
      });
      const raw = data?.contradictions ?? data?.data?.contradictions ?? [];
      if (raw.length > 0) {
        setContradictions(raw.map((c: any, i: number) => ({
          id: c.id ?? `c-${i}`,
          description: c.description ?? c.text ?? '',
          descriptionHi: c.descriptionHi ?? c.description_hi ?? '',
          severity: c.severity ?? 'medium',
          suggestedAction: c.suggestedAction ?? c.suggested_action ?? '',
          suggestedActionHi: c.suggestedActionHi ?? c.suggested_action_hi ?? '',
          dismissed: false,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch contradictions:', err);
      message.error(
        language === 'hi' ? 'विरोधाभास विश्लेषण विफल' : 'Failed to analyze contradictions',
      );
    }
    setContradictionsLoading(false);
  }, [currentTranscript, symptoms]);

  // Bilingual follow-up questions (text/textHi/category)
  const [suggestedQuestions, setSuggestedQuestions] = useState<FollowUpQuestion[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);

  // ABDM Health Record
  const [abdmData, setAbdmData] = useState<ABDMHealthRecord | null>(null);
  const [abdmLoading, setAbdmLoading] = useState(false);


  const handleAddSymptom = useCallback(
    (value: string) => {
      const opt = SYMPTOM_OPTIONS.find((o) => o.value === value);
      if (!opt) return;
      if (symptoms.some((s) => s.id === value)) {
        message.warning(
          language === 'hi' ? 'लक्षण पहले से जोड़ा गया है' : 'Symptom already added',
        );
        return;
      }
      addSymptom({ id: value, name: opt.label, severity: 'moderate' });
    },
    [addSymptom, symptoms, language],
  );

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
        : null;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) {
            addTranscriptEntry({
              id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              speaker: 'patient',
              text,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording and not paused
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === 'recording' &&
        !isPausedRef.current
      ) {
        try { recognitionRef.current?.start(); } catch { /* already started */ }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.error('Speech recognition error:', event.error);
    };

    recognition.start();
  }, [language, addTranscriptEntry]);

  const handleStartRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Prefer webm/opus, fall back to whatever is available
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start();
      isPausedRef.current = false;
      startSpeechRecognition();

      setRecording(true);
      setIsPaused(false);

      addTranscriptEntry({
        id: `sys-rec-start-${Date.now()}`,
        speaker: 'system',
        text: 'Recording started',
        textHi: 'रिकॉर्डिंग शुरू',
        timestamp: new Date().toISOString(),
      });

      message.success(
        language === 'hi' ? 'रिकॉर्डिंग शुरू...' : 'Recording started',
      );
    } catch {
      message.error(
        language === 'hi'
          ? 'माइक्रोफ़ोन का उपयोग नहीं कर पाए। कृपया अनुमति दें।'
          : 'Could not access microphone. Please allow permission.',
      );
    }
  }, [language, setRecording, addTranscriptEntry, startSpeechRecognition]);

  const handleStopRecording = useCallback(() => {
    // Stop speech recognition
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;

    // Stop recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Release microphone
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    isPausedRef.current = false;
    setRecording(false);
    setIsPaused(false);

    addTranscriptEntry({
      id: `sys-rec-stop-${Date.now()}`,
      speaker: 'system',
      text: 'Recording stopped',
      textHi: 'रिकॉर्डिंग रोकी गई',
      timestamp: new Date().toISOString(),
    });

    message.info(
      language === 'hi' ? 'रिकॉर्डिंग रोकी गई' : 'Recording stopped',
    );
  }, [language, setRecording, addTranscriptEntry]);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      // Resume
      mediaRecorderRef.current?.resume();
      isPausedRef.current = false;
      setIsPaused(false);
      startSpeechRecognition();
      message.info(language === 'hi' ? 'रिकॉर्डिंग जारी' : 'Recording resumed');
    } else {
      // Pause
      mediaRecorderRef.current?.pause();
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
      isPausedRef.current = true;
      setIsPaused(true);
      message.info(language === 'hi' ? 'रिकॉर्डिंग रुकी' : 'Recording paused');
    }
  }, [isPaused, language, startSpeechRecognition]);

  // Fetch AI-suggested follow-up questions from NLU service
  // Fetch bilingual suggested follow-up questions (text/textHi/category)
  const handleFetchSuggestedQuestions = useCallback(async () => {
    setSuggestedLoading(true);
    try {
      const { data } = await api.post(endpoints.nlu.followupQuestions, {
        conversation_history: currentTranscript.map((e) => ({
          role: e.speaker === 'nurse' ? 'doctor' : e.speaker,
          text: e.text,
          language: 'en',
        })),
        extracted_symptoms: symptoms.map((s) => ({
          name: s.name,
          original_text: s.name,
          severity: s.severity ?? 'moderate',
        })),
        language: language === 'hi' ? 'hi' : 'en',
        max_questions: 3,
      });
      // Map API response to bilingual FollowUpQuestion shape
      const raw = data?.questions ?? data?.data?.questions ?? [];
      const mapped: FollowUpQuestion[] = raw.map((q: any) => ({
        text: q.question_en ?? q.text ?? '',
        textHi: q.question_local ?? q.textHi ?? '',
        category: q.category ?? q.purpose ?? 'general',
      }));
      setSuggestedQuestions(mapped);
    } catch (err) {
      console.error('Failed to fetch suggested questions:', err);
      message.error(
        language === 'hi' ? 'सुझाए गए प्रश्न प्राप्त करने में विफल' : 'Failed to fetch suggested questions',
      );
    }
    setSuggestedLoading(false);
  }, [currentTranscript, symptoms, language]);

  // Handle clicking a suggested question — add it to transcript as nurse entry
  const handleSuggestedQuestionClick = useCallback(
    (question: FollowUpQuestion) => {
      addTranscriptEntry({
        id: `fq-${Date.now()}`,
        speaker: 'nurse',
        text: question.text,
        textHi: question.textHi,
        timestamp: new Date().toISOString(),
      });
      message.success(
        language === 'hi'
          ? 'प्रश्न ट्रांसक्रिप्ट में जोड़ा गया'
          : 'Question added to transcript',
      );
    },
    [addTranscriptEntry, language],
  );

  // Fetch ABDM health record
  const handleFetchABDM = useCallback(async () => {
    if (!patient?.abdmId && !patient?.id) return;
    setAbdmLoading(true);
    try {
      const abdmIdentifier = patient.abdmId ?? patient.id ?? '';
      const { data } = await api.get(endpoints.integration.abdmHealthRecord(abdmIdentifier));
      setAbdmData(data?.record ?? data);
    } catch (err) {
      console.error('Failed to fetch ABDM health record:', err);
      message.error(
        language === 'hi' ? 'ABDM रिकॉर्ड प्राप्त करने में विफल' : 'Failed to fetch ABDM health record',
      );
    }
    setAbdmLoading(false);
  }, [patient]);

  // Auto-fetch ABDM data on mount
  const abdmFetchedRef = useRef(false);
  useEffect(() => {
    if (patient && !abdmData && !abdmFetchedRef.current) {
      abdmFetchedRef.current = true;
      handleFetchABDM();
    }
  }, [patient, abdmData, handleFetchABDM]);

  // Aggregate prosody scores from transcript emotions
  const prosodyScores = useMemo(() => {
    const emotionEntries = currentTranscript.filter((e) => e.emotions);
    if (emotionEntries.length === 0) return null;
    const aggregated: Record<string, number[]> = {};
    for (const entry of emotionEntries) {
      for (const [emotion, score] of Object.entries(entry.emotions ?? {})) {
        if (!aggregated[emotion]) aggregated[emotion] = [];
        aggregated[emotion]?.push(score);
      }
    }
    const averaged: Record<string, number> = {};
    for (const [emotion, scores] of Object.entries(aggregated)) {
      averaged[emotion] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    return averaged;
  }, [currentTranscript]);

  const handleRequestTriage = () => {
    setTriageLoading(true);
    const hide = message.loading(
      language === 'hi'
        ? 'ट्राइएज AI प्रोसेस कर रहा है...'
        : 'Triage AI processing...',
      0,
    );
    setTimeout(() => {
      hide();
      setTriageLoading(false);
      router.push(`/nurse/triage-result/${sessionId}`);
    }, 2000);
  };

  // No active session guard
  if (!patient) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Empty
          description={
            language === 'hi'
              ? 'कोई सक्रिय सत्र नहीं'
              : 'No active session'
          }
        />
        <div style={{ marginTop: 16 }}>
          <Typography.Link onClick={() => router.push('/nurse/patient-intake')}>
            {language === 'hi' ? 'रोगी पंजीकरण पर जाएँ' : 'Go to Patient Intake'}
          </Typography.Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'परामर्श' : 'Consultation'}
        subtitle={`${patient.name} | ${language === 'hi' ? 'सत्र' : 'Session'}: ${sessionId}`}
        extra={
          <Space size="middle">
            {startedAt && (
              <Tag
                icon={<ClockCircleOutlined />}
                color="processing"
                style={{ fontSize: 13, padding: '4px 12px' }}
              >
                {formatDuration(elapsedSeconds)}
              </Tag>
            )}
            <Tag
              color={isRecording ? (isPaused ? 'orange' : 'red') : 'default'}
              style={{ fontSize: 13, padding: '4px 12px' }}
            >
              {isRecording
                ? isPaused
                  ? language === 'hi'
                    ? 'रुका हुआ'
                    : 'Paused'
                  : language === 'hi'
                    ? 'रिकॉर्डिंग चल रही है'
                    : 'Recording'
                : language === 'hi'
                  ? 'रिकॉर्डिंग बंद'
                  : 'Not Recording'}
            </Tag>
            <Button
              type="primary"
              icon={<SoundOutlined />}
              onClick={() => setVoiceBotOpen(true)}
              style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
            >
              {language === 'hi' ? 'वॉइस मूल्यांकन' : 'Voice Assessment'}
            </Button>
          </Space>
        }
      />

      <VoiceBot open={voiceBotOpen} onClose={() => setVoiceBotOpen(false)} />

      <Row gutter={[16, 16]}>
        {/* Left Panel (60%) */}
        <Col xs={24} lg={14}>
          {/* Patient Info + Vitals Summary */}
          <Card style={{ marginBottom: 16 }}>
            <Descriptions
              column={{ xs: 1, sm: 2, md: 3 }}
              size="small"
              title={
                <Space>
                  <MedicineBoxOutlined />
                  <Typography.Text strong>
                    {language === 'hi' ? 'रोगी की जानकारी' : 'Patient Info'}
                  </Typography.Text>
                </Space>
              }
            >
              <Descriptions.Item label={language === 'hi' ? 'नाम' : 'Name'}>
                {patient.name}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'उम्र' : 'Age'}>
                {patient.age} {language === 'hi' ? 'वर्ष' : 'yrs'}, {patient.gender}
              </Descriptions.Item>
              <Descriptions.Item label="BP">
                {vitals.systolic != null && vitals.diastolic != null
                  ? `${vitals.systolic}/${vitals.diastolic} mmHg`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'तापमान' : 'Temp'}>
                {vitals.temperature != null
                  ? `${vitals.temperature}${vitals.temperatureUnit === 'F' ? '\u00b0F' : '\u00b0C'}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="HR">
                {vitals.heartRate != null ? `${vitals.heartRate} bpm` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="SpO2">
                {vitals.spO2 != null ? `${vitals.spO2}%` : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Detected Symptoms */}
          <Card
            title={
              <Space>
                <AlertOutlined />
                {language === 'hi' ? 'पहचाने गए लक्षण' : 'Detected Symptoms'}
              </Space>
            }
            style={{ marginBottom: 16 }}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {symptoms.length}{' '}
                {language === 'hi' ? 'लक्षण' : 'symptoms'}
              </Typography.Text>
            }
          >
            <List
              dataSource={symptoms}
              renderItem={(symptom) => (
                <List.Item
                  actions={[
                    <Button
                      key="remove"
                      type="link"
                      danger
                      size="small"
                      onClick={() => removeSymptom(symptom.id)}
                    >
                      {language === 'hi' ? 'हटाएं' : 'Remove'}
                    </Button>,
                  ]}
                >
                  <Space>
                    <Typography.Text strong>{symptom.name}</Typography.Text>
                    <Tag color={SEVERITY_COLORS[symptom.severity] ?? 'default'}>
                      {symptom.severity}
                    </Tag>
                    {symptom.duration && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        ({symptom.duration})
                      </Typography.Text>
                    )}
                  </Space>
                </List.Item>
              )}
              locale={{
                emptyText: language === 'hi' ? 'कोई लक्षण नहीं' : 'No symptoms detected',
              }}
            />

            <Divider style={{ margin: '12px 0' }} />

            {/* Add symptom manually */}
            <Space>
              <Select
                placeholder={
                  language === 'hi' ? 'लक्षण जोड़ें' : 'Add symptom'
                }
                style={{ width: '100%', maxWidth: 220 }}
                showSearch
                optionFilterProp="label"
                options={SYMPTOM_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: language === 'hi' ? opt.labelHi : opt.label,
                }))}
                onSelect={(value) => { if (value) handleAddSymptom(value); }}
                value={undefined}
              />
            </Space>
          </Card>

          {/* ABDM Health Record */}
          <Card
            title={
              <Space>
                <FileSearchOutlined />
                {language === 'hi' ? 'ABDM स्वास्थ्य रिकॉर्ड' : 'ABDM Health Record'}
              </Space>
            }
            style={{ marginBottom: 16 }}
            loading={abdmLoading}
            extra={
              <Button size="small" onClick={handleFetchABDM} loading={abdmLoading}>
                {language === 'hi' ? 'रिफ्रेश' : 'Refresh'}
              </Button>
            }
          >
            {!abdmData ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  language === 'hi'
                    ? 'ABDM रिकॉर्ड लोड हो रहा है...'
                    : 'Loading ABDM record...'
                }
              />
            ) : (
              <>
                {/* Medications */}
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    <MedicineBoxOutlined style={{ marginRight: 6 }} />
                    {language === 'hi' ? 'दवाइयाँ' : 'Medications'}
                  </Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {abdmData.medications.map((med) => (
                      <Tooltip
                        key={med.name}
                        title={`${med.dosage} — ${med.frequency}`}
                      >
                        <Tag
                          color="blue"
                          style={{ marginBottom: 4, cursor: 'pointer' }}
                        >
                          {med.name} ({med.dosage})
                        </Tag>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* Allergies */}
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    <WarningOutlined style={{ marginRight: 6, color: '#faad14' }} />
                    {language === 'hi' ? 'एलर्जी' : 'Allergies'}
                  </Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {abdmData.allergies.map((allergy) => (
                      <Tag
                        key={allergy.substance}
                        color="warning"
                        style={{ marginBottom: 4 }}
                      >
                        {allergy.substance} ({allergy.severity})
                      </Tag>
                    ))}
                  </div>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* Conditions */}
                <div style={{ marginBottom: 12 }}>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    <HeartOutlined style={{ marginRight: 6, color: '#ff4d4f' }} />
                    {language === 'hi' ? 'स्थितियाँ' : 'Conditions'}
                  </Typography.Text>
                  <List
                    size="small"
                    dataSource={abdmData.conditions}
                    renderItem={(condition) => (
                      <List.Item style={{ padding: '4px 0', border: 'none' }}>
                        <Typography.Text style={{ fontSize: 12 }}>
                          {condition.name}
                        </Typography.Text>
                        <Tag style={{ fontSize: 10, marginLeft: 8 }}>
                          {language === 'hi' ? 'निदान' : 'Since'} {condition.diagnosedYear}
                        </Tag>
                      </List.Item>
                    )}
                  />
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* Last Visit */}
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {language === 'hi' ? 'अंतिम विज़िट' : 'Last Visit'}:{' '}
                    {new Date(abdmData.lastVisit).toLocaleDateString(
                      language === 'hi' ? 'hi-IN' : 'en-IN',
                      { year: 'numeric', month: 'long', day: 'numeric' },
                    )}
                  </Typography.Text>
                </div>
              </>
            )}
          </Card>
        </Col>

        {/* Right Panel (40%) */}
        <Col xs={24} lg={10}>
          {/* Transcript */}
          <Card
            title={
              language === 'hi'
                ? 'बातचीत का प्रतिलेख'
                : 'Conversation Transcript'
            }
            style={{ marginBottom: 16 }}
            styles={{
              body: {
                maxHeight: 400,
                overflowY: 'auto',
              },
            }}
          >
            <Timeline
              items={currentTranscript.map((entry) => ({
                key: entry.id,
                color:
                  entry.speaker === 'nurse'
                    ? 'blue'
                    : entry.speaker === 'patient'
                      ? 'green'
                      : entry.speaker === 'companion'
                        ? 'orange'
                        : 'gray',
                dot:
                  entry.speaker === 'system' ? (
                    <ClockCircleOutlined style={{ fontSize: 14 }} />
                  ) : undefined,
                children: (
                  <div>
                    <Space style={{ marginBottom: 4 }}>
                      <Tag
                        color={
                          entry.speaker === 'nurse'
                            ? 'blue'
                            : entry.speaker === 'patient'
                              ? 'green'
                              : entry.speaker === 'companion'
                                ? 'orange'
                                : 'default'
                        }
                        style={{ fontSize: 11 }}
                      >
                        {entry.speaker === 'nurse'
                          ? language === 'hi'
                            ? 'नर्स'
                            : 'Nurse'
                          : entry.speaker === 'patient'
                            ? language === 'hi'
                              ? 'रोगी'
                              : 'Patient'
                            : entry.speaker === 'companion'
                              ? language === 'hi'
                                ? 'साथी'
                                : 'Companion'
                              : language === 'hi'
                                ? 'सिस्टम'
                                : 'System'}
                      </Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                        {new Date(entry.timestamp).toLocaleTimeString(
                          language === 'hi' ? 'hi-IN' : 'en-IN',
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                      </Typography.Text>
                    </Space>
                    <Typography.Paragraph
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontStyle:
                          entry.speaker === 'system' ? 'italic' : 'normal',
                      }}
                    >
                      {language === 'hi' && entry.textHi
                        ? entry.textHi
                        : entry.text}
                    </Typography.Paragraph>
                    {entry.emotions && (
                      <Space wrap style={{ marginTop: 4 }}>
                        {Object.entries(entry.emotions).map(([emotion, score]) => (
                          <Tag
                            key={emotion}
                            style={{ fontSize: 10 }}
                            color={score > 0.5 ? 'orange' : 'default'}
                          >
                            {emotion}: {Math.round(score * 100)}%
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                ),
              }))}
            />
          </Card>

          {/* Suggested Questions (bilingual, clickable) */}
          <Card
            title={
              <Space>
                <QuestionCircleOutlined />
                {language === 'hi' ? 'सुझाए गए प्रश्न' : 'Suggested Questions'}
              </Space>
            }
            extra={
              <Button
                size="small"
                type="primary"
                loading={suggestedLoading}
                onClick={handleFetchSuggestedQuestions}
              >
                {suggestedQuestions.length > 0
                  ? (language === 'hi' ? 'नवीनीकरण' : 'Refresh')
                  : (language === 'hi' ? 'प्रश्न प्राप्त करें' : 'Get Questions')}
              </Button>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            {suggestedQuestions.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  language === 'hi'
                    ? 'AI सुझावित प्रश्न प्राप्त करने के लिए बटन दबाएं'
                    : 'Press button to get AI-suggested follow-up questions'
                }
              />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {suggestedQuestions.map((q, idx) => (
                  <Button
                    key={idx}
                    type="default"
                    block
                    style={{
                      height: 'auto',
                      whiteSpace: 'normal',
                      textAlign: 'left',
                      padding: '8px 12px',
                    }}
                    onClick={() => handleSuggestedQuestionClick(q)}
                  >
                    <div>
                      <Tag
                        color="cyan"
                        style={{ fontSize: 10, marginBottom: 4 }}
                      >
                        {CATEGORY_LABELS[q.category]
                          ? language === 'hi'
                            ? CATEGORY_LABELS[q.category].hi
                            : CATEGORY_LABELS[q.category].en
                          : q.category}
                      </Tag>
                      <div style={{ fontSize: 13 }}>
                        {language === 'hi' && q.textHi ? q.textHi : q.text}
                      </div>
                      {language !== 'hi' && q.textHi && (
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 11, display: 'block', marginTop: 2 }}
                        >
                          {q.textHi}
                        </Typography.Text>
                      )}
                      {language === 'hi' && (
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 11, display: 'block', marginTop: 2 }}
                        >
                          {q.text}
                        </Typography.Text>
                      )}
                    </div>
                  </Button>
                ))}
              </Space>
            )}
          </Card>

          {/* Prosody / Emotion Indicator */}
          {prosodyScores && Object.keys(prosodyScores).length > 0 && (
            <Card
              title={
                <Space>
                  <SoundOutlined />
                  {language === 'hi' ? 'भावना विश्लेषण (प्रोसोडी)' : 'Emotion Analysis (Prosody)'}
                </Space>
              }
              size="small"
              style={{ marginBottom: 16 }}
            >
              {Object.entries(prosodyScores)
                .sort(([, a], [, b]) => b - a)
                .map(([emotion, score]) => (
                  <div key={emotion} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Typography.Text style={{ fontSize: 12, textTransform: 'capitalize' }}>{emotion}</Typography.Text>
                      <Tag
                        color={score > 0.6 ? 'red' : score > 0.35 ? 'orange' : 'green'}
                        style={{ fontSize: 10 }}
                      >
                        {Math.round(score * 100)}%
                      </Tag>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(score * 100, 100)}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: score > 0.6 ? '#ff4d4f' : score > 0.35 ? '#faad14' : '#52c41a',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                ))}
              <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                {language === 'hi'
                  ? 'आवाज विश्लेषण से संचित भावनात्मक संकेत'
                  : 'Aggregated emotional signals from voice analysis'}
              </Typography.Text>
            </Card>
          )}

          {/* Contradiction Detection */}
          <Card
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />
                {language === 'hi' ? 'विरोधाभास पहचान' : 'Contradiction Detection'}
              </Space>
            }
            extra={
              <Button
                size="small"
                loading={contradictionsLoading}
                onClick={handleFetchContradictions}
              >
                {contradictions.length > 0
                  ? (language === 'hi' ? 'नवीनीकरण' : 'Refresh')
                  : (language === 'hi' ? 'विश्लेषण करें' : 'Analyze')}
              </Button>
            }
            size="small"
            style={{ marginBottom: 16 }}
          >
            {contradictions.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  language === 'hi'
                    ? 'विरोधाभास पहचानने के लिए "विश्लेषण करें" दबाएं'
                    : 'Press "Analyze" to detect contradictions in conversation'
                }
              />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {contradictions
                  .filter((c) => !c.dismissed)
                  .map((c) => (
                    <Alert
                      key={c.id}
                      type={c.severity === 'high' ? 'error' : c.severity === 'medium' ? 'warning' : 'info'}
                      showIcon
                      closable
                      onClose={() => handleDismissContradiction(c.id)}
                      message={
                        <Space>
                          <Tag color={CONTRADICTION_COLORS[c.severity]} style={{ fontSize: 10 }}>
                            {(c.severity ?? '').toUpperCase()}
                          </Tag>
                          <Typography.Text style={{ fontSize: 12 }}>
                            {language === 'hi' && c.descriptionHi ? c.descriptionHi : c.description}
                          </Typography.Text>
                        </Space>
                      }
                      description={
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {language === 'hi'
                            ? `सुझाव: ${c.suggestedActionHi || c.suggestedAction}`
                            : `Suggestion: ${c.suggestedAction}`}
                        </Typography.Text>
                      }
                      style={{ borderRadius: 6 }}
                    />
                  ))}
                {contradictions.filter((c) => c.dismissed).length > 0 && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {contradictions.filter((c) => c.dismissed).length}{' '}
                    {language === 'hi' ? 'विरोधाभास खारिज किए गए' : 'contradiction(s) dismissed'}
                  </Typography.Text>
                )}
              </Space>
            )}
          </Card>

          {/* Recording Controls */}
          <Card
            title={
              language === 'hi' ? 'रिकॉर्डिंग नियंत्रण' : 'Recording Controls'
            }
          >
            {/* Voice Waveform Visualization */}
            <VoiceWaveform
              isActive={isRecording}
              isPaused={isPaused}
            />

            <Space size="middle" wrap style={{ width: '100%', justifyContent: 'center' }}>
              {!isRecording ? (
                <Button
                  type="primary"
                  icon={<AudioOutlined />}
                  size="large"
                  onClick={handleStartRecording}
                  style={{ minWidth: 160 }}
                >
                  {language === 'hi' ? 'रिकॉर्ड शुरू करें' : 'Start Recording'}
                </Button>
              ) : (
                <>
                  <Button
                    icon={
                      isPaused ? (
                        <PlayCircleOutlined />
                      ) : (
                        <PauseCircleOutlined />
                      )
                    }
                    size="large"
                    onClick={handlePauseResume}
                  >
                    {isPaused
                      ? language === 'hi'
                        ? 'जारी रखें'
                        : 'Resume'
                      : language === 'hi'
                        ? 'रोकें'
                        : 'Pause'}
                  </Button>
                  <Button
                    danger
                    icon={<AudioMutedOutlined />}
                    size="large"
                    onClick={handleStopRecording}
                  >
                    {language === 'hi' ? 'बंद करें' : 'Stop'}
                  </Button>
                </>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Bottom Action Bar */}
      <Card style={{ marginTop: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Button
            onClick={() => router.push('/nurse/dashboard')}
          >
            {language === 'hi' ? 'डैशबोर्ड पर वापस' : 'Back to Dashboard'}
          </Button>
          <Space size="middle" wrap>
            <Button
              size="large"
              icon={<VideoCameraOutlined />}
              onClick={() => router.push(`/nurse/telemedicine/${sessionId}`)}
            >
              {language === 'hi' ? 'वीडियो कॉल' : 'Video Call'}
            </Button>
            <Button
              type="primary"
              size="large"
              loading={triageLoading}
              onClick={handleRequestTriage}
              icon={<AlertOutlined />}
              style={{ background: '#d97706', borderColor: '#d97706' }}
            >
              {language === 'hi' ? 'ट्राइएज अनुरोध करें' : 'Request Triage'}
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                if (isRecording) {
                  setRecording(false);
                }
                // Advance status so SOAP page knows consultation phase is done
                useSessionStore.getState().submitVitals();
                message.success(
                  language === 'hi'
                    ? 'परामर्श पूर्ण'
                    : 'Consultation completed',
                );
                router.push(`/nurse/soap-summary/${sessionId}`);
              }}
            >
              {language === 'hi'
                ? 'परामर्श पूर्ण करें'
                : 'Complete Consultation'}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
}

// Wrap in ErrorBoundary
export default function ConsultationPage() {
  return (
    <ErrorBoundary
      fallbackTitle="Consultation Error"
      fallbackMessage="An error occurred during the consultation. Your session data is preserved. Please retry."
    >
      <ConsultationPageInner />
    </ErrorBoundary>
  );
}
