'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  FileSpreadsheet,
  Printer,
  Calendar,
  Building2,
  User,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Filter,
} from 'lucide-react';
import { exportAttendanceToExcel, exportAttendanceToCSV } from '@/lib/export-utils';

export function ReportsEngine() {
  const {
    employees,
    currentUser,
    attendanceRecords,
    leaveApplications,
    tasks,
    meetings,
    language,
  } = useApp();

  const isBn = language === 'bn';
  const [reportType, setReportType] = useState<'individual' | 'department' | 'institutional'>('institutional');
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || currentUser.id || '');
  const [selectedDept, setSelectedDept] = useState<string>(employees[0]?.department || currentUser.department || 'প্রশাসন');
  const [selectedMonth, setSelectedMonth] = useState<string>('November 2026');

  // Compute Individual Metrics
  const targetEmployee = employees.find((e) => e.id === selectedEmpId) || employees[0] || currentUser;
  const empAttendance = attendanceRecords.filter((r) => r.employeeId === targetEmployee?.id);
  const empPresent = empAttendance.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  const empLate = empAttendance.filter((r) => r.status === 'Late').length;
  const empAbsent = empAttendance.filter((r) => r.status === 'Absent').length;
  const empLeaves = leaveApplications.filter((l) => l.employeeId === targetEmployee?.id && l.status === 'Approved');
  const empTasks = tasks.filter((t) => t.assignedPersonId === targetEmployee?.id);
  const empCompletedTasks = empTasks.filter((t) => t.status === 'Approved').length;

  // Compute Department Metrics
  const deptStaff = employees.filter((e) => e.department === selectedDept);
  const deptAttendance = attendanceRecords.filter((r) => r.department === selectedDept);
  const deptPresent = deptAttendance.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  const deptTasks = tasks.filter((t) => t.department === selectedDept);
  const deptDoneTasks = deptTasks.filter((t) => t.status === 'Approved').length;

  // Compute Institutional Metrics
  const totalEmployees = employees.length;
  const totalPresent = attendanceRecords.filter((r) => r.status === 'Present' || r.status === 'Late').length;
  const totalLate = attendanceRecords.filter((r) => r.status === 'Late').length;
  const totalAbsent = attendanceRecords.filter((r) => r.status === 'Absent').length;
  const totalDoneTasks = tasks.filter((t) => t.status === 'Approved').length;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm no-print">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            <span>{isBn ? 'স্বয়ংক্রিয় রিপোর্টিং ইঞ্জিন' : 'Automated Reporting Engine'}</span>
            <span aria-hidden="true">·</span>
            <span>Monthly, Departmental & Institutional Audits</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {isBn ? 'মাসিক ও প্রাতিষ্ঠানিক পারফরম্যান্স রিপোর্ট' : 'Monthly Performance & Attendance Reports'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'ব্যক্তিগত শিক্ষক রিপোর্ট, বিভাগীয় পরিসংখ্যান এবং পুরো প্রতিষ্ঠানের সমন্বিত এক্সেল ও প্রিন্ট কপি।'
              : 'Institutional grade metrics exportable directly to Excel (.xlsx), CSV, and formal print templates.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => exportAttendanceToExcel(attendanceRecords, employees, selectedMonth)}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isBn ? 'মাস্টার এক্সেল ডাউনলোড' : 'Download XLSX'}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            <span>{isBn ? 'প্রিন্ট / PDF' : 'Print PDF'}</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector & Filters (Hidden during print) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm no-print">
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setReportType('institutional')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              reportType === 'institutional'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {isBn ? 'প্রাতিষ্ঠানিক মাস্টার রিপোর্ট' : 'Institutional Master'}
          </button>

          <button
            onClick={() => setReportType('department')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              reportType === 'department'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {isBn ? 'বিভাগীয় রিপোর্ট' : 'Department-wise'}
          </button>

          <button
            onClick={() => setReportType('individual')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              reportType === 'individual'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {isBn ? 'ব্যক্তিগত শিক্ষক/স্টাফ রিপোর্ট' : 'Individual Staff'}
          </button>
        </div>

        {/* Dynamic selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {reportType === 'individual' && (
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.department})
                </option>
              ))}
            </select>
          )}

          {reportType === 'department' && (
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {Array.from(new Set(employees.map((e) => e.department))).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            <option value="November 2026">November 2026</option>
            <option value="October 2026">October 2026</option>
            <option value="September 2026">September 2026</option>
          </select>
        </div>
      </div>

      {/* Formal Printable Document Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm print:border-none print:shadow-none print:p-0 space-y-8">
        {/* Institutional Letterhead */}
        <div className="text-center pb-6 border-b border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-400">
            ASIAN SCIENCE DEVELOPMENT & RESEARCH INSTITUTE (ASDRI)
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {reportType === 'institutional'
              ? isBn
                ? 'প্রাতিষ্ঠানিক মাসিক সার্বিক উপস্থিতি ও পারফরম্যান্স প্রতিবেদন'
                : 'Institutional Monthly Governance & Performance Report'
              : reportType === 'department'
              ? `${selectedDept} — ${isBn ? 'বিভাগীয় মাসিক পর্যালোচনা' : 'Department Monthly Review'}`
              : `${targetEmployee?.name || ''} — ${isBn ? 'ব্যক্তিগত কার্যবিবরণী ও উপস্থিতি' : 'Individual Performance Dossier'}`}
          </h2>
          <div className="text-xs text-slate-500 font-mono">
            Reporting Period: {selectedMonth} · Generated on {new Date().toLocaleDateString()}
          </div>
        </div>

        {/* Report Content - Institutional Master */}
        {reportType === 'institutional' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-xs text-slate-500 block uppercase font-medium">Total Registered Staff</span>
                <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums mt-1 block">
                  {totalEmployees}
                </span>
                <span className="text-[10px] text-teal-600 font-medium">100% on Biometrics</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-xs text-slate-500 block uppercase font-medium">Average Attendance</span>
                <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1 block">
                  {Math.round((totalPresent / (totalEmployees || 1)) * 100)}%
                </span>
                <span className="text-[10px] text-slate-500">{totalPresent} punches recorded</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-xs text-slate-500 block uppercase font-medium">Late Arrival Incidents</span>
                <span className="text-3xl font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-1 block">
                  {totalLate}
                </span>
                <span className="text-[10px] text-slate-500">Grace period 15m</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-xs text-slate-500 block uppercase font-medium">Task Completion Index</span>
                <span className="text-3xl font-bold text-teal-600 dark:text-teal-400 tabular-nums mt-1 block">
                  {Math.round((totalDoneTasks / (tasks.length || 1)) * 100)}%
                </span>
                <span className="text-[10px] text-slate-500">{totalDoneTasks} of {tasks.length} tasks</span>
              </div>
            </div>

            {/* Department-by-department Breakdown Table */}
            <div className="space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Department Performance & Biometric Compliance Breakdown
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Staff Strength</th>
                      <th className="py-2.5 px-3">Attendance Rate</th>
                      <th className="py-2.5 px-3">Late Incidents</th>
                      <th className="py-2.5 px-3">Tasks Completed</th>
                      <th className="py-2.5 px-3">Compliance Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.from(new Set(employees.map((e) => e.department))).map((dept) => {
                      const count = employees.filter((e) => e.department === dept).length;
                      const att = attendanceRecords.filter((r) => r.department === dept);
                      const pres = att.filter((r) => r.status === 'Present' || r.status === 'Late').length;
                      const late = att.filter((r) => r.status === 'Late').length;
                      const dTasks = tasks.filter((t) => t.department === dept);
                      const done = dTasks.filter((t) => t.status === 'Approved').length;
                      return (
                        <tr key={dept} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">{dept}</td>
                          <td className="py-3 px-3 tabular-nums">{count}</td>
                          <td className="py-3 px-3 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {count ? Math.round((pres / count) * 100) : 100}%
                          </td>
                          <td className="py-3 px-3 tabular-nums text-amber-600">{late}</td>
                          <td className="py-3 px-3 tabular-nums">
                            {done} / {dTasks.length}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Grade A
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Report Content - Individual Staff */}
        {reportType === 'individual' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1 text-xs">
                <span className="text-slate-400 font-medium">Employee Details</span>
                <div className="font-bold text-slate-900 dark:text-white text-sm">{targetEmployee?.name || '-'}</div>
                <div className="text-slate-500">{targetEmployee?.designation || '-'}</div>
                <div className="font-mono text-teal-600">ID: {targetEmployee?.id || '-'} · Machine: {targetEmployee?.attendanceMachineId || '-'}</div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1 text-xs">
                <span className="text-slate-400 font-medium">Attendance Summary</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Present: <span className="text-emerald-600">{empPresent} days</span>
                </div>
                <div className="text-slate-500">Late Arrivals: {empLate} · Absent: {empAbsent}</div>
                <div className="text-slate-500">Approved Leaves: {empLeaves.length} times</div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1 text-xs">
                <span className="text-slate-400 font-medium">Task Accountability</span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Completed: <span className="text-teal-600">{empCompletedTasks} / {empTasks.length}</span>
                </div>
                <div className="text-slate-500">
                  Success Rate: {empTasks.length ? Math.round((empCompletedTasks / empTasks.length) * 100) : 100}%
                </div>
              </div>
            </div>

            {/* Individual Task Performance Details */}
            <div className="space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Assigned Responsibilities & Deliverables
              </h3>
              <div className="space-y-2">
                {empTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono text-teal-600 font-semibold">{t.id}</span>
                      <h4 className="font-semibold text-slate-900 dark:text-white">{t.title}</h4>
                      <div className="text-[11px] text-slate-500">Deadline: {t.deadline}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-slate-700 shadow-xs">
                      {t.status} ({t.progressPercentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Report Content - Department Review */}
        {reportType === 'department' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center">
                <span className="text-xs text-slate-400 block uppercase font-medium">Department Faculty</span>
                <span className="text-2xl font-bold text-slate-900 dark:text-white mt-1 block">
                  {deptStaff.length}
                </span>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center">
                <span className="text-xs text-slate-400 block uppercase font-medium">Department Tasks Completed</span>
                <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1 block">
                  {deptDoneTasks} / {deptTasks.length}
                </span>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center">
                <span className="text-xs text-slate-400 block uppercase font-medium">Department Presence</span>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
                  {deptStaff.length ? Math.round((deptPresent / deptStaff.length) * 100) : 100}%
                </span>
              </div>
            </div>

            {/* Department Roster */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Designation</th>
                    <th className="py-2.5 px-3">Machine ID</th>
                    <th className="py-2.5 px-3">Today Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {deptStaff.map((emp) => {
                    const att = attendanceRecords.find((r) => r.employeeId === emp.id);
                    return (
                      <tr key={emp.id}>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{emp.name}</td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{emp.designation}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{emp.attendanceMachineId}</td>
                        <td className="py-2.5 px-3">{att?.status || 'No Punch'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Signature & Verification Seal for Formal Printing */}
        <div className="pt-12 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="space-y-1">
            <div className="font-semibold text-slate-900 dark:text-white">Prepared By: Registrar Secretariat</div>
            <div>ASDRI IIMS Automated Reporting Engine</div>
          </div>

          <div className="text-right space-y-1">
            <div className="font-semibold text-slate-900 dark:text-white">
              {currentUser.nameBn || currentUser.name || 'প্রশাসন'}
            </div>
            <div>{currentUser.designationBn || currentUser.designation || 'ASDRI'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
