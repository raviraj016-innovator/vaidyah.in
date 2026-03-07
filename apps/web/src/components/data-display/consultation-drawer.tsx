'use client';

import React from 'react';
import { Drawer, Typography, Descriptions, Tag, Space, Row, Col, Card, Timeline, Divider, Empty } from 'antd';
import {
  HeartOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { TriageBadge } from './triage-badge';
import { SOAPDisplay } from './soap-display';
import { ProsodyBars } from './prosody-bars';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VitalSigns {
  temperature?: number;
  temperatureUnit?: 'F' | 'C';
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  spO2?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  bloodGlucose?: number;
}

interface TriageResult {
  category: 'A' | 'B' | 'C';
  urgencyScore?: number;
  redFlags?: string[];
  reasoning?: string;
}

interface TranscriptEntry {
  speaker: 'patient' | 'system' | 'nurse';
  text: string;
  timestamp?: string;
  language?: string;
}

interface ProsodyScores {
  distress?: number;
  pain?: number;
  anxiety?: number;
  speechRate?: number;
  vocalTremor?: number;
  breathlessness?: number;
  fatigue?: number;
}

interface SOAPData {
  subjective?: {
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
    reviewOfSystems?: string[];
    patientNarrative?: string;
  };
  objective?: {
    vitalSigns?: string;
    physicalExamination?: string;
    observations?: string[];
  };
  assessment?: {
    primaryDiagnosis?: string;
    differentialDiagnoses?: string[];
    severity?: string;
    clinicalReasoning?: string;
  };
  plan?: {
    medications?: string[];
    investigations?: string[];
    referrals?: string[];
    followUp?: string;
    patientEducation?: string[];
  };
}

interface ConsultationData {
  id: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  consultationDate: string;
  centerId?: string;
  centerName?: string;
  nurseId?: string;
  nurseName?: string;
  status?: string;
  symptoms?: string[];
  vitals?: VitalSigns;
  triageResult?: TriageResult;
  soapNote?: SOAPData;
  transcript?: TranscriptEntry[];
  prosodyScores?: ProsodyScores;
}

interface ConsultationDrawerProps {
  open: boolean;
  onClose: () => void;
  consultation: ConsultationData | null;
}

// ---------------------------------------------------------------------------
// Vital sign display helpers
// ---------------------------------------------------------------------------

function VitalCard({ label, value, unit, icon }: { label: string; value?: number | string; unit?: string; icon?: React.ReactNode }) {
  if (value === undefined || value === null) return null;
  return (
    <Card size="small" styles={{ body: { padding: '8px 12px', textAlign: 'center' } }}>
      <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        {icon} {value}
        {unit && <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
      </div>
    </Card>
  );
}

function VitalsGrid({ vitals }: { vitals: VitalSigns }) {
  return (
    <Row gutter={[8, 8]}>
      <Col xs={12} sm={8}>
        <VitalCard label="Temperature" value={vitals.temperature} unit={vitals.temperatureUnit === 'C' ? '°C' : '°F'} />
      </Col>
      <Col xs={12} sm={8}>
        <VitalCard
          label="Blood Pressure"
          value={
            vitals.systolic != null && vitals.diastolic != null
              ? `${vitals.systolic}/${vitals.diastolic}`
              : undefined
          }
          unit="mmHg"
        />
      </Col>
      <Col xs={12} sm={8}>
        <VitalCard label="Heart Rate" value={vitals.heartRate} unit="bpm" icon={<HeartOutlined style={{ color: '#dc2626', fontSize: 14 }} />} />
      </Col>
      <Col xs={12} sm={8}>
        <VitalCard label="Respiratory Rate" value={vitals.respiratoryRate} unit="/min" />
      </Col>
      <Col xs={12} sm={8}>
        <VitalCard label="SpO2" value={vitals.spO2} unit="%" />
      </Col>
      <Col xs={12} sm={8}>
        <VitalCard label="Blood Glucose" value={vitals.bloodGlucose} unit="mg/dL" />
      </Col>
      {vitals.weight != null && (
        <Col xs={12} sm={8}>
          <VitalCard label="Weight" value={vitals.weight} unit="kg" />
        </Col>
      )}
      {vitals.height != null && (
        <Col xs={12} sm={8}>
          <VitalCard label="Height" value={vitals.height} unit="cm" />
        </Col>
      )}
      {vitals.bmi != null && (
        <Col xs={12} sm={8}>
          <VitalCard label="BMI" value={vitals.bmi} />
        </Col>
      )}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Transcript timeline
// ---------------------------------------------------------------------------

function TranscriptTimeline({ entries }: { entries: TranscriptEntry[] }) {
  const speakerConfig: Record<string, { color: string; label: string }> = {
    patient: { color: '#2563eb', label: 'Patient' },
    nurse: { color: '#16a34a', label: 'Nurse' },
    system: { color: '#6b7280', label: 'System' },
  };

  return (
    <Timeline
      items={entries.map((entry, i) => {
        const cfg = speakerConfig[entry.speaker] ?? speakerConfig.system;
        return {
          key: `${entry.timestamp ?? 'no-ts'}-${entry.speaker}-${i}`,
          color: cfg.color,
          children: (
            <div>
              <Space size={4}>
                <Typography.Text strong style={{ fontSize: 12, color: cfg.color }}>
                  {cfg.label}
                </Typography.Text>
                {entry.timestamp && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {entry.timestamp}
                  </Typography.Text>
                )}
                {entry.language && entry.language !== 'en' && (
                  <Tag style={{ fontSize: 10 }}>{entry.language.toUpperCase()}</Tag>
                )}
              </Space>
              <Typography.Paragraph style={{ margin: '2px 0 0 0', fontSize: 13 }}>
                {entry.text}
              </Typography.Paragraph>
            </div>
          ),
        };
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConsultationDrawer({ open, onClose, consultation }: ConsultationDrawerProps) {
  if (!consultation) return null;

  const {
    patientName,
    patientAge,
    patientGender,
    consultationDate,
    centerName,
    nurseName,
    status,
    symptoms,
    vitals,
    triageResult,
    soapNote,
    transcript,
    prosodyScores,
  } = consultation;

  return (
    <Drawer
      title="Consultation Details"
      placement="right"
      width={640}
      open={open}
      onClose={onClose}
    >
      {/* ---- Header ---- */}
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
        <Descriptions.Item label="Patient" span={2}>
          <Space>
            <UserOutlined />
            <Typography.Text strong>{patientName}</Typography.Text>
            {patientAge != null && <Typography.Text type="secondary">{patientAge} yrs</Typography.Text>}
            {patientGender && <Tag>{patientGender}</Tag>}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Date">
          <Space size={4}>
            <ClockCircleOutlined style={{ fontSize: 12 }} />
            {consultationDate}
          </Space>
        </Descriptions.Item>
        {status && <Descriptions.Item label="Status"><Tag color="blue">{status}</Tag></Descriptions.Item>}
        {centerName && <Descriptions.Item label="Center">{centerName}</Descriptions.Item>}
        {nurseName && <Descriptions.Item label="Nurse">{nurseName}</Descriptions.Item>}
      </Descriptions>

      {/* ---- Vitals ---- */}
      {vitals && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>
            <ThunderboltOutlined /> Vital Signs
          </Divider>
          <VitalsGrid vitals={vitals} />
        </>
      )}

      {/* ---- Symptoms ---- */}
      {symptoms && symptoms.length > 0 && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>Symptoms</Divider>
          <Space wrap size={[4, 4]}>
            {symptoms.map((s) => (
              <Tag key={s} color="orange">{s}</Tag>
            ))}
          </Space>
        </>
      )}

      {/* ---- Triage Result ---- */}
      {triageResult && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>
            <AlertOutlined /> Triage Result
          </Divider>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <TriageBadge category={triageResult.category} size="large" />
            {triageResult.urgencyScore !== undefined && (
              <Typography.Text>
                Urgency Score: <Typography.Text strong>{triageResult.urgencyScore}/100</Typography.Text>
              </Typography.Text>
            )}
            {triageResult.redFlags && triageResult.redFlags.length > 0 && (
              <div>
                <Typography.Text type="danger" strong>Red Flags:</Typography.Text>
                <div style={{ marginTop: 4 }}>
                  {triageResult.redFlags.map((flag) => (
                    <Tag key={flag} color="red" style={{ marginBottom: 4 }}>{flag}</Tag>
                  ))}
                </div>
              </div>
            )}
            {triageResult.reasoning && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: 0 }}>
                {triageResult.reasoning}
              </Typography.Paragraph>
            )}
          </Space>
        </>
      )}

      {/* ---- SOAP Note ---- */}
      {soapNote && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>SOAP Note</Divider>
          <SOAPDisplay data={soapNote} />
        </>
      )}

      {/* ---- Transcript ---- */}
      {transcript && transcript.length > 0 && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>Transcript</Divider>
          <TranscriptTimeline entries={transcript} />
        </>
      )}

      {/* ---- Prosody Analysis ---- */}
      {prosodyScores && (
        <>
          <Divider orientation="left" style={{ fontSize: 14 }}>Prosody Analysis</Divider>
          <ProsodyBars scores={prosodyScores} />
        </>
      )}
    </Drawer>
  );
}
