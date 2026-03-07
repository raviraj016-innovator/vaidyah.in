import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { useSessionStore, PatientInfo } from '../store/sessionStore';
import { useAuthStore } from '../store/authStore';
import apiClient, { ENDPOINTS } from '../config/api';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS, TOUCH_TARGET } from '../config/theme';
import type { PatientIntakeScreenProps } from '../navigation/types';

type Gender = 'male' | 'female' | 'other';

const GENDER_OPTIONS: { value: Gender; label: string; labelHi: string }[] = [
  { value: 'male', label: 'Male', labelHi: 'पुरुष' },
  { value: 'female', label: 'Female', labelHi: 'महिला' },
  { value: 'other', label: 'Other', labelHi: 'अन्य' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface RecentPatient {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  lastVisit: string;
}

export default function PatientIntakeScreen({ navigation }: PatientIntakeScreenProps) {
  const startSession = useSessionStore((s) => s.startSession);
  const isProcessing = useSessionStore((s) => s.isProcessing);
  const language = useAuthStore((s) => s.language);

  // ABDM lookup
  const [abdmId, setAbdmId] = useState('');
  const [abdmSearching, setAbdmSearching] = useState(false);
  const [abdmResult, setAbdmResult] = useState<PatientInfo | null>(null);

  // Manual entry
  const [showManualForm, setShowManualForm] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');

  // Recent patients
  const [recentPatients, setRecentPatients] = useState<RecentPatient[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentLoaded, setRecentLoaded] = useState(false);

  const loadRecentPatients = useCallback(async () => {
    if (recentLoaded) return;
    setRecentLoaded(true); // Set before API call to prevent race condition on double-mount
    setLoadingRecent(true);
    try {
      const { data } = await apiClient.get(ENDPOINTS.SESSION_LIST, {
        params: { limit: 10, status: 'completed' },
      });
      const patients: RecentPatient[] = (data.sessions ?? []).map((s: any) => ({
        id: s.patientId,
        name: s.patientName ?? 'Unknown',
        age: s.patientAge ?? 0,
        gender: s.patientGender ?? 'other',
        phone: s.patientPhone ?? '',
        lastVisit: s.completedAt ?? s.startedAt,
      }));
      setRecentPatients(patients);
    } catch {
      setRecentLoaded(false); // Allow retry on failure
    } finally {
      setLoadingRecent(false);
    }
  }, [recentLoaded]);

  React.useEffect(() => {
    loadRecentPatients();
  }, [loadRecentPatients]);

  const handleAbdmLookup = useCallback(async () => {
    if (!abdmId.trim()) return;
    setAbdmSearching(true);
    setAbdmResult(null);
    try {
      const { data } = await apiClient.get(ENDPOINTS.PATIENT_ABDM_LOOKUP, {
        params: { abdmId: abdmId.trim() },
      });
      if (data.patient) {
        setAbdmResult(data.patient);
      } else {
        Alert.alert(
          language === 'hi' ? 'नहीं मिला' : 'Not Found',
          language === 'hi'
            ? 'इस ABDM ID से कोई मरीज़ नहीं मिला'
            : 'No patient found with this ABDM ID',
        );
      }
    } catch {
      Alert.alert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        language === 'hi'
          ? 'ABDM खोज विफल रही। कृपया पुन: प्रयास करें।'
          : 'ABDM lookup failed. Please try again.',
      );
    } finally {
      setAbdmSearching(false);
    }
  }, [abdmId, language]);

  const handleStartWithPatient = useCallback(
    async (patient: PatientInfo) => {
      try {
        await startSession(patient);
        const session = useSessionStore.getState().currentSession;
        if (session) {
          navigation.navigate('Consultation', { sessionId: session.id });
        } else {
          Alert.alert('Error', 'Failed to start session. Please try again.');
        }
      } catch {
        Alert.alert('Error', 'Failed to start consultation. Please try again.');
      }
    },
    [startSession, navigation],
  );

  const handleStartWithManualEntry = useCallback(async () => {
    if (!name.trim() || !age.trim() || !phone.trim()) return;

    const parsedAge = parseInt(age, 10);
    if (isNaN(parsedAge) || parsedAge <= 0 || parsedAge > 150) {
      Alert.alert('Invalid Age', 'Please enter a valid age between 1 and 150.');
      return;
    }

    // Validate name: max 100 chars, letters/spaces/hyphens/dots only (Unicode-aware)
    const trimmedName = name.trim().slice(0, 100);
    if (!/^[\p{L}\s.\-']+$/u.test(trimmedName)) {
      Alert.alert('Invalid Name', 'Name can only contain letters, spaces, hyphens, and dots.');
      return;
    }

    // Validate phone: digits with optional leading +, 10-13 digits
    const trimmedPhone = phone.trim().replace(/[\s()-]/g, '');
    if (!/^\+?[0-9]{10,13}$/.test(trimmedPhone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number (10-13 digits).');
      return;
    }

    // Sanitize address: strip control characters, max 500 chars
    const sanitizedAddress = address.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 500);

    // Sanitize allergies/conditions: max 200 chars per entry
    const sanitizedAllergies = allergies.trim()
      ? allergies.split(',').map((a) => a.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200)).filter(Boolean)
      : undefined;
    const sanitizedConditions = chronicConditions.trim()
      ? chronicConditions.split(',').map((c) => c.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200)).filter(Boolean)
      : undefined;

    const patient: PatientInfo = {
      id: `local_${Date.now()}`,
      name: trimmedName,
      age: parsedAge,
      gender,
      phone: trimmedPhone,
      languagePreference: language,
      address: sanitizedAddress || undefined,
      bloodGroup: bloodGroup || undefined,
      allergies: sanitizedAllergies,
      chronicConditions: sanitizedConditions,
    };

    try {
      const { data } = await apiClient.post(ENDPOINTS.PATIENT_CREATE, patient);
      if (data.patient?.id) {
        patient.id = data.patient.id;
      }
    } catch {
      // Offline - use local ID
    }

    await handleStartWithPatient(patient);
  }, [
    name, age, gender, phone, address, bloodGroup, allergies,
    chronicConditions, language, handleStartWithPatient,
  ]);

  const handleSelectRecent = useCallback(
    async (recent: RecentPatient) => {
      try {
        const { data } = await apiClient.get(ENDPOINTS.PATIENT_GET(recent.id));
        await handleStartWithPatient(data.patient);
      } catch {
        const fallback: PatientInfo = {
          id: recent.id,
          name: recent.name,
          age: recent.age,
          gender: recent.gender,
          phone: recent.phone,
          languagePreference: language,
        };
        await handleStartWithPatient(fallback);
      }
    },
    [handleStartWithPatient, language],
  );

  const isManualFormValid = name.trim() && age.trim() && phone.trim();

  const renderRecentItem = useCallback(
    ({ item }: { item: RecentPatient }) => (
      <TouchableOpacity
        style={styles.recentItem}
        onPress={() => handleSelectRecent(item)}
        activeOpacity={0.7}
      >
        <View style={styles.recentAvatar}>
          <Text style={styles.recentAvatarText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.recentInfo}>
          <Text style={styles.recentName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.recentMeta}>
            {item.age}y, {item.gender === 'male' ? 'M' : item.gender === 'female' ? 'F' : 'O'} — {item.phone}
          </Text>
        </View>
        <Text style={styles.recentArrow}>›</Text>
      </TouchableOpacity>
    ),
    [handleSelectRecent],
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ABDM Lookup */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {language === 'hi' ? 'ABDM ID से खोजें' : 'ABDM ID Lookup'}
        </Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={abdmId}
            onChangeText={setAbdmId}
            placeholder={language === 'hi' ? 'ABDM ID दर्ज करें' : 'Enter ABDM Health ID'}
            placeholderTextColor={COLORS.textDisabled}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.searchButton, (!abdmId.trim() || abdmSearching) && styles.searchButtonDisabled]}
            onPress={handleAbdmLookup}
            disabled={!abdmId.trim() || abdmSearching}
            activeOpacity={0.8}
          >
            {abdmSearching ? (
              <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
            ) : (
              <Text style={styles.searchButtonText}>
                {language === 'hi' ? 'खोजें' : 'Search'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {abdmResult && (
          <View style={styles.abdmResultCard}>
            <Text style={styles.abdmResultName}>{abdmResult.name}</Text>
            <Text style={styles.abdmResultMeta}>
              {abdmResult.age}y, {abdmResult.gender} — {abdmResult.phone}
            </Text>
            {abdmResult.address && (
              <Text style={styles.abdmResultMeta}>{abdmResult.address}</Text>
            )}
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => handleStartWithPatient(abdmResult)}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.selectButtonText}>
                  {language === 'hi' ? 'परामर्श शुरू करें' : 'Start Consultation'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>
          {language === 'hi' ? 'या' : 'OR'}
        </Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Manual entry toggle */}
      {!showManualForm ? (
        <TouchableOpacity
          style={styles.outlineButton}
          onPress={() => setShowManualForm(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.outlineButtonText}>
            {language === 'hi' ? 'मैन्युअल रूप से विवरण दर्ज करें' : 'Enter Details Manually'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'hi' ? 'मरीज़ का विवरण' : 'Patient Details'}
          </Text>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {language === 'hi' ? 'नाम *' : 'Full Name *'}
            </Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={language === 'hi' ? 'मरीज़ का पूरा नाम' : 'Patient full name'}
              placeholderTextColor={COLORS.textDisabled}
              autoCapitalize="words"
            />
          </View>

          {/* Age + Gender row */}
          <View style={styles.row}>
            <View style={[styles.fieldGroup, styles.flex1]}>
              <Text style={styles.label}>
                {language === 'hi' ? 'उम्र *' : 'Age *'}
              </Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                placeholder="0"
                placeholderTextColor={COLORS.textDisabled}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
            <View style={[styles.fieldGroup, styles.flex2]}>
              <Text style={styles.label}>
                {language === 'hi' ? 'लिंग *' : 'Gender *'}
              </Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.genderChip,
                      gender === opt.value && styles.genderChipActive,
                    ]}
                    onPress={() => setGender(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.genderChipText,
                        gender === opt.value && styles.genderChipTextActive,
                      ]}
                    >
                      {language === 'hi' ? opt.labelHi : opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {language === 'hi' ? 'फ़ोन नंबर *' : 'Phone Number *'}
            </Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 XXXXX XXXXX"
              placeholderTextColor={COLORS.textDisabled}
              keyboardType="phone-pad"
              maxLength={15}
            />
          </View>

          {/* Address */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {language === 'hi' ? 'पता' : 'Address'}
            </Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={address}
              onChangeText={setAddress}
              placeholder={language === 'hi' ? 'गाँव / शहर, ज़िला' : 'Village / Town, District'}
              placeholderTextColor={COLORS.textDisabled}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>

          {/* Blood Group */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {language === 'hi' ? 'रक्त समूह' : 'Blood Group'}
            </Text>
            <View style={styles.chipRow}>
              {BLOOD_GROUPS.map((bg) => (
                <TouchableOpacity
                  key={bg}
                  style={[
                    styles.bloodChip,
                    bloodGroup === bg && styles.bloodChipActive,
                  ]}
                  onPress={() => setBloodGroup(bloodGroup === bg ? '' : bg)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.bloodChipText,
                      bloodGroup === bg && styles.bloodChipTextActive,
                    ]}
                  >
                    {bg}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Allergies */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {language === 'hi' ? 'एलर्जी' : 'Allergies'}
            </Text>
            <TextInput
              style={styles.input}
              value={allergies}
              onChangeText={setAllergies}
              placeholder={language === 'hi' ? 'कॉमा से अलग करें' : 'Comma-separated (e.g. Penicillin, Dust)'}
              placeholderTextColor={COLORS.textDisabled}
              autoCapitalize="words"
            />
          </View>

          {/* Chronic conditions */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {language === 'hi' ? 'पुरानी बीमारियाँ' : 'Chronic Conditions'}
            </Text>
            <TextInput
              style={styles.input}
              value={chronicConditions}
              onChangeText={setChronicConditions}
              placeholder={language === 'hi' ? 'कॉमा से अलग करें' : 'Comma-separated (e.g. Diabetes, Hypertension)'}
              placeholderTextColor={COLORS.textDisabled}
              autoCapitalize="words"
            />
          </View>

          {/* Start consultation */}
          <TouchableOpacity
            style={[styles.primaryButton, (!isManualFormValid || isProcessing) && styles.primaryButtonDisabled]}
            onPress={handleStartWithManualEntry}
            disabled={!isManualFormValid || isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {language === 'hi' ? 'परामर्श शुरू करें' : 'Start Consultation'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Recent patients */}
      {recentPatients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'hi' ? 'हाल के मरीज़' : 'Recent Patients'}
          </Text>
          <View style={styles.recentList}>
            {recentPatients.map((item) => (
              <React.Fragment key={item.id}>
                {renderRecentItem({ item })}
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {loadingRecent && (
        <ActivityIndicator
          color={COLORS.primary[500]}
          style={styles.recentLoader}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.xl,
    paddingBottom: SPACING['4xl'],
  },

  // Sections
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.styles.h4,
    marginBottom: SPACING.base,
  },

  // ABDM search
  searchRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    height: TOUCH_TARGET.comfortable,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.base,
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.neutral[50],
  },
  searchButton: {
    height: TOUCH_TARGET.comfortable,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.primary[500],
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: COLORS.neutral[400],
  },
  searchButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textOnPrimary,
  },

  // ABDM result
  abdmResultCard: {
    marginTop: SPACING.base,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.success[200],
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success[50],
  },
  abdmResultName: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textPrimary,
  },
  abdmResultMeta: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xxs,
  },
  selectButton: {
    height: TOUCH_TARGET.minimum,
    backgroundColor: COLORS.success[500],
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  selectButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textOnPrimary,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: SPACING.base,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textSecondary,
  },

  // Outline button
  outlineButton: {
    height: TOUCH_TARGET.comfortable,
    borderWidth: 2,
    borderColor: COLORS.primary[500],
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.lg,
  },
  outlineButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.primary[500],
  },

  // Form fields
  fieldGroup: {
    marginBottom: SPACING.base,
  },
  label: {
    ...TYPOGRAPHY.styles.label,
    marginBottom: SPACING.xs,
  },
  input: {
    height: TOUCH_TARGET.comfortable,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.base,
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.neutral[50],
  },
  multilineInput: {
    height: 80,
    paddingTop: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.base,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },

  // Gender chips
  genderRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  genderChip: {
    flex: 1,
    height: TOUCH_TARGET.comfortable,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.neutral[50],
  },
  genderChipActive: {
    backgroundColor: COLORS.primary[500],
    borderColor: COLORS.primary[500],
  },
  genderChipText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  genderChipTextActive: {
    color: COLORS.textOnPrimary,
  },

  // Blood group chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  bloodChip: {
    minWidth: 48,
    height: TOUCH_TARGET.minimum,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.neutral[50],
  },
  bloodChipActive: {
    backgroundColor: COLORS.emergency[500],
    borderColor: COLORS.emergency[500],
  },
  bloodChipText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textSecondary,
  },
  bloodChipTextActive: {
    color: COLORS.textOnEmergency,
  },

  // Primary button
  primaryButton: {
    height: TOUCH_TARGET.large,
    backgroundColor: COLORS.primary[500],
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.lg,
    ...SHADOWS.sm,
  },
  primaryButtonDisabled: {
    backgroundColor: COLORS.neutral[400],
    ...SHADOWS.none,
  },
  primaryButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },

  // Recent patients
  recentList: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.base,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    minHeight: TOUCH_TARGET.comfortable,
  },
  recentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  recentAvatarText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.primary[700],
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: TYPOGRAPHY.fontSize.base,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textPrimary,
  },
  recentMeta: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xxs,
  },
  recentArrow: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    color: COLORS.textDisabled,
    marginLeft: SPACING.sm,
  },
  recentLoader: {
    marginTop: SPACING.lg,
  },
});
