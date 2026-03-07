import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSessionStore } from '../store/sessionStore';
import type { MainStackParamList } from '../navigation/types';
import type {
  TranscriptionEntry,
  DetectedSymptom,
  Contradiction,
  FollowUpQuestion,
  EmotionIndicator,
  TriageResult,
} from '../store/sessionStore';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TOUCH_TARGET,
} from '../config/theme';
import ErrorBoundary from '../components/ErrorBoundary';

const SPEAKER_COLORS: Record<TranscriptionEntry['speaker'], string> = {
  patient: COLORS.primary[500],
  nurse: COLORS.success[500],
  companion: COLORS.warning[600],
};

const SPEAKER_LABELS: Record<TranscriptionEntry['speaker'], string> = {
  patient: 'Patient',
  nurse: 'Nurse',
  companion: 'Companion',
};

const SEVERITY_COLORS: Record<DetectedSymptom['severity'], string> = {
  mild: COLORS.success[500],
  moderate: COLORS.warning[500],
  severe: COLORS.emergency[500],
};

const SEVERITY_BG: Record<DetectedSymptom['severity'], string> = {
  mild: COLORS.success[50],
  moderate: COLORS.warning[50],
  severe: COLORS.emergency[50],
};

const TRIAGE_LEVEL_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  A: { label: 'Emergency', color: COLORS.triageRed, bg: COLORS.emergency[50] },
  B: { label: 'Urgent', color: COLORS.triageYellow, bg: COLORS.warning[50] },
  C: { label: 'Routine', color: COLORS.triageGreen, bg: COLORS.success[50] },
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function RecordingPulse() {
  return <View style={styles.recordingDot} />;
}

