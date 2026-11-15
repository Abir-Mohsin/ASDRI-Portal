import { NextRequest, NextResponse } from 'next/server';
import { recordZkDeviceHeartbeat } from '@/lib/zkteco-parser';

/**
 * ZKTeco ADMS Heartbeat & Command Poll Endpoint: `/iclock/getrequest`
 * The ZKTeco F09 device periodically calls `GET /iclock/getrequest?SN=<SerialNumber>`
 * to check for pending server commands and keep its cloud connection status alive.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = (searchParams.get('SN') || searchParams.get('sn') || 'ZK-F09').trim();
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

  recordZkDeviceHeartbeat(sn, ip);

  return new NextResponse('OK\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = (searchParams.get('SN') || searchParams.get('sn') || 'ZK-F09').trim();
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

  recordZkDeviceHeartbeat(sn, ip);

  return new NextResponse('OK\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
