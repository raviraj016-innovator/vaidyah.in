import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { createStrictRateLimiter } from '../middleware/rateLimiter';
import { queryOne, queryRows, query as dbQuery } from '../services/db';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
const JWT_SECRET: string = process.env.JWT_SECRET;
const JWT_EXPIRES = '24h';
const REFRESH_EXPIRES = '7d';

const ALL_ADMIN_PERMISSIONS = [
  'centers:read', 'centers:write', 'centers:delete',
  'users:read', 'users:write', 'users:delete',
  'consultations:read', 'consultations:write',
  'trials:read', 'trials:write', 'trials:sync',
  'analytics:read', 'system:read', 'system:manage',
];

function signTokens(payload: Record<string, unknown>) {
  const access_token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES, issuer: 'vaidyah-auth', audience: 'vaidyah' });
  const refresh_token = jwt.sign({ sub: payload.sub, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES, issuer: 'vaidyah-auth', audience: 'vaidyah' });
  return { access_token, refresh_token };
}

export const authRouter: Router = Router();

// Strict rate limiter for login: 5 requests/minute per IP
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- monorepo @types/express v4/v5 mismatch
const loginRateLimiter = createStrictRateLimiter(5, 'login') as any;

// POST /auth/login
authRouter.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, identifier, role } = req.body;

    if (!role) throw AppError.badRequest('role is required');

    let dbUser: Record<string, any> | null = null;

    if (role === 'admin') {
      if (!email) throw AppError.badRequest('email is required');
      dbUser = await queryOne(
        `SELECT id, name, email, role, center_id, specialization
         FROM users WHERE email = $1 AND role IN ('super_admin', 'state_admin', 'district_admin', 'center_admin', 'doctor') AND active = true`,
        [email],
      );
      // Dev fallback: return first admin user (production requires exact match)
      if (!dbUser && process.env.NODE_ENV !== 'production') {
        dbUser = await queryOne(
          `SELECT id, name, email, role, center_id, specialization
           FROM users WHERE role IN ('super_admin', 'state_admin', 'district_admin', 'center_admin', 'doctor') AND active = true LIMIT 1`,
          [],
        );
      }
    } else if (role === 'nurse') {
      const lookup = identifier || email;
      if (!lookup) throw AppError.badRequest('identifier or email is required');

      // First check if the user exists but is inactive (pending approval)
      const pendingUser = await queryOne(
        `SELECT id, active FROM users
         WHERE (email = $1 OR phone = $1) AND role = 'nurse'`,
        [lookup],
      );
      if (pendingUser && !pendingUser.active) {
        throw new AppError('Your account is pending admin approval. Please wait for activation.', 403, 'ACCOUNT_PENDING');
      }

      const { password } = req.body;
      dbUser = await queryOne(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.center_id, u.qualifications,
                h.name AS center_name
         FROM users u LEFT JOIN health_centers h ON u.center_id = h.id
         WHERE (u.email = $1 OR u.phone = $1) AND u.role = 'nurse' AND u.active = true
           AND (u.password_hash IS NULL OR u.password_hash = crypt($2, u.password_hash))`,
        [lookup, password || ''],
      );
      // Dev fallback: return first nurse (production requires exact match)
      if (!dbUser && process.env.NODE_ENV !== 'production') {
        dbUser = await queryOne(
          `SELECT u.id, u.name, u.email, u.phone, u.role, u.center_id, u.qualifications,
                  h.name AS center_name
           FROM users u LEFT JOIN health_centers h ON u.center_id = h.id
           WHERE u.role = 'nurse' AND u.active = true LIMIT 1`,
          [],
        );
      }
    } else if (role === 'patient') {
      const { phone, password } = req.body;
      if (!phone) throw AppError.badRequest('phone is required for patient login');
      if (!password) throw AppError.badRequest('password is required for patient login');

      let patient = await queryOne(
        `SELECT id, name, phone, abdm_id, age, gender, date_of_birth, address, medical_history
         FROM patients WHERE phone = $1 AND password_hash = crypt($2, password_hash)`,
        [phone, password],
      );
      // Dev fallback: return first patient
      if (!patient && process.env.NODE_ENV !== 'production') {
        patient = await queryOne(
          `SELECT id, name, phone, abdm_id, age, gender, date_of_birth, address, medical_history
           FROM patients LIMIT 1`,
          [],
        );
      }
      if (!patient) throw AppError.unauthorized('Invalid phone number or password');

      const tokenPayload = {
        sub: patient.id,
        email: '',
        name: patient.name,
        'custom:role': 'patient',
        role: 'patient',
        roles: ['patient'],
      };
      const tokens = signTokens(tokenPayload);

      const profileComplete = !!(
        patient.name && patient.name !== 'Patient' &&
        patient.date_of_birth && patient.gender && patient.address
      );

      // Build location from address JSONB column
      const addressObj = typeof patient.address === 'object' && patient.address ? patient.address : {};
      const location = Object.keys(addressObj).length > 0
        ? { city: addressObj.district, state: addressObj.state, pincode: addressObj.pincode }
        : undefined;

      const user: Record<string, unknown> = {
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        abdmId: patient.abdm_id,
        age: patient.age,
        gender: patient.gender,
        location,
        conditions: patient.medical_history?.conditions || [],
        medications: patient.medical_history?.medications || [],
        allergies: patient.medical_history?.allergies || [],
        familyHistory: patient.medical_history?.family_history || [],
        profileComplete,
      };

      res.json({ success: true, user, ...tokens });
      return;
    } else {
      throw AppError.badRequest('Invalid role');
    }

    if (!dbUser) {
      throw AppError.unauthorized('Invalid credentials');
    }

    // Update last_login
    await dbQuery(`UPDATE users SET last_login = NOW() WHERE id = $1`, [dbUser.id]);

    const jwtRole = role === 'admin' ? 'admin' : 'nurse';
    const tokenPayload = {
      sub: dbUser.id,
      email: dbUser.email || '',
      name: dbUser.name,
      'custom:role': jwtRole,
      role: jwtRole,
      roles: [jwtRole],
      'custom:facilityId': dbUser.center_id || '',
    };
    const tokens = signTokens(tokenPayload);

    let user: Record<string, unknown>;
    if (role === 'admin') {
      const profileComplete = !!(dbUser.name && dbUser.email);
      user = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        permissions: ALL_ADMIN_PERMISSIONS,
        lastLogin: new Date().toISOString(),
        profileComplete,
      };
    } else {
      const profileComplete = !!(dbUser.name && dbUser.email && dbUser.center_id);
      user = {
        id: dbUser.id,
        name: dbUser.name,
        registrationNumber: `NRS-${dbUser.id.slice(0, 8).toUpperCase()}`,
        role: 'staff_nurse',
        centerId: dbUser.center_id,
        centerName: dbUser.center_name || 'Health Center',
        phone: dbUser.phone,
        qualifications: dbUser.qualifications || [],
        profileComplete,
      };
    }

    res.json({ success: true, user, ...tokens });
  }),
);

// POST /auth/nurse/signup
const signupRateLimiter = createStrictRateLimiter(5, 'nurse-signup') as any;

authRouter.post(
  '/nurse/signup',
  signupRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, centerId } = req.body;
    if (!name || !email || !password) {
      throw AppError.badRequest('name, email, and password are required');
    }
    if (password.length < 6) {
      throw AppError.badRequest('Password must be at least 6 characters');
    }

    // Check if email already exists
    const existing = await queryOne(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );
    if (existing) {
      throw AppError.conflict('A user with this email already exists');
    }

    const id = uuidv4();
    const newUser = await queryOne(
      `INSERT INTO users (id, name, email, role, center_id, password_hash, active, created_at, updated_at)
       VALUES ($1, $2, $3, 'nurse'::user_role, $4, crypt($5, gen_salt('bf')), false, NOW(), NOW())
       RETURNING id, name, email, role, center_id, active, created_at`,
      [id, name.trim(), email.trim().toLowerCase(), centerId || null, password],
    );

    res.status(201).json({
      success: true,
      data: newUser,
      message: 'Signup successful. Your account is pending admin approval.',
    });
  }),
);

// POST /auth/patient/signup
const patientSignupLimiter = createStrictRateLimiter(5, 'patient-signup') as any;

authRouter.post(
  '/patient/signup',
  patientSignupLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      throw AppError.badRequest('name, phone, and password are required');
    }
    if (password.length < 6) {
      throw AppError.badRequest('Password must be at least 6 characters');
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      throw AppError.badRequest('Please enter a valid 10-digit phone number');
    }

    // Check if phone already exists
    const existing = await queryOne(
      `SELECT id FROM patients WHERE phone = $1`,
      [phone],
    );
    if (existing) {
      throw AppError.conflict('An account with this phone number already exists. Please login instead.');
    }

    const id = uuidv4();
    const patient = await queryOne(
      `INSERT INTO patients (id, name, phone, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), NOW(), NOW())
       RETURNING id, name, phone, abdm_id, age, gender, date_of_birth, address, medical_history`,
      [id, name.trim(), phone, password],
    );
    if (!patient) throw new AppError('Failed to create patient account', 500, 'PATIENT_CREATE_FAILED');

    const tokenPayload = {
      sub: patient.id,
      email: '',
      name: patient.name,
      'custom:role': 'patient',
      role: 'patient',
      roles: ['patient'],
    };
    const tokens = signTokens(tokenPayload);

    const user = {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      abdmId: patient.abdm_id,
      age: patient.age,
      gender: patient.gender,
      conditions: [],
      medications: [],
      allergies: [],
      familyHistory: [],
      profileComplete: false,
    };

    res.status(201).json({ success: true, user, ...tokens });
  }),
);

// POST /auth/logout
authRouter.post(
  '/logout',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  }),
);

// POST /auth/token/refresh
authRouter.post(
  '/token/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refresh_token } = req.body;
    if (!refresh_token) throw AppError.badRequest('refresh_token is required');

    try {
      const decoded = jwt.verify(refresh_token, JWT_SECRET) as Record<string, unknown>;
      if (decoded.type !== 'refresh') throw new Error('Not a refresh token');

      const dbUser = await queryOne(
        `SELECT id, name, email, role, center_id FROM users WHERE id = $1 AND active = true`,
        [decoded.sub],
      );
      if (!dbUser) throw AppError.unauthorized('User not found');

      // Map raw DB roles to simplified JWT roles
      const DB_ADMIN_ROLES = new Set(['super_admin', 'state_admin', 'district_admin', 'center_admin', 'doctor']);
      const jwtRole = DB_ADMIN_ROLES.has(dbUser.role) ? 'admin' : dbUser.role === 'nurse' ? 'nurse' : 'patient';

      const tokenPayload = {
        sub: dbUser.id,
        email: dbUser.email || '',
        name: dbUser.name,
        'custom:role': jwtRole,
        role: jwtRole,
        roles: [jwtRole],
        'custom:facilityId': dbUser.center_id || '',
      };
      const tokens = signTokens(tokenPayload);
      res.json({ success: true, ...tokens });
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }
  }),
);

// GET /auth/me
authRouter.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw AppError.unauthorized();

    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as Record<string, unknown>;
      const role = decoded['custom:role'] as string;
      
      if (role === 'patient') {
        const patient = await queryOne(
          `SELECT id, name, phone, abdm_id, age, gender, date_of_birth, address,
                  address->>'district' AS district, address->>'state' AS state, address->>'pincode' AS pincode,
                  medical_history, created_at, updated_at
           FROM patients WHERE id = $1`,
          [decoded.sub],
        );
        if (!patient) throw AppError.notFound('Patient');
        
        const profileComplete = !!(
          patient.name && patient.name !== 'Patient' &&
          patient.date_of_birth && patient.gender && patient.address
        );
        
        res.json({ 
          success: true, 
          data: { 
            ...patient, 
            profileComplete,
            conditions: patient.medical_history?.conditions || [],
            medications: patient.medical_history?.medications || [],
            allergies: patient.medical_history?.allergies || [],
            familyHistory: patient.medical_history?.family_history || [],
          } 
        });
      } else {
        const dbUser = await queryOne(
          `SELECT u.id, u.name, u.email, u.phone, u.role, u.center_id,
                  u.qualifications, u.specialization, h.name AS center_name
           FROM users u LEFT JOIN health_centers h ON u.center_id = h.id
           WHERE u.id = $1`,
          [decoded.sub],
        );
        if (!dbUser) throw AppError.notFound('User');
        
        const profileComplete = !!(
          dbUser.name && dbUser.email &&
          (role === 'admin' || (role === 'nurse' && dbUser.center_id))
        );
        
        res.json({ success: true, data: { ...dbUser, profileComplete } });
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized('Invalid token');
    }
  }),
);

// PATCH /auth/me/profile
authRouter.patch(
  '/me/profile',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw AppError.unauthorized();

    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as Record<string, unknown>;
      const role = decoded['custom:role'] as string;
      
      if (role === 'patient') {
        const { name, dateOfBirth, gender, abdmId, address, district, state, pincode, conditions, medications, allergies, familyHistory } = req.body;

        // Only build medicalHistory if at least one medical field was provided
        const hasMedicalFields = conditions !== undefined || medications !== undefined || allergies !== undefined || familyHistory !== undefined;
        const medicalHistory = hasMedicalFields ? {
          conditions: conditions || [],
          medications: medications || [],
          allergies: allergies || [],
          family_history: familyHistory || [],
        } : null;

        // Merge district/state/pincode into the address JSONB field
        const addressObj: Record<string, unknown> = typeof address === 'object' && address !== null
          ? address
          : typeof address === 'string' && address.trim()
            ? { line: address.trim() }
            : {};
        if (district) addressObj.district = district;
        if (state) addressObj.state = state;
        if (pincode) addressObj.pincode = pincode;
        const addressJson = Object.keys(addressObj).length > 0 ? JSON.stringify(addressObj) : null;

        const updated = await queryOne(
          `UPDATE patients
           SET name = COALESCE($1, name),
               date_of_birth = COALESCE($2, date_of_birth),
               gender = COALESCE($3, gender),
               abdm_id = COALESCE($4, abdm_id),
               address = COALESCE($5::jsonb, address),
               medical_history = COALESCE($6::jsonb, medical_history),
               updated_at = NOW()
           WHERE id = $7
           RETURNING id, name, phone, abdm_id, date_of_birth, gender, address,
                     address->>'district' AS district, address->>'state' AS state, address->>'pincode' AS pincode,
                     medical_history`,
          [name, dateOfBirth, gender, abdmId, addressJson, medicalHistory ? JSON.stringify(medicalHistory) : null, decoded.sub],
        );
        
        res.json({ success: true, data: updated });
      } else {
        const { name, email, phone, centerId, qualifications, specialization } = req.body;
        
        const updated = await queryOne(
          `UPDATE users 
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               phone = COALESCE($3, phone),
               center_id = COALESCE($4, center_id),
               qualifications = COALESCE($5::jsonb, qualifications),
               specialization = COALESCE($6, specialization),
               updated_at = NOW()
           WHERE id = $7
           RETURNING id, name, email, phone, role, center_id, qualifications, specialization`,
          [name, email, phone, centerId, qualifications ? JSON.stringify(qualifications) : null, specialization, decoded.sub],
        );
        
        res.json({ success: true, data: updated });
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized('Invalid token');
    }
  }),
);

// GET /auth/centers
authRouter.get(
  '/centers',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(
      `SELECT id, name, code, district, state FROM health_centers WHERE active = true ORDER BY name`,
      [],
    );
    res.json({ success: true, data: rows });
  }),
);

// POST /auth/abdm/lookup
authRouter.post(
  '/abdm/lookup',
  asyncHandler(async (req: Request, res: Response) => {
    const { abdmId } = req.body;
    if (!abdmId) throw AppError.badRequest('abdmId is required');

    const patient = await queryOne(
      `SELECT id, name, phone, abdm_id, age, gender, date_of_birth, address, blood_group
       FROM patients WHERE abdm_id = $1`,
      [abdmId],
    );

    if (!patient) {
      throw AppError.notFound('Patient with this ABDM ID');
    }

    res.json({ success: true, data: patient });
  }),
);

// GET /auth/bootstrap/check
authRouter.get(
  '/bootstrap/check',
  asyncHandler(async (_req: Request, res: Response) => {
    // Check if any admin users exist
    const adminCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE role IN ('super_admin', 'state_admin', 'district_admin', 'center_admin') AND active = true`,
      [],
    );
    const count = parseInt(adminCount?.count ?? '0', 10);
    res.json({ success: true, allowed: count === 0 });
  }),
);

