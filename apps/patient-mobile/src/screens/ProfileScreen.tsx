/**
 * Profile screen — patient details, conditions, medications, settings.
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../config/theme';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const language = useAuthStore((s) => s.language);
  const logout = useAuthStore((s) => s.logout);
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const isHi = language === 'hi';

  const handleLogout = () => {
    Alert.alert(
      isHi ? 'लॉग आउट' : 'Log Out',
      isHi ? 'क्या आप लॉग आउट करना चाहते हैं?' : 'Are you sure you want to log out?',
      [
        { text: isHi ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        { text: isHi ? 'लॉग आउट' : 'Log Out', style: 'destructive', onPress: logout },
      ],
    );
  };

  const InfoRow = ({ label, value }: { label: string; value?: string }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value ?? '—'}</Text>
    </View>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.screenTitle}>
          {isHi ? 'प्रोफ़ाइल' : 'Profile'}
        </Text>
        {/* Avatar + Name */}
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name ?? (isHi ? 'मरीज़' : 'Patient')}</Text>
            <Text style={styles.phone}>{user?.phone ?? ''}</Text>
          </View>
        </View>

        {/* Basic Info */}
        <Section title={isHi ? 'बुनियादी जानकारी' : 'Basic Info'}>
          <InfoRow label={isHi ? 'ABDM ID' : 'ABDM ID'} value={user?.abdmId} />
          <InfoRow label={isHi ? 'आयु' : 'Age'} value={user?.age?.toString()} />
          <InfoRow label={isHi ? 'लिंग' : 'Gender'} value={user?.gender} />
          <InfoRow
            label={isHi ? 'स्थान' : 'Location'}
            value={user?.location ? `${user.location.city}, ${user.location.state}` : undefined}
          />
        </Section>

        {/* Conditions */}
        <Section title={isHi ? 'स्वास्थ्य स्थितियाँ' : 'Health Conditions'}>
          {(user?.conditions ?? []).length > 0 ? (
            (user?.conditions ?? []).map((c, i) => (
              <Text key={i} style={styles.chipItem}>{`\u2022  ${c}`}</Text>
            ))
          ) : (
            <Text style={styles.emptyHint}>
              {isHi ? 'कोई स्थिति नहीं जोड़ी गई' : 'No conditions added'}
            </Text>
          )}
        </Section>

        {/* Medications */}
        <Section title={isHi ? 'दवाइयाँ' : 'Medications'}>
          {(user?.medications ?? []).length > 0 ? (
            (user?.medications ?? []).map((m, i) => (
              <Text key={i} style={styles.chipItem}>{`\u2022  ${m}`}</Text>
            ))
          ) : (
            <Text style={styles.emptyHint}>
              {isHi ? 'कोई दवा नहीं जोड़ी गई' : 'No medications added'}
            </Text>
          )}
        </Section>

        {/* Settings — Language toggle */}
        <Section title={isHi ? 'सेटिंग्स' : 'Settings'}>
          <View style={styles.langRow}>
            <TouchableOpacity
              style={[styles.langBtn, !isHi && styles.langActive]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.langText, !isHi && styles.langTextActive]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, isHi && styles.langActive]}
              onPress={() => setLanguage('hi')}
            >
              <Text style={[styles.langText, isHi && styles.langTextActive]}>हिन्दी</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>
            {isHi ? 'लॉग आउट' : 'Log Out'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  screenTitle: {
    ...FONTS.headlineMedium,
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },
  scroll: { padding: SPACING.xl, paddingBottom: SPACING.huge },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  name: { ...FONTS.headlineSmall, color: COLORS.textPrimary },
  phone: { ...FONTS.bodyMedium, color: COLORS.textSecondary },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { ...FONTS.titleSmall, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xxs,
  },
  infoLabel: { ...FONTS.bodyMedium, color: COLORS.textSecondary },
  infoValue: { ...FONTS.bodyMedium, color: COLORS.textPrimary },
  chipItem: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: 2 },
  emptyHint: { ...FONTS.bodySmall, color: COLORS.placeholder },
  langRow: { flexDirection: 'row', gap: SPACING.sm },
  langBtn: {
    flex: 1,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  langActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  langText: { ...FONTS.labelMedium, color: COLORS.textSecondary },
  langTextActive: { color: COLORS.textOnPrimary },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  logoutText: { ...FONTS.labelLarge, color: COLORS.error },
});
