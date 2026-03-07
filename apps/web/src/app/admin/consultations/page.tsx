'use client';

import React, { useState, useMemo } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Space,
  Button,
  Select,
  DatePicker,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/ui/page-header';
import { TriageBadge } from '@/components/data-display/triage-badge';
import { ConsultationDrawer } from '@/components/data-display/consultation-drawer';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// ---------------------------------------------------------------------------
// Types (matching ConsultationDrawer's ConsultationData interface)
// ---------------------------------------------------------------------------

interface ConsultationRecord {
  id: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  consultationDate: string;
  centerId: string;
  centerName: string;
  nurseId: string;
  nurseName: string;
  status: string;
  triageCategory: 'A' | 'B' | 'C';
  duration: string;
  symptoms: string[];
  vitals: {
    temperature: number;
    bloodPressureSystolic: number;
    bloodPressureDiastolic: number;
    heartRate: number;
    respiratoryRate: number;
    spO2: number;
  };
  triageResult: {
    category: 'A' | 'B' | 'C';
    urgencyScore: number;
    redFlags: string[];
    reasoning: string;
  };
  soapNote: {
    subjective: {
      chiefComplaint: string;
      historyOfPresentIllness: string;
    };
    objective: {
      vitalSigns: string;
      physicalExamination: string;
    };
    assessment: {
      primaryDiagnosis: string;
      differentialDiagnoses: string[];
    };
    plan: {
      medications: string[];
      followUp: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_CONSULTATIONS: ConsultationRecord[] = [
  {
    id: 'c-001',
    patientName: 'Ramesh Sahu',
    patientAge: 45,
    patientGender: 'Male',
    consultationDate: '2026-03-02 09:15',
    centerId: 'hc-001',
    centerName: 'PHC Raipur Central',
    nurseId: 'n-003',
    nurseName: 'Sunita Patel',
    status: 'completed',
    triageCategory: 'B',
    duration: '18 min',
    symptoms: ['Chest Pain', 'Breathlessness', 'Fatigue'],
    vitals: {
      temperature: 99.2,
      bloodPressureSystolic: 158,
      bloodPressureDiastolic: 96,
      heartRate: 92,
      respiratoryRate: 22,
      spO2: 94,
    },
    triageResult: {
      category: 'B',
      urgencyScore: 7,
      redFlags: ['Elevated BP', 'Low SpO2'],
      reasoning: 'Patient presents with chest pain and breathlessness combined with hypertension. Requires urgent evaluation.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'Chest pain for 2 days',
        historyOfPresentIllness: 'Patient reports intermittent chest tightness since 2 days, worsens on exertion.',
      },
      objective: {
        vitalSigns: 'T: 99.2F, BP: 158/96, HR: 92, RR: 22, SpO2: 94%',
        physicalExamination: 'Mild tachycardia, bilateral basal crackles.',
      },
      assessment: {
        primaryDiagnosis: 'Hypertensive urgency with possible angina',
        differentialDiagnoses: ['Unstable angina', 'Hypertensive crisis', 'GERD'],
      },
      plan: {
        medications: ['Amlodipine 5mg', 'Aspirin 75mg', 'Sorbitrate 5mg SL PRN'],
        followUp: 'Refer to district hospital for ECG and cardiac workup within 24 hours.',
      },
    },
  },
  {
    id: 'c-002',
    patientName: 'Savitri Devi',
    patientAge: 32,
    patientGender: 'Female',
    consultationDate: '2026-03-02 09:45',
    centerId: 'hc-001',
    centerName: 'PHC Raipur Central',
    nurseId: 'n-003',
    nurseName: 'Sunita Patel',
    status: 'completed',
    triageCategory: 'C',
    duration: '12 min',
    symptoms: ['Fever', 'Cough', 'Body Ache'],
    vitals: {
      temperature: 100.8,
      bloodPressureSystolic: 118,
      bloodPressureDiastolic: 74,
      heartRate: 88,
      respiratoryRate: 18,
      spO2: 98,
    },
    triageResult: {
      category: 'C',
      urgencyScore: 3,
      redFlags: [],
      reasoning: 'Common viral upper respiratory infection. Non-urgent, standard treatment protocol.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'Fever and cough for 3 days',
        historyOfPresentIllness: 'Low grade fever with dry cough and generalized body aches. No travel history.',
      },
      objective: {
        vitalSigns: 'T: 100.8F, BP: 118/74, HR: 88, RR: 18, SpO2: 98%',
        physicalExamination: 'Throat mildly congested. Lungs clear.',
      },
      assessment: {
        primaryDiagnosis: 'Acute viral upper respiratory infection',
        differentialDiagnoses: ['Influenza', 'Dengue fever'],
      },
      plan: {
        medications: ['Paracetamol 500mg TDS', 'Cetirizine 10mg OD', 'Warm fluids'],
        followUp: 'Review in 3 days if symptoms persist. Dengue NS1 if fever continues.',
      },
    },
  },
  {
    id: 'c-003',
    patientName: 'Kamal Nath Verma',
    patientAge: 68,
    patientGender: 'Male',
    consultationDate: '2026-03-02 10:00',
    centerId: 'hc-002',
    centerName: 'CHC Bilaspur',
    nurseId: 'n-004',
    nurseName: 'Anjali Tiwari',
    status: 'in_progress',
    triageCategory: 'A',
    duration: '22 min',
    symptoms: ['Severe Chest Pain', 'Sweating', 'Nausea', 'Left Arm Pain'],
    vitals: {
      temperature: 98.6,
      bloodPressureSystolic: 180,
      bloodPressureDiastolic: 110,
      heartRate: 110,
      respiratoryRate: 26,
      spO2: 91,
    },
    triageResult: {
      category: 'A',
      urgencyScore: 9,
      redFlags: ['Severe chest pain radiating to left arm', 'Profuse sweating', 'Critically low SpO2', 'Tachycardia'],
      reasoning: 'Classic presentation of acute myocardial infarction. Requires immediate emergency referral.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'Sudden severe chest pain with left arm radiation',
        historyOfPresentIllness: 'Sudden onset crushing chest pain 1 hour ago, profuse sweating, nausea. Known diabetic and hypertensive.',
      },
      objective: {
        vitalSigns: 'T: 98.6F, BP: 180/110, HR: 110, RR: 26, SpO2: 91%',
        physicalExamination: 'Diaphoretic, distressed. S3 gallop. Bilateral basal rales.',
      },
      assessment: {
        primaryDiagnosis: 'Acute myocardial infarction (STEMI suspected)',
        differentialDiagnoses: ['Aortic dissection', 'Pulmonary embolism'],
      },
      plan: {
        medications: ['Aspirin 325mg stat', 'Clopidogrel 300mg stat', 'Oxygen via mask', 'GTN spray'],
        followUp: 'EMERGENCY: 108 ambulance called. Transfer to nearest cardiac center (Bilaspur District Hospital).',
      },
    },
  },
  {
    id: 'c-004',
    patientName: 'Meera Bai',
    patientAge: 28,
    patientGender: 'Female',
    consultationDate: '2026-03-01 14:30',
    centerId: 'hc-003',
    centerName: 'PHC Durg',
    nurseId: 'n-005',
    nurseName: 'Kavita Sahu',
    status: 'completed',
    triageCategory: 'C',
    duration: '10 min',
    symptoms: ['Headache', 'Nausea'],
    vitals: {
      temperature: 98.4,
      bloodPressureSystolic: 112,
      bloodPressureDiastolic: 70,
      heartRate: 76,
      respiratoryRate: 16,
      spO2: 99,
    },
    triageResult: {
      category: 'C',
      urgencyScore: 2,
      redFlags: [],
      reasoning: 'Tension type headache. Vitals normal. Non-urgent.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'Headache for 2 days',
        historyOfPresentIllness: 'Bilateral frontal headache, dull aching, associated with mild nausea. No visual changes.',
      },
      objective: {
        vitalSigns: 'T: 98.4F, BP: 112/70, HR: 76, RR: 16, SpO2: 99%',
        physicalExamination: 'No neck stiffness. Neurological exam normal.',
      },
      assessment: {
        primaryDiagnosis: 'Tension-type headache',
        differentialDiagnoses: ['Migraine', 'Sinusitis'],
      },
      plan: {
        medications: ['Paracetamol 500mg SOS', 'Domperidone 10mg BD'],
        followUp: 'Follow up if headache persists beyond 5 days or new symptoms develop.',
      },
    },
  },
  {
    id: 'c-005',
    patientName: 'Bhola Prasad',
    patientAge: 55,
    patientGender: 'Male',
    consultationDate: '2026-03-01 11:20',
    centerId: 'hc-006',
    centerName: 'CHC Jagdalpur',
    nurseId: 'n-008',
    nurseName: 'Meena Dewangan',
    status: 'completed',
    triageCategory: 'B',
    duration: '15 min',
    symptoms: ['High Blood Sugar', 'Frequent Urination', 'Blurred Vision'],
    vitals: {
      temperature: 98.8,
      bloodPressureSystolic: 142,
      bloodPressureDiastolic: 88,
      heartRate: 80,
      respiratoryRate: 18,
      spO2: 97,
    },
    triageResult: {
      category: 'B',
      urgencyScore: 6,
      redFlags: ['Uncontrolled diabetes', 'Blurred vision'],
      reasoning: 'Uncontrolled Type 2 Diabetes with visual symptoms. Needs urgent diabetic workup and ophthalmology referral.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'High blood sugar and blurred vision',
        historyOfPresentIllness: 'Known T2DM for 8 years, non-compliant with medication. RBS 340 mg/dL. Blurred vision for 1 week.',
      },
      objective: {
        vitalSigns: 'T: 98.8F, BP: 142/88, HR: 80, RR: 18, SpO2: 97%',
        physicalExamination: 'Dry oral mucosa. Fundoscopy not available at center.',
      },
      assessment: {
        primaryDiagnosis: 'Uncontrolled Type 2 Diabetes with suspected diabetic retinopathy',
        differentialDiagnoses: ['Diabetic ketoacidosis', 'Hyperosmolar state'],
      },
      plan: {
        medications: ['Metformin 1000mg BD', 'Glimepiride 2mg OD', 'Insulin Glargine 10U at bedtime'],
        followUp: 'Urgent ophthalmology referral. HbA1c, renal function, urine microalbumin. Review in 1 week.',
      },
    },
  },
  {
    id: 'c-006',
    patientName: 'Anita Kumari',
    patientAge: 24,
    patientGender: 'Female',
    consultationDate: '2026-03-01 16:00',
    centerId: 'hc-001',
    centerName: 'PHC Raipur Central',
    nurseId: 'n-003',
    nurseName: 'Sunita Patel',
    status: 'completed',
    triageCategory: 'C',
    duration: '8 min',
    symptoms: ['Skin Rash', 'Itching'],
    vitals: {
      temperature: 98.6,
      bloodPressureSystolic: 110,
      bloodPressureDiastolic: 68,
      heartRate: 72,
      respiratoryRate: 16,
      spO2: 99,
    },
    triageResult: {
      category: 'C',
      urgencyScore: 2,
      redFlags: [],
      reasoning: 'Localized skin rash without systemic involvement. Non-urgent.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'Itchy skin rash on arms for 5 days',
        historyOfPresentIllness: 'Red, itchy patches on both forearms. No history of food or drug allergy.',
      },
      objective: {
        vitalSigns: 'T: 98.6F, BP: 110/68, HR: 72, RR: 16, SpO2: 99%',
        physicalExamination: 'Erythematous papular rash on bilateral forearms. No vesicles.',
      },
      assessment: {
        primaryDiagnosis: 'Contact dermatitis',
        differentialDiagnoses: ['Eczema', 'Scabies', 'Fungal infection'],
      },
      plan: {
        medications: ['Calamine lotion', 'Cetirizine 10mg OD', 'Betamethasone cream BD'],
        followUp: 'Review in 1 week. If no improvement, refer to dermatology.',
      },
    },
  },
  {
    id: 'c-007',
    patientName: 'Devendra Singh',
    patientAge: 38,
    patientGender: 'Male',
    consultationDate: '2026-02-28 10:30',
    centerId: 'hc-004',
    centerName: 'Sub-Center Korba',
    nurseId: 'n-006',
    nurseName: 'Kavita Sahu',
    status: 'completed',
    triageCategory: 'B',
    duration: '14 min',
    symptoms: ['High Fever', 'Joint Pain', 'Rash'],
    vitals: {
      temperature: 103.2,
      bloodPressureSystolic: 100,
      bloodPressureDiastolic: 64,
      heartRate: 102,
      respiratoryRate: 20,
      spO2: 97,
    },
    triageResult: {
      category: 'B',
      urgencyScore: 7,
      redFlags: ['High fever', 'Tachycardia', 'Possible dengue'],
      reasoning: 'High fever with rash and joint pain in endemic area. Dengue/Chikungunya suspected.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'High fever with body pain for 4 days',
        historyOfPresentIllness: 'High-grade fever with severe joint pain and macular rash since day 3.',
      },
      objective: {
        vitalSigns: 'T: 103.2F, BP: 100/64, HR: 102, RR: 20, SpO2: 97%',
        physicalExamination: 'Maculopapular rash on trunk. Tender joints. No hepatosplenomegaly.',
      },
      assessment: {
        primaryDiagnosis: 'Suspected Dengue Fever',
        differentialDiagnoses: ['Chikungunya', 'Malaria', 'Typhoid'],
      },
      plan: {
        medications: ['Paracetamol 650mg TDS', 'ORS', 'IV fluids if oral intake poor'],
        followUp: 'Dengue NS1, CBC with platelets daily. Admit if platelets < 100k. Watch for warning signs.',
      },
    },
  },
  {
    id: 'c-008',
    patientName: 'Pushpa Bai Thakur',
    patientAge: 72,
    patientGender: 'Female',
    consultationDate: '2026-02-28 15:00',
    centerId: 'hc-007',
    centerName: 'District Hospital Ambikapur',
    nurseId: 'n-010',
    nurseName: 'Lakshmi Nag',
    status: 'completed',
    triageCategory: 'B',
    duration: '20 min',
    symptoms: ['Knee Pain', 'Difficulty Walking', 'Swelling'],
    vitals: {
      temperature: 98.4,
      bloodPressureSystolic: 136,
      bloodPressureDiastolic: 82,
      heartRate: 74,
      respiratoryRate: 16,
      spO2: 97,
    },
    triageResult: {
      category: 'B',
      urgencyScore: 5,
      redFlags: ['Severe mobility limitation'],
      reasoning: 'Elderly patient with significant knee osteoarthritis limiting mobility. Needs orthopedic evaluation.',
    },
    soapNote: {
      subjective: {
        chiefComplaint: 'Bilateral knee pain for 6 months, worsening',
        historyOfPresentIllness: 'Progressive bilateral knee pain, worse on standing and climbing stairs. Using walking stick.',
      },
      objective: {
        vitalSigns: 'T: 98.4F, BP: 136/82, HR: 74, RR: 16, SpO2: 97%',
        physicalExamination: 'Bilateral knee crepitus. Mild effusion right knee. Limited ROM.',
      },
      assessment: {
        primaryDiagnosis: 'Bilateral knee osteoarthritis',
        differentialDiagnoses: ['Rheumatoid arthritis', 'Gout'],
      },
      plan: {
        medications: ['Diclofenac 50mg BD with food', 'Omeprazole 20mg OD', 'Calcium + Vit D3'],
        followUp: 'X-ray both knees. Orthopedic referral. Physiotherapy exercises taught.',
      },
    },
  },
];

