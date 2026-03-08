import { Request, Response, NextFunction } from 'express';
import {
  body,
  param,
  query,
  ValidationChain,
  validationResult,
  matchedData,
} from 'express-validator';
import { AppError } from './errorHandler';

// ─── Validation Result Checker ──────────────────────────────────────────────

/**
 * Middleware that inspects the validation result and throws AppError
 * with details if any rules failed. Use after validation chains.
 */
export function handleValidationErrors(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({
      field: 'path' in e ? e.path : 'unknown',
      message: e.msg as string,
      value: 'value' in e ? e.value : undefined,
    }));
    next(AppError.badRequest('Validation failed', details));
    return;
  }
  // Attach sanitized/matched data for downstream handlers
  (req as Request & { validData: Record<string, unknown> }).validData = matchedData(req);
  next();
}

/**
 * Convenience wrapper: combine chains + error check into one array.
 */
export function validate(...chains: ValidationChain[]) {
  return [...chains, handleValidationErrors];
}

// ─── Common Validation Rules ────────────────────────────────────────────────

// UUID parameter
export const uuidParam = (name: string = 'id'): ValidationChain =>
  param(name)
    .isUUID(4)
    .withMessage(`${name} must be a valid UUID v4`);

// UUID or NCT ID parameter (for clinical trials which use NCT identifiers)
export const uuidOrNctParam = (name: string = 'id'): ValidationChain =>
  param(name)
    .matches(/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|NCT\d{8,11})$/i)
    .withMessage(`${name} must be a valid UUID v4 or NCT ID`);

// Pagination query params
export const paginationRules: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('page must be an integer between 1 and 10000')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
];

// ─── Session Validations ────────────────────────────────────────────────────

