import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FunnelIcon,
  EyeIcon,
  XMarkIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { Dialog, Transition } from '@headlessui/react';
import { api, endpoints } from '../config/api';
import { usePagination } from '../hooks/usePagination';

type TriageLevel = 'A' | 'B' | 'C';
type ConsultationStatus = 'in_progress' | 'completed' | 'referred' | 'emergency';

interface Consultation {
  id: string;
  date: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  nurseName: string;
  center: string;
  centerId: string;
  triageLevel: TriageLevel;
  status: ConsultationStatus;
  duration: number;
}

interface ConsultationsResponse {
  data: Consultation[];
  total: number;
  page: number;
  pageSize: number;
}

interface Center {
  id: string;
  name: string;
}

interface Vital {
  label: string;
  value: string;
  unit: string;
  status?: 'normal' | 'warning' | 'critical';
}

interface Symptom {
  name: string;
  severity: 'mild' | 'moderate' | 'severe';
  duration: string;
}

interface ConsultationDetail {
  id: string;
  date: string;
  patient: {
    name: string;
    age: number;
    gender: string;
    phone: string;
    village: string;
    bloodGroup: string;
  };
  nurse: { name: string; id: string };
  center: string;
  triageLevel: TriageLevel;
  status: ConsultationStatus;
  duration: number;
  vitals: Vital[];
  symptoms: Symptom[];
  diagnosis: string;
  triageReason: string;
  chiefComplaint: string;
}

interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface TranscriptEntry {
  speaker: 'nurse' | 'patient' | 'system';
  text: string;
  timestamp: string;
}

interface ProsodyScore {
  emotion: string;
  score: number;
  color: string;
}

const TRIAGE_BADGE: Record<TriageLevel, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-yellow-100 text-yellow-800',
  C: 'bg-red-100 text-red-800',
};

const TRIAGE_LABEL: Record<TriageLevel, string> = {
  A: 'Level A',
  B: 'Level B',
  C: 'Level C',
};

const STATUS_BADGE: Record<ConsultationStatus, string> = {
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  referred: 'bg-purple-100 text-purple-800',
  emergency: 'bg-red-100 text-red-800',
};

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  in_progress: 'In Progress',
  completed: 'Completed',
  referred: 'Referred',
  emergency: 'Emergency',
};

const SEVERITY_BADGE: Record<string, string> = {
  mild: 'bg-green-100 text-green-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  severe: 'bg-red-100 text-red-700',
};

