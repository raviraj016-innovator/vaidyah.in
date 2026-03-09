'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Avatar,
  Descriptions,
  Tag,
  Input,
  Button,
  Divider,
  App,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  LogoutOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
  AlertOutlined,
  IdcardOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useAuthStore, PatientUser } from '@/stores/auth-store';
import { useAuth } from '@/lib/auth/use-auth';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useTrialStore } from '@/stores/trial-store';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { PageHeader } from '@/components/ui/page-header';
import { authApi } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

// ---------------------------------------------------------------------------
// Editable Tag List Component
// ---------------------------------------------------------------------------

function EditableTagList({
  items,
  onAdd,
  onRemove,
  placeholder,
  color,
}: {
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder: string;
  color?: string;
}) {
  const [inputValue, setInputValue] = useState('');
  const [inputVisible, setInputVisible] = useState(false);

  const handleAdd = () => {
    const value = inputValue.trim();
    if (value && !items.includes(value)) {
      onAdd(value);
    }
    setInputValue('');
    setInputVisible(false);
  };

  return (
    <div>
      <Space wrap size={[8, 8]}>
        {items.map((item) => (
          <Tag
            key={item}
            closable
            onClose={() => onRemove(item)}
            color={color}
            style={{ fontSize: 13, padding: '2px 10px' }}
          >
            {item}
          </Tag>
        ))}
        {inputVisible ? (
          <Input
            size="small"
            style={{ width: 150 }}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleAdd}
            onBlur={handleAdd}
            autoFocus
            placeholder={placeholder}
          />
        ) : (
          <Tag
            onClick={() => setInputVisible(true)}
            style={{
              borderStyle: 'dashed',
              cursor: 'pointer',
              fontSize: 13,
              padding: '2px 10px',
            }}
          >
            <PlusOutlined /> {placeholder}
          </Tag>
        )}
      </Space>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientProfilePage() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const user = useAuthStore((s) => s.user) as PatientUser | null;
  const { logout } = useAuth();
  const { language } = useTranslation();
  const matches = useTrialStore((s) => s.matches);
  const matchCount = matches.length;
  const eligibleCount = matches.filter((m) => m.eligible).length;

  // Local editable state — synced from user profile
  const [conditions, setConditions] = useState<string[]>(
    user?.conditions ?? [],
  );
  const [medications, setMedications] = useState<string[]>(
    user?.medications ?? [],
  );
  const [allergies, setAllergies] = useState<string[]>(
    user?.allergies ?? [],
  );

  // Sync local state when user changes in store
  useEffect(() => {
    setConditions(user?.conditions ?? []);
    setMedications(user?.medications ?? []);
    setAllergies(user?.allergies ?? []);
  }, [user]);

  const updatePatientProfile = useAuthStore((s) => s.updatePatientProfile);

  // Fetch fresh profile on mount to ensure latest data
  useEffect(() => {
    if (!user || user.id?.startsWith('guest')) return;
    authApi.get(endpoints.auth.me).then(({ data: meData }) => {
      const profile = meData.data ?? meData;
      updatePatientProfile({
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        abdmId: profile.abdm_id,
        location: {
          city: profile.district,
          state: profile.state,
          pincode: profile.pincode,
        },
        conditions: profile.conditions ?? profile.medical_history?.conditions ?? [],
        medications: profile.medications ?? profile.medical_history?.medications ?? [],
        allergies: profile.allergies ?? profile.medical_history?.allergies ?? [],
        familyHistory: profile.familyHistory ?? profile.medical_history?.family_history ?? [],
        profileComplete: profile.profileComplete ?? true,
      });
    }).catch(() => { /* use cached store data */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userName = user?.name ?? 'Patient User';
  const userPhone = user?.phone ?? '—';
  const abdmId = user?.abdmId;
  const userAge = user?.age;
  const userGender = user?.gender;
  const userLocationRaw = user?.location;
  const userLocation =
    typeof userLocationRaw === 'object' && userLocationRaw
      ? [userLocationRaw.city, userLocationRaw.state, userLocationRaw.pincode].filter(Boolean).join(', ')
      : (userLocationRaw ?? undefined);
  const locationCity = typeof userLocationRaw === 'object' && userLocationRaw ? userLocationRaw.city : undefined;
  const locationState = typeof userLocationRaw === 'object' && userLocationRaw ? userLocationRaw.state : undefined;
  const locationPincode = typeof userLocationRaw === 'object' && userLocationRaw ? userLocationRaw.pincode : undefined;

  const handleLogout = useCallback(() => {
    modal.confirm({
      title: language === 'hi' ? 'लॉगआउट करें?' : 'Logout?',
      content:
        language === 'hi'
          ? 'क्या आप वाकई लॉगआउट करना चाहते हैं?'
          : 'Are you sure you want to logout?',
      okText: language === 'hi' ? 'हाँ' : 'Yes',
      cancelText: language === 'hi' ? 'रद्द करें' : 'Cancel',
      okType: 'danger',
      onOk: logout,
    });
  }, [logout, language, modal]);

  // Persist profile changes to backend and update store
  const syncProfile = useCallback(
    (updatedConditions: string[], updatedMedications: string[], updatedAllergies: string[]) => {
      authApi.patch(endpoints.auth.me + '/profile', {
        conditions: updatedConditions,
        medications: updatedMedications,
        allergies: updatedAllergies,
      }).then(() => {
        updatePatientProfile({
          conditions: updatedConditions,
          medications: updatedMedications,
          allergies: updatedAllergies,
        });
      }).catch((err) => console.error('Failed to sync profile:', err));
    },
    [updatePatientProfile],
  );

  const handleAddCondition = useCallback(
    (item: string) => {
      setConditions((prev) => {
        const next = [...prev, item];
        syncProfile(next, medications, allergies);
        return next;
      });
      message.success(
        language === 'hi' ? 'स्थिति जोड़ी गई' : 'Condition added',
      );
    },
    [language, medications, allergies, syncProfile],
  );

  const handleRemoveCondition = useCallback(
    (item: string) => {
      setConditions((prev) => {
        const next = prev.filter((c) => c !== item);
        syncProfile(next, medications, allergies);
        return next;
      });
    },
    [medications, allergies, syncProfile],
  );

  const handleAddMedication = useCallback(
    (item: string) => {
      setMedications((prev) => {
        const next = [...prev, item];
        syncProfile(conditions, next, allergies);
        return next;
      });
      message.success(
        language === 'hi' ? 'दवा जोड़ी गई' : 'Medication added',
      );
    },
    [language, conditions, allergies, syncProfile],
  );

  const handleRemoveMedication = useCallback(
    (item: string) => {
      setMedications((prev) => {
        const next = prev.filter((m) => m !== item);
        syncProfile(conditions, next, allergies);
        return next;
      });
    },
    [conditions, allergies, syncProfile],
  );

  const handleAddAllergy = useCallback(
    (item: string) => {
      setAllergies((prev) => {
        const next = [...prev, item];
        syncProfile(conditions, medications, next);
        return next;
      });
      message.success(
        language === 'hi' ? 'एलर्जी जोड़ी गई' : 'Allergy added',
      );
    },
    [language, conditions, medications, syncProfile],
  );

  const handleRemoveAllergy = useCallback(
    (item: string) => {
      setAllergies((prev) => {
        const next = prev.filter((a) => a !== item);
        syncProfile(conditions, medications, next);
        return next;
      });
    },
    [conditions, medications, syncProfile],
  );

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'प्रोफाइल' : 'Profile'}
        subtitle={
          language === 'hi'
            ? 'अपनी स्वास्थ्य जानकारी प्रबंधित करें'
            : 'Manage your health information'
        }
      />

      {/* User Info Header */}
      <Card style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <Avatar
            size={72}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#7c3aed', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {userName}
            </Typography.Title>
            <Space direction="vertical" size={2} style={{ marginTop: 4 }}>
              {abdmId && (
                <Typography.Text type="secondary">
                  <IdcardOutlined style={{ marginRight: 6 }} />
                  ABDM: {abdmId}
                </Typography.Text>
              )}
              <Typography.Text type="secondary">
                {userPhone}
              </Typography.Text>
            </Space>
          </div>
        </div>
      </Card>

      {/* Section 1: Basic Info */}
      <Card
        title={
          <Space>
            <UserOutlined />
            {language === 'hi' ? 'मूल जानकारी' : 'Basic Information'}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={language === 'hi' ? 'उम्र' : 'Age'}>
            {userAge ? `${userAge} ${language === 'hi' ? 'वर्ष' : 'years'}` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={language === 'hi' ? 'लिंग' : 'Gender'}>
            {userGender ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label={language === 'hi' ? 'स्थान' : 'Location'}>
            {userLocation ?? '—'}
          </Descriptions.Item>
          {locationCity && (
            <Descriptions.Item label={language === 'hi' ? 'शहर' : 'City'}>
              {locationCity}
            </Descriptions.Item>
          )}
          {locationState && (
            <Descriptions.Item label={language === 'hi' ? 'राज्य' : 'State'}>
              {locationState}
            </Descriptions.Item>
          )}
          {locationPincode && (
            <Descriptions.Item label={language === 'hi' ? 'पिनकोड' : 'Pincode'}>
              {locationPincode}
            </Descriptions.Item>
          )}
          {abdmId && (
            <Descriptions.Item label="ABDM ID">
              {abdmId}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Section: Trial Match Summary */}
      <Card
        title={
          <Space>
            <ExperimentOutlined />
            {language === 'hi' ? 'ट्रायल मिलान सारांश' : 'Trial Match Summary'}
          </Space>
        }
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="link"
            size="small"
            onClick={() => router.push('/patient/trials')}
          >
            {language === 'hi' ? 'सभी देखें' : 'View All'}
          </Button>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Statistic
              title={language === 'hi' ? 'मिलान किए गए' : 'Matched'}
              value={matchCount}
              valueStyle={{ color: '#7c3aed' }}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title={language === 'hi' ? 'पात्र' : 'Eligible'}
              value={eligibleCount}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title={language === 'hi' ? 'स्थितियां' : 'Conditions'}
              value={conditions.length}
              valueStyle={{ color: '#1677ff' }}
            />
          </Col>
        </Row>
        <Typography.Text
          type="secondary"
          style={{ display: 'block', marginTop: 12, fontSize: 12 }}
        >
          {language === 'hi'
            ? 'आपकी स्वास्थ्य स्थितियों के आधार पर ट्रायल स्वचालित रूप से मिलान किए जाते हैं'
            : 'Trials are automatically matched based on your health conditions, age, and location'}
        </Typography.Text>
      </Card>

      {/* Section 2: Health Conditions */}
      <Card
        title={
          <Space>
            <HeartOutlined />
            {language === 'hi' ? 'स्वास्थ्य स्थितियां' : 'Health Conditions'}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <EditableTagList
          items={conditions}
          onAdd={handleAddCondition}
          onRemove={handleRemoveCondition}
          placeholder={language === 'hi' ? 'स्थिति जोड़ें' : 'Add condition'}
          color="blue"
        />
        <Typography.Text
          type="secondary"
          style={{ display: 'block', marginTop: 8, fontSize: 12 }}
        >
          {language === 'hi'
            ? 'ये स्थितियां ट्रायल मिलान के लिए उपयोग की जाती हैं'
            : 'These conditions are used for trial matching'}
        </Typography.Text>
      </Card>

      {/* Section 3: Current Medications */}
      <Card
        title={
          <Space>
            <MedicineBoxOutlined />
            {language === 'hi' ? 'वर्तमान दवाएं' : 'Current Medications'}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <EditableTagList
          items={medications}
          onAdd={handleAddMedication}
          onRemove={handleRemoveMedication}
          placeholder={language === 'hi' ? 'दवा जोड़ें' : 'Add medication'}
          color="green"
        />
      </Card>

      {/* Section 4: Allergies */}
      <Card
        title={
          <Space>
            <AlertOutlined />
            {language === 'hi' ? 'एलर्जी' : 'Allergies'}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <EditableTagList
          items={allergies}
          onAdd={handleAddAllergy}
          onRemove={handleRemoveAllergy}
          placeholder={language === 'hi' ? 'एलर्जी जोड़ें' : 'Add allergy'}
          color="orange"
        />
      </Card>

      {/* Section 5: Language Preference */}
      <Card
        title={language === 'hi' ? 'भाषा प्राथमिकता' : 'Language Preference'}
        style={{ marginBottom: 24 }}
      >
        <Space direction="vertical" size={8}>
          <Typography.Text type="secondary">
            {language === 'hi'
              ? 'अपनी पसंदीदा भाषा चुनें'
              : 'Choose your preferred language'}
          </Typography.Text>
          <LanguageSwitcher />
        </Space>
      </Card>

      {/* Logout */}
      <Button
        danger
        icon={<LogoutOutlined />}
        size="large"
        block
        onClick={handleLogout}
        style={{ marginBottom: 40 }}
      >
        {language === 'hi' ? 'लॉगआउट' : 'Logout'}
      </Button>
    </div>
  );
}
