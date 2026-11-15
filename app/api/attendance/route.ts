import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Secret key for signing dynamic QR codes on the server
const QR_SECRET = process.env.GEMINI_API_KEY || 'asdri-secure-attendance-qr-secret-2026';

// In-memory store for consumed QR nonces and active device bindings (anti-replay & anti-fraud)
const consumedUserTimeSlots = new Set<string>();
const deviceToEmployeeMap = new Map<string, { employeeId: string; date: string }>();
const employeeActiveDeviceMap = new Map<string, { deviceId: string; lastPunchTs: number }>();

function getDhakaNow() {
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

// Haversine formula to calculate exact distance in meters between two GPS coordinates
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function generateDynamicQrToken(rotationSeconds: number = 30) {
  const nowSec = Math.floor(Date.now() / 1000);
  const timeSlot = Math.floor(nowSec / rotationSeconds);
  const expiresAtSec = (timeSlot + 1) * rotationSeconds;
  const remainingSeconds = expiresAtSec - nowSec;

  const hmac = crypto
    .createHmac('sha256', QR_SECRET)
    .update(`ASDRI-QR-${timeSlot}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

  // 6-character dynamic code derived from HMAC
  const shortCode = hmac.slice(0, 6);
  const fullPayload = `ASDRI:${timeSlot}:${shortCode}`;

  return {
    token: fullPayload,
    shortCode,
    timeSlot,
    remainingSeconds,
    rotationSeconds,
    serverTime: getDhakaNow(),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rotation =
    Number(searchParams.get('rotationSeconds') || searchParams.get('rotation') || '30') || 30;
  const qrData = generateDynamicQrToken(rotation);
  return NextResponse.json(qrData);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const employeeId = body.employeeId;
    const punchType = body.punchType; // 'IN' | 'OUT'
    const qrInput = body.qrInput || body.qrToken;
    const gps = body.gps; // { lat, lng, accuracy, isMocked }
    const deviceId = body.deviceId;
    const policy = body.policy || body.policyConfig;

    const dhaka = getDhakaNow();
    const rotationSec = policy?.qrRotationSeconds || 30;

    // 1. Device Anti-Fraud Verification
    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: 'ডিভাইস আইডি পাওয়া যায়নি। নিরাপত্তা যাচাই ব্যর্থ হয়েছে।' },
        { status: 400 }
      );
    }

    // Check if another employee used this same physical device today
    const existingDeviceUser = deviceToEmployeeMap.get(deviceId);
    if (
      existingDeviceUser &&
      existingDeviceUser.date === dhaka.dateStr &&
      existingDeviceUser.employeeId !== employeeId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `এই ডিভাইস থেকে আজ ইতিমধ্যে অন্য একটি অ্যাকাউন্ট (${existingDeviceUser.employeeId}) দিয়ে পাঞ্চ করা হয়েছে। একই ডিভাইসে একাধিক অ্যাকাউন্ট গ্রহণযোগ্য নয়।`,
        },
        { status: 403 }
      );
    }

    // Check if employee is trying to punch from multiple different devices within 5 minutes
    const empDeviceRecord = employeeActiveDeviceMap.get(employeeId);
    if (
      empDeviceRecord &&
      empDeviceRecord.deviceId !== deviceId &&
      dhaka.epochMs - empDeviceRecord.lastPunchTs < 5 * 60 * 1000
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'একই অ্যাকাউন্ট দিয়ে একই সময়ে একাধিক ডিভাইসে হাজিরা দেওয়া যাবে না।',
        },
        { status: 403 }
      );
    }

    // 2. GPS & Anti-Spoofing Verification (Conditional based on policy)
    const requireGps = policy?.requireGpsVerification === true;
    let distanceMeters = 0;

    if (gps && typeof gps.lat === 'number' && typeof gps.lng === 'number') {
      const campusLat = Number(policy?.campusLat ?? 23.7985);
      const campusLng = Number(policy?.campusLng ?? 90.4255);
      distanceMeters = calculateDistanceMeters(gps.lat, gps.lng, campusLat, campusLng);

      if (requireGps) {
        if (gps.isMocked || gps.accuracy === 0 || gps.accuracy > 2500) {
          return NextResponse.json(
            {
              ok: false,
              error: 'সন্দেহজনক বা Fake GPS Location শনাক্ত হয়েছে। সঠিক GPS সংযোগ নিশ্চিত করুন।',
            },
            { status: 403 }
          );
        }

        const allowedRadius = Number(policy?.geofenceRadiusMeters ?? 300);
        if (distanceMeters > allowedRadius) {
          return NextResponse.json(
            {
              ok: false,
              distanceMeters,
              error: `আপনি প্রতিষ্ঠানের নির্ধারিত এলাকার বাইরে আছেন (দূরত্ব: ${distanceMeters} মিটার, অনুমোদিত সীমানা: ${allowedRadius} মিটার)।`,
            },
            { status: 403 }
          );
        }
      }
    } else if (requireGps) {
      return NextResponse.json(
        {
          ok: false,
          error: 'GPS Location পাওয়া যায়নি। নীতিমালায় GPS বাধ্যতামূলক থাকায় এটি সম্পন্ন করা যাচ্ছে না।',
        },
        { status: 400 }
      );
    }

    // 3. Dynamic QR Server-Side Verification
    if (!qrInput || typeof qrInput !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'অফিসের ডায়নামিক QR Code স্ক্যান বা কোড প্রদান করা আবশ্যক।' },
        { status: 400 }
      );
    }

    const cleanInput = qrInput.trim().toUpperCase();
    const nowSec = Math.floor(Date.now() / 1000);
    const currentSlot = Math.floor(nowSec / rotationSec);
    // Allow current slot and immediately preceding slot (grace period of 1 rotation)
    const validSlots = [currentSlot, currentSlot - 1];

    let matchedSlot: number | null = null;
    let matchedCode: string | null = null;

    for (const slot of validSlots) {
      const expectedHmac = crypto
        .createHmac('sha256', QR_SECRET)
        .update(`ASDRI-QR-${slot}`)
        .digest('hex')
        .slice(0, 12)
        .toUpperCase();
      const expectedShort = expectedHmac.slice(0, 6);
      const expectedFull = `ASDRI:${slot}:${expectedShort}`;

      if (cleanInput === expectedFull || cleanInput === expectedShort) {
        matchedSlot = slot;
        matchedCode = expectedShort;
        break;
      }
    }

    if (matchedSlot === null || !matchedCode) {
      return NextResponse.json(
        {
          ok: false,
          error: 'QR Code টি মেয়াদোত্তীর্ণ বা ভুল। অফিসের স্ক্রিনে প্রদর্শিত বর্তমান QR Code পুনরায় স্ক্যান করুন।',
        },
        { status: 403 }
      );
    }

    // Anti-Replay Check: Ensure the same QR code slot cannot be reused by the same user
    const replayKey = `${employeeId}:${matchedSlot}:${punchType}`;
    if (consumedUserTimeSlots.has(replayKey)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'এই QR Code টি ইতিমধ্যে একবার ব্যবহার করা হয়েছে। পুনরায় ব্যবহার করা যাবে না।',
        },
        { status: 403 }
      );
    }

    // Mark QR token consumed and bind device
    consumedUserTimeSlots.add(replayKey);
    deviceToEmployeeMap.set(deviceId, { employeeId, date: dhaka.dateStr });
    employeeActiveDeviceMap.set(employeeId, { deviceId, lastPunchTs: dhaka.epochMs });

    return NextResponse.json({
      ok: true,
      verification: {
        serverDate: dhaka.dateStr,
        serverTime: dhaka.timeStr,
        shortTime: dhaka.shortTime,
        distanceMeters,
      },
      verifiedAt: dhaka,
      distanceMeters,
      qrTokenId: `QR-${matchedSlot}-${matchedCode}`,
      deviceId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: 'সার্ভার যাচাইকরণে ত্রুটি হয়েছে: ' + (err?.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
