import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../config/theme';
import type { AuthStackParamList, MainStackParamList, RootStackParamList } from './types';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import PatientIntakeScreen from '../screens/PatientIntakeScreen';
import ConsultationScreen from '../screens/ConsultationScreen';
import VitalsEntryScreen from '../screens/VitalsEntryScreen';
import TriageResultScreen from '../screens/TriageResultScreen';
import SOAPSummaryScreen from '../screens/SOAPSummaryScreen';
import EmergencyAlertScreen from '../screens/EmergencyAlertScreen';

// ---------------------------------------------------------------------------
// Stack navigators
// ---------------------------------------------------------------------------
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainStack.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary[500] },
        headerTintColor: COLORS.textOnPrimary,
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerBackTitleVisible: false,
      }}
    >
      <MainStack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <MainStack.Screen
        name="PatientIntake"
        component={PatientIntakeScreen}
        options={{ title: 'Patient Intake' }}
      />
      <MainStack.Screen
        name="Consultation"
        component={ConsultationScreen}
        options={{ title: 'Consultation' }}
      />
      <MainStack.Screen
        name="VitalsEntry"
        component={VitalsEntryScreen}
        options={{ title: 'Vitals Entry' }}
      />
      <MainStack.Screen
        name="TriageResult"
        component={TriageResultScreen}
        options={{ title: 'Triage Result' }}
      />
      <MainStack.Screen
        name="SOAPSummary"
        component={SOAPSummaryScreen}
        options={{ title: 'SOAP Summary' }}
      />
      <MainStack.Screen
        name="EmergencyAlert"
        component={EmergencyAlertScreen}
        options={{
          title: 'Emergency Alert',
          headerStyle: { backgroundColor: COLORS.emergency[500] },
        }}
      />
    </MainStack.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root navigator
// ---------------------------------------------------------------------------
export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const loadStoredAuth = useAuthStore((s) => s.loadStoredAuth);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary[500]} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="Main" component={MainNavigator} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
