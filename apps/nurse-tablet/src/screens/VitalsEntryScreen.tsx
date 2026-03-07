import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSessionStore } from '../store/sessionStore';
import type { Vitals } from '../store/sessionStore';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TOUCH_TARGET,
} from '../config/theme';

interface VitalRange {
  min: number;
  max: number;
  warningLow: number;
  warningHigh: number;
  unit: string;
}

const VITAL_RANGES: Record<string, VitalRange> = {
  temperatureF: {
    min: 90,
    max: 110,
    warningLow: 97,
    warningHigh: 99.5,
    unit: '\u00B0F',
  },
  temperatureC: {
    min: 32,
    max: 43,
    warningLow: 36.1,
    warningHigh: 37.5,
    unit: '\u00B0C',
  },
  systolic: { min: 50, max: 300, warningLow: 90, warningHigh: 140, unit: 'mmHg' },
  diastolic: { min: 30, max: 200, warningLow: 60, warningHigh: 90, unit: 'mmHg' },
  spO2: { min: 0, max: 100, warningLow: 95, warningHigh: 100, unit: '%' },
  pulse: { min: 20, max: 250, warningLow: 60, warningHigh: 100, unit: 'bpm' },
  respiratoryRate: {
    min: 4,
    max: 60,
    warningLow: 12,
    warningHigh: 20,
    unit: '/min',
  },
  weight: { min: 0.5, max: 300, warningLow: 3, warningHigh: 200, unit: 'kg' },
};

type ValueStatus = 'normal' | 'warning' | 'emergency';

function getValueStatus(
  value: number | undefined,
  range: VitalRange,
): ValueStatus {
  if (value === undefined || isNaN(value)) return 'normal';
  if (value < range.min || value > range.max) return 'emergency';
  if (value < range.warningLow || value > range.warningHigh) return 'warning';
  return 'normal';
}

const STATUS_COLORS: Record<ValueStatus, string> = {
  normal: COLORS.success[500],
  warning: COLORS.warning[500],
  emergency: COLORS.emergency[500],
};

const STATUS_BG: Record<ValueStatus, string> = {
  normal: COLORS.success[50],
  warning: COLORS.warning[50],
  emergency: COLORS.emergency[50],
};

const STATUS_BORDER: Record<ValueStatus, string> = {
  normal: COLORS.border,
  warning: COLORS.warning[400],
  emergency: COLORS.emergency[400],
};

function parseNumericInput(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const num = parseFloat(text);
  return isNaN(num) ? undefined : num;
}

function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9 * 10) / 10;
}

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9 / 5 + 32) * 10) / 10;
}

interface VitalInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  range: VitalRange;
  parsedValue: number | undefined;
  placeholder?: string;
  rightElement?: React.ReactNode;
}

