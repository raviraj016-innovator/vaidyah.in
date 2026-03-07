import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SignalIcon,
  SignalSlashIcon,
  WifiIcon,
} from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, endpoints } from '@/config/api';
import { useAuthStore } from '@/store/authStore';
import { usePagination } from '@/hooks/usePagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Modal } from '@/components/Modal';

type CenterType = 'PHC' | 'CHC' | 'SC' | 'DH';
type CenterStatus = 'active' | 'inactive';
type ConnectivityType = '4G' | '3G' | 'broadband' | 'satellite' | 'none';

interface Center {
  id: string;
  name: string;
  type: CenterType;
  district: string;
  state: string;
  pincode: string;
  status: CenterStatus;
  connectivity: ConnectivityType;
  staffCount: number;
  consultationsToday: number;
  lastActive: string;
}

interface CentersListResponse {
  data: Center[];
  total: number;
  page: number;
  pageSize: number;
}

interface CenterStats {
  totalConsultations: number;
  avgDailyConsultations: number;
  staffCount: number;
  lastActive: string;
  triageBreakdown: { level: string; count: number }[];
}

const centerFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  type: z.enum(['PHC', 'CHC', 'SC', 'DH']),
  district: z.string().min(2, 'District is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z
    .string()
    .regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  connectivity: z.enum(['4G', '3G', 'broadband', 'satellite', 'none']),
});

type CenterFormData = z.infer<typeof centerFormSchema>;

const CENTER_TYPES: CenterType[] = ['PHC', 'CHC', 'SC', 'DH'];
const CENTER_TYPE_LABELS: Record<CenterType, string> = {
  PHC: 'Primary Health Centre',
  CHC: 'Community Health Centre',
  SC: 'Sub Centre',
  DH: 'District Hospital',
};
const CONNECTIVITY_TYPES: ConnectivityType[] = [
  '4G',
  '3G',
  'broadband',
  'satellite',
  'none',
];

const STATUS_STYLES: Record<CenterStatus, string> = {
  active: 'bg-green-50 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
};

const CONNECTIVITY_STYLES: Record<ConnectivityType, string> = {
  '4G': 'text-green-600',
  broadband: 'text-green-600',
  '3G': 'text-yellow-600',
  satellite: 'text-blue-600',
  none: 'text-red-500',
};

function TableSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="table-row">
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="h-4 w-48 bg-gray-200 rounded" />
            <div className="h-4 w-12 bg-gray-200 rounded" />
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-8 bg-gray-200 rounded" />
            <div className="h-4 w-8 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CentersPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canWrite = hasPermission('centers:write');
  const canDelete = hasPermission('centers:delete');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [stateFilter, setStateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<CenterStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingCenter, setEditingCenter] = useState<Center | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Center | null>(null);

  const pagination = usePagination<Center>([], { initialPageSize: 10 });

  const centersQuery = useQuery<CentersListResponse>({
    queryKey: [
      'centers',
      pagination.page,
      pagination.pageSize,
      debouncedSearch,
      stateFilter,
      statusFilter,
    ],
    queryFn: () =>
      api
        .get(endpoints.centers.list, {
          params: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            search: debouncedSearch || undefined,
            state: stateFilter || undefined,
            status: statusFilter || undefined,
          },
        })
        .then((r) => r.data),
  });

  const statesQuery = useQuery<string[]>({
    queryKey: ['centers', 'states'],
    queryFn: () =>
      api
        .get(endpoints.centers.list, { params: { fields: 'state', distinct: true } })
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const centerStatsQuery = useQuery<CenterStats>({
    queryKey: ['centers', 'stats', expandedId],
    queryFn: () =>
      api.get(endpoints.centers.stats(expandedId!)).then((r) => r.data),
    enabled: !!expandedId,
  });

  const centers = centersQuery.data?.data ?? [];
  const totalItems = centersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));

  const createMutation = useMutation({
    mutationFn: (data: CenterFormData) =>
      api.post(endpoints.centers.create, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['centers'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CenterFormData }) =>
      api.put(endpoints.centers.update(id), data).then((r) => r.data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['centers'] });
      const prev = queryClient.getQueryData<CentersListResponse>([
        'centers',
        pagination.page,
        pagination.pageSize,
        debouncedSearch,
        stateFilter,
        statusFilter,
      ]);
      if (prev) {
        queryClient.setQueryData<CentersListResponse>(
          [
            'centers',
            pagination.page,
            pagination.pageSize,
            debouncedSearch,
            stateFilter,
            statusFilter,
          ],
          {
            ...prev,
            data: prev.data.map((c) =>
              c.id === id ? { ...c, ...data } : c,
            ),
          },
        );
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(
          [
            'centers',
            pagination.page,
            pagination.pageSize,
            debouncedSearch,
            stateFilter,
            statusFilter,
          ],
          context.prev,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['centers'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(endpoints.centers.delete(id)).then((r) => r.data),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['centers'] });
      const prev = queryClient.getQueryData<CentersListResponse>([
        'centers',
        pagination.page,
        pagination.pageSize,
        debouncedSearch,
        stateFilter,
        statusFilter,
      ]);
      if (prev) {
        queryClient.setQueryData<CentersListResponse>(
          [
            'centers',
            pagination.page,
            pagination.pageSize,
            debouncedSearch,
            stateFilter,
            statusFilter,
          ],
          {
            ...prev,
            data: prev.data.filter((c) => c.id !== id),
            total: prev.total - 1,
          },
        );
      }
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(
          [
            'centers',
            pagination.page,
            pagination.pageSize,
            debouncedSearch,
            stateFilter,
            statusFilter,
          ],
          context.prev,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['centers'] });
      setDeleteTarget(null);
    },
  });

  const closeModal = useCallback(() => {
    setModalMode(null);
    setEditingCenter(null);
  }, []);

  const openCreate = useCallback(() => {
    setEditingCenter(null);
    setModalMode('create');
  }, []);

  const openEdit = useCallback((center: Center) => {
    setEditingCenter(center);
    setModalMode('edit');
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
    }
  }, [deleteTarget, deleteMutation]);

  return (
    <div className="space-y-6">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Health Centers</h1>
          <p className="page-subtitle">
            Manage and monitor health center operations
          </p>
        </div>
        {canWrite && (
          <button type="button" className="btn-primary" onClick={openCreate}>
            <PlusIcon className="h-4 w-4" />
            Add Center
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by center name..."
              className="form-input pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.setPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <select
              className="form-select"
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                pagination.setPage(1);
              }}
            >
              <option value="">All States</option>
              {(statesQuery.data ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as CenterStatus | '');
                pagination.setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-container">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr className="table-header">
              <th className="table-cell">Name</th>
              <th className="table-cell">Type</th>
              <th className="table-cell">District</th>
              <th className="table-cell">State</th>
              <th className="table-cell">Status</th>
              <th className="table-cell">Connectivity</th>
              <th className="table-cell text-right">Staff</th>
              <th className="table-cell text-right">Consults Today</th>
              <th className="table-cell text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {centersQuery.isLoading && (
              <tr>
                <td colSpan={9}>
                  <TableSkeleton />
                </td>
              </tr>
            )}
            {!centersQuery.isLoading && centers.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  No health centers found.
                </td>
              </tr>
            )}
            {centers.map((center) => (
              <CenterRow
                key={center.id}
                center={center}
                isExpanded={expandedId === center.id}
                stats={
                  expandedId === center.id ? centerStatsQuery.data : undefined
                }
                statsLoading={
                  expandedId === center.id && centerStatsQuery.isLoading
                }
                canWrite={canWrite}
                canDelete={canDelete}
                onToggle={() => toggleExpand(center.id)}
                onEdit={() => openEdit(center)}
                onDelete={() => setDeleteTarget(center)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {totalItems > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pagination.pageSize}
          pageRange={useMemo(() => {
            const maxVisible = 7;
            if (totalPages <= maxVisible) {
              return Array.from({ length: totalPages }, (_, i) => i + 1);
            }
            const pages: number[] = [1];
            const start = Math.max(2, pagination.page - 1);
            const end = Math.min(totalPages - 1, pagination.page + 1);
            if (start > 2) pages.push(-1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (end < totalPages - 1) pages.push(-2);
            pages.push(totalPages);
            return pages;
          }, [pagination.page, totalPages])}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      )}

      <CenterFormModal
        mode={modalMode}
        center={editingCenter}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onClose={closeModal}
        onSubmit={(data) => {
          if (modalMode === 'edit' && editingCenter) {
            updateMutation.mutate({ id: editingCenter.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Center"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={deleteMutation.isPending}
              onClick={handleDelete}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          All associated data including consultation history and staff
          assignments will be permanently removed.
        </p>
      </Modal>
    </div>
  );
}

function CenterRow({
  center,
  isExpanded,
  stats,
  statsLoading,
  canWrite,
  canDelete,
  onToggle,
  onEdit,
  onDelete,
}: {
  center: Center;
  isExpanded: boolean;
  stats?: CenterStats;
  statsLoading: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr
        className="table-row cursor-pointer"
        onClick={onToggle}
      >
        <td className="table-cell">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronUpIcon className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-gray-400" />
            )}
            <span className="font-medium text-gray-900">{center.name}</span>
          </div>
        </td>
        <td className="table-cell">
          <span
            className="badge bg-indigo-50 text-indigo-700"
            title={CENTER_TYPE_LABELS[center.type]}
          >
            {center.type}
          </span>
        </td>
        <td className="table-cell">{center.district}</td>
        <td className="table-cell">{center.state}</td>
        <td className="table-cell">
          <span className={`badge ${STATUS_STYLES[center.status]}`}>
            {center.status}
          </span>
        </td>
        <td className="table-cell">
          <span
            className={`inline-flex items-center gap-1 text-sm ${CONNECTIVITY_STYLES[center.connectivity]}`}
          >
            {center.connectivity === 'none' ? (
              <SignalSlashIcon className="h-4 w-4" />
            ) : center.connectivity === 'broadband' ? (
              <WifiIcon className="h-4 w-4" />
            ) : (
              <SignalIcon className="h-4 w-4" />
            )}
            {center.connectivity}
          </span>
        </td>
        <td className="table-cell text-right">{center.staffCount}</td>
        <td className="table-cell text-right">{center.consultationsToday}</td>
        <td className="table-cell text-right">
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {canWrite && (
              <button
                type="button"
                className="btn-ghost btn-sm p-1.5"
                title="Edit"
                onClick={onEdit}
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="btn-ghost btn-sm p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Delete"
                onClick={onDelete}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="bg-gray-50 px-6 py-4 border-t border-gray-100">
            {statsLoading ? (
              <div className="animate-pulse flex gap-8">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-24 bg-gray-200 rounded" />
                    <div className="h-5 w-16 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Consultations
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {stats.totalConsultations.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg. Daily
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {stats.avgDailyConsultations}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Staff Count
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {stats.staffCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Triage Breakdown
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {stats.triageBreakdown.map((t) => (
                      <span
                        key={t.level}
                        className={`badge ${
                          t.level === 'A'
                            ? 'bg-green-50 text-green-700'
                            : t.level === 'B'
                              ? 'bg-yellow-50 text-yellow-700'
                              : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {t.level}: {t.count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Unable to load center stats.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  pageRange,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageRange: number[];
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>
          Showing {start}-{end} of {totalItems}
        </span>
        <select
          className="form-select py-1 px-2 text-xs w-auto"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {[10, 20, 50].map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      </div>
      <nav className="flex items-center gap-1">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        {pageRange.map((p, i) =>
          p < 0 ? (
            <span key={`ellipsis-${i}`} className="px-2 text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`btn-sm min-w-[2rem] rounded-lg text-center ${
                p === page
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'btn-ghost'
              }`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}

function CenterFormModal({
  mode,
  center,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit' | null;
  center: Center | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (data: CenterFormData) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CenterFormData>({
    resolver: zodResolver(centerFormSchema),
    values:
      mode === 'edit' && center
        ? {
            name: center.name,
            type: center.type,
            district: center.district,
            state: center.state,
            pincode: center.pincode,
            connectivity: center.connectivity,
          }
        : undefined,
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={mode !== null}
      onClose={handleClose}
      title={mode === 'edit' ? 'Edit Center' : 'Add New Center'}
      size="lg"
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="center-form"
            className="btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? 'Saving...'
              : mode === 'edit'
                ? 'Update Center'
                : 'Create Center'}
          </button>
        </>
      }
    >
      <form
        id="center-form"
        className="space-y-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div>
          <label htmlFor="name" className="form-label">
            Center Name
          </label>
          <input
            id="name"
            type="text"
            className="form-input"
            placeholder="e.g. PHC Rajgarh"
            {...register('name')}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="type" className="form-label">
              Type
            </label>
            <select id="type" className="form-select" {...register('type')}>
              <option value="">Select type</option>
              {CENTER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t} - {CENTER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {errors.type && (
              <p className="mt-1 text-xs text-red-600">
                {errors.type.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="connectivity" className="form-label">
              Connectivity
            </label>
            <select
              id="connectivity"
              className="form-select"
              {...register('connectivity')}
            >
              <option value="">Select connectivity</option>
              {CONNECTIVITY_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.connectivity && (
              <p className="mt-1 text-xs text-red-600">
                {errors.connectivity.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="district" className="form-label">
              District
            </label>
            <input
              id="district"
              type="text"
              className="form-input"
              placeholder="e.g. Alwar"
              {...register('district')}
            />
            {errors.district && (
              <p className="mt-1 text-xs text-red-600">
                {errors.district.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="state" className="form-label">
              State
            </label>
            <input
              id="state"
              type="text"
              className="form-input"
              placeholder="e.g. Rajasthan"
              {...register('state')}
            />
            {errors.state && (
              <p className="mt-1 text-xs text-red-600">
                {errors.state.message}
              </p>
            )}
          </div>
        </div>

        <div className="max-w-[50%]">
          <label htmlFor="pincode" className="form-label">
            Pincode
          </label>
          <input
            id="pincode"
            type="text"
            className="form-input"
            placeholder="e.g. 301001"
            maxLength={6}
            {...register('pincode')}
          />
          {errors.pincode && (
            <p className="mt-1 text-xs text-red-600">
              {errors.pincode.message}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
