'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  ShieldCheck,
  Clock,
  Calendar,
  Users,
  Settings,
  Sliders,
  CheckCircle2,
  RefreshCw,
  FileCheck,
  AlertTriangle,
  UserCheck,
  Key,
  Layers,
  Database,
  Building,
} from 'lucide-react';
import { AttendancePolicyConfig, Department, Role, getRoleLabel } from '@/lib/types';

export function AdminControlCenter() {
  const {
    policy,
    updatePolicy,
    employees,
    updateEmployee,
    currentUser,
    logAudit,
    language,
    simulateMachineSync,
  } = useApp();

  const isBn = language === 'bn';
  const [activeTab, setActiveTab] = useState<'policy' | 'roles' | 'sync' | 'departments'>('policy');

  // Policy Form State
  const [officeStartTime, setOfficeStartTime] = useState(policy.officeStartTime);
  const [officeEndTime, setOfficeEndTime] = useState(policy.officeEndTime);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(policy.gracePeriodMinutes);
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(policy.lateThresholdMinutes);
  const [earlyLeaveThresholdMinutes, setEarlyLeaveThresholdMinutes] = useState(policy.earlyLeaveThresholdMinutes);
  const [breakDurationMinutes, setBreakDurationMinutes] = useState(policy.breakDurationMinutes);
  const [weeklyHolidays, setWeeklyHolidays] = useState<string[]>(policy.weeklyHolidays);
  const [policySaved, setPolicySaved] = useState(false);

  // Role Management State
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id || currentUser.id || '');
  const [targetRole, setTargetRole] = useState<Role>(employees[0]?.role || 'teacher');
  const [roleSaved, setRoleSaved] = useState(false);

  // Sync test state
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSavePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    updatePolicy({
      officeStartTime,
      officeEndTime,
      gracePeriodMinutes: Number(gracePeriodMinutes),
      lateThresholdMinutes: Number(lateThresholdMinutes),
      earlyLeaveThresholdMinutes: Number(earlyLeaveThresholdMinutes),
      breakDurationMinutes: Number(breakDurationMinutes),
      weeklyHolidays,
    });
    logAudit('UPDATE_POLICY', 'System', `Attendance policy updated by Admin ${currentUser.name}`);
    setPolicySaved(true);
    setTimeout(() => setPolicySaved(false), 3000);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    updateEmployee(selectedEmpId, { role: targetRole });
    const emp = employees.find((x) => x.id === selectedEmpId);
    logAudit('ROLE_CHANGE', 'Employee', `Role of ${emp?.name} (${selectedEmpId}) changed to ${targetRole} by Admin`);
    setRoleSaved(true);
    setTimeout(() => setRoleSaved(false), 3000);
  };

  const handleTriggerSync = () => {
    const res = simulateMachineSync();
    setSyncStatus(
      isBn
        ? `বায়োমেট্রিক মেশিন সফলভাবে সিঙ্ক হয়েছে! ${res.newCount} টি নতুন পাঞ্চ রেকর্ড প্রসেস করা হয়েছে।`
        : `Machine sync completed successfully! ${res.newCount} new punches recorded.`
    );
    setTimeout(() => setSyncStatus(null), 5000);
  };

  const daysOfWeek = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
  const allRoles: Role[] = [
    'director',
    'deputy_director',
    'assistant_director',
    'admin_incharge',
    'coordinator',
    'dept_head',
    'teacher',
    'staff',
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>{isBn ? 'সেন্ট্রাল এডমিন কন্ট্রোল সেন্টার' : 'Master Admin Control Center'}</span>
            <span aria-hidden="true">·</span>
            <span>Supervisory Governance</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {isBn ? 'প্রাতিষ্ঠানিক সেটিংস ও পলিসি কন্ট্রোল' : 'Institutional Rules & Permission Controls'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isBn
              ? 'এখান থেকে এডমিন অফিসের সময়সূচী, গ্রেস পিরিয়ড, লেট রুলস, সাপ্তাহিক ছুটি এবং যেকোনো কর্মীর পদমর্যাদা ও ভূমিকা (Role) সরাসরি পরিবর্তন করতে পারেন।'
              : 'Directly modify institutional shifts, grace periods, biometric sync intervals, and staff RBAC roles.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerSync}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer flex items-center gap-2 shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isBn ? 'তাত্ক্ষণিক বায়োমেট্রিক সিঙ্ক' : 'Sync Biometrics Now'}</span>
          </button>
        </div>
      </div>

      {syncStatus && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* Control Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl max-w-fit">
        <button
          onClick={() => setActiveTab('policy')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'policy'
              ? 'bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{isBn ? 'অফিস সময় ও লেট পলিসি' : 'Office Shift & Late Rules'}</span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'roles'
              ? 'bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>{isBn ? 'কর্মীদের ভূমিকা ও রোল কন্ট্রোল' : 'Role Permissions (RBAC)'}</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'sync'
              ? 'bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>{isBn ? 'মেশিন কানেকশন ও সিঙ্ক' : 'Biometric Machine Sync'}</span>
        </button>

        <button
          onClick={() => setActiveTab('departments')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'departments'
              ? 'bg-white dark:bg-slate-900 text-emerald-900 dark:text-emerald-300 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>{isBn ? 'দায়িত্ব অর্পণ ও ডেলিগেশন নিয়ম' : 'Task Delegation Rules'}</span>
        </button>
      </div>

      {/* Tab 1: Office Timing & Late Policy */}
      {activeTab === 'policy' && (
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'অফিস শিডিউল ও উপস্থিতি বিধিমালার কনফিগারেশন' : 'Office Timings & Attendance Rule Matrix'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn
                ? 'এখানে পরিবর্তন করলে সকল কর্মীর দৈনিক উপস্থিতি গণনায় স্বয়ংক্রিয়ভাবে নতুন নিয়ম কার্যকর হবে।'
                : 'Updates here immediately govern automated daily muster roll calculations.'}
            </p>
          </div>

          {policySaved && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{isBn ? 'পলিসি সফলভাবে আপডেট ও সেভ করা হয়েছে!' : 'Policy updated successfully!'}</span>
            </div>
          )}

          <form onSubmit={handleSavePolicy} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Start Time */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isBn ? 'অফিস শুরুর সময় (ইন টাইম)' : 'Office Start Time'}
                </label>
                <input
                  type="time"
                  value={officeStartTime}
                  onChange={(e) => setOfficeStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {/* End Time */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isBn ? 'অফিস ছুটির সময় (আউট টাইম)' : 'Office End Time'}
                </label>
                <input
                  type="time"
                  value={officeEndTime}
                  onChange={(e) => setOfficeEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {/* Grace Period */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isBn ? 'গ্রেস পিরিয়ড (মিনিট)' : 'Grace Period (Minutes)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={gracePeriodMinutes}
                  onChange={(e) => setGracePeriodMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-400">
                  {isBn ? 'নির্ধারিত সময়ের পর এত মিনিট পর্যন্ত লেট গণনা হবে না।' : 'Attendance within grace is marked Present.'}
                </p>
              </div>

              {/* Late Threshold */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isBn ? 'লেট থ্রেশহোল্ড (মিনিট)' : 'Late Threshold (Minutes)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={lateThresholdMinutes}
                  onChange={(e) => setLateThresholdMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-400">
                  {isBn ? 'গ্রেস পেরোনোর পর এত মিনিটের মধ্যে আসলে লেট হিসেবে গণ্য হবে।' : 'Minutes after shift start considered Late.'}
                </p>
              </div>

              {/* Early Leave Threshold */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isBn ? 'আর্লি লিভ ছাড় (মিনিট)' : 'Early Leave Threshold'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={earlyLeaveThresholdMinutes}
                  onChange={(e) => setEarlyLeaveThresholdMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {/* Break Duration */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isBn ? 'নামাজ ও দুপুরের বিরতি (মিনিট)' : 'Lunch & Prayer Break (Minutes)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={breakDurationMinutes}
                  onChange={(e) => setBreakDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Weekly Holidays Selection */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isBn ? 'সাপ্তাহিক সরকারি ছুটির দিনসমূহ' : 'Weekly Holidays'}
              </label>
              <div className="flex flex-wrap gap-2">
                {daysOfWeek.map((day) => {
                  const isSelected = weeklyHolidays.includes(day);
                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => {
                        if (isSelected) {
                          setWeeklyHolidays(weeklyHolidays.filter((d) => d !== day));
                        } else {
                          setWeeklyHolidays([...weeklyHolidays, day]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {day} {isSelected && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
                <span>{isBn ? 'পলিসি সংরক্ষণ ও কার্যকর করুন' : 'Save & Enforce Policy'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: User Roles & RBAC Modification */}
      {activeTab === 'roles' && (
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'কর্মীদের পদমর্যাদা ও ভূমিকা (Role Permission) পরিবর্তন' : 'Assign & Elevate User Roles (RBAC)'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn
                ? 'এডমিন যেকোনো কর্মীর পদ বা পারমিশন রোল পরিবর্তন করতে পারেন। যেমন শিক্ষককে কো-অর্ডিনেটর বা এডমিন বানাতে পারেন।'
                : 'Promote or restrict any staff member across Director, Admin In-charge, Coordinator, or Teacher roles.'}
            </p>
          </div>

          {roleSaved && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{isBn ? 'কর্মীর রোল সফলভাবে পরিবর্তন করা হয়েছে!' : 'User role updated successfully!'}</span>
            </div>
          )}

          <form onSubmit={handleSaveRole} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {isBn ? 'কর্মী নির্বাচন করুন' : 'Select Employee'}
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => {
                    setSelectedEmpId(e.target.value);
                    const emp = employees.find((x) => x.id === e.target.value);
                    if (emp) setTargetRole(emp.role);
                  }}
                  className="w-full px-3 py-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.designation} ({emp.id}) [{getRoleLabel(emp.role, isBn)}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {isBn ? 'নতুন নির্ধারিত ভূমিকা (Assigned Role)' : 'Assigned Role'}
                </label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as Role)}
                  className="w-full px-3 py-2.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {allRoles.map((r) => (
                    <option key={r} value={r}>
                      {getRoleLabel(r, isBn)} ({r})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <Key className="w-4 h-4 text-amber-400" />
                <span>{isBn ? 'রোল আপডেট ও অনুমোদন করুন' : 'Apply Role Update'}</span>
              </button>
            </div>

            {/* Role explanation panel */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {isBn ? 'রোল অনুযায়ী নিয়ন্ত্রণ ব্যবস্থা (RBAC Scope)' : 'Role Permission Matrix'}
              </h3>
              <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <span><strong>Director & Leadership:</strong> সম্পূর্ণ ইনস্টিটিউটের নিয়ন্ত্রণ, মাস্টার রিপোর্ট, ছুটি মঞ্জুর ও পলিসি পরিবর্তন।</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                  <span><strong>Admin In-charge:</strong> বায়োমেট্রিক মেশিন সিঙ্ক, উপস্থিতি সংশোধন নিরীক্ষা, মেমো ও নোটিশ প্রকাশ।</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                  <span><strong>Coordinator / HOD:</strong> নিজ বিভাগের শিক্ষকদের কাজ বণ্টন, মিটিং মিনিট ও ছুটির সুপারিশ।</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                  <span><strong>Teacher & Staff:</strong> সম্পূর্ণ ব্যক্তিগত কার্যক্ষেত্র। কোনো প্রশাসনিক বা অন্যের তথ্য দেখতে পারবেন না।</span>
                </li>
              </ul>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Biometric Machine Status */}
      {activeTab === 'sync' && (
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'বায়োমেট্রিক ডিভাইস ও কানেক্টিভিটি নিয়ন্ত্রণ' : 'Biometric Device Fleet Management'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn
                ? 'ক্যাম্পাসে সংযুক্ত ZKTeco ও বায়োমেট্রিক টার্মিনালগুলোর রিয়েল-টাইম স্ট্যাটাস ও লগ সিঙ্ক পলিসি।'
                : 'Real-time terminal polling status, IP bindings, and log processing heartbeat.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">ZKTECO-MAIN-GATE</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  ONLINE
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">IP: 192.168.1.201 · Port 4370</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">প্রধান একাডেমিক ভবন প্রবেশদ্বার</div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">ZKTECO-FACULTY-02</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  ONLINE
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">IP: 192.168.1.202 · Port 4370</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">শিক্ষক ও অনুষদ লাউঞ্জ</div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">ZKTECO-LAB-BLOCK</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  ONLINE
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">IP: 192.168.1.203 · Port 4370</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">কম্পিউটার ও ইলেকট্রনিক্স ল্যাব ব্লক</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Task Delegation & Management To-Do Rules */}
      {activeTab === 'departments' && (
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'শিক্ষক ও স্টাফদের দায়িত্ব অর্পণ এবং ম্যানেজমেন্ট টু-ডু নীতিমালা' : 'Task Assignment Hierarchy & Management To-Do Rules'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isBn
                ? 'কে কাকে কীভাবে কাজ দিবে এবং ম্যানেজমেন্ট টু-ডুতে কীভাবে নতুন কাজ যুক্ত হবে তার প্রাতিষ্ঠানিক নির্দেশিকা।'
                : 'Administrative chain of command for assigning tasks and publishing institutional to-dos.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Box 1: Who can assign tasks to teachers & staff */}
            <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                <Users className="w-4 h-4 text-emerald-700" />
                <span>{isBn ? '১. শিক্ষকদের বা স্টাফদের কে কাজ দিতে পারবে?' : '1. Who Can Assign Tasks to Teachers/Staff?'}</span>
              </div>
              <ul className="text-xs space-y-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">ক. কো-অর্ডিনেটর / বিভাগীয় প্রধান (Coordinator / HOD):</span>
                  <span>নিজ বিভাগের যেকোনো শিক্ষক ও ল্যাব সহকারীদের সেমিস্টার রুটিন, সিলেবাস তৈরি, প্রশ্নপত্র প্রণয়ন বা ল্যাব মেইনটেন্যান্সের কাজ দিতে পারেন।</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">খ. এডমিন ইনচার্জ (Admin In-Charge):</span>
                  <span>ইনস্টিটিউটের সাধারণ স্টাফ, অফিস সহকারী ও গার্ডিয়ানদের প্রশাসনিক ফাইল প্রসেসিং, পরীক্ষার হল ডিউটি ও ক্যাম্পাসের রক্ষণাবেক্ষণ কাজ অর্পণ করতে পারেন।</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">গ. পরিচালক ও উপ-পরিচালক (Director & Deputy Director):</span>
                  <span>যে কোনো বিভাগের শিক্ষক বা কর্মকর্তাকে সরাসরি প্রাতিষ্ঠানিক বিশেষ দায়িত্ব, অডিট টিম বা কমিটি মেম্বার হিসেবে কাজ দিতে পারেন।</span>
                </li>
                <li className="flex items-start gap-2 text-slate-500 italic border-t border-emerald-200 dark:border-emerald-800 pt-2">
                  <span>* সাধারণ শিক্ষক বা স্টাফরা নিজেরা অন্য কাউকে কাজ দিতে পারেন না; তাঁরা শুধু নিজের পাওয়া কাজ সম্পন্ন করে জমা (Submit for Review) দিবেন।</span>
                </li>
              </ul>
            </div>

            {/* Box 2: How tasks are assigned */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                <Sliders className="w-4 h-4 text-emerald-700" />
                <span>{isBn ? '২. কাজ কিভাবে অর্পণ করা হয়?' : '2. How Tasks Are Assigned in the System?'}</span>
              </div>
              <ol className="text-xs space-y-2 text-slate-700 dark:text-slate-300 list-decimal pl-4 leading-relaxed">
                <li>
                  <strong>টাস্ক ম্যানেজারে যান:</strong> ওপরের মেনু থেকে <em>‘একাডেমিক ও দায়িত্ব’ ➔ ‘টাস্ক ও অগ্রগতি বণ্টন’</em>-এ ক্লিক করুন।
                </li>
                <li>
                  <strong>‘নতুন দায়িত্ব অর্পণ’ বাটনে ক্লিক করুন:</strong> এই বাটনটি শুধুমাত্র কো-অর্ডিনেটর ও এডমিনদের স্ক্রিনেই দৃশ্যমান হবে।
                </li>
                <li>
                  <strong>ফর্ম পূরণ করুন:</strong> কাজের শিরোনাম, বিস্তারিত বিবরণ, বিভাগ, দায়িত্বপ্রাপ্ত শিক্ষক/কর্মীর নাম, ডেডলাইন ও প্রায়োরিটি নির্ধারণ করুন।
                </li>
                <li>
                  <strong>স্বয়ংক্রিয় নোটিফিকেশন:</strong> সাবমিট করার সাথে সাথে নির্ধারিত শিক্ষকের ব্যক্তিগত ড্যাশবোর্ডে কাজটি চলে যাবে এবং শিক্ষক তাঁর শতভাগ অগ্রগতি সাবমিট করতে পারবেন।
                </li>
              </ol>
            </div>

            {/* Box 3: Management To-Do Workflow */}
            <div className="p-5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 space-y-3 md:col-span-2">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-sm">
                <FileCheck className="w-4 h-4 text-amber-600" />
                <span>{isBn ? '৩. ম্যানেজমেন্ট টু-ডুতে কিভাবে নতুন কাজ বা এজেন্ডা যুক্ত হয়?' : '3. How New Directives Are Added to Management To-Do?'}</span>
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
                <p>
                  <strong>ম্যানেজমেন্ট টু-ডু</strong> হলো ইনস্টিটিউটের উচ্চপর্যায়ের প্রাতিষ্ঠানিক ২২-দফা স্ট্র্যাটেজিক এজেন্ডা (যেমন: BTEB অ্যাক্রেডিটেশন, আধুনিক ল্যাব স্থাপন, ডিজিটাল লাইব্রেরি)।
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-800">
                    <strong className="block text-slate-900 dark:text-white mb-1">পদ্ধতি ১: মিটিং রেজোলিউশন থেকে রূপান্তর</strong>
                    <span>পরিচালক বা কো-অর্ডিনেটর মিটিংয়ে যে সিদ্ধান্তগুলো নেন, মিটিং মিনিটস থেকে <em>‘টাস্কে রূপান্তর করুন’</em> ক্লিক করলেই তা স্বয়ংক্রিয়ভাবে টু-ডু তালিকায় যুক্ত হয়।</span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200 dark:border-amber-800">
                    <strong className="block text-slate-900 dark:text-white mb-1">পদ্ধতি ২: সরাসরি নতুন এজেন্ডা প্রকাশ</strong>
                    <span>‘একাডেমিক ও দায়িত্ব’ ➔ ‘ম্যানেজমেন্ট রোডম্যাপ’-এ গিয়ে পরিচালক / এডমিন <em>‘নতুন এজেন্ডা প্রকাশ’</em> বাটনে ক্লিক করে লক্ষ্যমাত্রা ও দায়িত্বপ্রাপ্ত ব্যক্তিকে যুক্ত করতে পারেন।</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
