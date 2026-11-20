'use client';

import React, { useRef, useState } from 'react';
import {
  CircleCheck,
  Cpu,
  FileText,
  Link2,
  Play,
  Server,
  TriangleAlert,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { getDhakaDateTime, useApp } from '@/lib/store';
import { parseZkAttLogPayload, ZkParsedPunch } from '@/lib/zkteco-parser';

export function ZkTecoMachinePanel() {
  const { employees, updateEmployee, ingestZkMachinePunches, rawPunches } = useApp();
  const [recentImportedPunches, setRecentImportedPunches] = useState<ZkParsedPunch[]>([]);
  const [unmappedPins, setUnmappedPins] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastImportedAt, setLastImportedAt] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [manualRawText, setManualRawText] = useState('');
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null);
  const [selectedEmpForPin, setSelectedEmpForPin] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (recentImportedPunches.length > 0) {
        const summary = ingestZkMachinePunches(recentImportedPunches);
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
    setIsProcessing(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const parsed = parseZkAttLogPayload(text, 'ZK-F09-USB');
      if (parsed.length === 0) {
        setFeedback({
          type: 'warning',
          text: `ফাইল (${file.name}) থেকে কোনো বৈধ ZKTeco পাঞ্চ লাইন পাওয়া যায়নি। সঠিক attlog.dat বা .txt/.csv ফাইল নির্বাচন করুন।`,
        });
      } else {
        setRecentImportedPunches((prev) => [...parsed, ...prev].slice(0, 500));
        setLastImportedAt(getDhakaDateTime().timeStr);
        const summary = ingestZkMachinePunches(parsed);
        setUnmappedPins(summary.unmappedPins);
        setFeedback({
          type:
            summary.unmappedPins.length > 0 && summary.processedCount === 0
              ? 'warning'
              : 'success',
          text: `ফাইল (${file.name}) থেকে মোট ${parsed.length} টি পাঞ্চ পড়া হয়েছে এবং ${summary.processedCount} টি নতুন হাজিরা রেকর্ড Firestore-এ সংরক্ষিত হয়েছে।${
            summary.unmappedPins.length > 0
              ? ` (আন-ম্যাপড মেশিন আইডি: ${summary.unmappedPins.join(', ')})`
              : ''
          }`,
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'ফাইলটি পড়তে ত্রুটি হয়েছে। সঠিক attlog.dat বা .txt/.csv ফাইল নির্বাচন করুন।',
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualLogPush = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRawText.trim()) return;
    setIsProcessing(true);
    setFeedback(null);
    try {
      const parsed = parseZkAttLogPayload(manualRawText, 'ZK-F09-MANUAL');
      if (parsed.length === 0) {
        setFeedback({
          type: 'warning',
          text: 'সঠিক ফরম্যাটের কোনো ATTLOG পাওয়া যায়নি। উদাহরণ: 101 2026-11-14 08:55:00 0 1',
        });
      } else {
        setRecentImportedPunches((prev) => [...parsed, ...prev].slice(0, 500));
        setLastImportedAt(getDhakaDateTime().timeStr);
        const summary = ingestZkMachinePunches(parsed);
        setUnmappedPins(summary.unmappedPins);
        setManualRawText('');
        setFeedback({
          type:
            summary.unmappedPins.length > 0 && summary.processedCount === 0
              ? 'warning'
              : 'success',
          text: `${parsed.length} টি লগ যাচাই করে ${summary.processedCount} টি নতুন উপস্থিতি রেকর্ড Firestore-এ যুক্ত করা হয়েছে।${
            summary.unmappedPins.length > 0
              ? ` (আন-ম্যাপড মেশিন আইডি: ${summary.unmappedPins.join(', ')})`
              : ''
          }`,
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'লগ ডেটা প্রসেস করা যায়নি।',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSimulateMachineTestPunch = () => {
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
    setIsProcessing(true);
    setFeedback(null);
    try {
      const parsed = parseZkAttLogPayload(sampleLine, 'F09-OFFICE-01');
      if (parsed.length > 0) {
        setRecentImportedPunches((prev) => [...parsed, ...prev].slice(0, 500));
        setLastImportedAt(dhaka.timeStr);
        const summary = ingestZkMachinePunches(parsed);
        setUnmappedPins(summary.unmappedPins);
        if (summary.processedCount > 0) {
          setFeedback({
            type: 'success',
            text: `মেশিন পার্সার টেস্ট সফল! "${targetEmp.nameBn || targetEmp.name}" (মেশিন আইডি: ${pinToUse})-এর টেস্ট পাঞ্চ যাচাই হয়ে হাজিরা ও Firestore-এ যুক্ত হয়েছে।`,
          });
        } else {
          setFeedback({
            type: 'warning',
            text: `"${targetEmp.nameBn || targetEmp.name}"-এর প্রোফাইলে মেশিন আইডি (${pinToUse}) যুক্ত করুন অথবা সাম্প্রতিক পাঞ্চ ইতিমধ্যে রেকর্ড আছে।`,
          });
        }
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'টেস্ট পাঞ্চ প্রসেস করতে ত্রুটি হয়েছে।',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const zkMachinePunchesCount = rawPunches.filter(
    (p) => p.machineId && p.machineId !== 'MOBILE-GPS-QR'
  ).length;

  return (
    <div className="space-y-6">
      <div className="bg-emerald-950 text-white rounded-xl p-4 sm:p-6 border border-emerald-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-900/90 border border-emerald-700 text-amber-300 text-[11px] font-bold">
            <Cpu className="w-3.5 h-3.5" />
            <span>ZKTeco F09 বায়োমেট্রিক USB / ATTLOG ইম্পোর্ট ইঞ্জিন (Spark Ready)</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold">
            ZKTeco F09 বায়োমেট্রিক হাজিরা মেশিন ডেটা ইম্পোর্ট ও PIN ম্যাপিং প্যানেল
          </h3>
          <p className="text-xs text-emerald-100/80 max-w-2xl leading-relaxed">
            কোনো আলাদা সার্ভার বা পেইড সফটওয়্যার ছাড়াই আপনার <strong>ZKTeco F09</strong> মেশিন থেকে USB পেনড্রাইভের{' '}
            <code>attlog.dat</code> / <code>.csv</code> / <code>.txt</code> ফাইল আপলোড বা সরাসরি ATTLOG পেস্ট করে সবার ফিঙ্গারপ্রিন্ট ও কার্ড হাজিরা সরাসরি Firestore ডাটাবেসে সিঙ্ক করুন।
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>attlog.dat / CSV আপলোড</span>
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleSimulateMachineTestPunch}
            className="px-3.5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white border border-emerald-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Play className="w-3.5 h-3.5 text-amber-300" />
            <span>টেস্ট পাঞ্চ যাচাই করুন</span>
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
              <strong>আন-ম্যাপড মেশিন আইডি শনাক্ত হয়েছে ({unmappedPins.length} টি):</strong> মেশিন ফাইল থেকে নিচের User ID / PIN দিয়ে পাঞ্চ এসেছে, কিন্তু এখনো কোনো শিক্ষক বা স্টাফের প্রোফাইলে এই মেশিন আইডি বসানো হয়নি। নিচে প্রোফাইল সিলেক্ট করে লিংক করে দিন:
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
            <span>হোস্টিং ও ইম্পোর্ট মোড</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
            USB / CSV সরাসরি ইম্পোর্ট
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {lastImportedAt
              ? `সর্বশেষ ইম্পোর্ট: ${lastImportedAt}`
              : 'ব্রাউজারেই প্রসেস হয়ে সরাসরি Firestore-এ সেভ হয়'}
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
            এই সেশনে পড়া পাঞ্চ: {recentImportedPunches.length} টি
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#0f4c3a]" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              ১. USB পেনড্রাইভ (attlog.dat / .txt / .csv) ফাইল আপলোড
            </h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            ZKTeco F09 মেশিনে পেনড্রাইভ লাগিয়ে <strong>Data Mgt. ➔ Download AttLog</strong> দিয়ে নামানো{' '}
            <code>attlog.dat</code> বা <code>.txt/.csv</code> ফাইল এখানে আপলোড করলে কোনো সার্ভার ছাড়াই স্বয়ংক্রিয়ভাবে সবার হাজিরা বসে যাবে এবং Firestore-এ সংরক্ষিত হবে।
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
            disabled={isProcessing}
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
              ২. সরাসরি ATTLOG টেক্সট পেস্ট (ঐচ্ছিক)
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
            disabled={isProcessing || !manualRawText.trim()}
            className="px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3a2c] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            হাজিরায় যুক্ত করুন
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            ৩. শিক্ষক ও স্টাফদের প্রোফাইলে ZKTeco মেশিনের User ID / PIN যুক্ত করুন
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
    </div>
  );
}
