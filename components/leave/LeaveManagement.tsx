'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  PlusCircle,
  FileSpreadsheet,
  X,
  SlidersHorizontal,
  CalendarCheck,
  AlertCircle,
} from 'lucide-react';
import {
  LeaveType,
  isAdministrativeRole,
  isDepartmentLeader,
  isPersonalScopeOnly,
} from '@/lib/types';
import { exportLeavesToExcel } from '@/lib/export-utils';
import { toBnDigits, parseIsoDateLocal } from '@/lib/calendar-utils';

export function LeaveManagement() {
  const {
    currentUser,
    leaveApplications,
    submitLeaveApplication,
    finalApproveLeave,
    institutionalLeavePolicy,
    getEmployeeLeaveBalance,
    setActiveNav,
  } = useApp();

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const isPersonalOnly = isPersonalScopeOnly(currentUser.role);
  const isLeader = isDepartmentLeader(currentUser.role);
  const isAdmin = isAdministrativeRole(currentUser.role);

  const myBalance = getEmployeeLeaveBalance(currentUser.id);
  const isElAllowed =
    institutionalLeavePolicy.earnedLeaveEnabled ||
    (Boolean(myBalance.isCustomQuota) && myBalance.earnedLeaveTotal > 0);

  const availableLeaveOptions: Array<{
    val: LeaveType;
    label: string;
    remainingText: string;
    enabled: boolean;
  }> = [
    {
      val: 'Casual Leave (CL)',
      label: 'নৈমিত্তিক (CL)',
      remainingText: `বাকি ${toBnDigits(Math.max(0, myBalance.casualLeaveTotal - myBalance.casualLeaveUsed))} দিন`,
      enabled: institutionalLeavePolicy.casualLeaveEnabled,
    },
    {
      val: 'Sick Leave (SL)',
      label: 'চিকিৎসা (SL)',
      remainingText: `বাকি ${toBnDigits(Math.max(0, myBalance.sickLeaveTotal - myBalance.sickLeaveUsed))} দিন`,
      enabled: institutionalLeavePolicy.sickLeaveEnabled,
    },
    {
      val: 'Earned Leave (EL)',
      label: 'অর্জিত (EL)',
      remainingText: isElAllowed
        ? `বাকি ${toBnDigits(Math.max(0, myBalance.earnedLeaveTotal - myBalance.earnedLeaveUsed))} দিন`
        : 'প্রতিষ্ঠানে চালু নেই',
      enabled: isElAllowed,
    },
    {
      val: 'Duty Leave (DL)',
      label: 'দায়িত্বকালীন ছুটি (DL)',
      remainingText: `গৃহীত ${toBnDigits(myBalance.dutyLeaveUsed)} দিন`,
      enabled: institutionalLeavePolicy.dutyLeaveEnabled,
    },
  ];

  const firstEnabledType =
    availableLeaveOptions.find((o) => o.enabled)?.val || 'Casual Leave (CL)';

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>(firstEnabledType);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [totalDays, setTotalDays] = useState(1);
  const [reason, setReason] = useState('');
  const [contactDuringLeave, setContactDuringLeave] = useState(currentUser.phone);

  const recomputeDays = (s: string, e: string) => {
    if (!s || !e) return;
    const sd = parseIsoDateLocal(s);
    const ed = parseIsoDateLocal(e);
    if (ed >= sd) {
      const diff = Math.round((ed.getTime() - sd.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setTotalDays(Math.max(1, diff));
    }
  };

  const scopedApplications = leaveApplications.filter((app) => {
    if (isPersonalOnly) {
      return app.employeeId === currentUser.id;
    }
    if (isLeader && !isAdmin) {
      return app.department === currentUser.department || app.employeeId === currentUser.id;
    }
    return true;
  });

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitLeaveApplication({
      employeeId: currentUser.id,
      employeeName: currentUser.nameBn || currentUser.name,
      department: currentUser.department,
      leaveType,
      startDate,
      endDate,
      totalDays: Number(totalDays),
      reason,
      contactDuringLeave,
    });
    setShowApplyModal(false);
    setReason('');
  };

  return (
    <div className="space-y-5 font-serif">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            {isPersonalOnly ? 'আমার ছুটির আবেদন ও তালিকা' : 'ছুটির আবেদন ও অনুমোদন'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ছুটির আবেদন জমা দেওয়া এবং অনুমোদনের অবস্থা পর্যবেক্ষণ।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setActiveNav('calendar-policy')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-800" />
              <span>ছুটির নীতিমালা ও কোটা</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => exportLeavesToExcel(scopedApplications)}
              className="px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel ডাউনলোড</span>
            </button>
          )}

          <button
            onClick={() => {
              setLeaveType(firstEnabledType);
              setShowApplyModal(true);
            }}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4 text-amber-300" />
            <span>নতুন ছুটির আবেদন</span>
          </button>
        </div>
      </div>

      {/* Personal Leave Balance & Policy Summary Strip */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <CalendarCheck className="w-4 h-4 text-emerald-800" />
            <span>
              আমার বাৎসরিক ছুটির হিসাব ({toBnDigits(institutionalLeavePolicy.year)})
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {myBalance.isCustomQuota
              ? 'ব্যক্তিগত সমন্বিত কোটা প্রযোজ্য'
              : 'প্রতিষ্ঠানের সাধারণ ছুটির নীতিমালা অনুযায়ী'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500">নৈমিত্তিক (CL)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {institutionalLeavePolicy.casualLeaveEnabled
                ? `${toBnDigits(Math.max(0, myBalance.casualLeaveTotal - myBalance.casualLeaveUsed))} / ${toBnDigits(myBalance.casualLeaveTotal)}`
                : 'বন্ধ'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {institutionalLeavePolicy.casualLeaveEnabled
                ? `ব্যবহৃত ${toBnDigits(myBalance.casualLeaveUsed)} দিন`
                : 'প্রতিষ্ঠানে চালু নেই'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500">চিকিৎসা (SL)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {institutionalLeavePolicy.sickLeaveEnabled
                ? `${toBnDigits(Math.max(0, myBalance.sickLeaveTotal - myBalance.sickLeaveUsed))} / ${toBnDigits(myBalance.sickLeaveTotal)}`
                : 'বন্ধ'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {institutionalLeavePolicy.sickLeaveEnabled
                ? `ব্যবহৃত ${toBnDigits(myBalance.sickLeaveUsed)} দিন`
                : 'প্রতিষ্ঠানে চালু নেই'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500">অর্জিত (EL)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {isElAllowed
                ? `${toBnDigits(Math.max(0, myBalance.earnedLeaveTotal - myBalance.earnedLeaveUsed))} / ${toBnDigits(myBalance.earnedLeaveTotal)}`
                : 'প্রযোজ্য নয়'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isElAllowed
                ? `ব্যবহৃত ${toBnDigits(myBalance.earnedLeaveUsed)} দিন`
                : 'প্রতিষ্ঠানে অর্জিত ছুটি বন্ধ'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
            <div className="text-[11px] text-slate-500">দায়িত্বকালীন (DL)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {institutionalLeavePolicy.dutyLeaveEnabled
                ? `${toBnDigits(myBalance.dutyLeaveUsed)} দিন`
                : 'বন্ধ'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {institutionalLeavePolicy.dutyLeaveEnabled ? 'মোট গৃহীত' : 'প্রতিষ্ঠানে চালু নেই'}
            </div>
          </div>
        </div>
      </div>

      {/* Applications List & Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {scopedApplications.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              কোনো ছুটির আবেদন পাওয়া যায়নি।
            </div>
          ) : (
            scopedApplications.map((app) => (
              <div key={app.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">{app.employeeName}</div>
                    <div className="text-[11px] text-slate-500">{app.department}</div>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                      app.status === 'Approved'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : app.status === 'Rejected'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {app.status === 'Approved'
                      ? 'অনুমোদিত'
                      : app.status === 'Rejected'
                      ? 'বাতিল'
                      : 'অপেক্ষমাণ'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    {app.leaveType}
                  </span>
                  <span className="font-mono text-slate-600">
                    {app.startDate} → {app.endDate}
                  </span>
                  <span className="font-bold text-emerald-900">({app.totalDays} দিন)</span>
                </div>

                {app.reason && (
                  <p className="text-slate-600 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {app.reason}
                  </p>
                )}

                {isAdmin && app.status !== 'Approved' && app.status !== 'Rejected' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => finalApproveLeave(app.id, 'অনুমোদিত', true)}
                      className="py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-semibold cursor-pointer"
                    >
                      অনুমোদন
                    </button>
                    <button
                      onClick={() => finalApproveLeave(app.id, 'প্রত্যাখ্যাত', false)}
                      className="py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                    >
                      বাতিল
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">আবেদনকারী</th>
                <th className="py-3 px-4">ছুটির ধরন</th>
                <th className="py-3 px-4">তারিখ</th>
                <th className="py-3 px-4">মোট দিন</th>
                <th className="py-3 px-4">কারণ</th>
                <th className="py-3 px-4">স্ট্যাটাস</th>
                {isAdmin && <th className="py-3 px-4 text-right">সিদ্ধান্ত</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scopedApplications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    কোনো ছুটির আবেদন পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                scopedApplications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{app.employeeName}</div>
                      <div className="text-[11px] text-slate-500">{app.department}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{app.leaveType}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {app.startDate} থেকে {app.endDate}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{app.totalDays} দিন</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs">{app.reason}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                          app.status === 'Approved'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : app.status === 'Rejected'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {app.status === 'Approved'
                          ? 'অনুমোদিত'
                          : app.status === 'Rejected'
                          ? 'বাতিল'
                          : 'অপেক্ষমাণ'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3.5 px-4 text-right">
                        {app.status !== 'Approved' && app.status !== 'Rejected' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => finalApproveLeave(app.id, 'অনুমোদিত', true)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-semibold cursor-pointer"
                            >
                              অনুমোদন
                            </button>
                            <button
                              onClick={() => finalApproveLeave(app.id, 'প্রত্যাখ্যাত', false)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                            >
                              বাতিল
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">সম্পন্ন</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Leave Modal (Button Radio instead of Dropdown) */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">নতুন ছুটির আবেদন</h3>
              <button
                onClick={() => setShowApplyModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplySubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">ছুটির ধরন নির্বাচন করুন</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableLeaveOptions.map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      disabled={!opt.enabled}
                      onClick={() => opt.enabled && setLeaveType(opt.val)}
                      className={`py-2 px-2.5 rounded-lg text-left border transition-colors ${
                        !opt.enabled
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-70'
                          : leaveType === opt.val
                          ? 'bg-emerald-900 text-white border-emerald-900 cursor-pointer'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100 cursor-pointer'
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.label}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          leaveType === opt.val ? 'text-amber-200' : 'text-slate-500'
                        }`}
                      >
                        {opt.remainingText}
                      </div>
                    </button>
                  ))}
                </div>
                {!availableLeaveOptions.some((o) => o.enabled) && (
                  <p className="mt-2 text-[11px] text-rose-700 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>বর্তমানে কোনো ছুটির ধরন চালু নেই। অ্যাডমিনের সাথে যোগাযোগ করুন।</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">শুরুর তারিখ</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      if (endDate < nextStart) {
                        setEndDate(nextStart);
                        recomputeDays(nextStart, nextStart);
                      } else {
                        recomputeDays(nextStart, endDate);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">শেষ তারিখ</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => {
                      const nextEnd = e.target.value;
                      setEndDate(nextEnd);
                      recomputeDays(startDate, nextEnd);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">মোট দিন</label>
                  <input
                    type="number"
                    min="1"
                    value={totalDays}
                    onChange={(e) => setTotalDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">জরুরি মোবাইল নম্বর</label>
                  <input
                    type="text"
                    value={contactDuringLeave}
                    onChange={(e) => setContactDuringLeave(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ছুটির কারণ *</label>
                <textarea
                  rows={2}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="ছুটির কারণ সংক্ষেপে লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                >
                  আবেদন জমা দিন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
