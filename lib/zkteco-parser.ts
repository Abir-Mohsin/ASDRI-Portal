// ZKTeco F09 ADMS (iclock/cdata) & USB attlog.dat Parser and Server Buffer

export interface ZkParsedPunch {
  id: string;
  serialNumber: string;
  machinePin: string;
  timestampIso: string;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm:ss
  shortTime: string; // HH:mm
  statusFlag: number; // 0=CheckIn, 1=CheckOut, 2=BreakOut, 3=BreakIn, 4=OTIn, 5=OTOut, 255=Auto
  punchType: 'IN' | 'OUT' | 'AUTO';
  verifyModeCode: number; // 1=Fingerprint, 4=Card, 15=Face, etc.
  verificationType: 'Fingerprint' | 'Face' | 'RFID Card' | 'Manual Punch';
  rawLine: string;
  receivedAt: string;
}

export interface ZkDeviceStatus {
  serialNumber: string;
  modelName: string;
  ipAddress: string;
  lastHandshakeAt?: string;
  lastHeartbeatAt?: string;
  lastPushAt?: string;
  totalPunchesReceived: number;
}

interface ZkServerMemoryStore {
  devices: Record<string, ZkDeviceStatus>;
  punches: ZkParsedPunch[];
  punchIds: Set<string>;
}

const globalForZk = globalThis as unknown as {
  __asdriZkServerStore?: ZkServerMemoryStore;
};

export function getZkServerStore(): ZkServerMemoryStore {
  if (!globalForZk.__asdriZkServerStore) {
    globalForZk.__asdriZkServerStore = {
      devices: {},
      punches: [],
      punchIds: new Set<string>(),
    };
  }
  return globalForZk.__asdriZkServerStore;
}

export function resolveVerificationType(
  verifyCode: number
): 'Fingerprint' | 'Face' | 'RFID Card' | 'Manual Punch' {
  // ZKTeco standard verify modes:
  // 1 = FP, 3 = Password, 4 = RF Card, 15 = Face
  if (verifyCode === 4 || verifyCode === 2) return 'RFID Card';
  if (verifyCode === 15) return 'Face';
  if (verifyCode === 3) return 'Manual Punch';
  return 'Fingerprint';
}

export function resolvePunchType(statusFlag: number): 'IN' | 'OUT' | 'AUTO' {
  if (statusFlag === 0 || statusFlag === 3 || statusFlag === 4) return 'IN';
  if (statusFlag === 1 || statusFlag === 2 || statusFlag === 5) return 'OUT';
  return 'AUTO';
}

/**
 * Parses ZKTeco ADMS `ATTLOG` payload, USB `attlog.dat` file, or CSV machine export.
 * Supports:
 * 1) Standard ZKTeco tab/space-separated format:
 *    `101\t2026-11-14 08:55:12\t0\t1\t0\t0`
 * 2) CSV format:
 *    `101,2026-11-14,08:55:12,0,1` or `101,2026-11-14 08:55:12,IN,Fingerprint`
 */
