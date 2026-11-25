'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp, getDhakaDateTime } from '@/lib/store';
import { AttendanceStatus, Employee, isAdministrativeRole } from '@/lib/types';
import { getDayOperationalStatus, enumerateDateRange, toBnDigits } from '@/lib/calendar-utils';
import { QrPunchScannerModal, useQrCameraPunch } from '@/components/attendance/QrPunchScannerModal';
import { ZkTecoMachinePanel } from '@/components/attendance/ZkTecoMachinePanel';
import { generateDynamicQrToken } from '@/lib/client-qr';
import QRCode from 'qrcode';
import {
  MapPin,
  QrCode,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  RefreshCw,
  Calendar,
  Users,
  Search,
  Filter,
  FileCheck,
  Settings,
  History,
  LogIn,
  LogOut,
  Camera,
  Edit3,
  Plus,
  Trash2,
  Download,
  Paperclip,
  Building2,
  UserCheck,
  AlertCircle,
  Cpu,
} from 'lucide-react';

function calculateHaversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatDurationBn(minutes: number): string {
  if (!minutes || minutes <= 0) return '০ মিনিট';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} মিনিট`;
  if (mins === 0) return `${hrs} ঘণ্টা`;
  return `${hrs} ঘণ্টা ${mins} মি.`;
}

export function AttendanceDashboard() {
  const {
    currentUser,
    employees,
    attendanceRecords,
    corrections,
    leaveApplications,
    auditLogs,
    policy,
    syncOfflinePunches,
    adminEditAttendanceRecord,
    getEmployeeLeaveOnDate,
    submitCorrectionRequest,
    approveCorrectionRequest,
    rejectCorrectionRequest,
    updatePolicy,
    calendarEvents,
    createCalendarEventsBatch,
    deleteCalendarEvent,
  } = useApp();

  const isAdmin = isAdministrativeRole(currentUser.role);

  // Main View Mode: 'personal' vs 'admin' vs 'office_qr'
  const [requestedMainView, setRequestedMainView] = useState<'personal' | 'admin' | 'office_qr'>('personal');
  const [adminTab, setAdminTab] = useState<
    'daily' | 'monthly' | 'corrections' | 'policy' | 'audit' | 'zkteco'
  >('daily');

  // Enforce role security: Only Admins and Super Admins can access 'office_qr' or 'admin' views
  const mainView: 'personal' | 'admin' | 'office_qr' = useMemo(() => {
    if (!isAdmin) return 'personal';
    return requestedMainView;
  }, [isAdmin, requestedMainView]);

  const setMainView = (v: 'personal' | 'admin' | 'office_qr') => {
    if (!isAdmin) {
      setRequestedMainView('personal');
    } else {
      setRequestedMainView(v);
    }
  };

  // Live Bangladesh Clock (Asia/Dhaka)
  const [dhakaClock, setDhakaClock] = useState<{ dateStr: string; timeStr: string; shortTime: string }>(() =>
    getDhakaDateTime()
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setDhakaClock(getDhakaDateTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      syncOfflinePunches();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [syncOfflinePunches]);

  // GPS State
  const [gpsState, setGpsState] = useState<{
    status: 'idle' | 'locating' | 'ready' | 'error';
    lat?: number;
    lng?: number;
    accuracy?: number;
    distanceMeters?: number;
    errorMessage?: string;
  }>({ status: 'idle' });

  const fetchGpsLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsState({
        status: 'error',
        errorMessage: 'আপনার ব্রাউজারে GPS সমর্থিত নয়।',
      });
      return;
    }

    setGpsState((prev) => ({ ...prev, status: 'locating', errorMessage: undefined }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 15);
        const dist = calculateHaversineMeters(
          lat,
          lng,
          policy.campusLat ?? 23.7985,
          policy.campusLng ?? 90.4255
        );
        setGpsState({
          status: 'ready',
          lat,
          lng,
          accuracy,
          distanceMeters: dist,
        });
      },
      (err) => {
        let msg = 'GPS লোকেশন পাওয়া যায়নি। আপনার ডিভাইসের Location / GPS Permission চালু করুন।';
        if (err.code === 1) {
          msg = 'GPS Permission বন্ধ রয়েছে। ব্রাউজারে Location Permission Allow করুন।';
        }
        setGpsState({
          status: 'error',
          errorMessage: msg,
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [policy.campusLat, policy.campusLng]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchGpsLocation();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchGpsLocation]);

  // Dynamic Server QR State & Real Generated QR Data URL
  const [serverQr, setServerQr] = useState<{
    token: string;
    shortCode: string;
    remainingSeconds: number;
    rotationSeconds: number;
    serverTime: string;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const fetchDynamicQr = useCallback(async () => {
    try {
      const rot = policy.qrRotationSeconds || 30;
      const data = generateDynamicQrToken(rot);
      setServerQr({
        token: data.token,
        shortCode: data.shortCode,
        remainingSeconds: data.remainingSeconds,
        rotationSeconds: data.rotationSeconds,
        serverTime: data.serverTime,
      });

      try {
        const url = await QRCode.toDataURL(data.token, {
          width: 280,
          margin: 1,
          color: {
            dark: '#0f4c3a',
            light: '#ffffff',
          },
        });
        setQrDataUrl(url);
      } catch {
        // Fallback if canvas render fails
      }
    } catch {
      // Ignore transient errors
    }
  }, [policy.qrRotationSeconds]);

  useEffect(() => {
    const initTimer = setTimeout(() => {
      fetchDynamicQr();
    }, 0);
    const interval = setInterval(fetchDynamicQr, 2000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [fetchDynamicQr]);

  // Punch Execution Feedback
  const [punchFeedback, setPunchFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const { scannerProps, openCameraPunch } = useQrCameraPunch((result) => {
    setPunchFeedback({
      type: result.isOfflinePending ? 'warning' : result.ok ? 'success' : 'error',
      message: result.message,
    });
    fetchDynamicQr();
  });

  const todayStr = dhakaClock.dateStr;

  // Current User's Today Record
  const myTodayRecord = useMemo(() => {
    return attendanceRecords.find(
      (r) => r.employeeId === currentUser.id && r.date === todayStr
    );
  }, [attendanceRecords, currentUser.id, todayStr]);

  const isCurrentlyPunchedIn = useMemo(() => {
    if (!myTodayRecord) return false;
    if (myTodayRecord.sessions && myTodayRecord.sessions.length > 0) {
      return myTodayRecord.sessions.some((s) => !s.outTime);
    }
    return Boolean(myTodayRecord.firstInTime && !myTodayRecord.lastOutTime);
  }, [myTodayRecord]);

  // Set current GPS location as Campus Location (for Admin setup)
  const handleCalibrateCampusGps = () => {
    if (gpsState.lat !== undefined && gpsState.lng !== undefined) {
      updatePolicy({
        campusLat: Number(gpsState.lat.toFixed(6)),
        campusLng: Number(gpsState.lng.toFixed(6)),
      });
      setGpsState((prev) => ({
        ...prev,
        distanceMeters: 0,
      }));
      setPunchFeedback({
        type: 'success',
        message: `বর্তমান লোকেশন (${gpsState.lat.toFixed(5)}, ${gpsState.lng.toFixed(5)}) অফিস লোকেশন হিসেবে সেট করা হয়েছে।`,
      });
    } else {
      fetchGpsLocation();
    }
  };

  // Personal Attendance Monthly History
  const currentMonthPrefix = todayStr.slice(0, 7); // YYYY-MM
  const [selectedPersonalMonth, setSelectedPersonalMonth] = useState<string>(currentMonthPrefix);

  const myHistoryRecords = useMemo(() => {
    return attendanceRecords
      .filter((r) => r.employeeId === currentUser.id && r.date.startsWith(selectedPersonalMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, currentUser.id, selectedPersonalMonth]);

  const myMonthlySummary = useMemo(() => {
    const presentDays = myHistoryRecords.filter((r) => r.status === 'Present' || r.status === 'Late').length;
    const lateDays = myHistoryRecords.filter((r) => r.lateDurationMinutes > 0 || r.status === 'Late').length;
    const earlyExitDays = myHistoryRecords.filter((r) => r.earlyLeaveMinutes > 0).length;
    const totalMinutes = myHistoryRecords.reduce((acc, r) => acc + (r.totalWorkingDurationMinutes || 0), 0);
    const approvedLeaves = leaveApplications.filter(
      (l) =>
        l.employeeId === currentUser.id &&
        l.status === 'Approved' &&
        (l.startDate.startsWith(selectedPersonalMonth) || l.endDate.startsWith(selectedPersonalMonth))
    );
    const leaveDays = approvedLeaves.reduce((acc, l) => acc + l.totalDays, 0);

    return {
      presentDays,
      lateDays,
      earlyExitDays,
      totalMinutes,
      leaveDays,
      approvedLeaves,
    };
  }, [myHistoryRecords, selectedPersonalMonth, leaveApplications, currentUser.id]);

  // Correction Request Modal State
  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [corrDate, setCorrDate] = useState<string>(todayStr);
  const [corrType, setCorrType] = useState<'IN' | 'OUT' | 'BOTH'>('OUT');
  const [corrInTime, setCorrInTime] = useState<string>('09:00');
  const [corrOutTime, setCorrOutTime] = useState<string>('17:00');
  const [corrReason, setCorrReason] = useState<string>('');
  const [corrAttachment, setCorrAttachment] = useState<string>('');

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrReason.trim()) return;
    submitCorrectionRequest({
      employeeId: currentUser.id,
      employeeName: currentUser.nameBn || currentUser.name,
      date: corrDate,
      requestedType: corrType,
      correctedInTime: corrType === 'IN' || corrType === 'BOTH' ? corrInTime : undefined,
      correctedOutTime: corrType === 'OUT' || corrType === 'BOTH' ? corrOutTime : undefined,
      reason: corrReason.trim(),
      evidenceAttachment: corrAttachment.trim() || undefined,
    });
    setCorrReason('');
    setCorrAttachment('');
    setShowCorrectionModal(false);
    setPunchFeedback({
      type: 'success',
      message: 'হাজিরা সংশোধনের আবেদন সফলভাবে জমা দেওয়া হয়েছে। এডমিন অনুমোদনের পর তা কার্যকর হবে।',
    });
  };

  // Admin Filters State
  const [filterDate, setFilterDate] = useState<string>(todayStr);
  const [filterDept, setFilterDept] = useState<string>('ALL');
  const [filterDesignation, setFilterDesignation] = useState<string>('ALL');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthPrefix);

  const departments = useMemo(() => {
    return Array.from(new Set(employees.map((e) => e.department))).filter(Boolean);
  }, [employees]);

  const designations = useMemo(() => {
    return Array.from(new Set(employees.map((e) => e.designationBn || e.designation))).filter(Boolean);
  }, [employees]);

  const todayCalendarStatus = useMemo(
    () => getDayOperationalStatus(todayStr, policy, calendarEvents),
    [todayStr, policy, calendarEvents]
  );

  const filterDateStatus = useMemo(
    () => getDayOperationalStatus(filterDate, policy, calendarEvents),
    [filterDate, policy, calendarEvents]
  );

  // Compute complete daily roster for Admin Dashboard (combining employees + attendanceRecords + approved leaves + holidays)
  const adminDailyRoster = useMemo(() => {
    return employees.map((emp) => {
      const rec = attendanceRecords.find((r) => r.employeeId === emp.id && r.date === filterDate);
      const leave = getEmployeeLeaveOnDate(emp.id, filterDate);
      const isHoliday = !rec && !leave && filterDateStatus.isAnyHoliday;

      let status: AttendanceStatus = 'Absent';
      if (rec) {
        status = rec.status;
      } else if (leave) {
        status = 'Leave';
      }

      const isStillInside = rec
        ? rec.sessions && rec.sessions.length > 0
          ? rec.sessions.some((s) => !s.outTime)
          : Boolean(rec.firstInTime && !rec.lastOutTime)
        : false;

      return {
        employee: emp,
        record: rec,
        leave,
        isHoliday,
        holidayTitle: isHoliday ? filterDateStatus.holidayTitle : undefined,
        status,
        isStillInside,
        lateMinutes: rec?.lateDurationMinutes || 0,
        earlyMinutes: rec?.earlyLeaveMinutes || 0,
        workingMinutes: rec?.totalWorkingDurationMinutes || 0,
      };
    });
  }, [employees, attendanceRecords, filterDate, getEmployeeLeaveOnDate, filterDateStatus]);

  const filteredDailyRoster = useMemo(() => {
    return adminDailyRoster.filter((item) => {
      if (filterDept !== 'ALL' && item.employee.department !== filterDept) return false;
      const desig = item.employee.designationBn || item.employee.designation;
      if (filterDesignation !== 'ALL' && desig !== filterDesignation) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase();
        const matchName =
          item.employee.name.toLowerCase().includes(q) ||
          (item.employee.nameBn && item.employee.nameBn.toLowerCase().includes(q));
        const matchId = item.employee.id.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }
      return true;
    });
  }, [adminDailyRoster, filterDept, filterDesignation, filterSearch]);

  // Admin 7 Mandatory KPI Metrics
  const adminKpis = useMemo(() => {
    const totalStaff = adminDailyRoster.length;
    const presentToday = adminDailyRoster.filter(
      (i) => i.status === 'Present' || i.status === 'Late' || Boolean(i.record?.firstInTime)
    ).length;
    const onLeave = adminDailyRoster.filter((i) => i.status === 'Leave').length;
    const onHoliday = adminDailyRoster.filter((i) => i.isHoliday).length;
    const absent = Math.max(0, totalStaff - presentToday - onLeave - onHoliday);
    const lateEntry = adminDailyRoster.filter((i) => i.lateMinutes > 0 || i.status === 'Late').length;
    const earlyExit = adminDailyRoster.filter((i) => i.earlyMinutes > 0).length;
    const stillInside = adminDailyRoster.filter((i) => i.isStillInside).length;

    return {
      totalStaff,
      presentToday,
      absent,
      onLeave,
      lateEntry,
      earlyExit,
      stillInside,
    };
  }, [adminDailyRoster]);

  // Department-wise Breakdown
  const departmentBreakdown = useMemo(() => {
    return departments.map((dept) => {
      const deptItems = adminDailyRoster.filter((i) => i.employee.department === dept);
      const present = deptItems.filter(
        (i) => i.status === 'Present' || i.status === 'Late' || Boolean(i.record?.firstInTime)
      ).length;
      const leave = deptItems.filter((i) => i.status === 'Leave').length;
      const holiday = deptItems.filter((i) => i.isHoliday).length;
      const absent = Math.max(0, deptItems.length - present - leave - holiday);
      return {
        department: dept,
        total: deptItems.length,
        present,
        leave,
        absent,
      };
    });
  }, [departments, adminDailyRoster]);

  // Monthly Attendance Report Matrix
  const monthlyReportRows = useMemo(() => {
    return employees
      .filter((emp) => {
        if (filterDept !== 'ALL' && emp.department !== filterDept) return false;
        const desig = emp.designationBn || emp.designation;
        if (filterDesignation !== 'ALL' && desig !== filterDesignation) return false;
        if (filterSearch.trim()) {
          const q = filterSearch.toLowerCase();
          return (
            emp.name.toLowerCase().includes(q) ||
            (emp.nameBn && emp.nameBn.toLowerCase().includes(q)) ||
            emp.id.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .map((emp) => {
        const empMonthRecs = attendanceRecords.filter(
          (r) => r.employeeId === emp.id && r.date.startsWith(selectedMonth)
        );
        const presentCount = empMonthRecs.filter(
          (r) => r.status === 'Present' || r.status === 'Late' || Boolean(r.firstInTime)
        ).length;
        const lateCount = empMonthRecs.filter((r) => r.lateDurationMinutes > 0 || r.status === 'Late').length;
        const earlyExitCount = empMonthRecs.filter((r) => r.earlyLeaveMinutes > 0).length;
        const totalWorkMins = empMonthRecs.reduce(
          (sum, r) => sum + (r.totalWorkingDurationMinutes || 0),
          0
        );
        const empLeaves = leaveApplications.filter(
          (l) =>
            l.employeeId === emp.id &&
            l.status === 'Approved' &&
            (l.startDate.startsWith(selectedMonth) || l.endDate.startsWith(selectedMonth))
        );
        const leaveDays = empLeaves.reduce((sum, l) => sum + l.totalDays, 0);
        const leaveTypes = Array.from(new Set(empLeaves.map((l) => l.leaveType))).join(', ');

        return {
          employee: emp,
          presentCount,
          lateCount,
          earlyExitCount,
          leaveDays,
          leaveTypes,
          totalWorkMins,
        };
      });
  }, [employees, attendanceRecords, leaveApplications, selectedMonth, filterDept, filterDesignation, filterSearch]);

  // Direct Admin Edit Modal State
  const [editingTarget, setEditingTarget] = useState<{
    employee: Employee;
    date: string;
    firstInTime: string;
    lastOutTime: string;
    status: AttendanceStatus;
    reason: string;
  } | null>(null);

  const handleSaveAdminEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget || !editingTarget.reason.trim()) return;
    adminEditAttendanceRecord({
      employeeId: editingTarget.employee.id,
      date: editingTarget.date,
      firstInTime: editingTarget.firstInTime || undefined,
      lastOutTime: editingTarget.lastOutTime || undefined,
      status: editingTarget.status,
      reason: editingTarget.reason.trim(),
    });
    setEditingTarget(null);
  };

  // Multi-Row Special Holiday / Working Day Range Input State
  const [specialDayRows, setSpecialDayRows] = useState<
    Array<{
      title: string;
      startDate: string;
      endDate: string;
      type: 'Holiday' | 'Special_Working_Day';
    }>
  >([{ title: '', startDate: '', endDate: '', type: 'Holiday' }]);

  const handleAddSpecialDay = () => {
    const validRows = specialDayRows.filter((r) => r.startDate && r.title.trim());
    if (validRows.length === 0) return;

    // Sync via CalendarEventsBatch so both Annual Calendar and Attendance Policy stay unified
    createCalendarEventsBatch(
      validRows.map((r) => {
        const finalEnd = r.endDate && r.endDate >= r.startDate ? r.endDate : r.startDate;
        return {
          title: r.title.trim(),
          startDate: r.startDate,
          endDate: finalEnd,
          type: r.type,
          category: r.type,
          visibility: 'All' as const,
          createdBy: currentUser.id,
        };
      })
    );

    setSpecialDayRows([{ title: '', startDate: '', endDate: '', type: 'Holiday' }]);
  };

  const handleRemoveSpecialDayGroup = (datesToRemove: string[], calendarEventId?: string) => {
    if (calendarEventId) {
      deleteCalendarEvent(calendarEventId);
      return;
    }
    const removeSet = new Set(datesToRemove);
    const currentList = policy.specialDays || [];
    updatePolicy({
      specialDays: currentList.filter((d) => !removeSet.has(d.date)),
    });
  };

  const groupedSpecialDays = useMemo(() => {
    const list = [...(policy.specialDays || [])].sort((a, b) => a.date.localeCompare(b.date));
    const groups: Array<{
      key: string;
      title: string;
      type: 'Holiday' | 'Working_Day' | 'Special_Working_Day';
      startDate: string;
      endDate: string;
      dates: string[];
      calendarEventId?: string;
    }> = [];

    for (const item of list) {
      const calId = item.id?.startsWith('CAL-') ? item.id.replace(/^CAL-/, '') : undefined;
      const last = groups[groups.length - 1];
      if (
        last &&
        last.title === item.title &&
        last.type === item.type &&
        last.calendarEventId === calId
      ) {
        const prevDate = new Date(`${last.endDate}T00:00:00`);
        prevDate.setDate(prevDate.getDate() + 1);
        const expectedNext = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
        if (item.date === expectedNext || (calId && last.calendarEventId === calId)) {
          if (item.date > last.endDate) last.endDate = item.date;
          if (!last.dates.includes(item.date)) last.dates.push(item.date);
          continue;
        }
      }
      groups.push({
        key: `${item.date}-${item.id || item.title}`,
        title: item.title,
        type: item.type,
        startDate: item.date,
        endDate: item.date,
        dates: [item.date],
        calendarEventId: calId,
      });
    }
    return groups;
  }, [policy.specialDays]);

  const handleDownloadMonthlyCsv = () => {
    const headers = ['Employee ID', 'Name', 'Designation', 'Department', 'Present Days', 'Late Entry', 'Early Exit', 'Approved Leave Days', 'Total Working Hours'];
    const rows = monthlyReportRows.map((r) => [
      r.employee.id,
      `"${r.employee.nameBn || r.employee.name}"`,
      `"${r.employee.designationBn || r.employee.designation}"`,
      `"${r.employee.department}"`,
      r.presentCount,
      r.lateCount,
      r.earlyExitCount,
      r.leaveDays,
      `"${formatDurationBn(r.totalWorkMins)}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ASDRI_Attendance_Report_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Check if user forgot to Punch Out past officeEndTime
  const showPunchOutReminder = useMemo(() => {
    if (!isCurrentlyPunchedIn) return false;
    return dhakaClock.shortTime >= policy.officeEndTime;
  }, [isCurrentlyPunchedIn, dhakaClock.shortTime, policy.officeEndTime]);

  return (
    <div className="space-y-4 sm:space-y-5 font-serif">
      {/* Clean Header & Mode Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              উপস্থিতি ও মাসিক রিপোর্ট
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {currentUser.nameBn || currentUser.name} ({currentUser.id}) · {dhakaClock.dateStr} · {dhakaClock.timeStr}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMainView('personal')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mainView === 'personal'
                  ? 'bg-[#0f4c3a] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>মাসিক রিপোর্ট</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setMainView('office_qr')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  mainView === 'office_qr'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-amber-50 text-amber-900 border border-amber-300/70 hover:bg-amber-100'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>অফিস QR বোর্ড</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setMainView('admin')}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  mainView === 'admin'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>অ্যাডমিন ড্যাশবোর্ড</span>
                {corrections.filter((c) => c.status === 'Pending').length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-rose-600 text-white">
                    {corrections.filter((c) => c.status === 'Pending').length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Today's Calendar Operational Notice (1-line clean) */}
      {(todayCalendarStatus.isAnyHoliday || todayCalendarStatus.isSpecialWorkingDay) && (
        <div
          className={`rounded-xl px-4 py-3 border flex items-center gap-2.5 text-xs font-semibold ${
            todayCalendarStatus.isAnyHoliday
              ? 'bg-sky-50 border-sky-200 text-sky-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span>
            {todayCalendarStatus.isAnyHoliday
              ? `আজ প্রতিষ্ঠানের ছুটির দিন: ${todayCalendarStatus.holidayTitle || 'ছুটি'}`
              : 'আজ বিশেষ কর্মদিবস (অফিস খোলা)'}
          </span>
        </div>
      )}

      {/* Forgotten Punch Out Reminder */}
      {showPunchOutReminder && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-900 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>অফিস সময় ({policy.officeEndTime}) শেষ — Punch Out বাকি রয়েছে।</span>
          </div>
          <button
            type="button"
            onClick={() => openCameraPunch('OUT')}
            className="w-full sm:w-auto justify-center px-3 py-2 sm:py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Punch Out</span>
          </button>
        </div>
      )}

      {/* VIEW 1: OFFICE DYNAMIC QR BOARD (Admins Only) */}
      {mainView === 'office_qr' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-8 shadow-2xs max-w-xl mx-auto text-center space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              অফিস ডাইনামিক QR বোর্ড
            </h2>
            <p className="text-xs text-slate-500">
              প্রতি {policy.qrRotationSeconds || 30} সেকেন্ড পরপর কোড পরিবর্তিত হয়
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6 inline-block mx-auto max-w-full">
            <div className="w-52 h-52 sm:w-64 sm:h-64 max-w-full bg-white p-3 rounded-xl border border-slate-200 mx-auto flex flex-col items-center justify-center">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="Dynamic Attendance QR Code"
                  className="w-44 h-44 sm:w-56 sm:h-56 object-contain"
                />
              ) : (
                <RefreshCw className="w-8 h-8 animate-spin text-[#0f4c3a]" />
              )}
            </div>

            <p className="mt-3 text-[11px] font-semibold text-slate-600">
              শুধুমাত্র ক্যামেরা দিয়ে এই QR কোডটি স্ক্যান করে Punch In / Out করুন
            </p>

            <div className="mt-3 w-52 sm:w-64 max-w-full mx-auto">
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1 tabular-nums">
                <span>মেয়াদ বাকি:</span>
                <span className="text-amber-600 font-bold">{serverQr?.remainingSeconds ?? 0} সেকেন্ড</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0f4c3a] transition-all duration-500"
                  style={{
                    width: `${
                      serverQr
                        ? Math.min(100, Math.round((serverQr.remainingSeconds / serverQr.rotationSeconds) * 100))
                        : 100
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={fetchDynamicQr}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>রিফ্রেশ</span>
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: PERSONAL MONTHLY REPORT & DIRECT CAMERA PUNCH */}
      {mainView === 'personal' && (
        <div className="space-y-5">
          {punchFeedback && (
            <div
              className={`rounded-xl px-4 py-3 border flex items-center justify-between gap-3 text-xs font-semibold ${
                punchFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : punchFeedback.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {punchFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : punchFeedback.type === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{punchFeedback.message}</span>
              </div>
              <button
                onClick={() => setPunchFeedback(null)}
                className="underline opacity-75 hover:opacity-100 cursor-pointer shrink-0"
              >
                বন্ধ করুন
              </button>
            </div>
          )}

          {/* Compact One-Tap Camera Punch Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                disabled={isCurrentlyPunchedIn}
                onClick={() => openCameraPunch('IN')}
                className={`w-full sm:w-auto justify-center py-2.5 px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors ${
                  isCurrentlyPunchedIn
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-[#0f4c3a] hover:bg-[#0b3a2c] text-white cursor-pointer'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>{isCurrentlyPunchedIn ? 'Punched In' : 'Punch In (ক্যামেরা স্ক্যান)'}</span>
              </button>

              <button
                type="button"
                disabled={!isCurrentlyPunchedIn}
                onClick={() => openCameraPunch('OUT')}
                className={`w-full sm:w-auto justify-center py-2.5 px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors ${
                  !isCurrentlyPunchedIn
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Punch Out (ক্যামেরা স্ক্যান)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCorrectionModal(true)}
              className="w-full sm:w-auto justify-center px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>সংশোধন আবেদন</span>
            </button>
          </div>

          {/* Monthly Personal Attendance Report */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  মাসিক উপস্থিতি রিপোর্ট ({selectedPersonalMonth})
                </h2>
              </div>

              <div className="flex items-center justify-between sm:justify-start gap-2">
                <label className="text-xs text-slate-500 font-semibold whitespace-nowrap">মাস নির্বাচন:</label>
                <input
                  type="month"
                  value={selectedPersonalMonth}
                  onChange={(e) => setSelectedPersonalMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold tabular-nums"
                />
              </div>
            </div>

            {/* 4 Clean Monthly Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70">
                <div className="text-[11px] text-slate-500">উপস্থিত দিন</div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {myMonthlySummary.presentDays} দিন
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70">
                <div className="text-[11px] text-slate-500">বিলম্বে প্রবেশ (Late)</div>
                <div className="text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-0.5">
                  {myMonthlySummary.lateDays} দিন
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70">
                <div className="text-[11px] text-slate-500">অনুমোদিত ছুটি</div>
                <div className="text-lg font-bold font-mono tabular-nums text-blue-800 dark:text-blue-300 mt-0.5">
                  {myMonthlySummary.leaveDays} দিন
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70">
                <div className="text-[11px] text-slate-500">মোট কর্মঘণ্টা</div>
                <div className="text-base font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatDurationBn(myMonthlySummary.totalMinutes)}
                </div>
              </div>
            </div>

            {/* Selected Month Daily Cards (Mobile) + Table (Desktop) */}
            {myHistoryRecords.length === 0 && myMonthlySummary.approvedLeaves.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                {selectedPersonalMonth} মাসে এখনো কোনো উপস্থিতির রেকর্ড পাওয়া যায়নি।
              </div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden">
                  {myHistoryRecords.map((rec) => (
                    <div key={rec.id} className="p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          {rec.date}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                            rec.status === 'Present'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : rec.status === 'Late'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : rec.status === 'Leave'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                        <div>
                          <div className="text-[10px] text-slate-500">প্রবেশ</div>
                          <div className="font-mono font-bold text-emerald-700 tabular-nums">
                            {rec.firstInTime || '--:--'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">প্রস্থান</div>
                          <div className="font-mono font-bold text-rose-700 tabular-nums">
                            {rec.lastOutTime || (rec.isCurrentlyIn ? 'চলমান' : '--:--')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">কর্মঘণ্টা</div>
                          <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                            {formatDurationBn(rec.totalWorkingDurationMinutes)}
                          </div>
                        </div>
                      </div>
                      {(rec.lateDurationMinutes > 0 || rec.earlyLeaveMinutes > 0) && (
                        <div className="flex flex-wrap gap-3 text-[11px] tabular-nums">
                          {rec.lateDurationMinutes > 0 && (
                            <span className="text-amber-700 font-semibold">
                              বিলম্ব: {rec.lateDurationMinutes} মি.
                            </span>
                          )}
                          {rec.earlyLeaveMinutes > 0 && (
                            <span className="text-rose-700 font-semibold">
                              আগে প্রস্থান: {rec.earlyLeaveMinutes} মি.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 bg-slate-50/70 dark:bg-slate-800/50">
                        <th className="py-2.5 px-3">তারিখ</th>
                        <th className="py-2.5 px-3">প্রবেশ (In)</th>
                        <th className="py-2.5 px-3">প্রস্থান (Out)</th>
                        <th className="py-2.5 px-3">মোট কর্মঘণ্টা</th>
                        <th className="py-2.5 px-3">বিলম্ব / আগে প্রস্থান</th>
                        <th className="py-2.5 px-3">স্ট্যাটাস</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {myHistoryRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                            {rec.date}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                            {rec.firstInTime || '--:--'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-rose-700 dark:text-rose-400 font-semibold tabular-nums">
                            {rec.lastOutTime || (rec.isCurrentlyIn ? 'চলমান' : '--:--')}
                          </td>
                          <td className="py-2.5 px-3 font-semibold tabular-nums">
                            {formatDurationBn(rec.totalWorkingDurationMinutes)}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">
                            {rec.lateDurationMinutes > 0 && (
                              <span className="text-amber-700 font-semibold mr-2">
                                বিলম্ব: {rec.lateDurationMinutes}মি.
                              </span>
                            )}
                            {rec.earlyLeaveMinutes > 0 && (
                              <span className="text-rose-700 font-semibold">
                                আগে প্রস্থান: {rec.earlyLeaveMinutes}মি.
                              </span>
                            )}
                            {rec.lateDurationMinutes === 0 && rec.earlyLeaveMinutes === 0 && (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            <span
                              className={
                                rec.status === 'Present'
                                  ? 'text-emerald-700'
                                  : rec.status === 'Late'
                                  ? 'text-amber-700'
                                  : rec.status === 'Leave'
                                  ? 'text-blue-700'
                                  : 'text-rose-700'
                              }
                            >
                              {rec.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: ADMIN ATTENDANCE DASHBOARD */}
      {mainView === 'admin' && isAdmin && (
        <div className="space-y-6">
          {/* 7 Mandatory Admin KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="text-xs text-slate-500">মোট জনবল</div>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                {adminKpis.totalStaff}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">সকল শিক্ষক ও স্টাফ</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 shadow-xs">
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">আজ উপস্থিত</div>
              <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                {adminKpis.presentToday}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">তারিখ: {filterDate}</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 shadow-xs">
              <div className="text-xs text-rose-700 dark:text-rose-400 font-semibold">অনুপস্থিত</div>
              <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 mt-1">
                {adminKpis.absent}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">উপস্থিতি ও ছুটি ব্যতীত</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 shadow-xs">
              <div className="text-xs text-blue-700 dark:text-blue-400 font-semibold">ছুটিতে (Leave)</div>
              <div className="text-2xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">
                {adminKpis.onLeave}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">অনুমোদিত ছুটি</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 shadow-xs">
              <div className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Late Entry</div>
              <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">
                {adminKpis.lateEntry}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">গ্রেস পিরিয়ড পরবর্তী</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-orange-200 dark:border-orange-900/60 shadow-xs">
              <div className="text-xs text-orange-700 dark:text-orange-400 font-semibold">Early Exit</div>
              <div className="text-2xl font-extrabold text-orange-700 dark:text-orange-400 mt-1">
                {adminKpis.earlyExit}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">নির্ধারিত সময়ের পূর্বে</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-purple-200 dark:border-purple-900/60 shadow-xs">
              <div className="text-xs text-purple-700 dark:text-purple-400 font-semibold">
                এখনো Punch Out করেননি
              </div>
              <div className="text-2xl font-extrabold text-purple-700 dark:text-purple-400 mt-1">
                {adminKpis.stillInside}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">বর্তমানে অফিসে অবস্থানরত</div>
            </div>
          </div>

          {/* Admin Sub-Navigation & Filters */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <button
                onClick={() => setAdminTab('daily')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                  adminTab === 'daily'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <UserCheck className="w-4 h-4" /> দৈনিক ও বিভাগভিত্তিক হাজিরা
              </button>
              <button
                onClick={() => setAdminTab('monthly')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                  adminTab === 'monthly'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Calendar className="w-4 h-4" /> মাসিক উপস্থিতি রিপোর্ট
              </button>
              <button
                onClick={() => setAdminTab('corrections')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                  adminTab === 'corrections'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <FileCheck className="w-4 h-4" /> হাজিরা সংশোধন আবেদন ({corrections.filter((c) => c.status === 'Pending').length})
              </button>
              <button
                onClick={() => setAdminTab('policy')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 ${
                  adminTab === 'policy'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Settings className="w-4 h-4" /> অফিস সময়, জিও-ফেন্স ও ছুটির নিয়ম
              </button>
              <button
                onClick={() => setAdminTab('audit')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  adminTab === 'audit'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <History className="w-4 h-4" /> অডিট লগ (Before / After)
              </button>
              <button
                onClick={() => setAdminTab('zkteco')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  adminTab === 'zkteco'
                    ? 'bg-[#0f4c3a] text-white'
                    : 'bg-amber-50 text-amber-900 border border-amber-300/80 hover:bg-amber-100'
                }`}
              >
                <Cpu className="w-4 h-4" /> বায়োমেট্রিক মেশিন (ZKTeco F09)
              </button>
            </div>

            {/* 4 Mandatory Filters: Date, Department, Designation, Employee Name */}
            {(adminTab === 'daily' || adminTab === 'monthly') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {adminTab === 'daily' ? 'তারিখ (Date) অনুযায়ী ফিল্টার' : 'মাস (Month) নির্বাচন করুন'}
                  </label>
                  {adminTab === 'daily' ? (
                    <input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    />
                  ) : (
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    বিভাগ (Department) অনুযায়ী ফিল্টার
                  </label>
                  <select
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="ALL">সকল বিভাগ</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    পদবি (Designation) অনুযায়ী ফিল্টার
                  </label>
                  <select
                    value={filterDesignation}
                    onChange={(e) => setFilterDesignation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                  >
                    <option value="ALL">সকল পদবি</option>
                    {designations.map((des) => (
                      <option key={des} value={des}>
                        {des}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    ব্যক্তির নাম বা আইডি দিয়ে খুঁজুন
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="নাম বা আইডি দিয়ে খুঁজুন..."
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ADMIN TAB 1: DAILY & DEPARTMENT BREAKDOWN */}
          {adminTab === 'daily' && (
            <div className="space-y-5">
              {/* Department-wise Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {departmentBreakdown.map((dept) => (
                  <div
                    key={dept.department}
                    className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#0f4c3a] shrink-0" /> {dept.department}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">মোট জনবল: {dept.total} জন</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">উপস্থিত: {dept.present}</span>
                      <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">ছুটি: {dept.leave}</span>
                      <span className="px-2 py-1 rounded bg-rose-50 text-rose-700">অনুপস্থিত: {dept.absent}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Individual Daily Attendance Roster */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    ব্যক্তিভিত্তিক দৈনিক উপস্থিতি তালিকা ({filterDate}) — মোট প্রদর্শিত: {filteredDailyRoster.length} জন
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-3 px-3">আইডি ও নাম</th>
                        <th className="py-3 px-3">পদবি ও বিভাগ</th>
                        <th className="py-3 px-3">প্রথম প্রবেশ (In)</th>
                        <th className="py-3 px-3">সর্বশেষ প্রস্থান (Out)</th>
                        <th className="py-3 px-3">মোট কর্মঘণ্টা</th>
                        <th className="py-3 px-3">Late / Early</th>
                        <th className="py-3 px-3">স্ট্যাটাস</th>
                        <th className="py-3 px-3 text-right">অ্যাডমিন অ্যাকশন</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredDailyRoster.map(({ employee, record, leave, isHoliday, holidayTitle, status, isStillInside, lateMinutes, earlyMinutes, workingMinutes }) => (
                        <tr key={employee.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {employee.nameBn || employee.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">{employee.id}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {employee.designationBn || employee.designation}
                            </div>
                            <div className="text-[11px] text-slate-500">{employee.department}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                            {record?.firstInTime || '--:--'}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-rose-700 dark:text-rose-400">
                            {record?.lastOutTime || (isStillInside ? 'এখনো অফিসে আছেন' : '--:--')}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            {formatDurationBn(workingMinutes)}
                            {record?.sessions && record.sessions.length > 1 && (
                              <span className="ml-1 text-[10px] text-slate-500">
                                ({record.sessions.length} সেশন)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {lateMinutes > 0 && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold mr-1">
                                Late: {lateMinutes}m
                              </span>
                            )}
                            {earlyMinutes > 0 && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px] font-bold">
                                Early: {earlyMinutes}m
                              </span>
                            )}
                            {lateMinutes === 0 && earlyMinutes === 0 && <span className="text-slate-400">-</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                isHoliday
                                  ? 'bg-sky-100 text-sky-800'
                                  : status === 'Present'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : status === 'Late'
                                  ? 'bg-amber-100 text-amber-800'
                                  : status === 'Leave'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isHoliday
                                ? `ছুটি (${holidayTitle || 'Holiday'})`
                                : status === 'Leave' && leave
                                ? `Leave (${leave.leaveType})`
                                : status}
                            </span>
                            {isStillInside && (
                              <span className="ml-1.5 px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                                Punch Out বাকি
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() =>
                                setEditingTarget({
                                  employee,
                                  date: filterDate,
                                  firstInTime: record?.firstInTime || '09:00',
                                  lastOutTime: record?.lastOutTime || '17:00',
                                  status: status === 'Absent' ? 'Present' : status,
                                  reason: '',
                                })
                              }
                              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" /> সংশোধন
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ADMIN TAB 2: MONTHLY ATTENDANCE REPORT */}
          {adminTab === 'monthly' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    মাসিক উপস্থিতি ও ছুটি সমন্বিত রিপোর্ট ({selectedMonth})
                  </h3>
                  <p className="text-xs text-slate-500">
                    অনুমোদিত ছুটিসমূহ স্বয়ংক্রিয়ভাবে Leave হিসেবে গণনা করা হয়েছে (Absent হিসেবে নয়)
                  </p>
                </div>
                <button
                  onClick={handleDownloadMonthlyCsv}
                  className="px-3.5 py-2 rounded-lg bg-[#0f4c3a] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#0b3a2c]"
                >
                  <Download className="w-4 h-4" /> মাসিক রিপোর্ট CSV ডাউনলোড
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-3 px-3">আইডি ও নাম</th>
                      <th className="py-3 px-3">পদবি ও বিভাগ</th>
                      <th className="py-3 px-3">মোট উপস্থিত দিন</th>
                      <th className="py-3 px-3">Late Entry</th>
                      <th className="py-3 px-3">Early Exit</th>
                      <th className="py-3 px-3">অনুমোদিত ছুটি (Leave)</th>
                      <th className="py-3 px-3">মোট কর্মঘণ্টা</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {monthlyReportRows.map((row) => (
                      <tr key={row.employee.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {row.employee.nameBn || row.employee.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{row.employee.id}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{row.employee.designationBn || row.employee.designation}</div>
                          <div className="text-[11px] text-slate-500">{row.employee.department}</div>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-700">{row.presentCount} দিন</td>
                        <td className="py-2.5 px-3 font-semibold text-amber-700">{row.lateCount} দিন</td>
                        <td className="py-2.5 px-3 font-semibold text-orange-700">{row.earlyExitCount} দিন</td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-blue-700">{row.leaveDays} দিন</span>
                          {row.leaveTypes && (
                            <div className="text-[10px] text-slate-500">{row.leaveTypes}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                          {formatDurationBn(row.totalWorkMins)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ADMIN TAB 3: CORRECTION REQUESTS APPROVAL QUEUE */}
          {adminTab === 'corrections' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                হাজিরা সংশোধন আবেদন তালিকা (Correction Requests)
              </h3>
              {corrections.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  কোনো হাজিরা সংশোধনের আবেদন জমা পড়েনি।
                </div>
              ) : (
                <div className="space-y-3">
                  {corrections.map((corr) => (
                    <div
                      key={corr.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {corr.employeeName} ({corr.employeeId})
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                            তারিখ: {corr.date}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              corr.status === 'Pending'
                                ? 'bg-amber-100 text-amber-800'
                                : corr.status === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {corr.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          পূর্বের রেকর্ড: <span className="font-mono">In: {corr.beforeInTime || 'N/A'}, Out: {corr.beforeOutTime || 'N/A'}</span> → প্রস্তাবিত সংশোধন:{' '}
                          <span className="font-mono font-bold text-[#0f4c3a]">
                            {corr.correctedInTime ? `In: ${corr.correctedInTime} ` : ''}
                            {corr.correctedOutTime ? `Out: ${corr.correctedOutTime}` : ''}
                          </span>
                        </div>
                        <div className="text-xs text-slate-700 dark:text-slate-300">
                          <strong>কারণ:</strong> {corr.reason}
                          {corr.evidenceAttachment && (
                            <span className="ml-2 inline-flex items-center gap-1 text-blue-600">
                              <Paperclip className="w-3 h-3" /> ডকুমেন্ট: {corr.evidenceAttachment}
                            </span>
                          )}
                        </div>
                      </div>

                      {corr.status === 'Pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => approveCorrectionRequest(corr.id, 'যাচাইপূর্বক অনুমোদিত')}
                            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            অনুমোদন করুন (Approve)
                          </button>
                          <button
                            onClick={() => rejectCorrectionRequest(corr.id, 'যথাযথ প্রমাণের অভাবে নামঞ্জুর')}
                            className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                          >
                            নামঞ্জুর করুন (Reject)
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ADMIN TAB 4: TIME, GEO-FENCE & HOLIDAY RULES CONFIG */}
          {adminTab === 'policy' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  অফিস সময়, জিও-ফেন্স লোকেশন ও ছুটির নিয়ম নির্ধারণ (Admin Policy Panel)
                </h3>
                <p className="text-xs text-slate-500">
                  বাংলাদেশের সময় (Asia/Dhaka) অনুযায়ী সকল উপস্থিতি ও নিয়ম স্বয়ংক্রিয়ভাবে কার্যকর হবে
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    অফিস শুরু হওয়ার সময় (Office Start Time)
                  </label>
                  <input
                    type="time"
                    value={policy.officeStartTime}
                    onChange={(e) => updatePolicy({ officeStartTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    অফিস শেষ হওয়ার সময় (Office End Time)
                  </label>
                  <input
                    type="time"
                    value={policy.officeEndTime}
                    onChange={(e) => updatePolicy({ officeEndTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Grace Period (মিনিট)
                  </label>
                  <input
                    type="number"
                    value={policy.gracePeriodMinutes}
                    onChange={(e) => updatePolicy({ gracePeriodMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Late Entry সময়সীমা (মিনিট)
                  </label>
                  <input
                    type="number"
                    value={policy.lateThresholdMinutes}
                    onChange={(e) => updatePolicy({ lateThresholdMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Early Exit নিয়ম (অফিস শেষের কত মিনিট পূর্বে)
                  </label>
                  <input
                    type="number"
                    value={policy.earlyLeaveThresholdMinutes}
                    onChange={(e) => updatePolicy({ earlyLeaveThresholdMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dynamic QR পরিবর্তনের সময় (সেকেন্ড)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={policy.qrRotationSeconds || 30}
                    onChange={(e) => updatePolicy({ qrRotationSeconds: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
              </div>

              {/* GPS Verification Mode Switch (Desk QR vs Strict GPS) */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#0f4c3a] dark:text-emerald-400" />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        GPS ও Geo-fence ভেরিফিকেশন নীতি
                      </span>
                      {policy.requireGpsVerification ? (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                          GPS + QR উভয়ই বাধ্যতামূলক
                        </span>
                      ) : (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold">
                          ডেস্ক QR মোড (পিসির GPS প্রয়োজন নেই - রিকমেন্ডেড)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xl">
                      &quot;ডেস্ক QR মোড&quot; সক্রিয় রাখলে অফিসের পিসি বা মোবাইলের GPS পারমিশন নিয়ে কোনো সমস্যা হবে না। শিক্ষকরা অফিসে এসে ডেস্কে প্রদর্শিত ঘূর্ণায়মান QR কোড স্ক্যান করলেই উপস্থিতি গ্রহণ হবে।
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => updatePolicy({ requireGpsVerification: false })}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                        !policy.requireGpsVerification
                          ? 'bg-[#0f4c3a] text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      ডেস্ক QR মোড (পিসি GPS মুক্ত)
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePolicy({ requireGpsVerification: true })}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                        policy.requireGpsVerification
                          ? 'bg-[#0f4c3a] text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      GPS + QR উভয়ই
                    </button>
                  </div>
                </div>
              </div>

              {/* GPS Geo-fence Configuration */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    প্রতিষ্ঠানের নির্ধারিত GPS Location ও Geo-fence Radius
                  </h4>
                  <button
                    type="button"
                    onClick={handleCalibrateCampusGps}
                    className="px-3 py-1.5 rounded-lg bg-[#0f4c3a] text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <MapPin className="w-3.5 h-3.5" /> বর্তমান ডিভাইসের লোকেশনকে অফিস লোকেশন হিসেবে সেট করুন
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      অফিস Latitude (অক্ষাংশ)
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={policy.campusLat ?? 23.7985}
                      onChange={(e) => updatePolicy({ campusLat: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      অফিস Longitude (দ্রাঘিমাংশ)
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={policy.campusLng ?? 90.4255}
                      onChange={(e) => updatePolicy({ campusLng: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Geo-fence Radius (মিটার)
                    </label>
                    <input
                      type="number"
                      min={20}
                      max={5000}
                      value={policy.geofenceRadiusMeters ?? 300}
                      onChange={(e) => updatePolicy({ geofenceRadiusMeters: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Weekly Holidays & Special Working Days / Holidays */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                    সাপ্তাহিক ছুটির দিন (Weekly Holidays)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].map((day) => {
                      const active = policy.weeklyHolidays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const updated = active
                              ? policy.weeklyHolidays.filter((d) => d !== day)
                              : [...policy.weeklyHolidays, day];
                            updatePolicy({ weeklyHolidays: updated });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            active
                              ? 'bg-[#0f4c3a] text-white border-[#0f4c3a]'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        বিশেষ কর্মদিবস ও সরকারি/বিশেষ ছুটির দিন সংযোজন (একক বা একাধিক তারিখ রেঞ্জ)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        শুরুর ও শেষ তারিখ সিলেক্ট করে একসাথে পুরো ছুটির রেঞ্জ বা একাধিক সারি যুক্ত করুন (বার্ষিক ক্যালেন্ডারেও স্বয়ংক্রিয়ভাবে যুক্ত হবে)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSpecialDayRows((prev) => [
                          ...prev,
                          { title: '', startDate: '', endDate: '', type: 'Holiday' },
                        ])
                      }
                      className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> আরও সারি যোগ
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {specialDayRows.map((row, idx) => {
                      const effectiveEnd =
                        row.endDate && row.endDate >= row.startDate ? row.endDate : row.startDate;
                      const dayCount = row.startDate
                        ? enumerateDateRange(row.startDate, effectiveEnd).length
                        : 0;
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                দিবসের বিবরণ *
                              </label>
                              <input
                                type="text"
                                value={row.title}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSpecialDayRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, title: val } : r))
                                  );
                                }}
                                placeholder="যেমন: পবিত্র ঈদুল ফিতর ছুটি"
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                শুরুর তারিখ (থেকে) *
                              </label>
                              <input
                                type="date"
                                value={row.startDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSpecialDayRows((prev) =>
                                    prev.map((r, i) =>
                                      i === idx
                                        ? {
                                            ...r,
                                            startDate: val,
                                            endDate: !r.endDate || r.endDate < val ? val : r.endDate,
                                          }
                                        : r
                                    )
                                  );
                                }}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                শেষ তারিখ (পর্যন্ত) *
                              </label>
                              <input
                                type="date"
                                min={row.startDate || undefined}
                                value={row.endDate}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSpecialDayRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, endDate: val } : r))
                                  );
                                }}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                ধরন
                              </label>
                              <select
                                value={row.type}
                                onChange={(e) => {
                                  const val = e.target.value as 'Holiday' | 'Special_Working_Day';
                                  setSpecialDayRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, type: val } : r))
                                  );
                                }}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                              >
                                <option value="Holiday">বিশেষ ছুটির দিন (Holiday)</option>
                                <option value="Special_Working_Day">বিশেষ কর্মদিবস (Working Day)</option>
                              </select>
                            </div>
                            <div className="sm:col-span-1 flex items-center justify-end gap-1.5">
                              {dayCount > 0 && (
                                <span className="px-2 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 text-[11px] font-bold whitespace-nowrap">
                                  {toBnDigits(dayCount)} দিন
                                </span>
                              )}
                              {specialDayRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSpecialDayRows((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  title="সারি মুছুন"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddSpecialDay}
                      className="px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> ছুটি / কর্মদিবস যুক্ত করুন
                    </button>
                  </div>

                  {groupedSpecialDays.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {groupedSpecialDays.map((group) => {
                        const totalDays = group.dates.length;
                        return (
                          <div
                            key={group.key}
                            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {group.startDate === group.endDate
                                    ? group.startDate
                                    : `${group.startDate} → ${group.endDate}`}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                                  {toBnDigits(totalDays)} দিন
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    group.type === 'Holiday'
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                      : 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                                  }`}
                                >
                                  {group.type === 'Holiday' ? 'ছুটির দিন' : 'বিশেষ কর্মদিবস'}
                                </span>
                              </div>
                              <p className="font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                                {group.title}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveSpecialDayGroup(group.dates, group.calendarEventId)
                              }
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ADMIN TAB 5: AUDIT LOG (BEFORE & AFTER VALUES + REASON + CHANGER) */}
          {adminTab === 'audit' && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  উপস্থিতি ও সিস্টেম অডিট লগ (Before / After পরিবর্তন ইতিহাস)
                </h3>
                <p className="text-xs text-slate-500">
                  হাজিরা সংশোধন বা পরিবর্তনের ক্ষেত্রে পূর্বের ও পরের তথ্য, পরিবর্তনের কারণ এবং পরিবর্তনকারীর পরিচয় সংরক্ষিত থাকে
                </p>
              </div>
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                  এখনো কোনো অডিট লগ তৈরি হয়নি।
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3">সময়</th>
                        <th className="py-2.5 px-3">পরিবর্তনকারী</th>
                        <th className="py-2.5 px-3">অ্যাকশন</th>
                        <th className="py-2.5 px-3">পূর্বের তথ্য (Before)</th>
                        <th className="py-2.5 px-3">পরের তথ্য (After)</th>
                        <th className="py-2.5 px-3">কারণ ও বিবরণ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                            {new Date(log.timestamp).toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                            {log.actorName} ({log.actorId})
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#0f4c3a] font-bold">
                            {log.action}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-rose-700">
                            {log.beforeValue || '-'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">
                            {log.afterValue || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                            {log.reason ? <strong>কারণ: {log.reason} | </strong> : null}
                            {log.details}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {adminTab === 'zkteco' && <ZkTecoMachinePanel />}
        </div>
      )}

      {/* MODAL 1: EMPLOYEE CORRECTION REQUEST */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              হাজিরা সংশোধনের আবেদন (Correction Request)
            </h3>
            <p className="text-xs text-slate-500">
              ভুলবশত Punch In বা Punch Out করতে ভুলে গেলে সঠিক সময়, কারণ ও প্রমাণকসহ আবেদন জমা দিন।
            </p>
            <form onSubmit={handleCorrectionSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">তারিখ</label>
                <input
                  type="date"
                  value={corrDate}
                  onChange={(e) => setCorrDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">সংশোধনের ধরন</label>
                <select
                  value={corrType}
                  onChange={(e) => setCorrType(e.target.value as 'IN' | 'OUT' | 'BOTH')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  <option value="OUT">শুধুমাত্র Punch Out সময়</option>
                  <option value="IN">শুধুমাত্র Punch In সময়</option>
                  <option value="BOTH">Punch In এবং Punch Out উভয়ই</option>
                </select>
              </div>
              {(corrType === 'IN' || corrType === 'BOTH') && (
                <div>
                  <label className="block text-xs font-bold mb-1">সঠিক প্রবেশ সময় (Punch In)</label>
                  <input
                    type="time"
                    value={corrInTime}
                    onChange={(e) => setCorrInTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              )}
              {(corrType === 'OUT' || corrType === 'BOTH') && (
                <div>
                  <label className="block text-xs font-bold mb-1">সঠিক প্রস্থান সময় (Punch Out)</label>
                  <input
                    type="time"
                    value={corrOutTime}
                    onChange={(e) => setCorrOutTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold mb-1">সুনির্দিষ্ট কারণ (বাধ্যতামূলক)</label>
                <textarea
                  rows={3}
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  required
                  placeholder="কেন যথাসময়ে Punch করা সম্ভব হয়নি তা বিস্তারিত লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">প্রমাণক ফাইল / রেফারেন্স নোট (ঐচ্ছিক)</label>
                <input
                  type="text"
                  value={corrAttachment}
                  onChange={(e) => setCorrAttachment(e.target.value)}
                  placeholder="ডকুমেন্টের নাম বা রেফারেন্স লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0f4c3a] text-white text-xs font-bold"
                >
                  আবেদন জমা দিন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DIRECT ADMIN ATTENDANCE EDIT WITH MANDATORY AUDIT REASON */}
      {editingTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              হাজিরা রেকর্ড সংশোধন (Admin Direct Edit)
            </h3>
            <p className="text-xs text-slate-500">
              {editingTarget.employee.nameBn || editingTarget.employee.name} ({editingTarget.employee.id}) — তারিখ: {editingTarget.date}। এই পরিবর্তনটি পূর্বের ও পরের মানসহ Audit Log-এ সংরক্ষিত হবে।
            </p>
            <form onSubmit={handleSaveAdminEdit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1">প্রবেশ সময় (Punch In)</label>
                  <input
                    type="time"
                    value={editingTarget.firstInTime}
                    onChange={(e) => setEditingTarget({ ...editingTarget, firstInTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">প্রস্থান সময় (Punch Out)</label>
                  <input
                    type="time"
                    value={editingTarget.lastOutTime}
                    onChange={(e) => setEditingTarget({ ...editingTarget, lastOutTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">উপস্থিতি স্ট্যাটাস</label>
                <select
                  value={editingTarget.status}
                  onChange={(e) =>
                    setEditingTarget({ ...editingTarget, status: e.target.value as AttendanceStatus })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  <option value="Present">Present (উপস্থিত)</option>
                  <option value="Late">Late (বিলম্বে প্রবেশ)</option>
                  <option value="Leave">Leave (অনুমোদিত ছুটি)</option>
                  <option value="Absent">Absent (অনুপস্থিত)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">পরিবর্তনের কারণ (Audit Log-এর জন্য বাধ্যতামূলক)</label>
                <textarea
                  rows={2}
                  required
                  value={editingTarget.reason}
                  onChange={(e) => setEditingTarget({ ...editingTarget, reason: e.target.value })}
                  placeholder="কেন এই হাজিরা পরিবর্তন করা হচ্ছে তা লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0f4c3a] text-white text-xs font-bold"
                >
                  সংরক্ষণ ও অডিট লগে যুক্ত করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Camera QR Punch Scanner Modal */}
      <QrPunchScannerModal {...scannerProps} />
    </div>
  );
}
