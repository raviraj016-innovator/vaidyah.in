/**
 * Dashboard screen — nurse landing page with quick actions and today's stats.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { useSessionStore } from '../store/sessionStore';
import apiClient, { ENDPOINTS } from '../config/api';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS, TOUCH_TARGET } from '../config/theme';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface DashboardStats {
  patientsSeen: number;
  pendingTriage: number;
  emergencies: number;
}

export default function DashboardScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const selectedCenter = useAuthStore((s) => s.selectedCenter);
  const language = useAuthStore((s) => s.language);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return language === 'hi' ? 'सुप्रभात' : 'Good morning';
    if (hour < 17) return language === 'hi' ? 'नमस्कार' : 'Good afternoon';
    return language === 'hi' ? 'शुभ संध्या' : 'Good evening';
  }, [language]);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await apiClient.get<DashboardStats>(
        ENDPOINTS.DASHBOARD_STATS,
      );
      setStats(data);
    } catch {
      // Gracefully degrade — show dashes if API unavailable
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, [fetchStats]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary[500]}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.greetingCard}>
          <Text style={styles.greetingText}>
            {greeting}, {user?.name ?? 'Nurse'}!
          </Text>
          <Text style={styles.greetingSubtext}>
            {selectedCenter?.name ?? user?.centerName ?? 'Health Center'} • {new Date().toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>{language === 'hi' ? 'त्वरित कार्य' : 'Quick Actions'}</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => nav.navigate('PatientIntake')}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add" size={32} color={COLORS.primary[500]} />
            <Text style={styles.actionLabel}>{language === 'hi' ? 'नया रोगी' : 'New Patient'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.emergencyCard]}
            onPress={() => {
              const session = useSessionStore.getState().currentSession;
              const patient = useSessionStore.getState().patient;
              nav.navigate('EmergencyAlert', {
                sessionId: session?.id ?? `emergency-${Date.now()}`,
                patientId: patient?.id ?? `walk-in-${Date.now()}`,
              });
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="warning" size={32} color={COLORS.emergency[500]} />
            <Text style={[styles.actionLabel, { color: COLORS.emergency[500] }]}>
              {language === 'hi' ? 'आपातकालीन' : 'Emergency'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Today's Stats */}
        <Text style={styles.sectionTitle}>{language === 'hi' ? "आज के आँकड़े" : "Today's Stats"}</Text>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={COLORS.primary[500]}
            style={{ marginTop: 16 }}
          />
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={styles.statCardHeader}>
                <View>
                  <Text style={styles.statLabel}>
                    {language === 'hi' ? 'रोगी देखे गए' : 'Patients Seen'}
                  </Text>
                  <Text style={styles.statValue}>{stats?.patientsSeen ?? '—'}</Text>
                </View>
                <View style={[styles.statIcon, { backgroundColor: '#eef2ff' }]}>
                  <Ionicons name="people" size={22} color={COLORS.primary[500]} />
                </View>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statCardHeader}>
                <View>
                  <Text style={styles.statLabel}>
                    {language === 'hi' ? 'लंबित ट्राइएज' : 'Pending Triage'}
                  </Text>
                  <Text style={styles.statValue}>{stats?.pendingTriage ?? '—'}</Text>
                </View>
                <View style={[styles.statIcon, { backgroundColor: COLORS.warning[50] }]}>
                  <Ionicons name="time" size={22} color={COLORS.warning[600]} />
                </View>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statCardHeader}>
                <View>
                  <Text style={styles.statLabel}>
                    {language === 'hi' ? 'आपातकाल' : 'Emergencies'}
                  </Text>
                  <Text
                    style={[
                      styles.statValue,
                      stats?.emergencies
                        ? { color: COLORS.emergency[500] }
                        : undefined,
                    ]}
                  >
                    {stats?.emergencies ?? '—'}
                  </Text>
                </View>
                <View style={[styles.statIcon, { backgroundColor: COLORS.emergency[50] }]}>
                  <Ionicons name="warning" size={22} color={COLORS.emergency[500]} />
                </View>
              </View>
            </View>
          </View>
        )}

        {(stats?.emergencies ?? 0) > 0 && (
          <TouchableOpacity
            style={styles.emergencyBanner}
            onPress={() => {
              const session = useSessionStore.getState().currentSession;
              const patient = useSessionStore.getState().patient;
              nav.navigate('EmergencyAlert', {
                sessionId: session?.id ?? `emergency-${Date.now()}`,
                patientId: patient?.id ?? `walk-in-${Date.now()}`,
              });
            }}
            activeOpacity={0.8}
          >
            <View style={styles.emergencyBannerContent}>
              <Ionicons name="warning" size={20} color={COLORS.emergency[500]} />
              <View style={{ flex: 1, marginLeft: SPACING.md }}>
                <Text style={styles.emergencyBannerTitle}>
                  {language === 'hi' ? 'सक्रिय आपातकालीन अलर्ट' : 'Active Emergency Alert'}
                </Text>
                <Text style={styles.emergencyBannerDesc}>
                  {language === 'hi'
                    ? 'रोगी राम कुमार (उम्र 65) - गंभीर उच्च रक्तचाप, BP 180/110'
                    : 'Patient Ram Kumar (Age 65) - Severe Hypertension, BP 180/110'}
                </Text>
              </View>
              <Text style={styles.emergencyBannerAction}>
                {language === 'hi' ? 'देखें' : 'View'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 24, paddingBottom: 48 },
  greetingCard: {
    backgroundColor: '#0f172a',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
  },
  greetingText: {
    fontSize: TYPOGRAPHY.fontSize['2xl'],
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  greetingSubtext: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: 'rgba(255,255,255,0.55)',
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  actionCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emergencyCard: {
    borderColor: COLORS.emergency[100],
    backgroundColor: COLORS.emergency[50],
  },
  actionLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.primary[500],
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.primary[500],
    marginBottom: 4,
  },
  statLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.textSecondary,
  },
  emergencyBanner: {
    backgroundColor: COLORS.emergency[50],
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.emergency[200],
    padding: SPACING.base,
    marginTop: SPACING.xl,
  },
  emergencyBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emergencyBannerTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.emergency[700],
  },
  emergencyBannerDesc: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.emergency[600],
    marginTop: 2,
  },
  emergencyBannerAction: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.emergency[500],
    marginLeft: SPACING.sm,
  },
});
