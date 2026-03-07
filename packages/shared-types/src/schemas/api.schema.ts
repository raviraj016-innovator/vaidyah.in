import { z } from 'zod';

export const PaginationParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
});

export const DateRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const DashboardRequestSchema = z.object({
  healthCenterId: z.string().uuid(),
  dateRange: DateRangeSchema,
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const RequestOtpRequestSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,13}$/),
  purpose: z.enum(['login', 'registration', 'password_reset']),
});

export const SyncPullRequestSchema = z.object({
  deviceId: z.string().min(1).max(200),
  lastSyncTimestamp: z.string(),
  entityTypes: z.array(z.enum(['patient', 'consultation', 'vitals', 'prescription', 'user'])),
  healthCenterId: z.string().uuid(),
});
