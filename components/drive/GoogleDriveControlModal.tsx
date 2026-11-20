'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  RefreshCw,
  LogOut,
  FolderOpen,
  Database,
  Trash2,
  UploadCloud,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { getDriveAccessToken } from '@/lib/firebase';
import firebaseConfig from '@/firebase-applet-config.json';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import type { FirestoreVerificationStats } from '@/lib/firestore-sync';
import {
  listDriveSubmissionFiles,
  uploadBackupToDrive,
  deleteDriveSubmissionFile,
} from '@/lib/client-drive';

interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  createdTime?: string;
  description?: string;
}

function formatBytes(sizeStr?: string): string {
  const bytes = Number(sizeStr || 0);
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface GoogleDriveControlModalProps {
  isAdmin: boolean;
  compact?: boolean;
}

export function GoogleDriveStatusButton({ isAdmin, compact = false }: GoogleDriveControlModalProps) {
  const {
    currentUser,
    firebaseUser,
    hasDriveToken,
    cloudSyncStatus,
    cloudLastSyncedAt,
    cloudSyncError,
    hasPendingLocalChanges,
    clearCloudSyncError,
    connectGoogleWorkspace,
    disconnectGoogleWorkspace,
    pushAllLocalToFirestore,
    verifyFirestoreCloudData,
    employees,
    attendanceRecords,
    leaveBalances,
    leaveApplications,
    actionTrackerItems,
    meetings,
    calendarEvents,
    policy,
    institutionalLeavePolicy,
  } = useApp();

  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncingDb, setSyncingDb] = useState(false);
  const [verifyingDb, setVerifyingDb] = useState(false);
  const [verifiedStats, setVerifiedStats] = useState<FirestoreVerificationStats | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [folderUrl, setFolderUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const firestoreConsoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data`;

  // Explicit User Confirmation Modal States (No silent Drive mutations!)
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<DriveFileItem | null>(null);
  const [confirmBackup, setConfirmBackup] = useState(false);

  const loadDriveFiles = useCallback(async () => {
    const token = await getDriveAccessToken();
    if (!token) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await listDriveSubmissionFiles(token);
      if (!data.ok) {
        setErrorMsg(data.message || 'Google Drive ফাইল লোড করা যায়নি।');
        return;
      }
      setDriveFiles(data.files || []);
      setFolderUrl(data.folderUrl || null);
    } catch {
      setErrorMsg('Google Drive-এর সাথে সংযোগ করতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showModal || !hasDriveToken) return;
    const timer = setTimeout(() => {
      void loadDriveFiles();
    }, 0);
    return () => clearTimeout(timer);
  }, [showModal, hasDriveToken, loadDriveFiles]);

  const handleGoogleConnect = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setLoading(true);
    try {
      const result = await connectGoogleWorkspace();
      if (result) {
        setStatusMsg('Google Drive ও Firebase ক্লাউড সফলভাবে সংযুক্ত হয়েছে।');
        await loadDriveFiles();
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Google Sign-In সম্পন্ন হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await disconnectGoogleWorkspace();
      setDriveFiles([]);
      setFolderUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncDatabase = async () => {
    setSyncingDb(true);
    setErrorMsg(null);
    setStatusMsg(null);
    clearCloudSyncError();
    try {
      const count = await pushAllLocalToFirestore();
      const stats = await verifyFirestoreCloudData();
      setVerifiedStats(stats);
      setStatusMsg(
        `Firebase Firestore-এ মোট ${count} টি রেকর্ড পাঠানো ও সার্ভার থেকে যাচাই সম্পন্ন হয়েছে (শিক্ষক/স্টাফ: ${stats.employees}, হাজিরা: ${stats.attendanceRecords})।`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Firestore সিঙ্ক ব্যর্থ হয়েছে।');
    } finally {
      setSyncingDb(false);
    }
  };

  const handleVerifyServerOnly = async () => {
    setVerifyingDb(true);
    setErrorMsg(null);
    try {
      const stats = await verifyFirestoreCloudData();
      setVerifiedStats(stats);
      setStatusMsg(
        `Firestore সার্ভার যাচাই সম্পন্ন (${new Date(stats.verifiedAt).toLocaleTimeString()})।`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Firestore সার্ভার যাচাই ব্যর্থ হয়েছে।');
    } finally {
      setVerifyingDb(false);
    }
  };

  const executeConfirmedDriveBackup = async () => {
    setConfirmBackup(false);
    const token = await getDriveAccessToken();
    if (!token) {
      setErrorMsg('Google Drive সেশন মেয়াদোত্তীর্ণ হয়েছে। অনুগ্রহ করে পুনরায় Sign in with Google করুন।');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const snapshotPayload = {
        exportedAt: new Date().toISOString(),
        portal: 'ASDRI Portal',
        employeesCount: employees.length,
        employees,
        attendanceRecords,
        leaveBalances,
        leaveApplications,
        actionTrackerItems,
        meetings,
        calendarEvents,
        policy,
        institutionalLeavePolicy,
      };

      const data = await uploadBackupToDrive({
        accessToken: token,
        fileName: `ASDRI_Backup_${new Date().toISOString().slice(0, 10)}.json`,
        data: snapshotPayload,
      });
      if (!data.ok) {
        setErrorMsg(data.message || 'Google Drive ব্যাকআপ সেভ করা যায়নি।');
        return;
      }
      setStatusMsg('সকল প্রতিষ্ঠানের তথ্যের ব্যাকআপ Google Drive-এ সংরক্ষিত হয়েছে।');
      await loadDriveFiles();
    } catch {
      setErrorMsg('ব্যাকআপ তৈরি করতে নেটওয়ার্ক সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const executeConfirmedDeleteDriveFile = async () => {
    if (!confirmDeleteFile) return;
    const targetFile = confirmDeleteFile;
    setConfirmDeleteFile(null);

    const token = await getDriveAccessToken();
    if (!token) {
      setErrorMsg('ফাইল মুছতে পুনরায় Sign in with Google করুন।');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const data = await deleteDriveSubmissionFile(token, targetFile.id);
      if (!data.ok) {
        setErrorMsg(data.message || 'Google Drive থেকে ফাইলটি মুছা যায়নি।');
        return;
      }
      setDriveFiles((prev) => prev.filter((f) => f.id !== targetFile.id));
      setStatusMsg(`"${targetFile.name}" ফাইলটি Google Drive থেকে মুছে ফেলা হয়েছে।`);
    } catch {
      setErrorMsg('ফাইল মুছতে সমস্যা হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const isFullyConnected = Boolean(firebaseUser && hasDriveToken);
  const isCloudConnectedOnly = Boolean((firebaseUser || currentUser?.id) && !hasDriveToken);
  const hasSyncError = cloudSyncStatus === 'error' || Boolean(cloudSyncError);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        title={
          hasSyncError
            ? cloudSyncError || 'ক্লাউড সিঙ্ক ব্যর্থ হয়েছে'
            : isFullyConnected
            ? 'Google Drive ও Cloud সক্রিয়'
            : isCloudConnectedOnly
            ? 'Firebase Cloud সক্রিয়'
            : 'Google Drive ও Cloud সংযোগ করুন'
        }
        className={`${
          compact ? 'px-2 sm:px-2.5 py-1.5 text-[11px]' : 'px-3 py-1.5 text-xs'
        } font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
          hasSyncError
            ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300'
            : isFullyConnected
            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
            : isCloudConnectedOnly
            ? 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-200'
            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
        }`}
      >
        {hasSyncError ? (
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        ) : (
          <Cloud
            className={`w-3.5 h-3.5 shrink-0 ${
              isFullyConnected
                ? 'text-emerald-700'
                : isCloudConnectedOnly
                ? 'text-sky-700'
                : 'text-amber-600'
            }`}
          />
        )}
        <span className={compact ? 'hidden sm:inline' : ''}>
          {hasSyncError
            ? 'সিঙ্ক সমস্যা'
            : cloudSyncStatus === 'syncing'
            ? 'সিঙ্ক হচ্ছে...'
            : isFullyConnected
            ? 'Drive ও Cloud সক্রিয়'
            : isCloudConnectedOnly
            ? 'Cloud সক্রিয়'
            : 'Cloud সংযোগ'}
        </span>
        {hasPendingLocalChanges && !hasSyncError && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="অপেক্ষমাণ পরিবর্তন রয়েছে" />
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Google Drive ও Firebase ক্লাউড স্টোরেজ
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    প্রতিষ্ঠানের কাজের ফাইল Google Drive-এ এবং সকল রেকর্ড স্থায়ীভাবে Firebase Firestore-এ সংরক্ষিত থাকবে।
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(errorMsg || cloudSyncError) && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg || cloudSyncError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    clearCloudSyncError();
                  }}
                  className="text-rose-500 hover:text-rose-700 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {statusMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{statusMsg}</span>
              </div>
            )}

            {/* Firebase Cloud Firestore Status Card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Database className="w-4 h-4 text-emerald-700" />
                  <span>Firebase Firestore স্থায়ী ডাটাবেস</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasPendingLocalChanges && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      অপেক্ষমাণ পরিবর্তন
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      cloudSyncStatus === 'error'
                        ? 'bg-rose-100 text-rose-800'
                        : cloudSyncStatus === 'synced'
                        ? 'bg-emerald-100 text-emerald-800'
                        : cloudSyncStatus === 'syncing'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {cloudSyncStatus === 'error'
                      ? 'সিঙ্ক ব্যর্থ'
                      : cloudSyncStatus === 'synced'
                      ? 'সিঙ্ক সম্পন্ন'
                      : cloudSyncStatus === 'syncing'
                      ? 'সিঙ্ক হচ্ছে...'
                      : 'অফলাইন / সংযোগহীন'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-700 space-y-1.5">
                <div>
                  <strong>প্রজেক্ট:</strong>{' '}
                  <span className="font-mono text-slate-900">{firebaseConfig.projectId}</span>
                </div>
                <div className="break-all">
                  <strong>Firestore ডাটাবেস আইডি:</strong>{' '}
                  <code className="font-mono text-emerald-900 bg-emerald-50 px-1 py-0.5 rounded">
                    {firebaseConfig.firestoreDatabaseId}
                  </code>
                </div>
                <div className="text-[10px] text-slate-500">
                  Firebase Console-এ <code className="font-mono">(default)</code>-এর বদলে এই নির্দিষ্ট ডাটাবেসটি খোলা থাকলে সকল সংরক্ষিত ডেটা সরাসরি দেখতে পাবেন।
                </div>
                <div>
                  <a
                    href={firestoreConsoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:underline"
                  >
                    <span>সঠিক Firestore ডাটাবেস Console-এ খুলুন</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-600 font-medium">
                  স্থানীয় ক্যাশ: স্টাফ {employees.length} · হাজিরা {attendanceRecords.length} · মিটিং {meetings.length} · ক্যালেন্ডার {calendarEvents.length} · সিদ্ধান্ত {actionTrackerItems.length}
                </div>
                {verifiedStats && (
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-950 font-semibold">
                    সার্ভার যাচাইকৃত Firestore রেকর্ড: স্টাফ {verifiedStats.employees} · হাজিরা{' '}
                    {verifiedStats.attendanceRecords} · ছুটি {verifiedStats.leaveApplications} · মিটিং{' '}
                    {verifiedStats.meetings} · ক্যালেন্ডার {verifiedStats.calendarEvents} · সিদ্ধান্ত{' '}
                    {verifiedStats.actionTrackerItems}
                  </div>
                )}
              </div>

              {firebaseUser || currentUser?.id ? (
                <div className="space-y-2">
                  <div className="text-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {firebaseUser ? (
                        <>
                          <strong>সংযুক্ত অ্যাকাউন্ট:</strong> {firebaseUser.displayName || 'User'}{' '}
                          <span className="font-mono text-emerald-800">({firebaseUser.email})</span>
                          {!firebaseUser.emailVerified && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                              ইমেইল যাচাইকৃত নয়
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <strong>পোর্টাল সেশন:</strong> {currentUser.nameBn || currentUser.name}{' '}
                          <span className="font-mono text-emerald-800">({currentUser.id})</span>
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            আইডি ও পাসওয়ার্ড ক্লাউড সিঙ্ক সক্রিয়
                          </span>
                        </>
                      )}
                    </span>
                    {cloudLastSyncedAt && (
                      <span className="text-[10px] text-slate-500">
                        সর্বশেষ সিঙ্ক: {new Date(cloudLastSyncedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={syncingDb}
                      onClick={handleSyncDatabase}
                      className="px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingDb ? 'animate-spin' : ''}`} />
                      <span>
                        {syncingDb
                          ? 'ক্লাউডে পাঠানো হচ্ছে...'
                          : isAdmin
                          ? 'সকল ডেটা Firestore-এ সিঙ্ক করুন'
                          : 'আমার তথ্য Firestore-এ সিঙ্ক করুন'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={verifyingDb || syncingDb}
                      onClick={handleVerifyServerOnly}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Database className={`w-3.5 h-3.5 text-emerald-700 ${verifyingDb ? 'animate-pulse' : ''}`} />
                      <span>{verifyingDb ? 'যাচাই হচ্ছে...' : 'সার্ভার ডেটা যাচাই'}</span>
                    </button>

                    {isAdmin && hasDriveToken && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setConfirmBackup(true)}
                        className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Drive-এ ব্যাকআপ রাখুন</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Google Drive Connection & Files */}
            {!hasDriveToken ? (
              <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 space-y-3 text-xs">
                <div className="flex items-start gap-2 font-bold text-sky-950">
                  <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                  <span>
                    {firebaseUser
                      ? 'এই সেশনে Google Drive অ্যাক্সেস পুনঃসংযোগ করুন'
                      : 'ফাইল আপলোড ও ব্যাকআপের জন্য Google Drive যুক্ত করুন (ঐচ্ছিক)'}
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  কাজ জমা দেওয়ার ফাইল সরাসরি আপনার Google Drive-এর{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border border-sky-200 font-mono text-[11px]">
                    ASDRI Work Submissions
                  </code>{' '}
                  ফোল্ডারে সংরক্ষিত হবে।
                </p>
                <GoogleSignInButton
                  onClick={handleGoogleConnect}
                  loading={loading}
                  fullWidth
                  label="Sign in with Google"
                />
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <FolderOpen className="w-4 h-4 text-amber-600" />
                    <span>Google Drive ফোল্ডার: ASDRI Work Submissions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {folderUrl && (
                      <a
                        href={folderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-700 hover:underline inline-flex items-center gap-1 font-semibold"
                      >
                        <span>Drive-এ খুলুন</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={loadDriveFiles}
                      disabled={loading}
                      title="ফাইল তালিকা রিফ্রেশ"
                      className="p-1 text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {driveFiles.length === 0 ? (
                  <div className="py-4 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    এই ফোল্ডারে এখনো কোনো ফাইল আপলোড করা হয়নি।
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {driveFiles.map((f) => (
                      <div
                        key={f.id}
                        className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-sky-700 shrink-0" />
                          <div className="min-w-0">
                            <a
                              href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-slate-900 hover:text-sky-700 hover:underline truncate block"
                            >
                              {f.name}
                            </a>
                            <span className="text-[10px] text-slate-500">
                              {formatBytes(f.size)}
                              {f.createdTime
                                ? ` · ${new Date(f.createdTime).toLocaleDateString()}`
                                : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Google Drive-এ দেখুন"
                            className="p-1.5 rounded bg-sky-50 hover:bg-sky-100 text-sky-700"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteFile(f)}
                            title="Google Drive থেকে মুছুন"
                            className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              {firebaseUser ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleDisconnect}
                  className="px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Google সংযোগ বিচ্ছিন্ন</span>
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Confirmation Dialog: Create Backup in Google Drive */}
      {confirmBackup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start gap-2.5">
              <UploadCloud className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  Google Drive-এ ব্যাকআপ সংরক্ষণ নিশ্চিত করুন
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  প্রতিষ্ঠানের সকল কর্মী, উপস্থিতি, ছুটি, ক্যালেন্ডার ও সিদ্ধান্ত ট্র্যাকারের বর্তমান তথ্যের একটি JSON ব্যাকআপ ফাইল আপনার Google Drive ফোল্ডারে (<code className="bg-slate-100 px-1 rounded">ASDRI Work Submissions</code>) তৈরি ও সংরক্ষণ করা হবে।
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmBackup(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={executeConfirmedDriveBackup}
                className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold cursor-pointer"
              >
                হ্যাঁ, Drive-এ ব্যাকআপ তৈরি করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Confirmation Dialog: Delete File from Google Drive */}
      {confirmDeleteFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-rose-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  Google Drive থেকে ফাইল মুছে ফেলার নিশ্চিতকরণ
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  আপনি কি নিশ্চিতভাবে{' '}
                  <strong className="text-slate-900">&ldquo;{confirmDeleteFile.name}&rdquo;</strong>{' '}
                  ফাইলটি Google Drive থেকে মুছে ফেলতে চান? এটি পুনরুদ্ধার করা সম্ভব নাও হতে পারে।
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteFile(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={executeConfirmedDeleteDriveFile}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
              >
                নিশ্চিত, Google Drive থেকে মুছুন
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
