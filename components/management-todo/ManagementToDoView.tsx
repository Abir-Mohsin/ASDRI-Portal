'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  Layers,
  Shield,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Building2,
  Calendar,
  Lock,
  X,
} from 'lucide-react';
import { ManagementToDoItem } from '@/lib/types';

export function ManagementToDoView() {
  const {
    managementToDos,
    createManagementToDo,
    updateManagementToDoStatus,
    currentUser,
    language,
  } = useApp();

  const isBn = language === 'bn';
  const isDirector = currentUser.role === 'director' || currentUser.role === 'super_admin';

  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDepartment, setTargetDepartment] = useState('All Departments');
  const [leadPerson, setLeadPerson] = useState(currentUser.nameBn || currentUser.name || '');
  const [priority, setPriority] = useState<ManagementToDoItem['priority']>('High');
  const [deadline, setDeadline] = useState('2026-11-30');
  const [strategicGoal, setStrategicGoal] = useState('Institutional Quality Assurance & Grade A Rating');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createManagementToDo({
      title,
      description,
      targetDepartment,
      leadPerson,
      priority,
      deadline,
      status: 'In Progress',
      strategicGoal,
      publishedBy: currentUser.name,
    });
    setShowAddModal(false);
    setTitle('');
    setDescription('');
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            <span>{isBn ? 'প্রাতিষ্ঠানিক রোডম্যাপ' : 'Executive Directives'}</span>
            <span aria-hidden="true">·</span>
            <span>Strategic Management Agenda</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {isBn ? 'ম্যানেজমেন্ট টু-ডু (প্রাতিষ্ঠানিক অগ্রাধিকার তালিকা)' : 'Institutional Management To-Do Directives'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'পরিচালক ও ব্যবস্থাপনা পর্ষদ কর্তৃক ঘোষিত প্রাতিষ্ঠানিক লক্ষ্যমাত্রা। স্টাফদের জন্য এটি Read Only হিসেবে সংরক্ষিত।'
              : 'Institutional goals and compliance milestones published by executive leadership (Read-Only for staff).'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>{isDirector ? (isBn ? 'সম্পূর্ণ নিয়ন্ত্রণ (Director)' : 'Full Admin Access') : (isBn ? 'রিড-অনলি মোড (Staff)' : 'Read-Only Mode')}</span>
          </div>

          {isDirector && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isBn ? 'নতুন এজেন্ডা প্রকাশ' : 'Add Strategic Directive'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Directives Cards */}
      <div className="space-y-4">
        {managementToDos.map((item) => (
          <div
            key={item.id}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-teal-600 font-bold">{item.id}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500 font-medium">Strategic Objective: {item.strategicGoal}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-4xl leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    item.priority === 'Urgent'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                  }`}
                >
                  {item.priority}
                </span>

                <span
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    item.status === 'Completed'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs text-slate-500">
              <div>
                <span className="text-slate-400 block font-medium">Target Department</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{item.targetDepartment}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Lead Responsibility</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{item.leadPerson}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Target Deadline</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{item.deadline}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Published Authority</span>
                <span className="text-slate-700 dark:text-slate-300">{item.publishedBy} ({item.publishedAt})</span>
              </div>
            </div>

            {/* If user is director, allow status change */}
            {isDirector && (
              <div className="pt-2 flex items-center justify-end gap-2 text-xs">
                <span className="text-slate-400 font-medium mr-2">Change Status:</span>
                <button
                  onClick={() => updateManagementToDoStatus(item.id, 'In Progress')}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                >
                  In Progress
                </button>
                <button
                  onClick={() => updateManagementToDoStatus(item.id, 'Completed')}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer"
                >
                  Mark Completed
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Directive Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isBn ? 'নতুন প্রাতিষ্ঠানিক এজেন্ডা প্রকাশ' : 'Issue Institutional Directive'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Directive Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Establishment of AI & Robotics Center of Excellence"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Scope & Action Plan *
                </label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe strategic imperative, key stakeholders, and deliverables..."
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
                    value={targetDepartment}
                    onChange={(e) => setTargetDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lead Authority
                  </label>
                  <input
                    type="text"
                    value={leadPerson}
                    onChange={(e) => setLeadPerson(e.target.value)}
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
                    <option value="Routine">Routine</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
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
