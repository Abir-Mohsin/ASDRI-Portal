'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { ShieldCheck, Search, Filter, Clock, User, Layers } from 'lucide-react';

export function AuditTrail() {
  const { auditLogs, language } = useApp();
  const isBn = language === 'bn';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('All');

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = selectedModule === 'All' || log.module === selectedModule;
    return matchesSearch && matchesModule;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            <span>{isBn ? 'নিরাপত্তা ও অডিট ট্রেইল' : 'Compliance & Security'}</span>
            <span aria-hidden="true">·</span>
            <span>Immutable System Event Ledger</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {isBn ? 'সিস্টেম অ্যাক্টিভিটি লগ ও অডিট রেকর্ড' : 'System Activity Log & Audit Trail'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'কে কখন কী পরিবর্তন করেছেন, বায়োমেট্রিক পাঞ্চ, ছুটির অনুমোদন ও প্রশাসনিক আদেশের ডিজিটাল রেকর্ড।'
              : 'Tamper-proof chronological trail of state mutations, machine events, and approvals.'}
          </p>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Total Recorded Events: {auditLogs.length}
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search action, actor name, or event details..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <select
          value={selectedModule}
          onChange={(e) => setSelectedModule(e.target.value)}
          className="text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-full sm:w-auto"
        >
          <option value="All">All Modules</option>
          <option value="Attendance">Attendance</option>
          <option value="Leave">Leave</option>
          <option value="Task">Task</option>
          <option value="Meeting">Meeting</option>
          <option value="Employee">Employee</option>
          <option value="Document">Document</option>
          <option value="System">System</option>
        </select>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-sans font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Log ID</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Action Event</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 text-teal-600 font-bold">{log.id}</td>
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                    {log.actorName}
                  </td>
                  <td className="py-2.5 px-4 uppercase text-[10px] text-slate-500 font-sans">
                    {log.actorRole}
                  </td>
                  <td className="py-2.5 px-4 font-sans">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {log.module}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                    {log.action}
                  </td>
                  <td className="py-2.5 px-4 font-sans text-slate-600 dark:text-slate-400 max-w-md truncate">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
