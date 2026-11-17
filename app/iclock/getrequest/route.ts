import { NextRequest, NextResponse } from 'next/server';
import { recordZkDeviceHeartbeat } from '@/lib/zkteco-parser';

/**
 * ZKTeco ADMS / Push SDK Heartbeat & Command Polling Endpoint (`/iclock/getrequest`)
 * Physical ZKTeco F09 devices periodically call `GET /iclock/getrequest?SN=XXXX`
 * to check if the server has any pending commands and to report device heartbeat.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = searchParams.get('SN') || searchParams.get('sn') || 'ZK-F09';
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

  recordZkDeviceHeartbeat(sn, ip);

  return new NextResponse('OK\n', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