function VitalInput({
  label,
  value,
  onChangeText,
  range,
  parsedValue,
  placeholder,
  rightElement,
}: VitalInputProps) {
  const status = getValueStatus(parsedValue, range);
  const hasValue = parsedValue !== undefined;

  return (
    <View style={styles.vitalInputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <View
          style={[
            styles.inputWrapper,
            hasValue && { borderColor: STATUS_BORDER[status] },
            hasValue && status !== 'normal' && { backgroundColor: STATUS_BG[status] },
          ]}
        >
          <TextInput
            style={[
              styles.textInput,
              hasValue &&
                status !== 'normal' && { color: STATUS_COLORS[status] },
            ]}
            value={value}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            placeholder={placeholder ?? `${range.warningLow} - ${range.warningHigh}`}
            placeholderTextColor={COLORS.textDisabled}
            returnKeyType="next"
          />
          <Text style={styles.unitLabel}>{range.unit}</Text>
        </View>
        {rightElement}
      </View>
      <View style={styles.rangeRow}>
        <View
          style={[
            styles.rangeIndicator,
            { backgroundColor: hasValue ? STATUS_COLORS[status] : COLORS.neutral[300] },
          ]}
        />
        <Text style={styles.rangeText}>
          Normal: {range.warningLow} - {range.warningHigh} {range.unit}
        </Text>
        {hasValue && status === 'warning' && (
          <Text style={[styles.statusText, { color: COLORS.warning[600] }]}>
            Outside normal range
          </Text>
        )}
        {hasValue && status === 'emergency' && (
          <Text style={[styles.statusText, { color: COLORS.emergency[600] }]}>
            Critical value
          </Text>
        )}
      </View>
    </View>
  );
}

interface ValidationError {
  field: string;
  message: string;
}

function validateVitals(inputs: {
  temperature: number | undefined;
  tempUnit: 'F' | 'C';
  systolic: number | undefined;
  diastolic: number | undefined;
  spO2: number | undefined;
  pulse: number | undefined;
  respiratoryRate: number | undefined;
  weight: number | undefined;
}): ValidationError[] {
  const errors: ValidationError[] = [];
  const rangeKey = inputs.tempUnit === 'F' ? 'temperatureF' : 'temperatureC';

  if (inputs.temperature !== undefined) {
    const r = VITAL_RANGES[rangeKey];
    if (inputs.temperature < r.min || inputs.temperature > r.max) {
      errors.push({
        field: 'temperature',
        message: `Temperature must be between ${r.min} and ${r.max}${r.unit}`,
      });
    }
  }

  if (inputs.systolic !== undefined) {
    const r = VITAL_RANGES.systolic;
    if (inputs.systolic < r.min || inputs.systolic > r.max) {
      errors.push({
        field: 'systolic',
        message: `Systolic must be between ${r.min} and ${r.max}`,
      });
    }
  }

  if (inputs.diastolic !== undefined) {
    const r = VITAL_RANGES.diastolic;
    if (inputs.diastolic < r.min || inputs.diastolic > r.max) {
      errors.push({
        field: 'diastolic',
        message: `Diastolic must be between ${r.min} and ${r.max}`,
      });
    }
  }

  // Require both systolic and diastolic if either is provided
  if ((inputs.systolic !== undefined) !== (inputs.diastolic !== undefined)) {
    errors.push({
      field: 'bloodPressure',
      message: 'Both systolic and diastolic values are required for blood pressure',
    });
  }

  if (
    inputs.systolic !== undefined &&
    inputs.diastolic !== undefined &&
    inputs.diastolic >= inputs.systolic
  ) {
    errors.push({
      field: 'bloodPressure',
      message: 'Diastolic must be lower than systolic',
    });
  }

  if (inputs.spO2 !== undefined) {
    const r = VITAL_RANGES.spO2;
    if (inputs.spO2 < r.min || inputs.spO2 > r.max) {
      errors.push({
        field: 'spO2',
        message: `SpO2 must be between ${r.min} and ${r.max}%`,
      });
    }
  }

  if (inputs.pulse !== undefined) {
    const r = VITAL_RANGES.pulse;
    if (inputs.pulse < r.min || inputs.pulse > r.max) {
      errors.push({
        field: 'pulse',
        message: `Pulse must be between ${r.min} and ${r.max} bpm`,
      });
    }
  }

  if (inputs.respiratoryRate !== undefined) {
    const r = VITAL_RANGES.respiratoryRate;
    if (inputs.respiratoryRate < r.min || inputs.respiratoryRate > r.max) {
      errors.push({
        field: 'respiratoryRate',
        message: `Respiratory rate must be between ${r.min} and ${r.max}/min`,
      });
    }
  }

  if (inputs.weight !== undefined) {
    const r = VITAL_RANGES.weight;
    if (inputs.weight < r.min || inputs.weight > r.max) {
      errors.push({
        field: 'weight',
        message: `Weight must be between ${r.min} and ${r.max} kg`,
      });
    }
  }

  return errors;
}

export default function VitalsEntryScreen() {
  const navigation = useNavigation<any>();
  const setVitals = useSessionStore((s) => s.setVitals);
  const submitVitals = useSessionStore((s) => s.submitVitals);
  const existingVitals = useSessionStore((s) => s.vitals);
  const isProcessing = useSessionStore((s) => s.isProcessing);

  const [tempUnit, setTempUnit] = useState<'F' | 'C'>(
    existingVitals?.temperature?.unit ?? 'F',
  );
  const [temperature, setTemperature] = useState(
    existingVitals?.temperature?.value?.toString() ?? '',
  );
  const [systolic, setSystolic] = useState(
    existingVitals?.bloodPressure?.systolic?.toString() ?? '',
  );
  const [diastolic, setDiastolic] = useState(
    existingVitals?.bloodPressure?.diastolic?.toString() ?? '',
  );
  const [spO2, setSpO2] = useState(existingVitals?.spO2?.toString() ?? '');
  const [pulse, setPulse] = useState(existingVitals?.pulse?.toString() ?? '');
  const [respiratoryRate, setRespiratoryRate] = useState(
    existingVitals?.respiratoryRate?.toString() ?? '',
  );
  const [weight, setWeight] = useState(
    existingVitals?.weight?.toString() ?? '',
  );

  const parsedTemp = parseNumericInput(temperature);
  const parsedSystolic = parseNumericInput(systolic);
  const parsedDiastolic = parseNumericInput(diastolic);
  const parsedSpO2 = parseNumericInput(spO2);
  const parsedPulse = parseNumericInput(pulse);
  const parsedRR = parseNumericInput(respiratoryRate);
  const parsedWeight = parseNumericInput(weight);

  const tempRange = tempUnit === 'F' ? VITAL_RANGES.temperatureF : VITAL_RANGES.temperatureC;

  const hasAnyValue = useMemo(
    () =>
      [parsedTemp, parsedSystolic, parsedDiastolic, parsedSpO2, parsedPulse, parsedRR, parsedWeight].some(
        (v) => v !== undefined,
      ),
    [parsedTemp, parsedSystolic, parsedDiastolic, parsedSpO2, parsedPulse, parsedRR, parsedWeight],
  );

  const toggleTempUnit = useCallback(() => {
    const current = parseNumericInput(temperature);
    if (current !== undefined) {
      if (tempUnit === 'F') {
        setTemperature(fahrenheitToCelsius(current).toString());
      } else {
        setTemperature(celsiusToFahrenheit(current).toString());
      }
    }
    setTempUnit((prev) => (prev === 'F' ? 'C' : 'F'));
  }, [temperature, tempUnit]);

  const handleSave = useCallback(async () => {
    const errors = validateVitals({
      temperature: parsedTemp,
      tempUnit,
      systolic: parsedSystolic,
      diastolic: parsedDiastolic,
      spO2: parsedSpO2,
      pulse: parsedPulse,
      respiratoryRate: parsedRR,
      weight: parsedWeight,
    });

    if (errors.length > 0) {
      Alert.alert(
        'Validation Error',
        errors.map((e) => e.message).join('\n'),
      );
      return;
    }

    if (!hasAnyValue) {
      Alert.alert('No Data', 'Please enter at least one vital sign.');
      return;
    }

    const vitals: Vitals = {
      recordedAt: new Date().toISOString(),
    };

    if (parsedTemp !== undefined) {
      vitals.temperature = {
        value: parsedTemp,
        unit: tempUnit,
      };
    }
    if (parsedSystolic !== undefined && parsedDiastolic !== undefined) {
      vitals.bloodPressure = {
        systolic: parsedSystolic,
        diastolic: parsedDiastolic,
      };
    }
    if (parsedSpO2 !== undefined) vitals.spO2 = parsedSpO2;
    if (parsedPulse !== undefined) vitals.pulse = parsedPulse;
    if (parsedRR !== undefined) vitals.respiratoryRate = parsedRR;
    if (parsedWeight !== undefined) vitals.weight = parsedWeight;

    setVitals(vitals);
    try {
      await submitVitals();
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to submit vitals. Please try again.');
    }
  }, [
    parsedTemp,
    parsedSystolic,
    parsedDiastolic,
    parsedSpO2,
    parsedPulse,
    parsedRR,
    parsedWeight,
    tempUnit,
    hasAnyValue,
    setVitals,
    submitVitals,
    navigation,
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>{'\u2190'} Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Record Vitals</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.vitalsGrid}>
          <View style={styles.vitalCard}>
            <VitalInput
              label="Temperature"
              value={temperature}
              onChangeText={setTemperature}
              range={tempRange}
              parsedValue={parsedTemp}
              rightElement={
                <Pressable
                  style={({ pressed }) => [
                    styles.unitToggle,
                    pressed && styles.unitTogglePressed,
                  ]}
                  onPress={toggleTempUnit}
                >
                  <Text
                    style={[
                      styles.unitToggleText,
                      tempUnit === 'F' && styles.unitToggleActive,
                    ]}
                  >
                    {'\u00B0'}F
                  </Text>
                  <View style={styles.unitToggleDivider} />
                  <Text
                    style={[
                      styles.unitToggleText,
                      tempUnit === 'C' && styles.unitToggleActive,
                    ]}
                  >
                    {'\u00B0'}C
                  </Text>
                </Pressable>
              }
            />
          </View>

          <View style={styles.vitalCard}>
            <Text style={styles.cardSectionLabel}>Blood Pressure</Text>
            <View style={styles.bpRow}>
              <View style={styles.bpInput}>
                <VitalInput
                  label="Systolic"
                  value={systolic}
                  onChangeText={setSystolic}
                  range={VITAL_RANGES.systolic}
                  parsedValue={parsedSystolic}
                  placeholder="120"
                />
              </View>
              <Text style={styles.bpSlash}>/</Text>
              <View style={styles.bpInput}>
                <VitalInput
                  label="Diastolic"
                  value={diastolic}
                  onChangeText={setDiastolic}
                  range={VITAL_RANGES.diastolic}
                  parsedValue={parsedDiastolic}
                  placeholder="80"
                />
              </View>
            </View>
          </View>

          <View style={styles.vitalCard}>
            <VitalInput
              label="SpO2 (Oxygen Saturation)"
              value={spO2}
              onChangeText={setSpO2}
              range={VITAL_RANGES.spO2}
              parsedValue={parsedSpO2}
              placeholder="98"
            />
          </View>

          <View style={styles.vitalCard}>
            <VitalInput
              label="Pulse Rate"
              value={pulse}
              onChangeText={setPulse}
              range={VITAL_RANGES.pulse}
              parsedValue={parsedPulse}
              placeholder="72"
            />
          </View>

          <View style={styles.vitalCard}>
            <VitalInput
              label="Respiratory Rate"
              value={respiratoryRate}
              onChangeText={setRespiratoryRate}
              range={VITAL_RANGES.respiratoryRate}
              parsedValue={parsedRR}
              placeholder="16"
            />
          </View>

          <View style={styles.vitalCard}>
            <VitalInput
              label="Weight"
              value={weight}
              onChangeText={setWeight}
              range={VITAL_RANGES.weight}
              parsedValue={parsedWeight}
              placeholder="60"
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.cancelButton,
            pressed && styles.cancelButtonPressed,
          ]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            (!hasAnyValue || isProcessing) && styles.saveButtonDisabled,
            pressed && hasAnyValue && !isProcessing && styles.saveButtonPressed,
          ]}
          onPress={handleSave}
          disabled={!hasAnyValue || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
          ) : (
            <Text style={styles.saveButtonText}>Save Vitals</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOWS.sm,
  },
  backButton: {
    minHeight: TOUCH_TARGET.minimum,
    justifyContent: 'center',
    paddingRight: SPACING.base,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.primary[500],
  },
  headerTitle: {
    ...TYPOGRAPHY.styles.h3,
  },
  headerSpacer: {
    width: 80,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: SPACING['3xl'],
  },

  // Grid
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.base,
  },
  vitalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.base,
    minWidth: '45%',
    flexGrow: 1,
    flexBasis: '45%',
    ...SHADOWS.sm,
  },
  cardSectionLabel: {
    ...TYPOGRAPHY.styles.label,
    marginBottom: SPACING.md,
  },

  // Blood Pressure
  bpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  bpInput: {
    flex: 1,
  },
  bpSlash: {
    ...TYPOGRAPHY.styles.h2,
    color: COLORS.textSecondary,
    alignSelf: 'center',
    marginTop: SPACING['2xl'],
  },

  // Vital Input
  vitalInputContainer: {
    marginBottom: SPACING.xs,
  },
  inputLabel: {
    ...TYPOGRAPHY.styles.label,
    marginBottom: SPACING.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.neutral[0],
    paddingHorizontal: SPACING.md,
    minHeight: TOUCH_TARGET.comfortable,
  },
  textInput: {
    flex: 1,
    ...TYPOGRAPHY.styles.bodyLarge,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.sm,
  },
  unitLabel: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textSecondary,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    marginLeft: SPACING.xs,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  rangeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rangeText: {
    ...TYPOGRAPHY.styles.caption,
    color: COLORS.textDisabled,
  },
  statusText: {
    ...TYPOGRAPHY.styles.caption,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    marginLeft: 'auto',
  },

  // Temperature Unit Toggle
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primary[300],
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    minHeight: TOUCH_TARGET.minimum,
  },
  unitTogglePressed: {
    opacity: 0.7,
  },
  unitToggleText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  unitToggleActive: {
    color: COLORS.textOnPrimary,
    backgroundColor: COLORS.primary[500],
  },
  unitToggleDivider: {
    width: 1,
    height: '100%',
    backgroundColor: COLORS.primary[300],
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.base,
    ...SHADOWS.lg,
  },
  cancelButton: {
    minHeight: TOUCH_TARGET.comfortable,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.neutral[400],
  },
  cancelButtonPressed: {
    backgroundColor: COLORS.neutral[100],
  },
  cancelButtonText: {
    ...TYPOGRAPHY.styles.button,
    color: COLORS.textSecondary,
  },
  saveButton: {
    minHeight: TOUCH_TARGET.comfortable,
    paddingHorizontal: SPACING['2xl'],
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primary[500],
    ...SHADOWS.md,
  },
  saveButtonPressed: {
    backgroundColor: COLORS.primary[700],
  },
  saveButtonDisabled: {
    backgroundColor: COLORS.neutral[400],
    ...SHADOWS.none,
  },
  saveButtonText: {
    ...TYPOGRAPHY.styles.buttonLarge,
    color: COLORS.textOnPrimary,
  },
});
