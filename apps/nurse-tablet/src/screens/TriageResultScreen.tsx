import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSessionStore, TriageLevel } from '../store/sessionStore';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TOUCH_TARGET,
} from '../config/theme';
import type { TriageResultScreenProps } from '../navigation/types';

const TRIAGE_CONFIG: Record<TriageLevel, { color: string; label: string; textColor: string }> = {
  A: { color: COLORS.triageRed, label: 'Level A - Emergency', textColor: COLORS.textOnEmergency },
  B: { color: COLORS.triageYellow, label: 'Level B - Urgent', textColor: COLORS.textPrimary },
  C: { color: COLORS.triageGreen, label: 'Level C - Routine', textColor: COLORS.textOnPrimary },
};

export default function TriageResultScreen({ navigation }: TriageResultScreenProps) {
  const triageResult = useSessionStore((s) => s.triageResult);
  const isGeneratingSoap = useSessionStore((s) => s.isGeneratingSoap);
  const generateSoapNote = useSessionStore((s) => s.generateSoapNote);
  const patient = useSessionStore((s) => s.patient);

  const handleGenerateSoap = useCallback(async () => {
    try {
      await generateSoapNote();
      const session = useSessionStore.getState().currentSession;
      const soapNote = useSessionStore.getState().soapNote;
      if (session?.id && soapNote) {
        navigation.navigate('SOAPSummary', { sessionId: session.id });
      } else {
        Alert.alert('Error', 'Failed to generate SOAP note. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to generate SOAP note. Please try again.');
    }
  }, [generateSoapNote, navigation]);

  const handleRequestTeleconsult = useCallback(() => {
    // Teleconsult request flow handled externally
  }, []);

  const handleTriggerEmergency = useCallback(() => {
    const session = useSessionStore.getState().currentSession;
    const currentPatient = useSessionStore.getState().patient;
    if (session && currentPatient) {
      navigation.navigate('EmergencyAlert', {
        sessionId: session.id,
        patientId: currentPatient.id,
      });
    }
  }, [navigation]);

  if (!triageResult) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No triage result available</Text>
      </View>
    );
  }

  const config = TRIAGE_CONFIG[triageResult.level];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.triageBadge, { backgroundColor: config.color }]}>
        <Text style={[styles.triageLevelText, { color: config.textColor }]}>
          {triageResult.level}
        </Text>
        <Text style={[styles.triageLabelText, { color: config.textColor }]}>
          {config.label}
        </Text>
      </View>

      <View style={styles.confidenceRow}>
        <Text style={styles.confidenceLabel}>AI Confidence</Text>
        <Text style={styles.confidenceValue}>
          {Math.round(triageResult.confidence * 100)}%
        </Text>
      </View>
      <View style={styles.confidenceBarBackground}>
        <View
          style={[
            styles.confidenceBarFill,
            {
              width: `${Math.round(triageResult.confidence * 100)}%`,
              backgroundColor: config.color,
            },
          ]}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Primary Diagnosis</Text>
        <Text style={styles.diagnosisText}>{triageResult.primaryDiagnosis}</Text>
        <View style={styles.urgencyRow}>
          <Text style={styles.urgencyLabel}>Urgency Score</Text>
          <View
            style={[
              styles.urgencyBadge,
              {
                backgroundColor:
                  triageResult.urgencyScore >= 7
                    ? COLORS.emergency[50]
                    : triageResult.urgencyScore >= 4
                    ? COLORS.warning[50]
                    : COLORS.success[50],
              },
            ]}
          >
            <Text
              style={[
                styles.urgencyValue,
                {
                  color:
                    triageResult.urgencyScore >= 7
                      ? COLORS.emergency[500]
                      : triageResult.urgencyScore >= 4
                      ? COLORS.warning[600]
                      : COLORS.success[500],
                },
              ]}
            >
              {triageResult.urgencyScore}/10
            </Text>
          </View>
        </View>
      </View>

      {triageResult.differentialDiagnoses.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Differential Diagnoses</Text>
          {triageResult.differentialDiagnoses.map((dx, index) => (
            <View key={index} style={styles.differentialItem}>
              <View style={styles.differentialHeader}>
                <Text style={styles.differentialName}>{dx.name}</Text>
                <Text style={styles.differentialConfidence}>
                  {Math.round(dx.confidence * 100)}%
                </Text>
              </View>
              <View style={styles.differentialBarBackground}>
                <View
                  style={[
                    styles.differentialBarFill,
                    {
                      width: `${Math.round(dx.confidence * 100)}%`,
                      backgroundColor: COLORS.primary[400],
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {triageResult.recommendedActions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recommended Actions</Text>
          {triageResult.recommendedActions.map((action, index) => (
            <View key={index} style={styles.actionItem}>
              <View style={styles.actionBullet} />
              <Text style={styles.actionText}>{action}</Text>
            </View>
          ))}
        </View>
      )}

      {triageResult.level === 'A' && triageResult.nurseProtocol && (
        <View style={[styles.card, styles.protocolCard]}>
          <Text style={styles.sectionTitle}>Nurse Protocol</Text>
          <Text style={styles.protocolText}>{triageResult.nurseProtocol}</Text>
        </View>
      )}

      {triageResult.prescriptionSuggestion && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Prescription Suggestion</Text>
          <Text style={styles.protocolText}>{triageResult.prescriptionSuggestion}</Text>
        </View>
      )}

      <View style={styles.actionsContainer}>
        {triageResult.teleconsultRequired && (
          <TouchableOpacity
            style={styles.teleconsultButton}
            onPress={handleRequestTeleconsult}
            activeOpacity={0.8}
          >
            <Text style={styles.teleconsultButtonText}>Request Teleconsult</Text>
          </TouchableOpacity>
        )}

        {triageResult.emergencyRequired && (
          <TouchableOpacity
            style={styles.emergencyButton}
            onPress={handleTriggerEmergency}
            activeOpacity={0.8}
          >
            <Text style={styles.emergencyButtonText}>Trigger Emergency</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.soapButton, isGeneratingSoap && styles.buttonDisabled]}
          onPress={handleGenerateSoap}
          disabled={isGeneratingSoap}
          activeOpacity={0.8}
        >
          {isGeneratingSoap ? (
            <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
          ) : (
            <Text style={styles.soapButtonText}>Generate SOAP Note</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.xl,
    paddingBottom: SPACING['4xl'],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    ...TYPOGRAPHY.styles.bodyLarge,
    color: COLORS.textSecondary,
  },
  triageBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['2xl'],
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
  },
  triageLevelText: {
    fontSize: TYPOGRAPHY.fontSize['5xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    lineHeight: TYPOGRAPHY.fontSize['5xl'] * TYPOGRAPHY.lineHeight.tight,
  },
  triageLabelText: {
    ...TYPOGRAPHY.styles.h4,
    marginTop: SPACING.xs,
  },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  confidenceLabel: {
    ...TYPOGRAPHY.styles.label,
  },
  confidenceValue: {
    ...TYPOGRAPHY.styles.h4,
    color: COLORS.textPrimary,
  },
  confidenceBarBackground: {
    height: 8,
    backgroundColor: COLORS.neutral[200],
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.xl,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.base,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.styles.h4,
    marginBottom: SPACING.md,
  },
  diagnosisText: {
    ...TYPOGRAPHY.styles.bodyLarge,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  urgencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  urgencyLabel: {
    ...TYPOGRAPHY.styles.caption,
  },
  urgencyBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  urgencyValue: {
    ...TYPOGRAPHY.styles.button,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  differentialItem: {
    marginBottom: SPACING.md,
  },
  differentialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  differentialName: {
    ...TYPOGRAPHY.styles.body,
    flex: 1,
  },
  differentialConfidence: {
    ...TYPOGRAPHY.styles.caption,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    marginLeft: SPACING.sm,
  },
  differentialBarBackground: {
    height: 6,
    backgroundColor: COLORS.neutral[200],
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  differentialBarFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.full,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  actionBullet: {
    width: 8,
    height: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary[500],
    marginTop: 7,
    marginRight: SPACING.md,
  },
  actionText: {
    ...TYPOGRAPHY.styles.body,
    flex: 1,
  },
  protocolCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.triageGreen,
  },
  protocolText: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  actionsContainer: {
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  teleconsultButton: {
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  teleconsultButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
  emergencyButton: {
    backgroundColor: COLORS.emergency[500],
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  emergencyButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnEmergency,
  },
  soapButton: {
    backgroundColor: COLORS.primary[700],
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  soapButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
