'use client';

// Pure client-side dynamic rotating QR generator & verified GPS/QR punch engine
// Compatible with Firebase Spark (Static Hosting) with zero server API routes.

const QR_SECRET_SALT = 'asdri-secure-attendance-qr-secret-2026';

export interface DhakaNowInfo {
  isoTimestamp: string;
  epochMs: number;
  dateStr: string;
  timeStr: string;
  shortTime: string;
}

export interface DynamicQrTokenData {
  token: string;
  shortCode: string;
  timeSlot: number;
  remainingSeconds: number;
  rotationSeconds: number;
  serverTime: string;
  dhakaNow: DhakaNowInfo;
}

export interface VerifyPunchClientParams {
  employeeId: string;
  punchType: 'IN' | 'OUT';
  qrInput: string;
  deviceId: string;
  gps?: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    isMocked?: boolean;
    timestamp?: number;
  };
  policyConfig?: {
    campusLat?: number;
    campusLng?: number;
    geofenceRadiusMeters?: number;
    qrRotationSeconds?: number;
    requireGpsVerification?: boolean;
  };
}

export interface VerifyPunchClientResult {
  ok: boolean;
  error?: string;
  code?: string;
  distanceMeters?: number;
  verification?: {
    serverDate: string;
    serverTime: string;
    shortTime: string;
    distanceMeters: number;
  };
  qrTokenId?: string;
  deviceId?: string;
}

const consumedUserTimeSlots = new Set<string>();
const deviceToEmployeeMap = new Map<string, { employeeId: string; date: string }>();
const employeeActiveDeviceMap = new Map<string, { deviceId: string; lastPunchTs: number }>();

const DEVICE_BIND_STORAGE_KEY = 'asdri_qr_device_bind_v1';

function readPersistedDeviceBind(deviceId: string): { employeeId: string; date: string } | null {
  const mem = deviceToEmployeeMap.get(deviceId);
  if (mem) return mem;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEVICE_BIND_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, { employeeId: string; date: string }>;
    return parsed[deviceId] || null;
  } catch {
    return null;
  }
}

function writePersistedDeviceBind(deviceId: string, employeeId: string, date: string) {
  deviceToEmployeeMap.set(deviceId, { employeeId, date });
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(DEVICE_BIND_STORAGE_KEY);
    const parsed: Record<string, { employeeId: string; date: string }> = raw ? JSON.parse(raw) : {};
    parsed[deviceId] = { employeeId, date };
    window.localStorage.setItem(DEVICE_BIND_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage quota errors
  }
}