export function parseZkAttLogPayload(
  rawText: string,
  serialNumber: string = 'ZK-F09'
): ZkParsedPunch[] {
  if (!rawText || typeof rawText !== 'string') return [];

  const cleanSn = serialNumber.trim() || 'ZK-F09';
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: ZkParsedPunch[] = [];
  const nowIso = new Date().toISOString();

  for (const line of lines) {
    // Skip header lines or OPLOG lines
    if (
      line.toUpperCase().startsWith('OPLOG') ||
      line.toUpperCase().startsWith('USER') ||
      line.toUpperCase().startsWith('PIN') ||
      line.toUpperCase().startsWith('EMPLOYEE') ||
      line.toUpperCase().startsWith('AC-NO')
    ) {
      continue;
    }

    // Match pattern: <PIN> <YYYY-MM-DD> <HH:mm[:ss]> [status] [verifyMode]
    // Works for tab-separated (`attlog.dat` / `iclock/cdata`) and comma-separated logs
    const regexMatch = line.match(
      /^([A-Za-z0-9_-]+)[,\t\s]+(\d{4}-\d{2}-\d{2})[,\t\s]+(\d{2}:\d{2}(?::\d{2})?)(?:[,\t\s]+([A-Za-z0-9_-]+))?(?:[,\t\s]+([A-Za-z0-9_-]+))?/
    );

    if (!regexMatch) continue;

    const machinePin = regexMatch[1].trim();
    const dateStr = regexMatch[2].trim();
    const rawTime = regexMatch[3].trim();
    const timeStr = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
    const shortTime = timeStr.slice(0, 5);

    const col4 = (regexMatch[4] || '0').trim().toUpperCase();
    const col5 = (regexMatch[5] || '1').trim().toUpperCase();

    let statusFlag = 0;
    let punchType: 'IN' | 'OUT' | 'AUTO' = 'AUTO';
    if (col4 === 'IN' || col4 === 'C/IN' || col4 === 'CHECKIN') {
      statusFlag = 0;
      punchType = 'IN';
    } else if (col4 === 'OUT' || col4 === 'C/OUT' || col4 === 'CHECKOUT') {
      statusFlag = 1;
      punchType = 'OUT';
    } else {
      const parsedStatus = Number(col4);
      statusFlag = isNaN(parsedStatus) ? 255 : parsedStatus;
      punchType = resolvePunchType(statusFlag);
    }

    let verifyModeCode = 1;
    let verificationType: 'Fingerprint' | 'Face' | 'RFID Card' | 'Manual Punch' = 'Fingerprint';
    if (col5.includes('CARD') || col5 === 'RF') {
      verifyModeCode = 4;
      verificationType = 'RFID Card';
    } else if (col5.includes('FACE')) {
      verifyModeCode = 15;
      verificationType = 'Face';
    } else {
      const parsedVerify = Number(col5);
      verifyModeCode = isNaN(parsedVerify) ? 1 : parsedVerify;
      verificationType = resolveVerificationType(verifyModeCode);
    }

    const id = `ZK-${cleanSn}-${machinePin}-${dateStr}-${timeStr.replace(/:/g, '')}`;
    const timestampIso = `${dateStr}T${timeStr}+06:00`;

    results.push({
      id,
      serialNumber: cleanSn,
      machinePin,
      timestampIso,
      dateStr,
      timeStr,
      shortTime,
      statusFlag,
      punchType,
      verifyModeCode,
      verificationType,
      rawLine: line,
      receivedAt: nowIso,
    });
  }

  return results;
}

export function recordZkDeviceHandshake(serialNumber: string, ipAddress: string = '0.0.0.0') {
  const store = getZkServerStore();
  const sn = serialNumber.trim() || 'ZK-F09';
  const existing = store.devices[sn];
  const nowIso = new Date().toISOString();
  store.devices[sn] = {
    serialNumber: sn,
    modelName: existing?.modelName || 'ZKTeco F09 (ADMS)',
    ipAddress: ipAddress || existing?.ipAddress || '0.0.0.0',
    lastHandshakeAt: nowIso,
    lastHeartbeatAt: nowIso,
    lastPushAt: existing?.lastPushAt,
    totalPunchesReceived: existing?.totalPunchesReceived || 0,
  };
}

export function recordZkDeviceHeartbeat(serialNumber: string, ipAddress: string = '0.0.0.0') {
  const store = getZkServerStore();
  const sn = serialNumber.trim() || 'ZK-F09';
  const existing = store.devices[sn];
  const nowIso = new Date().toISOString();
  store.devices[sn] = {
    serialNumber: sn,
    modelName: existing?.modelName || 'ZKTeco F09 (ADMS)',
    ipAddress: ipAddress || existing?.ipAddress || '0.0.0.0',
    lastHandshakeAt: existing?.lastHandshakeAt || nowIso,
    lastHeartbeatAt: nowIso,
    lastPushAt: existing?.lastPushAt,
    totalPunchesReceived: existing?.totalPunchesReceived || 0,
  };
}

export function appendZkPunchesToServerStore(
  punches: ZkParsedPunch[],
  serialNumber: string = 'ZK-F09',
  ipAddress: string = '0.0.0.0'
): number {
  const store = getZkServerStore();
  const sn = serialNumber.trim() || 'ZK-F09';
  const nowIso = new Date().toISOString();

  let added = 0;
  for (const p of punches) {
    if (!store.punchIds.has(p.id)) {
      store.punchIds.add(p.id);
      store.punches.unshift(p);
      added++;
    }
  }

  // Keep memory buffer bounded to 2000 punches
  if (store.punches.length > 2000) {
    const removed = store.punches.splice(2000);
    for (const r of removed) {
      store.punchIds.delete(r.id);
    }
  }

  const existing = store.devices[sn];
  store.devices[sn] = {
    serialNumber: sn,
    modelName: existing?.modelName || 'ZKTeco F09 (ADMS)',
    ipAddress: ipAddress || existing?.ipAddress || '0.0.0.0',
    lastHandshakeAt: existing?.lastHandshakeAt || nowIso,
    lastHeartbeatAt: nowIso,
    lastPushAt: nowIso,
    totalPunchesReceived: (existing?.totalPunchesReceived || 0) + added,
  };

  return added;
}
