/**
 * User, role, and health center type definitions for the Vaidyah healthcare platform.
 */

/** User roles within the Vaidyah system */
export type UserRole =
  | 'asha_worker'
  | 'anm'
  | 'nurse'
  | 'staff_nurse'
  | 'pharmacist'
  | 'lab_technician'
  | 'medical_officer'
  | 'specialist'
  | 'chc_medical_officer'
  | 'district_health_officer'
  | 'admin'
  | 'super_admin';

/** Role permission scope */
export type PermissionScope =
  | 'patient:read'
  | 'patient:write'
  | 'patient:delete'
  | 'consultation:read'
  | 'consultation:write'
  | 'consultation:approve'
  | 'prescription:write'
  | 'prescription:approve'
  | 'triage:perform'
  | 'triage:override'
  | 'lab:order'
  | 'lab:result'
  | 'referral:create'
  | 'referral:accept'
  | 'reports:view'
  | 'reports:export'
  | 'user:manage'
  | 'center:manage'
  | 'audit:view'
  | 'trial:manage'
  | 'trial:enroll'
  | 'ai:override'
  | 'system:configure';

/** Health facility tier as per Indian Public Health Standards */
export type FacilityTier =
  | 'health_sub_center'
  | 'primary_health_center'
  | 'community_health_center'
  | 'sub_district_hospital'
  | 'district_hospital'
  | 'medical_college'
  | 'mobile_health_unit'
  | 'ayushman_arogya_mandir';

/** Facility operational status */
export type FacilityStatus = 'active' | 'inactive' | 'under_renovation' | 'temporarily_closed';

/** Role-permission mapping */
export interface RoleDefinition {
  role: UserRole;
  displayName: string;
  description: string;
  permissions: PermissionScope[];
  canSupervise: UserRole[];
  requiredQualification: string;
  minFacilityTier: FacilityTier;
}

/** Default role-permission configurations */
export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  asha_worker: {
    role: 'asha_worker',
    displayName: 'ASHA Worker',
    description: 'Accredited Social Health Activist - community health worker',
    permissions: ['patient:read', 'patient:write', 'triage:perform', 'consultation:read'],
    canSupervise: [],
    requiredQualification: 'ASHA Training Certificate',
    minFacilityTier: 'health_sub_center',
  },
  anm: {
    role: 'anm',
    displayName: 'ANM',
    description: 'Auxiliary Nurse Midwife',
    permissions: [
      'patient:read', 'patient:write', 'consultation:read', 'consultation:write',
      'triage:perform', 'lab:order',
    ],
    canSupervise: ['asha_worker'],
    requiredQualification: 'ANM Diploma',
    minFacilityTier: 'health_sub_center',
  },
  nurse: {
    role: 'nurse',
    displayName: 'Nurse',
    description: 'General nurse at health facility',
    permissions: [
      'patient:read', 'patient:write', 'consultation:read', 'consultation:write',
      'triage:perform', 'lab:order',
    ],
    canSupervise: ['asha_worker'],
    requiredQualification: 'GNM Diploma',
    minFacilityTier: 'primary_health_center',
  },
  staff_nurse: {
    role: 'staff_nurse',
    displayName: 'Staff Nurse',
    description: 'Registered nurse at health facility',
    permissions: [
      'patient:read', 'patient:write', 'consultation:read', 'consultation:write',
      'triage:perform', 'triage:override', 'lab:order', 'lab:result',
    ],
    canSupervise: ['asha_worker', 'anm'],
    requiredQualification: 'GNM / B.Sc Nursing',
    minFacilityTier: 'primary_health_center',
  },
  pharmacist: {
    role: 'pharmacist',
    displayName: 'Pharmacist',
    description: 'Licensed pharmacist managing drug dispensation',
    permissions: ['patient:read', 'consultation:read', 'prescription:write'],
    canSupervise: [],
    requiredQualification: 'B.Pharm / D.Pharm',
    minFacilityTier: 'primary_health_center',
  },
  lab_technician: {
    role: 'lab_technician',
    displayName: 'Lab Technician',
    description: 'Laboratory technician for diagnostic tests',
    permissions: ['patient:read', 'consultation:read', 'lab:order', 'lab:result'],
    canSupervise: [],
    requiredQualification: 'DMLT / B.Sc MLT',
    minFacilityTier: 'primary_health_center',
  },
  medical_officer: {
    role: 'medical_officer',
    displayName: 'Medical Officer',
    description: 'Primary care physician at health center',
    permissions: [
      'patient:read', 'patient:write', 'consultation:read', 'consultation:write',
      'consultation:approve', 'prescription:write', 'prescription:approve',
      'triage:perform', 'triage:override', 'lab:order', 'lab:result',
      'referral:create', 'reports:view', 'ai:override', 'trial:enroll',
    ],
    canSupervise: ['asha_worker', 'anm', 'staff_nurse', 'pharmacist', 'lab_technician'],
    requiredQualification: 'MBBS',
    minFacilityTier: 'primary_health_center',
  },
  specialist: {
    role: 'specialist',
    displayName: 'Specialist',
    description: 'Medical specialist (surgeon, physician, OB/GYN, pediatrician, etc.)',
    permissions: [
      'patient:read', 'patient:write', 'consultation:read', 'consultation:write',
      'consultation:approve', 'prescription:write', 'prescription:approve',
      'triage:perform', 'triage:override', 'lab:order', 'lab:result',
      'referral:create', 'referral:accept', 'reports:view', 'reports:export',
      'ai:override', 'trial:manage', 'trial:enroll',
    ],
    canSupervise: ['asha_worker', 'anm', 'staff_nurse', 'pharmacist', 'lab_technician', 'medical_officer'],
    requiredQualification: 'MBBS + MD/MS/DNB',
    minFacilityTier: 'community_health_center',
  },
  chc_medical_officer: {
    role: 'chc_medical_officer',
    displayName: 'CHC Medical Officer In-Charge',
    description: 'Medical officer in charge of Community Health Center',
    permissions: [
      'patient:read', 'patient:write', 'consultation:read', 'consultation:write',
      'consultation:approve', 'prescription:write', 'prescription:approve',
      'triage:perform', 'triage:override', 'lab:order', 'lab:result',
      'referral:create', 'referral:accept', 'reports:view', 'reports:export',
      'user:manage', 'center:manage', 'ai:override', 'trial:manage', 'trial:enroll',
    ],
    canSupervise: ['asha_worker', 'anm', 'staff_nurse', 'pharmacist', 'lab_technician', 'medical_officer'],
    requiredQualification: 'MBBS + Administrative Training',
    minFacilityTier: 'community_health_center',
  },
  district_health_officer: {
    role: 'district_health_officer',
    displayName: 'District Health Officer',
    description: 'District-level health administration officer',
    permissions: [
      'patient:read', 'consultation:read', 'reports:view', 'reports:export',
      'user:manage', 'center:manage', 'audit:view', 'trial:manage',
    ],
    canSupervise: [
      'asha_worker', 'anm', 'staff_nurse', 'pharmacist', 'lab_technician',
      'medical_officer', 'specialist', 'chc_medical_officer',
    ],
    requiredQualification: 'MBBS + MPH/MHA',
    minFacilityTier: 'district_hospital',
  },
  admin: {
    role: 'admin',
    displayName: 'System Administrator',
    description: 'Technical administrator for the Vaidyah platform',
    permissions: [
      'user:manage', 'center:manage', 'audit:view', 'system:configure',
      'reports:view', 'reports:export',
    ],
    canSupervise: [],
    requiredQualification: 'IT Administration Certification',
    minFacilityTier: 'district_hospital',
  },
  super_admin: {
    role: 'super_admin',
    displayName: 'Super Administrator',
    description: 'Full system access for platform management',
    permissions: [
      'patient:read', 'patient:write', 'patient:delete',
      'consultation:read', 'consultation:write', 'consultation:approve',
      'prescription:write', 'prescription:approve',
      'triage:perform', 'triage:override',
      'lab:order', 'lab:result',
      'referral:create', 'referral:accept',
      'reports:view', 'reports:export',
      'user:manage', 'center:manage', 'audit:view',
      'trial:manage', 'trial:enroll',
      'ai:override', 'system:configure',
    ],
    canSupervise: [
      'asha_worker', 'anm', 'staff_nurse', 'pharmacist', 'lab_technician',
      'medical_officer', 'specialist', 'chc_medical_officer', 'district_health_officer', 'admin',
    ],
    requiredQualification: 'Platform Owner',
    minFacilityTier: 'health_sub_center',
  },
};

