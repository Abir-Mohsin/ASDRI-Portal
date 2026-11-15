'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  Building,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Fingerprint,
  RefreshCw,
  FileText,
  Calendar,
  Layers,
  FileSpreadsheet,
  PlusCircle,
  Download,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';
import { LeaveApplication } from '@/lib/types';
import { exportAttendanceToExcel } from '@/lib/export-utils';

interface InstitutionalWorkspaceProps {
  onOpenCreateMeeting: () => void;
  onOpenCreateNotice: () => void;
  onOpenMachineSync: () => void;
  onOpenAddEmployee: () => void;
}

export function InstitutionalWorkspace({
  onOpenCreateMeeting,
  onOpenCreateNotice,
  onOpenMachineSync,
  onOpenAddEmployee,
}: InstitutionalWorkspaceProps) {
  const {
    currentUser,
    employees,
    attendanceRecords,
    leaveApplications,
    tasks,
    managementToDos,
    meetings,
    simulateMachineSync,
    finalApproveLeave,
    createManagementToDo,
    language,
    setActiveNav,
  } = useApp();

  const isBn = language === 'bn';
  const todayStr = new Date().toISOString().split('T')[0];

  // Daily Stats Calculation
  const totalEmployees = employees.length;
  const presentCount = attendanceRecords.filter((r) => r.date === todayStr && (r.status === 'Present' || r.status === 'Late')).length;
  const lateCount = attendanceRecords.filter((r) => r.date === todayStr && r.status === 'Late').length;
  const absentCount = attendanceRecords.filter((r) => r.date === todayStr && r.status === 'Absent').length;
  const onLeaveCount = attendanceRecords.filter((r) => r.date === todayStr && r.status === 'Leave').length;
  const missingPunchCount = attendanceRecords.filter((r) => r.date === todayStr && r.isMissingPunch).length;

  // Director Pending Final Approvals (Leaves recommended by HOD or direct to Director)
  const pendingDirectorLeaves = leaveApplications.filter(
    (l) => l.status === 'Pending_Director' || l.status === 'Pending_Dept_Head'
  );

  // Sync state
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleSyncClick = () => {
    setSyncing(true);
    setTimeout(() => {
      const res = simulateMachineSync();
      setSyncing(false);
      setSyncResult(
        isBn
          ? `ZKTeco টার্মিনাল সিঙ্ক সম্পন্ন। ${res.newCount} টি প্রস্থান পাঞ্চ যুক্ত হয়েছে।`
          : `Biometric sync completed: ${res.newCount} departure events updated.`
      );
      setTimeout(() => setSyncResult(null), 4000);
    }, 800);
  };

  // Leave approval modal
  const [selectedLeave, setSelectedLeave] = useState<LeaveApplication | null>(null);
  const [directorNote, setDirectorNote] = useState<string>('');

  const handleFinalLeaveAction = (approved: boolean) => {
    if (selectedLeave) {
      finalApproveLeave(selectedLeave.id, directorNote || (approved ? 'Sanctioned' : 'Rejected'), approved);
      setSelectedLeave(null);
      setDirectorNote('');
    }
  };

  // Quick Management To-Do Creation
  const [showAddMgtTodo, setShowAddMgtTodo] = useState<boolean>(false);
  const [mgtTitle, setMgtTitle] = useState<string>('');
  const [mgtDesc, setMgtDesc] = useState<string>('');
  const [mgtDept, setMgtDept] = useState<string>('All Departments');
  const [mgtLead, setMgtLead] = useState<string>(currentUser.nameBn || currentUser.name || '');
  const [mgtDeadline, setMgtDeadline] = useState<string>('2026-11-30');
  const [mgtPriority, setMgtPriority] = useState<'Urgent' | 'High' | 'Routine'>('High');
  const [mgtGoal, setMgtGoal] = useState<string>('Institutional Governance & Quality');

  const handleCreateMgtTodoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mgtTitle) {
      createManagementToDo({
        title: mgtTitle,
        description: mgtDesc,
        targetDepartment: mgtDept,
        leadPerson: mgtLead,
        priority: mgtPriority,
        deadline: mgtDeadline,
        status: 'In Progress',
        strategicGoal: mgtGoal,
        publishedBy: currentUser.name,
      });
      setShowAddMgtTodo(false);
      setMgtTitle('');
      setMgtDesc('');
    }
  };

  return (
    <div className="space-y-8">
      {/* Executive Command Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-400">
              <span>{isBn ? 'প্রাতিষ্ঠানিক নিয়ন্ত্রণ ওয়ার্কস্পেস' : 'Institutional Workspace'}</span>
              <span aria-hidden="true">·</span>
              <span>Director & Executive Management</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isBn ? 'সেন্ট্রাল অ্যাডমিনিস্ট্রেটিভ ড্যাশবোর্ড' : 'Central Institutional Governance'}
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              {isBn
                ? 'এএসডিআরআই পলিটেকনিকের সকল শিক্ষক ও স্টাফের রিয়েল-টাইম বায়োমেট্রিক উপস্থিতি, ছুটির চূড়ান্ত অনুমোদন, প্রাতিষ্ঠানিক টু-ডু ও মাসিক রিপোর্ট তদারকি করুন।'
                : 'Real-time institutional oversight across biometric terminals, administrative directives, leave sanctions, and automated monthly reporting.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSyncClick}
              disabled={syncing}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{isBn ? 'বায়োমেট্রিক মেশিন সিঙ্ক' : 'Sync Biometrics'}</span>
            </button>

            <button
              onClick={() => exportAttendanceToExcel(attendanceRecords, employees, 'Today_Summary')}
              className="px-4 py-2.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-700" />
              <span>{isBn ? 'আজকের এক্সেল রিপোর্ট' : 'Export Excel'}</span>
            </button>
          </div>
        </div>

        {syncResult && (
          <div className="mt-4 p-3 bg-teal-950/80 border border-teal-500/50 rounded-lg text-xs text-teal-200">
            {syncResult}
          </div>
        )}

        {/* Real-time Institutional KPI Matrix */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-6 border-t border-slate-800">
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="text-[11px] text-slate-400 block uppercase font-medium">{isBn ? 'মোট জনবল' : 'Total Staff'}</span>
            <span className="text-2xl font-bold text-white tabular-nums mt-0.5 block">{totalEmployees}</span>
            <span className="text-[10px] text-slate-400">100% Registered</span>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="text-[11px] text-slate-400 block uppercase font-medium">{isBn ? 'আজকে উপস্থিত' : 'Present'}</span>
            <span className="text-2xl font-bold text-emerald-400 tabular-nums mt-0.5 block">{presentCount}</span>
            <span className="text-[10px] text-emerald-400/80">
              {Math.round((presentCount / (totalEmployees || 1)) * 100)}% attendance
            </span>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="text-[11px] text-slate-400 block uppercase font-medium">{isBn ? 'দেরিতে আগমন' : 'Late Arrival'}</span>
            <span className="text-2xl font-bold text-amber-400 tabular-nums mt-0.5 block">{lateCount}</span>
            <span className="text-[10px] text-slate-400">Grace: 15 mins</span>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="text-[11px] text-slate-400 block uppercase font-medium">{isBn ? 'অনুমোদিত ছুটি' : 'On Leave'}</span>
            <span className="text-2xl font-bold text-blue-400 tabular-nums mt-0.5 block">{onLeaveCount}</span>
            <span className="text-[10px] text-blue-300">Sanctioned</span>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="text-[11px] text-slate-400 block uppercase font-medium">{isBn ? 'অনুপস্থিত' : 'Absent'}</span>
            <span className="text-2xl font-bold text-rose-400 tabular-nums mt-0.5 block">{absentCount}</span>
            <span className="text-[10px] text-rose-300">Uninformed</span>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <span className="text-[11px] text-slate-400 block uppercase font-medium">{isBn ? 'মিসিং পাঞ্চ' : 'Missing Punch'}</span>
            <span className="text-2xl font-bold text-purple-400 tabular-nums mt-0.5 block">{missingPunchCount}</span>
            <span className="text-[10px] text-purple-300">Requires correction</span>
          </div>
        </div>
      </div>

      {/* Grid: Biometric Machine Status & Director Leave Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Biometric Terminals Status Console */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {isBn ? 'বায়োমেট্রিক ডিভাইস ও সিঙ্ক স্ট্যাটাস' : 'Biometric Machine Terminals'}
              </h2>
            </div>
            <button
              onClick={onOpenMachineSync}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium cursor-pointer"
            >
              {isBn ? 'মেশিন কনসোল' : 'Integration Details'}
            </button>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-900 dark:text-white text-xs">
                    ZKTeco MB460 (Main Gate 01)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  IP: 192.168.1.201 · Port 4370 · Protocol: Push/ADMS
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                Online & Synced
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-900 dark:text-white text-xs">
                    FaceCam AI Terminal 400 (Executive Wing)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  IP: 192.168.1.202 · Face Recognition + Body Temp
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                Online & Synced
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-slate-900 dark:text-white text-xs">
                    ZKTeco RFID Card Station (Computer & Power Lab)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  IP: 192.168.1.203 · RFID Proximity Card Reader
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                Online & Synced
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Auto Sync Interval: 15 Mins</span>
            <button
              onClick={handleSyncClick}
              className="text-teal-600 hover:text-teal-700 font-semibold cursor-pointer"
            >
              {isBn ? 'ম্যানুয়াল সিঙ্ক চালান' : 'Run Immediate Sync'}
            </button>
          </div>
        </div>

        {/* Director Final Leave Sanction Queue */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {isBn ? 'ছুটির চূড়ান্ত প্রশাসনিক অনুমোদন কিউ' : 'Director Leave Sanction Queue'}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {pendingDirectorLeaves.length} {isBn ? 'টি বিবেচনাধীন' : 'pending'}
            </span>
          </div>

          {pendingDirectorLeaves.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              {isBn ? 'বর্তমানে কোনো ছুটির আবেদন পরিচালকের অনুমোদনের অপেক্ষায় নেই।' : 'No leave applications awaiting executive sanction.'}
            </div>
          ) : (
            <div className="space-y-3">
              {pendingDirectorLeaves.map((l) => (
                <div
                  key={l.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11px] text-amber-600 font-semibold">{l.id}</span>
                      <h4 className="font-semibold text-slate-900 dark:text-white mt-0.5">
                        {l.employeeName} ({l.department})
                      </h4>
                      <p className="text-slate-500 mt-0.5">
                        {l.leaveType} · <strong>{l.totalDays} days</strong> ({l.startDate} to {l.endDate})
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {l.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                    &ldquo;{l.reason}&rdquo;
                  </p>

                  {l.deptHeadRemarks && (
                    <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                      <strong>HOD Recommendation:</strong> {l.deptHeadRemarks}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedLeave(l);
                        setDirectorNote('Sanctioned as recommended');
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                    >
                      {isBn ? 'অনুমোদন বা প্রত্যাখ্যান' : 'Review & Sanction'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Institutional Management To-Do Directives Section (SRS Section 8) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isBn ? 'ম্যানেজমেন্ট টু-ডু (প্রাতিষ্ঠানিক কৌশলগত লক্ষ্যমাত্রা)' : 'Institutional Management Directives'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn
                ? 'পরিচালক ও ব্যবস্থাপনা কর্তৃক প্রকাশিত সর্বোচ্চ প্রাতিষ্ঠানিক এজেন্ডা। সাধারণ স্টাফদের প্রোফাইলে এটি Read Only হিসেবে প্রদর্শিত হয়।'
                : 'Strategic organizational directives published by the Executive Office. Enforced as Read-Only for staff; full edit for Director.'}
            </p>
          </div>

          <button
            onClick={() => setShowAddMgtTodo(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isBn ? 'নতুন প্রাতিষ্ঠানিক টু-ডু যোগ করুন' : 'Add Strategic Directive'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {managementToDos.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-teal-600">{item.id}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      item.priority === 'Urgent'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                    }`}
                  >
                    {item.priority}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 dark:text-white text-sm mt-1.5 line-clamp-2">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-3">
                  {item.description}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] space-y-1 text-slate-500">
                <div className="flex justify-between">
                  <span>Target Dept:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.targetDepartment}</span>
                </div>
                <div className="flex justify-between">
                  <span>Lead Person:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.leadPerson}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deadline:</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{item.deadline}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decision-to-Task Pipeline Overview */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'মিটিংয়ের সিদ্ধান্ত থেকে টাস্ক রূপান্তর ও বাস্তবায়ন' : 'Meeting Decisions to Task Pipeline'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn
                ? 'অ্যাকাডেমিক কাউন্সিল ও বিভাগীয় মিটিংয়ের সিদ্ধান্তের শতভাগ বাস্তবায়ন ট্র্যাকিং।'
                : 'Instant traceability from boardroom resolutions to employee task completion.'}
            </p>
          </div>
          <button
            onClick={() => setActiveNav('meetings')}
            className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
          >
            {isBn ? 'সকল মিটিং ও মিনিটস দেখুন' : 'View Meetings & Minutes'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Meeting</th>
                <th className="py-2.5 px-3">Decision Resolution</th>
                <th className="py-2.5 px-3">Assigned Person</th>
                <th className="py-2.5 px-3">Deadline</th>
                <th className="py-2.5 px-3">Task Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {meetings.flatMap((m) =>
                m.finalDecisions.map((d) => {
                  const task = tasks.find((t) => t.id === d.convertedToTaskId);
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-medium text-slate-900 dark:text-white">
                        {m.title}
                        <div className="text-[10px] text-slate-400">{m.date}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 dark:text-slate-300 max-w-md">
                        {d.decisionText}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {d.assignedEmployeeName}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {d.deadline}
                      </td>
                      <td className="py-3 px-3">
                        {task ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              task.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                            }`}
                          >
                            {task.status} ({task.progressPercentage}%)
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            Not Converted Yet
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leave Approval Modal */}
      {selectedLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'ছুটির চূড়ান্ত প্রশাসনিক মঞ্জুরি / নাকচ' : 'Executive Leave Sanction'}
            </h3>
            <p className="text-xs text-slate-500">
              {selectedLeave.employeeName} · {selectedLeave.department}
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs space-y-1.5">
              <div><strong>Type:</strong> {selectedLeave.leaveType} ({selectedLeave.totalDays} days)</div>
              <div><strong>Duration:</strong> {selectedLeave.startDate} to {selectedLeave.endDate}</div>
              <div><strong>Reason:</strong> {selectedLeave.reason}</div>
              <div><strong>HOD Recommendation:</strong> {selectedLeave.deptHeadRemarks || 'Direct application'}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isBn ? 'পরিচালকের মন্তব্য / শর্ত' : 'Director Remarks / Order'}
              </label>
              <textarea
                value={directorNote}
                onChange={(e) => setDirectorNote(e.target.value)}
                rows={2}
                placeholder="Leave sanctioned. Please keep emergency phone active."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedLeave(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleFinalLeaveAction(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                {isBn ? 'ছুটি প্রত্যাখ্যান' : 'Decline Leave'}
              </button>
              <button
                type="button"
                onClick={() => handleFinalLeaveAction(true)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                {isBn ? 'চূড়ান্ত অনুমোদন' : 'Sanction Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Management Directive Modal */}
      {showAddMgtTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'নতুন প্রাতিষ্ঠানিক ম্যানেজমেন্ট টু-ডু তৈরি' : 'Publish Institutional Directive'}
            </h3>
            <p className="text-xs text-slate-500">
              {isBn
                ? 'এই কৌশলগত কাজটি প্রতিষ্ঠানের সকল শিক্ষক ও কর্মকর্তার টু-ডু লিস্টে Read Only হিসেবে যুক্ত হবে।'
                : 'This directive will be published across all employee profiles in Read-Only mode.'}
            </p>

            <form onSubmit={handleCreateMgtTodoSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Directive Title
                </label>
                <input
                  type="text"
                  required
                  value={mgtTitle}
                  onChange={(e) => setMgtTitle(e.target.value)}
                  placeholder="e.g. ISO 9001 Institutional Audit Readiness"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description & Roadmap
                </label>
                <textarea
                  required
                  rows={3}
                  value={mgtDesc}
                  onChange={(e) => setMgtDesc(e.target.value)}
                  placeholder="Detailed goals, key results, and administrative scope..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Target Department
                  </label>
                  <input
                    type="text"
                    value={mgtDept}
                    onChange={(e) => setMgtDept(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lead Authority
                  </label>
                  <input
                    type="text"
                    value={mgtLead}
                    onChange={(e) => setMgtLead(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={mgtDeadline}
                    onChange={(e) => setMgtDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={mgtPriority}
                    onChange={(e) => setMgtPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Routine">Routine</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddMgtTodo(false)}
                  className="px-3 py-1.5 font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Publish Directive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
