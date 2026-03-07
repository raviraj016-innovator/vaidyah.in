import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ---------------------------------------------------------------------------
// Auth stack (unauthenticated)
// ---------------------------------------------------------------------------
export type AuthStackParamList = {
  Login: undefined;
};

// ---------------------------------------------------------------------------
// Main stack (authenticated)
// ---------------------------------------------------------------------------
export type MainStackParamList = {
  Dashboard: undefined;
  PatientIntake: undefined;
  Consultation: { sessionId: string };
  VitalsEntry: { sessionId: string };
  TriageResult: { sessionId: string };
  SOAPSummary: { sessionId: string };
  EmergencyAlert: { sessionId: string; patientId: string };
};

// ---------------------------------------------------------------------------
// Root navigator
// ---------------------------------------------------------------------------
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};

// ---------------------------------------------------------------------------
// Screen prop helpers
// ---------------------------------------------------------------------------
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export type DashboardScreenProps = NativeStackScreenProps<MainStackParamList, 'Dashboard'>;
export type PatientIntakeScreenProps = NativeStackScreenProps<MainStackParamList, 'PatientIntake'>;
export type ConsultationScreenProps = NativeStackScreenProps<MainStackParamList, 'Consultation'>;
export type VitalsEntryScreenProps = NativeStackScreenProps<MainStackParamList, 'VitalsEntry'>;
export type TriageResultScreenProps = NativeStackScreenProps<MainStackParamList, 'TriageResult'>;
export type SOAPSummaryScreenProps = NativeStackScreenProps<MainStackParamList, 'SOAPSummary'>;
export type EmergencyAlertScreenProps = NativeStackScreenProps<MainStackParamList, 'EmergencyAlert'>;
