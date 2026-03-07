/**
 * Trial Search screen — browse & filter clinical trials.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { useTrialStore, ClinicalTrial } from '../store/trialStore';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../config/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TrialSearchScreen() {
  const nav = useNavigation<Nav>();
  const language = useAuthStore((s) => s.language);
  const searchResults = useTrialStore((s) => s.searchResults);
  const searchTotal = useTrialStore((s) => s.searchTotal);
  const isSearching = useTrialStore((s) => s.isSearching);
  const isLoadingMore = useTrialStore((s) => s.isLoadingMore);
  const searchTrials = useTrialStore((s) => s.searchTrials);
  const loadMoreResults = useTrialStore((s) => s.loadMoreResults);

  const [query, setQuery] = useState('');
  const isHi = language === 'hi';

  const handleSearch = () => {
    if (query.trim()) searchTrials({ query: query.trim() });
  };

  const renderTrial = ({ item }: { item: ClinicalTrial }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => nav.navigate('TrialDetail', { trialId: item.id })}
      activeOpacity={0.7}
    >
      <Text style={styles.trialTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.trialSummary} numberOfLines={3}>
        {isHi ? item.summaryHi : item.summaryEn}
      </Text>
      <View style={styles.tagRow}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{item.phase}</Text>
        </View>
        <View style={[styles.tag, styles.statusTag]}>
          <Text style={styles.tagText}>{item.status.replace(/_/g, ' ')}</Text>
        </View>
        {item.locations?.[0] && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{item.locations[0].city}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.screenTitle}>
        {isHi ? 'ट्रायल खोजें' : 'Search Trials'}
      </Text>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={isHi ? 'स्थिति या कीवर्ड खोजें…' : 'Search by condition or keyword…'}
          placeholderTextColor={COLORS.placeholder}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          accessibilityLabel="Search trials"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Ionicons name="search" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Results */}
      <FlatList
        data={searchResults}
        keyExtractor={(t) => t.id}
        renderItem={renderTrial}
        contentContainerStyle={styles.list}
        onEndReached={loadMoreResults}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          searchResults.length > 0 ? (
            <Text style={styles.resultCount}>
              {searchTotal} {isHi ? 'परिणाम' : 'results'}
            </Text>
          ) : null
        }
        ListFooterComponent={
          (isSearching || isLoadingMore) ? <ActivityIndicator color={COLORS.primary} style={{ padding: SPACING.md }} /> : null
        }
        ListEmptyComponent={
          !isSearching ? (
            <Text style={styles.emptyText}>
              {searchTotal > 0 || query.trim()
                ? (isHi ? 'कोई परिणाम नहीं' : 'No results found')
                : (isHi
                    ? 'क्लिनिकल ट्रायल खोजने के लिए ऊपर टाइप करें।'
                    : 'Type above to search for clinical trials.')}
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  screenTitle: {
    ...FONTS.headlineMedium,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...FONTS.bodyMedium,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  searchBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  resultCount: { ...FONTS.caption, color: COLORS.textTertiary, marginBottom: SPACING.sm },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  trialTitle: { ...FONTS.titleSmall, color: COLORS.textPrimary, marginBottom: SPACING.xxs },
  trialSummary: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xxs },
  tag: {
    backgroundColor: COLORS.primarySurface,
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
  statusTag: { backgroundColor: COLORS.accentSurface },
  tagText: { ...FONTS.caption, color: COLORS.primary },
  emptyText: {
    ...FONTS.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
});