export function getClientDhakaNow(): DhakaNowInfo {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

  const dateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  const h = getPart('hour') === '24' ? '00' : getPart('hour');
  const timeStr = `${h}:${getPart('minute')}:${getPart('second')}`;
  const shortTime = `${h}:${getPart('minute')}`;

  return {
    isoTimestamp: now.toISOString(),
    epochMs: now.getTime(),
    dateStr,
    timeStr,
    shortTime,
  };
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Deterministic, synchronous, browser-safe slot code generator.
 * Produces identical 6-character uppercase hex tokens across all devices sharing UTC clock time.
 */
function computeSlotShortCode(timeSlot: number): string {
  const input = `${QR_SECRET_SALT}:ASDRI-QR-${timeSlot}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((h1 >>> 0) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  const partA = (h1 >>> 0).toString(16).padStart(8, '0');
  const partB = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${partA}${partB}`.slice(0, 6).toUpperCase();
}

export function generateDynamicQrToken(rotationSeconds: number = 30): DynamicQrTokenData {
  const safeRot = Math.max(10, Number(rotationSeconds) || 30);
  const nowSec = Math.floor(Date.now() / 1000);
  const timeSlot = Math.floor(nowSec / safeRot);
  const expiresAtSec = (timeSlot + 1) * safeRot;
  const remainingSeconds = Math.max(1, expiresAtSec - nowSec);

  const shortCode = computeSlotShortCode(timeSlot);
  const fullPayload = `ASDRI:${timeSlot}:${shortCode}`;
  const dhakaNow = getClientDhakaNow();

  return {
    token: fullPayload,
    shortCode,
    timeSlot,
    remainingSeconds,
    rotationSeconds: safeRot,
    serverTime: dhakaNow.timeStr,
    dhakaNow,
  };
}

export function verifyAttendancePunchClient(
  params: VerifyPunchClientParams
): VerifyPunchClientResult {
  const { employeeId, punchType, qrInput, gps, deviceId, policyConfig } = params;
  const dhaka = getClientDhakaNow();
  const rotationSec = Math.max(10, Number(policyConfig?.qrRotationSeconds) || 30);

  // 1. Device Anti-Fraud Verification
  if (!deviceId) {
    return {
      ok: false,
      code: 'MISSING_DEVICE_ID',
      error: 'ডিভাইস আইডি পাওয়া যায়নি। নিরাপত্তা যাচাই ব্যর্থ হয়েছে।',
    };
  }

  const existingDeviceUser = readPersistedDeviceBind(deviceId);
  if (
    existingDeviceUser &&
    existingDeviceUser.date === dhaka.dateStr &&
    existingDeviceUser.employeeId !== employeeId
  ) {
    return {
      ok: false,
      code: 'DEVICE_ALREADY_USED',
      error: `এই ডিভাইস থেকে আজ ইতিমধ্যে অন্য একটি অ্যাকাউন্ট (${existingDeviceUser.employeeId}) দিয়ে পাঞ্চ করা হয়েছে। একই ডিভাইসে একাধিক অ্যাকাউন্ট গ্রহণযোগ্য নয়।`,
    };
  }

  const empDeviceRecord = employeeActiveDeviceMap.get(employeeId);
  if (
    empDeviceRecord &&
    empDeviceRecord.deviceId !== deviceId &&
    dhaka.epochMs - empDeviceRecord.lastPunchTs < 5 * 60 * 1000
  ) {
    return {
      ok: false,
      code: 'MULTI_DEVICE_DETECTED',
      error: 'একই অ্যাকাউন্ট দিয়ে একই সময়ে একাধিক ডিভাইসে হাজিরা দেওয়া যাবে না।',
    };
  }

  // 2. GPS & Anti-Spoofing Verification (Conditional based on policy)
  const requireGps = policyConfig?.requireGpsVerification === true;
  let distanceMeters = 0;

  if (gps && typeof gps.lat === 'number' && typeof gps.lng === 'number' && (gps.lat !== 0 || gps.lng !== 0)) {
    const campusLat = Number(policyConfig?.campusLat ?? 23.7985);
    const campusLng = Number(policyConfig?.campusLng ?? 90.4255);
    distanceMeters = calculateDistanceMeters(gps.lat, gps.lng, campusLat, campusLng);

    if (requireGps) {
      if (gps.isMocked || gps.accuracy === 0 || (gps.accuracy && gps.accuracy > 2500)) {
        return {
          ok: false,
          code: 'FAKE_GPS_DETECTED',
          error: 'সন্দেহজনক বা Fake GPS Location শনাক্ত হয়েছে। সঠিক GPS সংযোগ নিশ্চিত করুন।',
        };
      }

      const allowedRadius = Number(policyConfig?.geofenceRadiusMeters ?? 300);
      if (distanceMeters > allowedRadius) {
        return {
          ok: false,
          code: 'OUTSIDE_GEOFENCE',
          distanceMeters,
          error: `আপনি প্রতিষ্ঠানের নির্ধারিত এলাকার বাইরে আছেন (দূরত্ব: ${distanceMeters} মিটার, অনুমোদিত সীমানা: ${allowedRadius} মিটার)।`,
        };
      }
    }
  } else if (requireGps) {
    return {
      ok: false,
      code: 'GPS_REQUIRED',
      error: 'GPS Location পাওয়া যায়নি। নীতিমালায় GPS বাধ্যতামূলক থাকায় এটি সম্পন্ন করা যাচ্ছে না।',
    };
  }

  // 3. Dynamic Rotating QR Verification (Camera-scanned full QR payload only)
  if (!qrInput || typeof qrInput !== 'string') {
    return {
      ok: false,
      code: 'MISSING_QR',
      error: 'অফিসের ডায়নামিক QR Code ক্যামেরা দিয়ে স্ক্যান করা আবশ্যক।',
    };
  }

  const cleanInput = qrInput.trim().toUpperCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const currentSlot = Math.floor(nowSec / rotationSec);
  // Allow current slot and immediately preceding slot (grace period of 1 rotation)
  const validSlots = [currentSlot, currentSlot - 1];

  let matchedSlot: number | null = null;
  let matchedCode: string | null = null;

  for (const slot of validSlots) {
    const expectedShort = computeSlotShortCode(slot);
    const expectedFull = `ASDRI:${slot}:${expectedShort}`;
    if (cleanInput === expectedFull) {
      matchedSlot = slot;
      matchedCode = expectedShort;
      break;
    }
  }

  if (matchedSlot === null || !matchedCode) {
    return {
      ok: false,
      code: 'INVALID_OR_EXPIRED_QR',
      error:
        'QR Code টি মেয়াদোত্তীর্ণ বা সঠিক নয়। অফিসের স্ক্রিনে প্রদর্শিত বর্তমান QR Code ক্যামেরা দিয়ে পুনরায় স্ক্যান করুন।',
    };
  }

  // Anti-Replay Check
  const replayKey = `${employeeId}:${matchedSlot}:${punchType}`;
  if (consumedUserTimeSlots.has(replayKey)) {
    return {
      ok: false,
      code: 'QR_REPLAY',
      error: 'এই QR Code টি ইতিমধ্যে একবার ব্যবহার করা হয়েছে। পুনরায় ব্যবহার করা যাবে না।',
    };
  }

  consumedUserTimeSlots.add(replayKey);
  writePersistedDeviceBind(deviceId, employeeId, dhaka.dateStr);
  employeeActiveDeviceMap.set(employeeId, { deviceId, lastPunchTs: dhaka.epochMs });

  return {
    ok: true,
    verification: {
      serverDate: dhaka.dateStr,
      serverTime: dhaka.timeStr,
      shortTime: dhaka.shortTime,
      distanceMeters,
    },
    distanceMeters,
    qrTokenId: `QR-${matchedSlot}-${matchedCode}`,
    deviceId,
  };
}
