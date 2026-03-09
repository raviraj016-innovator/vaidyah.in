'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Button,
  Form,
  InputNumber,
  Slider,
  Space,
  Row,
  Col,
  Typography,
  Segmented,
  Divider,
} from 'antd';
import {
  HeartOutlined,
  ThunderboltOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import type { VitalsData } from '@/stores/session-store';

// ---------------------------------------------------------------------------
// Vital-sign range constants
// ---------------------------------------------------------------------------

const VITAL_RANGES: Record<
  string,
  { normal: [number, number]; warning: [number, number]; critical: [number, number] }
> = {
  temperature_F: {
    normal: [97, 99],
    warning: [99, 100.4],
    critical: [100.4, 108],
  },
  temperature_C: {
    normal: [36.1, 37.2],
    warning: [37.2, 38],
    critical: [38, 42],
  },
  systolic: {
    normal: [90, 120],
    warning: [120, 140],
    critical: [140, 200],
  },
  diastolic: {
    normal: [60, 80],
    warning: [80, 90],
    critical: [90, 130],
  },
  heartRate: {
    normal: [60, 100],
    warning: [100, 120],
    critical: [120, 200],
  },
  respiratoryRate: {
    normal: [12, 20],
    warning: [20, 25],
    critical: [25, 60],
  },
  spO2: {
    critical: [0, 90],
    warning: [90, 95],
    normal: [95, 100],
  },
  bloodGlucose: {
    normal: [70, 140],
    warning: [140, 200],
    critical: [200, 500],
  },
};

type RangeStatus = 'normal' | 'warning' | 'critical' | 'none';

function getRangeStatus(field: string, value: number | undefined, tempUnit?: 'F' | 'C'): RangeStatus {
  if (value === undefined || value === null) return 'none';

  // Temperature uses unit-specific ranges
  const rangeKey = field === 'temperature' ? `temperature_${tempUnit ?? 'F'}` : field;
  const ranges = VITAL_RANGES[rangeKey];
  if (!ranges) return 'none';

  // SpO2 is inverted: lower is worse
  if (field === 'spO2') {
    if (value >= ranges.normal[0] && value <= ranges.normal[1]) return 'normal';
    if (value >= ranges.warning[0] && value < ranges.normal[0]) return 'warning';
    if (value < ranges.warning[0]) return 'critical';
    return 'normal';
  }

  if (value >= ranges.normal[0] && value <= ranges.normal[1]) return 'normal';
  if (value > ranges.normal[1] && value <= ranges.warning[1]) return 'warning';
  if (value > ranges.warning[1]) return 'critical';
  // Below normal — check critical thresholds for dangerously low values
  if (value < ranges.normal[0]) {
    if (field === 'temperature') {
      const critLow = tempUnit === 'C' ? 35 : 95;
      return value < critLow ? 'critical' : 'warning';
    }
    if (field === 'heartRate' && value < 50) return 'critical';
    if (field === 'systolic' && value < 70) return 'critical';
    if (field === 'diastolic' && value < 40) return 'critical';
    if (field === 'respiratoryRate' && value < 8) return 'critical';
    if (field === 'bloodGlucose' && value < 54) return 'critical';
    return 'warning';
  }
  return 'none';
}

const STATUS_COLORS: Record<RangeStatus, string> = {
  normal: '#16a34a',
  warning: '#d97706',
  critical: '#dc2626',
  none: '#6b7280',
};

const STATUS_BG: Record<RangeStatus, string> = {
  normal: '#f0fdf4',
  warning: '#fffbeb',
  critical: '#fef2f2',
  none: 'transparent',
};

const STATUS_LABELS: Record<RangeStatus, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
  none: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface VitalsFormProps {
  initialValues?: Partial<VitalsData>;
  onSubmit: (values: VitalsData) => void;
  onCancel?: () => void;
  loading?: boolean;
  externalForm?: ReturnType<typeof Form.useForm<VitalsData>>[0];
}

function VitalFieldStatus({ field, value, tempUnit }: { field: string; value?: number; tempUnit?: 'F' | 'C' }) {
  const status = getRangeStatus(field, value, tempUnit);
  if (status === 'none') return null;
  return (
    <Typography.Text
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: STATUS_COLORS[status],
        marginLeft: 8,
      }}
    >
      {STATUS_LABELS[status]}
    </Typography.Text>
  );
}