const CENTER_OPTIONS = [
  { label: 'All Centers', value: '' },
  { label: 'PHC Raipur Central', value: 'hc-001' },
  { label: 'CHC Bilaspur', value: 'hc-002' },
  { label: 'PHC Durg', value: 'hc-003' },
  { label: 'Sub-Center Korba', value: 'hc-004' },
  { label: 'CHC Jagdalpur', value: 'hc-006' },
  { label: 'District Hospital Ambikapur', value: 'hc-007' },
];

const TRIAGE_OPTIONS = [
  { label: 'All Triage', value: '' },
  { label: 'Category A (Emergency)', value: 'A' },
  { label: 'Category B (Urgent)', value: 'B' },
  { label: 'Category C (Non-Urgent)', value: 'C' },
];

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Completed', value: 'completed' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Pending Review', value: 'pending_review' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsultationsPage() {
  const [centerFilter, setCenterFilter] = useState('');
  const [triageFilter, setTriageFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationRecord | null>(null);

  const filteredConsultations = useMemo(() => {
    return MOCK_CONSULTATIONS.filter((c) => {
      const matchCenter = !centerFilter || c.centerId === centerFilter;
      const matchTriage = !triageFilter || c.triageCategory === triageFilter;
      const matchStatus = !statusFilter || c.status === statusFilter;
      let matchDate = true;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const consultDate = dayjs(c.consultationDate);
        matchDate =
          !consultDate.isBefore(dateRange[0].startOf('day')) &&
          !consultDate.isAfter(dateRange[1].endOf('day'));
      }
      return matchCenter && matchTriage && matchStatus && matchDate;
    });
  }, [centerFilter, triageFilter, statusFilter, dateRange]);

  const handleRowClick = (record: ConsultationRecord) => {
    setSelectedConsultation(record);
    setDrawerOpen(true);
  };

  const statusColorMap: Record<string, string> = {
    completed: 'green',
    in_progress: 'blue',
    pending_review: 'orange',
  };

  const columns: ColumnsType<ConsultationRecord> = [
    {
      title: 'Patient',
      key: 'patient',
      render: (_, record) => (
        <Space>
          <UserOutlined style={{ color: '#9ca3af' }} />
          <div>
            <Text strong>{record.patientName}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.patientAge} yrs, {record.patientGender}
            </Text>
          </div>
        </Space>
      ),
      sorter: (a, b) => a.patientName.localeCompare(b.patientName),
    },
    {
      title: 'Center',
      dataIndex: 'centerName',
      key: 'center',
      ellipsis: true,
      responsive: ['md'],
    },
    {
      title: 'Date',
      dataIndex: 'consultationDate',
      key: 'date',
      width: 160,
      render: (val: string) => (
        <Space size={4}>
          <ClockCircleOutlined style={{ fontSize: 12, color: '#9ca3af' }} />
          <Text style={{ fontSize: 13 }}>{val}</Text>
        </Space>
      ),
      sorter: (a, b) =>
        new Date(a.consultationDate).getTime() -
        new Date(b.consultationDate).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Triage',
      key: 'triage',
      width: 180,
      responsive: ['sm'] as any,
      render: (_, record) => (
        <TriageBadge category={record.triageCategory} size="small" />
      ),
      filters: [
        { text: 'Category A', value: 'A' },
        { text: 'Category B', value: 'B' },
        { text: 'Category C', value: 'C' },
      ],
      onFilter: (value, record) => record.triageCategory === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={statusColorMap[status] ?? 'default'}>
          {status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Tag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      width: 90,
      align: 'center',
      responsive: ['lg'],
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          size="small"
          onClick={(e) => { e.stopPropagation(); handleRowClick(record); }}
        />
      ),
    },
  ];

  // Map the consultation record to the shape ConsultationDrawer expects
  const drawerData = selectedConsultation
    ? {
        id: selectedConsultation.id,
        patientName: selectedConsultation.patientName,
        patientAge: selectedConsultation.patientAge,
        patientGender: selectedConsultation.patientGender,
        consultationDate: selectedConsultation.consultationDate,
        centerId: selectedConsultation.centerId,
        centerName: selectedConsultation.centerName,
        nurseId: selectedConsultation.nurseId,
        nurseName: selectedConsultation.nurseName,
        status: selectedConsultation.status,
        symptoms: selectedConsultation.symptoms,
        vitals: selectedConsultation.vitals
          ? {
              temperature: selectedConsultation.vitals.temperature,
              systolic: selectedConsultation.vitals.bloodPressureSystolic,
              diastolic: selectedConsultation.vitals.bloodPressureDiastolic,
              heartRate: selectedConsultation.vitals.heartRate,
              respiratoryRate: selectedConsultation.vitals.respiratoryRate,
              spO2: selectedConsultation.vitals.spO2,
            }
          : undefined,
        triageResult: selectedConsultation.triageResult
          ? {
              ...selectedConsultation.triageResult,
              // Normalize urgency score from 1-10 to 0-100 scale for drawer display
              urgencyScore: selectedConsultation.triageResult.urgencyScore * 10,
            }
          : undefined,
        soapNote: selectedConsultation.soapNote,
      }
    : null;

  return (
    <div>
      <PageHeader
        title="Consultations"
        subtitle="View and review all patient consultations across centers"
      />

      {/* Filters */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={7}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) =>
                setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])
              }
              placeholder={['Start Date', 'End Date']}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              value={centerFilter}
              onChange={setCenterFilter}
              options={CENTER_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Center"
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              value={triageFilter}
              onChange={setTriageFilter}
              options={TRIAGE_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Triage"
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Status"
            />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={filteredConsultations}
          columns={columns}
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} consultations`,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Detail Drawer */}
      <ConsultationDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedConsultation(null);
        }}
        consultation={drawerData}
      />
    </div>
  );
}
