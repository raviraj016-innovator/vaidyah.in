/**
 * Root navigation structure for the Vaidyah Patient Mobile app.
 *
 * - Auth stack: OTP login / ABDM login
 * - Main tabs: Home, Search, Matches, Notifications, Profile
 * - Modal stack: Trial detail
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { useTrialStore } from '../store/trialStore';
import { COLORS, FONTS } from '../config/theme';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import TrialSearchScreen from '../screens/TrialSearchScreen';
import TrialDetailScreen from '../screens/TrialDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

// ---------------------------------------------------------------------------
// Param lists
// ---------------------------------------------------------------------------

export type AuthStackParamList = {
  Login: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  TrialDetail: { trialId: string };
};

// ---------------------------------------------------------------------------
// Navigators
// ---------------------------------------------------------------------------

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// ---------------------------------------------------------------------------
// Tab Navigator
// ---------------------------------------------------------------------------

function MainTabs() {
  const unreadCount = useTrialStore((s) => s.unreadCount);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarLabelStyle: { ...FONTS.labelSmall },
        tabBarStyle: {
          borderTopColor: COLORS.border,
          paddingBottom: 4,
          height: 60,
        },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home',
            Search: 'search',
            Notifications: 'notifications',
            Profile: 'person',
          };
          return (
            <Ionicons
              name={icons[route.name] ?? 'ellipse'}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Search" component={TrialSearchScreen} options={{ tabBarLabel: 'Trials' }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Alerts',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const loadStoredAuth = useAuthStore((s) => s.loadStoredAuth);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  if (isLoading) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="MainTabs" component={MainTabs} />
          <RootStack.Screen
            name="TrialDetail"
            component={TrialDetailScreen}
            options={{ presentation: 'modal', headerShown: true, headerTitle: 'Trial Details' }}
          />
        </RootStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