function TopBar() {
  const patient = useSessionStore((s) => s.patient);
  const isRecording = useSessionStore((s) => s.isRecording);
  const recordingDuration = useSessionStore((s) => s.recordingDuration);
  const currentSession = useSessionStore((s) => s.currentSession);
  const incrementRecordingDuration = useSessionStore(
    (s) => s.incrementRecordingDuration,
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        incrementRecordingDuration();
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, incrementRecordingDuration]);

  const sessionElapsed = currentSession
    ? Math.floor(
        (Date.now() - new Date(currentSession.startedAt).getTime()) / 1000,
      )
    : 0;

  return (
    <View style={styles.topBar}>
      <View style={styles.patientInfoRow}>
        {patient ? (
          <>
            <Text style={styles.patientName}>{patient.name}</Text>
            <View style={styles.patientMetaBadge}>
              <Text style={styles.patientMetaText}>
                {patient.age}y / {patient.gender.charAt(0).toUpperCase()}
              </Text>
            </View>
            {patient.languagePreference && (
              <View style={styles.languageBadge}>
                <Text style={styles.languageBadgeText}>
                  {patient.languagePreference}
                </Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.patientName}>No Patient Selected</Text>
        )}
      </View>
      <View style={styles.topBarRight}>
        <View style={styles.timerContainer}>
          <Text style={styles.timerLabel}>Session</Text>
          <Text style={styles.timerValue}>
            {formatDuration(sessionElapsed)}
          </Text>
        </View>
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <RecordingPulse />
            <Text style={styles.recordingText}>REC</Text>
            <Text style={styles.recordingTimer}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TranscriptionItem({ item }: { item: TranscriptionEntry }) {
  const speakerColor = SPEAKER_COLORS[item.speaker];
  return (
    <View style={styles.transcriptionItem}>
      <View style={styles.transcriptionHeader}>
        <View
          style={[styles.speakerIndicator, { backgroundColor: speakerColor }]}
        />
        <Text style={[styles.speakerLabel, { color: speakerColor }]}>
          {SPEAKER_LABELS[item.speaker]}
        </Text>
        {item.originalLanguage !== 'en' && (
          <View style={styles.langIndicator}>
            <Text style={styles.langIndicatorText}>
              {item.originalLanguage.toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.transcriptionTimestamp}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <Text style={styles.transcriptionText}>{item.translatedText}</Text>
      {item.originalLanguage !== 'en' && item.originalText && (
        <Text style={styles.originalText}>{item.originalText}</Text>
      )}
    </View>
  );
}

function TranscriptionPanel() {
  const transcriptions = useSessionStore((s) => s.transcriptions);
  const isProcessing = useSessionStore((s) => s.isProcessing);
  const flatListRef = useRef<FlatList<TranscriptionEntry>>(null);

  useEffect(() => {
    if (transcriptions.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [transcriptions.length]);

  const renderItem = useCallback(
    ({ item }: { item: TranscriptionEntry }) => (
      <TranscriptionItem item={item} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: TranscriptionEntry) => item.id, []);

  return (
    <View style={styles.leftPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Live Transcription</Text>
        {isProcessing && (
          <View style={styles.processingBadge}>
            <ActivityIndicator size="small" color={COLORS.primary[500]} />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}
      </View>
      {transcriptions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No transcription yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Tap the microphone button to start recording the consultation.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={transcriptions}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.transcriptionList}
          showsVerticalScrollIndicator
        />
      )}
    </View>
  );
}

function EmotionBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.emotionBarRow}>
      <Text style={styles.emotionBarLabel}>{label}</Text>
      <View style={styles.emotionBarTrack}>
        <View
          style={[
            styles.emotionBarFill,
            { width: `${Math.min(value, 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.emotionBarValue}>{value}%</Text>
    </View>
  );
}

function EmotionIndicators() {
  const emotions = useSessionStore((s) => s.emotions);
  const latest = emotions.length > 0 ? emotions[emotions.length - 1] : null;

  if (!latest) return null;

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Emotional State</Text>
      <EmotionBar
        label="Distress"
        value={latest.distress}
        color={COLORS.emotionDistress}
      />
      <EmotionBar
        label="Pain"
        value={latest.pain}
        color={COLORS.emotionPain}
      />
      <EmotionBar
        label="Anxiety"
        value={latest.anxiety}
        color={COLORS.emotionAnxiety}
      />
    </View>
  );
}

function SymptomBadge({ symptom }: { symptom: DetectedSymptom }) {
  return (
    <View
      style={[
        styles.symptomBadge,
        { backgroundColor: SEVERITY_BG[symptom.severity] },
      ]}
    >
      <View style={styles.symptomBadgeContent}>
        <Text style={styles.symptomName}>{symptom.name}</Text>
        {symptom.bodyPart && (
          <Text style={styles.symptomBodyPart}>{symptom.bodyPart}</Text>
        )}
      </View>
      <View
        style={[
          styles.severityTag,
          { backgroundColor: SEVERITY_COLORS[symptom.severity] },
        ]}
      >
        <Text style={styles.severityTagText}>{symptom.severity}</Text>
      </View>
      {symptom.duration && (
        <Text style={styles.symptomDuration}>{symptom.duration}</Text>
      )}
    </View>
  );
}

function SymptomsSection() {
  const symptoms = useSessionStore((s) => s.symptoms);

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>
        Detected Symptoms ({symptoms.length})
      </Text>
      {symptoms.length === 0 ? (
        <Text style={styles.emptySectionText}>
          Symptoms will appear here as the conversation is analyzed.
        </Text>
      ) : (
        <View style={styles.symptomsList}>
          {symptoms.map((symptom) => (
            <SymptomBadge key={symptom.id} symptom={symptom} />
          ))}
        </View>
      )}
    </View>
  );
}

function ContradictionAlert({ contradiction }: { contradiction: Contradiction }) {
  const dismissContradiction = useSessionStore((s) => s.dismissContradiction);
  const severityColor =
    contradiction.severity === 'high'
      ? COLORS.emergency[500]
      : contradiction.severity === 'medium'
        ? COLORS.warning[500]
        : COLORS.neutral[600];

  return (
    <View style={[styles.contradictionCard, { borderLeftColor: severityColor }]}>
      <View style={styles.contradictionHeader}>
        <Text style={styles.contradictionIcon}>!</Text>
        <Text style={styles.contradictionTitle}>Contradiction</Text>
        <Pressable
          onPress={() => dismissContradiction(contradiction.id)}
          style={styles.dismissButton}
          hitSlop={8}
        >
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </Pressable>
      </View>
      <Text style={styles.contradictionDesc}>{contradiction.description}</Text>
      <Text style={styles.contradictionAction}>
        {contradiction.suggestedAction}
      </Text>
    </View>
  );
}

function ContradictionsSection() {
  const contradictions = useSessionStore((s) => s.contradictions);

  if (contradictions.length === 0) return null;

  return (
    <View style={styles.sectionCard}>
      <Text style={[styles.sectionTitle, { color: COLORS.emergency[500] }]}>
        Contradictions ({contradictions.length})
      </Text>
      {contradictions.map((c) => (
        <ContradictionAlert key={c.id} contradiction={c} />
      ))}
    </View>
  );
}

function FollowUpSection() {
  const followUpQuestions = useSessionStore((s) => s.followUpQuestions);

  if (followUpQuestions.length === 0) return null;

  const priorityColor = (p: FollowUpQuestion['priority']) =>
    p === 'high'
      ? COLORS.emergency[500]
      : p === 'medium'
        ? COLORS.warning[600]
        : COLORS.neutral[600];

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Suggested Follow-ups</Text>
      {followUpQuestions.map((q) => (
        <View key={q.id} style={styles.followUpItem}>
          <View
            style={[
              styles.priorityDot,
              { backgroundColor: priorityColor(q.priority) },
            ]}
          />
          <View style={styles.followUpContent}>
            <Text style={styles.followUpText}>{q.text}</Text>
            {q.translatedText && (
              <Text style={styles.followUpTranslated}>{q.translatedText}</Text>
            )}
            <Text style={styles.followUpCategory}>{q.category}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function TriageResultCard() {
  const triageResult = useSessionStore((s) => s.triageResult);

  if (!triageResult) return null;

  const config = TRIAGE_LEVEL_CONFIG[triageResult.level] ?? TRIAGE_LEVEL_CONFIG.C;

  return (
    <View style={[styles.triageCard, { borderColor: config.color }]}>
      <View style={styles.triageHeader}>
        <View style={[styles.triageLevelBadge, { backgroundColor: config.color }]}>
          <Text style={styles.triageLevelText}>
            Level {triageResult.level}
          </Text>
        </View>
        <Text style={[styles.triageLevelLabel, { color: config.color }]}>
          {config.label}
        </Text>
        <Text style={styles.triageConfidence}>
          {Math.round(triageResult.confidence * 100)}% confidence
        </Text>
      </View>
      <Text style={styles.triageDiagnosis}>
        {triageResult.primaryDiagnosis}
      </Text>
      {triageResult.differentialDiagnoses.length > 0 && (
        <View style={styles.differentialList}>
          <Text style={styles.differentialLabel}>Differential:</Text>
          {triageResult.differentialDiagnoses.map((d, i) => (
            <Text key={i} style={styles.differentialItem}>
              {d.name} ({Math.round(d.confidence * 100)}%)
            </Text>
          ))}
        </View>
      )}
      {triageResult.recommendedActions.length > 0 && (
        <View style={styles.actionsContainer}>
          <Text style={styles.actionsLabel}>Recommended Actions:</Text>
          {triageResult.recommendedActions.map((action, i) => (
            <Text key={i} style={styles.actionItem}>
              {'\u2022'} {action}
            </Text>
          ))}
        </View>
      )}
      {triageResult.teleconsultRequired && (
        <View style={styles.teleconsultBanner}>
          <Text style={styles.teleconsultText}>Teleconsult Recommended</Text>
        </View>
      )}
    </View>
  );
}

function AnalysisPanel() {
  const isTriaging = useSessionStore((s) => s.isTriaging);

  return (
    <View style={styles.rightPanel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Clinical Analysis</Text>
        {isTriaging && (
          <View style={styles.processingBadge}>
            <ActivityIndicator size="small" color={COLORS.primary[500]} />
            <Text style={styles.processingText}>Triaging...</Text>
          </View>
        )}
      </View>
      <ScrollView
        style={styles.analysisPanelScroll}
        contentContainerStyle={styles.analysisPanelContent}
        showsVerticalScrollIndicator
      >
        <TriageResultCard />
        <SymptomsSection />
        <EmotionIndicators />
        <ContradictionsSection />
        <FollowUpSection />
      </ScrollView>
    </View>
  );
}

function BottomActionBar() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList, 'Consultation'>>();
  const currentSession = useSessionStore((s) => s.currentSession);
  const patient = useSessionStore((s) => s.patient);
  const isRecording = useSessionStore((s) => s.isRecording);
  const setRecording = useSessionStore((s) => s.setRecording);
  const requestTriage = useSessionStore((s) => s.requestTriage);
  const isTriaging = useSessionStore((s) => s.isTriaging);
  const isProcessing = useSessionStore((s) => s.isProcessing);

  const toggleRecording = useCallback(() => {
    setRecording(!isRecording);
  }, [isRecording, setRecording]);

  const handleRunTriage = useCallback(() => {
    requestTriage();
  }, [requestTriage]);

  return (
    <View style={styles.bottomBar}>
      <Pressable
        style={({ pressed }) => [
          styles.actionButton,
          styles.vitalsButton,
          pressed && styles.actionButtonPressed,
        ]}
        onPress={() => {
          if (!currentSession?.id) return;
          navigation.navigate('VitalsEntry', { sessionId: currentSession.id });
        }}
      >
        <Text style={styles.actionButtonText}>Add Vitals</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.micButton,
          isRecording && styles.micButtonRecording,
          pressed && styles.micButtonPressed,
        ]}
        onPress={toggleRecording}
      >
        <View
          style={[
            styles.micButtonInner,
            isRecording && styles.micButtonInnerRecording,
          ]}
        >
          {isRecording ? (
            <View style={styles.stopIcon} />
          ) : (
            <View style={styles.micIcon}>
              <View style={styles.micHead} />
              <View style={styles.micStem} />
              <View style={styles.micBase} />
            </View>
          )}
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.actionButton,
          styles.triageButton,
          (isTriaging || isProcessing) && styles.actionButtonDisabled,
          pressed && !isTriaging && !isProcessing && styles.actionButtonPressed,
        ]}
        onPress={handleRunTriage}
        disabled={isTriaging || isProcessing}
      >
        {isTriaging ? (
          <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.actionButtonText}>Run Triage</Text>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.actionButton,
          styles.emergencyButton,
          pressed && styles.emergencyButtonPressed,
        ]}
        onPress={() => {
          if (!currentSession?.id || !patient?.id) return;
          navigation.navigate('EmergencyAlert', { sessionId: currentSession.id, patientId: patient.id });
        }}
      >
        <Text style={styles.emergencyButtonText}>Emergency</Text>
      </Pressable>
    </View>
  );
}

function ConsultationScreenInner() {
  const error = useSessionStore((s) => s.error);
  const clearError = useSessionStore((s) => s.clearError);

  return (
    <View style={styles.container}>
      <TopBar />
      {error && (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>Tap to dismiss</Text>
        </Pressable>
      )}
      <View style={styles.splitLayout}>
        <TranscriptionPanel />
        <View style={styles.divider} />
        <AnalysisPanel />
      </View>
      <BottomActionBar />
    </View>
  );
}

export default function ConsultationScreen() {
  return (
    <ErrorBoundary fallbackMessage="The consultation screen encountered an error. Your session data is preserved — tap Retry to reload.">
      <ConsultationScreenInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOWS.sm,
  },
  patientInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.sm,
  },
  patientName: {
    ...TYPOGRAPHY.styles.h4,
  },
  patientMetaBadge: {
    backgroundColor: COLORS.primary[50],
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: BORDER_RADIUS.sm,
  },
  patientMetaText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.primary[700],
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  languageBadge: {
    backgroundColor: COLORS.warning[50],
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: BORDER_RADIUS.sm,
  },
  languageBadgeText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.warning[700],
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    textTransform: 'uppercase',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.base,
  },
  timerContainer: {
    alignItems: 'flex-end',
  },
  timerLabel: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
  },
  timerValue: {
    ...TYPOGRAPHY.styles.body,
    fontFamily: TYPOGRAPHY.fontFamily.mono,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textPrimary,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emergency[50],
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.emergency[500],
  },
  recordingText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.emergency[500],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  recordingTimer: {
    ...TYPOGRAPHY.styles.caption,
    fontFamily: TYPOGRAPHY.fontFamily.mono,
    color: COLORS.emergency[600],
  },

  // Error Banner
  errorBanner: {
    backgroundColor: COLORS.emergency[50],
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.emergency[200],
  },
  errorText: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.emergency[700],
    flex: 1,
  },
  errorDismiss: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.emergency[500],
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    marginLeft: SPACING.base,
  },

  // Split Layout
  splitLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  divider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  // Left Panel (Transcription)
  leftPanel: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  panelTitle: {
    ...TYPOGRAPHY.styles.h4,
  },
  processingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary[50],
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  processingText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.primary[500],
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  transcriptionList: {
    padding: SPACING.base,
    paddingBottom: SPACING['2xl'],
  },
  transcriptionItem: {
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  transcriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  speakerIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  speakerLabel: {
    ...TYPOGRAPHY.styles.caption,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  langIndicator: {
    backgroundColor: COLORS.neutral[100],
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.sm,
  },
  langIndicatorText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  transcriptionTimestamp: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textDisabled,
    marginLeft: 'auto',
  },
  transcriptionText: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.textPrimary,
  },
  originalText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.xxs,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['3xl'],
  },
  emptyStateTitle: {
    ...TYPOGRAPHY.styles.h4,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  emptyStateSubtext: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.textDisabled,
    textAlign: 'center',
  },

  // Right Panel (Analysis)
  rightPanel: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  analysisPanelScroll: {
    flex: 1,
  },
  analysisPanelContent: {
    padding: SPACING.base,
    paddingBottom: SPACING['2xl'],
    gap: SPACING.md,
  },

  // Section Card
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.base,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.styles.label,
    marginBottom: SPACING.md,
  },
  emptySectionText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textDisabled,
    fontStyle: 'italic',
  },

  // Symptoms
  symptomsList: {
    gap: SPACING.sm,
  },
  symptomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  symptomBadgeContent: {
    flex: 1,
  },
  symptomName: {
    ...TYPOGRAPHY.styles.body,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  symptomBodyPart: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
  },
  severityTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: BORDER_RADIUS.full,
  },
  severityTagText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textOnPrimary,
    textTransform: 'uppercase',
  },
  symptomDuration: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
  },

  // Emotion bars
  emotionBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  emotionBarLabel: {
    ...TYPOGRAPHY.styles.caption,
    width: 60,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  emotionBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.neutral[200],
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  emotionBarFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },
  emotionBarValue: {
    ...TYPOGRAPHY.styles.caption,
    width: 36,
    textAlign: 'right',
    fontFamily: TYPOGRAPHY.fontFamily.mono,
    color: COLORS.textSecondary,
  },

  // Contradictions
  contradictionCard: {
    backgroundColor: COLORS.neutral[50],
    borderLeftWidth: 4,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  contradictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    gap: SPACING.xs,
  },
  contradictionIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.warning[500],
    color: COLORS.textOnPrimary,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    overflow: 'hidden',
  },
  contradictionTitle: {
    ...TYPOGRAPHY.styles.caption,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textPrimary,
    flex: 1,
  },
  dismissButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
  },
  dismissButtonText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.primary[500],
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  contradictionDesc: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  contradictionAction: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.primary[600],
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },

  // Follow-ups
  followUpItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  followUpContent: {
    flex: 1,
  },
  followUpText: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.textPrimary,
  },
  followUpTranslated: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.xxs,
  },
  followUpCategory: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.primary[500],
    marginTop: SPACING.xxs,
  },

  // Triage Result
  triageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    padding: SPACING.base,
    ...SHADOWS.md,
  },
  triageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  triageLevelBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  triageLevelText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textOnPrimary,
  },
  triageLevelLabel: {
    ...TYPOGRAPHY.styles.h4,
    flex: 1,
  },
  triageConfidence: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
  },
  triageDiagnosis: {
    ...TYPOGRAPHY.styles.bodyLarge,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    marginBottom: SPACING.md,
  },
  differentialList: {
    marginBottom: SPACING.md,
  },
  differentialLabel: {
    ...TYPOGRAPHY.styles.caption,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  differentialItem: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
    marginLeft: SPACING.base,
    marginBottom: SPACING.xxs,
  },
  actionsContainer: {
    marginBottom: SPACING.md,
  },
  actionsLabel: {
    ...TYPOGRAPHY.styles.caption,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  actionItem: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
    marginBottom: SPACING.xxs,
  },
  teleconsultBanner: {
    backgroundColor: COLORS.primary[50],
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  teleconsultText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.primary[700],
  },

  // Bottom Action Bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.base,
    ...SHADOWS.lg,
  },
  actionButton: {
    minHeight: TOUCH_TARGET.comfortable,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textOnPrimary,
  },
  vitalsButton: {
    backgroundColor: COLORS.primary[500],
  },
  triageButton: {
    backgroundColor: COLORS.primary[700],
  },
  emergencyButton: {
    backgroundColor: COLORS.emergency[500],
  },
  emergencyButtonPressed: {
    backgroundColor: COLORS.emergency[700],
  },
  emergencyButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textOnEmergency,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  micButtonRecording: {
    backgroundColor: COLORS.emergency[500],
  },
  micButtonPressed: {
    opacity: 0.85,
  },
  micButtonInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonInnerRecording: {
    borderColor: 'rgba(255,255,255,0.5)',
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.textOnPrimary,
  },
  micIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micHead: {
    width: 14,
    height: 20,
    borderRadius: 7,
    backgroundColor: COLORS.textOnPrimary,
  },
  micStem: {
    width: 2,
    height: 6,
    backgroundColor: COLORS.textOnPrimary,
  },
  micBase: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.textOnPrimary,
  },
});
