'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Input,
  Select,
  Row,
  Col,
  Space,
  Typography,
  Pagination,
  Spin,
  Empty,
  Card,
} from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useTrialStore, ClinicalTrial } from '@/stores/trial-store';
import { TrialCard } from '@/components/data-display/trial-card';
import { PageHeader } from '@/components/ui/page-header';

// ---------------------------------------------------------------------------
// Mock trial search results
// ---------------------------------------------------------------------------

const MOCK_TRIALS: ClinicalTrial[] = [
  {
    id: 'trial-001',
    nctId: 'NCT05678901',
    title: 'Evaluating Novel Oral Diabetes Management in Type 2 Diabetics',
    titleHi: 'टाइप 2 मधुमेह रोगियों में नई मौखिक मधुमेह प्रबंधन का मूल्यांकन',
    summary:
      'A Phase 3 randomized controlled trial evaluating a novel GLP-1 receptor agonist for glycemic control.',
    summaryHi:
      'ग्लाइसेमिक नियंत्रण के लिए एक नए GLP-1 रिसेप्टर एगोनिस्ट का मूल्यांकन करने वाला चरण 3 यादृच्छिक नियंत्रित परीक्षण।',
    phase: 'Phase 3',
    status: 'Recruiting',
    conditions: ['Type 2 Diabetes', 'Hyperglycemia'],
    sponsor: 'National Institute of Diabetes Research',
    locations: [{ facility: 'AIIMS New Delhi', city: 'New Delhi', state: 'Delhi', distance: 5 }],
  },
  {
    id: 'trial-002',
    nctId: 'NCT05678902',
    title: 'Ayurvedic Formulation for Hypertension Management',
    titleHi: 'उच्च रक्तचाप प्रबंधन के लिए आयुर्वेदिक फॉर्मूलेशन',
    summary:
      'Studying the effectiveness of a standardized Ayurvedic compound in managing Stage 1 hypertension.',
    phase: 'Phase 2',
    status: 'Recruiting',
    conditions: ['Hypertension', 'Cardiovascular'],
    sponsor: 'AYUSH Ministry',
    locations: [{ facility: 'CCRAS Pune', city: 'Pune', state: 'Maharashtra', distance: 12 }],
  },
  {
    id: 'trial-003',
    nctId: 'NCT05678903',
    title: 'mHealth Intervention for Rural Diabetes Self-Management',
    titleHi: 'ग्रामीण मधुमेह स्व-प्रबंधन के लिए mHealth हस्तक्षेप',
    summary:
      'Evaluating a mobile health platform for improving diabetes self-management in rural populations.',
    phase: 'Phase 3',
    status: 'Enrolling by Invitation',
    conditions: ['Type 2 Diabetes', 'Digital Health'],
    sponsor: 'Indian Council of Medical Research',
    locations: [{ facility: 'ICMR Regional Centre', city: 'Raipur', state: 'Chhattisgarh', distance: 8 }],
  },
  {
    id: 'trial-004',
    nctId: 'NCT05678904',
    title: 'Yoga and Meditation for Stress-Related Hypertension',
    titleHi: 'तनाव-संबंधित उच्च रक्तचाप के लिए योग और ध्यान',
    summary:
      'Evaluating structured yoga and meditation programs as complementary therapy for stress-related hypertension.',
    phase: 'Phase 2',
    status: 'Recruiting',
    conditions: ['Hypertension', 'Stress'],
    sponsor: 'NIMHANS Bangalore',
    locations: [{ facility: 'NIMHANS', city: 'Bangalore', state: 'Karnataka', distance: 3 }],
  },
  {
    id: 'trial-005',
    nctId: 'NCT05678905',
    title: 'Tuberculosis Vaccine Booster Trial in Adults',
    titleHi: 'वयस्कों में तपेदिक वैक्सीन बूस्टर ट्रायल',
    summary:
      'Phase 2b trial of a novel TB vaccine booster candidate in BCG-vaccinated adults to evaluate immunogenicity.',
    phase: 'Phase 2',
    status: 'Recruiting',
    conditions: ['Tuberculosis', 'Infectious Disease'],
    sponsor: 'Serum Institute of India',
    locations: [{ facility: 'KEM Hospital', city: 'Mumbai', state: 'Maharashtra', distance: 15 }],
  },
  {
    id: 'trial-006',
    nctId: 'NCT05678906',
    title: 'AI-Assisted Early Detection of Diabetic Retinopathy',
    titleHi: 'डायबिटिक रेटिनोपैथी की AI-सहायता प्रारंभिक पहचान',
    summary:
      'A multi-center study assessing AI-based fundus image analysis for early detection of diabetic retinopathy in primary healthcare settings.',
    phase: 'Phase 4',
    status: 'Active, not recruiting',
    conditions: ['Diabetic Retinopathy', 'Type 2 Diabetes'],
    sponsor: 'Sankara Nethralaya',
    locations: [{ facility: 'Sankara Nethralaya', city: 'Chennai', state: 'Tamil Nadu', distance: 7 }],
  },
];

