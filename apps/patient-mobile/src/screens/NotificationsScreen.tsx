/**
 * Notifications screen — trial match alerts, enrollment reminders, updates.
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
import { formatDistanceToNow } from 'date-fns';
import { hi } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { useTrialStore, Notification } from '../store/trialStore';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../config/theme';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const NOTIF_ICONS: Record<string, { name: string; color: string }> = {
  new_match: { name: 'trophy', color: '#d97706' },
  trial_update: { name: 'information-circle', color: '#2563eb' },
  enrollment_reminder: { name: 'time', color: '#dc2626' },
  general: { name: 'notifications', color: '#6b7280' },
};

export default function NotificationsScreen() {
  const nav = useNavigation<Nav>();
  const language = useAuthStore((s) => s.language);
  const notifications = useTrialStore((s) => s.notifications);
  const isLoadingNotifications = useTrialStore((s) => s.isLoadingNotifications);
  const fetchNotifications = useTrialStore((s) => s.fetchNotifications);
  const markNotificationRead = useTrialStore((s) => s.markNotificationRead);
  const isHi = language === 'hi';

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handlePress = (item: Notification) => {
    if (!item.read) markNotificationRead(item.id);
    if (item.trialId) nav.navigate('TrialDetail', { trialId: item.trialId });
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.card, !item.read && styles.cardUnread]}
      onPress={() => handlePress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {!item.read && <View style={styles.dot} />}
        <Ionicons
          name={(NOTIF_ICONS[item.type]?.name ?? 'notifications') as any}
          size={20}
          color={NOTIF_ICONS[item.type]?.color ?? COLORS.textTertiary}
          style={{ marginRight: SPACING.xs }}
        />
        <View style={styles.cardContent}>
          <Text style={styles.notifTitle}>
            {isHi ? item.titleHi : item.title}
          </Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {isHi ? item.bodyHi : item.body}
          </Text>
          <Text style={styles.notifTime}>
            {(() => {
              try {
                const d = new Date(item.createdAt);
                return isNaN(d.getTime()) ? '' : formatDistanceToNow(d, { addSuffix: true, locale: isHi ? hi : undefined });
              } catch { return ''; }
            })()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>
          {isHi ? 'सूचनाएँ' : 'Notifications'}
        </Text>
        {notifications.some((n) => !n.read) && (
          <TouchableOpacity
            onPress={() => useTrialStore.getState().markAllRead?.()}
            style={styles.markAllButton}
          >
            <Text style={styles.markAllText}>
              {isHi ? 'सभी पढ़ें' : 'Mark All Read'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        renderItem={renderNotification}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingNotifications}
            onRefresh={fetchNotifications}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          isLoadingNotifications ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SPACING.xxl }} />
          ) : (
            <Text style={styles.emptyText}>
              {isHi ? 'कोई सूचना नहीं।' : 'No notifications yet.'}
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  header: {
    ...FONTS.headlineMedium,
    color: COLORS.textPrimary,
  },
  markAllButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primarySurface,
  },
  markAllText: {
    ...FONTS.labelSmall,
    color: COLORS.primary,
  },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  cardUnread: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
    marginRight: SPACING.xs,
  },
  cardContent: { flex: 1 },
  notifTitle: { ...FONTS.titleSmall, color: COLORS.textPrimary, marginBottom: 2 },
  notifBody: { ...FONTS.bodySmall, color: COLORS.textSecondary, marginBottom: SPACING.xxs },
  notifTime: { ...FONTS.caption, color: COLORS.textTertiary },
  emptyText: {
    ...FONTS.bodyMedium,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xxl,
  },
});
