'use client';

import React, { useState } from 'react';
import { Cloud, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { AppProvider, useApp } from '@/lib/store';
import { resolveInstitutionLogo } from '@/lib/initial-data';
import { Header } from '@/components/layout/Header';
import { PersonalWorkspace } from '@/components/workspace/PersonalWorkspace';
import { EmployeeManager } from '@/components/employee/EmployeeManager';
import { AttendanceDashboard } from '@/components/attendance/AttendanceDashboard';
import { LeaveManagement } from '@/components/leave/LeaveManagement';
import { MeetingManagement } from '@/components/meeting/MeetingManagement';
import { ActionTracker } from '@/components/action-tracker/ActionTracker';
import { AnnualCalendar } from '@/components/calendar/AnnualCalendar';
import { LoginScreen } from '@/components/auth/LoginScreen';

function CloudSyncStatusBanner() {
  const {
    firebaseAuthReady,
    firebaseUser,
    cloudSyncStatus,
    cloudSyncError,
    hasPendingLocalChanges,
    clearCloudSyncError,
    connectGoogleWorkspace,
    pushAllLocalToFirestore,
  } = useApp();

  const [busy, setBusy] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [dismissedDisconnect, setDismissedDisconnect] = useState(false);

  if (!firebaseAuthReady) return null;

  const hasError = cloudSyncStatus === 'error' || Boolean(cloudSyncError);

  if (!hasError && firebaseUser && !hasPendingLocalChanges) {
    return null;
  }

  if (!firebaseUser && dismissedDisconnect && !hasPendingLocalChanges && !hasError) {
    return null;
  }

  const handleQuickConnect = async () => {
    setBusy(true);
    setBannerMsg(null);
    try {
      await connectGoogleWorkspace();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'Google সংযোগ সম্পন্ন হয়নি।');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickSync = async () => {
    setBusy(true);
    setBannerMsg(null);
    clearCloudSyncError();
    try {
      await pushAllLocalToFirestore();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'ক্লাউড সিঙ্ক ব্যর্থ হয়েছে।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`border-b text-xs ${
        hasError
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-amber-50 border-amber-200 text-amber-950'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {hasError ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <Cloud className="w-4 h-4 text-amber-700 shrink-0" />
          )}
          <span className="truncate sm:whitespace-normal font-medium">
            {hasError
              ? cloudSyncError || bannerMsg || 'ক্লাউড সিঙ্ক ব্যর্থ হয়েছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।'
              : !firebaseUser
              ? 'ক্লাউড সিঙ্ক বন্ধ আছে — আপনার কাজ বর্তমানে কেবল এই ব্রাউজারে সেভ হচ্ছে। সব ডিভাইসে সিঙ্ক করতে Google দিয়ে যুক্ত হোন।'
              : 'আপনার কিছু স্থানীয় পরিবর্তন ক্লাউডে সিঙ্ক করার অপেক্ষায় আছে।'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!firebaseUser ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleQuickConnect}
              className="px-3 py-1 rounded-md bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>{busy ? 'সংযোগ হচ্ছে...' : 'Google দিয়ে সিঙ্ক চালু করুন'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={handleQuickSync}
              className="px-3 py-1 rounded-md bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>{busy ? 'সিঙ্ক হচ্ছে...' : 'এখনই ক্লাউডে সিঙ্ক করুন'}</span>
            </button>
          )}

          {hasError ? (
            <button
              type="button"
              onClick={() => {
                setBannerMsg(null);
                clearCloudSyncError();
              }}
              aria-label="বন্ধ করুন"
              className="p-1 rounded text-rose-600 hover:bg-rose-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : !firebaseUser && !hasPendingLocalChanges ? (
            <button
              type="button"
              onClick={() => setDismissedDisconnect(true)}
              aria-label="বন্ধ করুন"
              className="p-1 rounded text-amber-700 hover:bg-amber-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MainAppContent() {
  const { hydrated, isAuthenticated, activeNav, setActiveNav, policy } = useApp();
  const activeLogoUrl = resolveInstitutionLogo(policy.institutionLogoUrl);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 font-serif text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 p-1.5 shadow-2xs flex items-center justify-center overflow-hidden animate-pulse">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeLogoUrl}
              alt="ASDRI Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span>পোর্টাল লোড হচ্ছে...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-serif overflow-x-clip">
      <Header />
      <CloudSyncStatusBanner />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {activeNav === 'workspace' && (
          <PersonalWorkspace
            onOpenApplyLeave={() => setActiveNav('leaves')}
            onOpenCorrection={() => setActiveNav('attendance')}
          />
        )}

        {activeNav === 'action-tracker' && <ActionTracker />}
        {activeNav === 'meetings' && <MeetingManagement />}
        {activeNav === 'attendance' && <AttendanceDashboard />}
        {activeNav === 'leaves' && <LeaveManagement />}
        {activeNav === 'calendar' && <AnnualCalendar key="calendar-month" initialTab="month" />}
        {activeNav === 'calendar-policy' && <AnnualCalendar key="calendar-policy" initialTab="leave-policy" />}
        {activeNav === 'employees' && <EmployeeManager />}
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-bold text-slate-800">ASDRI Portal</span> · আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট
          </div>
          <div>অভ্যন্তরীণ ব্যবস্থাপনা ও সিদ্ধান্ত ট্র্যাকার সিস্টেম</div>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
