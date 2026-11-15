'use client';

import React, { useRef, useState } from 'react';
import {
  Cloud,
  UploadCloud,
  FileText,
  ExternalLink,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { SubmittedFileAttachment } from '@/lib/types';
import { useApp } from '@/lib/store';
import { getDriveAccessToken } from '@/lib/firebase';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface GoogleDriveFileUploaderProps {
  files: SubmittedFileAttachment[];
  onChange: (files: SubmittedFileAttachment[]) => void;
  taskSerial?: string | number;
  employeeId: string;
  employeeName: string;
}

export function GoogleDriveFileUploader({
  files,
  onChange,
  taskSerial,
  employeeId,
  employeeName,
}: GoogleDriveFileUploaderProps) {
  const { hasDriveToken, connectGoogleWorkspace } = useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [uploadingName, setUploadingName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingRemoveFile, setPendingRemoveFile] = useState<SubmittedFileAttachment | null>(null);
  const [deletingFromDrive, setDeletingFromDrive] = useState(false);

  const handleConnectDrive = async () => {
    setUploadError(null);
    setConnecting(true);
    try {
      await connectGoogleWorkspace();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Google Sign-In সম্পন্ন হয়নি। আবার চেষ্টা করুন।'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const accessToken = await getDriveAccessToken();
    if (!accessToken) {
      setUploadError('ফাইল আপলোড করার আগে অনুগ্রহ করে "Sign in with Google" বাটনে ক্লিক করে সংযোগ করুন।');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploadError(null);
    setUploading(true);

    const newAttachments: SubmittedFileAttachment[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadingName(file.name);

        const formData = new FormData();
        formData.append('file', file);
        if (taskSerial !== undefined) {
          formData.append('taskSerial', String(taskSerial));
        }
        formData.append('employeeId', employeeId);
        formData.append('employeeName', employeeName);

        const res = await fetch('/api/drive', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.ok || !data.attachment) {
          setUploadError(data.message || `${file.name} Google Drive-এ আপলোড করা যায়নি।`);
          break;
        }

        newAttachments.push(data.attachment as SubmittedFileAttachment);
      }

      if (newAttachments.length > 0) {
        onChange([...files, ...newAttachments]);
      }
    } catch {
      setUploadError('Google Drive ফাইল আপলোডের সময় নেটওয়ার্ক সমস্যা হয়েছে।');
    } finally {
      setUploading(false);
      setUploadingName('');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleDetachOnly = () => {
    if (!pendingRemoveFile) return;
    onChange(files.filter((f) => f.id !== pendingRemoveFile.id));
    setPendingRemoveFile(null);
  };

  const handleDeleteEverywhere = async () => {
    if (!pendingRemoveFile) return;
    const target = pendingRemoveFile;
    const driveId = target.driveFileId;

    if (!driveId) {
      handleDetachOnly();
      return;
    }

    const token = await getDriveAccessToken();
    if (!token) {
      setUploadError('Google Drive থেকে ফাইল মুছতে আগে Sign in with Google করুন।');
      setPendingRemoveFile(null);
      return;
    }

    setDeletingFromDrive(true);
    try {
      const res = await fetch(`/api/drive?fileId=${encodeURIComponent(driveId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.message || 'Google Drive থেকে ফাইলটি মুছা যায়নি।');
      } else {
        onChange(files.filter((f) => f.id !== target.id));
      }
    } catch {
      setUploadError('Google Drive থেকে ফাইল মুছতে সমস্যা হয়েছে।');
    } finally {
      setDeletingFromDrive(false);
      setPendingRemoveFile(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="block font-bold text-slate-700 text-xs">
          ফাইল সংযুক্ত করুন (Google Drive ক্লাউড স্টোরেজ)
        </label>
        <span className="text-[10px] text-emerald-700 font-semibold inline-flex items-center gap-1">
          <Cloud className="w-3 h-3" />
          Google Drive Sync
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleFilesSelected}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.png,.jpg,.jpeg,.webp"
        className="hidden"
      />

      {!hasDriveToken ? (
        <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/70 space-y-2.5 text-center">
          <p className="text-[11px] text-slate-700">
            সরাসরি Google Drive-এ ফাইল আপলোড করতে অনুগ্রহ করে আপনার Google অ্যাকাউন্ট দিয়ে যুক্ত হোন:
          </p>
          <div className="flex justify-center">
            <GoogleSignInButton
              onClick={handleConnectDrive}
              loading={connecting}
              label="Sign in with Google"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-500 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 text-center disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 text-emerald-700 animate-spin" />
              <span className="text-xs font-bold text-emerald-900">
                Google Drive-এ আপলোড হচ্ছে: {uploadingName}...
              </span>
            </>
          ) : (
            <>
              <UploadCloud className="w-5 h-5 text-emerald-700" />
              <span className="text-xs font-bold text-slate-800">
                ফাইল নির্বাচন করতে এখানে ক্লিক করুন (PDF, Word, Excel, ছবি)
              </span>
              <span className="text-[10px] text-slate-500">
                সর্বোচ্চ ২৫ MB · ফাইল সরাসরি Google Drive ফোল্ডারে সেভ হবে
              </span>
            </>
          )}
        </button>
      )}

      {uploadError && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                <div className="min-w-0">
                  <a
                    href={file.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-emerald-800 hover:underline truncate block"
                  >
                    {file.fileName}
                  </a>
                  <span className="text-[10px] text-slate-500">
                    {formatBytes(file.fileSize)} ·{' '}
                    {file.storageProvider === 'onedrive'
                      ? 'আগের স্টোরেজে সংরক্ষিত'
                      : 'Google Drive-এ সংরক্ষিত'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={file.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Google Drive-এ দেখুন"
                  className="p-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setPendingRemoveFile(file)}
                  title="তালিকা থেকে সরান"
                  className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mandatory User Confirmation Dialog for Removing/Deleting Uploaded Drive File */}
      {pendingRemoveFile && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  সংযুক্ত ফাইল সরানো নিশ্চিত করুন
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  আপনি{' '}
                  <strong className="text-slate-900">&ldquo;{pendingRemoveFile.fileName}&rdquo;</strong>{' '}
                  ফাইলটি এই কাজের জমা থেকে সরাতে চাচ্ছেন। আপনি কি শুধু তালিকা থেকে সরাবেন, নাকি Google Drive থেকেও স্থায়ীভাবে মুছবেন?
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={deletingFromDrive}
                onClick={() => setPendingRemoveFile(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={deletingFromDrive}
                onClick={handleDetachOnly}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
              >
                শুধু তালিকা থেকে সরান
              </button>
              {pendingRemoveFile.driveFileId && (
                <button
                  type="button"
                  disabled={deletingFromDrive}
                  onClick={handleDeleteEverywhere}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                >
                  {deletingFromDrive ? 'মুছা হচ্ছে...' : 'Drive থেকেও মুছুন'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SubmissionFilesBadges({ files }: { files?: SubmittedFileAttachment[] }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <a
          key={file.id}
          href={file.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-semibold text-emerald-900 transition-colors"
        >
          <Cloud className="w-3 h-3 text-emerald-700 shrink-0" />
          <span className="max-w-[140px] truncate">{file.fileName}</span>
          <ExternalLink className="w-2.5 h-2.5 text-emerald-700 shrink-0" />
        </a>
      ))}
    </div>
  );
}
