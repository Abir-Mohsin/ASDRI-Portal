'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  Users,
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  FileCheck,
  PlusCircle,
  MessageSquare,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { TaskItem, LeaveApplication, AttendanceCorrectionRequest } from '@/lib/types';

interface DepartmentWorkspaceProps {
  onOpenCreateTask: (dept?: string) => void;
  onOpenTaskModal: (task: TaskItem) => void;
}

export function DepartmentWorkspace({ onOpenCreateTask, onOpenTaskModal }: DepartmentWorkspaceProps) {
  const {
    currentUser,
    employees,
    attendanceRecords,
    leaveApplications,
    tasks,
    corrections,
    recommendLeave,
    approveCorrectionRequest,
    rejectCorrectionRequest,
    reviewTask,
    language,
    setActiveNav,
  } = useApp();

  const isBn = language === 'bn';
  const todayStr = new Date().toISOString().split('T')[0];

  // The department to monitor (default to user's department, or allow department selection for admin)
  const [selectedDept, setSelectedDept] = useState<string>(currentUser.department);

  const deptEmployees = employees.filter((e) => e.department === selectedDept);
  const deptAttendance = attendanceRecords.filter((r) => r.department === selectedDept && r.date === todayStr);

  const deptTasks = tasks.filter((t) => t.department === selectedDept);
  const pendingSubmissions = deptTasks.filter((t) => t.status === 'Submitted for Review');

  const pendingDeptLeaves = leaveApplications.filter(
    (l) => l.department === selectedDept && l.status === 'Pending_Dept_Head'
  );

  const pendingDeptCorrections = corrections.filter(
    (c) => deptEmployees.some((e) => e.id === c.employeeId) && c.status === 'Pending'
  );

  // Recommendation modal state
  const [selectedLeaveForRec, setSelectedLeaveForRec] = useState<LeaveApplication | null>(null);
  const [recRemarks, setRecRemarks] = useState<string>('');

  // Task Review modal state
  const [selectedTaskForReview, setSelectedTaskForReview] = useState<TaskItem | null>(null);
  const [taskFeedback, setTaskFeedback] = useState<string>('');

  const handleRecommend = (status: 'Recommended' | 'Not Recommended') => {
    if (selectedLeaveForRec) {
      recommendLeave(selectedLeaveForRec.id, recRemarks, status);
      setSelectedLeaveForRec(null);
      setRecRemarks('');
    }
  };

  const handleTaskReviewSubmit = (approved: boolean) => {
    if (selectedTaskForReview) {
      reviewTask(selectedTaskForReview.id, approved, taskFeedback);
      setSelectedTaskForReview(null);
      setTaskFeedback('');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              <span>{isBn ? 'বিভাগীয় ব্যবস্থাপনা ওয়ার্কস্পেস' : 'Department Workspace'}</span>
              <span aria-hidden="true">·</span>
              <span>{isBn ? 'সুপারভাইজার ও হেড ড্যাশবোর্ড' : 'Supervisor & HOD Level'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
              {selectedDept}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {isBn
                ? 'বিভাগের শিক্ষক ও কর্মকর্তা তদারকি, কাজের অগ্রগতি যাচাই, ছুটির সুপারিশ ও উপস্থিতি পরিচালনা।'
                : 'Supervise department personnel, review milestone deliverables, endorse leave requests, and manage attendance.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {Array.from(new Set(employees.map((e) => e.department))).map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <button
              onClick={() => onOpenCreateTask(selectedDept)}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isBn ? 'নতুন টাস্ক বরাদ্দ' : 'Assign New Task'}</span>
            </button>
          </div>
        </div>

        {/* Department KPI Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <span className="text-xs text-slate-500 block">{isBn ? 'মোট কর্মী ও শিক্ষক' : 'Total Department Staff'}</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {deptEmployees.length}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <span className="text-xs text-slate-500 block">{isBn ? 'আজকে উপস্থিত' : 'Present Today'}</span>
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {deptAttendance.filter((r) => r.status === 'Present' || r.status === 'Late').length}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <span className="text-xs text-slate-500 block">{isBn ? 'অপেক্ষমান ছুটির সুপারিশ' : 'Pending Leave Endorsements'}</span>
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {pendingDeptLeaves.length}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
            <span className="text-xs text-slate-500 block">{isBn ? 'জমা দেওয়া টাস্ক (Review)' : 'Pending Task Reviews'}</span>
            <span className="text-2xl font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              {pendingSubmissions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Pending Actions & Review Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Submissions Queue */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {isBn ? 'কাজের অনুমোদন কিউ (Task Submissions for Review)' : 'Submissions Awaiting HOD Approval'}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {pendingSubmissions.length} {isBn ? 'টি বাকি' : 'pending'}
            </span>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {isBn ? 'বর্তমানে পর্যালোচনার জন্য কোনো টাস্ক জমা নেই।' : 'No tasks pending supervisor review.'}
            </div>
          ) : (
            <div className="space-y-3">
              {pendingSubmissions.map((t) => (
                <div
                  key={t.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11px] text-teal-600 font-semibold">{t.id}</span>
                      <h4 className="font-semibold text-slate-900 dark:text-white mt-0.5">{t.title}</h4>
                      <p className="text-slate-500 mt-0.5">
                        {isBn ? 'সম্পন্ন করেছেন: ' : 'Submitted by: '}
                        <strong>{t.assignedPersonName}</strong>
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      100% Submitted
                    </span>
                  </div>

                  {t.submissionNotes && (
                    <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
                      <strong>Notes:</strong> {t.submissionNotes}
                      {t.submissionAttachment && (
                        <div className="mt-1 text-teal-600 font-medium">📎 {t.submissionAttachment}</div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedTaskForReview(t);
                        setTaskFeedback('');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                    >
                      {isBn ? 'যাচাই ও সিদ্ধান্ত' : 'Review & Sign Off'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Leave Recommendations */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                {isBn ? 'ছুটির সুপারিশ কিউ (Dept Head Endorsement)' : 'Leave Endorsement Requests'}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {pendingDeptLeaves.length} {isBn ? 'টি আবেদন' : 'applications'}
            </span>
          </div>

          {pendingDeptLeaves.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {isBn ? 'বিভাগীয় প্রধানের সুপারিশের জন্য কোনো ছুটির আবেদন নেই।' : 'No leave applications awaiting endorsement.'}
            </div>
          ) : (
            <div className="space-y-3">
              {pendingDeptLeaves.map((l) => (
                <div
                  key={l.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11px] text-amber-600 font-semibold">{l.id}</span>
                      <h4 className="font-semibold text-slate-900 dark:text-white mt-0.5">
                        {l.employeeName} ({l.leaveType})
                      </h4>
                      <p className="text-slate-500 mt-0.5">
                        {l.startDate} {isBn ? 'হতে' : 'to'} {l.endDate} · <strong>{l.totalDays} {isBn ? 'দিন' : 'days'}</strong>
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Pending HOD
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                    &ldquo;{l.reason}&rdquo;
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedLeaveForRec(l);
                        setRecRemarks('Recommended. Class arrangement done.');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                    >
                      {isBn ? 'সুপারিশ প্রদান' : 'Provide Endorsement'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Department Staff & Daily Attendance Roster */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'বিভাগীয় কর্মী ও আজকের বায়োমেট্রিক লগ' : 'Department Staff & Daily Biometric Attendance Log'}
            </h3>
            <p className="text-xs text-slate-500">
              {isBn
                ? 'মেশিনের ইন/আউট সময়, লেট ট্র্যাকিং এবং উপস্থিতি সংশোধন অনুরোধ।'
                : 'Raw biometric sync timestamps and active punch statuses.'}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">{todayStr}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Designation</th>
                <th className="py-2.5 px-3 font-mono">Machine ID</th>
                <th className="py-2.5 px-3">First IN</th>
                <th className="py-2.5 px-3">Last OUT</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {deptEmployees.map((emp) => {
                const att = deptAttendance.find((a) => a.employeeId === emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{emp.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{emp.id}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{emp.designation}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{emp.attendanceMachineId}</td>
                    <td className="py-3 px-3 font-mono font-medium text-slate-900 dark:text-white">
                      {att?.firstInTime || '--:--'}
                    </td>
                    <td className="py-3 px-3 font-mono font-medium text-slate-900 dark:text-white">
                      {att?.lastOutTime || '--:--'}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          att?.status === 'Present'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : att?.status === 'Late'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : att?.status === 'Leave'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : att?.status === 'Missing Punch'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {att?.status || 'No Punch'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-[11px] max-w-[200px] truncate">
                      {att?.remarks || '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Endorse Leave Modal */}
      {selectedLeaveForRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'ছুটির আবেদনে বিভাগীয় প্রধানের সুপারিশ' : 'Department Head Leave Endorsement'}
            </h3>
            <p className="text-xs text-slate-500">
              {selectedLeaveForRec.employeeName} · {selectedLeaveForRec.leaveType} ({selectedLeaveForRec.totalDays} days)
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs space-y-1">
              <div><strong>Reason:</strong> {selectedLeaveForRec.reason}</div>
              <div><strong>Dates:</strong> {selectedLeaveForRec.startDate} to {selectedLeaveForRec.endDate}</div>
              <div><strong>Contact:</strong> {selectedLeaveForRec.contactDuringLeave}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isBn ? 'বিভাগীয় প্রধানের মন্তব্য' : 'Department Head Remarks'}
              </label>
              <textarea
                value={recRemarks}
                onChange={(e) => setRecRemarks(e.target.value)}
                rows={3}
                placeholder="Alternative instructor assigned for theory & lab classes..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedLeaveForRec(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleRecommend('Not Recommended')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                {isBn ? 'সুপারিশ নাকচ' : 'Decline'}
              </button>
              <button
                type="button"
                onClick={() => handleRecommend('Recommended')}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
              >
                {isBn ? 'সুপারিশ ও ফরোয়ার্ড' : 'Recommend to Director'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Task Modal */}
      {selectedTaskForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isBn ? 'জমা দেওয়া কাজের চূড়ান্ত মূল্যায়ন' : 'Review Deliverable & Decision'}
            </h3>
            <p className="text-xs text-slate-500">
              {selectedTaskForReview.title} — Submitted by <strong>{selectedTaskForReview.assignedPersonName}</strong>
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs space-y-1.5">
              <div><strong>Description:</strong> {selectedTaskForReview.description}</div>
              <div><strong>Submission Notes:</strong> {selectedTaskForReview.submissionNotes || 'None'}</div>
              {selectedTaskForReview.submissionAttachment && (
                <div><strong>Attachment:</strong> {selectedTaskForReview.submissionAttachment}</div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isBn ? 'পর্যালোচনা প্রতিক্রিয়া বা সংশোধন নির্দেশনা' : 'Supervisor Feedback / Revision Notes'}
              </label>
              <textarea
                value={taskFeedback}
                onChange={(e) => setTaskFeedback(e.target.value)}
                rows={3}
                placeholder={isBn ? 'অনুমোদনের মন্তব্য বা সংশোধনের নির্দিষ্ট পয়েন্ট লিখুন...' : 'Add feedback notes...'}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedTaskForReview(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleTaskReviewSubmit(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              >
                {isBn ? 'পুনর্বিবেচনা প্রয়োজন (Revision)' : 'Request Revision'}
              </button>
              <button
                type="button"
                onClick={() => handleTaskReviewSubmit(true)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                {isBn ? 'অনুমোদন ও সমাপ্ত' : 'Approve & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
