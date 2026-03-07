import { z } from 'zod';

export const BiologicalSexSchema = z.enum(['male', 'female', 'intersex', 'unknown']);
export const BloodGroupSchema = z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']);
export const GovernmentIdTypeSchema = z.enum(['aadhaar', 'pan', 'voter_id', 'ration_card', 'abha']);
export const InsuranceSchemeSchema = z.enum(['ayushman_bharat', 'esi', 'cghs', 'state_scheme', 'private', 'none']);

export const AddressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  village: z.string().max(100).optional(),
  tehsil: z.string().max(100).optional(),
  district: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().regex(/^[0-9]{6}$/),
  country: z.string().min(1).max(100),
});

export const EmergencyContactSchema = z.object({
  name: z.string().min(1).max(100),
  relationship: z.string().min(1).max(50),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/),
  alternatePhone: z.string().regex(/^\+?[0-9]{10,13}$/).optional(),
});

export const CreatePatientRequestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().optional(),
  approximateAge: z.number().int().min(0).max(150).optional(),
  isAgeDobApproximate: z.boolean(),
  sex: BiologicalSexSchema,
  bloodGroup: BloodGroupSchema.optional(),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/),
  alternatePhone: z.string().regex(/^\+?[0-9]{10,13}$/).optional(),
  address: AddressSchema,
  preferredLanguage: z.string().min(2).max(10),
  governmentId: z.object({
    type: GovernmentIdTypeSchema,
    number: z.string().min(1).max(20),
    verified: z.boolean(),
  }).optional(),
  insurance: z.object({
    scheme: InsuranceSchemeSchema,
    policyNumber: z.string().max(50).optional(),
    validUntil: z.string().optional(),
    coverageDetails: z.string().max(500).optional(),
  }).optional(),
  emergencyContact: EmergencyContactSchema,
  photoBase64: z.string().max(7_000_000).optional(),
});

export const UpdatePatientRequestSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/).optional(),
  alternatePhone: z.string().regex(/^\+?[0-9]{10,13}$/).optional(),
  address: AddressSchema.partial().optional(),
  preferredLanguage: z.string().min(2).max(10).optional(),
  photoBase64: z.string().max(7_000_000).optional(),
});

export const PatientSearchRequestSchema = z.object({
  query: z.string().max(200).optional(),
  phone: z.string().regex(/^\+?[0-9]{10,13}$/).optional(),
  abhaId: z.string().max(50).optional(),
  governmentIdNumber: z.string().max(20).optional(),
  name: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  healthCenterId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});
