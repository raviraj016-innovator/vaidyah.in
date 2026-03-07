import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuthStore, HealthCenter } from '../store/authStore';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS, TOUCH_TARGET } from '../config/theme';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

export default function LoginScreen() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isMfaPending = useAuthStore((s) => s.isMfaPending);
  const error = useAuthStore((s) => s.error);
  const availableCenters = useAuthStore((s) => s.availableCenters);
  const language = useAuthStore((s) => s.language);
  const login = useAuthStore((s) => s.login);
  const verifyMfa = useAuthStore((s) => s.verifyMfa);
  const fetchCenters = useAuthStore((s) => s.fetchCenters);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const clearError = useAuthStore((s) => s.clearError);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showCenterPicker, setShowCenterPicker] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

  const selectedCenter = availableCenters.find((c) => c.id === selectedCenterId);

  const handleLogin = useCallback(async () => {
    clearError();
    if (!identifier.trim() || !password.trim() || !selectedCenterId) return;
    await login({ identifier: identifier.trim(), password, centerId: selectedCenterId });
  }, [identifier, password, selectedCenterId, login, clearError]);

  const handleVerifyMfa = useCallback(async () => {
    clearError();
    if (!mfaCode.trim()) return;
    await verifyMfa(mfaCode.trim());
  }, [mfaCode, verifyMfa, clearError]);

  const isLoginDisabled = !identifier.trim() || !password.trim() || !selectedCenterId || isLoading;
  const isMfaDisabled = !mfaCode.trim() || isLoading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Language selector */}
        <View style={styles.languageRow}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.languageChip,
                language === lang.code && styles.languageChipActive,
              ]}
              onPress={() => setLanguage(lang.code)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.languageChipText,
                  language === lang.code && styles.languageChipTextActive,
                ]}
              >
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Branding */}
        <View style={styles.brandingContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>V</Text>
          </View>
          <Text style={styles.appName}>Vaidyah</Text>
          <Text style={styles.tagline}>
            {language === 'hi'
              ? 'ग्रामीण स्वास्थ्य सेवा सहायक'
              : 'Rural Healthcare Assistant'}
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {language === 'hi' ? 'लॉगिन करें' : 'Nurse Login'}
          </Text>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!isMfaPending ? (
            <>
              {/* Staff ID / Phone */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {language === 'hi' ? 'स्टाफ़ ID / फ़ोन' : 'Staff ID / Phone'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder={language === 'hi' ? 'स्टाफ़ ID या फ़ोन नंबर' : 'Staff ID or phone number'}
                  placeholderTextColor={COLORS.textDisabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  returnKeyType="next"
                  editable={!isLoading}
                />
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {language === 'hi' ? 'पासवर्ड' : 'Password'}
                </Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={COLORS.textDisabled}
                    secureTextEntry={!passwordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    style={styles.visibilityToggle}
                    onPress={() => setPasswordVisible((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.visibilityToggleText}>
                      {passwordVisible ? (language === 'hi' ? 'छिपाएँ' : 'Hide') : (language === 'hi' ? 'दिखाएँ' : 'Show')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Center selector */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {language === 'hi' ? 'स्वास्थ्य केंद्र' : 'Health Center'}
                </Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setShowCenterPicker(!showCenterPicker)}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <Text
                    style={[
                      styles.dropdownTriggerText,
                      !selectedCenter && styles.dropdownPlaceholder,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedCenter
                      ? `${selectedCenter.name} (${selectedCenter.type})`
                      : language === 'hi'
                        ? 'केंद्र चुनें'
                        : 'Select center'}
                  </Text>
                  <Text style={styles.dropdownArrow}>{showCenterPicker ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {showCenterPicker && (
                  <View style={styles.dropdownList}>
                    {availableCenters.length === 0 ? (
                      <View style={styles.dropdownItem}>
                        <Text style={styles.dropdownItemTextDisabled}>
                          {language === 'hi' ? 'कोई केंद्र उपलब्ध नहीं' : 'No centers available'}
                        </Text>
                      </View>
                    ) : (
                      availableCenters.map((center: HealthCenter) => (
                        <TouchableOpacity
                          key={center.id}
                          style={[
                            styles.dropdownItem,
                            center.id === selectedCenterId && styles.dropdownItemSelected,
                          ]}
                          onPress={() => {
                            setSelectedCenterId(center.id);
                            setShowCenterPicker(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              center.id === selectedCenterId && styles.dropdownItemTextSelected,
                            ]}
                          >
                            {center.name}
                          </Text>
                          <Text style={styles.dropdownItemMeta}>
                            {center.type} — {center.district}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>

              {/* Login button */}
              <TouchableOpacity
                style={[styles.primaryButton, isLoginDisabled && styles.primaryButtonDisabled]}
                onPress={handleLogin}
                activeOpacity={0.8}
                disabled={isLoginDisabled}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {language === 'hi' ? 'लॉगिन करें' : 'Login'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* MFA entry */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  {language === 'hi' ? 'OTP कोड दर्ज करें' : 'Enter OTP Code'}
                </Text>
                <Text style={styles.mfaHint}>
                  {language === 'hi'
                    ? 'आपके पंजीकृत फ़ोन पर एक कोड भेजा गया है'
                    : 'A code has been sent to your registered phone'}
                </Text>
                <TextInput
                  style={[styles.input, styles.mfaInput]}
                  value={mfaCode}
                  onChangeText={setMfaCode}
                  placeholder="000000"
                  placeholderTextColor={COLORS.textDisabled}
                  keyboardType="number-pad"
                  maxLength={6}
                  textAlign="center"
                  autoFocus
                  editable={!isLoading}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, isMfaDisabled && styles.primaryButtonDisabled]}
                onPress={handleVerifyMfa}
                activeOpacity={0.8}
                disabled={isMfaDisabled}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {language === 'hi' ? 'सत्यापित करें' : 'Verify'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.footer}>Vaidyah v1.0 — Ministry of Health & Family Welfare</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING['3xl'],
  },

  // Language selector
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  languageChip: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  languageChipActive: {
    backgroundColor: COLORS.primary[500],
    borderColor: COLORS.primary[500],
  },
  languageChipText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textSecondary,
  },
  languageChipTextActive: {
    color: COLORS.textOnPrimary,
  },

  // Branding
  brandingContainer: {
    alignItems: 'center',
    marginBottom: SPACING['3xl'],
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.base,
    ...SHADOWS.lg,
  },
  logoText: {
    fontSize: TYPOGRAPHY.fontSize['4xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.textOnPrimary,
  },
  appName: {
    fontSize: TYPOGRAPHY.fontSize['3xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.primary[500],
    marginBottom: SPACING.xs,
  },
  tagline: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textSecondary,
  },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING['2xl'],
    ...SHADOWS.md,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  cardTitle: {
    ...TYPOGRAPHY.styles.h3,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },

  // Error
  errorBanner: {
    backgroundColor: COLORS.emergency[50],
    borderWidth: 1,
    borderColor: COLORS.emergency[200],
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.base,
  },
  errorText: {
    color: COLORS.emergency[700],
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },

  // Fields
  fieldGroup: {
    marginBottom: SPACING.lg,
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

  // Password
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.neutral[50],
  },
  passwordInput: {
    flex: 1,
    height: TOUCH_TARGET.comfortable,
    paddingHorizontal: SPACING.base,
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textPrimary,
  },
  visibilityToggle: {
    paddingHorizontal: SPACING.base,
    height: TOUCH_TARGET.comfortable,
    justifyContent: 'center',
  },
  visibilityToggleText: {
    color: COLORS.primary[500],
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },

  // Dropdown
  dropdownTrigger: {
    height: TOUCH_TARGET.comfortable,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.neutral[50],
  },
  dropdownTriggerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textPrimary,
  },
  dropdownPlaceholder: {
    color: COLORS.textDisabled,
  },
  dropdownArrow: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
    backgroundColor: COLORS.surface,
    maxHeight: 200,
    ...SHADOWS.sm,
  },
  dropdownItem: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  dropdownItemSelected: {
    backgroundColor: COLORS.primary[50],
  },
  dropdownItemText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.textPrimary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  dropdownItemTextSelected: {
    color: COLORS.primary[700],
  },
  dropdownItemTextDisabled: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textDisabled,
    textAlign: 'center',
  },
  dropdownItemMeta: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xxs,
  },

  // MFA
  mfaHint: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  mfaInput: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 8,
  },

  // Buttons
  primaryButton: {
    height: TOUCH_TARGET.comfortable,
    backgroundColor: COLORS.primary[500],
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
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

  // Footer
  footer: {
    textAlign: 'center',
    marginTop: SPACING['2xl'],
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textDisabled,
  },
});