export const createSessionRules: ValidationChain[] = [
  body('patientId')
    .isUUID(4)
    .withMessage('patientId must be a valid UUID'),
  body('nurseId')
    .isUUID(4)
    .withMessage('nurseId must be a valid UUID'),
  body('facilityId')
    .isUUID(4)
    .withMessage('facilityId must be a valid UUID'),
  body('chiefComplaint')
    .optional()
    .isString()
    .isLength({ min: 1, max: 1000 })
    .withMessage('chiefComplaint must be 1-1000 characters')
    .trim(),
  body('language')
    .optional()
    .isString()
    .isIn(['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'or'])
    .withMessage('Unsupported language code'),
];

export const updateSessionRules: ValidationChain[] = [
  param('id').isUUID(4).withMessage('id must be a valid UUID'),
  body('status')
    .optional()
    .isIn(['active', 'paused', 'completed', 'cancelled'])
    .withMessage('status must be one of: active, paused, completed, cancelled'),
  body('doctorId')
    .optional()
    .isUUID(4)
    .withMessage('doctorId must be a valid UUID'),
  body('chiefComplaint')
    .optional()
    .isString()
    .isLength({ min: 1, max: 1000 })
    .trim(),
  body('triageLevel')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('triageLevel must be 1-5')
    .toInt(),
];

// ─── Patient Validations ────────────────────────────────────────────────────

export const createPatientRules: ValidationChain[] = [
  body('name')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('name is required (1-200 chars)')
    .trim(),
  body('phone')
    .isString()
    .matches(/^\+?[1-9]\d{6,14}$/)
    .withMessage('phone must be a valid phone number (E.164 recommended)'),
  body('abdmId')
    .optional()
    .isString()
    .matches(/^\d{2}-\d{4}-\d{4}-\d{4}$/)
    .withMessage('abdmId must be in format XX-XXXX-XXXX-XXXX'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('dateOfBirth must be a valid ISO 8601 date'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('gender must be male, female, or other'),
  body('address')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .trim(),
  body('district')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .trim(),
  body('state')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .trim(),
  body('pincode')
    .optional()
    .matches(/^\d{6}$/)
    .withMessage('pincode must be 6 digits'),
];

export const patientSearchRules: ValidationChain[] = [
  query('abdmId')
    .optional()
    .isString()
    .matches(/^\d{2}-\d{4}-\d{4}-\d{4}$/)
    .withMessage('abdmId must be in format XX-XXXX-XXXX-XXXX'),
  query('phone')
    .optional()
    .isString()
    .matches(/^\+?[1-9]\d{6,14}$/)
    .withMessage('Invalid phone number'),
  query('name')
    .optional()
    .isString()
    .isLength({ min: 2, max: 200 })
    .trim(),
  ...paginationRules,
];

// ─── Vitals Validations ────────────────────────────────────────────────────

export const vitalsRules: ValidationChain[] = [
  param('id').isUUID(4).withMessage('session id must be a valid UUID'),
  body('heartRate')
    .optional()
    .isInt({ min: 20, max: 300 })
    .withMessage('heartRate must be 20-300 bpm')
    .toInt(),
  body('systolicBp')
    .optional()
    .isInt({ min: 40, max: 300 })
    .withMessage('systolicBp must be 40-300 mmHg')
    .toInt(),
  body('diastolicBp')
    .optional()
    .isInt({ min: 20, max: 200 })
    .withMessage('diastolicBp must be 20-200 mmHg')
    .toInt(),
  body('temperature')
    .optional()
    .isFloat({ min: 30.0, max: 45.0 })
    .withMessage('temperature must be 30-45 °C')
    .toFloat(),
  body('spO2')
    .optional()
    .isInt({ min: 50, max: 100 })
    .withMessage('spO2 must be 50-100%')
    .toInt(),
  body('respiratoryRate')
    .optional()
    .isInt({ min: 4, max: 60 })
    .withMessage('respiratoryRate must be 4-60 breaths/min')
    .toInt(),
  body('bloodGlucose')
    .optional()
    .isFloat({ min: 10, max: 700 })
    .withMessage('bloodGlucose must be 10-700 mg/dL')
    .toFloat(),
  body('weight')
    .optional()
    .isFloat({ min: 0.5, max: 500 })
    .withMessage('weight must be 0.5-500 kg')
    .toFloat(),
  body('height')
    .optional()
    .isFloat({ min: 20, max: 300 })
    .withMessage('height must be 20-300 cm')
    .toFloat(),
];

// ─── Emergency Validations ──────────────────────────────────────────────────

export const emergencyAlertRules: ValidationChain[] = [
  body('patientId')
    .isUUID(4)
    .withMessage('patientId must be a valid UUID'),
  body('sessionId')
    .optional()
    .isUUID(4)
    .withMessage('sessionId must be a valid UUID'),
  body('alertType')
    .isIn(['cardiac', 'respiratory', 'trauma', 'obstetric', 'pediatric', 'other'])
    .withMessage('alertType must be one of: cardiac, respiratory, trauma, obstetric, pediatric, other'),
  body('severity')
    .isIn(['critical', 'high'])
    .withMessage('severity must be critical or high'),
  body('location')
    .isObject()
    .withMessage('location is required'),
  body('location.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('latitude must be between -90 and 90'),
  body('location.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('longitude must be between -180 and 180'),
  body('location.address')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .trim(),
];

// ─── Trial Search Validations ───────────────────────────────────────────────

export const trialSearchRules: ValidationChain[] = [
  query('condition')
    .optional()
    .isString()
    .isLength({ min: 2, max: 200 })
    .trim(),
  query('location')
    .optional()
    .isString()
    .isLength({ min: 2, max: 200 })
    .trim(),
  query('phase')
    .optional()
    .isIn(['1', '2', '3', '4'])
    .withMessage('phase must be 1, 2, 3, or 4'),
  query('status')
    .optional()
    .isIn(['recruiting', 'active', 'completed', 'suspended'])
    .withMessage('status must be one of: recruiting, active, completed, suspended'),
  ...paginationRules,
];
