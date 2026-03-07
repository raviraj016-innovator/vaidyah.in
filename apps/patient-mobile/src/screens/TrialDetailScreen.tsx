/**
 * Trial Detail screen — full information about a clinical trial.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';

import { useAuthStore } from '../store/authStore';
import { useTrialStore } from '../store/trialStore';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../config/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type DetailRoute = RouteProp<RootStackParamList, 'TrialDetail'>;

export default function TrialDetailScreen() {
  const { params } = useRoute<DetailRoute>();
  const language = useAuthStore((s) => s.language);
  const trial = useTrialStore((s) => s.selectedTrial);
  const isLoadingDetail = useTrialStore((s) => s.isLoadingDetail);
  const error = useTrialStore((s) => s.error);
  const getTrialDetail = useTrialStore((s) => s.getTrialDetail);
  const clearError = useTrialStore((s) => s.clearError);
  const isHi = language === 'hi';

  useEffect(() => {
    getTrialDetail(params.trialId);
  }, [params.trialId, getTrialDetail]);

  if (isLoadingDetail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!trial) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ?? (isHi ? 'विवरण लोड करने में विफल।' : 'Failed to load trial details.')}
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => { clearError(); getTrialDetail(params.trialId); }}
        >
          <Text style={styles.retryBtnText}>{isHi ? 'पुनः प्रयास करें' : 'Retry'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleContact = () => {
    const url = trial.contactPhone
      ? `tel:${trial.contactPhone}`
      : trial.contactEmail
        ? `mailto:${trial.contactEmail}`
        : null;
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Title & Phase */}
        <Text style={styles.title}>{trial.title}</Text>
        <View style={styles.tagRow}>
          <View style={styles.tag}><Text style={styles.tagText}>{trial.phase}</Text></View>
          <View style={[styles.tag, styles.statusTag]}>
            <Text style={styles.tagText}>{trial.status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isHi ? 'सारांश' : 'Summary'}
          </Text>
          <Text style={styles.body}>
            {isHi ? trial.summaryHi : trial.summaryEn}
          </Text>
        </View>

        {/* Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isHi ? 'संबंधित स्थितियाँ' : 'Conditions'}
          </Text>
          {(trial.conditions ?? []).map((c, i) => (
            <Text key={i} style={styles.bulletItem}>{`\u2022  ${c}`}</Text>
          ))}
        </View>

        {/* Eligibility */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isHi ? 'पात्रता' : 'Eligibility'}
          </Text>
          {trial.eligibility?.ageMin != null && (
            <Text style={styles.body}>
              {isHi ? 'आयु' : 'Age'}: {trial.eligibility.ageMin}–{trial.eligibility.ageMax ?? '∞'}
            </Text>
          )}
          {(trial.eligibility?.inclusionCriteria ?? []).map((c, i) => (
            <Text key={`inc-${i}`} style={styles.bulletItem}>{`\u2713  ${c}`}</Text>
          ))}
          {(trial.eligibility?.exclusionCriteria ?? []).map((c, i) => (
            <Text key={`exc-${i}`} style={[styles.bulletItem, { color: COLORS.error }]}>
              {`\u2717  ${c}`}
            </Text>
          ))}
        </View>

        {/* Locations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isHi ? 'स्थान' : 'Locations'}
          </Text>
          {(trial.locations ?? []).map((loc, i) => (
            <View key={i} style={styles.locationCard}>
              <Text style={styles.locFacility}>{loc.facility}</Text>
              <Text style={styles.locCity}>{loc.city}, {loc.state}</Text>
              {loc.distance != null && (
                <Text style={styles.locDistance}>{loc.distance} km</Text>
              )}
            </View>
          ))}
        </View>

        {/* Sponsor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isHi ? 'प्रायोजक' : 'Sponsor'}
          </Text>
          <Text style={styles.body}>{trial.sponsor}</Text>
        </View>

        {/* Contact CTA */}
        {(trial.contactPhone || trial.contactEmail) && (
          <TouchableOpacity style={styles.ctaBtn} onPress={handleContact} activeOpacity={0.7}>
            <Text style={styles.ctaBtnText}>
              {isHi ? 'संपर्क करें' : 'Contact Trial Site'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  errorText: { ...FONTS.bodyMedium, color: COLORS.error, textAlign: 'center', marginBottom: SPACING.md },
  retryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  retryBtnText: { ...FONTS.labelMedium, color: COLORS.textOnPrimary },
  scroll: { padding: SPACING.xl, paddingBottom: SPACING.huge },
  title: { ...FONTS.headlineMedium, color: COLORS.textPrimary, marginBottom: SPACING.sm },
  tagRow: { flexDirection: 'row', gap: SPACING.xs, marginBottom: SPACING.lg },
  tag: {
    backgroundColor: COLORS.primarySurface,
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  statusTag: { backgroundColor: COLORS.accentSurface },
  tagText: { ...FONTS.caption, color: COLORS.primary },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { ...FONTS.titleSmall, color: COLORS.textPrimary, marginBottom: SPACING.xs },
  body: { ...FONTS.bodyMedium, color: COLORS.textSecondary },
  bulletItem: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginLeft: SPACING.sm, marginBottom: 2 },
  locationCard: {
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.xs,
    ...SHADOWS.sm,
  },
  locFacility: { ...FONTS.labelMedium, color: COLORS.textPrimary },
  locCity: { ...FONTS.bodySmall, color: COLORS.textSecondary },
  locDistance: { ...FONTS.caption, color: COLORS.accent, marginTop: 2 },
  ctaBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    marginTop: SPACING.md,
  },
  ctaBtnText: { ...FONTS.labelLarge, color: COLORS.textOnPrimary },
});
