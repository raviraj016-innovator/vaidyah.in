import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  NoSymbolIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { api, endpoints } from '../config/api';
import { usePagination } from '../hooks/usePagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAuthStore } from '../store/authStore';
import { Modal } from '../components/Modal';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'nurse' | 'doctor' | 'admin' | 'patient';
  center: string;
  centerId: string;
  languages: string[];
  qualifications: string[];
  lastActive: string;
  status: 'active' | 'inactive';
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
}

interface Center {
  id: string;
  name: string;
}

const ROLE_BADGE: Record<string, string> = {
  nurse: 'bg-blue-100 text-blue-800',
  doctor: 'bg-purple-100 text-purple-800',
  admin: 'bg-orange-100 text-orange-800',
  patient: 'bg-green-100 text-green-800',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
};

const AVAILABLE_LANGUAGES = [
  'Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil',
  'Urdu', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi',
];

const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['nurse', 'doctor', 'admin', 'patient'], {
    required_error: 'Role is required',
  }),
  centerId: z.string().min(1, 'Center is required'),
  languages: z.array(z.string()).min(1, 'At least one language is required'),
  qualifications: z.string().optional(),
});

type UserFormData = z.infer<typeof userSchema>;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canWrite = hasPermission('users:write');
  const canDelete = hasPermission('users:delete');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [roleFilter, setRoleFilter] = useState('');
  const [centerFilter, setCenterFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);

  const { page, pageSize, setPage, setPageSize } = usePagination([], {
    initialPageSize: 10,
  });

  const usersQuery = useQuery({
    queryKey: ['users', page, pageSize, debouncedSearch, roleFilter, centerFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize };
      if (debouncedSearch) params.search = debouncedSearch;
      if (roleFilter) params.role = roleFilter;
      if (centerFilter) params.centerId = centerFilter;
      const { data } = await api.get<UsersResponse>(endpoints.users.list, { params });
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

  const totalItems = usersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const users = usersQuery.data?.data ?? [];
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

  const createMutation = useMutation({
    mutationFn: (formData: UserFormData) =>
      api.post(endpoints.users.create, {
        ...formData,
        qualifications: formData.qualifications
          ? formData.qualifications.split(',').map((q) => q.trim()).filter(Boolean)
          : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAddModal(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: formData }: { id: string; data: UserFormData }) =>
      api.put(endpoints.users.update(id), {
        ...formData,
        qualifications: formData.qualifications
          ? formData.qualifications.split(',').map((q) => q.trim()).filter(Boolean)
          : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(endpoints.users.delete(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeactivatingUser(null);
    },
  });

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage nurses, doctors, admins, and patients across centers</p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <PlusIcon className="h-5 w-5" />
            Add User
          </button>
        )}
      </div>

      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              className="form-input pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400" />
            <select
              className="form-select min-w-[140px]"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Roles</option>
              <option value="nurse">Nurse</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
              <option value="patient">Patient</option>
            </select>
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
        </div>
      </div>

      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="table-cell">Name</th>
              <th className="table-cell">Email</th>
              <th className="table-cell">Role</th>
              <th className="table-cell">Center</th>
              <th className="table-cell">Languages</th>
              <th className="table-cell">Last Active</th>
              <th className="table-cell">Status</th>
              <th className="table-cell">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="table-cell text-center py-12 text-gray-400">
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-cell text-center py-12 text-gray-400">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="table-row">
                  <td className="table-cell font-medium text-gray-900">{user.name}</td>
                  <td className="table-cell">{user.email}</td>
                  <td className="table-cell">
                    <span className={`badge ${ROLE_BADGE[user.role]}`}>
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                  </td>
                  <td className="table-cell">{user.center}</td>
                  <td className="table-cell">
                    <span className="truncate max-w-[160px] inline-block">
                      {user.languages.join(', ')}
                    </span>
                  </td>
                  <td className="table-cell">
                    {user.lastActive
                      ? new Date(user.lastActive).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '-'}
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${STATUS_BADGE[user.status]}`}>
                      {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      {canWrite && (
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setEditingUser(user)}
                          title="Edit user"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && user.status === 'active' && (
                        <button
                          className="btn-ghost btn-sm text-red-600 hover:text-red-700"
                          onClick={() => setDeactivatingUser(user)}
                          title="Deactivate user"
                        >
                          <NoSymbolIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
            {totalItems} users
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

      <UserFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add User"
        centers={centers}
        isPending={createMutation.isPending}
        error={createMutation.error}
        onSubmit={(formData) => createMutation.mutate(formData)}
      />

      <UserFormModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Edit User"
        centers={centers}
        defaultValues={editingUser ?? undefined}
        isPending={updateMutation.isPending}
        error={updateMutation.error}
        onSubmit={(formData) => {
          if (editingUser) updateMutation.mutate({ id: editingUser.id, data: formData });
        }}
      />

      <Modal
        isOpen={!!deactivatingUser}
        onClose={() => setDeactivatingUser(null)}
        title="Deactivate User"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDeactivatingUser(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={deactivateMutation.isPending}
              onClick={() => {
                if (deactivatingUser) deactivateMutation.mutate(deactivatingUser.id);
              }}
            >
              {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to deactivate{' '}
          <span className="font-semibold text-gray-900">{deactivatingUser?.name}</span>? They will
          no longer be able to access the system.
        </p>
        {deactivateMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            Failed to deactivate user. Please try again.
          </p>
        )}
      </Modal>
    </div>
  );
}

function UserFormModal({
  isOpen,
  onClose,
  title,
  centers,
  defaultValues,
  isPending,
  error,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  centers: Center[];
  defaultValues?: User;
  isPending: boolean;
  error: Error | null;
  onSubmit: (data: UserFormData) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    values: defaultValues
      ? {
          name: defaultValues.name,
          email: defaultValues.email,
          role: defaultValues.role,
          centerId: defaultValues.centerId,
          languages: defaultValues.languages,
          qualifications: defaultValues.qualifications?.join(', ') ?? '',
        }
      : undefined,
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={handleClose} type="button">
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={isPending}
            onClick={handleSubmit(onSubmit)}
          >
            {isPending ? 'Saving...' : defaultValues ? 'Update User' : 'Create User'}
          </button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Full Name</label>
            <input className="form-input" {...register('name')} />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" {...register('email')} />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Role</label>
            <select className="form-select" {...register('role')}>
              <option value="">Select role</option>
              <option value="nurse">Nurse</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
              <option value="patient">Patient</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>
            )}
          </div>
          <div>
            <label className="form-label">Center</label>
            <select className="form-select" {...register('centerId')}>
              <option value="">Select center</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.centerId && (
              <p className="mt-1 text-xs text-red-600">{errors.centerId.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="form-label">Languages</label>
          <Controller
            control={control}
            name="languages"
            defaultValue={[]}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-lg min-h-[42px]">
                {AVAILABLE_LANGUAGES.map((lang) => {
                  const selected = field.value?.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      className={`badge cursor-pointer transition-colors ${
                        selected
                          ? 'bg-primary-100 text-primary-800 ring-1 ring-primary-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      onClick={() => {
                        const next = selected
                          ? field.value.filter((l: string) => l !== lang)
                          : [...(field.value ?? []), lang];
                        field.onChange(next);
                      }}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            )}
          />
          {errors.languages && (
            <p className="mt-1 text-xs text-red-600">{errors.languages.message}</p>
          )}
        </div>

        <div>
          <label className="form-label">Qualifications</label>
          <input
            className="form-input"
            placeholder="e.g. MBBS, MD (comma separated)"
            {...register('qualifications')}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">
            {(error as Error & { response?: { data?: { message?: string } } })?.response?.data
              ?.message ?? 'An error occurred. Please try again.'}
          </p>
        )}
      </form>
    </Modal>
  );
}
