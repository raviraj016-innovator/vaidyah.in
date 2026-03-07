/**
 * Login screen — OTP-based authentication with optional ABDM Health ID.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../store/authStore';
import { COLORS, FONTS, SPACING, RADIUS } from '../config/theme';

export default function LoginScreen() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isOtpSent = useAuthStore((s) => s.isOtpSent);
  const error = useAuthStore((s) => s.error);
  const language = useAuthStore((s) => s.language);
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const clearError = useAuthStore((s) => s.clearError);
  const resetOtpFlow = useAuthStore((s) => s.resetOtpFlow);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isHi = language === 'hi';

  const isValidPhone = /^\+?[0-9]{10,13}$/.test(phone.trim());

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown <= 0) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [resendCountdown]);

  const handleSendOtp = () => {
    if (!isValidPhone) return;
    clearError();
    sendOtp(phone.trim());
    setResendCountdown(30);
  };

  const handleResendOtp = () => {
    if (resendCountdown > 0 || isLoading) return;
    clearError();
    sendOtp(phone.trim());
    setResendCountdown(30);
  };

  const handleVerify = () => {
    clearError();
    verifyOtp(otp);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Language toggle */}
        <View style={styles.langRow}>
          <TouchableOpacity onPress={() => setLanguage('en')} style={[styles.langBtn, !isHi && styles.langActive]}>
            <Text style={[styles.langText, !isHi && styles.langTextActive]}>EN</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLanguage('hi')} style={[styles.langBtn, isHi && styles.langActive]}>
            <Text style={[styles.langText, isHi && styles.langTextActive]}>हिं</Text>
          </TouchableOpacity>
        </View>

        {/* Brand */}
        <Text style={styles.brand}>Vaidyah</Text>
        <Text style={styles.tagline}>
          {isHi
            ? 'आपके स्वास्थ्य का डिजिटल साथी'
            : 'Your Digital Health Companion'}
        </Text>

        {/* Form */}
        {!isOtpSent ? (
          <View style={styles.form}>
            <Text style={styles.label}>
              {isHi ? 'मोबाइल नंबर' : 'Mobile Number'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="+91 XXXXX XXXXX"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={13}
              textContentType="telephoneNumber"
              autoComplete="tel"
              accessibilityLabel={isHi ? 'फ़ोन नंबर' : 'Phone number'}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
              onPress={handleSendOtp}
              disabled={isLoading || !isValidPhone}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isHi ? 'OTP भेजें' : 'Send OTP'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>
              {isHi ? 'OTP दर्ज करें' : 'Enter OTP'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="------"
              placeholderTextColor={COLORS.placeholder}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              secureTextEntry
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              accessibilityLabel={isHi ? 'OTP कोड' : 'OTP code'}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
              onPress={handleVerify}
              disabled={isLoading || otp.length < 6}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isHi ? 'सत्यापित करें' : 'Verify'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResendOtp}
              style={styles.linkBtn}
              disabled={resendCountdown > 0 || isLoading}
            >
              <Text style={[styles.linkText, resendCountdown > 0 && { color: COLORS.textTertiary }]}>
                {resendCountdown > 0
                  ? (isHi ? `${resendCountdown}s में पुनः भेजें` : `Resend in ${resendCountdown}s`)
                  : (isHi ? 'OTP पुनः भेजें' : 'Resend OTP')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={resetOtpFlow} style={styles.linkBtn}>
              <Text style={styles.linkText}>
                {isHi ? 'नंबर बदलें' : 'Change number'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error */}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  langRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.xxl },
  langBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: SPACING.xxs,
  },
  langActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  langText: { ...FONTS.labelMedium, color: COLORS.textSecondary },
  langTextActive: { color: COLORS.textOnPrimary },
  brand: {
    ...FONTS.displayLarge,
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  tagline: {
    ...FONTS.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xxxl,
  },
  form: { marginBottom: SPACING.lg },
  label: { ...FONTS.labelLarge, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...FONTS.bodyLarge,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { ...FONTS.labelLarge, color: COLORS.textOnPrimary },
  linkBtn: { alignItems: 'center', marginTop: SPACING.md },
  linkText: { ...FONTS.bodyMedium, color: COLORS.textLink },
  error: {
    ...FONTS.bodySmall,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});