export function VitalsForm({
  initialValues,
  onSubmit,
  onCancel,
  loading = false,
  externalForm,
}: VitalsFormProps) {
  const [internalForm] = Form.useForm<VitalsData>();
  const form = externalForm ?? internalForm;
  const formValues = Form.useWatch([], form);

  const tempUnit = (formValues?.temperatureUnit ?? 'C') as 'F' | 'C';

  const getFieldStatus = useCallback(
    (field: string): '' | 'warning' | 'error' => {
      const raw = formValues?.[field as keyof VitalsData];
      if (typeof raw !== 'number') return '';
      const rangeStatus = getRangeStatus(field, raw, tempUnit);
      if (rangeStatus === 'warning') return 'warning';
      if (rangeStatus === 'critical') return 'error';
      return '';
    },
    [formValues, tempUnit],
  );

  // Auto-convert temperature when unit changes
  const prevUnitRef = useRef(tempUnit);
  useEffect(() => {
    if (prevUnitRef.current === tempUnit) return;
    const prev = prevUnitRef.current;
    prevUnitRef.current = tempUnit;
    const currentTemp = form.getFieldValue('temperature');
    if (currentTemp == null) return;
    const converted =
      tempUnit === 'C'
        ? Math.round(((currentTemp - 32) * 5) / 9 * 10) / 10
        : Math.round((currentTemp * 9 / 5 + 32) * 10) / 10;
    form.setFieldsValue({ temperature: converted });
  }, [tempUnit, form]);

  const defaults = useMemo(
    () => ({
      temperatureUnit: 'C' as const,
      painScore: 0,
      ...initialValues,
    }),
    [initialValues],
  );

  const handleFinish = (values: VitalsData) => {
    onSubmit(values);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={defaults}
      onFinish={handleFinish}
      requiredMark="optional"
      size="large"
    >
      {/* Temperature */}
      <Divider orientation="left" plain>
        <Space>
          <ThunderboltOutlined />
          Temperature
        </Space>
      </Divider>
      <Row gutter={16} align="middle">
        <Col xs={24} sm={12}>
          <Form.Item
            name="temperature"
            label={
              <Space>
                Temperature
                <VitalFieldStatus
                  field="temperature"
                  value={formValues?.temperature}
                  tempUnit={tempUnit}
                />
              </Space>
            }
            rules={[{ required: true, message: 'Temperature is required' }]}
          >
            <InputNumber
              placeholder={tempUnit === 'C' ? '37.0' : '98.6'}
              min={tempUnit === 'C' ? 29 : 85}
              max={tempUnit === 'C' ? 45 : 115}
              step={0.1}
              style={{ width: '100%' }}
              status={getFieldStatus('temperature') || undefined}
              precision={1}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="temperatureUnit" label="Unit">
            <Segmented
              options={[
                { label: 'Fahrenheit (F)', value: 'F' },
                { label: 'Celsius (C)', value: 'C' },
              ]}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Blood Pressure */}
      <Divider orientation="left" plain>
        <Space>
          <HeartOutlined />
          Blood Pressure
        </Space>
      </Divider>
      <Row gutter={16}>
        <Col xs={12}>
          <Form.Item
            name="systolic"
            label={
              <Space>
                Systolic (mmHg)
                <VitalFieldStatus
                  field="systolic"
                  value={formValues?.systolic}
                />
              </Space>
            }
            rules={[{ required: true, message: 'Systolic BP is required' }]}
          >
            <InputNumber
              placeholder="120"
              min={50}
              max={250}
              style={{ width: '100%' }}
              status={getFieldStatus('systolic') || undefined}
            />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="diastolic"
            label={
              <Space>
                Diastolic (mmHg)
                <VitalFieldStatus
                  field="diastolic"
                  value={formValues?.diastolic}
                />
              </Space>
            }
            dependencies={['systolic']}
            rules={[
              { required: true, message: 'Diastolic BP is required' },
              {
                validator: (_, value) => {
                  const systolic = form.getFieldValue('systolic');
                  if (value != null && systolic != null && value >= systolic) {
                    return Promise.reject(new Error('Diastolic must be less than systolic'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              placeholder="80"
              min={30}
              max={150}
              style={{ width: '100%' }}
              status={getFieldStatus('diastolic') || undefined}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Heart Rate & Respiratory Rate */}
      <Divider orientation="left" plain>
        <Space>
          <HeartOutlined />
          Heart & Respiratory
        </Space>
      </Divider>
      <Row gutter={16}>
        <Col xs={12}>
          <Form.Item
            name="heartRate"
            label={
              <Space>
                Heart Rate (bpm)
                <VitalFieldStatus
                  field="heartRate"
                  value={formValues?.heartRate}
                />
              </Space>
            }
            rules={[{ required: true, message: 'Heart rate is required' }]}
          >
            <InputNumber
              placeholder="72"
              min={20}
              max={250}
              style={{ width: '100%' }}
              status={getFieldStatus('heartRate') || undefined}
            />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="respiratoryRate"
            label={
              <Space>
                Resp. Rate (/min)
                <VitalFieldStatus
                  field="respiratoryRate"
                  value={formValues?.respiratoryRate}
                />
              </Space>
            }
          >
            <InputNumber
              placeholder="16"
              min={4}
              max={60}
              style={{ width: '100%' }}
              status={getFieldStatus('respiratoryRate') || undefined}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* SpO2 & Blood Glucose */}
      <Divider orientation="left" plain>
        <Space>
          <ExperimentOutlined />
          Oxygen & Glucose
        </Space>
      </Divider>
      <Row gutter={16}>
        <Col xs={12}>
          <Form.Item
            name="spO2"
            label={
              <Space>
                SpO2
                <VitalFieldStatus field="spO2" value={formValues?.spO2} />
              </Space>
            }
            rules={[{ required: true, message: 'SpO2 is required' }]}
          >
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                placeholder="98"
                min={50}
                max={100}
                style={{ width: '100%' }}
                status={getFieldStatus('spO2') || undefined}
              />
              <Button disabled style={{ pointerEvents: 'none' }}>%</Button>
            </Space.Compact>
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="bloodGlucose"
            label={
              <Space>
                Blood Glucose (mg/dL)
                <VitalFieldStatus
                  field="bloodGlucose"
                  value={formValues?.bloodGlucose}
                />
              </Space>
            }
          >
            <InputNumber
              placeholder="100"
              min={20}
              max={600}
              style={{ width: '100%' }}
              status={getFieldStatus('bloodGlucose') || undefined}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Weight & Height */}
      <Divider orientation="left" plain>
        Anthropometrics
      </Divider>
      <Row gutter={16}>
        <Col xs={12}>
          <Form.Item name="weight" label="Weight">
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                placeholder="65"
                min={1}
                max={300}
                style={{ width: '100%' }}
              />
              <Button disabled style={{ pointerEvents: 'none' }}>kg</Button>
            </Space.Compact>
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item name="height" label="Height">
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber
                placeholder="165"
                min={30}
                max={250}
                style={{ width: '100%' }}
              />
              <Button disabled style={{ pointerEvents: 'none' }}>cm</Button>
            </Space.Compact>
          </Form.Item>
        </Col>
      </Row>

      {/* Pain Score */}
      <Divider orientation="left" plain>
        Pain Assessment
      </Divider>
      <Form.Item
        name="painScore"
        label={
          <Space>
            Pain Score (0 = No Pain, 10 = Worst Pain)
            <Typography.Text
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  (formValues?.painScore ?? 0) <= 3
                    ? '#16a34a'
                    : (formValues?.painScore ?? 0) <= 6
                      ? '#d97706'
                      : '#dc2626',
              }}
            >
              {formValues?.painScore ?? 0}/10
            </Typography.Text>
          </Space>
        }
      >
        <Slider
          min={0}
          max={10}
          marks={{
            0: '0',
            1: '1',
            2: '2',
            3: '3',
            4: '4',
            5: '5',
            6: '6',
            7: '7',
            8: '8',
            9: '9',
            10: '10',
          }}
          styles={{
            track: {
              background:
                (formValues?.painScore ?? 0) <= 3
                  ? '#16a34a'
                  : (formValues?.painScore ?? 0) <= 6
                    ? '#d97706'
                    : '#dc2626',
            },
          }}
        />
      </Form.Item>

      {/* Actions */}
      <Form.Item style={{ marginTop: 24 }}>
        <Space size="middle">
          <Button type="primary" htmlType="submit" loading={loading} size="large">
            Submit Vitals
          </Button>
          {onCancel && (
            <Button onClick={onCancel} size="large">
              Cancel
            </Button>
          )}
        </Space>
      </Form.Item>
    </Form>
  );
}

export { VITAL_RANGES, getRangeStatus };
