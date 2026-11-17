import { NextRequest, NextResponse } from 'next/server';
import {
  appendZkPunchesToServerStore,
  getZkServerStore,
  parseZkAttLogPayload,
  recordZkDeviceHeartbeat,
} from '@/lib/zkteco-parser';

export async function GET() {
  const store = getZkServerStore();
  const devices = Object.values(store.devices).sort((a, b) =>
    (b.lastHeartbeatAt || '').localeCompare(a.lastHeartbeatAt || '')
  );

  return NextResponse.json({
    ok: true,
    devices,
    punches: store.punches.slice(0, 500),
    totalBufferedPunches: store.punches.length,
    serverTimeIso: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'push_logs';
    const serialNumber = (body.serialNumber || body.sn || 'ZK-F09').trim();
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip =
      typeof body.deviceIp === 'string' && body.deviceIp.trim()
        ? body.deviceIp.trim()
        : forwardedFor
          ? forwardedFor.split(',')[0].trim()
          : '0.0.0.0';

    if (action === 'heartbeat') {
      recordZkDeviceHeartbeat(serialNumber, ip);
      return NextResponse.json({
        ok: true,
        serialNumber,
        ip,
      });
    }

    if (action === 'push_logs') {
      const rawLogs = typeof body.rawLogs === 'string' ? body.rawLogs : '';
      if (!rawLogs.trim()) {
        recordZkDeviceHeartbeat(serialNumber, ip);
        return NextResponse.json({
          ok: true,
          parsedCount: 0,
          addedCount: 0,
          punches: [],
        });
      }
      const parsed = parseZkAttLogPayload(rawLogs, serialNumber);
      const addedCount = appendZkPunchesToServerStore(parsed, serialNumber, ip);

      return NextResponse.json({
        ok: true,
        parsedCount: parsed.length,
        addedCount,
        punches: parsed,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'ZKTeco সার্ভার প্রসেসিং ত্রুটি',
      },
      { status: 400 }
    );
  }
}
