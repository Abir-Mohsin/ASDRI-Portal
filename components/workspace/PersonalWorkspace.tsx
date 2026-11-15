'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  PlusCircle,
  FileSpreadsheet,
  Send,
  X,
  CheckCircle2,
  CalendarDays,
  SlidersHorizontal,
  ArrowRight,
  Clock,
  Camera,
} from 'lucide-react';
import { ActionTrackerItem, SubmittedFileAttachment, isAdministrativeRole, getRoleLabel } from '@/lib/types';
import { GoogleDriveStatusButton } from '@/components/drive/GoogleDriveControlModal';
import { GoogleDriveFileUploader, SubmissionFilesBadges } from '@/components/drive/GoogleDriveFileUploader';
import { QrPunchScannerModal, useQrCameraPunch } from '@/components/attendance/QrPunchScannerModal';
import {
  getBengaliDateInfo,
  getHijriDateInfo,
  getGregorianDateFullBn,
  getDayOperationalStatus,
  getCategoryLabelBn,
  getCategoryBadgeStyle,
  toBnDigits,
  parseIsoDateLocal,
} from '@/lib/calendar-utils';

interface PersonalWorkspaceProps {
  onOpenApplyLeave: () => void;
  onOpenCorrection?: () => void;
}

export function PersonalWorkspace({ onOpenApplyLeave }: PersonalWorkspaceProps) {
  const {
    currentUser,
    employees,
    attendanceRecords,
    leaveApplications,
    actionTrackerItems,
    updateActionTrackerProgress,
    getEmployeeLeaveOnDate,
    getEmployeeLeaveBalance,
    institutionalLeavePolicy,
    policy,
    calendarEvents,
    meetings,
    finalApproveLeave,
    setActiveNav,
    setFocusedMeetingId,
    setFocusedCalendarDate,
  } = useApp();

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const isAdmin = isAdministrativeRole(currentUser.role);

  const myTodayAttendance = attendanceRecords.find(
    (r) => r.employeeId === currentUser.id && r.date === todayStr
  );
  const myTodayLeave = getEmployeeLeaveOnDate(currentUser.id, todayStr);
  const isCurrentlyIn = myTodayAttendance?.sessions?.some((s) => !s.outTime) ?? Boolean(myTodayAttendance?.firstInTime && !myTodayAttendance?.lastOutTime);

  // Tri-Date & Institutional Calendar Summary for Today
  const todayGregorianFull = getGregorianDateFullBn(todayStr);
  const todayBengali = getBengaliDateInfo(todayStr);
  const todayHijri = getHijriDateInfo(todayStr, institutionalLeavePolicy.hijriOffsetDays || 0);
  const todayOperational = getDayOperationalStatus(todayStr, policy, calendarEvents);

  const upcomingCalendarEvents = calendarEvents
    .filter((ev) => ev.endDate >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  const currentYearPrefix = todayStr.slice(0, 4);
  const yearHolidayCount = calendarEvents.filter(
    (ev) => ev.category === 'Holiday' && ev.startDate.startsWith(currentYearPrefix)
  ).length;
  const yearExamAcademicCount = calendarEvents.filter(
    (ev) => (ev.category === 'Exam' || ev.category === 'Academic') && ev.startDate.startsWith(currentYearPrefix)
  ).length;

  // Filter decisions/tasks assigned to the current user
  const myActionTrackerItems = actionTrackerItems.filter(
    (item) =>
      item.assignedEmployeeIds?.includes(currentUser.id) ||
      item.assignedPersonText.toLowerCase().includes(currentUser.name.toLowerCase()) ||
      (currentUser.nameBn && item.assignedPersonText.includes(currentUser.nameBn.split(' ')[0]))
  );

  // Work Submission / Update Modal State
  const [submittingItem, setSubmittingItem] = useState<ActionTrackerItem | null>(null);
  const [progressVal, setProgressVal] = useState<number>(0);
  const [submissionReport, setSubmissionReport] = useState<string>('');
  const [submissionFiles, setSubmissionFiles] = useState<SubmittedFileAttachment[]>([]);
  const [latestUpdateNote, setLatestUpdateNote] = useState<string>('');
  const [punchToast, setPunchToast] = useState<{ ok: boolean; message: string } | null>(null);

  const { scannerProps, openCameraPunch } = useQrCameraPunch((result) => {
    setPunchToast({ ok: result.ok, message: result.message });
  });

  const myLeaveBalance = getEmployeeLeaveBalance(currentUser.id);
  const isElVisible =
    institutionalLeavePolicy.earnedLeaveEnabled ||
    (Boolean(myLeaveBalance.isCustomQuota) && myLeaveBalance.earnedLeaveTotal > 0);

  const pendingLeaves = leaveApplications.filter(
    (l) => l.status === 'Pending_Director' || l.status === 'Pending_Dept_Head'
  );

  const totalPresentToday = attendanceRecords.filter(
    (r) => r.date === todayStr && (r.status === 'Present' || r.status === 'Late' || Boolean(r.firstInTime))
  ).length;

  const handleOpenSubmitModal = (item: ActionTrackerItem) => {
    setSubmittingItem(item);
    setProgressVal(item.progressPercentage || 0);
    setSubmissionReport(item.submissionReport || '');
    setSubmissionFiles(item.submissionFiles || []);
    setLatestUpdateNote(item.latestUpdate || '');
  };

  const handleWorkSubmit = (markCompleted: boolean) => {
    if (!submittingItem) return;
    const finalProgress = markCompleted ? 100 : progressVal;
    const finalStatus: ActionTrackerItem['status'] =
      finalProgress >= 100 ? 'সম্পন্ন' : finalProgress > 0 ? 'চলমান' : 'শুরু হয়নি';

    updateActionTrackerProgress(submittingItem.id, {
      progressPercentage: finalProgress,
      status: finalStatus,
      submissionReport: submissionReport.trim() || submittingItem.submissionReport,
      submissionFiles,
      latestUpdate:
        latestUpdateNote.trim() ||
        submissionReport.trim() ||
        (submissionFiles.length > 0 ? `${submissionFiles.length} টি ফাইল জমা দেওয়া হয়েছে` : submittingItem.latestUpdate),
      submittedAt: todayStr,
      submittedBy: currentUser.nameBn || currentUser.name,
      completionDate: finalProgress >= 100 ? todayStr : undefined,
    });

    setSubmittingItem(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6 font-serif">
      {/* Welcome Banner */}
      <div className="bg-emerald-950 text-white rounded-2xl p-4 sm:p-6 border border-emerald-900 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-amber-300 font-semibold">
              <span>আইডি: {currentUser.id}</span>
              <span>·</span>
              <span>{currentUser.designationBn || currentUser.designation}</span>
              <span>·</span>
              <span>{getRoleLabel(currentUser.role, true)}</span>
            </div>

            <h1 className="text-lg sm:text-2xl font-bold text-white leading-snug">
              আসসালামু আলাইকুম, {currentUser.nameBn || currentUser.name}
            </h1>

            {/* Tri-Date & Today Status Line */}
            <div className="pt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] sm:text-xs text-emerald-100/90">
              <span>{todayGregorianFull}</span>
              <span className="text-emerald-600">·</span>
              <span className="text-amber-200">{todayBengali.formattedFull}</span>
              <span className="text-emerald-600">·</span>
              <span className="text-emerald-200">{todayHijri.formattedFull}</span>
              <span className="text-emerald-600">·</span>
              <span
                className={`font-semibold ${
                  todayOperational.isAnyHoliday ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {todayOperational.isAnyHoliday
                  ? `আজ ছুটি (${todayOperational.holidayTitle || 'ছুটির দিন'})`
                  : todayOperational.isSpecialWorkingDay
                  ? 'বিশেষ কর্মদিবস'
                  : 'নিয়মিত কর্মদিবস'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              disabled={isCurrentlyIn}
              onClick={() => openCameraPunch('IN')}
              className={`w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                isCurrentlyIn
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700 cursor-default'
                  : 'text-emerald-950 bg-amber-400 hover:bg-amber-300 cursor-pointer'
              }`}
            >
              {!isCurrentlyIn && <Camera className="w-3.5 h-3.5" />}
              <span>{isCurrentlyIn ? '✓ অফিসে অবস্থানরত (Punched In)' : 'Punch In (ক্যামেরা স্ক্যান)'}</span>
            </button>
            <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                disabled={!isCurrentlyIn}
                onClick={() => openCameraPunch('OUT')}
                className={`w-full sm:w-auto justify-center px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  isCurrentlyIn
                    ? 'text-white bg-rose-600 hover:bg-rose-500 cursor-pointer'
                    : 'text-emerald-300/60 bg-emerald-900/50 border border-emerald-800 cursor-not-allowed'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Punch Out</span>
              </button>
              <button
                onClick={onOpenApplyLeave}
                className="w-full sm:w-auto justify-center px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5 text-amber-300" />
                <span>ছুটির আবেদন</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Punch Confirmation Feedback */}
      {punchToast && (
        <div
          className={`rounded-xl px-4 py-3 border flex items-center justify-between gap-3 text-xs font-semibold ${
            punchToast.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{punchToast.message}</span>
          <button
            type="button"
            onClick={() => setPunchToast(null)}
            className="underline opacity-75 hover:opacity-100 cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Today's Attendance */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-bold text-slate-700">আজকের উপস্থিতি</span>
            <button
              type="button"
              onClick={() => (myTodayAttendance ? setActiveNav('attendance') : openCameraPunch('IN'))}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                myTodayLeave
                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                  : myTodayAttendance?.status === 'Present'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : myTodayAttendance?.status === 'Late'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-900 text-white'
              }`}
            >
              {myTodayLeave
                ? `ছুটিতে (${myTodayLeave.leaveType})`
                : myTodayAttendance?.status === 'Late'
                ? 'বিলম্বে প্রবেশ (Late)'
                : myTodayAttendance?.status === 'Present'
                ? 'উপস্থিত (Present)'
                : 'Punch করুন →'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500 block">প্রবেশ (IN)</span>
              <span className="text-sm font-bold font-mono text-emerald-800">
                {myTodayAttendance?.firstInTime || '--:--'}
              </span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500 block">প্রস্থান (OUT)</span>
              <span className="text-sm font-bold font-mono text-rose-800">
                {myTodayAttendance?.lastOutTime || (isCurrentlyIn ? 'চলমান' : '--:--')}
              </span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500 block">কর্মঘণ্টা</span>
              <span className="text-xs font-bold text-slate-900">
                {myTodayAttendance?.totalWorkingDurationMinutes
                  ? `${Math.floor(myTodayAttendance.totalWorkingDurationMinutes / 60)}ঘ ${myTodayAttendance.totalWorkingDurationMinutes % 60}মি`
                  : '০ মি.'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Leave Balances (Dynamic Institutional Policy) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-bold text-slate-700">
              ছুটির ব্যালেন্স ({toBnDigits(institutionalLeavePolicy.year)})
            </span>
            <button
              onClick={() => setActiveNav('leaves')}
              className="text-xs text-emerald-800 hover:underline font-semibold cursor-pointer"
            >
              বিস্তারিত →
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500 block">নৈমিত্তিক (CL)</span>
              <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                {institutionalLeavePolicy.casualLeaveEnabled
                  ? toBnDigits(Math.max(0, myLeaveBalance.casualLeaveTotal - myLeaveBalance.casualLeaveUsed))
                  : 'বন্ধ'}
              </span>
              <span className="text-[10px] text-slate-400 block tabular-nums">
                {institutionalLeavePolicy.casualLeaveEnabled
                  ? `মোট ${toBnDigits(myLeaveBalance.casualLeaveTotal)} দিন`
                  : 'প্রযোজ্য নয়'}
              </span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500 block">চিকিৎসা (SL)</span>
              <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                {institutionalLeavePolicy.sickLeaveEnabled
                  ? toBnDigits(Math.max(0, myLeaveBalance.sickLeaveTotal - myLeaveBalance.sickLeaveUsed))
                  : 'বন্ধ'}
              </span>
              <span className="text-[10px] text-slate-400 block tabular-nums">
                {institutionalLeavePolicy.sickLeaveEnabled
                  ? `মোট ${toBnDigits(myLeaveBalance.sickLeaveTotal)} দিন`
                  : 'প্রযোজ্য নয়'}
              </span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500 block">অর্জিত (EL)</span>
              <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                {isElVisible
                  ? toBnDigits(Math.max(0, myLeaveBalance.earnedLeaveTotal - myLeaveBalance.earnedLeaveUsed))
                  : 'নেই'}
              </span>
              <span className="text-[10px] text-slate-400 block tabular-nums">
                {isElVisible
                  ? `মোট ${toBnDigits(myLeaveBalance.earnedLeaveTotal)} দিন`
                  : 'চালু নেই'}
              </span>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {myLeaveBalance.isCustomQuota ? 'ব্যক্তিগত সমন্বিত কোটা' : 'প্রতিষ্ঠানের নির্ধারিত কোটা'}
            </span>
            {isAdmin && (
              <button
                onClick={() => setActiveNav('calendar-policy')}
                className="text-emerald-800 hover:underline font-semibold cursor-pointer"
              >
                নীতিমালা এডিট →
              </button>
            )}
          </div>
        </div>

        {/* Card 3: Work Summary */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-bold text-slate-700">
              {isAdmin ? 'প্রতিষ্ঠানের সারাংশ' : 'আমার কাজের সারাংশ'}
            </span>
            <button
              onClick={() => setActiveNav('action-tracker')}
              className="text-xs text-emerald-800 hover:underline font-semibold cursor-pointer"
            >
              সকল কাজ →
            </button>
          </div>

          {isAdmin ? (
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-[11px] text-slate-500 block">মোট জনবল</span>
                <span className="text-base font-bold font-mono text-slate-900">{employees.length}</span>
                <span className="text-[10px] text-slate-400 block">জন</span>
              </div>
              <div className="p-2.5 bg-emerald-50/70 rounded-lg">
                <span className="text-[11px] text-emerald-800 block">আজ উপস্থিত</span>
                <span className="text-base font-bold font-mono text-emerald-900">{totalPresentToday}</span>
                <span className="text-[10px] text-emerald-700 block">জন</span>
              </div>
              <div className="p-2.5 bg-amber-50/70 rounded-lg">
                <span className="text-[11px] text-amber-800 block">মোট কাজ</span>
                <span className="text-base font-bold font-mono text-amber-900">{actionTrackerItems.length}</span>
                <span className="text-[10px] text-amber-700 block">টি</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2.5 bg-slate-50 rounded-lg">
                <span className="text-[11px] text-slate-500 block">আমার কাজ</span>
                <span className="text-base font-bold font-mono text-slate-900">{myActionTrackerItems.length}</span>
                <span className="text-[10px] text-slate-400 block">টি</span>
              </div>
              <div className="p-2.5 bg-amber-50/70 rounded-lg">
                <span className="text-[11px] text-amber-800 block">চলমান</span>
                <span className="text-base font-bold font-mono text-amber-900">
                  {myActionTrackerItems.filter((i) => i.status === 'চলমান').length}
                </span>
                <span className="text-[10px] text-amber-700 block">টি</span>
              </div>
              <div className="p-2.5 bg-emerald-50/70 rounded-lg">
                <span className="text-[11px] text-emerald-800 block">সম্পন্ন</span>
                <span className="text-base font-bold font-mono text-emerald-900">
                  {myActionTrackerItems.filter((i) => i.status === 'সম্পন্ন').length}
                </span>
                <span className="text-[10px] text-emerald-700 block">টি</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Annual Calendar & Upcoming Events Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-emerald-800" />
              <h2 className="text-base font-bold text-slate-900">
                বার্ষিক ক্যালেন্ডার ও আসন্ন কার্যক্রম সামারি ({toBnDigits(currentYearPrefix)})
              </h2>
            </div>
            <p className="text-xs text-slate-500 tabular-nums">
              ঘোষিত ছুটি: <strong className="text-slate-700">{toBnDigits(yearHolidayCount)} টি</strong> · একাডেমিক ও পরীক্ষা: <strong className="text-slate-700">{toBnDigits(yearExamAcademicCount)} টি</strong> · মোট কার্যক্রম: <strong className="text-slate-700">{toBnDigits(calendarEvents.length)} টি</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setActiveNav('calendar-policy')}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-800" />
                <span>ছুটির নীতিমালা ও কোটা</span>
              </button>
            )}
            <button
              onClick={() => setActiveNav('calendar')}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>{isAdmin ? 'ক্যালেন্ডার ও ইভেন্ট ম্যানেজ' : 'সম্পূর্ণ ক্যালেন্ডার দেখুন'}</span>
              <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
            </button>
          </div>
        </div>

        {upcomingCalendarEvents.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs bg-slate-50 rounded-lg border border-dashed border-slate-200">
            বর্তমানে আসন্ন কোনো ছুটি, পরীক্ষা বা ইভেন্ট যুক্ত করা হয়নি।
            {isAdmin && ' অ্যাডমিন "বার্ষিক ক্যালেন্ডার" থেকে প্রতিষ্ঠানের বাৎসরিক সূচি যুক্ত করতে পারবেন।'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcomingCalendarEvents.map((ev) => {
              const startDt = parseIsoDateLocal(ev.startDate);
              const todayDt = parseIsoDateLocal(todayStr);
              const diffDays = Math.round((startDt.getTime() - todayDt.getTime()) / (1000 * 60 * 60 * 24));
              const countdownText =
                ev.startDate <= todayStr && ev.endDate >= todayStr
                  ? 'আজ চলমান'
                  : diffDays === 1
                  ? 'আগামীকাল'
                  : `${toBnDigits(diffDays)} দিন পর`;
              const evBn = getBengaliDateInfo(ev.startDate);
              const evHijri = getHijriDateInfo(ev.startDate, institutionalLeavePolicy.hijriOffsetDays || 0);
              const linkedMtg = ev.linkedMeetingId
                ? meetings.find((m) => m.id === ev.linkedMeetingId)
                : undefined;

              return (
                <div
                  key={ev.id}
                  onClick={() => {
                    if (ev.linkedMeetingId) {
                      setFocusedMeetingId(ev.linkedMeetingId);
                      setActiveNav('meetings');
                    } else {
                      setFocusedCalendarDate(ev.startDate);
                      setActiveNav('calendar');
                    }
                  }}
                  className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80 px-2 -mx-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryBadgeStyle(
                          ev.category
                        )}`}
                      >
                        {getCategoryLabelBn(ev.category)}
                      </span>
                      {ev.department && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-200 bg-slate-50 text-slate-700">
                          {ev.department}
                        </span>
                      )}
                      <span className="text-sm font-bold text-slate-900 truncate">{ev.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span className="font-mono text-slate-700 font-semibold">
                        {ev.startDate === ev.endDate ? ev.startDate : `${ev.startDate} → ${ev.endDate}`}
                      </span>
                      {ev.timeLabel && (
                        <>
                          <span>·</span>
                          <span className="font-mono">{ev.timeLabel}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{evBn.formattedShort}</span>
                      <span>·</span>
                      <span>{evHijri.formattedShort}</span>
                      {ev.description && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-xs">{ev.description}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    {linkedMtg && (
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                          linkedMtg.meetingStatus === 'Minutes_Added'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-purple-50 text-purple-900 border-purple-200'
                        }`}
                      >
                        {linkedMtg.meetingStatus === 'Minutes_Added' ? 'মিনিটস সম্পন্ন' : 'মিনিটস বাকি'}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>{countdownText}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Assigned Tasks & Work Submission Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              আমার দায়িত্বপ্রাপ্ত কাজ ও সিদ্ধান্তসমূহ ({myActionTrackerItems.length} টি)
            </h2>
            <p className="text-xs text-slate-500">
              আপনার নামে অর্পিত কাজগুলো নিচে দেওয়া হলো। কাজ শেষে &ldquo;কাজ জমা দিন&rdquo; বাটনে ক্লিক করে জমা দিন।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <GoogleDriveStatusButton isAdmin={isAdmin} />

            {isAdmin && (
              <button
                onClick={() => setActiveNav('action-tracker')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
                <span>সকল কাজ ও নতুন কাজ বরাদ্দ</span>
              </button>
            )}
          </div>
        </div>

        {myActionTrackerItems.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
            বর্তমানে আপনার নামে কোনো কাজ বরাদ্দ নেই।
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myActionTrackerItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:border-emerald-600/50 transition-colors space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-900 text-amber-300 text-xs font-bold font-mono flex items-center justify-center shrink-0">
                        {item.serialNo}
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 leading-snug">
                        {item.title}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-slate-700 shrink-0">
                      ডেডলাইন: {item.deadline}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.description}
                  </p>

                  {(item.submissionReport || (item.submissionFiles && item.submissionFiles.length > 0)) && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-0.5">
                      <div className="font-bold flex items-center gap-1 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>জমা দেওয়া রিপোর্ট ও ফাইল ({item.submittedAt || 'জমাকৃত'}):</span>
                      </div>
                      {item.submissionReport && (
                        <p className="text-[11px] text-slate-700 break-words">{item.submissionReport}</p>
                      )}
                      <SubmissionFilesBadges files={item.submissionFiles} />
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">
                        অবস্থা: <strong>{item.status}</strong>
                      </span>
                      <strong className="font-mono text-slate-900">{item.progressPercentage}%</strong>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-700 h-2 rounded-full transition-all"
                        style={{ width: `${item.progressPercentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200/70 text-xs">
                    <span className="text-slate-500 text-[11px] break-words">
                      {item.latestUpdate ? `আপডেট: ${item.latestUpdate}` : 'কাজ শেষে জমা দিন'}
                    </span>
                    <button
                      onClick={() => handleOpenSubmitModal(item)}
                      className="w-full sm:w-auto justify-center px-3.5 py-2 sm:py-1.5 text-xs font-semibold rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white cursor-pointer flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      <Send className="w-3 h-3 text-amber-300" />
                      <span>কাজ জমা দিন / আপডেট</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Only: Pending Leave Approvals */}
      {isAdmin && pendingLeaves.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              অনুমোদনের অপেক্ষায় থাকা ছুটির আবেদন ({pendingLeaves.length} টি)
            </h3>
            <button
              onClick={() => setActiveNav('leaves')}
              className="text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
            >
              ছুটি ব্যবস্থাপনায় যান →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingLeaves.map((l) => (
              <div
                key={l.id}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="font-bold text-slate-900">{l.employeeName}</div>
                  <div className="text-slate-600">
                    {l.leaveType} · <strong>{l.totalDays} দিন</strong> ({l.startDate} থেকে {l.endDate})
                  </div>
                  <div className="text-slate-500 italic break-words">&ldquo;{l.reason}&rdquo;</div>
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => finalApproveLeave(l.id, 'অনুমোদিত', true)}
                    className="px-3 py-2 sm:py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer text-center"
                  >
                    অনুমোদন
                  </button>
                  <button
                    onClick={() => finalApproveLeave(l.id, 'প্রত্যাখ্যাত', false)}
                    className="px-3 py-2 sm:py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer text-center"
                  >
                    বাতিল
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Work Submission Modal */}
      {submittingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold text-emerald-800">
                  কাজ #{submittingItem.serialNo} · কাজ জমা ও আপডেট
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {submittingItem.title}
                </h3>
              </div>
              <button
                onClick={() => setSubmittingItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  কাজের অগ্রগতি (%): <strong>{progressVal}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressVal}
                  onChange={(e) => setProgressVal(Number(e.target.value))}
                  className="w-full accent-emerald-800 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  কাজ জমা দেওয়ার বিবরণ / রিপোর্ট / ফাইল লিংক
                </label>
                <textarea
                  value={submissionReport}
                  onChange={(e) => setSubmissionReport(e.target.value)}
                  rows={3}
                  placeholder="আপনি যা সম্পন্ন করেছেন তার বিবরণ বা ডকুমেন্ট লিংক এখানে লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-emerald-700"
                />
              </div>

              {/* Direct File Upload to Google Drive */}
              <GoogleDriveFileUploader
                files={submissionFiles}
                onChange={setSubmissionFiles}
                taskSerial={submittingItem.serialNo}
                employeeId={currentUser.id}
                employeeName={currentUser.nameBn || currentUser.name}
              />

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  সংক্ষিপ্ত নোট / সর্বশেষ অবস্থা
                </label>
                <input
                  type="text"
                  value={latestUpdateNote}
                  onChange={(e) => setLatestUpdateNote(e.target.value)}
                  placeholder="যেমন: কাজটি সম্পন্ন করে জমা দেওয়া হলো"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubmittingItem(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer text-center"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={() => handleWorkSubmit(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer text-center"
                >
                  অগ্রগতি সংরক্ষণ
                </button>
                <button
                  type="button"
                  onClick={() => handleWorkSubmit(true)}
                  className="px-4 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5 text-amber-300" />
                  <span>কাজ জমা দিন (১০০% সম্পন্ন)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct One-Tap Camera QR Punch Modal */}
      <QrPunchScannerModal {...scannerProps} />
    </div>
  );
}
