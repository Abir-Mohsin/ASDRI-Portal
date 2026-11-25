import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  serverTimestamp,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  query,
  where,
  type FieldValue,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  Employee,
  Role,
  DailyAttendanceRecord,
  RawPunchEvent,
  AttendanceCorrectionRequest,
  LeaveBalance,
  LeaveApplication,
  ActionTrackerItem,
  Meeting,
  TaskItem,
  CalendarEvent,
  InAppNotification,
  AuditLog,
  AttendancePolicyConfig,
  InstitutionalLeavePolicy,
  ChatConversation,
  ChatMessage,
} from './types';

export function isValidFirestoreDocId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id.trim());
}

function clampString(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

function clampNum(val: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function optionalFiniteNum(val: unknown, min: number, max: number): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function clampStringArray(val: unknown, maxItems: number, maxItemLen: number): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((v): v is string => typeof v === 'string')
    .slice(0, maxItems)
    .map((v) => v.slice(0, maxItemLen));
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      result[key] = val.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUndefined(item as Record<string, unknown>)
          : item
      );
    } else if (
      val !== null &&
      typeof val === 'object' &&
      Object.getPrototypeOf(val) === Object.prototype
    ) {
      result[key] = stripUndefined(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

function sanitizeId(id: string): string {
  return id.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128) || `DOC_${Date.now()}`;
}

function normalizeIsoDate(val: unknown, fallback = '2026-01-01'): string {
  if (typeof val === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(val.trim())) {
    return val.trim();
  }
  if (typeof val === 'string' && val.trim().length >= 10 && /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(val.trim())) {
    return val.trim().slice(0, 10);
  }
  return fallback;
}

const ADMIN_ROLES_LIST: Role[] = [
  'super_admin',
  'director',
  'deputy_director',
  'assistant_director',
  'admin_incharge',
];

export async function syncAdminUserToFirestore(params: {
  uid: string;
  email: string;
  role: Role;
}): Promise<void> {
  const { uid, email, role } = params;
  if (!uid || !email || !ADMIN_ROLES_LIST.includes(role)) return;
  const path = `admins/${uid}`;
  try {
    const ref = doc(db, 'admins', uid);
    const snap = await getDoc(ref);
    await setDoc(ref, {
      uid: sanitizeId(uid),
      email: clampString(email, 200) || email,
      role,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncLinkedUsersAndAdmins(
  employees: Employee[]
): Promise<Record<string, string>> {
  const empUidMap: Record<string, string> = {};
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const empById = new Map(employees.map((e) => [sanitizeId(e.id), e]));

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const targetUid = String(data.uid || userDoc.id || '').trim();
      const empId = sanitizeId(String(data.employeeId || ''));
      if (!targetUid || !empId) continue;

      empUidMap[empId] = targetUid;
      const emp = empById.get(empId);
      if (!emp) continue;

      // Stamp authUid onto employee doc if missing or changed
      try {
        const empRef = doc(db, 'employees', empId);
        const empSnap = await getDoc(empRef);
        if (empSnap.exists() && empSnap.data().authUid !== targetUid) {
          await syncEmployeeToFirestore(emp, targetUid, false, targetUid);
        }
      } catch {
        // continue linking other users
      }

      // Sync /admins/{uid} based on linked employee role
      try {
        const privSnap = await getDoc(doc(db, 'users', targetUid, 'private', 'info'));
        const userEmail =
          (privSnap.exists() && typeof privSnap.data().email === 'string' && privSnap.data().email) ||
          emp.email;

        if (ADMIN_ROLES_LIST.includes(emp.role)) {
          if (userEmail) {
            await syncAdminUserToFirestore({ uid: targetUid, email: userEmail, role: emp.role });
          }
        } else if (userEmail?.toLowerCase() !== 'abirmohsin02@gmail.com') {
          const admRef = doc(db, 'admins', targetUid);
          const admSnap = await getDoc(admRef);
          if (admSnap.exists()) {
            await deleteDoc(admRef);
          }
        }
      } catch {
        // ignore non-critical admin promotion failure for individual user
      }
    }
  } catch {
    // non-admin or offline
  }
  return empUidMap;
}

// Pure-TypeScript UTF-8 SHA-256 fallback (for non-HTTPS/restricted WebViews where crypto.subtle is unavailable)
function sha256HexFallback(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H)
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const encoded = new TextEncoder().encode(input);
      const digest = await window.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback to pure JS implementation
    }
  }
  return sha256HexFallback(input);
}

export async function computeEmailHash(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return null;
  return sha256Hex(normalized);
}

