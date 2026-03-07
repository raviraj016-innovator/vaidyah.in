'use client';

import { Collapse, Typography, Descriptions, List, Tag, Empty } from 'antd';

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

interface SOAPDisplayProps {
  data: SOAPData;
  defaultOpen?: boolean;
}

export function SOAPDisplay({ data, defaultOpen = true }: SOAPDisplayProps) {
  if (!data) return <Empty description="No SOAP note available" />;

  const items = [
    {
      key: 'subjective',
      label: 'Subjective',
      children: data.subjective ? (
        <div>
          {data.subjective.chiefComplaint && (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Chief Complaint">{data.subjective.chiefComplaint}</Descriptions.Item>
            </Descriptions>
          )}
          {data.subjective.historyOfPresentIllness && (
            <Typography.Paragraph style={{ marginTop: 8 }}>
              {data.subjective.historyOfPresentIllness}
            </Typography.Paragraph>
          )}
          {data.subjective.reviewOfSystems && data.subjective.reviewOfSystems.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong>Review of Systems:</Typography.Text>
              <List size="small" dataSource={data.subjective.reviewOfSystems} renderItem={(item) => <List.Item>{item}</List.Item>} />
            </div>
          )}
        </div>
      ) : 'No subjective data',
    },
    {
      key: 'objective',
      label: 'Objective',
      children: data.objective ? (
        <div>
          {data.objective.vitalSigns && (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Vital Signs">{data.objective.vitalSigns}</Descriptions.Item>
            </Descriptions>
          )}
          {data.objective.physicalExamination && (
            <Typography.Paragraph>{data.objective.physicalExamination}</Typography.Paragraph>
          )}
          {data.objective.observations && data.objective.observations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {data.objective.observations.map((obs, i) => (
                <Tag key={i} style={{ marginBottom: 4 }}>{obs}</Tag>
              ))}
            </div>
          )}
        </div>
      ) : 'No objective data',
    },
    {
      key: 'assessment',
      label: 'Assessment',
      children: data.assessment ? (
        <div>
          {(data.assessment.primaryDiagnosis || data.assessment.severity) && (
            <Descriptions column={1} size="small">
              {data.assessment.primaryDiagnosis && (
                <Descriptions.Item label="Primary Diagnosis">
                  <Tag color="blue">{data.assessment.primaryDiagnosis}</Tag>
                </Descriptions.Item>
              )}
              {data.assessment.severity && (
                <Descriptions.Item label="Severity">{data.assessment.severity}</Descriptions.Item>
              )}
            </Descriptions>
          )}
          {data.assessment.differentialDiagnoses && data.assessment.differentialDiagnoses.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong>Differential Diagnoses:</Typography.Text>
              <div style={{ marginTop: 4 }}>
                {data.assessment.differentialDiagnoses.map((d, i) => (
                  <Tag key={i} style={{ marginBottom: 4 }}>{d}</Tag>
                ))}
              </div>
            </div>
          )}
          {data.assessment.clinicalReasoning && (
            <Typography.Paragraph style={{ marginTop: 8 }}>{data.assessment.clinicalReasoning}</Typography.Paragraph>
          )}
        </div>
      ) : 'No assessment data',
    },
    {
      key: 'plan',
      label: 'Plan',
      children: data.plan ? (
        <div>
          {data.plan.medications && data.plan.medications.length > 0 && (
            <div>
              <Typography.Text strong>Medications:</Typography.Text>
              <List size="small" dataSource={data.plan.medications} renderItem={(item) => <List.Item>{item}</List.Item>} />
            </div>
          )}
          {data.plan.investigations && data.plan.investigations.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong>Investigations:</Typography.Text>
              <List size="small" dataSource={data.plan.investigations} renderItem={(item) => <List.Item>{item}</List.Item>} />
            </div>
          )}
          {data.plan.referrals && data.plan.referrals.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong>Referrals:</Typography.Text>
              <div>{data.plan.referrals.map((r, i) => <Tag key={i} color="orange">{r}</Tag>)}</div>
            </div>
          )}
          {data.plan.followUp && (
            <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
              <Descriptions.Item label="Follow-up">{data.plan.followUp}</Descriptions.Item>
            </Descriptions>
          )}
          {data.plan.patientEducation && data.plan.patientEducation.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Typography.Text strong>Patient Education:</Typography.Text>
              <List size="small" dataSource={data.plan.patientEducation} renderItem={(item) => <List.Item>{item}</List.Item>} />
            </div>
          )}
        </div>
      ) : 'No plan data',
    },
  ];

  return (
    <Collapse
      defaultActiveKey={defaultOpen ? ['subjective', 'objective', 'assessment', 'plan'] : []}
      items={items}
    />
  );
}
