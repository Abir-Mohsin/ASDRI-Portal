import { NextRequest, NextResponse } from 'next/server';
import {
  appendZkPunchesToServerStore,
  parseZkAttLogPayload,
  recordZkDeviceHandshake,
} from '@/lib/zkteco-parser';

/**
 * ZKTeco ADMS / Cloud Push Protocol Endpoint: `/iclock/cdata`
 *
 * 1) Handshake: `GET /iclock/cdata?SN=<SerialNumber>&options=all&pushver=...`
 *    Returns plain-text configuration options so the ZKTeco F09 device marks cloud connection active.
 *
 * 2) Attendance & Operation Push: `POST /iclock/cdata?SN=<SerialNumber>&table=ATTLOG&Stamp=...`
 *    Parses tab-separated `ATTLOG` rows and responds with `OK: <count>` in plain text.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sn = (searchParams.get('SN') || searchParams.get('sn') || 'ZK-F09').trim();
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

  recordZkDeviceHandshake(sn, ip);

  const configResponse = [
    `GET OPTION FROM: ${sn}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=9999',
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=TransData AttLog\tOpLog',
    'TimeZone=6',
    'Realtime=1',
    'Encrypt=0',
    '',
  ].join('\n');

  return new NextResponse(configResponse, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sn = (searchParams.get('SN') || searchParams.get('sn') || 'ZK-F09').trim();
    const table = (searchParams.get('table') || 'ATTLOG').trim().toUpperCase();
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '0.0.0.0';

    const rawBody = await req.text();

    if (table === 'ATTLOG' || (! searchParams.get('table') && rawBody.trim().length > 0)) {
      const parsedPunches = parseZkAttLogPayload(rawBody, sn);
      appendZkPunchesToServerStore(parsedPunches, sn, ip);

      return new NextResponse(`OK: ${parsedPunches.length}\n`, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    // For OPERLOG, ATTPHOTO, or USERINFO pushes, acknowledge with OK so device clears queue
    recordZkDeviceHandshake(sn, ip);
    return new NextResponse('OK\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('OK\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
