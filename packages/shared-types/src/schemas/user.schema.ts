import { z } from 'zod';

export const SupportedLanguageSchema = z.enum(['en', 'hi', 'ta', 'te', 'bn', 'mr']);

export const UserRoleSchema = z.enum([
  'asha_worker', 'anm', 'nurse', 'staff_nurse', 'pharmacist',
  'lab_technician', 'medical_officer', 'specialist',
  'chc_medical_officer', 'district_health_officer', 'admin', 'super_admin',
]);

export const CreateUserRequestSchema = z.object({
  email: z.string().email().max(254),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: UserRoleSchema,
  qualification: z.string().min(1).max(200),
  registrationNumber: z.string().max(50).optional(),
  registrationCouncil: z.string().max(100).optional(),
  specialization: z.string().max(100).optional(),
  primaryHealthCenterId: z.string().uuid(),
  preferredLanguage: z.string().min(2).max(10),
});

export const UpdateUserRequestSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/).optional(),
  role: UserRoleSchema.optional(),
  qualification: z.string().max(200).optional(),
  specialization: z.string().max(100).optional(),
  primaryHealthCenterId: z.string().uuid().optional(),
  additionalHealthCenterIds: z.array(z.string().uuid()).optional(),
  preferredLanguage: z.string().min(2).max(10).optional(),
  isActive: z.boolean().optional(),
});

export const LoginRequestSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{10,13}$/),
  otp: z.string().min(4).max(8),
  deviceId: z.string().min(1).max(200),
  deviceInfo: z.object({
    platform: z.enum(['android', 'ios', 'web']),
    osVersion: z.string().max(50),
    appVersion: z.string().max(20),
    model: z.string().max(100).optional(),
  }).optional(),
});
