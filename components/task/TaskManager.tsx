'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  CheckSquare,
  LayoutGrid,
  List,
  PlusCircle,
  FileSpreadsheet,
  Clock,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  User,
  X,
  MessageSquare,
} from 'lucide-react';
import { TaskItem, TaskStatus, TaskPriority, Department } from '@/lib/types';
import { exportTasksToExcel } from '@/lib/export-utils';

import {
  isAdministrativeRole,
  isDepartmentLeader,
  isPersonalScopeOnly,
  isExecutiveRole,
} from '@/lib/types';

interface TaskManagerProps {
  initialDept?: string;
}

export function TaskManager({ initialDept }: TaskManagerProps) {
  const {
    tasks,
    createTask,
    updateTaskProgress,
    submitTaskForReview,
    reviewTask,
    employees,
    currentUser,
    meetings,
    language,
  } = useApp();

  const isBn = language === 'bn';
  const todayStr = new Date().toISOString().split('T')[0];

  const isPersonalOnly = isPersonalScopeOnly(currentUser.role);
  const isLeader = isDepartmentLeader(currentUser.role);
  const isAdmin = isAdministrativeRole(currentUser.role);
  const isExecutive = isExecutiveRole(currentUser.role);

  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>(
    isPersonalOnly ? currentUser.department : initialDept || 'All'
  );
  const [selectedPriority, setSelectedPriority] = useState<string>('All');

  // Detail / Action Modal
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [progressVal, setProgressVal] = useState<number>(0);
  const [submitNotes, setSubmitNotes] = useState<string>('');
  const [submitAttach, setSubmitAttach] = useState<string>('');
  const [reviewFeedback, setReviewFeedback] = useState<string>('');

  // Create Task Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskItem['category']>('Curriculum');
  const [department, setDepartment] = useState<Department>(currentUser.department);
  const [assigneeId, setAssigneeId] = useState(employees[1]?.id || employees[0]?.id || currentUser.id || '');
  const [deadline, setDeadline] = useState('2026-11-20');
  const [priority, setPriority] = useState<TaskPriority>('High');

  // Scoped tasks based on user role
  const scopedTasks = tasks.filter((t) => {
    if (isPersonalOnly) {
      return t.assignedPersonId === currentUser.id;
    }
    if (isLeader && !isAdmin) {
      return t.department === currentUser.department || t.assignedPersonId === currentUser.id;
    }
    return true; // Executive & Admin see all
  });

  const filteredTasks = scopedTasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.assignedPersonName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'All' || t.department === selectedDept;
    const matchesPriority = selectedPriority === 'All' || t.priority === selectedPriority;
    return matchesSearch && matchesDept && matchesPriority;
  });

  const kanbanColumns: Array<{ status: TaskStatus; label: string; color: string }> = [
    { status: 'To Do', label: isBn ? 'করণীয় (To Do)' : 'To Do', color: 'border-slate-300 dark:border-slate-700' },
    { status: 'In Progress', label: isBn ? 'চলমান (In Progress)' : 'In Progress', color: 'border-teal-500' },
    {
      status: 'Submitted for Review',
      label: isBn ? 'অনুমোদনের জন্য জমা (Submitted)' : 'Submitted for Review',
      color: 'border-blue-500',
    },
    {
      status: 'Revision Required',
      label: isBn ? 'সংশোধন প্রয়োজন (Revision)' : 'Revision Required',
      color: 'border-amber-500',
    },
    { status: 'Approved', label: isBn ? 'অনুমোদিত ও সম্পন্ন (Done)' : 'Approved / Done', color: 'border-emerald-500' },
  ];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const assignee = employees.find((x) => x.id === assigneeId) || employees[0] || currentUser;
    createTask({
      title,
      description,
      category,
      department,
      assignedPersonId: assignee.id,
      assignedPersonName: assignee.name,
      supervisorId: currentUser.id,
      supervisorName: currentUser.name,
      startDate: todayStr,
      deadline,
      priority,
      status: 'To Do',
      progressPercentage: 0,
    });
    setShowCreateModal(false);
    setTitle('');
    setDescription('');
  };

  const handleUpdateProgressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTask) {
      updateTaskProgress(activeTask.id, progressVal, submitNotes);
      setActiveTask(null);
    }
  };

  const handleSubmitForReview = () => {
    if (activeTask) {
      submitTaskForReview(activeTask.id, submitNotes || 'Deliverable ready for inspection.', submitAttach);
      setActiveTask(null);
    }
  };

  const handleReviewAction = (approved: boolean) => {
    if (activeTask) {
      reviewTask(activeTask.id, approved, reviewFeedback || (approved ? 'Approved by supervisor' : 'Revision needed'));
      setActiveTask(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            <span>{isBn ? 'টাস্ক ও প্রজেক্ট ম্যানেজমেন্ট' : 'Task & Milestone Engine'}</span>
            <span aria-hidden="true">·</span>
            <span>Kanban & Table Pipelines</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {isBn ? 'কাজের অগ্রগতি ও দায়িত্ব বণ্টন' : 'Task Assignment & Review Workflows'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'কাজের শতভাগ অগ্রগতি ট্র্যাকিং, জমা দেওয়া ও সুপারভাইজারের অনুমোদন / সংশোধন পর্যালোচনা।'
              : 'End-to-end task progression, deliverable submission, and multi-tier supervisor review.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <button
            onClick={() => exportTasksToExcel(tasks, 'Institutional_Tasks')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isBn ? 'Excel এক্সপোর্ট' : 'Export Tasks'}</span>
          </button>

          {(!isPersonalOnly || isLeader || isAdmin) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isBn ? 'নতুন দায়িত্ব অর্পণ' : 'Assign Task'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isBn ? 'টাস্ক শিরোনাম বা দায়িত্বপ্রাপ্ত ব্যক্তি খুঁজুন...' : 'Search tasks or assignees...'}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
          >
            <option value="All">{isBn ? 'সকল বিভাগ' : 'All Departments'}</option>
            {Array.from(new Set(employees.map((e) => e.department))).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
          >
            <option value="All">{isBn ? 'সকল অগ্রাধিকার' : 'All Priorities'}</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
          {kanbanColumns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="bg-slate-100/70 dark:bg-slate-800/40 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800/80 space-y-3 min-h-[500px]"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{col.label}</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold shadow-xs">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => {
                        setActiveTask(task);
                        setProgressVal(task.progressPercentage);
                        setSubmitNotes(task.submissionNotes || '');
                        setSubmitAttach(task.submissionAttachment || '');
                        setReviewFeedback(task.revisionFeedback || '');
                      }}
                      className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-teal-500 dark:hover:border-teal-500 hover:shadow-md transition-all cursor-pointer space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-teal-600 font-semibold">{task.id}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            task.priority === 'Urgent'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : task.priority === 'High'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                        {task.title}
                      </h4>

                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        <div className="truncate">
                          👤 <strong>{task.assignedPersonName}</strong>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[10px]">
                          <span>Due: {task.deadline}</span>
                          <span>{task.progressPercentage}%</span>
                        </div>
                      </div>

                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${
                            task.progressPercentage >= 100
                              ? 'bg-emerald-500'
                              : task.progressPercentage > 50
                              ? 'bg-teal-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${task.progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table List View */
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Task ID</th>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4">Assignee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Deadline</th>
                  <th className="py-3 px-4">Progress</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => {
                      setActiveTask(t);
                      setProgressVal(t.progressPercentage);
                      setSubmitNotes(t.submissionNotes || '');
                      setSubmitAttach(t.submissionAttachment || '');
                    }}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-teal-600">{t.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white max-w-sm truncate">
                      {t.title}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                      {t.assignedPersonName}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{t.department}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          t.priority === 'Urgent'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                        }`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{t.deadline}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">{t.progressPercentage}%</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800">
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Task Detail & Review Modal */}
      {activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-teal-600">{activeTask.id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800">
                  {activeTask.status}
                </span>
              </div>
              <button
                onClick={() => setActiveTask(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{activeTask.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{activeTask.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Assignee</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activeTask.assignedPersonName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Supervisor</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activeTask.supervisorName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Department</span>
                <span className="text-slate-900 dark:text-white">{activeTask.department}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Deadline</span>
                <span className="font-mono text-slate-900 dark:text-white">{activeTask.deadline}</span>
              </div>
            </div>

            {/* In-flight submission info */}
            {activeTask.submissionNotes && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-xs space-y-1">
                <strong className="text-blue-900 dark:text-blue-200">Staff Submission Deliverable:</strong>
                <p className="text-blue-800 dark:text-blue-300">{activeTask.submissionNotes}</p>
                {activeTask.submissionAttachment && (
                  <div className="text-teal-600 font-mono font-medium">📎 {activeTask.submissionAttachment}</div>
                )}
              </div>
            )}

            {/* Revision Feedback info */}
            {activeTask.revisionFeedback && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs space-y-1">
                <strong className="text-amber-900 dark:text-amber-200">Revision Required Feedback:</strong>
                <p className="text-amber-800 dark:text-amber-300">{activeTask.revisionFeedback}</p>
              </div>
            )}

            {/* Progress Slider Form (For Assignee) */}
            <form onSubmit={handleUpdateProgressSubmit} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <div className="flex justify-between font-medium mb-1">
                  <span className="text-slate-700 dark:text-slate-300">Update Progress Percentage</span>
                  <span className="font-mono font-bold text-teal-600">{progressVal}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressVal}
                  onChange={(e) => setProgressVal(Number(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Deliverable Notes / Report
                </label>
                <textarea
                  rows={2}
                  value={submitNotes}
                  onChange={(e) => setSubmitNotes(e.target.value)}
                  placeholder="Summarize milestones achieved or paste doc link..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                >
                  Save Progress (% Only)
                </button>

                <button
                  type="button"
                  onClick={handleSubmitForReview}
                  className="px-4 py-1.5 font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                >
                  Submit for Supervisor Review
                </button>
              </div>
            </form>

            {/* Supervisor Approval Actions (Available to Supervisor/Director) */}
            {(currentUser.id === activeTask.supervisorId ||
              currentUser.role === 'director' ||
              currentUser.role === 'dept_head') && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <span className="block font-bold text-xs text-slate-800 dark:text-slate-200">
                  Supervisor Decision:
                </span>
                <input
                  type="text"
                  placeholder="Feedback notes for approval or revision..."
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleReviewAction(false)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                  >
                    Request Revision
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewAction(true)}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    Approve & Complete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isBn ? 'নতুন টাস্ক তৈরি ও কর্মী বরাদ্দ' : 'Assign New Institutional Task'}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Conduct Practical Laboratory Safety Audit"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description *
                </label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Clear objectives, deliverables, and expectations..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Assignee (Employee) *
                  </label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {Array.from(new Set(employees.map((e) => e.department))).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Deadline *
                  </label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Create & Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