const CONDITION_OPTIONS = [
  { label: 'Diabetes', value: 'Diabetes' },
  { label: 'Hypertension', value: 'Hypertension' },
  { label: 'Tuberculosis', value: 'Tuberculosis' },
  { label: 'Cardiovascular', value: 'Cardiovascular' },
  { label: 'Infectious Disease', value: 'Infectious Disease' },
  { label: 'Digital Health', value: 'Digital Health' },
];

const PHASE_OPTIONS = [
  { label: 'Phase 1', value: 'Phase 1' },
  { label: 'Phase 2', value: 'Phase 2' },
  { label: 'Phase 3', value: 'Phase 3' },
  { label: 'Phase 4', value: 'Phase 4' },
];

const STATUS_OPTIONS = [
  { label: 'Recruiting', value: 'Recruiting' },
  { label: 'Enrolling by Invitation', value: 'Enrolling by Invitation' },
  { label: 'Active, not recruiting', value: 'Active, not recruiting' },
  { label: 'Completed', value: 'Completed' },
];

const PAGE_SIZE = 4;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TrialsSearchPage() {
  const router = useRouter();
  const { language } = useTranslation();
  const {
    searchResults,
    searchQuery,
    isSearching,
    setSearchResults,
    setSearchQuery,
    setSearching,
  } = useTrialStore();

  const [conditionFilter, setConditionFilter] = useState<string | undefined>();
  const [phaseFilter, setPhaseFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [locationFilter, setLocationFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Load mock data on mount
  useEffect(() => {
    if (searchResults.length === 0) {
      setSearchResults(MOCK_TRIALS);
    }
  }, [searchResults.length, setSearchResults]);

  const allTrials = searchResults;

  // Filtered results
  const filtered = useMemo(() => {
    let results = allTrials;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.titleHi?.toLowerCase().includes(q)) ||
          t.summary.toLowerCase().includes(q) ||
          (t.summaryHi?.toLowerCase().includes(q)) ||
          t.conditions.some((c) => c.toLowerCase().includes(q)) ||
          t.sponsor.toLowerCase().includes(q),
      );
    }

    if (conditionFilter) {
      results = results.filter((t) =>
        t.conditions.some((c) =>
          c.toLowerCase().includes(conditionFilter.toLowerCase()),
        ),
      );
    }

    if (phaseFilter) {
      results = results.filter((t) => t.phase === phaseFilter);
    }

    if (statusFilter) {
      results = results.filter((t) => t.status === statusFilter);
    }

    if (locationFilter.trim()) {
      const loc = locationFilter.toLowerCase();
      results = results.filter(
        (t) =>
          t.locations?.some(
            (l) =>
              l.city.toLowerCase().includes(loc) ||
              l.state.toLowerCase().includes(loc),
          ) ?? false,
      );
    }

    return results;
  }, [allTrials, searchQuery, conditionFilter, phaseFilter, statusFilter, locationFilter]);

  // Paginated
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      setCurrentPage(1);
      setSearching(true);
      setTimeout(() => setSearching(false), 500);
    },
    [setSearchQuery, setSearching],
  );

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'क्लिनिकल ट्रायल खोजें' : 'Search Clinical Trials'}
        subtitle={
          language === 'hi'
            ? `${filtered.length} ट्रायल उपलब्ध`
            : `${filtered.length} trials available`
        }
      />

      {/* Search Bar */}
      <Card style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder={
            language === 'hi'
              ? 'ट्रायल, स्थिति, या प्रायोजक खोजें...'
              : 'Search trials, conditions, or sponsors...'
          }
          size="large"
          enterButton={
            <span>
              <SearchOutlined /> {language === 'hi' ? 'खोजें' : 'Search'}
            </span>
          }
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          onSearch={handleSearch}
          allowClear
        />

        {/* Filters */}
        <div style={{ marginTop: 16 }}>
          <Space style={{ marginBottom: 8 }}>
            <FilterOutlined />
            <Typography.Text type="secondary">
              {language === 'hi' ? 'फिल्टर' : 'Filters'}
            </Typography.Text>
          </Space>
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} md={6}>
              <Select
                placeholder={language === 'hi' ? 'स्थिति' : 'Condition'}
                options={CONDITION_OPTIONS}
                value={conditionFilter}
                onChange={(val) => {
                  setConditionFilter(val);
                  setCurrentPage(1);
                }}
                allowClear
                style={{ width: '100%' }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                placeholder={language === 'hi' ? 'चरण' : 'Phase'}
                options={PHASE_OPTIONS}
                value={phaseFilter}
                onChange={(val) => {
                  setPhaseFilter(val);
                  setCurrentPage(1);
                }}
                allowClear
                style={{ width: '100%' }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                placeholder={language === 'hi' ? 'स्थिति' : 'Status'}
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setCurrentPage(1);
                }}
                allowClear
                style={{ width: '100%' }}
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Input
                placeholder={language === 'hi' ? 'स्थान (शहर/राज्य)' : 'Location (city/state)'}
                value={locationFilter}
                onChange={(e) => {
                  setLocationFilter(e.target.value);
                  setCurrentPage(1);
                }}
                allowClear
              />
            </Col>
          </Row>
        </div>
      </Card>

      {/* Results */}
      {isSearching ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            {language === 'hi' ? 'खोज रहे हैं...' : 'Searching...'}
          </Typography.Text>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <Empty
            description={
              <Space direction="vertical" size={4}>
                <Typography.Text>
                  {language === 'hi'
                    ? 'कोई ट्रायल नहीं मिला'
                    : 'No trials found'}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {language === 'hi'
                    ? 'अपनी खोज या फिल्टर बदलकर देखें'
                    : 'Try adjusting your search or filters'}
                </Typography.Text>
              </Space>
            }
          />
        </Card>
      ) : (
        <>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {paginated.map((trial) => (
              <TrialCard
                key={trial.id}
                id={trial.id}
                title={
                  language === 'hi' && trial.titleHi
                    ? trial.titleHi
                    : trial.title
                }
                summary={
                  language === 'hi' && trial.summaryHi
                    ? trial.summaryHi
                    : trial.summary
                }
                phase={trial.phase}
                status={trial.status}
                conditions={trial.conditions}
                sponsor={trial.sponsor}
                location={
                  trial.locations?.[0]
                    ? `${trial.locations[0].city}, ${trial.locations[0].state}`
                    : undefined
                }
                onClick={(id) => router.push(`/patient/trials/${id}`)}
              />
            ))}
          </Space>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <Pagination
                current={currentPage}
                total={filtered.length}
                pageSize={PAGE_SIZE}
                onChange={(page) => setCurrentPage(page)}
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