/** User account */
export interface User {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: UserRole;
  permissions: PermissionScope[];

  /** Professional details */
  qualification: string;
  registrationNumber?: string;
  registrationCouncil?: string;
  specialization?: string;
  yearsOfExperience?: number;

  /** Assignment */
  primaryHealthCenterId: string;
  additionalHealthCenterIds: string[];
  district: string;
  state: string;

  /** Preferences */
  preferredLanguage: string;
  timezone: string;

  /** Authentication */
  isActive: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  lastLoginAt?: string;
  mfaEnabled: boolean;

  /** Profile */
  avatarUrl?: string;
  bio?: string;

  /** Metadata */
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Operating hours for a health center */
export interface OperatingHours {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  breakStart?: string;
  breakEnd?: string;
}

/** Service available at a health center */
export interface FacilityService {
  name: string;
  category: 'opd' | 'ipd' | 'emergency' | 'maternal' | 'pediatric' | 'lab' | 'imaging' | 'pharmacy' | 'dental' | 'ayush' | 'teleconsultation';
  isAvailable: boolean;
  availableDays?: string[];
  notes?: string;
}

/** Health center / facility */
export interface HealthCenter {
  id: string;
  name: string;
  nameLocal?: string;
  facilityCode: string;
  ninCode?: string;
  tier: FacilityTier;
  status: FacilityStatus;

  /** Location */
  address: {
    line1: string;
    line2?: string;
    village?: string;
    block: string;
    district: string;
    state: string;
    pincode: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };

  /** Contact */
  phone: string;
  alternatePhone?: string;
  email?: string;

  /** Operations */
  operatingHours: OperatingHours[];
  services: FacilityService[];
  bedCount?: number;
  icuBedCount?: number;

  /** Staff */
  inChargeName: string;
  inChargeUserId: string;
  totalStaff: number;

  /** Infrastructure */
  hasElectricity: boolean;
  hasSolarBackup: boolean;
  hasInternet: boolean;
  internetType?: 'broadband' | '4g' | '5g' | 'satellite' | 'none';
  hasAmbulance: boolean;
  ambulanceCount?: number;
  hasBloodBank: boolean;
  hasPharmacy: boolean;
  hasLaboratory: boolean;

  /** Referral network */
  referralFacilityIds: string[];
  parentFacilityId?: string;
  catchmentArea?: string;
  catchmentPopulation?: number;

  /** Languages spoken by staff */
  languagesSupported: string[];

  /** Metadata */
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}
