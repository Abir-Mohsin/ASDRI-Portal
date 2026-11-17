'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CircleCheck,
  Copy,
  Cpu,
  Download,
  FileText,
  Link2,
  Play,
  RefreshCw,
  Server,
  TriangleAlert,
  Upload,
  Wifi,
} from 'lucide-react';
import { getDhakaDateTime, useApp } from '@/lib/store';
import { ZkDeviceStatus, ZkParsedPunch } from '@/lib/zkteco-parser';

export function ZkTecoMachinePanel() {
  const { employees, updateEmployee, ingestZkMachinePunches, rawPunches } = useApp();
  const [devices, setDevices] = useState<ZkDeviceStatus[]>([]);
  const [bufferedPunches, setBufferedPunches] = useState<ZkParsedPunch[]>([]);
  const [unmappedPins, setUnmappedPins] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastPolledAt, setLastPolledAt] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [manualRawText, setManualRawText] = useState('');
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null);
  const [selectedEmpForPin, setSelectedEmpForPin] = useState<Record<string, string>>({});
  const [localBridgeOnline, setLocalBridgeOnline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollZkServer = useCallback(
    async (showNotice: boolean = false) => {
      if (showNotice) setIsSyncing(true);
      try {
        // 1) Try to pull from Local PC Bridge (http://127.0.0.1:8080/bridge-status) if running on this computer
        try {
          const bridgeController = new AbortController();
          const timeoutId = setTimeout(() => bridgeController.abort(), 1200);
          const localRes = await fetch('http://127.0.0.1:8080/bridge-status', {
            cache: 'no-store',
            signal: bridgeController.signal,
          });
          clearTimeout(timeoutId);
          if (localRes.ok) {
            setLocalBridgeOnline(true);
            const bridgeData = await localRes.json();
            const bridgeDevices = bridgeData.devices || [];
            const bridgeLogs = bridgeData.pendingLogs || [];
            for (const dev of bridgeDevices) {
              await fetch('/api/zkteco/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'heartbeat',
                  serialNumber: dev.sn || 'ZK-F09',
                  deviceIp: dev.ip || '192.168.1.201',
                }),
              });
            }
            for (const item of bridgeLogs) {
              await fetch('/api/zkteco/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'push_logs',
                  serialNumber: item.sn || 'ZK-F09',
                  deviceIp: item.ip || '192.168.1.201',
                  rawLogs: item.raw || '',
                }),
              });
            }
          } else {
            setLocalBridgeOnline(false);
          }
        } catch {
          setLocalBridgeOnline(false);
        }

        // 2) Poll Cloud Server Store (/api/zkteco/status)
        const res = await fetch('/api/zkteco/status', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setDevices(data.devices || []);
          const incoming: ZkParsedPunch[] = data.punches || [];
          setBufferedPunches(incoming);
          setLastPolledAt(getDhakaDateTime().timeStr);

          if (incoming.length > 0) {
            const summary = ingestZkMachinePunches(incoming);
            setUnmappedPins(summary.unmappedPins);
            if (showNotice) {
              if (summary.processedCount > 0) {
                setFeedback({
                  type: 'success',
                  text: `ZKTeco মেশিন থেকে ${summary.processedCount} টি নতুন পাঞ্চ সফলভাবে হাজিরায় যুক্ত ও Firestore-এ সিঙ্ক হয়েছে।`,
                });
              } else if (summary.unmappedPins.length > 0) {
                setFeedback({
                  type: 'warning',
                  text: `মেশিন থেকে ডেটা এসেছে, কিন্তু মেশিন আইডি (${summary.unmappedPins.join(', ')}) কোনো শিক্ষক/স্টাফের প্রোফাইলের সাথে যুক্ত করা হয়নি।`,
                });
              } else {
                setFeedback({
                  type: 'success',
                  text: 'মেশিনের সকল পাঞ্চ ইতিমধ্যে আপডেট আছে।',
                });
              }
            }
          } else if (showNotice) {
            setFeedback({
              type: 'success',
              text:
                (data.devices || []).length > 0
                  ? 'মেশিন সংযুক্ত আছে। নতুন কোনো বকেয়া পাঞ্চ নেই।'
                  : 'সার্ভারের সাথে সংযোগ যাচাই সম্পন্ন হয়েছে। এখনো কোনো পাঞ্চ মেশিন থেকে সিগন্যাল আসেনি।',
            });
          }
        }
      } catch {
        if (showNotice) {
          setFeedback({
            type: 'error',
            text: 'ZKTeco সার্ভার এন্ডপয়েন্টের সাথে সংযোগ স্থাপন করা যায়নি।',
          });
        }
      } finally {
        if (showNotice) setIsSyncing(false);
      }
    },
    [ingestZkMachinePunches]
  );

  useEffect(() => {
    const initTimer = setTimeout(() => {
      pollZkServer(false);
    }, 0);
    const timer = setInterval(() => {
      pollZkServer(false);
    }, 5000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, [pollZkServer]);

  const copyToClipboard = (value: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1800);
    }
  };

  const handleSaveEmployeePin = async (empId: string, pinValue: string) => {
    setSavingEmpId(empId);
    setFeedback(null);
    const cleanPin = pinValue.trim();
    const res = await updateEmployee(empId, {
      attendanceMachineId: cleanPin,
    });
    setSavingEmpId(null);
    if (res.ok) {
      setFeedback({
        type: 'success',
        text: `হাজিরা মেশিন আইডি (${cleanPin || 'খালি'}) সংরক্ষিত হয়েছে।`,
      });
      if (bufferedPunches.length > 0) {
        const summary = ingestZkMachinePunches(bufferedPunches);
        setUnmappedPins(summary.unmappedPins);
      }
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'মেশিন আইডি আপডেট করা যায়নি।',
      });
    }
  };

  const handleLinkUnmappedPin = async (pin: string) => {
    const targetEmpId = selectedEmpForPin[pin];
    if (!targetEmpId) return;
    await handleSaveEmployeePin(targetEmpId, pin);
  };

  const handleDatOrCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSyncing(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/zkteco/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_logs',
          serialNumber: 'ZK-F09-USB',
          rawLogs: text,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const summary = ingestZkMachinePunches(data.punches || []);
        setUnmappedPins(summary.unmappedPins);
        setFeedback({
          type:
            summary.unmappedPins.length > 0 && summary.processedCount === 0
              ? 'warning'
              : 'success',
          text: `ফাইল (${file.name}) থেকে মোট ${data.parsedCount} টি পাঞ্চ পড়া হয়েছে এবং ${summary.processedCount} টি নতুন হাজিরা রেকর্ড Firestore-এ সংরক্ষিত হয়েছে।${
            summary.unmappedPins.length > 0
              ? ` (আন-ম্যাপড মেশিন আইডি: ${summary.unmappedPins.join(', ')})`
              : ''
          }`,
        });
        await pollZkServer(false);
      } else {
        setFeedback({
          type: 'error',
          text: data.error || 'ফাইল প্রসেস করা যায়নি।',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'ফাইলটি পড়তে ত্রুটি হয়েছে। সঠিক attlog.dat বা .txt/.csv ফাইল নির্বাচন করুন।',
      });
    } finally {
      setIsSyncing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualLogPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRawText.trim()) return;
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/zkteco/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push_logs',
          serialNumber: 'ZK-F09-ADMS',
          rawLogs: manualRawText,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const summary = ingestZkMachinePunches(data.punches || []);
        setUnmappedPins(summary.unmappedPins);
        setManualRawText('');
        setFeedback({
          type: 'success',
          text: `${data.parsedCount} টি লগ যাচাই করে ${summary.processedCount} টি নতুন উপস্থিতি রেকর্ড যুক্ত করা হয়েছে।`,
        });
        await pollZkServer(false);
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'লগ ডেটা প্রসেস করা যায়নি।',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSimulateAdmsTestPush = async () => {
    const targetEmp =
      employees.find((e) => (e.attendanceMachineId || '').trim().length > 0) || employees[0];
    if (!targetEmp) {
      setFeedback({
        type: 'warning',
        text: 'টেস্ট পাঞ্চ পাঠানোর আগে অন্তত একজন শিক্ষক বা স্টাফ যুক্ত করুন।',
      });
      return;
    }

    const pinToUse = (targetEmp.attendanceMachineId || targetEmp.id).trim();
    const dhaka = getDhakaDateTime();
    const sampleLine = `${pinToUse}\t${dhaka.dateStr} ${dhaka.timeStr}\t0\t1\t0\t0`;
    setIsSyncing(true);
    setFeedback(null);
    try {
      // Hit the actual ZKTeco ADMS /iclock/cdata endpoint exactly like the physical F09 machine does
      const admsRes = await fetch('/iclock/cdata?SN=F09-OFFICE-01&table=ATTLOG&Stamp=9999', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: sampleLine,
      });
      if (admsRes.ok) {
        await pollZkServer(false);
        setFeedback({
          type: 'success',
          text: `ZKTeco ADMS টেস্ট সফল! "${targetEmp.nameBn || targetEmp.name}" (মেশিন আইডি: ${pinToUse})-এর পাঞ্চ (/iclock/cdata) রিসিভ হয়ে হাজিরায় যুক্ত হয়েছে।`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: 'ADMS এন্ডপয়েন্ট টেস্ট ব্যর্থ হয়েছে।',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'ADMS টেস্ট সংযোগে ত্রুটি হয়েছে।',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadLocalBridgeScript = () => {
    const originUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://ais-pre-yjs3245qv2nmmy7hnazsmq-86489289289.asia-southeast1.run.app';
    const scriptContent = `/**
 * ASDRI ZKTeco F09 Local HTTP-to-Cloud ADMS Relay Bridge (v2)
 * -----------------------------------------------------------
 * অফিসের যেকোনো কম্পিউটারে Node.js ইনস্টল রেখে এই ফাইলটি চালান:
 *
 *   node zk-f09-bridge.js
 */

const http = require('http');
const https = require('https');
const os = require('os');
const { URL } = require('url');

const CLOUD_PORTAL_ORIGIN = process.env.CLOUD_PORTAL_ORIGIN || '${originUrl}';
const LOCAL_PORT = Number(process.env.PORT || 8080);

// ইন-মেমরি বাফার যাতে ব্রাউজার (http://127.0.0.1:8080/bridge-status) সরাসরি ডেটা টেনে নিতে পারে
const deviceMap = new Map();
const pendingLogs = [];

function getLocalLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '192.168.1.100';
}

function forwardToCloud(pathWithQuery, method, bodyText, callback) {
  try {
    const targetUrl = new URL(pathWithQuery, CLOUD_PORTAL_ORIGIN);
    const client = targetUrl.protocol === 'https:' ? https : http;
    const req = client.request(
      targetUrl,
      {
        method,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': Buffer.byteLength(bodyText || ''),
        },
      },
      (res) => {
        let respData = '';
        res.on('data', (chunk) => (respData += chunk));
        res.on('end', () => callback(null, res.statusCode || 200, respData));
      }
    );
    req.on('error', (err) => callback(err));
    if (bodyText) req.write(bodyText);
    req.end();
  } catch (err) {
    callback(err);
  }
}

const server = http.createServer((req, res) => {
  // CORS headers so the open ASDRI Portal browser tab can read from 127.0.0.1:8080
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = req.url || '/';

  if (reqUrl.startsWith('/bridge-status')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        devices: Array.from(deviceMap.values()),
        pendingLogs: pendingLogs.slice(-200),
      })
    );
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString();
  });
  req.on('end', () => {
    if (reqUrl.startsWith('/iclock/')) {
      const parsedUrl = new URL(reqUrl, 'http://localhost');
      const sn = parsedUrl.searchParams.get('SN') || parsedUrl.searchParams.get('sn') || 'ZK-F09';
      const remoteIp = (req.socket.remoteAddress || '').replace('::ffff:', '') || '192.168.1.201';

      deviceMap.set(sn, {
        sn,
        ip: remoteIp,
        lastSeen: new Date().toISOString(),
      });

      if (req.method === 'POST' && body && body.trim()) {
        pendingLogs.push({
          sn,
          ip: remoteIp,
          raw: body.trim(),
          at: new Date().toISOString(),
        });
        if (pendingLogs.length > 500) pendingLogs.shift();
      }

      console.log('[ZKTeco F09 Signal]', req.method, reqUrl, 'from', remoteIp, body ? body.trim() : '');
      forwardToCloud(reqUrl, req.method || 'GET', body, (err, status, cloudResp) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        if (err) {
          res.end('OK\\n');
        } else {
          res.end(cloudResp && cloudResp.includes('OK') ? cloudResp : 'OK\\n');
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ASDRI ZKTeco F09 Local ADMS Bridge is running on port ' + LOCAL_PORT);
    }
  });
});

server.listen(LOCAL_PORT, '0.0.0.0', () => {
  const lanIp = getLocalLanIp();
  console.log('============================================================');
  console.log('  ASDRI ZKTeco F09 Local ADMS Bridge (v2) চালু হয়েছে!');
  console.log('------------------------------------------------------------');
  console.log('  এখন ZKTeco F09 মেশিনের Menu -> Comm. -> Cloud Server-এ বসান:');
  console.log('  1) Enable Domain Name : OFF');
  console.log('  2) Server Address     : ' + lanIp);
  console.log('  3) Server Port        : ' + LOCAL_PORT);
  console.log('------------------------------------------------------------');
  console.log('  এই কম্পিউটারে ব্রাউজারে ASDRI পোর্টাল খোলা রাখলে স্বয়ংক্রিয় সিঙ্ক হবে।');
  console.log('============================================================');
});
`;

    const blob = new Blob([scriptContent], {
      type: 'application/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zk-f09-bridge.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hostDomain =
    typeof window !== 'undefined'
      ? window.location.host
      : 'ais-pre-yjs3245qv2nmmy7hnazsmq-86489289289.asia-southeast1.run.app';
  const zkMachinePunchesCount = rawPunches.filter(
    (p) => p.machineId && p.machineId !== 'MOBILE-GPS-QR'
  ).length;

  return (
    <div className="space-y-6">
      <div className="bg-emerald-950 text-white rounded-xl p-4 sm:p-6 border border-emerald-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-900/90 border border-emerald-700 text-amber-300 text-[11px] font-bold">
            <Cpu className="w-3.5 h-3.5" />
            <span>ZKTeco F09 Biometric ADMS Protocol (লাইসেন্সবিহীন সরাসরি সংযোগ)</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold">
            ZKTeco F09 বায়োমেট্রিক হাজিরা মেশিন কন্ট্রোল ও অটো-সিঙ্ক প্যানেল
          </h3>
          <p className="text-xs text-emerald-100/80 max-w-2xl leading-relaxed">
            কোনো পেইড সফটওয়্যার বা লাইসেন্স ছাড়াই আপনার <strong>ZKTeco F09</strong> মেশিনের বিল্ট-ইন{' '}
            <strong>ADMS / Cloud Server Setting</strong> ব্যবহার করে রিয়েল-টাইম ফিঙ্গারপ্রিন্ট ও কার্ড পাঞ্চ সরাসরি এই পোর্টালে এবং Firestore ডাটাবেসে সিঙ্ক করুন।
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => pollZkServer(true)}
            className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>এখনই মেশিন সিঙ্ক করুন</span>
          </button>
          <button
            type="button"
            disabled={isSyncing}
            onClick={handleSimulateAdmsTestPush}
            className="px-3.5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white border border-emerald-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Play className="w-3.5 h-3.5 text-amber-300" />
            <span>টেস্ট পাঞ্চ পাঠান (ADMS Test)</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedback.type === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {feedback.type === 'success' ? (
              <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {unmappedPins.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-950">
            <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>আন-ম্যাপড মেশিন আইডি শনাক্ত হয়েছে ({unmappedPins.length} টি):</strong> মেশিন থেকে নিচের User ID / PIN দিয়ে পাঞ্চ এসেছে, কিন্তু এখনো কোনো শিক্ষক বা স্টাফের প্রোফাইলে এই মেশিন আইডি বসানো হয়নি। নিচে প্রোফাইল সিলেক্ট করে লিংক করে দিন:
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unmappedPins.map((pin) => (
              <div
                key={pin}
                className="bg-white p-3 rounded-lg border border-amber-200 flex flex-col gap-2 text-xs"
              >
                <div className="font-mono font-bold text-slate-900">
                  মেশিন ইউজার আইডি (PIN):{' '}
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900">{pin}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedEmpForPin[pin] || ''}
                    onChange={(e) =>
                      setSelectedEmpForPin((prev) => ({
                        ...prev,
                        [pin]: e.target.value,
                      }))
                    }
                    className="flex-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs bg-slate-50"
                  >
                    <option value="">শিক্ষক / স্টাফ নির্বাচন করুন...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nameBn || emp.name} ({emp.id})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedEmpForPin[pin]}
                    onClick={() => handleLinkUnmappedPin(pin)}
                    className="px-3 py-1.5 rounded bg-[#0f4c3a] text-white font-semibold cursor-pointer disabled:opacity-50"
                  >
                    লিংক করুন
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>সংযুক্ত ZKTeco মেশিন</span>
            <Wifi
              className={`w-4 h-4 ${
                devices.length > 0 || localBridgeOnline ? 'text-emerald-700' : 'text-amber-600'
              }`}
            />
          </div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            {devices.length > 0
              ? `${devices.length} টি মেশিন সক্রিয়`
              : localBridgeOnline
                ? 'লোকাল ব্রিজ সংযুক্ত'
                : 'মেশিন সংযুক্ত নয় (অপেক্ষমাণ)'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {devices[0]
              ? `SN: ${devices[0].serialNumber} · শেষ সিঙ্ক: ${lastPolledAt || 'এইমাত্র'}`
              : localBridgeOnline
                ? 'পিসি ব্রিজ (Port 8080) সচল — মেশিন পাঞ্চের অপেক্ষায়'
                : 'এখনো কোনো ফিজিক্যাল মেশিন থেকে সিগন্যাল আসেনি'}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>মেশিন আইডি যুক্ত প্রোফাইল</span>
            <Link2 className="w-4 h-4 text-[#0f4c3a]" />
          </div>
          <div className="text-xl font-extrabold text-[#0f4c3a] dark:text-emerald-400 mt-1">
            {employees.filter((e) => (e.attendanceMachineId || '').trim().length > 0).length} /{' '}
            {employees.length} জন
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            যাদের প্রোফাইলে ZKTeco মেশিনের User ID বসানো আছে
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>মোট মেশিন পাঞ্চ রেকর্ড</span>
            <Server className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
            {zkMachinePunchesCount} টি
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            সার্ভার বাফারে প্রাপ্ত পাঞ্চ: {bufferedPunches.length} টি
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              ১. আপনার ZKTeco F09 মেশিনে কী কী সেটিংস বসাবেন? (ADMS / Cloud Server Setting)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              মেশিনের বাটনে <strong>M/OK (Menu) ➔ Comm. ➔ Cloud Server Setting (বা ADMS)</strong>-এ গিয়ে নিচের তথ্যগুলো বসান:
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadLocalBridgeScript}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5 text-[#0f4c3a]" />
            <span>অফিস পিসি ব্রিজ স্ক্রিপ্ট ডাউনলোড (zk-f09-bridge.js)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-[#0f4c3a] dark:text-emerald-400 flex items-center gap-1.5">
              <CircleCheck className="w-4 h-4 shrink-0" />
              <span>পদ্ধতি ক: সরাসরি ডোমেইন মোড (Direct Cloud ADMS)</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 font-semibold">Enable Domain Name:</span>
                <span className="font-mono font-bold text-emerald-700">ON (চালু করুন)</span>
              </div>
              <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Server Address:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(hostDomain, 'domain')}
                    className="text-[11px] font-semibold text-[#0f4c3a] flex items-center gap-1 cursor-pointer"
                  >
                    {copiedField === 'domain' ? (
                      <>
                        <Check className="w-3 h-3" /> কপি হয়েছে
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> কপি করুন
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono font-bold text-slate-900 dark:text-white break-all text-[11px]">
                  {hostDomain}
                </div>
              </div>
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 font-semibold">Server Port:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  443 (HTTPS) অথবা 80 (HTTP)
                </span>
              </div>
              <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 font-semibold">ADMS Push Endpoint:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  /iclock/cdata (স্বয়ংক্রিয়)
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-slate-800/40 border border-amber-200 dark:border-slate-800 space-y-3">
            <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <Server className="w-4 h-4 shrink-0" />
              <span>পদ্ধতি খ: লোকাল ওয়াইফাই ব্রিজ মোড (পুরোনো F09 মেশিনের জন্য)</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              অনেক <strong>ZKTeco F09</strong> মেশিনে বড় ডোমেইন নাম টাইপ করা যায় না অথবা মেশিনটি শুধু লোকাল{' '}
              <code>HTTP</code> সাপোর্ট করে। সেক্ষেত্রে উপরের{' '}
              <strong>&quot;অফিস পিসি ব্রিজ স্ক্রিপ্ট (zk-f09-bridge.js)&quot;</strong> ডাউনলোড করে অফিসের পিসিতে চালান এবং মেশিনে নিচের সেটিংস দিন:
            </p>
            <div className="space-y-1.5 font-mono text-[11px] bg-white dark:bg-slate-900 p-3 rounded-lg border border-amber-200">
              <div>
                <strong>Enable Domain Name:</strong> OFF
              </div>
              <div>
                <strong>Server Address:</strong> আপনার অফিস পিসির IP (যেমন: 192.168.1.100)
              </div>
              <div>
                <strong>Server Port:</strong> 8080
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              মেশিন ওয়াইফাই/ল্যানে পিসিতে পাঞ্চ পাঠাবে এবং ব্রিজ স্ক্রিপ্ট ১ সেকেন্ডের মধ্যে তা সরাসরি এই ক্লাউড পোর্টালে পাঠিয়ে দেবে।
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            ২. শিক্ষক ও স্টাফদের প্রোফাইলে ZKTeco মেশিনের User ID / PIN যুক্ত করুন
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            ZKTeco F09 মেশিনে যার ফিঙ্গারপ্রিন্ট বা কার্ড যে নম্বরে (যেমন: <code>1</code>, <code>2</code>,{' '}
            <code>101</code>) রেজিস্টার করা আছে, নিচের ঘরে সেই নম্বরটি বসিয়ে <strong>সংরক্ষণ</strong> বাটনে ক্লিক করুন:
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                <th className="py-2.5 px-3">পোর্টাল আইডি</th>
                <th className="py-2.5 px-3">নাম ও পদবি</th>
                <th className="py-2.5 px-3">বিভাগ</th>
                <th className="py-2.5 px-3">ZKTeco F09 মেশিন আইডি (PIN)</th>
                <th className="py-2.5 px-3 text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {employees.map((emp) => {
                const currentVal = pinInputs[emp.id] ?? emp.attendanceMachineId ?? '';
                const isChanged = currentVal.trim() !== (emp.attendanceMachineId || '').trim();
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0f4c3a] dark:text-emerald-400">
                      {emp.id}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {emp.nameBn || emp.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {emp.designationBn || emp.designation}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {emp.department}
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) =>
                          setPinInputs((prev) => ({
                            ...prev,
                            [emp.id]: e.target.value,
                          }))
                        }
                        placeholder="যেমন: 1 বা 101"
                        className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-slate-900 dark:text-white text-xs"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        disabled={savingEmpId === emp.id || !isChanged}
                        onClick={() => handleSaveEmployeePin(emp.id, currentVal)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          isChanged
                            ? 'bg-[#0f4c3a] text-white hover:bg-[#0b3a2c]'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {savingEmpId === emp.id ? 'সেভ হচ্ছে...' : 'সংরক্ষণ'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#0f4c3a]" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              ৩. USB পেনড্রাইভ (attlog.dat / .txt / .csv) ফাইল আপলোড
            </h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            কখনো ইন্টারনেট বন্ধ থাকলে ZKTeco F09 মেশিনে পেনড্রাইভ লাগিয়ে{' '}
            <strong>Data Mgt. ➔ Download AttLog</strong> দিয়ে নামানো <code>attlog.dat</code> বা{' '}
            <code>.txt/.csv</code> ফাইল এখানে আপলোড করলে স্বয়ংক্রিয়ভাবে সবার হাজিরা বসে যাবে।
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dat,.txt,.csv,.log"
            onChange={handleDatOrCsvFileUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-emerald-700/40 hover:border-emerald-700 bg-emerald-50/40 hover:bg-emerald-50 text-[#0f4c3a] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>পেনড্রাইভের attlog.dat / CSV ফাইল নির্বাচন করুন</span>
          </button>
        </div>

        <form
          onSubmit={handleManualLogPush}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              ৪. সরাসরি ATTLOG টেক্সট পেস্ট (ঐচ্ছিক)
            </h4>
            <span className="text-[11px] font-mono text-slate-400">PIN YYYY-MM-DD HH:mm:ss</span>
          </div>
          <textarea
            rows={3}
            value={manualRawText}
            onChange={(e) => setManualRawText(e.target.value)}
            placeholder={
              'উদাহরণ:\n101\t2026-11-14 08:55:00\t0\t1\n101\t2026-11-14 17:05:00\t1\t1'
            }
            className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
          />
          <button
            type="submit"
            disabled={isSyncing || !manualRawText.trim()}
            className="px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3a2c] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            হাজিরায় যুক্ত করুন
          </button>
        </form>
      </div>
    </div>
  );
}