const VITAL_STATUS_COLOR: Record<string, string> = {
  normal: 'text-green-600',
  warning: 'text-yellow-600',
  critical: 'text-red-600',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export default function ConsultationsPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [centerFilter, setCenterFilter] = useState('');
  const [triageFilter, setTriageFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { page, pageSize, setPage, setPageSize } = usePagination([], {
    initialPageSize: 10,
  });

  const consultationsQuery = useQuery({
    queryKey: ['consultations', page, pageSize, dateFrom, dateTo, centerFilter, triageFilter, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (centerFilter) params.centerId = centerFilter;
      if (triageFilter) params.triageLevel = triageFilter;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get<ConsultationsResponse>(endpoints.consultations.list, { params });
      return data;
    },
  });

  const centersQuery = useQuery({
    queryKey: ['centers-list'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Center[] }>(endpoints.centers.list);
      return data.data;
    },
    staleTime: 5 * 60_000,
  });

  const totalItems = consultationsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const consultations = consultationsQuery.data?.data ?? [];
  const centers = centersQuery.data ?? [];

  const pageRange = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: number[] = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) pages.push(-1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push(-2);
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Consultations</h1>
        <p className="page-subtitle">Review and manage patient consultations across all centers</p>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              placeholder="From"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              className="form-input"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              placeholder="To"
            />
          </div>
          <select
            className="form-select min-w-[160px]"
            value={centerFilter}
            onChange={(e) => {
              setCenterFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="form-select min-w-[140px]"
            value={triageFilter}
            onChange={(e) => {
              setTriageFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Triage</option>
            <option value="A">Level A (Green)</option>
            <option value="B">Level B (Yellow)</option>
            <option value="C">Level C (Red)</option>
          </select>
          <select
            className="form-select min-w-[150px]"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="referred">Referred</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="table-cell">Date</th>
              <th className="table-cell">Patient</th>
              <th className="table-cell">Nurse</th>
              <th className="table-cell">Center</th>
              <th className="table-cell">Triage</th>
              <th className="table-cell">Status</th>
              <th className="table-cell">Duration</th>
              <th className="table-cell">Actions</th>
            </tr>
          </thead>
          <tbody>
            {consultationsQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="table-cell text-center py-12 text-gray-400">
                  Loading consultations...
                </td>
              </tr>
            ) : consultations.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-cell text-center py-12 text-gray-400">
                  No consultations found
                </td>
              </tr>
            ) : (
              consultations.map((c) => (
                <tr
                  key={c.id}
                  className="table-row cursor-pointer"
                  onClick={() => setSelectedId(c.id)}
                >
                  <td className="table-cell">
                    {new Date(c.date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="table-cell font-medium text-gray-900">{c.patientName}</td>
                  <td className="table-cell">{c.nurseName}</td>
                  <td className="table-cell">{c.center}</td>
                  <td className="table-cell">
                    <span className={`badge ${TRIAGE_BADGE[c.triageLevel]}`}>
                      {TRIAGE_LABEL[c.triageLevel]}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${STATUS_BADGE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="inline-flex items-center gap-1 text-gray-500">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {formatDuration(c.duration)}
                    </span>
                  </td>
                  <td className="table-cell">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(c.id);
                      }}
                      title="View consultation"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalItems)} of{' '}
            {totalItems} consultations
          </p>
          <div className="flex items-center gap-1">
            <button
              className="btn-ghost btn-sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            {pageRange.map((p, idx) =>
              p < 0 ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  className={`btn-sm rounded-lg px-3 py-1.5 text-sm font-medium ${
                    p === page
                      ? 'bg-primary-600 text-white'
                      : 'btn-ghost'
                  }`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ),
            )}
            <button
              className="btn-ghost btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
          <select
            className="form-select w-auto"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
        </div>
      )}

      <ConsultationSlideOver
        consultationId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function ConsultationSlideOver({
  consultationId,
  onClose,
}: {
  consultationId: string | null;
  onClose: () => void;
}) {
  const isOpen = !!consultationId;

  const detailQuery = useQuery({
    queryKey: ['consultation-detail', consultationId],
    queryFn: async () => {
      const { data } = await api.get<ConsultationDetail>(
        endpoints.consultations.detail(consultationId!),
      );
      return data;
    },
    enabled: isOpen,
  });

  const soapQuery = useQuery({
    queryKey: ['consultation-soap', consultationId],
    queryFn: async () => {
      const { data } = await api.get<SoapNote>(
        endpoints.consultations.soapNote(consultationId!),
      );
      return data;
    },
    enabled: isOpen,
  });

  const transcriptQuery = useQuery({
    queryKey: ['consultation-transcript', consultationId],
    queryFn: async () => {
      const { data } = await api.get<TranscriptEntry[]>(
        endpoints.consultations.transcript(consultationId!),
      );
      return data;
    },
    enabled: isOpen,
  });

  const prosodyQuery = useQuery({
    queryKey: ['consultation-prosody', consultationId],
    queryFn: async () => {
      const { data } = await api.get<ProsodyScore[]>(
        endpoints.consultations.prosody(consultationId!),
      );
      return data;
    },
    enabled: isOpen,
  });

  const detail = detailQuery.data;
  const soap = soapQuery.data;
  const transcript = transcriptQuery.data ?? [];
  const prosody = prosodyQuery.data ?? [];

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-200"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-2xl">
                  <div className="flex h-full flex-col bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                      <Dialog.Title className="text-lg font-semibold text-gray-900">
                        Consultation Details
                      </Dialog.Title>
                      <button
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        onClick={onClose}
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                      {detailQuery.isLoading ? (
                        <div className="flex items-center justify-center py-20 text-gray-400">
                          Loading consultation...
                        </div>
                      ) : detailQuery.isError ? (
                        <div className="flex items-center justify-center py-20 text-red-500">
                          Failed to load consultation details.
                        </div>
                      ) : detail ? (
                        <>
                          <PatientInfoSection detail={detail} />
                          <VitalsSection vitals={detail.vitals} />
                          <SymptomsSection symptoms={detail.symptoms} />
                          <TriageSection detail={detail} />
                          <SoapNoteSection soap={soap} isLoading={soapQuery.isLoading} />
                          <TranscriptSection transcript={transcript} isLoading={transcriptQuery.isLoading} />
                          <ProsodySection prosody={prosody} isLoading={prosodyQuery.isLoading} />
                        </>
                      ) : null}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}

function PatientInfoSection({ detail }: { detail: ConsultationDetail }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Patient Information</h3>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Name</span>
          <p className="font-medium text-gray-900">{detail.patient.name}</p>
        </div>
        <div>
          <span className="text-gray-500">Age / Gender</span>
          <p className="font-medium text-gray-900">
            {detail.patient.age} yrs / {detail.patient.gender}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Blood Group</span>
          <p className="font-medium text-gray-900">{detail.patient.bloodGroup}</p>
        </div>
        <div>
          <span className="text-gray-500">Phone</span>
          <p className="font-medium text-gray-900">{detail.patient.phone}</p>
        </div>
        <div>
          <span className="text-gray-500">Village</span>
          <p className="font-medium text-gray-900">{detail.patient.village}</p>
        </div>
        <div>
          <span className="text-gray-500">Center</span>
          <p className="font-medium text-gray-900">{detail.center}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-sm">
        <span className="text-gray-500">Nurse:</span>
        <span className="font-medium text-gray-900">{detail.nurse.name}</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">Date:</span>
        <span className="font-medium text-gray-900">
          {new Date(detail.date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">Duration:</span>
        <span className="font-medium text-gray-900">{formatDuration(detail.duration)}</span>
      </div>
    </div>
  );
}

function VitalsSection({ vitals }: { vitals: Vital[] }) {
  if (!vitals || vitals.length === 0) return null;
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Vitals</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {vitals.map((v) => (
          <div key={v.label} className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">{v.label}</p>
            <p className={`text-lg font-semibold ${v.status ? VITAL_STATUS_COLOR[v.status] : 'text-gray-900'}`}>
              {v.value}
              <span className="text-xs font-normal text-gray-400 ml-1">{v.unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SymptomsSection({ symptoms }: { symptoms: Symptom[] }) {
  if (!symptoms || symptoms.length === 0) return null;
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Symptoms</h3>
      <div className="space-y-2">
        {symptoms.map((s, idx) => (
          <div key={idx} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <div>
              <span className="text-sm font-medium text-gray-900">{s.name}</span>
              {s.duration && (
                <span className="text-xs text-gray-500 ml-2">({s.duration})</span>
              )}
            </div>
            <span className={`badge ${SEVERITY_BADGE[s.severity]}`}>
              {s.severity.charAt(0).toUpperCase() + s.severity.slice(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TriageSection({ detail }: { detail: ConsultationDetail }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Triage Result</h3>
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-1">
          <span className={`badge text-base px-4 py-1.5 ${TRIAGE_BADGE[detail.triageLevel]}`}>
            {TRIAGE_LABEL[detail.triageLevel]}
          </span>
          <span className={`badge ${STATUS_BADGE[detail.status]}`}>
            {STATUS_LABEL[detail.status]}
          </span>
        </div>
        <div className="flex-1 space-y-2 text-sm">
          {detail.chiefComplaint && (
            <div>
              <span className="text-gray-500">Chief Complaint:</span>
              <p className="text-gray-900">{detail.chiefComplaint}</p>
            </div>
          )}
          {detail.diagnosis && (
            <div>
              <span className="text-gray-500">Diagnosis:</span>
              <p className="font-medium text-gray-900">{detail.diagnosis}</p>
            </div>
          )}
          {detail.triageReason && (
            <div>
              <span className="text-gray-500">Triage Rationale:</span>
              <p className="text-gray-700">{detail.triageReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SoapNoteSection({ soap, isLoading }: { soap?: SoapNote; isLoading: boolean }) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">SOAP Note</h3>
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading SOAP note...</p>
      ) : !soap ? (
        <p className="text-sm text-gray-400">No SOAP note available.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {(['subjective', 'objective', 'assessment', 'plan'] as const).map((key) => (
            <div key={key}>
              <h4 className="font-medium text-gray-700 mb-0.5">
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </h4>
              <p className="text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">
                {soap[key]}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptSection({
  transcript,
  isLoading,
}: {
  transcript: TranscriptEntry[];
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const SPEAKER_STYLE: Record<string, { label: string; bg: string; text: string }> = {
    nurse: { label: 'Nurse', bg: 'bg-blue-100', text: 'text-blue-800' },
    patient: { label: 'Patient', bg: 'bg-green-100', text: 'text-green-800' },
    system: { label: 'System', bg: 'bg-gray-100', text: 'text-gray-600' },
  };

  const visible = expanded ? transcript : transcript.slice(0, 6);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Transcript</h3>
        {transcript.length > 0 && (
          <span className="text-xs text-gray-400">{transcript.length} entries</span>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading transcript...</p>
      ) : transcript.length === 0 ? (
        <p className="text-sm text-gray-400">No transcript available.</p>
      ) : (
        <>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {visible.map((entry, idx) => {
              const style = SPEAKER_STYLE[entry.speaker] ?? SPEAKER_STYLE.system;
              return (
                <div key={idx} className="flex gap-3 text-sm">
                  <span className="text-xs text-gray-400 shrink-0 w-12 pt-0.5 text-right">
                    {entry.timestamp}
                  </span>
                  <span className={`badge shrink-0 ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                  <p className="text-gray-700 flex-1">{entry.text}</p>
                </div>
              );
            })}
          </div>
          {transcript.length > 6 && (
            <button
              className="btn-ghost btn-sm mt-2 w-full justify-center"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUpIcon className="h-4 w-4" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-4 w-4" />
                  Show all {transcript.length} entries
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ProsodySection({
  prosody,
  isLoading,
}: {
  prosody: ProsodyScore[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Prosody / Emotion Analysis</h3>
        <p className="text-sm text-gray-400">Loading prosody data...</p>
      </div>
    );
  }

  if (prosody.length === 0) return null;

  const maxScore = Math.max(...prosody.map((p) => p.score), 1);

  const DEFAULT_COLORS = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ];

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Prosody / Emotion Analysis</h3>
      <div className="space-y-2">
        {prosody.map((p, idx) => {
          const pct = Math.round((p.score / maxScore) * 100);
          const barColor = p.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
          return (
            <div key={p.emotion} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-20 text-right shrink-0 capitalize">
                {p.emotion}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 w-10 text-right">
                {(p.score * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
