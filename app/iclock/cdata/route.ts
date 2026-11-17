import { NextRequest, NextResponse } from 'next/server';
import {
  appendZkPunchesToServerStore,
  parseZkAttLogPayload,
  recordZkDeviceHandshake,
} from '@/lib/zkteco-parser';

/**
 * ZKTeco ADMS / Push SDK Protocol Endpoint (`/iclock/cdata`)
 * Works directly with ZKTeco F09 without any paid license.
 *
 * 1) Device Handshake:
 *    `GET /iclock/cdata?SN=XXXX&options=all&pushver=2.2.14`
 *    Returns ZKTeco ADMS configuration so the F09 machine pushes punches in real time.
 *
 * 2) Real-Time Punch Log Push:
 *    `POST /iclock/cdata?SN=XXXX&table=ATTLOG&Stamp=9999`
 *    Body contains tab-separated lines: `<PIN>\t<YYYY-MM-DD HH:mm:ss>\t<Status>\t<VerifyMode>...`
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = searchParams.get('SN') || searchParams.get('sn') || 'ZK-F09';
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

  recordZkDeviceHandshake(sn, ip);

  const responseText = [
    `GET OPTION FROM: ${sn}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=5',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog\tOpLog',
    'TimeZone=6',
    'Realtime=1',
    'Encrypt=None',
  ].join('\r\n');

  return new NextResponse(`${responseText}\r\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = searchParams.get('SN') || searchParams.get('sn') || 'ZK-F09';
  const table = (searchParams.get('table') || 'ATTLOG').toUpperCase();
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

  const rawBody = await req.text();

  if (table === 'ATTLOG') {
    const parsed = parseZkAttLogPayload(rawBody, sn);
    appendZkPunchesToServerStore(parsed, sn, ip);
    return new NextResponse(`OK: ${parsed.length}\n`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  recordZkDeviceHandshake(sn, ip);
  return new NextResponse('OK\n', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