export async function syncEmailBindingToFirestore(emp: Employee, uid: string): Promise<void> {
  const hashId = await computeEmailHash(emp.email || '');
  if (!hashId) return;
  const path = `emailBindings/${hashId}`;
  try {
    const ref = doc(db, 'emailBindings', hashId);
    const snap = await getDoc(ref);
    const displayName = clampString(emp.nameBn || emp.name, 150) || emp.id;
    const payload = {
      hashId,
      employeeId: sanitizeId(emp.id),
      displayName,
      role: emp.role,
      ownerUid: snap.exists() ? snap.data().ownerUid || uid : uid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function lookupEmployeeBindingByEmail(email: string): Promise<{
  employeeId: string;
  displayName: string;
  role: Role;
} | null> {
  const hashId = await computeEmailHash(email);
  if (!hashId) return null;
  try {
    const snap = await getDoc(doc(db, 'emailBindings', hashId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      employeeId: String(data.employeeId || ''),
      displayName: String(data.displayName || ''),
      role: (data.role as Role) || 'teacher',
    };
  } catch {
    // User might not have matching doc yet or offline
    return null;
  }
}

const PORTAL_CRED_SALT = 'ASDRI_PORTAL_CRED_V1';

export async function computePortalCredentialHash(
  identifier: string,
  password: string
): Promise<string | null> {
  const cleanId = identifier.trim().toLowerCase();
  const cleanPwd = password.trim();
  if (!cleanId || !cleanPwd) return null;
  return sha256Hex(`${PORTAL_CRED_SALT}:${cleanId}:${cleanPwd}`);
}

function buildPortalIdentifiers(identifier: string): string[] {
  const results = new Set<string>();
  const trimmed = identifier.trim().toLowerCase();
  if (trimmed) results.add(trimmed);
  const digits = identifier.replace(/[\s\-+]/g, '');
  if (digits.length >= 6 && /^[0-9]+$/.test(digits)) {
    results.add(digits);
    if (digits.startsWith('880') && digits.length === 13) {
      results.add(`0${digits.slice(3)}`);
    } else if (digits.startsWith('0') && digits.length === 11) {
      results.add(`880${digits.slice(1)}`);
    }
  }
  return Array.from(results);
}

function collectEmployeePortalIdentifiers(emp: Employee): string[] {
  const set = new Set<string>();
  if (emp.id && emp.id.trim()) {
    set.add(emp.id.trim().toLowerCase());
  }
  if (emp.email && emp.email.includes('@')) {
    set.add(emp.email.trim().toLowerCase());
  }
  if (emp.phone && emp.phone.trim()) {
    for (const variant of buildPortalIdentifiers(emp.phone)) {
      set.add(variant);
    }
  }
  return Array.from(set);
}

export async function syncPortalCredentialsForEmployee(
  emp: Employee,
  uid: string,
  allowDefaultFallback = false
): Promise<void> {
  const hasExplicitPwd = Boolean(emp.password && emp.password.trim());
  if (!hasExplicitPwd && !allowDefaultFallback) {
    return;
  }
  const effectivePassword = hasExplicitPwd ? emp.password!.trim() : '123456';
  const identifiers = collectEmployeePortalIdentifiers(emp);
  if (identifiers.length === 0) return;

  const displayName = clampString(emp.nameBn || emp.name, 150) || emp.id;
  const safeOwnerUid = sanitizeId(uid || `portal_${emp.id}`);

  for (const ident of identifiers) {
    const hashId = await computePortalCredentialHash(ident, effectivePassword);
    if (!hashId) continue;
    const path = `portalCredentials/${hashId}`;
    try {
      const ref = doc(db, 'portalCredentials', hashId);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch (serverErr) {
        const serverCode = (serverErr as { code?: string })?.code || '';
        if (serverCode === 'permission-denied') {
          throw serverErr;
        }
        snap = await getDoc(ref);
      }
      const existingData = snap.exists() ? snap.data() : null;
      const payload = {
        hashId,
        employeeId: sanitizeId(emp.id),
        displayName,
        role: emp.role || 'teacher',
        ownerUid: existingData?.ownerUid || safeOwnerUid,
        createdAt: existingData?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}

export async function deletePortalCredentialsForEmployee(
  emp: Employee,
  explicitPassword?: string
): Promise<void> {
  const effectivePassword =
    (explicitPassword !== undefined ? explicitPassword : emp.password || '').trim();
  if (!effectivePassword) return;
  const identifiers = collectEmployeePortalIdentifiers(emp);
  for (const ident of identifiers) {
    const hashId = await computePortalCredentialHash(ident, effectivePassword);
    if (!hashId) continue;
    try {
      await deleteDoc(doc(db, 'portalCredentials', hashId));
    } catch {
      // Best-effort cleanup if rule/offline or doc does not exist
    }
  }
}

export type PortalCredentialLookupResult =
  | {
      status: 'found';
      employeeId: string;
      displayName: string;
      role: Role;
    }
  | {
      status: 'not_found';
    }
  | {
      status: 'error';
      errorCode: string;
      message: string;
    };

export async function lookupPortalCredential(
  identifier: string,
  password: string
): Promise<PortalCredentialLookupResult> {
  const cleanPwd = password.trim();
  if (!identifier.trim() || !cleanPwd) return { status: 'not_found' };
  const candidates = buildPortalIdentifiers(identifier);
  let lastError: { errorCode: string; message: string } | null = null;

  for (const cand of candidates) {
    const hashId = await computePortalCredentialHash(cand, cleanPwd);
    if (!hashId) continue;
    try {
      const ref = doc(db, 'portalCredentials', hashId);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch (serverErr) {
        const serverCode = (serverErr as { code?: string })?.code || '';
        if (serverCode === 'permission-denied') {
          throw serverErr;
        }
        snap = await getDoc(ref);
      }
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.employeeId === 'string' && data.employeeId.trim()) {
          return {
            status: 'found',
            employeeId: data.employeeId.trim(),
            displayName: String(data.displayName || data.employeeId),
            role: (data.role as Role) || 'teacher',
          };
        }
      }
    } catch (err) {
      const code = (err as { code?: string })?.code || 'unknown';
      const msg = err instanceof Error ? err.message : String(err);
      lastError = { errorCode: code, message: msg };
      if (code === 'permission-denied') {
        return { status: 'error', errorCode: code, message: msg };
      }
    }
  }

  if (lastError && lastError.errorCode !== 'not-found') {
    return { status: 'error', errorCode: lastError.errorCode, message: lastError.message };
  }
  return { status: 'not_found' };
}

export async function claimEmployeeAuthUidInFirestore(
  employeeId: string,
  uid: string
): Promise<void> {
  const empId = sanitizeId(employeeId);
  if (!empId || !uid) return;
  try {
    await updateDoc(doc(db, 'employees', empId), {
      authUid: uid,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Already claimed or admin will sync it cleanly
  }
}

export async function getEmployeePrivateContactInfo(
  employeeId: string
): Promise<{ email?: string; phone?: string; bloodGroup?: string } | null> {
  const empId = sanitizeId(employeeId);
  try {
    const snap = await getDoc(doc(db, 'employees', empId, 'private', 'info'));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      email: typeof data.email === 'string' ? data.email : undefined,
      phone: typeof data.phone === 'string' ? data.phone : undefined,
      bloodGroup: typeof data.bloodGroup === 'string' ? data.bloodGroup : undefined,
    };
  } catch {
    return null;
  }
}

export async function syncEmployeeToFirestore(
  emp: Employee,
  uid: string,
  isNew = false,
  explicitAuthUid?: string
): Promise<void> {
  const empId = sanitizeId(emp.id);
  const publicPath = `employees/${empId}`;
  const privatePath = `employees/${empId}/private/info`;

  const publicDoc: Record<string, unknown> = stripUndefined({
    id: empId,
    name: clampString(emp.name, 150) || empId,
    nameBn: clampString(emp.nameBn, 150),
    photoUrl: clampString(emp.photoUrl, 500),
    designation: clampString(emp.designation, 120) || 'Member',
    designationBn: clampString(emp.designationBn, 120),
    department: clampString(emp.department, 120) || 'প্রশাসন',
    employmentType: clampString(emp.employmentType, 80),
    joiningDate: clampString(emp.joiningDate, 32),
    reportingToId: clampString(emp.reportingToId, 64),
    reportingToName: clampString(emp.reportingToName, 150),
    status: emp.status === 'Inactive' || emp.status === 'Resigned' ? emp.status : 'Active',
    attendanceMachineId: clampString(emp.attendanceMachineId, 64),
    shiftSchedule: clampString(emp.shiftSchedule, 64),
    leavePolicy: clampString(emp.leavePolicy, 120),
    role: emp.role || 'teacher',
    authUid: clampString(explicitAuthUid, 128),
    updatedAt: serverTimestamp(),
  });

  try {
    const ref = doc(db, 'employees', empId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      publicDoc.createdAt = serverTimestamp();
      await setDoc(ref, publicDoc);
    } else {
      const existingData = snap.data();
      if (!publicDoc.authUid && typeof existingData.authUid === 'string' && existingData.authUid) {
        publicDoc.authUid = existingData.authUid;
      }
      if (existingData.createdAt) {
        publicDoc.createdAt = existingData.createdAt;
        await setDoc(ref, publicDoc);
      } else {
        const updatePayload = { ...publicDoc };
        delete updatePayload.id;
        await updateDoc(ref, updatePayload);
      }
    }

    const cleanEmail = clampString(emp.email?.trim(), 200);
    const cleanPhone = clampString(emp.phone?.trim(), 40);
    const privateDoc = stripUndefined({
      email:
        cleanEmail && cleanEmail.length >= 3
          ? cleanEmail
          : `${empId.toLowerCase()}@portal.local`,
      phone: cleanPhone && cleanPhone.length >= 1 ? cleanPhone : 'N/A',
      nidOrPassport: clampString(emp.nidOrPassport, 80),
      bloodGroup: clampString(emp.bloodGroup, 16),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'employees', empId, 'private', 'info'), privateDoc);

    if (emp.email && emp.email.includes('@')) {
      await syncEmailBindingToFirestore(emp, uid);
    }

    // Sync salted SHA-256 portal credential hashes so ID/Email/Phone + Password works across fresh devices
    await syncPortalCredentialsForEmployee(emp, uid, isNew);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${publicPath} / ${privatePath} (${uid})`);
  }
}

export async function deleteEmployeeFromFirestore(
  employeeId: string,
  email?: string,
  targetEmp?: Employee
): Promise<void> {
  const empId = sanitizeId(employeeId);
  const path = `employees/${empId}`;
  try {
    try {
      await deleteDoc(doc(db, 'employees', empId, 'private', 'info'));
    } catch {
      // ignore if private doc does not exist
    }
    if (email) {
      const hashId = await computeEmailHash(email);
      if (hashId) {
        try {
          await deleteDoc(doc(db, 'emailBindings', hashId));
        } catch {
          // ignore if emailBinding does not exist
        }
      }
    }
    if (targetEmp) {
      const effectivePassword =
        targetEmp.password && targetEmp.password.trim() ? targetEmp.password.trim() : '123456';
      const idents = collectEmployeePortalIdentifiers(targetEmp);
      for (const ident of idents) {
        const credHash = await computePortalCredentialHash(ident, effectivePassword);
        if (credHash) {
          try {
            await deleteDoc(doc(db, 'portalCredentials', credHash));
          } catch {
            // ignore if portalCredential does not exist
          }
        }
      }
    }
    try {
      await deleteDoc(doc(db, 'leaveBalances', empId));
    } catch {
      // ignore if leaveBalance does not exist
    }
    await deleteDoc(doc(db, 'employees', empId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchEmployeeFromFirestoreById(
  employeeId: string
): Promise<Employee | null> {
  const empId = sanitizeId(employeeId);
  if (!empId) return null;
  try {
    const ref = doc(db, 'employees', empId);
    let snap;
    try {
      snap = await getDocFromServer(ref);
    } catch {
      snap = await getDoc(ref);
    }
    if (!snap.exists()) return null;
    const data = snap.data();
    const priv = await getEmployeePrivateContactInfo(empId);
    const rawEmail = priv?.email || '';
    const rawPhone = priv?.phone || '';
    return {
      id: data.id || empId,
      name: data.name || empId,
      nameBn: data.nameBn || data.name || empId,
      email: rawEmail.endsWith('@portal.local') ? '' : rawEmail,
      phone: rawPhone === 'N/A' || rawPhone === '0000000000' ? '' : rawPhone,
      bloodGroup: priv?.bloodGroup,
      photoUrl: data.photoUrl || '',
      designation: data.designation || 'Member',
      designationBn: data.designationBn || data.designation || 'সদস্য',
      department: data.department || 'প্রশাসন',
      employmentType: data.employmentType || 'পূর্ণকালীন',
      joiningDate: data.joiningDate || '2026-01-01',
      reportingToId: data.reportingToId,
      reportingToName: data.reportingToName,
      status: data.status || 'Active',
      attendanceMachineId: data.attendanceMachineId || '',
      shiftSchedule: data.shiftSchedule || '09:00 - 17:00',
      leavePolicy: data.leavePolicy || 'সাধারণ নীতিমালা',
      role: (data.role as Role) || 'teacher',
    };
  } catch {
    return null;
  }
}

export async function findEmployeeInFirestoreByEmail(
  email: string
): Promise<Employee | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  try {
    const binding = await lookupEmployeeBindingByEmail(target);
    if (binding?.employeeId) {
      const boundEmp = await fetchEmployeeFromFirestoreById(binding.employeeId);
      if (boundEmp) return { ...boundEmp, email: boundEmp.email || email };
    }
    const snap = await getDocs(collection(db, 'employees'));
    for (const d of snap.docs) {
      const empId = d.data().id || d.id;
      const priv = await getEmployeePrivateContactInfo(empId);
      if (priv?.email && priv.email.toLowerCase() === target) {
        const full = await fetchEmployeeFromFirestoreById(empId);
        if (full) return full;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function linkGoogleUserProfile(params: {
  uid: string;
  email: string;
  displayName: string;
  employee: Employee;
  isCloudAdmin?: boolean;
}): Promise<void> {
  const { uid, email, displayName, employee, isCloudAdmin = false } = params;
  const userPath = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const existingSnap = await getDoc(userRef);
    const safeRole: Role = isCloudAdmin
      ? employee.role
      : existingSnap.exists()
      ? ((existingSnap.data().role as Role) || 'staff')
      : ADMIN_ROLES_LIST.includes(employee.role)
      ? 'staff'
      : employee.role;

    const cleanDisplayName =
      clampString(displayName || employee.nameBn || employee.name, 150) || 'Member';

    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        uid,
        employeeId: sanitizeId(employee.id),
        displayName: cleanDisplayName,
        role: safeRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (isCloudAdmin) {
      await updateDoc(userRef, {
        employeeId: sanitizeId(employee.id),
        displayName: cleanDisplayName,
        role: safeRole,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: cleanDisplayName,
        updatedAt: serverTimestamp(),
      });
    }

    await setDoc(doc(db, 'users', uid, 'private', 'info'), {
      email: clampString(email, 200) || employee.email || `${uid}@portal.local`,
      phone: clampString(employee.phone, 40) || '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function renameEmployeeIdInFirestore(params: {
  oldId: string;
  newEmp: Employee;
  leaveBalance?: LeaveBalance;
  uid: string;
  linkedAuthUid?: string;
}): Promise<void> {
  const { oldId, newEmp, leaveBalance, uid, linkedAuthUid } = params;
  await syncEmployeeToFirestore(newEmp, uid, true, linkedAuthUid);
  if (leaveBalance) {
    await syncLeaveBalanceToFirestore({ ...leaveBalance, employeeId: newEmp.id }, linkedAuthUid || uid);
  }
  if (linkedAuthUid) {
    try {
      await updateDoc(doc(db, 'users', linkedAuthUid), {
        employeeId: sanitizeId(newEmp.id),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // ignore if user doc not present yet
    }
  }
  const cleanOld = sanitizeId(oldId);
  const cleanNew = sanitizeId(newEmp.id);
  if (cleanOld && cleanOld !== cleanNew) {
    try {
      await deleteDoc(doc(db, 'employees', cleanOld, 'private', 'info'));
    } catch {
      // ignore
    }
    try {
      await deleteDoc(doc(db, 'leaveBalances', cleanOld));
    } catch {
      // ignore
    }
    try {
      await deleteDoc(doc(db, 'employees', cleanOld));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `employees/${cleanOld}`);
    }
  }
}

export async function syncAttendanceRecordToFirestore(
  rec: DailyAttendanceRecord,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(rec.id);
  const path = `attendanceRecords/${docId}`;
  try {
    const ref = doc(db, 'attendanceRecords', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      employeeId: sanitizeId(rec.employeeId),
      employeeName: clampString(rec.employeeName, 150) || rec.employeeId,
      department: clampString(rec.department, 120),
      date: normalizeIsoDate(rec.date),
      firstInTime: clampString(rec.firstInTime, 16),
      lastOutTime: clampString(rec.lastOutTime, 16),
      isCurrentlyIn: Boolean(rec.isCurrentlyIn),
      isMissingPunch: Boolean(rec.isMissingPunch),
      sessions: Array.isArray(rec.sessions) ? rec.sessions.slice(0, 20) : [],
      totalWorkingDurationMinutes: Math.max(0, Math.min(1440, rec.totalWorkingDurationMinutes || 0)),
      breakDurationMinutes: Math.max(0, Math.min(480, rec.breakDurationMinutes || 0)),
      lateDurationMinutes: Math.max(0, Math.min(1440, rec.lateDurationMinutes || 0)),
      earlyLeaveMinutes: Math.max(0, Math.min(1440, rec.earlyLeaveMinutes || 0)),
      status: rec.status,
      leaveType: clampString(rec.leaveType, 80),
      deviceId: clampString(rec.deviceId, 128),
      verificationStatus: clampString(rec.verificationStatus, 64),
      remarks: clampString(rec.remarks, 500),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncRawPunchToFirestore(
  punch: RawPunchEvent,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(punch.id);
  const path = `rawPunches/${docId}`;
  try {
    const ref = doc(db, 'rawPunches', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      machineId: clampString(punch.machineId, 64),
      employeeId: sanitizeId(punch.employeeId),
      attendanceMachineId: clampString(punch.attendanceMachineId, 64),
      timestamp: clampString(punch.timestamp, 64),
      punchDate: normalizeIsoDate(punch.punchDate),
      punchTime:
        (clampString(punch.punchTime, 16) || '').length >= 4
          ? clampString(punch.punchTime, 16)
          : '09:00',
      punchType: punch.punchType,
      verificationType: clampString(punch.verificationType, 64),
      deviceId: clampString(punch.deviceId, 128),
      syncStatus: punch.syncStatus,
      lat: typeof punch.lat === 'number' ? Math.max(-90, Math.min(90, punch.lat)) : undefined,
      lng: typeof punch.lng === 'number' ? Math.max(-180, Math.min(180, punch.lng)) : undefined,
      distanceMeters:
        typeof punch.distanceMeters === 'number'
          ? Math.max(0, Math.min(1000000, punch.distanceMeters))
          : undefined,
      qrTokenUsed: clampString(punch.qrTokenUsed, 64),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncCorrectionToFirestore(
  corr: AttendanceCorrectionRequest,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(corr.id);
  const path = `corrections/${docId}`;
  try {
    const ref = doc(db, 'corrections', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      employeeId: sanitizeId(corr.employeeId),
      employeeName: clampString(corr.employeeName, 150) || corr.employeeId,
      department: clampString(corr.department, 120),
      date: normalizeIsoDate(corr.date),
      requestedType: corr.requestedType,
      correctedInTime: clampString(corr.correctedInTime, 16),
      correctedOutTime: clampString(corr.correctedOutTime, 16),
      beforeInTime: clampString(corr.beforeInTime, 16),
      beforeOutTime: clampString(corr.beforeOutTime, 16),
      beforeStatus: clampString(corr.beforeStatus, 64),
      reason: clampString(corr.reason, 1000) || 'Correction request',
      status: corr.status,
      approverId: clampString(corr.approverId, 64),
      approverName: clampString(corr.approverName, 150),
      approvalRemarks: clampString(corr.approvalRemarks, 500),
      appliedAt: clampString(corr.appliedAt, 64),
      reviewedAt: clampString(corr.reviewedAt, 64),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncLeaveBalanceToFirestore(
  bal: LeaveBalance,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(bal.employeeId);
  const path = `leaveBalances/${docId}`;
  try {
    const ref = doc(db, 'leaveBalances', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      employeeId: docId,
      year: clampNum(bal.year, 2020, 2100, 2026),
      casualLeaveTotal: clampNum(bal.casualLeaveTotal, 0, 365, 0),
      casualLeaveUsed: clampNum(bal.casualLeaveUsed, 0, 365, 0),
      sickLeaveTotal: clampNum(bal.sickLeaveTotal, 0, 365, 0),
      sickLeaveUsed: clampNum(bal.sickLeaveUsed, 0, 365, 0),
      earnedLeaveTotal: clampNum(bal.earnedLeaveTotal, 0, 365, 0),
      earnedLeaveUsed: clampNum(bal.earnedLeaveUsed, 0, 365, 0),
      dutyLeaveUsed: clampNum(bal.dutyLeaveUsed, 0, 365, 0),
      isCustomQuota: Boolean(bal.isCustomQuota),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncLeaveApplicationToFirestore(
  app: LeaveApplication,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(app.id);
  const path = `leaveApplications/${docId}`;
  try {
    const ref = doc(db, 'leaveApplications', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      employeeId: sanitizeId(app.employeeId),
      employeeName: clampString(app.employeeName, 150) || app.employeeId,
      department: clampString(app.department, 120),
      leaveType: clampString(app.leaveType, 80) || 'Casual Leave (CL)',
      startDate: normalizeIsoDate(app.startDate),
      endDate: normalizeIsoDate(app.endDate || app.startDate, normalizeIsoDate(app.startDate)),
      totalDays: clampNum(app.totalDays, 1, 365, 1),
      reason: clampString(app.reason, 1000) || 'Leave request',
      contactDuringLeave: clampString(app.contactDuringLeave, 80),
      attachmentName: clampString(app.attachmentName, 200),
      status: app.status,
      deptHeadRecommendation: clampString(app.deptHeadRecommendation, 40),
      deptHeadRemarks: clampString(app.deptHeadRemarks, 500),
      deptHeadReviewerId: clampString(app.deptHeadReviewerId, 64),
      directorRemarks: clampString(app.directorRemarks, 500),
      directorReviewerId: clampString(app.directorReviewerId, 64),
      appliedDate: clampString(app.appliedDate, 32),
      reviewedDate: clampString(app.reviewedDate, 32),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncActionTrackerToFirestore(
  item: ActionTrackerItem,
  ownerUid: string,
  assigneeUids: string[] = []
): Promise<void> {
  const docId = sanitizeId(item.id);
  const path = `actionTrackerItems/${docId}`;
  try {
    const ref = doc(db, 'actionTrackerItems', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      serialNo: Math.max(0, Math.min(100000, item.serialNo || 0)),
      title: clampString(item.title, 300) || 'Action Item',
      description: clampString(item.description, 3000),
      assignedPersonText: clampString(item.assignedPersonText, 300),
      assignedEmployeeIds: clampStringArray(item.assignedEmployeeIds, 50, 64),
      assigneeUids: clampStringArray(
        assigneeUids.length > 0 ? assigneeUids : snap.exists() ? snap.data().assigneeUids : [],
        50,
        128
      ),
      priority: clampString(item.priority, 32),
      startDate: clampString(item.startDate, 32),
      deadline: (() => {
        const d = clampString(item.deadline, 32)?.trim() || '';
        return d.length >= 4 ? d : '2026-12-31';
      })(),
      status: clampString(item.status, 32) || 'শুরু হয়নি',
      progressPercentage: Math.max(0, Math.min(100, item.progressPercentage || 0)),
      latestUpdate: clampString(item.latestUpdate, 1000),
      submissionReport: clampString(item.submissionReport, 3000),
      submissionFiles: Array.isArray(item.submissionFiles)
        ? item.submissionFiles.slice(0, 25)
        : [],
      submittedAt: clampString(item.submittedAt, 32),
      submittedBy: clampString(item.submittedBy, 150),
      nextAction: clampString(item.nextAction, 500),
      followupDate: clampString(item.followupDate, 32),
      completionDate: clampString(item.completionDate, 32),
      meetingTitle: clampString(item.meetingTitle, 200),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteActionTrackerFromFirestore(id: string): Promise<void> {
  const docId = sanitizeId(id);
  const path = `actionTrackerItems/${docId}`;
  try {
    await deleteDoc(doc(db, 'actionTrackerItems', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncMeetingToFirestore(
  meeting: Meeting,
  ownerUid: string,
  participantUids: string[] = []
): Promise<void> {
  const docId = sanitizeId(meeting.id);
  const path = `meetings/${docId}`;
  try {
    const ref = doc(db, 'meetings', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      title: clampString(meeting.title, 300) || 'Meeting',
      meetingType: clampString(meeting.meetingType, 120),
      date: normalizeIsoDate(meeting.date),
      startTime: clampString(meeting.startTime, 16),
      endTime: clampString(meeting.endTime, 16),
      venue: clampString(meeting.venue, 200),
      chairperson: clampString(meeting.chairperson, 150),
      secretary: clampString(meeting.secretary, 150),
      department: clampString(meeting.department, 120),
      participants: clampStringArray(meeting.participants, 80, 150),
      participantUids: clampStringArray(
        participantUids.length > 0 ? participantUids : snap.exists() ? snap.data().participantUids : [],
        80,
        128
      ),
      invitedEmployeeIds: clampStringArray(meeting.invitedEmployeeIds, 80, 64),
      actualAttendeeIds: clampStringArray(meeting.actualAttendeeIds, 80, 64),
      agenda: clampStringArray(meeting.agenda, 50, 150),
      meetingNotes: clampString(meeting.meetingNotes, 5000),
      finalDecisions: Array.isArray(meeting.finalDecisions)
        ? meeting.finalDecisions.slice(0, 50)
        : [],
      approvalStatus: meeting.approvalStatus,
      meetingStatus: meeting.meetingStatus || 'Minutes_Added',
      calendarEventId: clampString(meeting.calendarEventId, 128),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMeetingFromFirestore(id: string): Promise<void> {
  const docId = sanitizeId(id);
  const path = `meetings/${docId}`;
  try {
    await deleteDoc(doc(db, 'meetings', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncTaskToFirestore(
  task: TaskItem,
  ownerUid: string,
  assigneeUid?: string
): Promise<void> {
  const docId = sanitizeId(task.id);
  const path = `tasks/${docId}`;
  try {
    const ref = doc(db, 'tasks', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      title: clampString(task.title, 300) || 'Task',
      description: clampString(task.description, 3000),
      category: clampString(task.category, 120),
      department: clampString(task.department, 120),
      assignedPersonId: sanitizeId(task.assignedPersonId),
      assignedPersonName: clampString(task.assignedPersonName, 150),
      assigneeUid: clampString(assigneeUid, 128) || (snap.exists() ? snap.data().assigneeUid : undefined),
      supervisorId: clampString(task.supervisorId, 64),
      supervisorName: clampString(task.supervisorName, 150),
      startDate: clampString(task.startDate, 32),
      deadline: clampString(task.deadline, 32),
      priority: clampString(task.priority, 32),
      status: clampString(task.status, 48) || 'To Do',
      progressPercentage: Math.max(0, Math.min(100, task.progressPercentage || 0)),
      relatedMeetingId: clampString(task.relatedMeetingId, 128),
      relatedDecisionId: clampString(task.relatedDecisionId, 128),
      submissionNotes: clampString(task.submissionNotes, 3000),
      submissionAttachment: clampString(task.submissionAttachment, 1000),
      submissionFiles: Array.isArray(task.submissionFiles)
        ? task.submissionFiles.slice(0, 25)
        : [],
      revisionFeedback: clampString(task.revisionFeedback, 1000),
      completedAt: clampString(task.completedAt, 64),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncCalendarEventToFirestore(
  ev: CalendarEvent,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(ev.id);
  const path = `calendarEvents/${docId}`;
  try {
    const ref = doc(db, 'calendarEvents', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      title: clampString(ev.title, 200) || 'Event',
      description: clampString(ev.description, 1500),
      category: ev.category,
      startDate: normalizeIsoDate(ev.startDate),
      endDate: normalizeIsoDate(ev.endDate || ev.startDate, normalizeIsoDate(ev.startDate)),
      timeLabel: clampString(ev.timeLabel, 80),
      location: clampString(ev.location, 200),
      department: clampString(ev.department, 120),
      linkedMeetingId: clampString(ev.linkedMeetingId, 128),
      createdBy: clampString(ev.createdBy, 150),
      isPublicCalendar: true,
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCalendarEventFromFirestore(id: string): Promise<void> {
  const docId = sanitizeId(id);
  const path = `calendarEvents/${docId}`;
  try {
    await deleteDoc(doc(db, 'calendarEvents', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncNotificationToFirestore(
  notif: InAppNotification,
  senderUid: string,
  recipientUid?: string
): Promise<void> {
  const docId = sanitizeId(notif.id);
  const path = `notifications/${docId}`;
  try {
    const ref = doc(db, 'notifications', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      recipientEmployeeId: sanitizeId(notif.recipientEmployeeId),
      recipientName: clampString(notif.recipientName, 150),
      recipientUid:
        recipientUid || (snap.exists() ? snap.data().recipientUid : undefined) || senderUid,
      senderEmployeeId: clampString(notif.senderEmployeeId, 64),
      senderName: clampString(notif.senderName, 150),
      senderUid: snap.exists() ? snap.data().senderUid || senderUid : senderUid,
      title: clampString(notif.title, 250) || 'Notification',
      message: clampString(notif.message, 1500) || 'Notice',
      linkType: notif.linkType,
      linkId: clampString(notif.linkId, 128),
      actionTrackerId: clampString(notif.actionTrackerId, 128),
      relatedTaskId: clampString(notif.relatedTaskId, 128),
      isRead: Boolean(notif.isRead),
      priority: notif.priority,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncAuditLogToFirestore(
  log: AuditLog,
  actorUid: string
): Promise<void> {
  const docId = sanitizeId(log.id);
  const path = `auditLogs/${docId}`;
  try {
    const ref = doc(db, 'auditLogs', docId);
    const payload = stripUndefined({
      id: docId,
      timestamp: clampString(log.timestamp, 64),
      actorId: sanitizeId(log.actorId),
      actorUid,
      actorName: clampString(log.actorName, 150),
      actorRole: clampString(log.actorRole, 64),
      action: clampString(log.action, 100) || 'ACTION',
      module: log.module,
      details: clampString(log.details, 1500) || 'Log entry',
      beforeValue: clampString(log.beforeValue, 500),
      afterValue: clampString(log.afterValue, 500),
      reason: clampString(log.reason, 500),
      targetEmployeeId: clampString(log.targetEmployeeId, 64),
      targetDate: clampString(log.targetDate, 32),
      createdAt: serverTimestamp() as FieldValue,
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function syncChatConversationToFirestore(
  conv: ChatConversation,
  ownerUid: string,
  participantUids?: string[]
): Promise<void> {
  const docId = sanitizeId(conv.id);
  const path = `chatConversations/${docId}`;
  try {
    const ref = doc(db, 'chatConversations', docId);
    const snap = await getDoc(ref);
    const payload = stripUndefined({
      id: docId,
      type: conv.type === 'group' ? 'group' : 'direct',
      title: clampString(conv.title, 200) || 'Conversation',
      department: clampString(conv.department, 120),
      participantEmployeeIds: clampStringArray(conv.participantEmployeeIds, 100, 150),
      participantUids: clampStringArray(
        participantUids || conv.participantUids || (snap.exists() ? snap.data().participantUids : []),
        100,
        150
      ),
      isDefaultGroup: conv.isDefaultGroup !== undefined ? Boolean(conv.isDefaultGroup) : undefined,
      createdByEmployeeId: snap.exists()
        ? snap.data().createdByEmployeeId || sanitizeId(conv.createdByEmployeeId)
        : sanitizeId(conv.createdByEmployeeId),
      createdByName: snap.exists()
        ? snap.data().createdByName || clampString(conv.createdByName, 150) || 'User'
        : clampString(conv.createdByName, 150) || 'User',
      lastMessageText: clampString(conv.lastMessageText, 2000),
      lastMessageSenderId: clampString(conv.lastMessageSenderId, 64),
      lastMessageSenderName: clampString(conv.lastMessageSenderName, 150),
      lastMessageAt: clampString(conv.lastMessageAt, 64),
      ownerUid: snap.exists() ? snap.data().ownerUid || ownerUid : ownerUid,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteChatConversationFromFirestore(id: string): Promise<void> {
  const docId = sanitizeId(id);
  const path = `chatConversations/${docId}`;
  try {
    await deleteDoc(doc(db, 'chatConversations', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function syncChatMessageToFirestore(
  msg: ChatMessage,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(msg.id);
  const path = `chatMessages/${docId}`;
  try {
    const ref = doc(db, 'chatMessages', docId);
    const snap = await getDoc(ref);
    const existingData = snap.exists() ? snap.data() : null;
    const payload = stripUndefined({
      id: docId,
      conversationId: existingData?.conversationId || sanitizeId(msg.conversationId),
      senderEmployeeId: existingData?.senderEmployeeId || sanitizeId(msg.senderEmployeeId),
      senderName: existingData?.senderName || clampString(msg.senderName, 150) || 'User',
      senderRole: existingData
        ? existingData.senderRole
        : clampString(msg.senderRole, 64),
      text: clampString(msg.text, 4000) || '.',
      replyToMessageId: existingData
        ? existingData.replyToMessageId
        : clampString(msg.replyToMessageId, 128),
      replyToSenderName: existingData
        ? existingData.replyToSenderName
        : clampString(msg.replyToSenderName, 150),
      replyToText: existingData
        ? existingData.replyToText
        : clampString(msg.replyToText, 1000),
      readByEmployeeIds: clampStringArray(msg.readByEmployeeIds, 100, 150),
      ownerUid: existingData?.ownerUid || ownerUid,
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function markChatMessageReadInFirestore(
  messageId: string,
  readerEmployeeId: string,
  fallbackMsg: ChatMessage,
  ownerUid: string
): Promise<void> {
  const docId = sanitizeId(messageId);
  const cleanReaderId = clampString(readerEmployeeId, 64);
  if (!cleanReaderId) return;
  const path = `chatMessages/${docId}`;
  try {
    const ref = doc(db, 'chatMessages', docId);
    await updateDoc(ref, {
      readByEmployeeIds: arrayUnion(cleanReaderId),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'not-found' || String(err).includes('No document to update')) {
      await syncChatMessageToFirestore(fallbackMsg, ownerUid);
      return;
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncAttendancePolicyToFirestore(
  policy: AttendancePolicyConfig,
  uid: string
): Promise<void> {
  const path = 'settings/attendancePolicy';
  try {
    const payload = stripUndefined({
      settingType: 'attendancePolicy',
      officeStartTime: clampString(policy.officeStartTime, 16),
      officeEndTime: clampString(policy.officeEndTime, 16),
      gracePeriodMinutes: clampNum(policy.gracePeriodMinutes, 0, 240, 15),
      lateThresholdMinutes: clampNum(policy.lateThresholdMinutes, 0, 240, 15),
      earlyLeaveThresholdMinutes: clampNum(policy.earlyLeaveThresholdMinutes, 0, 240, 30),
      breakDurationMinutes: clampNum(policy.breakDurationMinutes, 0, 240, 60),
      weeklyHolidays: clampStringArray(policy.weeklyHolidays, 10, 32),
      specialDays: Array.isArray(policy.specialDays) ? policy.specialDays.slice(0, 120) : [],
      campusLat: optionalFiniteNum(policy.campusLat, -90, 90),
      campusLng: optionalFiniteNum(policy.campusLng, -180, 180),
      geofenceRadiusMeters: clampNum(policy.geofenceRadiusMeters, 10, 50000, 300),
      qrRotationSeconds: clampNum(policy.qrRotationSeconds, 5, 3600, 30),
      requireGpsVerification: Boolean(policy.requireGpsVerification),
      autoSyncIntervalMinutes: clampNum(policy.autoSyncIntervalMinutes, 1, 1440, 15),
      institutionLogoUrl: clampString(policy.institutionLogoUrl, 150000),
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'settings', 'attendancePolicy'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function syncLeavePolicyToFirestore(
  leavePolicy: InstitutionalLeavePolicy,
  uid: string
): Promise<void> {
  const path = 'settings/institutionalLeavePolicy';
  try {
    const payload = stripUndefined({
      settingType: 'institutionalLeavePolicy',
      year: clampNum(leavePolicy.year, 2020, 2100, 2026),
      academicYearLabel: clampString(leavePolicy.academicYearLabel, 100),
      casualLeaveEnabled: Boolean(leavePolicy.casualLeaveEnabled),
      casualLeaveDefault: clampNum(leavePolicy.casualLeaveDefault, 0, 365, 14),
      sickLeaveEnabled: Boolean(leavePolicy.sickLeaveEnabled),
      sickLeaveDefault: clampNum(leavePolicy.sickLeaveDefault, 0, 365, 10),
      earnedLeaveEnabled: Boolean(leavePolicy.earnedLeaveEnabled),
      earnedLeaveDefault: clampNum(leavePolicy.earnedLeaveDefault, 0, 365, 18),
      dutyLeaveEnabled: Boolean(leavePolicy.dutyLeaveEnabled),
      hijriOffsetDays: clampNum(leavePolicy.hijriOffsetDays, -1, 1, 0),
      updatedBy: clampString(leavePolicy.updatedBy, 150),
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'settings', 'institutionalLeavePolicy'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export interface FirestoreVerificationStats {
  verifiedAt: string;
  employees: number;
  attendanceRecords: number;
  leaveApplications: number;
  actionTrackerItems: number;
  meetings: number;
  calendarEvents: number;
}

export async function fetchFirestoreVerificationStats(
  isAdmin: boolean,
  uid: string
): Promise<FirestoreVerificationStats> {
  const empQ = isAdmin
    ? collection(db, 'employees')
    : query(collection(db, 'employees'), where('authUid', '==', uid));
  const attQ = isAdmin
    ? collection(db, 'attendanceRecords')
    : query(collection(db, 'attendanceRecords'), where('ownerUid', '==', uid));
  const leaveQ = isAdmin
    ? collection(db, 'leaveApplications')
    : query(collection(db, 'leaveApplications'), where('ownerUid', '==', uid));
  const trackerQ = isAdmin
    ? collection(db, 'actionTrackerItems')
    : query(collection(db, 'actionTrackerItems'), where('assigneeUids', 'array-contains', uid));
  const mtgQ = isAdmin
    ? collection(db, 'meetings')
    : query(collection(db, 'meetings'), where('participantUids', 'array-contains', uid));
  const calQ = isAdmin
    ? collection(db, 'calendarEvents')
    : query(collection(db, 'calendarEvents'), where('isPublicCalendar', '==', true));

  const [empS, attS, leaveS, trackerS, mtgS, calS] = await Promise.all([
    getDocsFromServer(empQ),
    getDocsFromServer(attQ),
    getDocsFromServer(leaveQ),
    getDocsFromServer(trackerQ),
    getDocsFromServer(mtgQ),
    getDocsFromServer(calQ),
  ]);

  return {
    verifiedAt: new Date().toISOString(),
    employees: empS.size,
    attendanceRecords: attS.size,
    leaveApplications: leaveS.size,
    actionTrackerItems: trackerS.size,
    meetings: mtgS.size,
    calendarEvents: calS.size,
  };
}
