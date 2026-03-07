import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../store/sessionStore';
import apiClient, { ENDPOINTS } from '../config/api';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TOUCH_TARGET,
  Z_INDEX,
} from '../config/theme';
import type { EmergencyAlertScreenProps } from '../navigation/types';

type EmergencyType =
  | 'cardiac'
  | 'respiratory'
  | 'stroke'
  | 'trauma'
  | 'obstetric'
  | 'snakebite'
  | 'other';

type AlertStatus = 'idle' | 'sending' | 'pending' | 'dispatched';

interface AmbulanceStatus {
  status: AlertStatus;
  eta?: string;
  emergencyId?: string;
}

const EMERGENCY_TYPES: Array<{ key: EmergencyType; label: string }> = [
  { key: 'cardiac', label: 'Cardiac' },
  { key: 'respiratory', label: 'Respiratory' },
  { key: 'stroke', label: 'Stroke' },
  { key: 'trauma', label: 'Trauma' },
  { key: 'obstetric', label: 'Obstetric' },
  { key: 'snakebite', label: 'Snakebite' },
  { key: 'other', label: 'Other' },
];

export default function EmergencyAlertScreen({
  route,
}: EmergencyAlertScreenProps) {
  const { sessionId, patientId } = route.params;
  const currentSession = useSessionStore((s) => s.currentSession);
  const patient = useSessionStore((s) => s.patient);
  const vitals = useSessionStore((s) => s.vitals);

  const [selectedType, setSelectedType] = useState<EmergencyType | null>(null);
  const [ambulanceStatus, setAmbulanceStatus] = useState<AmbulanceStatus>({
    status: 'idle',
  });
  const [hospitalNotified, setHospitalNotified] = useState(false);
  const [isNotifyingHospital, setIsNotifyingHospital] = useState(false);

  // Moved below all hooks to satisfy Rules of Hooks (no conditional returns before hooks)
  const sessionMismatch = currentSession && (currentSession.id !== sessionId || currentSession.patientId !== patientId);

  const handleAlertAmbulance = useCallback(async () => {
    if (!selectedType) {
      Alert.alert('Select Emergency Type', 'Please select an emergency type before alerting.');
      return;
    }

    setAmbulanceStatus({ status: 'sending' });

    try {
      const { data } = await apiClient.post(ENDPOINTS.EMERGENCY_CREATE, {
        sessionId,
        patientId,
        emergencyType: selectedType,
        vitals,
      });

      const emergencyId = data.emergencyId;
      setAmbulanceStatus({ status: 'pending', emergencyId });

      const ambulanceResponse = await apiClient.post(
        ENDPOINTS.EMERGENCY_AMBULANCE(emergencyId),
        { emergencyType: selectedType },
      );

      setAmbulanceStatus({
        status: 'dispatched',
        emergencyId,
        eta: ambulanceResponse.data.eta,
      });
    } catch {
      Alert.alert(
        'Alert Failed',
        'Could not send emergency alert. Please try again or call emergency services directly.',
      );
      setAmbulanceStatus({ status: 'idle' });
    }
  }, [selectedType, sessionId, patientId, vitals]);

  const handleNotifyHospital = useCallback(async () => {
    if (!ambulanceStatus.emergencyId || !selectedType) return;

    setIsNotifyingHospital(true);
    try {
      await apiClient.post(
        ENDPOINTS.EMERGENCY_AMBULANCE(ambulanceStatus.emergencyId),
        { action: 'notify_hospital', emergencyType: selectedType },
      );
      setHospitalNotified(true);
    } catch {
      Alert.alert('Notification Failed', 'Could not notify the referral hospital.');
    } finally {
      setIsNotifyingHospital(false);
    }
  }, [ambulanceStatus.emergencyId, selectedType]);

  const handleCallEmergencyContact = useCallback(() => {
    const phone = patient?.emergencyContact?.phone;
    if (!phone) {
      Alert.alert('No Contact', 'No emergency contact available for this patient.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Error', 'Unable to initiate call. Please dial manually.');
    });
  }, [patient]);

  if (sessionMismatch) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Session mismatch. Please return to the active session.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.emergencyHeader}>
        <Text style={styles.emergencyHeaderText}>EMERGENCY</Text>
      </View>

      <View style={styles.patientCard}>
        <Text style={styles.patientCardTitle}>Patient Information</Text>
        {patient && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{patient.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Age / Gender</Text>
              <Text style={styles.infoValue}>
                {patient.age} yrs / {patient.gender}
              </Text>
            </View>
            {patient.bloodGroup && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Blood Group</Text>
                <Text style={styles.infoValue}>{patient.bloodGroup}</Text>
              </View>
            )}
            {patient.emergencyContact && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Emergency Contact</Text>
                <Text style={styles.infoValue}>
                  {patient.emergencyContact.name} ({patient.emergencyContact.relation})
                </Text>
              </View>
            )}
          </>
        )}
        {vitals && (
          <View style={styles.vitalsRow}>
            {vitals.bloodPressure && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>BP</Text>
                <Text style={styles.vitalValue}>
                  {vitals.bloodPressure.systolic}/{vitals.bloodPressure.diastolic}
                </Text>
              </View>
            )}
            {vitals.pulse !== undefined && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>Pulse</Text>
                <Text style={styles.vitalValue}>{vitals.pulse}</Text>
              </View>
            )}
            {vitals.spO2 !== undefined && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>SpO2</Text>
                <Text style={styles.vitalValue}>{vitals.spO2}%</Text>
              </View>
            )}
            {vitals.temperature && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>Temp</Text>
                <Text style={styles.vitalValue}>
                  {vitals.temperature.value}{vitals.temperature.unit}
                </Text>
              </View>
            )}
            {vitals.respiratoryRate !== undefined && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalLabel}>RR</Text>
                <Text style={styles.vitalValue}>{vitals.respiratoryRate}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.typeSection}>
        <Text style={styles.typeSectionTitle}>Emergency Type</Text>
        <View style={styles.typeGrid}>
          {EMERGENCY_TYPES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.typeChip,
                selectedType === key && styles.typeChipSelected,
              ]}
              onPress={() => setSelectedType(key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeChipText,
                  selectedType === key && styles.typeChipTextSelected,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {ambulanceStatus.status !== 'idle' && (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Alert Status</Text>
          {ambulanceStatus.status === 'sending' && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={COLORS.emergency[500]} />
              <Text style={styles.statusSending}>Sending alert...</Text>
            </View>
          )}
          {ambulanceStatus.status === 'pending' && (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, styles.statusDotPending]} />
              <Text style={styles.statusPending}>
                Alert sent. Awaiting ambulance dispatch.
              </Text>
            </View>
          )}
          {ambulanceStatus.status === 'dispatched' && (
            <>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, styles.statusDotDispatched]} />
                <Text style={styles.statusDispatched}>Ambulance dispatched</Text>
              </View>
              {ambulanceStatus.eta && (
                <Text style={styles.etaText}>ETA: {ambulanceStatus.eta}</Text>
              )}
            </>
          )}
        </View>
      )}

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[
            styles.ambulanceButton,
            (ambulanceStatus.status === 'sending' ||
              ambulanceStatus.status === 'dispatched') &&
              styles.buttonDisabled,
          ]}
          onPress={handleAlertAmbulance}
          disabled={
            ambulanceStatus.status === 'sending' ||
            ambulanceStatus.status === 'dispatched'
          }
          activeOpacity={0.8}
        >
          {ambulanceStatus.status === 'sending' ? (
            <ActivityIndicator size="small" color={COLORS.textOnEmergency} />
          ) : (
            <Text style={styles.ambulanceButtonText}>ALERT AMBULANCE</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.hospitalButton,
            (isNotifyingHospital || hospitalNotified || !ambulanceStatus.emergencyId) &&
              styles.buttonDisabled,
          ]}
          onPress={handleNotifyHospital}
          disabled={isNotifyingHospital || hospitalNotified || !ambulanceStatus.emergencyId}
          activeOpacity={0.8}
        >
          {isNotifyingHospital ? (
            <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
          ) : (
            <Text style={styles.hospitalButtonText}>
              {hospitalNotified ? 'HOSPITAL NOTIFIED' : 'NOTIFY REFERRAL HOSPITAL'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.contactButton,
            !patient?.emergencyContact && styles.buttonDisabled,
          ]}
          onPress={handleCallEmergencyContact}
          disabled={!patient?.emergencyContact}
          activeOpacity={0.8}
        >
          <Text style={styles.contactButtonText}>CALL EMERGENCY CONTACT</Text>
          {patient?.emergencyContact && (
            <Text style={styles.contactSubtext}>
              {patient.emergencyContact.name} - {patient.emergencyContact.phone}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.call108Button}
          onPress={() => {
            Linking.openURL('tel:108').catch(() => {
              Alert.alert('Error', 'Unable to initiate call.');
            });
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="call" size={24} color="#FFFFFF" />
          <Text style={styles.call108Text}>Call 108</Text>
          <Text style={styles.call108Subtext}>National Ambulance Service</Text>
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
  errorText: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.emergency[500],
    textAlign: 'center' as const,
    padding: SPACING.xl,
  },
  content: {
    padding: SPACING.xl,
    paddingBottom: SPACING['4xl'],
  },
  emergencyHeader: {
    backgroundColor: COLORS.emergency[500],
    paddingVertical: SPACING['2xl'],
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
    zIndex: Z_INDEX.emergency,
  },
  emergencyHeaderText: {
    fontSize: TYPOGRAPHY.fontSize['4xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textOnEmergency,
    letterSpacing: 4,
  },
  patientCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.base,
    ...SHADOWS.sm,
  },
  patientCardTitle: {
    ...TYPOGRAPHY.styles.h4,
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  infoLabel: {
    ...TYPOGRAPHY.styles.caption,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  infoValue: {
    ...TYPOGRAPHY.styles.body,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  vitalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  vitalItem: {
    backgroundColor: COLORS.emergency[50],
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    minWidth: 72,
  },
  vitalLabel: {
    ...TYPOGRAPHY.styles.caption,
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
  },
  vitalValue: {
    ...TYPOGRAPHY.styles.body,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.emergency[600],
  },
  typeSection: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.base,
    ...SHADOWS.sm,
  },
  typeSectionTitle: {
    ...TYPOGRAPHY.styles.h4,
    marginBottom: SPACING.md,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  typeChip: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.neutral[300],
    backgroundColor: COLORS.neutral[50],
    minHeight: TOUCH_TARGET.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeChipSelected: {
    borderColor: COLORS.emergency[500],
    backgroundColor: COLORS.emergency[50],
  },
  typeChipText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textSecondary,
  },
  typeChipTextSelected: {
    color: COLORS.emergency[500],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.base,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.emergency[500],
    ...SHADOWS.sm,
  },
  statusTitle: {
    ...TYPOGRAPHY.styles.label,
    marginBottom: SPACING.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: BORDER_RADIUS.full,
  },
  statusDotPending: {
    backgroundColor: COLORS.warning[500],
  },
  statusDotDispatched: {
    backgroundColor: COLORS.success[500],
  },
  statusSending: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.emergency[500],
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  statusPending: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.warning[600],
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  statusDispatched: {
    ...TYPOGRAPHY.styles.body,
    color: COLORS.success[500],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  etaText: {
    ...TYPOGRAPHY.styles.h3,
    color: COLORS.success[700],
    marginTop: SPACING.sm,
  },
  actionsContainer: {
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  ambulanceButton: {
    backgroundColor: COLORS.emergency[500],
    paddingVertical: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.large,
    justifyContent: 'center',
    ...SHADOWS.lg,
  },
  ambulanceButtonText: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textOnEmergency,
    letterSpacing: 2,
  },
  hospitalButton: {
    backgroundColor: COLORS.primary[700],
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  hospitalButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
  contactButton: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.base,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.emergency[500],
    ...SHADOWS.sm,
  },
  contactButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.emergency[500],
  },
  contactSubtext: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.xxs,
  },
  call108Button: {
    backgroundColor: COLORS.emergency[600],
    paddingVertical: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    minHeight: TOUCH_TARGET.large,
    justifyContent: 'center',
    ...SHADOWS.lg,
  },
  call108Text: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textOnEmergency,
    marginTop: SPACING.sm,
  },
  call108Subtext: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: SPACING.xxs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
