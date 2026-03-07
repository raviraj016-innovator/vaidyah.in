import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useSessionStore, SOAPNote } from '../store/sessionStore';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TOUCH_TARGET,
} from '../config/theme';
import type { SOAPSummaryScreenProps } from '../navigation/types';

const STATUS_CONFIG: Record<SOAPNote['status'], { color: string; bgColor: string; label: string }> = {
  draft: { color: COLORS.warning[600], bgColor: COLORS.warning[50], label: 'Draft' },
  reviewed: { color: COLORS.primary[600], bgColor: COLORS.primary[50], label: 'Reviewed' },
  finalized: { color: COLORS.success[500], bgColor: COLORS.success[50], label: 'Finalized' },
};

const SECTIONS: Array<{ key: keyof Pick<SOAPNote, 'subjective' | 'objective' | 'assessment' | 'plan'>; label: string }> = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective', label: 'Objective' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan', label: 'Plan' },
];

export default function SOAPSummaryScreen({ navigation }: SOAPSummaryScreenProps) {
  const soapNote = useSessionStore((s) => s.soapNote);
  const isGeneratingSoap = useSessionStore((s) => s.isGeneratingSoap);
  const isProcessing = useSessionStore((s) => s.isProcessing);
  const updateSoapNote = useSessionStore((s) => s.updateSoapNote);
  const finalizeSoapNote = useSessionStore((s) => s.finalizeSoapNote);
  const completeSession = useSessionStore((s) => s.completeSession);

  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  });

  useEffect(() => {
    if (soapNote && !isEditing) {
      setEditValues({
        subjective: soapNote.subjective,
        objective: soapNote.objective,
        assessment: soapNote.assessment,
        plan: soapNote.plan,
      });
    }
  }, [soapNote, isEditing]);

  const handleToggleEdit = useCallback(() => {
    if (soapNote?.status === 'finalized') return;
    // Always refresh editValues from latest soapNote (entering or exiting edit)
    if (soapNote) {
      setEditValues({
        subjective: soapNote.subjective,
        objective: soapNote.objective,
        assessment: soapNote.assessment,
        plan: soapNote.plan,
      });
    }
    setIsEditing((prev) => !prev);
  }, [soapNote]);

  const handleSaveChanges = useCallback(() => {
    updateSoapNote({
      subjective: editValues.subjective,
      objective: editValues.objective,
      assessment: editValues.assessment,
      plan: editValues.plan,
      status: 'reviewed',
    });
    setIsEditing(false);
  }, [editValues, updateSoapNote]);

  const handleFinalize = useCallback(() => {
    Alert.alert(
      'Finalize SOAP Note',
      'This will send the SOAP note to the doctor. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize & Send',
          style: 'destructive',
          onPress: async () => {
            try {
              await finalizeSoapNote();
            } catch {
              Alert.alert('Error', 'Failed to finalize SOAP note. Please try again.');
            }
          },
        },
      ],
    );
  }, [finalizeSoapNote]);

  const handleCompleteSession = useCallback(async () => {
    try {
      await completeSession();
      useSessionStore.getState().resetSession();
      navigation.reset({ index: 0, routes: [{ name: 'Dashboard' as any }] });
    } catch {
      Alert.alert('Error', 'Failed to complete session. Please try again.');
    }
  }, [completeSession, navigation]);

  const handleFieldChange = useCallback(
    (key: keyof typeof editValues, value: string) => {
      setEditValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  if (isGeneratingSoap) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary[500]} />
        <Text style={styles.loadingText}>Generating SOAP Note...</Text>
      </View>
    );
  }

  if (!soapNote) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No SOAP note available</Text>
      </View>
    );
  }

  const statusConfig = STATUS_CONFIG[soapNote.status] ?? STATUS_CONFIG.draft;
  const isFinalized = soapNote.status === 'finalized';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
          <Text style={[styles.statusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
        {!isFinalized && (
          <TouchableOpacity
            style={[styles.editToggle, isEditing && styles.editToggleActive]}
            onPress={handleToggleEdit}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.editToggleText,
                isEditing && styles.editToggleTextActive,
              ]}
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {SECTIONS.map(({ key, label }) => (
        <View key={key} style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>{label}</Text>
          {isEditing ? (
            <TextInput
              style={styles.sectionInput}
              value={editValues[key]}
              onChangeText={(text) => handleFieldChange(key, text)}
              multiline
              textAlignVertical="top"
              editable={!isFinalized}
            />
          ) : (
            <Text style={styles.sectionContent}>{soapNote[key]}</Text>
          )}
        </View>
      ))}

      {soapNote.generatedAt && (
        <Text style={styles.timestamp}>
          Generated: {new Date(soapNote.generatedAt).toLocaleString()}
        </Text>
      )}
      {soapNote.reviewedBy && soapNote.reviewedAt && (
        <Text style={styles.timestamp}>
          Reviewed by {soapNote.reviewedBy} at{' '}
          {new Date(soapNote.reviewedAt).toLocaleString()}
        </Text>
      )}

      <View style={styles.actionsContainer}>
        {isEditing && (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveChanges}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>
        )}

        {!isFinalized && !isEditing && (
          <TouchableOpacity
            style={[styles.finalizeButton, isProcessing && styles.buttonDisabled]}
            onPress={handleFinalize}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.finalizeButtonText}>
                Finalize & Send to Doctor
              </Text>
            )}
          </TouchableOpacity>
        )}

        {isFinalized && (
          <TouchableOpacity
            style={[styles.completeButton, isProcessing && styles.buttonDisabled]}
            onPress={handleCompleteSession}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.completeButtonText}>Complete Session</Text>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.navRow}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Dashboard' as any }] })}
            activeOpacity={0.7}
          >
            <Text style={styles.navButtonText}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButtonPrimary}
            onPress={() => {
              useSessionStore.getState().resetSession();
              navigation.navigate('PatientIntake' as any);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.navButtonPrimaryText}>New Consultation</Text>
          </TouchableOpacity>
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    ...TYPOGRAPHY.styles.bodyLarge,
    color: COLORS.textSecondary,
    marginTop: SPACING.base,
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  statusBadge: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  statusText: {
    ...TYPOGRAPHY.styles.label,
  },
  editToggle: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary[500],
    minHeight: TOUCH_TARGET.minimum,
    justifyContent: 'center',
  },
  editToggleActive: {
    backgroundColor: COLORS.neutral[100],
    borderColor: COLORS.neutral[400],
  },
  editToggleText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.primary[500],
  },
  editToggleTextActive: {
    color: COLORS.textSecondary,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  sectionLabel: {
    ...TYPOGRAPHY.styles.label,
    marginBottom: SPACING.sm,
  },
  sectionContent: {
    ...TYPOGRAPHY.styles.body,
    lineHeight: 24,
  },
  sectionInput: {
    ...TYPOGRAPHY.styles.body,
    borderWidth: 1,
    borderColor: COLORS.borderFocus,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    minHeight: 120,
    backgroundColor: COLORS.neutral[50],
    lineHeight: 24,
  },
  timestamp: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textDisabled,
    marginBottom: SPACING.xs,
  },
  actionsContainer: {
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },
  saveButton: {
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  saveButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
  finalizeButton: {
    backgroundColor: COLORS.success[500],
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  finalizeButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
  completeButton: {
    backgroundColor: COLORS.primary[700],
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  completeButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
  navRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  navButton: {
    flex: 1,
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  navButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textSecondary,
  },
  navButtonPrimary: {
    flex: 1,
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    backgroundColor: COLORS.primary[500],
  },
  navButtonPrimaryText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textOnPrimary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
