'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  isAdministrativeRole,
  isDepartmentLeader,
  ActionTrackerItem,
  SubmittedFileAttachment,
} from '@/lib/types';
import {
  Search,
  Download,
  Upload,
  PlusCircle,
  CheckCircle2,
  Send,
  X,
  Edit3,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { GoogleDriveStatusButton } from '@/components/drive/GoogleDriveControlModal';
import { GoogleDriveFileUploader, SubmissionFilesBadges } from '@/components/drive/GoogleDriveFileUploader';

export function ActionTracker() {
  const {
    actionTrackerItems,
    createActionTrackerItem,
    updateActionTrackerItem,
    deleteActionTrackerItem,
    updateActionTrackerProgress,
    importActionTrackerItems,
    currentUser,
    employees,
  } = useApp();

  const role = currentUser.role;
  const isAdmin = isAdministrativeRole(role);
  const isLeader = isDepartmentLeader(role);
  const canManageAll = isAdmin || isLeader;

  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<ActionTrackerItem | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<{ id: string; title: string } | null>(null);

  // Admin Decision Edit Modal state
  const [adminEditingItem, setAdminEditingItem] = useState<ActionTrackerItem | null>(null);
  const [editAdminTitle, setEditAdminTitle] = useState('');
  const [editAdminDescription, setEditAdminDescription] = useState('');
  const [editAdminAssignedText, setEditAdminAssignedText] = useState('');
  const [editAdminAssignedEmpIds, setEditAdminAssignedEmpIds] = useState<string[]>([]);
  const [editAdminPriority, setEditAdminPriority] = useState<ActionTrackerItem['priority']>('মাঝারি');
  const [editAdminDeadline, setEditAdminDeadline] = useState('');
  const [editAdminStatus, setEditAdminStatus] = useState<ActionTrackerItem['status']>('শুরু হয়নি');
  const [editAdminProgress, setEditAdminProgress] = useState<number>(0);
  const [editAdminNextAction, setEditAdminNextAction] = useState('');
  const [editAdminFollowupDate, setEditAdminFollowupDate] = useState('');
  const [editAdminMeetingTitle, setEditAdminMeetingTitle] = useState('');

  // New item form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignedText, setNewAssignedText] = useState('');
  const [newAssignedEmpIds, setNewAssignedEmpIds] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState<ActionTrackerItem['priority']>('মাঝারি');
  const [newDeadline, setNewDeadline] = useState('2026-11-30');
  const [newNextAction, setNewNextAction] = useState('');

  // Work Submit / Update Modal state
  const [editProgress, setEditProgress] = useState<number>(0);
  const [editSubmissionReport, setEditSubmissionReport] = useState<string>('');
  const [editSubmissionFiles, setEditSubmissionFiles] = useState<SubmittedFileAttachment[]>([]);
  const [editLatestUpdate, setEditLatestUpdate] = useState<string>('');
  const [editNextAction, setEditNextAction] = useState<string>('');

  // Import state
  const [importText, setImportText] = useState('');
  const [importStatusMsg, setImportStatusMsg] = useState('');

  // Scope items: Teachers/Staff see ONLY their own tasks; Super Admin/Admin see all
  const scopedItems = canManageAll
    ? actionTrackerItems
    : actionTrackerItems.filter(
        (item) =>
          item.assignedEmployeeIds?.includes(currentUser.id) ||
          item.assignedPersonText.toLowerCase().includes(currentUser.name.toLowerCase()) ||
          (currentUser.nameBn && item.assignedPersonText.includes(currentUser.nameBn.split(' ')[0]))
      );

  const filteredItems = scopedItems.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.assignedPersonText.toLowerCase().includes(q) ||
      String(item.serialNo).includes(q)
    );
  });

  // Toggle assignee selection when creating new task
  const toggleAssigneeSelection = (empId: string, empNameBn: string) => {
    setNewAssignedEmpIds((prev) => {
      const exists = prev.includes(empId);
      const updated = exists ? prev.filter((id) => id !== empId) : [...prev, empId];
      const names = employees
        .filter((e) => updated.includes(e.id))
        .map((e) => e.nameBn || e.name);
      setNewAssignedText(names.join(', '));
      return updated;
    });
  };

  // Add New Task/Decision
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    createActionTrackerItem({
      title: newTitle.trim(),
      description: newDescription.trim(),
      assignedPersonText: newAssignedText.trim() || 'সংশ্লিষ্ট দায়িত্বশীল',
      assignedEmployeeIds: newAssignedEmpIds,
      priority: newPriority,
      startDate: new Date().toISOString().split('T')[0],
      deadline: newDeadline,
      status: 'শুরু হয়নি',
      progressPercentage: 0,
      nextAction: newNextAction.trim(),
    });

    setShowAddModal(false);
    setNewTitle('');
    setNewDescription('');
    setNewAssignedText('');
    setNewAssignedEmpIds([]);
    setNewNextAction('');
  };

  // Open Admin Decision Edit Modal
  const handleOpenAdminEdit = (item: ActionTrackerItem) => {
    setAdminEditingItem(item);
    setEditAdminTitle(item.title);
    setEditAdminDescription(item.description);
    setEditAdminAssignedText(item.assignedPersonText);
    setEditAdminAssignedEmpIds(item.assignedEmployeeIds || []);
    setEditAdminPriority(item.priority);
    setEditAdminDeadline(item.deadline);
    setEditAdminStatus(item.status);
    setEditAdminProgress(item.progressPercentage || 0);
    setEditAdminNextAction(item.nextAction || '');
    setEditAdminFollowupDate(item.followupDate || '');
    setEditAdminMeetingTitle(item.meetingTitle || '');
  };

  const toggleAdminEditAssigneeSelection = (empId: string) => {
    setEditAdminAssignedEmpIds((prev) => {
      const exists = prev.includes(empId);
      const updated = exists ? prev.filter((id) => id !== empId) : [...prev, empId];
      const names = employees
        .filter((e) => updated.includes(e.id))
        .map((e) => e.nameBn || e.name);
      setEditAdminAssignedText(names.join(', '));
      return updated;
    });
  };

  const handleSaveAdminEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEditingItem || !editAdminTitle.trim()) return;

    updateActionTrackerItem(adminEditingItem.id, {
      title: editAdminTitle.trim(),
      description: editAdminDescription.trim(),
      assignedPersonText: editAdminAssignedText.trim() || 'সংশ্লিষ্ট দায়িত্বশীল',
      assignedEmployeeIds: editAdminAssignedEmpIds,
      priority: editAdminPriority,
      deadline: editAdminDeadline,
      status: editAdminStatus,
      progressPercentage: Number(editAdminProgress),
      nextAction: editAdminNextAction.trim(),
      followupDate: editAdminFollowupDate || undefined,
      meetingTitle: editAdminMeetingTitle.trim() || undefined,
    });

    setAdminEditingItem(null);
  };

  const handleDeleteItem = (id: string, title: string) => {
    setConfirmDeleteItem({ id, title });
  };

  // Open Submit / Update Modal
  const handleOpenEdit = (item: ActionTrackerItem) => {
    setSelectedItemForEdit(item);
    setEditProgress(item.progressPercentage || 0);
    setEditSubmissionReport(item.submissionReport || '');
    setEditSubmissionFiles(item.submissionFiles || []);
    setEditLatestUpdate(item.latestUpdate || '');
    setEditNextAction(item.nextAction || '');
  };

  // Save Work Submission / Progress
  const handleSaveSubmission = (markComplete: boolean) => {
    if (!selectedItemForEdit) return;
    const finalProgress = markComplete ? 100 : Number(editProgress);
    const finalStatus: ActionTrackerItem['status'] =
      finalProgress >= 100 ? 'সম্পন্ন' : finalProgress > 0 ? 'চলমান' : 'শুরু হয়নি';

    updateActionTrackerProgress(selectedItemForEdit.id, {
      status: finalStatus,
      progressPercentage: finalProgress,
      submissionReport: editSubmissionReport.trim() || selectedItemForEdit.submissionReport,
      submissionFiles: editSubmissionFiles,
      latestUpdate:
        editLatestUpdate.trim() ||
        editSubmissionReport.trim() ||
        (editSubmissionFiles.length > 0 ? `${editSubmissionFiles.length} টি ফাইল জমা দেওয়া হয়েছে` : selectedItemForEdit.latestUpdate),
      nextAction: editNextAction.trim(),
      submittedAt: new Date().toISOString().split('T')[0],
      submittedBy: currentUser.nameBn || currentUser.name,
      completionDate: finalProgress >= 100 ? new Date().toISOString().split('T')[0] : undefined,
    });

    setSelectedItemForEdit(null);
  };

  // Export Excel
  const handleExportExcel = () => {
    const dataForExport = scopedItems.map((item) => ({
      'ক্রম': item.serialNo,
      'সিদ্ধান্ত / করণীয়': item.title,
      'ডেসক্রিপশন': item.description,
      'দায়িত্বপ্রাপ্ত ব্যক্তি': item.assignedPersonText,
      'অগ্রাধিকার': item.priority,
      'ডেডলাইন': item.deadline,
      'স্ট্যাটাস': item.status,
      'অগ্রগতি (%)': `${item.progressPercentage}%`,
      'জমাকৃত রিপোর্ট': item.submissionReport || '',
      'Google Drive ফাইল লিংক': item.submissionFiles?.map((f) => `${f.fileName}: ${f.webUrl}`).join(' | ') || '',
      'সর্বশেষ আপডেট': item.latestUpdate || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Action_Tracker');
    XLSX.writeFile(workbook, `ASDRI_Tasks_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Import Handler
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) return;

    const lines = importText.split('\n').filter((l) => l.trim().length > 0);
    const newItems: Array<Omit<ActionTrackerItem, 'id' | 'createdAt'>> = [];

    lines.forEach((line, idx) => {
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length >= 2) {
        const title = parts[1] ? parts[1].trim() : parts[0].trim();
        const desc = parts[2] ? parts[2].trim() : '';
        const assigned = parts[3] ? parts[3].trim() : 'সংশ্লিষ্ট দায়িত্বশীল';
        const deadline = parts[6]?.trim() || '2026-11-30';

        newItems.push({
          serialNo: idx + 1,
          title,
          description: desc,
          assignedPersonText: assigned,
          priority: 'মাঝারি',
          deadline,
          status: 'শুরু হয়নি',
          progressPercentage: 0,
        });
      }
    });

    if (newItems.length > 0) {
      const added = importActionTrackerItems(newItems);
      setImportStatusMsg(`সফলভাবে ${added} টি কাজ যুক্ত হয়েছে!`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportText('');
        setImportStatusMsg('');
      }, 1200);
    }
  };

  return (
    <div className="space-y-5 font-serif">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            {canManageAll ? `সিদ্ধান্ত ও কাজ ট্র্যাকার (${scopedItems.length} টি)` : `আমার অর্পিত কাজ ও জমা (${scopedItems.length} টি)`}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {canManageAll
              ? 'সভার সিদ্ধান্ত ও শিক্ষকদের অর্পিত কাজের অগ্রগতি এবং জমাকৃত রিপোর্ট পর্যবেক্ষণ।'
              : 'আপনার নামে অর্পিত কাজগুলোর তালিকা এবং কাজ জমা দেওয়ার স্থান।'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <GoogleDriveStatusButton isAdmin={isAdmin} />

          {canManageAll && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4 text-amber-300" />
                <span>নতুন কাজ / সিদ্ধান্ত দিন</span>
              </button>

              <button
                onClick={() => setShowImportModal(true)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-800" />
                <span>ইম্পোর্ট</span>
              </button>
            </>
          )}

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-emerald-800" />
            <span>Excel ডাউনলোড</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="কাজের শিরোনাম বা দায়িত্বপ্রাপ্ত ব্যক্তির নাম দিয়ে খুঁজুন..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 text-slate-900 focus:outline-none focus:border-emerald-700"
          />
        </div>
      </div>

      {/* Tasks List / Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              কোনো কাজ পাওয়া যায়নি।
            </div>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} className="p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[11px]">
                        #{item.serialNo}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.status === 'সম্পন্ন'
                            ? 'bg-emerald-100 text-emerald-900'
                            : item.status === 'চলমান'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        ডেডলাইন: {item.deadline}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm leading-snug">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-slate-600 leading-relaxed">{item.description}</p>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-900 shrink-0">
                    {item.progressPercentage}%
                  </span>
                </div>

                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-700 h-1.5 rounded-full"
                    style={{ width: `${item.progressPercentage}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-700">
                  <span className="text-slate-500">দায়িত্বপ্রাপ্ত: </span>
                  <strong className="text-slate-900">{item.assignedPersonText}</strong>
                </div>

                {item.submissionReport || (item.submissionFiles && item.submissionFiles.length > 0) ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950">
                    <div className="font-bold text-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>জমা দেওয়া রিপোর্ট ও ফাইল:</span>
                    </div>
                    {item.submissionReport && (
                      <div className="mt-0.5 text-slate-700 break-words">{item.submissionReport}</div>
                    )}
                    <SubmissionFilesBadges files={item.submissionFiles} />
                  </div>
                ) : item.latestUpdate ? (
                  <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    {item.latestUpdate}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="flex-1 min-w-[140px] py-2 px-3 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5 text-xs"
                  >
                    <Send className="w-3.5 h-3.5 text-amber-300" />
                    <span>কাজ জমা / আপডেট</span>
                  </button>
                  {canManageAll && (
                    <button
                      type="button"
                      onClick={() => handleOpenAdminEdit(item)}
                      className="py-2 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold cursor-pointer inline-flex items-center justify-center gap-1 text-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                      <span>সম্পাদনা</span>
                    </button>
                  )}
                  {canManageAll && (
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id, item.title)}
                      title="মুছে ফেলুন"
                      className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12">ক্রম</th>
                <th className="py-3 px-4">সিদ্ধান্ত / কাজের বিবরণ</th>
                <th className="py-3 px-4">দায়িত্বপ্রাপ্ত ব্যক্তি</th>
                <th className="py-3 px-4">ডেডলাইন</th>
                <th className="py-3 px-4">অগ্রগতি ও অবস্থা</th>
                <th className="py-3 px-4">জমাকৃত রিপোর্ট / আপডেট</th>
                <th className="py-3 px-4 text-right">কাজ জমা / আপডেট</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    কোনো কাজ পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-900">
                      {item.serialNo}
                    </td>

                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.description}</p>
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {item.assignedPersonText}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {item.deadline}
                    </td>

                    <td className="py-3.5 px-4 w-44">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            item.status === 'সম্পন্ন'
                              ? 'bg-emerald-100 text-emerald-900'
                              : item.status === 'চলমান'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.status}
                        </span>
                        <span className="font-mono font-bold text-slate-900">{item.progressPercentage}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-emerald-700 h-1.5 rounded-full"
                          style={{ width: `${item.progressPercentage}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      {item.submissionReport || (item.submissionFiles && item.submissionFiles.length > 0) ? (
                        <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950">
                          <div className="font-bold text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>জমা দেওয়া রিপোর্ট ও ফাইল:</span>
                          </div>
                          {item.submissionReport && (
                            <div className="mt-0.5 text-slate-700 break-words">{item.submissionReport}</div>
                          )}
                          <SubmissionFilesBadges files={item.submissionFiles} />
                        </div>
                      ) : item.latestUpdate ? (
                        <span className="text-slate-600">{item.latestUpdate}</span>
                      ) : (
                        <span className="text-slate-400">এখনো জমা হয়নি</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {canManageAll && (
                          <button
                            type="button"
                            onClick={() => handleOpenAdminEdit(item)}
                            title="সিদ্ধান্ত সম্পাদনা করুন"
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold cursor-pointer inline-flex items-center gap-1 text-xs"
                          >
                            <Edit3 className="w-3 h-3 text-amber-700" />
                            <span>সম্পাদনা</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 text-xs"
                        >
                          <Send className="w-3 h-3 text-amber-300" />
                          <span>কাজ জমা / আপডেট</span>
                        </button>
                        {canManageAll && (
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id, item.title)}
                            title="মুছে ফেলুন"
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Task / Decision Modal (For Super Admin / Admin) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                নতুন কাজ বা সভার সিদ্ধান্ত অর্পণ করুন
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddItem} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">কাজের শিরোনাম / সিদ্ধান্ত *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="কাজের শিরোনাম লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">বিস্তারিত বিবরণ</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="কাজের বিস্তারিত নির্দেশনা লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              {/* Select Assignees by clicking buttons (No Dropdown) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  যাকে কাজ দিবেন তাকে নির্বাচন করুন (টিক দিন):
                </label>
                <div className="max-h-36 overflow-y-auto p-2.5 rounded-lg border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {employees.map((emp) => {
                    const selected = newAssignedEmpIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleAssigneeSelection(emp.id, emp.nameBn || emp.name)}
                        className={`text-left px-2.5 py-1.5 rounded text-xs font-semibold border cursor-pointer transition-colors flex items-center justify-between ${
                          selected
                            ? 'bg-emerald-900 text-white border-emerald-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{emp.nameBn || emp.name}</span>
                        <span className="text-[10px] font-mono opacity-75 ml-1">{emp.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">দায়িত্বপ্রাপ্ত ব্যক্তির নাম</label>
                  <input
                    type="text"
                    required
                    value={newAssignedText}
                    onChange={(e) => setNewAssignedText(e.target.value)}
                    placeholder="যেমন: সালাহউদ্দীন তারেক"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">জমা দেওয়ার শেষ তারিখ (ডেডলাইন)</label>
                  <input
                    type="date"
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                >
                  কাজ অর্পণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Decision Modal (For Super Admin / Admin to edit decisions anytime) */}
      {adminEditingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold text-amber-700 font-mono">
                  সিদ্ধান্ত #{adminEditingItem.serialNo} ({adminEditingItem.id})
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  সভার সিদ্ধান্ত / কাজ সম্পাদনা করুন (Admin Edit)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAdminEditingItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdminEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">কাজের শিরোনাম / সিদ্ধান্ত *</label>
                <input
                  type="text"
                  required
                  value={editAdminTitle}
                  onChange={(e) => setEditAdminTitle(e.target.value)}
                  placeholder="কাজের শিরোনাম লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">বিস্তারিত বিবরণ</label>
                <textarea
                  rows={3}
                  value={editAdminDescription}
                  onChange={(e) => setEditAdminDescription(e.target.value)}
                  placeholder="কাজের বিস্তারিত নির্দেশনা লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              {/* Select Assignees by clicking buttons */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  দায়িত্বপ্রাপ্ত শিক্ষক/স্টাফ নির্বাচন করুন:
                </label>
                <div className="max-h-36 overflow-y-auto p-2.5 rounded-lg border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {employees.map((emp) => {
                    const selected = editAdminAssignedEmpIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleAdminEditAssigneeSelection(emp.id)}
                        className={`text-left px-2.5 py-1.5 rounded text-xs font-semibold border cursor-pointer transition-colors flex items-center justify-between ${
                          selected
                            ? 'bg-emerald-900 text-white border-emerald-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate">{emp.nameBn || emp.name}</span>
                        <span className="text-[10px] font-mono opacity-75 ml-1">{emp.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">দায়িত্বপ্রাপ্ত ব্যক্তির নাম (ডিসপ্লে টেক্সট)</label>
                  <input
                    type="text"
                    required
                    value={editAdminAssignedText}
                    onChange={(e) => setEditAdminAssignedText(e.target.value)}
                    placeholder="যেমন: সালাহউদ্দীন তারেক"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">অগ্রাধিকার (Priority)</label>
                  <div className="flex gap-2">
                    {(['জরুরি', 'উচ্চ', 'মাঝারি', 'নিম্ন'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEditAdminPriority(p)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border cursor-pointer ${
                          editAdminPriority === p
                            ? 'bg-emerald-900 text-white border-emerald-900'
                            : 'bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ডেডলাইন *</label>
                  <input
                    type="date"
                    required
                    value={editAdminDeadline}
                    onChange={(e) => setEditAdminDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">কাজের অবস্থা (Status)</label>
                  <select
                    value={editAdminStatus}
                    onChange={(e) => setEditAdminStatus(e.target.value as ActionTrackerItem['status'])}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-semibold"
                  >
                    <option value="শুরু হয়নি">শুরু হয়নি</option>
                    <option value="চলমান">চলমান</option>
                    <option value="সম্পন্ন">সম্পন্ন</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">অগ্রগতি (%) ({editAdminProgress}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={editAdminProgress}
                    onChange={(e) => setEditAdminProgress(Number(e.target.value))}
                    className="w-full accent-emerald-800 mt-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">পরবর্তী পদক্ষেপ (Next Action)</label>
                  <input
                    type="text"
                    value={editAdminNextAction}
                    onChange={(e) => setEditAdminNextAction(e.target.value)}
                    placeholder="পরবর্তী পদক্ষেপ লিখুন..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">সভার নাম বা রেফারেন্স</label>
                  <input
                    type="text"
                    value={editAdminMeetingTitle}
                    onChange={(e) => setEditAdminMeetingTitle(e.target.value)}
                    placeholder="যেমন: মাসিক একাডেমিক সভা"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdminEditingItem(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-300" />
                  <span>পরিবর্তন সংরক্ষণ করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Work / Update Progress Modal */}
      {selectedItemForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold text-emerald-800">
                  কাজ #{selectedItemForEdit.serialNo}
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {selectedItemForEdit.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedItemForEdit(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  কাজের অগ্রগতি (%): <strong>{editProgress}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={editProgress}
                  onChange={(e) => setEditProgress(Number(e.target.value))}
                  className="w-full accent-emerald-800 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  জমা দেওয়া কাজের বিবরণ / রিপোর্ট / লিংক
                </label>
                <textarea
                  rows={3}
                  value={editSubmissionReport}
                  onChange={(e) => setEditSubmissionReport(e.target.value)}
                  placeholder="আপনি যা সম্পন্ন করেছেন তার বিস্তারিত বিবরণ বা ফাইল লিংক এখানে লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-emerald-700"
                />
              </div>

              {/* Direct File Upload to Google Drive */}
              <GoogleDriveFileUploader
                files={editSubmissionFiles}
                onChange={setEditSubmissionFiles}
                taskSerial={selectedItemForEdit.serialNo}
                employeeId={currentUser.id}
                employeeName={currentUser.nameBn || currentUser.name}
              />

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  সংক্ষিপ্ত আপডেট নোট
                </label>
                <input
                  type="text"
                  value={editLatestUpdate}
                  onChange={(e) => setEditLatestUpdate(e.target.value)}
                  placeholder="যেমন: কাজটি সম্পন্ন করে জমা দেওয়া হয়েছে"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedItemForEdit(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSubmission(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
                >
                  অগ্রগতি সংরক্ষণ
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSubmission(true)}
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

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                এক্সেল বা টেক্সট থেকে কাজ ইম্পোর্ট করুন
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importStatusMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                {importStatusMsg}
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  এক্সেল সারি পেস্ট করুন (ক্রম, শিরোনাম, বিবরণ, দায়িত্বপ্রাপ্ত ব্যক্তি)
                </label>
                <textarea
                  rows={5}
                  required
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="এক্সেল থেকে কপি করে এখানে পেস্ট করুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                >
                  ইম্পোর্ট করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal (React Dialog) */}
      {confirmDeleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-rose-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  সিদ্ধান্ত / কাজ মুছে ফেলার নিশ্চিতকরণ
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  আপনি কি নিশ্চিতভাবে{' '}
                  <strong className="text-slate-900">&ldquo;{confirmDeleteItem.title}&rdquo;</strong>{' '}
                  মুছে ফেলতে চান?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteItem(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteActionTrackerItem(confirmDeleteItem.id);
                  setConfirmDeleteItem(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
              >
                নিশ্চিত, মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