// POST /auth/bootstrap/admin
authRouter.post(
  '/bootstrap/admin',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, role } = req.body;
    
    if (!name || !email || !password || !role) {
      throw AppError.badRequest('name, email, password, and role are required');
    }

    // Check if any admin users exist
    const adminCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE role IN ('super_admin', 'state_admin', 'district_admin', 'center_admin') AND active = true`,
      [],
    );
    const count = parseInt(adminCount?.count ?? '0', 10);
    
    if (count > 0) {
      throw AppError.forbidden('Admin accounts already exist. Please contact an existing administrator.');
    }

    // Check if email already exists
    const existing = await queryOne(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );
    
    if (existing) {
      throw AppError.conflict('User with this email already exists');
    }

    // Create admin user (password hashing should be done in production)
    const id = uuidv4();
    const dbRole = role === 'super_admin' ? 'super_admin' : 
                   role === 'state_admin' ? 'state_admin' : 
                   role === 'district_admin' ? 'district_admin' : 'center_admin';
    
    const newUser = await queryOne(
      `INSERT INTO users (id, name, email, role, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4::user_role, true, NOW(), NOW())
       RETURNING id, name, email, role, created_at`,
      [id, name, email, dbRole],
    );

    res.status(201).json({ 
      success: true, 
      data: newUser,
      message: 'Admin account created successfully. You can now log in.' 
    });
  }),
);

