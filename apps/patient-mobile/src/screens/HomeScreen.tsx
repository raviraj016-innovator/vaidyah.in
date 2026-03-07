/**
 * Home / Dashboard screen — shows matched trials, health summary, and quick actions.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../store/authStore';
import { useTrialStore, TrialMatch } from '../store/trialStore';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../config/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const language = useAuthStore((s) => s.language);
  const matches = useTrialStore((s) => s.matches);
  const isLoadingMatches = useTrialStore((s) => s.isLoadingMatches);
  const unreadCount = useTrialStore((s) => s.unreadCount);
  const fetchMatches = useTrialStore((s) => s.fetchMatches);
  const fetchNotifications = useTrialStore((s) => s.fetchNotifications);
  const isHi = language === 'hi';

  useEffect(() => {
    fetchMatches();
    fetchNotifications();
  }, [fetchMatches, fetchNotifications]);

  const activeMatches = matches.filter((m) => !m.dismissed);

  const renderMatch = ({ item }: { item: TrialMatch }) => {
    const scoreColor =
      item.matchScore >= 0.7
        ? COLORS.matchHigh
        : item.matchScore >= 0.4
          ? COLORS.matchMedium
          : COLORS.matchLow;
    const scorePercent = Math.round(item.matchScore * 100);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => nav.navigate('TrialDetail', { trialId: item.trialId })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {isHi && item.trial.titleHi ? item.trial.titleHi : item.trial.title}
          </Text>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreCircleText, { color: scoreColor }]}>
              {scorePercent}%
            </Text>
          </View>
        </View>
        <Text style={styles.cardBody} numberOfLines={2}>
          {isHi && item.trial.summaryHi ? item.trial.summaryHi : item.trial.summaryEn}
        </Text>
        <View style={styles.tagsRow}>
          {item.trial.phase && (
            <View style={[styles.tag, { backgroundColor: COLORS.infoLight }]}>
              <Text style={[styles.tagText, { color: COLORS.info }]}>{item.trial.phase}</Text>
            </View>
          )}
          {item.trial.status && (
            <View style={[styles.tag, { backgroundColor: COLORS.successLight }]}>
              <Text style={[styles.tagText, { color: COLORS.success }]}>{item.trial.status}</Text>
            </View>
          )}
          {item.trial.conditions?.slice(0, 2).map((c: string) => (
            <View key={c} style={[styles.tag, { backgroundColor: COLORS.borderLight }]}>
              <Text style={[styles.tagText, { color: COLORS.textSecondary }]}>{c}</Text>
            </View>
          ))}
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>
            {item.trial.locations?.[0]?.city ?? (isHi ? 'भारत' : 'India')}
          </Text>
          {item.trial.sponsor && (
            <>
              <Text style={styles.metaDot}> · </Text>
              <Text style={styles.metaText} numberOfLines={1}>{item.trial.sponsor}</Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.greetingCard}>
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingText}>
              {isHi
                ? `वापसी पर स्वागत है, ${user?.name ?? 'Patient'}!`
                : `Welcome back, ${user?.name ?? 'Patient'}!`}
            </Text>
            <Text style={styles.greetingSubtext}>
              {isHi
                ? 'आपके लिए मिलान किए गए क्लिनिकल ट्रायल नीचे देखें'
                : 'View your matched clinical trials below'}
            </Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.notifBadge}
              onPress={() => nav.navigate('Notifications')}
            >
              <Text style={styles.notifBadgeText}>{unreadCount}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Matches list */}
      <FlatList
        data={activeMatches}
        keyExtractor={(m) => m.id}
        renderItem={renderMatch}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingMatches}
            onRefresh={fetchMatches}
            tintColor={COLORS.primary}
          />
        }
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>
            {isHi ? `ट्रायल मैच (${activeMatches.length})` : `Trial Matches (${activeMatches.length})`}
          </Text>
        }
        ListEmptyComponent={
          isLoadingMatches ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SPACING.xxl }} />
          ) : (
            <Text style={styles.emptyText}>
              {isHi
                ? 'अभी कोई मैच नहीं है। प्रोफ़ाइल पूरा करें।'
                : 'No matches yet. Complete your profile to get matched.'}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  greetingCard: {
    backgroundColor: '#0f172a',
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.lg,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: {
    ...FONTS.headlineMedium,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  greetingSubtext: {
    ...FONTS.bodySmall,
    color: 'rgba(255,255,255,0.55)',
  },
  notifBadge: {
    backgroundColor: COLORS.error,
    borderRadius: RADIUS.full,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.md,
  },
  notifBadgeText: {
    ...FONTS.labelSmall,
    color: COLORS.white,
  },
  sectionTitle: {
    ...FONTS.titleMedium,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
  },
  cardTitle: { ...FONTS.titleSmall, color: COLORS.textPrimary, flex: 1, marginRight: SPACING.sm },
  scoreCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  scoreCircleText: {
    ...FONTS.labelSmall,
    fontWeight: '700',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xxs,
    marginBottom: SPACING.xs,
  },
  tag: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  tagText: {
    ...FONTS.caption,
    fontWeight: '500',
  },
  cardBody: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  cardMeta: { flexDirection: 'row', alignItems: 'center' },
  metaText: { ...FONTS.caption, color: COLORS.textTertiary },
  metaDot: { color: COLORS.textTertiary },
  emptyText: {
    ...FONTS.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
});
