'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  Search,
  UserPlus,
  Edit3,
  KeyRound,
  ShieldCheck,
  X,
  Check,
  Trash2,
  AlertTriangle,
  Users,
  Cloud,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  Employee,
  Role,
  getRoleLabel,
  isSuperAdminRole,
  isAdministrativeRole,
} from '@/lib/types';
import { isValidFirestoreDocId } from '@/lib/firestore-sync';

export function EmployeeManager() {
  const {
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    currentUser,
    isAuthenticated,
    firebaseUser,
    hasPendingLocalChanges,
    cloudSyncError,
    connectGoogleWorkspace,
    pushAllLocalToFirestore,
  } = useApp();

  const isCloudSessionActive = Boolean(firebaseUser) || (isAuthenticated && Boolean(currentUser.id));
  const isSuperAdmin = isSuperAdminRole(currentUser.role);
  const isAdmin = isAdministrativeRole(currentUser.role);

  const [searchTerm, setSearchTerm] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Employee>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<Employee | null>(null);
  const [confirmClearLegacy, setConfirmClearLegacy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [actionNotice, setActionNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const legacySampleEmployees = employees.filter(
    (e) => e.email.toLowerCase().endsWith('@as-sunnah.org') && e.id !== currentUser.id
  );

  // Password Setup Modal State
  const [passwordModalEmp, setPasswordModalEmp] = useState<Employee | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [passwordSavedMsg, setPasswordSavedMsg] = useState('');

  // Add Employee Modal State (Manual ID, NO automatic generation)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addFormData, setAddFormData] = useState({
    id: '',
    attendanceMachineId: '',
    name: '',
    nameBn: '',
    designation: '',
    designationBn: '',
    department: 'একাডেমিক ও শিক্ষা',
    email: '',
    phone: '',
    password: '123456',
    shiftSchedule: '09:00 - 17:00',
    bloodGroup: '',
    isAdminAccess: false,
  });

  const filteredEmployees = employees.filter((emp) => {
    const q = searchTerm.toLowerCase();
    return (
      emp.name.toLowerCase().includes(q) ||
      (emp.nameBn && emp.nameBn.toLowerCase().includes(q)) ||
      emp.id.toLowerCase().includes(q) ||
      emp.designation.toLowerCase().includes(q) ||
      (emp.designationBn && emp.designationBn.toLowerCase().includes(q)) ||
      emp.phone.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q)
    );
  });

  const handleManualSyncNow = async () => {
    setSyncingNow(true);
    setActionNotice(null);
    try {
      const count = await pushAllLocalToFirestore();
      setActionNotice({
        type: 'success',
        text: `Firestore ক্লাউডে মোট ${count} টি রেকর্ড সফলভাবে সিঙ্ক হয়েছে।`,
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Firestore সিঙ্ক ব্যর্থ হয়েছে।',
      });
    } finally {
      setSyncingNow(false);
    }
  };

  const handleConnectGoogleSync = async () => {
    setSyncingNow(true);
    setActionNotice(null);
    try {
      const res = await connectGoogleWorkspace();
      if (res) {
        setActionNotice({
          type: 'success',
          text: `Google ক্লাউড (${res.user.email}) সফলভাবে সংযুক্ত হয়েছে।`,
        });
      }
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Sign-In সম্পন্ন হয়নি।',
      });
    } finally {
      setSyncingNow(false);
    }
  };

  // Open Edit Modal (All text fields, no dropdowns)
  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditError(null);
    setEditFormData({
      id: emp.id,
      attendanceMachineId: emp.attendanceMachineId || '',
      name: emp.name,
      nameBn: emp.nameBn || emp.name,
      designation: emp.designation,
      designationBn: emp.designationBn || emp.designation,
      department: emp.department,
      email: emp.email,
      phone: emp.phone,
      password: emp.password || '',
      shiftSchedule: emp.shiftSchedule,
      bloodGroup: emp.bloodGroup || '',
      role: emp.role,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditError(null);

    const nextId = (editFormData.id ?? editingEmployee.id).trim();
    if (!isValidFirestoreDocId(nextId)) {
      setEditError(
        'সঠিক আইডি লিখুন (শুধুমাত্র ইংরেজি অক্ষর, সংখ্যা, হাইফেন (-) বা আন্ডারস্কোর (_) ব্যবহার করুন, সর্বোচ্চ ৬৪ অক্ষর)।'
      );
      return;
    }
    if (
      nextId !== editingEmployee.id &&
      employees.some(
        (emp) => emp.id !== editingEmployee.id && emp.id.toLowerCase() === nextId.toLowerCase()
      )
    ) {
      setEditError(`"${nextId}" আইডিটি ইতিমধ্যে অন্য একজন শিক্ষক/স্টাফের জন্য ব্যবহৃত হয়েছে।`);
      return;
    }

    setSaving(true);
    const res = await updateEmployee(editingEmployee.id, {
      ...editFormData,
      id: nextId,
      attendanceMachineId: (editFormData.attendanceMachineId || '').trim(),
    });
    setSaving(false);

    if (!res.ok) {
      setEditError(res.error || 'তথ্য আপডেট করা যায়নি।');
      return;
    }

    setEditingEmployee(null);
    if (res.syncedToCloud) {
      setActionNotice({
        type: 'success',
        text: `${editFormData.nameBn || editFormData.name} (${nextId})-এর তথ্য আপডেট ও Firestore ক্লাউডে সিঙ্ক হয়েছে।`,
      });
    } else {
      setActionNotice({
        type: 'warning',
        text:
          res.error ||
          'তথ্য স্থানীয়ভাবে আপডেট হয়েছে, কিন্তু Google ক্লাউডে সংযুক্ত না থাকায় এখনো Firestore-এ যায়নি।',
      });
    }
  };

  // Open Password Modal
  const handleOpenPasswordModal = (emp: Employee) => {
    setPasswordModalEmp(emp);
    setNewPasswordInput(emp.password || '');
    setPasswordSavedMsg('');
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalEmp || !newPasswordInput.trim()) return;
    setSaving(true);
    const res = await updateEmployee(passwordModalEmp.id, { password: newPasswordInput.trim() });
    setSaving(false);
    setPasswordSavedMsg(
      res.syncedToCloud
        ? 'পাসওয়ার্ড সংরক্ষিত ও Firestore ক্লাউডে সিঙ্ক হয়েছে!'
        : 'পাসওয়ার্ড স্থানীয়ভাবে সংরক্ষিত হয়েছে (ক্লাউড সিঙ্ক বাকি)!'
    );
    setTimeout(() => {
      setPasswordModalEmp(null);
      setPasswordSavedMsg('');
    }, 900);
  };

  // Toggle Admin Role (Super Admin feature)
  const handleToggleAdminRole = async (emp: Employee) => {
    if (!isSuperAdmin && !isAdmin) return;
    const isCurrentlyAdmin = isAdministrativeRole(emp.role);
    const nextRole: Role = isCurrentlyAdmin ? 'teacher' : 'admin_incharge';
    const res = await updateEmployee(emp.id, { role: nextRole });
    if (res.syncedToCloud) {
      setActionNotice({
        type: 'success',
        text: `${emp.nameBn || emp.name}-এর পারমিশন আপডেট ও Firestore-এ সিঙ্ক হয়েছে।`,
      });
    } else if (res.error) {
      setActionNotice({ type: 'warning', text: res.error });
    }
  };

  // Add New Employee Submit (Manual ID required)
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const cleanId = addFormData.id.trim();
    if (!isValidFirestoreDocId(cleanId)) {
      setAddError(
        'অবশ্যই সঠিক ইংরেজি অক্ষর/সংখ্যা দিয়ে আইডি লিখুন (যেমন: T-101 বা ASDRI-01)। স্পেস বা বাংলা অক্ষর দেবেন না।'
      );
      return;
    }
    if (employees.some((emp) => emp.id.toLowerCase() === cleanId.toLowerCase())) {
      setAddError(`"${cleanId}" আইডিটি ইতিমধ্যে তালিকাভুক্ত আছে। অন্য একটি আইডি বসান।`);
      return;
    }
    if (!addFormData.name.trim() && !addFormData.nameBn.trim()) {
      setAddError('শিক্ষক বা স্টাফের নাম লিখুন।');
      return;
    }

    const engName = addFormData.name.trim() || addFormData.nameBn.trim();
    const bnName = addFormData.nameBn.trim() || engName;
    const engDesig = addFormData.designation.trim() || addFormData.designationBn.trim() || 'Member';
    const bnDesig = addFormData.designationBn.trim() || engDesig;

    setSaving(true);
    const res = await addEmployee({
      id: cleanId,
      name: engName,
      nameBn: bnName,
      designation: engDesig,
      designationBn: bnDesig,
      department: addFormData.department.trim() || 'সাধারণ বিভাগ',
      email: addFormData.email.trim(),
      phone: addFormData.phone.trim(),
      password: addFormData.password.trim() || '123456',
      photoUrl: '',
      employmentType: 'পূর্ণকালীন',
      joiningDate: new Date().toISOString().split('T')[0],
      status: 'Active',
      attendanceMachineId: addFormData.attendanceMachineId.trim(),
      shiftSchedule: addFormData.shiftSchedule.trim() || '09:00 - 17:00',
      leavePolicy: 'সাধারণ নীতিমালা',
      bloodGroup: addFormData.bloodGroup.trim(),
      role: addFormData.isAdminAccess ? 'admin_incharge' : 'teacher',
    });
    setSaving(false);

    if (!res.ok) {
      setAddError(res.error || 'সংরক্ষণ করা যায়নি।');
      return;
    }

    setShowAddModal(false);
    setAddError(null);
    setAddFormData({
      id: '',
      attendanceMachineId: '',
      name: '',
      nameBn: '',
      designation: '',
      designationBn: '',
      department: 'একাডেমিক ও শিক্ষা',
      email: '',
      phone: '',
      password: '123456',
      shiftSchedule: '09:00 - 17:00',
      bloodGroup: '',
      isAdminAccess: false,
    });

    if (res.syncedToCloud) {
      setActionNotice({
        type: 'success',
        text: `${bnName} (আইডি: ${cleanId}) সফলভাবে যুক্ত ও Firestore ক্লাউডে সংরক্ষিত হয়েছে। এখন এই আইডি/ইমেইল/মোবাইল ও পাসওয়ার্ড দিয়ে যেকোনো ব্রাউজার থেকে লগইন করা যাবে।`,
      });
    } else {
      setActionNotice({
        type: 'warning',
        text:
          res.error ||
          `${bnName} (আইডি: ${cleanId}) স্থানীয়ভাবে যুক্ত হয়েছে, তবে Firestore ক্লাউডে সিঙ্ক হয়নি।`,
      });
    }
  };

  return (
    <div className="space-y-5 font-serif">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">
            শিক্ষক ও স্টাফ তালিকা ({employees.length} জন)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            সকল শিক্ষক ও স্টাফের প্রোফাইল আপডেট, লগইন পাসওয়ার্ড সেট এবং এডমিন পারমিশন নিয়ন্ত্রণ।
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setAddError(null);
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4 text-amber-300" />
            <span>নতুন শিক্ষক / স্টাফ যুক্ত করুন</span>
          </button>
        )}
      </div>

      {/* Firestore Cloud Connection & Action Notice */}
      {!isCloudSessionActive ? (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Firestore ক্লাউড এখনো সংযুক্ত নয়:</strong> শিক্ষক বা স্টাফের তথ্য সরাসরি Firestore ডাটাবেসে সেভ করতে Google দিয়ে ক্লাউড সিঙ্ক চালু করুন।
            </div>
          </div>
          <button
            type="button"
            disabled={syncingNow}
            onClick={handleConnectGoogleSync}
            className="px-3.5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto disabled:opacity-60"
          >
            <Cloud className="w-3.5 h-3.5 text-amber-300" />
            <span>{syncingNow ? 'সংযোগ হচ্ছে...' : 'Google দিয়ে সিঙ্ক চালু করুন'}</span>
          </button>
        </div>
      ) : (hasPendingLocalChanges || cloudSyncError) ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 text-rose-950">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong>অপেক্ষমাণ ক্লাউড সিঙ্ক:</strong>{' '}
              {cloudSyncError || 'কিছু স্থানীয় পরিবর্তন এখনো Firestore-এ পাঠানো বাকি রয়েছে।'}
            </div>
          </div>
          <button
            type="button"
            disabled={syncingNow}
            onClick={handleManualSyncNow}
            className="px-3.5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
            <span>{syncingNow ? 'সিঙ্ক হচ্ছে...' : 'এখনই Firestore-এ সিঙ্ক করুন'}</span>
          </button>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Firestore ক্লাউড সক্রিয়:</strong>{' '}
              <span className="font-mono text-emerald-900">
                {firebaseUser?.email || `আইডি: ${currentUser.id} (পোর্টাল সিঙ্ক)`}
              </span>{' '}
              — যেকোনো যোগ বা পরিবর্তন সরাসরি Firestore-এ সংরক্ষিত হবে।
            </span>
          </div>
          <button
            type="button"
            disabled={syncingNow}
            onClick={handleManualSyncNow}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${syncingNow ? 'animate-spin' : ''}`} />
            <span>{syncingNow ? 'সিঙ্ক হচ্ছে...' : 'সব ডেটা সিঙ্ক করুন'}</span>
          </button>
        </div>
      )}

      {actionNotice && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : actionNotice.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{actionNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Simple Search Input (No Dropdown Filters) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="নাম, আইডি, পদবী, ইমেইল বা মোবাইল নম্বর দিয়ে খুঁজুন..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 text-slate-900 focus:outline-none focus:border-emerald-700"
          />
        </div>
      </div>

      {/* Legacy Sample Cleanup Banner (shown only if old seeded entries exist in cloud) */}
      {isSuperAdmin && legacySampleEmployees.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>পুরোনো নমুনা তালিকা পাওয়া গেছে ({legacySampleEmployees.length} জন):</strong> আপনি চাইলে এক ক্লিকে পূর্বের নমুনা নামগুলো মুছে ফেলে সম্পূর্ণ ম্যানুয়ালি শিক্ষক ও স্টাফ যুক্ত করতে পারেন।
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmClearLegacy(true)}
            className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>পুরোনো নমুনা মুছুন</span>
          </button>
        </div>
      )}

      {/* Staff Directory: Mobile Cards + Desktop Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredEmployees.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3 text-xs text-slate-500">
            <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Users className="w-5 h-5" />
            </div>
            <div className="font-bold text-slate-800 text-sm">
              {employees.length === 0 ? 'এখনো কোনো শিক্ষক বা স্টাফ যুক্ত করা হয়নি' : 'কোনো ফলাফল পাওয়া যায়নি'}
            </div>
            <p className="max-w-sm mx-auto">
              {employees.length === 0
                ? 'উপরের "নতুন শিক্ষক / স্টাফ যুক্ত করুন" বাটনে ক্লিক করে প্রতিষ্ঠানের সবার নাম, পদবী ও ইমেইল যুক্ত করুন।'
                : 'অন্য নাম, আইডি বা মোবাইল নম্বর দিয়ে পুনরায় অনুসন্ধান করুন।'}
            </p>
          </div>
        ) : (
          <>
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredEmployees.map((emp) => {
            const empIsSuper = emp.role === 'super_admin';
            const empIsAdmin = isAdministrativeRole(emp.role);

            return (
              <div key={emp.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[11px]">
                        {emp.id}
                      </span>
                      <span className="font-bold text-slate-900 text-sm truncate">
                        {emp.nameBn || emp.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {emp.designationBn || emp.designation} · {emp.department}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold ${
                      empIsSuper
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : empIsAdmin
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {getRoleLabel(emp.role, true)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                  <div className="min-w-0">
                    <div className="font-mono text-slate-800">{emp.phone}</div>
                    {emp.email && <div className="text-slate-500 truncate">{emp.email}</div>}
                  </div>
                  <div className="shrink-0">
                    <span className="text-slate-500 mr-1">পাসওয়ার্ড:</span>
                    <span className="px-1.5 py-0.5 rounded bg-white font-mono text-slate-800 font-semibold border border-slate-200">
                      {emp.password || 'সেট করা (••••)'}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      onClick={() => handleOpenPasswordModal(emp)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold cursor-pointer flex items-center justify-center gap-1"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                      <span>পাসওয়ার্ড</span>
                    </button>

                    {!empIsSuper && (
                      <button
                        onClick={() => handleToggleAdminRole(emp)}
                        className={`flex-1 py-1.5 px-2.5 rounded-lg font-semibold cursor-pointer flex items-center justify-center gap-1 border ${
                          empIsAdmin
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{empIsAdmin ? 'এডমিন বাতিল' : 'এডমিন বানান'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenEditModal(emp)}
                      className="py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>এডিট</span>
                    </button>

                    {emp.id !== currentUser.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEmp(emp)}
                        title="মুছে ফেলুন"
                        className="py-1.5 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold cursor-pointer flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">আইডি</th>
                <th className="py-3 px-4">নাম</th>
                <th className="py-3 px-4">পদবী ও বিভাগ</th>
                <th className="py-3 px-4">লগইন তথ্য (ইমেইল ও মোবাইল)</th>
                <th className="py-3 px-4">পাসওয়ার্ড</th>
                <th className="py-3 px-4">পারমিশন</th>
                {isAdmin && <th className="py-3 px-4 text-right">নিয়ন্ত্রণ ও এডিট</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((emp) => {
                const empIsSuper = emp.role === 'super_admin';
                const empIsAdmin = isAdministrativeRole(emp.role);

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-900">
                      {emp.id}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{emp.nameBn || emp.name}</div>
                      <div className="text-[11px] text-slate-500">{emp.name}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">
                        {emp.designationBn || emp.designation}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {emp.designation} · {emp.department}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-mono text-slate-800">{emp.phone}</div>
                      <div className="text-[11px] text-slate-500">{emp.email}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-1 rounded bg-slate-100 font-mono text-slate-800 font-semibold border border-slate-200">
                        {emp.password || 'সেট করা (••••)'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                          empIsSuper
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : empIsAdmin
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {getRoleLabel(emp.role, true)}
                      </span>
                    </td>

                    {isAdmin && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Password Setup Button */}
                          <button
                            onClick={() => handleOpenPasswordModal(emp)}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold cursor-pointer flex items-center gap-1"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                            <span>পাসওয়ার্ড</span>
                          </button>

                          {/* Make Admin / Remove Admin Button */}
                          {!empIsSuper && (
                            <button
                              onClick={() => handleToggleAdminRole(emp)}
                              className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer flex items-center gap-1 border ${
                                empIsAdmin
                                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                              }`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>{empIsAdmin ? 'এডমিন বাতিল' : 'এডমিন বানান'}</span>
                            </button>
                          )}

                          {/* Edit Profile Button */}
                          <button
                            onClick={() => handleOpenEditModal(emp)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>এডিট</span>
                          </button>

                          {/* Delete Employee Button */}
                          {emp.id !== currentUser.id && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEmp(emp)}
                              title="মুছে ফেলুন"
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold cursor-pointer flex items-center justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>

      {/* Password Setup Modal */}
      {passwordModalEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-mono font-bold text-emerald-800">
                  আইডি: {passwordModalEmp.id}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  পাসওয়ার্ড সেট করুন — {passwordModalEmp.nameBn || passwordModalEmp.name}
                </h3>
              </div>
              <button
                onClick={() => setPasswordModalEmp(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>
                <strong>লগইন আইডি:</strong> <span className="font-mono">{passwordModalEmp.id}</span>
              </div>
              <div>
                <strong>মোবাইল:</strong> <span className="font-mono">{passwordModalEmp.phone}</span>
              </div>
              <div>
                <strong>ইমেইল:</strong> <span className="font-mono">{passwordModalEmp.email}</span>
              </div>
            </div>

            {passwordSavedMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200 flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>{passwordSavedMsg}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  নতুন পাসওয়ার্ড লিখুন
                </label>
                <input
                  type="text"
                  required
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="নতুন পাসওয়ার্ড লিখুন"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasswordModalEmp(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                >
                  পাসওয়ার্ড সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal — Strictly Text Inputs Only (NO Dropdowns) */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-emerald-800">
                  আইডি: {editingEmployee.id}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  তথ্য আপডেট করুন — {editingEmployee.nameBn || editingEmployee.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              {editError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    শিক্ষক / স্টাফ আইডি *
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.id || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, id: e.target.value })}
                    placeholder="যেমন: T-101 বা ASDRI-01"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono font-bold"
                  />
                  {editFormData.id && editFormData.id.trim() !== editingEmployee.id && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      আইডি পরিবর্তন করলে পূর্বের রেকর্ডও নতুন আইডিতে স্থানান্তরিত হবে।
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    হাজিরা মেশিন আইডি (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    value={editFormData.attendanceMachineId || ''}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, attendanceMachineId: e.target.value })
                    }
                    placeholder="যেমন: ZK-001 (না থাকলে খালি রাখুন)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">নাম (বাংলায়)</label>
                  <input
                    type="text"
                    required
                    value={editFormData.nameBn || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, nameBn: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">নাম (ইংরেজি)</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">পদবী (বাংলায়)</label>
                  <input
                    type="text"
                    required
                    value={editFormData.designationBn || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, designationBn: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">পদবী (ইংরেজি)</label>
                  <input
                    type="text"
                    required
                    value={editFormData.designation || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">বিভাগ</label>
                  <input
                    type="text"
                    value={editFormData.department || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">লগইন পাসওয়ার্ড</label>
                  <input
                    type="text"
                    value={editFormData.password || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                    placeholder={
                      editingEmployee.password
                        ? 'পাসওয়ার্ড পরিবর্তন করতে লিখুন'
                        : 'অপরিবর্তিত রাখতে ফাঁকা রাখুন'
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">মোবাইল নম্বর</label>
                  <input
                    type="text"
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">ইমেইল</label>
                  <input
                    type="email"
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">অফিস সময় / শিফট</label>
                  <input
                    type="text"
                    value={editFormData.shiftSchedule || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, shiftSchedule: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">রক্তের গ্রুপ</label>
                  <input
                    type="text"
                    value={editFormData.bloodGroup || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, bloodGroup: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              {/* Simple Button Radio Group for Permission (No Dropdown) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">সিস্টেম পারমিশন নির্বাচন করুন</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { val: 'super_admin', label: 'সুপার এডমিন' },
                    { val: 'admin_incharge', label: 'এডমিন' },
                    { val: 'teacher', label: 'শিক্ষক' },
                    { val: 'staff', label: 'স্টাফ' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setEditFormData({ ...editFormData, role: opt.val as Role })}
                      className={`py-2 px-3 rounded-lg font-bold text-xs border cursor-pointer transition-colors ${
                        editFormData.role === opt.val ||
                        (opt.val === 'admin_incharge' &&
                          (editFormData.role === 'director' ||
                            editFormData.role === 'assistant_director' ||
                            editFormData.role === 'coordinator'))
                          ? 'bg-emerald-900 text-white border-emerald-900'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 font-semibold rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ ও আপডেট করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal — Strictly Text Inputs Only (NO Dropdowns) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                নতুন শিক্ষক / স্টাফ যুক্ত করুন
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              {addError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    শিক্ষক / স্টাফ আইডি *
                  </label>
                  <input
                    type="text"
                    required
                    value={addFormData.id}
                    onChange={(e) => setAddFormData({ ...addFormData, id: e.target.value })}
                    placeholder="যেমন: T-101 বা ASDRI-01"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono font-bold"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    ইংরেজি অক্ষর, সংখ্যা, - বা _ দিয়ে ম্যানুয়ালি আইডি লিখুন (অটো তৈরি হবে না)।
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    হাজিরা মেশিন আইডি (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    value={addFormData.attendanceMachineId}
                    onChange={(e) =>
                      setAddFormData({ ...addFormData, attendanceMachineId: e.target.value })
                    }
                    placeholder="যেমন: ZK-001 (না থাকলে খালি রাখুন)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">নাম (বাংলায়) *</label>
                  <input
                    type="text"
                    required
                    value={addFormData.nameBn}
                    onChange={(e) => setAddFormData({ ...addFormData, nameBn: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">নাম (ইংরেজি) *</label>
                  <input
                    type="text"
                    required
                    value={addFormData.name}
                    onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">পদবী (বাংলায়) *</label>
                  <input
                    type="text"
                    required
                    value={addFormData.designationBn}
                    onChange={(e) => setAddFormData({ ...addFormData, designationBn: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">পদবী (ইংরেজি) *</label>
                  <input
                    type="text"
                    required
                    value={addFormData.designation}
                    onChange={(e) => setAddFormData({ ...addFormData, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">বিভাগ</label>
                  <input
                    type="text"
                    value={addFormData.department}
                    onChange={(e) => setAddFormData({ ...addFormData, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">লগইন পাসওয়ার্ড *</label>
                  <input
                    type="text"
                    required
                    value={addFormData.password}
                    onChange={(e) => setAddFormData({ ...addFormData, password: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">মোবাইল নম্বর *</label>
                  <input
                    type="text"
                    required
                    value={addFormData.phone}
                    onChange={(e) => setAddFormData({ ...addFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">ইমেইল</label>
                  <input
                    type="email"
                    value={addFormData.email}
                    onChange={(e) => setAddFormData({ ...addFormData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="new-emp-admin-check"
                  type="checkbox"
                  checked={addFormData.isAdminAccess}
                  onChange={(e) => setAddFormData({ ...addFormData, isAdminAccess: e.target.checked })}
                  className="w-4 h-4 accent-emerald-800 cursor-pointer"
                />
                <label htmlFor="new-emp-admin-check" className="font-bold text-slate-800 cursor-pointer">
                  এই কর্মকর্তাকে এডমিন পারমিশন দিন
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 font-semibold rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Single Employee Confirmation Modal */}
      {confirmDeleteEmp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-rose-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  শিক্ষক / স্টাফ মুছে ফেলার নিশ্চিতকরণ
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  আপনি কি নিশ্চিতভাবে{' '}
                  <strong className="text-slate-900">
                    {confirmDeleteEmp.nameBn || confirmDeleteEmp.name} ({confirmDeleteEmp.id})
                  </strong>{' '}
                  কে তালিকা ও Firestore ডাটাবেস থেকে মুছে ফেলতে চান?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteEmp(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDeleteEmp;
                  setConfirmDeleteEmp(null);
                  const res = await deleteEmployee(target.id);
                  if (res.syncedToCloud) {
                    setActionNotice({
                      type: 'success',
                      text: `${target.nameBn || target.name} (${target.id}) তালিকা ও Firestore থেকে মুছে ফেলা হয়েছে।`,
                    });
                  } else if (res.error) {
                    setActionNotice({ type: 'warning', text: res.error });
                  }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
              >
                হ্যাঁ, মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Legacy Sample Employees Confirmation Modal */}
      {confirmClearLegacy && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-rose-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  সকল পুরোনো নমুনা তালিকা মুছে ফেলুন
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  এতে আপনার নিজস্ব সুপার এডমিন আইডি ছাড়া পূর্বের{' '}
                  <strong className="text-slate-900">{legacySampleEmployees.length} টি</strong>{' '}
                  নমুনা প্রোফাইল স্থানীয় ব্রাউজার ও Firestore থেকে মুছে যাবে, যাতে আপনি ম্যানুয়ালি সবার নাম যুক্ত করতে পারেন।
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmClearLegacy(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targets = [...legacySampleEmployees];
                  setConfirmClearLegacy(false);
                  await Promise.all(targets.map((emp) => deleteEmployee(emp.id)));
                  setActionNotice({
                    type: 'success',
                    text: `সকল ${targets.length} টি পুরোনো নমুনা প্রোফাইল মুছে ফেলা হয়েছে।`,
                  });
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
              >
                হ্যাঁ, সব নমুনা মুছুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
