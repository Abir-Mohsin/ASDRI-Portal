'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  FileText,
  Bell,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Eye,
  AlertTriangle,
  Printer,
  Download,
  X,
} from 'lucide-react';
import { OfficeDocument, NoticeItem, Department } from '@/lib/types';

import {
  isAdministrativeRole,
  isDepartmentLeader,
  isPersonalScopeOnly,
  isExecutiveRole,
} from '@/lib/types';

export function DocumentManager() {
  const {
    documents,
    notices,
    createDocument,
    createNotice,
    markNoticeAsRead,
    currentUser,
    employees,
    language,
  } = useApp();

  const isBn = language === 'bn';
  const todayStr = new Date().toISOString().split('T')[0];

  const isPersonalOnly = isPersonalScopeOnly(currentUser.role);
  const isLeader = isDepartmentLeader(currentUser.role);
  const isAdmin = isAdministrativeRole(currentUser.role);
  const isExecutive = isExecutiveRole(currentUser.role);

  const [activeTab, setActiveTab] = useState<'documents' | 'notices'>('documents');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<OfficeDocument | null>(null);

  // New Document Modal
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<OfficeDocument['category']>('Office Order');
  const [docDept, setDocDept] = useState<Department | 'All Departments'>('All Departments');
  const [docSignatory, setDocSignatory] = useState(currentUser.nameBn || currentUser.name || '');
  const [docSignatoryDesig, setDocSignatoryDesig] = useState(currentUser.designationBn || currentUser.designation || '');
  const [docSummary, setDocSummary] = useState('');
  const [docContent, setDocContent] = useState('');

  // New Notice Modal
  const [showAddNoticeModal, setShowAddNoticeModal] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeDesc, setNoticeDesc] = useState('');
  const [noticeCategory, setNoticeCategory] = useState<NoticeItem['category']>('Administrative Notice');
  const [noticeAudience, setNoticeAudience] = useState<NoticeItem['targetAudience']>('All Employees');
  const [noticeUrgent, setNoticeUrgent] = useState(false);

  const handleCreateDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const memoNum = `ASDRI/${docCategory === 'Academic Circular' ? 'ACAD' : 'ADMIN'}/2026/${String(
      documents.length + 10
    ).padStart(3, '0')}`;

    createDocument({
      memoNumber: memoNum,
      title: docTitle,
      category: docCategory,
      department: docDept,
      publishedDate: todayStr,
      signatory: docSignatory,
      signatoryDesignation: docSignatoryDesig,
      summary: docSummary,
      content: docContent || docSummary,
      status: 'Active',
    });

    setShowAddDocModal(false);
    setDocTitle('');
    setDocSummary('');
    setDocContent('');
  };

  const handleCreateNoticeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createNotice({
      title: noticeTitle,
      description: noticeDesc,
      category: noticeCategory,
      targetAudience: noticeAudience,
      publishedDate: todayStr,
      publishedBy: currentUser.name,
      isUrgent: noticeUrgent,
    });
    setShowAddNoticeModal(false);
    setNoticeTitle('');
    setNoticeDesc('');
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            <span>{isBn ? 'ডিজিটাল নথি ও নোটিশ বোর্ড' : 'Institutional Records & Notices'}</span>
            <span aria-hidden="true">·</span>
            <span>Official Memorandums & Circulars</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {isBn ? 'অফিসিয়াল ডকুমেন্ট ও অভ্যন্তরীণ নোটিশ' : 'Official Office Orders & Notice Board'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'ডিজিটাল অফিস আদেশ সংরক্ষণ, সার্কুলার প্রকাশ এবং কারা নোটিশ পড়েছেন তা ট্র্যাকিং।'
              : 'Permanent archive of digital office orders, policy memos, and broadcast notices with read confirmation.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {(isAdmin || isExecutive) && (
            <>
              <button
                onClick={() => setShowAddNoticeModal(true)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5 text-amber-500" />
                <span>{isBn ? 'নোটিশ প্রকাশ করুন' : 'Post Notice'}</span>
              </button>

              <button
                onClick={() => setShowAddDocModal(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isBn ? 'নতুন অফিস আদেশ' : 'Create Office Order'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl max-w-fit">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'documents'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {isBn ? 'ডিজিটাল অফিস আদেশ ও নথি' : 'Official Documents'} ({documents.length})
        </button>

        <button
          onClick={() => setActiveTab('notices')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'notices'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {isBn ? 'অভ্যন্তরীণ নোটিশ বোর্ড' : 'Internal Notice Board'} ({notices.length})
        </button>
      </div>

      {/* Tab 1: Documents */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:border-teal-500/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-teal-600 font-semibold">{doc.memoNumber}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800">
                      {doc.category}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-base mt-2 line-clamp-2">
                    {doc.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-3">
                    {doc.summary}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <span>Signatory: {doc.signatory}</span>
                  <span className="font-mono">{doc.publishedDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Notice Board */}
      {activeTab === 'notices' && (
        <div className="space-y-4">
          <div className="space-y-3">
            {notices.map((n) => {
              const hasRead = n.readByEmployeeIds.includes(currentUser.id);
              return (
                <div
                  key={n.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    n.isUrgent
                      ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {n.isUrgent && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-600 text-white uppercase">
                          Urgent Notice
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {n.category}
                      </span>
                      <span className="text-xs text-slate-400">· Target: {n.targetAudience}</span>
                    </div>

                    <span className="text-xs font-mono text-slate-500">{n.publishedDate}</span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-2">
                    {n.title}
                  </h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 max-w-4xl">
                    {n.description}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <div>
                      {isBn ? 'প্রকাশক: ' : 'Published by: '} <strong>{n.publishedBy}</strong>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-[11px]">
                        Read by {n.readByEmployeeIds.length} of {employees.length} staff
                      </span>

                      {!hasRead ? (
                        <button
                          onClick={() => markNoticeAsRead(n.id, currentUser.id)}
                          className="px-3 py-1 font-semibold rounded bg-teal-600 hover:bg-teal-700 text-white text-xs cursor-pointer"
                        >
                          {isBn ? 'পড়েছি নিশ্চিত করুন' : 'Confirm Read'}
                        </button>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmed Read
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Document Detail & Print Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <span className="font-mono text-xs font-semibold text-teal-600">{selectedDoc.memoNumber}</span>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center space-y-1">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                ASIAN SCIENCE DEVELOPMENT & RESEARCH INSTITUTE
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedDoc.title}</h2>
              <div className="text-xs text-slate-500 font-mono">
                Memo: {selectedDoc.memoNumber} · Date: {selectedDoc.publishedDate}
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed border border-slate-200 dark:border-slate-800">
              {selectedDoc.content}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Order</span>
              </button>

              <div className="text-right">
                <div className="font-bold text-slate-900 dark:text-white">{selectedDoc.signatory}</div>
                <div className="text-slate-500">{selectedDoc.signatoryDesignation}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showAddDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isBn ? 'নতুন প্রাতিষ্ঠানিক অফিস আদেশ তৈরি' : 'Issue Official Order / Circular'}
              </h3>
              <button
                onClick={() => setShowAddDocModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDocSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Schedule of Practical Examinations and Lab Invigilation Duties"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Office Order">Office Order (অফিস আদেশ)</option>
                    <option value="Academic Circular">Academic Circular</option>
                    <option value="Appointment Letter">Appointment Letter</option>
                    <option value="Policy & Guidelines">Policy & Guidelines</option>
                    <option value="Meeting Minutes">Meeting Minutes</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Distribution
                  </label>
                  <select
                    value={docDept}
                    onChange={(e) => setDocDept(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="All Departments">All Departments</option>
                    {Array.from(new Set(employees.map((e) => e.department))).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Summary & Key Directive *
                </label>
                <textarea
                  required
                  rows={2}
                  value={docSummary}
                  onChange={(e) => setDocSummary(e.target.value)}
                  placeholder="Short briefing for notice boards..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Memorandum Text
                </label>
                <textarea
                  rows={4}
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder="Official formal body text of the office order..."
                  className="w-full font-mono px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddDocModal(false)}
                  className="px-4 py-2 font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Issue & Publish Memo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Notice Modal */}
      {showAddNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isBn ? 'অভ্যন্তরীণ নোটিশ প্রচার করুন' : 'Broadcast Internal Notice'}
              </h3>
              <button
                onClick={() => setShowAddNoticeModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNoticeSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notice Title *
                </label>
                <input
                  type="text"
                  required
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="e.g. Important Guidelines on Biometric Fingerprint Punching"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={noticeCategory}
                    onChange={(e) => setNoticeCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Administrative Notice">Administrative Notice</option>
                    <option value="Academic Notice">Academic Notice</option>
                    <option value="General Notice">General Notice</option>
                    <option value="Holiday Notice">Holiday Notice</option>
                    <option value="Meeting Notice">Meeting Notice</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Target Audience
                  </label>
                  <select
                    value={noticeAudience}
                    onChange={(e) => setNoticeAudience(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="All Employees">All Employees</option>
                    <option value="Faculty Only">Faculty Only</option>
                    <option value="Staff Only">Staff Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notice Body & Details *
                </label>
                <textarea
                  required
                  rows={4}
                  value={noticeDesc}
                  onChange={(e) => setNoticeDesc(e.target.value)}
                  placeholder="Describe announcement, instructions, and dates..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="urgentCheck"
                  checked={noticeUrgent}
                  onChange={(e) => setNoticeUrgent(e.target.checked)}
                  className="accent-rose-600 rounded"
                />
                <label htmlFor="urgentCheck" className="text-slate-800 dark:text-slate-200 font-semibold cursor-pointer">
                  Mark as Urgent Priority Notice
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddNoticeModal(false)}
                  className="px-4 py-2 font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Publish Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
