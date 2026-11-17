'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp, getDhakaDateTime } from '@/lib/store';
import {
  CalendarEvent,
  CalendarEventCategory,
  Employee,
  isAdministrativeRole,
  isDepartmentLeader,
} from '@/lib/types';
import {
  GREGORIAN_MONTHS_BN,
  WEEKDAYS_SHORT_BN,
  toBnDigits,
  formatIsoDate,
  getBengaliDateInfo,
  getHijriDateInfo,
  getGregorianDateFullBn,
  getDayOperationalStatus,
  getCategoryLabelBn,
  getCategoryBadgeStyle,
  enumerateDateRange,
} from '@/lib/calendar-utils';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Edit3,
  Trash2,
  Download,
  Printer,
  Search,
  Sliders,
  CheckCircle2,
  X,
  Clock,
  MapPin,
  Users,
  RotateCcw,
  FileText,
  ArrowRight,
  Check,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';

type CalendarTab = 'month' | 'year' | 'list' | 'leave-policy';

interface AnnualCalendarProps {
  initialTab?: CalendarTab;
}

export function AnnualCalendar({ initialTab = 'month' }: AnnualCalendarProps) {
  const {
    currentUser,
    employees,
    policy,
    updatePolicy,
    calendarEvents,
    createCalendarEvent,
    createCalendarEventsBatch,
    updateCalendarEvent,
    deleteCalendarEvent,
    meetings,
    scheduleMeetingFromCalendar,
    updateMeeting,
    setActiveNav,
    setFocusedMeetingId,
    focusedCalendarDate,
    setFocusedCalendarDate,
    institutionalLeavePolicy,
    getEmployeeLeaveBalance,
    updateInstitutionalLeavePolicy,
    updateEmployeeLeaveQuota,
  } = useApp();

  const isAdmin = isAdministrativeRole(currentUser.role);
  const isLeader = isDepartmentLeader(currentUser.role);
  const canScheduleMeeting = isAdmin || isLeader;
  const { dateStr: todayStr } = getDhakaDateTime();
  const initialDateTarget = focusedCalendarDate || todayStr;
  const [initY, initM] = initialDateTarget.split('-').map(Number);
  const [todayYear, todayMonth] = todayStr.split('-').map(Number);

  const [activeTab, setActiveTab] = useState<CalendarTab>(
    initialTab === 'leave-policy' && !isAdmin ? 'month' : initialTab
  );
  const [selectedYear, setSelectedYear] = useState<number>(initY || todayYear || 2026);
  const [selectedMonth, setSelectedMonth] = useState<number>((initM || todayMonth || 1) - 1); // 0-11
  const [selectedDate, setSelectedDate] = useState<string>(initialDateTarget);

  useEffect(() => {
    if (!focusedCalendarDate) return;
    const target = focusedCalendarDate;
    const timer = setTimeout(() => {
      const [fy, fm] = target.split('-').map(Number);
      if (fy && fm) {
        setSelectedYear(fy);
        setSelectedMonth(fm - 1);
      }
      setSelectedDate(target);
      setActiveTab('month');
      setFocusedCalendarDate(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [focusedCalendarDate, setFocusedCalendarDate]);

  // Filters for List view
  const [listCategoryFilter, setListCategoryFilter] = useState<'ALL' | CalendarEventCategory>('ALL');
  const [listMonthFilter, setListMonthFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add / Edit Event Modal State
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [evTitle, setEvTitle] = useState<string>('');
  const [evCategory, setEvCategory] = useState<CalendarEventCategory>('Holiday');
  const [evStartDate, setEvStartDate] = useState<string>(todayStr);
  const [evEndDate, setEvEndDate] = useState<string>(todayStr);
  const [evTimeLabel, setEvTimeLabel] = useState<string>('');
  const [evLocation, setEvLocation] = useState<string>('');
  const [evDescription, setEvDescription] = useState<string>('');
  const [evBatchRows, setEvBatchRows] = useState<
    Array<{ title: string; startDate: string; endDate: string }>
  >([{ title: '', startDate: todayStr, endDate: todayStr }]);

  // Meeting-specific fields inside Add/Edit Modal
  const [evDepartment, setEvDepartment] = useState<string>('সকল বিভাগ');
  const [evStartTime, setEvStartTime] = useState<string>('10:00');
  const [evEndTime, setEvEndTime] = useState<string>('11:30');
  const [evChairperson, setEvChairperson] = useState<string>(currentUser.nameBn || currentUser.name);
  const [evSecretary, setEvSecretary] = useState<string>('');
  const [evAgendaText, setEvAgendaText] = useState<string>('');
  const [evInvitedIds, setEvInvitedIds] = useState<string[]>([]);
  const [evParticipantSearch, setEvParticipantSearch] = useState<string>('');

  // Confirm delete modal state (replaces native confirm)
  const [confirmDeleteEv, setConfirmDeleteEv] = useState<CalendarEvent | null>(null);

  // Institutional Leave Policy Editor State (Admin only)
  const [lpYearLabel, setLpYearLabel] = useState<string>(institutionalLeavePolicy.academicYearLabel);
  const [lpClEnabled, setLpClEnabled] = useState<boolean>(institutionalLeavePolicy.casualLeaveEnabled);
  const [lpClDays, setLpClDays] = useState<number>(institutionalLeavePolicy.casualLeaveDefault);
  const [lpSlEnabled, setLpSlEnabled] = useState<boolean>(institutionalLeavePolicy.sickLeaveEnabled);
  const [lpSlDays, setLpSlDays] = useState<number>(institutionalLeavePolicy.sickLeaveDefault);
  const [lpElEnabled, setLpElEnabled] = useState<boolean>(institutionalLeavePolicy.earnedLeaveEnabled);
  const [lpElDays, setLpElDays] = useState<number>(institutionalLeavePolicy.earnedLeaveDefault);
  const [lpDlEnabled, setLpDlEnabled] = useState<boolean>(institutionalLeavePolicy.dutyLeaveEnabled);
  const [lpHijriOffset, setLpHijriOffset] = useState<-1 | 0 | 1>(institutionalLeavePolicy.hijriOffsetDays);
  const [lpSavedBanner, setLpSavedBanner] = useState<string | null>(null);

  // Per-employee quota modal state
  const [empSearch, setEmpSearch] = useState<string>('');
  const [editingQuotaEmp, setEditingQuotaEmp] = useState<Employee | null>(null);
  const [quotaCl, setQuotaCl] = useState<number>(14);
  const [quotaSl, setQuotaSl] = useState<number>(10);
  const [quotaEl, setQuotaEl] = useState<number>(18);

  const hijriOffset = institutionalLeavePolicy.hijriOffsetDays;

  // Today's Tri-Date & Operational Status
  const todayBn = getBengaliDateInfo(todayStr);
  const todayHijri = getHijriDateInfo(todayStr, hijriOffset);
  const todayGregorianBn = getGregorianDateFullBn(todayStr);
  const todayStatus = getDayOperationalStatus(todayStr, policy, calendarEvents);

  const meetingsById = useMemo(() => {
    return new Map(meetings.map((m) => [m.id, m]));
  }, [meetings]);

  const departmentOptions = useMemo(() => {
    const unique = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));
    return ['সকল বিভাগ', ...unique];
  }, [employees]);

  const filteredModalEmployees = useMemo(() => {
    const q = evParticipantSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      if (!q) return true;
      return (
        emp.id.toLowerCase().includes(q) ||
        emp.name.toLowerCase().includes(q) ||
        (emp.nameBn && emp.nameBn.toLowerCase().includes(q)) ||
        emp.department.toLowerCase().includes(q)
      );
    });
  }, [employees, evParticipantSearch]);

  // Selected Date Inspector Info
  const selectedBn = getBengaliDateInfo(selectedDate);
  const selectedHijri = getHijriDateInfo(selectedDate, hijriOffset);
  const selectedGregorianBn = getGregorianDateFullBn(selectedDate);
  const selectedStatus = getDayOperationalStatus(selectedDate, policy, calendarEvents);

  // Monthly grid computation
  const monthCells = useMemo(() => {
    const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay(); // 0=Sun..6=Sat
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const cells: Array<{
      dateStr: string | null;
      day: number | null;
    }> = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ dateStr: null, day: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: formatIsoDate(selectedYear, selectedMonth, d),
        day: d,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ dateStr: null, day: null });
    }
    return cells;
  }, [selectedYear, selectedMonth]);

  // Year stats for selectedYear
  const yearEvents = useMemo(() => {
    const yStr = String(selectedYear);
    return calendarEvents.filter(
      (ev) => ev.startDate.startsWith(yStr) || ev.endDate.startsWith(yStr)
    );
  }, [calendarEvents, selectedYear]);

  const annualStats = useMemo(() => {
    let holidayDays = 0;
    let examCount = 0;
    let academicCount = 0;
    let eventCount = 0;
    let meetingCount = 0;
    const holidayDatesSet = new Set<string>();

    yearEvents.forEach((ev) => {
      if (ev.category === 'Holiday') {
        enumerateDateRange(ev.startDate, ev.endDate).forEach((d) => {
          if (d.startsWith(String(selectedYear))) {
            holidayDatesSet.add(d);
          }
        });
      } else if (ev.category === 'Exam') {
        examCount++;
      } else if (ev.category === 'Academic') {
        academicCount++;
      } else if (ev.category === 'Event') {
        eventCount++;
      } else if (ev.category === 'Meeting') {
        meetingCount++;
      }
    });
    holidayDays = holidayDatesSet.size;

    return {
      totalEntries: yearEvents.length,
      holidayDays,
      examCount,
      academicCount,
      eventCount,
      meetingCount,
    };
  }, [yearEvents, selectedYear]);

  const filteredListEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return yearEvents.filter((ev) => {
      if (listCategoryFilter !== 'ALL' && ev.category !== listCategoryFilter) return false;
      if (listMonthFilter !== 'ALL') {
        const monthPrefix = `${selectedYear}-${listMonthFilter.padStart(2, '0')}`;
        if (!ev.startDate.startsWith(monthPrefix) && !ev.endDate.startsWith(monthPrefix)) {
          return false;
        }
      }
      if (q) {
        return (
          ev.title.toLowerCase().includes(q) ||
          (ev.description && ev.description.toLowerCase().includes(q)) ||
          (ev.location && ev.location.toLowerCase().includes(q)) ||
          (ev.department && ev.department.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [yearEvents, listCategoryFilter, listMonthFilter, selectedYear, searchQuery]);

  // Handlers
  const goPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const openAddModal = (presetDate?: string, presetCategory?: CalendarEventCategory) => {
    const target = presetDate || selectedDate || todayStr;
    const defaultCategory: CalendarEventCategory = !isAdmin
      ? 'Meeting'
      : presetCategory || 'Holiday';
    setEditingEventId(null);
    setEvTitle('');
    setEvCategory(defaultCategory);
    setEvStartDate(target);
    setEvEndDate(target);
    setEvBatchRows([{ title: '', startDate: target, endDate: target }]);
    setEvTimeLabel('');
    setEvLocation(defaultCategory === 'Meeting' ? 'ইনস্টিটিউট কনফারেন্স রুম' : '');
    setEvDescription('');
    setEvDepartment(!isAdmin ? currentUser.department || 'সকল বিভাগ' : 'সকল বিভাগ');
    setEvStartTime('10:00');
    setEvEndTime('11:30');
    setEvChairperson(currentUser.nameBn || currentUser.name);
    setEvSecretary('');
    setEvAgendaText('');
    setEvInvitedIds([]);
    setEvParticipantSearch('');
    setShowEventModal(true);
  };

  const openEditModal = (ev: CalendarEvent) => {
    const linkedMtg = ev.linkedMeetingId ? meetingsById.get(ev.linkedMeetingId) : undefined;
    setEditingEventId(ev.id);
    setEvTitle(ev.title);
    setEvCategory(ev.category);
    setEvStartDate(ev.startDate);
    setEvEndDate(ev.endDate);
    setEvTimeLabel(ev.timeLabel || '');
    setEvLocation(linkedMtg?.venue || ev.location || '');
    setEvDescription(ev.description || '');
    setEvDepartment(linkedMtg?.department || ev.department || 'সকল বিভাগ');
    setEvStartTime(linkedMtg?.startTime || '10:00');
    setEvEndTime(linkedMtg?.endTime || '11:30');
    setEvChairperson(linkedMtg?.chairperson || currentUser.nameBn || currentUser.name);
    setEvSecretary(linkedMtg?.secretary || '');
    setEvAgendaText(linkedMtg?.agenda ? linkedMtg.agenda.join('\n') : '');
    setEvInvitedIds(linkedMtg?.invitedEmployeeIds || []);
    setEvParticipantSearch('');
    setShowEventModal(true);
  };

  const toggleInvitedEmployee = (empId: string) => {
    setEvInvitedIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const selectDepartmentEmployees = () => {
    const targetEmps =
      evDepartment === 'সকল বিভাগ'
        ? employees
        : employees.filter((e) => e.department === evDepartment);
    const ids = targetEmps.map((e) => e.id);
    setEvInvitedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEnd = evEndDate && evEndDate >= evStartDate ? evEndDate : evStartDate;

    if (evCategory === 'Meeting') {
      if (!evTitle.trim() || !evStartDate) return;
      const agendaArr = evAgendaText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const participantNames = evInvitedIds.map((empId) => {
        const emp = employees.find((x) => x.id === empId);
        return emp ? emp.nameBn || emp.name : empId;
      });
      const resolvedVenue = evLocation.trim() || 'ইনস্টিটিউট কনফারেন্স রুম';
      const resolvedDept = evDepartment.trim() || 'সকল বিভাগ';
      const combinedTime =
        evStartTime && evEndTime ? `${evStartTime} - ${evEndTime}` : evStartTime || undefined;

      if (editingEventId) {
        const existingEv = calendarEvents.find((item) => item.id === editingEventId);
        updateCalendarEvent(editingEventId, {
          title: evTitle.trim(),
          category: 'Meeting',
          startDate: evStartDate,
          endDate: evStartDate,
          timeLabel: combinedTime,
          location: resolvedVenue,
          department: resolvedDept,
          description: evDescription.trim() || undefined,
        });
        if (existingEv?.linkedMeetingId) {
          updateMeeting(existingEv.linkedMeetingId, {
            title: evTitle.trim(),
            date: evStartDate,
            startTime: evStartTime,
            endTime: evEndTime,
            venue: resolvedVenue,
            chairperson: evChairperson.trim() || currentUser.nameBn || currentUser.name,
            secretary: evSecretary.trim(),
            department: resolvedDept,
            agenda: agendaArr,
            participants: participantNames,
            invitedEmployeeIds: evInvitedIds,
          });
        }
      } else {
        scheduleMeetingFromCalendar({
          title: evTitle.trim(),
          department: resolvedDept,
          date: evStartDate,
          startTime: evStartTime,
          endTime: evEndTime,
          venue: resolvedVenue,
          chairperson: evChairperson.trim() || currentUser.nameBn || currentUser.name,
          secretary: evSecretary.trim(),
          agenda: agendaArr,
          participants: participantNames,
          invitedEmployeeIds: evInvitedIds,
          description: evDescription.trim() || undefined,
        });
      }
      setShowEventModal(false);
      return;
    }

    if (editingEventId) {
      if (!evTitle.trim() || !evStartDate) return;
      updateCalendarEvent(editingEventId, {
        title: evTitle.trim(),
        category: evCategory,
        startDate: evStartDate,
        endDate: normalizedEnd,
        timeLabel: evTimeLabel.trim() || undefined,
        location: evLocation.trim() || undefined,
        description: evDescription.trim() || undefined,
      });
    } else {
      const validRows = evBatchRows.filter((r) => r.title.trim().length > 0 && r.startDate);
      if (validRows.length === 0) return;

      const batchPayload = validRows.map((r) => ({
        title: r.title.trim(),
        category: evCategory,
        startDate: r.startDate,
        endDate: r.endDate && r.endDate >= r.startDate ? r.endDate : r.startDate,
        timeLabel: evTimeLabel.trim() || undefined,
        location: evLocation.trim() || undefined,
        description: evDescription.trim() || undefined,
      }));

      if (batchPayload.length === 1) {
        createCalendarEvent(batchPayload[0]);
      } else {
        createCalendarEventsBatch(batchPayload);
      }
    }
    setShowEventModal(false);
  };

  const handleOpenMeetingMinutes = (ev: CalendarEvent) => {
    if (ev.linkedMeetingId) {
      setFocusedMeetingId(ev.linkedMeetingId);
    }
    setActiveNav('meetings');
  };

  const handleSaveLeavePolicy = (applyMode: 'non_custom' | 'all') => {
    updateInstitutionalLeavePolicy(
      {
        year: selectedYear,
        academicYearLabel: lpYearLabel.trim() || `${toBnDigits(selectedYear)} শিক্ষাবর্ষ`,
        casualLeaveEnabled: lpClEnabled,
        casualLeaveDefault: Math.max(0, Number(lpClDays) || 0),
        sickLeaveEnabled: lpSlEnabled,
        sickLeaveDefault: Math.max(0, Number(lpSlDays) || 0),
        earnedLeaveEnabled: lpElEnabled,
        earnedLeaveDefault: Math.max(0, Number(lpElDays) || 0),
        dutyLeaveEnabled: lpDlEnabled,
        hijriOffsetDays: lpHijriOffset,
      },
      applyMode
    );
    setLpSavedBanner(
      applyMode === 'all'
        ? 'প্রাতিষ্ঠানিক ছুটির নীতিমালা সংরক্ষিত হয়েছে এবং সকল শিক্ষক ও স্টাফের কোটায় সমানভাবে প্রয়োগ করা হয়েছে।'
        : 'প্রাতিষ্ঠানিক ছুটির নীতিমালা সংরক্ষিত হয়েছে (ব্যক্তিগত সমন্বয়কৃত কোটাসমূহ অপরিবর্তিত রাখা হয়েছে)।'
    );
    setTimeout(() => setLpSavedBanner(null), 5000);
  };

  const openEmpQuotaModal = (emp: Employee) => {
    const bal = getEmployeeLeaveBalance(emp.id);
    setEditingQuotaEmp(emp);
    setQuotaCl(bal.casualLeaveTotal);
    setQuotaSl(bal.sickLeaveTotal);
    setQuotaEl(bal.earnedLeaveTotal);
  };

  const handleSaveEmpQuota = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotaEmp) return;
    updateEmployeeLeaveQuota(editingQuotaEmp.id, {
      casualLeaveTotal: Math.max(0, Number(quotaCl) || 0),
      sickLeaveTotal: Math.max(0, Number(quotaSl) || 0),
      earnedLeaveTotal: Math.max(0, Number(quotaEl) || 0),
      isCustomQuota: true,
    });
    setEditingQuotaEmp(null);
  };

  const handleExportExcel = () => {
    const rows = yearEvents.map((ev, idx) => {
      const bnStart = getBengaliDateInfo(ev.startDate).formattedFull;
      const hjStart = getHijriDateInfo(ev.startDate, hijriOffset).formattedFull;
      return {
        'ক্রম': idx + 1,
        'শুরুর তারিখ': ev.startDate,
        'শেষ তারিখ': ev.endDate,
        'বাংলা তারিখ': bnStart,
        'হিজরি তারিখ': hjStart,
        'ধরন / ক্যাটাগরি': getCategoryLabelBn(ev.category),
        'ডিপার্টমেন্ট': ev.department || '',
        'শিরোনাম': ev.title,
        'সময়': ev.timeLabel || '',
        'স্থান': ev.location || '',
        'বিস্তারিত': ev.description || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Calendar_${selectedYear}`);
    XLSX.writeFile(wb, `ASDRI_Annual_Calendar_${selectedYear}.xlsx`);
  };

  const filteredEmployees = employees.filter((e) => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      (e.nameBn && e.nameBn.toLowerCase().includes(q)) ||
      e.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 font-serif">
      {/* Header & Today Tri-Date Banner */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 sm:px-5 py-3.5 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarDays className="w-5 h-5 text-emerald-900 shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              বার্ষিক ক্যালেন্ডার ({toBnDigits(selectedYear)})
            </h1>
            <span className="hidden sm:inline-block text-xs text-slate-400">·</span>
            <span className="hidden sm:inline-block text-xs font-semibold text-emerald-800">
              {institutionalLeavePolicy.academicYearLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-bold font-mono text-slate-900"
            >
              {[2025, 2026, 2027, 2028].map((yr) => (
                <option key={yr} value={yr}>
                  {toBnDigits(yr)} ({yr})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>প্রিন্ট</span>
            </button>

            {canScheduleMeeting && (
              <button
                type="button"
                onClick={() => openAddModal()}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5 text-amber-300" />
                <span>{isAdmin ? 'নতুন যোগ' : 'নতুন মিটিং'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Today's Tri-Date Highlight Strip */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-700">
            <span className="font-bold text-emerald-900">আজ:</span>
            <span className="font-semibold text-slate-900">{todayGregorianBn}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-semibold text-amber-900">{todayBn.formattedFull}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="font-semibold text-sky-900">{todayHijri.formattedFull}</span>
          </div>

          <span
            className={`px-2 py-0.5 rounded border text-[11px] font-semibold w-fit ${
              todayStatus.isAnyHoliday
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}
          >
            {todayStatus.isAnyHoliday
              ? `আজ ছুটি: ${todayStatus.holidayTitle || 'ছুটির দিন'}`
              : todayStatus.isSpecialWorkingDay
              ? 'বিশেষ কর্মদিবস'
              : 'নিয়মিত কর্মদিবস'}
          </span>
        </div>
      </div>

      {/* Navigation Tabs & Institutional Leave Quick Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-full sm:w-fit overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('month')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'month' ? 'bg-white text-emerald-950 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            মাসিক
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('year')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'year' ? 'bg-white text-emerald-950 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            বার্ষিক ১২ মাস
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'list' ? 'bg-white text-emerald-950 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            তালিকা ({toBnDigits(yearEvents.length)})
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('leave-policy')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === 'leave-policy'
                  ? 'bg-emerald-900 text-white shadow-2xs'
                  : 'text-emerald-900 hover:bg-white/70'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>ছুটির কোটা</span>
            </button>
          )}
        </div>

        {/* Institutional Leave Quota Strip */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-800">বার্ষিক ছুটি:</span>
          <span>
            CL:{' '}
            <strong className="font-mono tabular-nums text-slate-900">
              {institutionalLeavePolicy.casualLeaveEnabled
                ? toBnDigits(institutionalLeavePolicy.casualLeaveDefault)
                : 'বন্ধ'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            SL:{' '}
            <strong className="font-mono tabular-nums text-slate-900">
              {institutionalLeavePolicy.sickLeaveEnabled
                ? toBnDigits(institutionalLeavePolicy.sickLeaveDefault)
                : 'বন্ধ'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            EL:{' '}
            <strong
              className={`font-mono tabular-nums ${
                institutionalLeavePolicy.earnedLeaveEnabled ? 'text-emerald-800' : 'text-rose-700'
              }`}
            >
              {institutionalLeavePolicy.earnedLeaveEnabled
                ? toBnDigits(institutionalLeavePolicy.earnedLeaveDefault)
                : 'বন্ধ'}
            </strong>
          </span>
        </div>
      </div>

      {/* TAB 1: MONTHLY GRID VIEW */}
      {activeTab === 'month' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left 8 cols: Monthly Grid */}
          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Month Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 min-w-[125px] sm:min-w-[145px] text-center">
                  {GREGORIAN_MONTHS_BN[selectedMonth]} {toBnDigits(selectedYear)}
                </h2>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  {GREGORIAN_MONTHS_BN.map((mName, idx) => (
                    <option key={mName} value={idx}>
                      {mName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYear(todayYear);
                    setSelectedMonth(todayMonth - 1);
                    setSelectedDate(todayStr);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  আজ
                </button>
              </div>
            </div>

            {/* Weekday Header Row */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] sm:text-xs font-bold text-slate-700">
              {WEEKDAYS_SHORT_BN.map((wd, idx) => {
                const engDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const isWeeklyOff = policy.weeklyHolidays.includes(engDays[idx]);
                return (
                  <div
                    key={wd}
                    className={`py-2 border-r last:border-r-0 border-slate-200 ${
                      isWeeklyOff ? 'text-rose-700 bg-rose-50/40' : ''
                    }`}
                  >
                    {wd}
                  </div>
                );
              })}
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7">
              {monthCells.map((cell, index) => {
                if (!cell.dateStr || !cell.day) {
                  return (
                    <div
                      key={`empty-${index}`}
                      className="min-h-[58px] sm:min-h-[100px] border-r border-b border-slate-100 bg-slate-50/40"
                    />
                  );
                }

                const dStr = cell.dateStr;
                const bn = getBengaliDateInfo(dStr);
                const hj = getHijriDateInfo(dStr, hijriOffset);
                const opStatus = getDayOperationalStatus(dStr, policy, calendarEvents);
                const isToday = dStr === todayStr;
                const isSelected = dStr === selectedDate;

                return (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => setSelectedDate(dStr)}
                    className={`min-h-[58px] sm:min-h-[100px] p-1 sm:p-2 border-r border-b border-slate-200/80 text-left flex flex-col justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/90 ring-2 ring-inset ring-emerald-700'
                        : opStatus.isAnyHoliday
                        ? 'bg-rose-50/45 hover:bg-rose-50'
                        : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-0.5 sm:gap-1 w-full">
                      <span
                        className={`text-xs sm:text-sm font-bold font-mono tabular-nums leading-none px-1 sm:px-1.5 py-0.5 rounded ${
                          isToday
                            ? 'bg-emerald-900 text-white'
                            : opStatus.isAnyHoliday
                            ? 'text-rose-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {toBnDigits(cell.day)}
                      </span>
                      <span className="hidden sm:inline text-[9px] text-amber-800 font-medium leading-tight text-right">
                        {bn.formattedShort}
                      </span>
                      <span className="sm:hidden text-[9px] text-amber-800 font-medium leading-none tabular-nums">
                        {toBnDigits(bn.day)}
                      </span>
                    </div>

                    {/* Desktop Event Chips */}
                    <div className="hidden sm:block space-y-0.5 my-1 w-full overflow-hidden">
                      {opStatus.dayEvents.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className={`px-1 py-0.5 rounded border text-[9px] font-semibold truncate ${getCategoryBadgeStyle(
                            ev.category
                          )}`}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {opStatus.dayEvents.length > 2 && (
                        <div className="text-[9px] font-semibold text-emerald-800 px-0.5">
                          +{toBnDigits(opStatus.dayEvents.length - 2)} আরও
                        </div>
                      )}
                    </div>

                    {/* Mobile Compact Event Dots */}
                    {opStatus.dayEvents.length > 0 && (
                      <div className="flex sm:hidden flex-wrap items-center gap-0.5 my-0.5">
                        {opStatus.dayEvents.slice(0, 3).map((ev) => (
                          <span
                            key={ev.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              ev.category === 'Holiday'
                                ? 'bg-rose-500'
                                : ev.category === 'Exam'
                                ? 'bg-amber-500'
                                : ev.category === 'Meeting'
                                ? 'bg-purple-600'
                                : ev.category === 'Event'
                                ? 'bg-sky-500'
                                : ev.category === 'Special_Working_Day'
                                ? 'bg-indigo-500'
                                : 'bg-emerald-600'
                            }`}
                          />
                        ))}
                        {opStatus.dayEvents.length > 3 && (
                          <span className="text-[8px] font-bold text-emerald-800 leading-none">
                            +{toBnDigits(opStatus.dayEvents.length - 3)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="hidden sm:block text-[9px] text-sky-800 truncate w-full text-right leading-tight">
                      {hj.formattedCompact}
                    </div>
                    <div className="sm:hidden text-[8px] text-sky-800 w-full text-right leading-none tabular-nums">
                      {toBnDigits(hj.day)}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Category Legend */}
            <div className="px-3 sm:px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-200 border border-rose-400" /> ছুটি
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-200 border border-emerald-400" /> একাডেমিক
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-200 border border-amber-400" /> পরীক্ষা
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-sky-200 border border-sky-400" /> ইভেন্ট
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-indigo-200 border border-indigo-400" /> বিশেষ কর্মদিবস
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-purple-200 border border-purple-400" /> মিটিং
              </span>
            </div>
          </div>

          {/* Right 4 cols: Selected Date Inspector */}
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3.5">
            <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedGregorianBn}</h3>
                <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-amber-900 font-medium">{selectedBn.formattedFull}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-sky-900 font-medium">{selectedHijri.formattedFull}</span>
                </div>
              </div>

              {canScheduleMeeting && (
                <button
                  type="button"
                  onClick={() => openAddModal(selectedDate)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-amber-300" />
                  <span>যোগ</span>
                </button>
              )}
            </div>

            <div
              className={`px-3 py-2 rounded-lg border text-xs font-semibold ${
                selectedStatus.isAnyHoliday
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : selectedStatus.isSpecialWorkingDay
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {selectedStatus.isAnyHoliday
                ? `ছুটি: ${selectedStatus.holidayTitle || 'প্রতিষ্ঠান ছুটি'}`
                : selectedStatus.isSpecialWorkingDay
                ? 'বিশেষ কর্মদিবস'
                : 'নিয়মিত কর্মদিবস'}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800">
                কার্যক্রম ({toBnDigits(selectedStatus.dayEvents.length)})
              </div>

              {selectedStatus.dayEvents.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-500 space-y-1.5">
                  <p>কোনো কার্যক্রম নেই।</p>
                  {canScheduleMeeting && (
                    <button
                      type="button"
                      onClick={() => openAddModal(selectedDate)}
                      className="text-emerald-800 font-semibold hover:underline cursor-pointer"
                    >
                      + নতুন যুক্ত করুন
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedStatus.dayEvents.map((ev) => {
                    const linkedMtg = ev.linkedMeetingId
                      ? meetingsById.get(ev.linkedMeetingId)
                      : undefined;
                    const canModifyEv =
                      isAdmin || (ev.category === 'Meeting' && isLeader);
                    const hasMinutesAdded = linkedMtg?.meetingStatus === 'Minutes_Added';

                    return (
                      <div
                        key={ev.id}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span
                              className={`px-2 py-0.5 rounded border font-bold ${getCategoryBadgeStyle(
                                ev.category
                              )}`}
                            >
                              {getCategoryLabelBn(ev.category)}
                            </span>
                            {(ev.department || linkedMtg?.department) && (
                              <span className="font-semibold text-slate-600">
                                · {linkedMtg?.department || ev.department}
                              </span>
                            )}
                          </div>
                          {canModifyEv && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditModal(ev)}
                                title="সম্পাদনা"
                                className="p-1 rounded bg-white border border-slate-200 text-amber-700 hover:bg-amber-50 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteEv(ev)}
                                title="মুছুন"
                                className="p-1 rounded bg-white border border-slate-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="font-bold text-slate-900 text-sm">{ev.title}</div>

                        {ev.startDate !== ev.endDate && (
                          <div className="text-[11px] font-mono text-slate-600 flex items-center gap-1.5">
                            <span>
                              {ev.startDate} → {ev.endDate}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                              {toBnDigits(enumerateDateRange(ev.startDate, ev.endDate).length)} দিন
                            </span>
                          </div>
                        )}

                        {(ev.timeLabel || ev.location) && (
                          <div className="flex flex-wrap gap-2.5 text-[11px] text-slate-600">
                            {ev.timeLabel && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" /> {ev.timeLabel}
                              </span>
                            )}
                            {ev.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" /> {ev.location}
                              </span>
                            )}
                          </div>
                        )}

                        {ev.category === 'Meeting' && linkedMtg && (
                          <div className="pt-1.5 border-t border-slate-200/70 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-slate-600 inline-flex items-center gap-1">
                                <Users className="w-3 h-3 text-purple-700" />
                                আমন্ত্রিত:{' '}
                                <strong className="text-slate-900 font-mono tabular-nums">
                                  {toBnDigits(
                                    linkedMtg.invitedEmployeeIds?.length ||
                                      linkedMtg.participants.length
                                  )}
                                </strong>
                              </span>

                              <span
                                className={`text-[10px] font-bold ${
                                  hasMinutesAdded ? 'text-emerald-800' : 'text-amber-800'
                                }`}
                              >
                                {hasMinutesAdded ? '• মিনিটস সম্পন্ন' : '• মিনিটস বাকি'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenMeetingMinutes(ev)}
                              className={`w-full py-1.5 px-3 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                                hasMinutesAdded
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                                  : 'bg-purple-900 hover:bg-purple-800 text-white border-purple-900'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>
                                {hasMinutesAdded
                                  ? 'মিনিটস দেখুন'
                                  : canScheduleMeeting
                                  ? 'মিনিটস লিখুন'
                                  : 'বিবরণ দেখুন'}
                              </span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {ev.description && ev.category !== 'Meeting' && (
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FULL 12-MONTH YEAR OVERVIEW */}
      {activeTab === 'year' && (
        <div className="space-y-4">
          {/* Annual Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">ঘোষিত ছুটি</div>
              <div className="text-xl font-bold font-mono tabular-nums text-rose-700 mt-0.5">
                {toBnDigits(annualStats.holidayDays)} দিন
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">একাডেমিক</div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-800 mt-0.5">
                {toBnDigits(annualStats.academicCount)} টি
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">পরীক্ষা</div>
              <div className="text-xl font-bold font-mono tabular-nums text-amber-800 mt-0.5">
                {toBnDigits(annualStats.examCount)} টি
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">ইভেন্ট</div>
              <div className="text-xl font-bold font-mono tabular-nums text-sky-800 mt-0.5">
                {toBnDigits(annualStats.eventCount)} টি
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-500">মিটিং</div>
              <div className="text-xl font-bold font-mono tabular-nums text-purple-800 mt-0.5">
                {toBnDigits(annualStats.meetingCount)} টি
              </div>
            </div>
          </div>

          {/* 12 Months Mini Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {GREGORIAN_MONTHS_BN.map((mName, mIdx) => {
              const firstDay = new Date(selectedYear, mIdx, 1).getDay();
              const totalDays = new Date(selectedYear, mIdx + 1, 0).getDate();
              const blanks = Array.from({ length: firstDay });
              const days = Array.from({ length: totalDays }, (_, i) => i + 1);
              const monthStartBn = getBengaliDateInfo(formatIsoDate(selectedYear, mIdx, 1));
              const monthStartHj = getHijriDateInfo(formatIsoDate(selectedYear, mIdx, 1), hijriOffset);

              return (
                <div
                  key={mName}
                  className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {mName} {toBnDigits(selectedYear)}
                      </h3>
                      <div className="text-[10px] text-slate-500">
                        {monthStartBn.monthName} · {monthStartHj.monthName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth(mIdx);
                        setActiveTab('month');
                      }}
                      className="text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                    >
                      দেখুন →
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500">
                    {WEEKDAYS_SHORT_BN.map((wd) => (
                      <div key={wd}>{wd}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {blanks.map((_, i) => (
                      <div key={`b-${i}`} />
                    ))}
                    {days.map((day) => {
                      const dStr = formatIsoDate(selectedYear, mIdx, day);
                      const status = getDayOperationalStatus(dStr, policy, calendarEvents);
                      const hasExam = status.dayEvents.some((e) => e.category === 'Exam');
                      const hasAcademic = status.dayEvents.some((e) => e.category === 'Academic');
                      const hasMeeting = status.dayEvents.some((e) => e.category === 'Meeting');
                      const hasEvent = status.dayEvents.some((e) => e.category === 'Event');
                      const isToday = dStr === todayStr;

                      let cellStyle = 'bg-slate-50 text-slate-800 hover:bg-slate-100';
                      if (status.isAnyHoliday) {
                        cellStyle = 'bg-rose-50 text-rose-800 border border-rose-200 font-bold';
                      } else if (hasExam) {
                        cellStyle = 'bg-amber-50 text-amber-900 border border-amber-300 font-bold';
                      } else if (hasMeeting) {
                        cellStyle = 'bg-purple-50 text-purple-900 border border-purple-200 font-bold';
                      } else if (hasAcademic) {
                        cellStyle = 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold';
                      } else if (hasEvent) {
                        cellStyle = 'bg-sky-50 text-sky-900 border border-sky-200 font-bold';
                      }

                      return (
                        <button
                          key={dStr}
                          type="button"
                          title={
                            status.dayEvents.length > 0
                              ? status.dayEvents.map((e) => e.title).join(', ')
                              : status.holidayTitle || dStr
                          }
                          onClick={() => {
                            setSelectedDate(dStr);
                            setSelectedMonth(mIdx);
                            setActiveTab('month');
                          }}
                          className={`py-1 rounded font-mono tabular-nums cursor-pointer ${cellStyle} ${
                            isToday ? 'ring-2 ring-emerald-800' : ''
                          }`}
                        >
                          {toBnDigits(day)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: EVENT SCHEDULE LIST */}
      {activeTab === 'list' && (
        <div className="space-y-3">
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'সব' },
                  { id: 'Holiday', label: 'ছুটি' },
                  { id: 'Academic', label: 'একাডেমিক' },
                  { id: 'Exam', label: 'পরীক্ষা' },
                  { id: 'Event', label: 'ইভেন্ট' },
                  { id: 'Special_Working_Day', label: 'বিশেষ কর্মদিবস' },
                  { id: 'Meeting', label: 'মিটিং' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setListCategoryFilter(cat.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                    listCategoryFilter === cat.id
                      ? 'bg-emerald-900 text-white border-emerald-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={listMonthFilter}
                onChange={(e) => setListMonthFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold"
              >
                <option value="ALL">সকল মাস</option>
                {GREGORIAN_MONTHS_BN.map((mName, idx) => (
                  <option key={mName} value={String(idx + 1)}>
                    {mName}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="খুঁজুন..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredListEvents.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-slate-500">
                  কোনো কার্যক্রম পাওয়া যায়নি।
                </div>
              ) : (
                filteredListEvents.map((ev) => {
                  const bn = getBengaliDateInfo(ev.startDate);
                  const hj = getHijriDateInfo(ev.startDate, hijriOffset);
                  const linkedMtg = ev.linkedMeetingId
                    ? meetingsById.get(ev.linkedMeetingId)
                    : undefined;
                  const canModifyEv = isAdmin || (ev.category === 'Meeting' && isLeader);

                  return (
                    <div key={ev.id} className="p-3.5 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getCategoryBadgeStyle(
                              ev.category
                            )}`}
                          >
                            {getCategoryLabelBn(ev.category)}
                          </span>
                          {(ev.department || linkedMtg?.department) && (
                            <span className="text-[10px] font-semibold text-slate-600">
                              · {linkedMtg?.department || ev.department}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {ev.startDate}
                          {ev.endDate !== ev.startDate
                            ? ` → ${ev.endDate} (${toBnDigits(
                                enumerateDateRange(ev.startDate, ev.endDate).length
                              )} দিন)`
                            : ''}
                        </span>
                      </div>

                      <div className="font-bold text-sm text-slate-900">{ev.title}</div>

                      <div className="text-[11px] text-slate-600 space-y-0.5">
                        <div className="text-amber-900">{bn.formattedFull} · {hj.formattedFull}</div>
                        {(ev.timeLabel || ev.location) && (
                          <div>
                            {ev.timeLabel && <span>{ev.timeLabel}</span>}
                            {ev.timeLabel && ev.location && <span> · </span>}
                            {ev.location && <span>{ev.location}</span>}
                          </div>
                        )}
                      </div>

                      {canScheduleMeeting && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {ev.category === 'Meeting' && ev.linkedMeetingId && (
                            <button
                              type="button"
                              onClick={() => handleOpenMeetingMinutes(ev)}
                              className="px-2.5 py-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900 font-semibold cursor-pointer inline-flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              {linkedMtg?.meetingStatus === 'Minutes_Added'
                                ? 'মিনিটস দেখুন'
                                : 'মিনিটস লিখুন'}
                            </button>
                          )}
                          {canModifyEv && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(ev)}
                                className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold cursor-pointer inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" /> সম্পাদনা
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteEv(ev)}
                                className="p-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  <tr>
                    <th className="py-2.5 px-4">তারিখ</th>
                    <th className="py-2.5 px-4">বাংলা ও হিজরি</th>
                    <th className="py-2.5 px-4">ধরন</th>
                    <th className="py-2.5 px-4">শিরোনাম</th>
                    <th className="py-2.5 px-4">সময় ও স্থান</th>
                    {canScheduleMeeting && <th className="py-2.5 px-4 text-right">অ্যাকশন</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredListEvents.length === 0 ? (
                    <tr>
                      <td colSpan={canScheduleMeeting ? 6 : 5} className="py-8 text-center text-slate-500">
                        কোনো কার্যক্রম পাওয়া যায়নি।
                      </td>
                    </tr>
                  ) : (
                    filteredListEvents.map((ev) => {
                      const bn = getBengaliDateInfo(ev.startDate);
                      const hj = getHijriDateInfo(ev.startDate, hijriOffset);
                      const linkedMtg = ev.linkedMeetingId
                        ? meetingsById.get(ev.linkedMeetingId)
                        : undefined;
                      const canModifyEv = isAdmin || (ev.category === 'Meeting' && isLeader);

                      return (
                        <tr key={ev.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                            {ev.startDate}
                            {ev.endDate !== ev.startDate && (
                              <span className="block text-[11px] font-normal text-slate-500">
                                → {ev.endDate} ({toBnDigits(enumerateDateRange(ev.startDate, ev.endDate).length)} দিন)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                            <div className="font-semibold text-amber-900">{bn.formattedFull}</div>
                            <div className="text-[11px] text-sky-900">{hj.formattedFull}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getCategoryBadgeStyle(
                                ev.category
                              )}`}
                            >
                              {getCategoryLabelBn(ev.category)}
                            </span>
                            {(ev.department || linkedMtg?.department) && (
                              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                {linkedMtg?.department || ev.department}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 max-w-sm">
                            <div className="font-bold text-slate-900">{ev.title}</div>
                            {ev.description && (
                              <div className="text-[11px] text-slate-600 mt-0.5">{ev.description}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-600">
                            {ev.timeLabel || ev.location ? (
                              <>
                                {ev.timeLabel && <div>{ev.timeLabel}</div>}
                                {ev.location && <div>{ev.location}</div>}
                              </>
                            ) : (
                              <span className="text-slate-400">পূর্ণদিবস</span>
                            )}
                          </td>
                          {canScheduleMeeting && (
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {ev.category === 'Meeting' && ev.linkedMeetingId && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMeetingMinutes(ev)}
                                    className="px-2.5 py-1 rounded border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900 font-semibold cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <FileText className="w-3 h-3" />
                                    {linkedMtg?.meetingStatus === 'Minutes_Added'
                                      ? 'মিনিটস দেখুন'
                                      : 'মিনিটস লিখুন'}
                                  </button>
                                )}
                                {canModifyEv && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(ev)}
                                      className="px-2.5 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <Edit3 className="w-3 h-3" /> সম্পাদনা
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteEv(ev)}
                                      className="p-1.5 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ADMIN LEAVE POLICY & PER-EMPLOYEE QUOTA CONTROL */}
      {activeTab === 'leave-policy' && isAdmin && (
        <div className="space-y-4">
          {lpSavedBanner && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{lpSavedBanner}</span>
            </div>
          )}

          {/* Institutional Global Leave Policy Box */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2.5">
              প্রাতিষ্ঠানিক ছুটির নীতিমালা ও সেটিংস
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Casual Leave (CL) */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">নৈমিত্তিক ছুটি (CL)</span>
                  <button
                    type="button"
                    onClick={() => setLpClEnabled((v) => !v)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      lpClEnabled ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {lpClEnabled ? 'চালু' : 'বন্ধ'}
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    বার্ষিক দিন
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    disabled={!lpClEnabled}
                    value={lpClDays}
                    onChange={(e) => setLpClDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-bold font-mono tabular-nums disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Sick Leave (SL) */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">সিক ছুটি (SL)</span>
                  <button
                    type="button"
                    onClick={() => setLpSlEnabled((v) => !v)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      lpSlEnabled ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {lpSlEnabled ? 'চালু' : 'বন্ধ'}
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    বার্ষিক দিন
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    disabled={!lpSlEnabled}
                    value={lpSlDays}
                    onChange={(e) => setLpSlDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-bold font-mono tabular-nums disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Earned Leave (EL) */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">অর্জিত ছুটি (EL)</span>
                  <button
                    type="button"
                    onClick={() => setLpElEnabled((v) => !v)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      lpElEnabled ? 'bg-emerald-800 text-white' : 'bg-rose-700 text-white'
                    }`}
                  >
                    {lpElEnabled ? 'চালু' : 'বন্ধ'}
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    বার্ষিক দিন
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    disabled={!lpElEnabled}
                    value={lpElDays}
                    onChange={(e) => setLpElDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-bold font-mono tabular-nums disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Secondary Controls: Weekly Holidays, Hijri Offset, Academic Year Title */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2 border-t border-slate-100 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">শিক্ষাবর্ষ</label>
                <input
                  type="text"
                  value={lpYearLabel}
                  onChange={(e) => setLpYearLabel(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">হিজরি সমন্বয়</label>
                <div className="flex gap-1.5">
                  {([-1, 0, 1] as const).map((off) => (
                    <button
                      key={off}
                      type="button"
                      onClick={() => setLpHijriOffset(off)}
                      className={`flex-1 py-1.5 rounded-lg font-bold border cursor-pointer ${
                        lpHijriOffset === off
                          ? 'bg-sky-800 text-white border-sky-800'
                          : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      {off === -1 ? '-১ দিন' : off === 0 ? '০' : '+১ দিন'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ডিউটি ছুটি</label>
                <button
                  type="button"
                  onClick={() => setLpDlEnabled((v) => !v)}
                  className={`w-full py-1.5 px-3 rounded-lg border font-bold cursor-pointer ${
                    lpDlEnabled
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-slate-100 border-slate-300 text-slate-600'
                  }`}
                >
                  {lpDlEnabled ? '✓ চালু' : 'বন্ধ'}
                </button>
              </div>
            </div>

            {/* Weekly Holidays */}
            <div className="pt-2 border-t border-slate-100 text-xs space-y-1.5">
              <label className="block font-bold text-slate-700">সাপ্তাহিক ছুটি</label>
              <div className="flex flex-wrap gap-1.5">
                {['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(
                  (day) => {
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
                        className={`px-2.5 py-1 rounded-lg font-semibold border cursor-pointer ${
                          active
                            ? 'bg-rose-700 text-white border-rose-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Action Save Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => handleSaveLeavePolicy('non_custom')}
                className="px-3.5 py-2 rounded-lg border border-emerald-800 text-emerald-900 bg-emerald-50 hover:bg-emerald-100 font-bold cursor-pointer"
              >
                সংরক্ষণ (কাস্টম কোটা অক্ষত)
              </button>
              <button
                type="button"
                onClick={() => handleSaveLeavePolicy('all')}
                className="px-4 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-bold cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                <span>সবার কোটায় প্রয়োগ</span>
              </button>
            </div>
          </div>

          {/* Per-Employee Leave Quota Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-800" />
                <span>কর্মীভেদে ছুটির কোটা</span>
              </h3>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="নাম বা আইডি খুঁজুন..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                  <tr>
                    <th className="py-2.5 px-4">শিক্ষক / স্টাফ</th>
                    <th className="py-2.5 px-4">CL (বাকি/মোট)</th>
                    <th className="py-2.5 px-4">SL (বাকি/মোট)</th>
                    <th className="py-2.5 px-4">EL (বাকি/মোট)</th>
                    <th className="py-2.5 px-4">ধরন</th>
                    <th className="py-2.5 px-4 text-right">সমন্বয়</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map((emp) => {
                    const bal = getEmployeeLeaveBalance(emp.id);
                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-900">{emp.nameBn || emp.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {emp.id} · {emp.department}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums">
                          <span className="font-bold text-slate-900">
                            {toBnDigits(Math.max(0, bal.casualLeaveTotal - bal.casualLeaveUsed))}
                          </span>
                          <span className="text-slate-400"> / {toBnDigits(bal.casualLeaveTotal)}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums">
                          <span className="font-bold text-slate-900">
                            {toBnDigits(Math.max(0, bal.sickLeaveTotal - bal.sickLeaveUsed))}
                          </span>
                          <span className="text-slate-400"> / {toBnDigits(bal.sickLeaveTotal)}</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums">
                          {bal.earnedLeaveTotal === 0 && !institutionalLeavePolicy.earnedLeaveEnabled && !bal.isCustomQuota ? (
                            <span className="text-rose-700 font-semibold">বন্ধ</span>
                          ) : (
                            <>
                              <span className="font-bold text-slate-900">
                                {toBnDigits(Math.max(0, bal.earnedLeaveTotal - bal.earnedLeaveUsed))}
                              </span>
                              <span className="text-slate-400"> / {toBnDigits(bal.earnedLeaveTotal)}</span>
                            </>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`text-[11px] font-semibold ${
                              bal.isCustomQuota ? 'text-amber-800' : 'text-emerald-800'
                            }`}
                          >
                            {bal.isCustomQuota ? 'কাস্টম' : 'সাধারণ'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openEmpQuotaModal(emp)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold cursor-pointer inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" /> এডিট
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT CALENDAR EVENT OR MEETING */}
      {showEventModal && canScheduleMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingEventId
                  ? evCategory === 'Meeting'
                    ? 'মিটিং সম্পাদনা'
                    : 'কার্যক্রম সম্পাদনা'
                  : 'নতুন তারিখ যোগ'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">ধরন *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { val: 'Holiday', label: 'ছুটি', adminOnly: true },
                      { val: 'Academic', label: 'একাডেমিক', adminOnly: true },
                      { val: 'Exam', label: 'পরীক্ষা', adminOnly: true },
                      { val: 'Event', label: 'ইভেন্ট', adminOnly: true },
                      { val: 'Special_Working_Day', label: 'বিশেষ কর্মদিবস', adminOnly: true },
                      { val: 'Meeting', label: 'মিটিং / সভা', adminOnly: false },
                    ] as const
                  )
                    .filter((cat) => isAdmin || !cat.adminOnly)
                    .map((cat) => (
                      <button
                        key={cat.val}
                        type="button"
                        onClick={() => {
                          setEvCategory(cat.val);
                          if (cat.val === 'Meeting' && !evLocation) {
                            setEvLocation('ইনস্টিটিউট কনফারেন্স রুম');
                          }
                        }}
                        className={`py-2 px-2 rounded-lg font-bold border cursor-pointer transition-colors ${
                          evCategory === cat.val
                            ? cat.val === 'Meeting'
                              ? 'bg-purple-900 text-white border-purple-900'
                              : 'bg-emerald-900 text-white border-emerald-900'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                </div>
              </div>

              {(evCategory === 'Meeting' || editingEventId) && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">শিরোনাম *</label>
                  <input
                    type="text"
                    required
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    placeholder="শিরোনাম লিখুন..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              )}

              {evCategory === 'Meeting' ? (
                <>
                  {/* Meeting Department Chips + Input */}
                  <div className="space-y-1.5">
                    <label className="block font-bold text-slate-700">বিভাগ *</label>
                    <div className="flex flex-wrap gap-1.5">
                      {departmentOptions.map((dept) => (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => setEvDepartment(dept)}
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                            evDepartment === dept
                              ? 'bg-purple-900 text-white border-purple-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {dept}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={evDepartment}
                      onChange={(e) => setEvDepartment(e.target.value)}
                      placeholder="অথবা কাস্টম বিভাগ..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                    />
                  </div>

                  {/* Date + Start/End Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">তারিখ *</label>
                      <input
                        type="date"
                        required
                        value={evStartDate}
                        onChange={(e) => {
                          setEvStartDate(e.target.value);
                          setEvEndDate(e.target.value);
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">শুরু *</label>
                      <input
                        type="time"
                        required
                        value={evStartTime}
                        onChange={(e) => setEvStartTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">শেষ</label>
                      <input
                        type="time"
                        value={evEndTime}
                        onChange={(e) => setEvEndTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                      />
                    </div>
                  </div>

                  {/* Venue, Chairperson, Secretary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">স্থান</label>
                      <input
                        type="text"
                        value={evLocation}
                        onChange={(e) => setEvLocation(e.target.value)}
                        placeholder="কনফারেন্স রুম"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">সভাপতি</label>
                      <input
                        type="text"
                        value={evChairperson}
                        onChange={(e) => setEvChairperson(e.target.value)}
                        placeholder="সভাপতি"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">সঞ্চালক</label>
                      <input
                        type="text"
                        value={evSecretary}
                        onChange={(e) => setEvSecretary(e.target.value)}
                        placeholder="সঞ্চালক"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* Agenda */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      আলোচ্যসূচি (প্রতি লাইনে একটি)
                    </label>
                    <textarea
                      rows={2}
                      value={evAgendaText}
                      onChange={(e) => setEvAgendaText(e.target.value)}
                      placeholder="আলোচ্য বিষয়..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                    />
                  </div>

                  {/* Participants Selector */}
                  <div className="space-y-2 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-800" />
                        <span>আমন্ত্রিত সদস্য ({toBnDigits(evInvitedIds.length)})</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={selectDepartmentEmployees}
                          className="px-2 py-1 rounded bg-white border border-purple-200 text-purple-900 font-semibold hover:bg-purple-50 cursor-pointer"
                        >
                          {evDepartment === 'সকল বিভাগ' ? 'সকল স্টাফ' : `${evDepartment}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEvInvitedIds(employees.map((e) => e.id))}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
                        >
                          সবাই
                        </button>
                        {evInvitedIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEvInvitedIds([])}
                            className="px-2 py-1 rounded bg-white border border-rose-200 text-rose-700 font-semibold hover:bg-rose-50 cursor-pointer"
                          >
                            মুছুন
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={evParticipantSearch}
                        onChange={(e) => setEvParticipantSearch(e.target.value)}
                        placeholder="নাম খুঁজুন..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>

                    <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                      {filteredModalEmployees.map((emp) => {
                        const checked = evInvitedIds.includes(emp.id);
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => toggleInvitedEmployee(emp.id)}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                              checked
                                ? 'bg-purple-900 text-white border-purple-900'
                                : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-[11px] truncate">
                                {emp.nameBn || emp.name}
                              </div>
                              <div
                                className={`text-[10px] truncate ${
                                  checked ? 'text-purple-200' : 'text-slate-500'
                                }`}
                              >
                                {emp.department}
                              </div>
                            </div>
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                checked
                                  ? 'bg-amber-400 border-amber-400 text-slate-900'
                                  : 'border-slate-300 bg-slate-50'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {editingEventId ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            শুরুর তারিখ (থেকে) *
                          </label>
                          <input
                            type="date"
                            required
                            value={evStartDate}
                            onChange={(e) => {
                              setEvStartDate(e.target.value);
                              if (evEndDate < e.target.value) setEvEndDate(e.target.value);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            শেষ তারিখ (পর্যন্ত) *
                          </label>
                          <input
                            type="date"
                            value={evEndDate}
                            min={evStartDate}
                            onChange={(e) => setEvEndDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                          />
                        </div>
                      </div>
                      {evStartDate && (
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold text-emerald-950">
                            মোট দিন:{' '}
                            <span className="px-1.5 py-0.5 rounded bg-emerald-800 text-white font-mono">
                              {toBnDigits(
                                enumerateDateRange(
                                  evStartDate,
                                  evEndDate >= evStartDate ? evEndDate : evStartDate
                                ).length
                              )}{' '}
                              দিন
                            </span>
                          </span>
                          <span className="text-slate-600">
                            {evStartDate === evEndDate
                              ? `${getBengaliDateInfo(evStartDate).formattedFull} · ${
                                  getHijriDateInfo(evStartDate, hijriOffset).formattedShort
                                }`
                              : `${getBengaliDateInfo(evStartDate).formattedShort} → ${
                                  getBengaliDateInfo(evEndDate).formattedShort
                                }`}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-800">
                          তারিখ রেঞ্জ ও শিরোনাম তালিকা ({toBnDigits(evBatchRows.length)} টি সারি)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const lastRow = evBatchRows[evBatchRows.length - 1];
                            const nextStart = lastRow?.endDate || selectedDate || todayStr;
                            setEvBatchRows((prev) => [
                              ...prev,
                              { title: '', startDate: nextStart, endDate: nextStart },
                            ]);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold cursor-pointer inline-flex items-center gap-1"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-emerald-700" />
                          <span>+ আরও ছুটি / তারিখ যোগ</span>
                        </button>
                      </div>

                      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-0.5">
                        {evBatchRows.map((row, idx) => {
                          const normalizedRowEnd =
                            row.endDate && row.endDate >= row.startDate
                              ? row.endDate
                              : row.startDate;
                          const dayCount = row.startDate
                            ? enumerateDateRange(row.startDate, normalizedRowEnd).length
                            : 1;

                          return (
                            <div
                              key={idx}
                              className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <input
                                  type="text"
                                  required
                                  value={row.title}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEvBatchRows((prev) => {
                                      const copy = [...prev];
                                      copy[idx] = { ...copy[idx], title: val };
                                      return copy;
                                    });
                                  }}
                                  placeholder={`${toBnDigits(idx + 1)}. শিরোনাম লিখুন (যেমন: ঈদুল ফিতরের ছুটি)...`}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                                />
                                {evBatchRows.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEvBatchRows((prev) => prev.filter((_, i) => i !== idx))
                                    }
                                    title="সারি মুছুন"
                                    className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                                    শুরুর তারিখ (থেকে) *
                                  </label>
                                  <input
                                    type="date"
                                    required
                                    value={row.startDate}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEvBatchRows((prev) => {
                                        const copy = [...prev];
                                        const curEnd = copy[idx].endDate;
                                        copy[idx] = {
                                          ...copy[idx],
                                          startDate: val,
                                          endDate: curEnd < val ? val : curEnd,
                                        };
                                        return copy;
                                      });
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                                    শেষ তারিখ (পর্যন্ত) *
                                  </label>
                                  <input
                                    type="date"
                                    required
                                    min={row.startDate}
                                    value={row.endDate}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEvBatchRows((prev) => {
                                        const copy = [...prev];
                                        copy[idx] = { ...copy[idx], endDate: val };
                                        return copy;
                                      });
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                                  />
                                </div>
                              </div>

                              {row.startDate && (
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
                                  <span className="inline-flex items-center gap-1.5 font-bold text-emerald-900">
                                    <span className="px-2 py-0.5 rounded bg-emerald-800 text-white font-mono tabular-nums">
                                      {toBnDigits(dayCount)} দিন
                                    </span>
                                    {row.startDate !== normalizedRowEnd && (
                                      <span className="font-mono text-slate-600">
                                        ({row.startDate} → {normalizedRowEnd})
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-slate-500">
                                    {row.startDate === normalizedRowEnd
                                      ? `${getBengaliDateInfo(row.startDate).formattedShort} · ${
                                          getHijriDateInfo(row.startDate, hijriOffset).formattedShort
                                        }`
                                      : `${getBengaliDateInfo(row.startDate).formattedShort} → ${
                                          getBengaliDateInfo(normalizedRowEnd).formattedShort
                                        }`}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">সময় (ঐচ্ছিক)</label>
                      <input
                        type="text"
                        value={evTimeLabel}
                        onChange={(e) => setEvTimeLabel(e.target.value)}
                        placeholder="সকাল ১০:০০ - ১২:০০"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">স্থান (ঐচ্ছিক)</label>
                      <input
                        type="text"
                        value={evLocation}
                        onChange={(e) => setEvLocation(e.target.value)}
                        placeholder="অডিটোরিয়াম"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">বিবরণ (ঐচ্ছিক)</label>
                    <textarea
                      rows={2}
                      value={evDescription}
                      onChange={(e) => setEvDescription(e.target.value)}
                      placeholder="সংক্ষিপ্ত বিবরণ..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-lg text-white font-semibold cursor-pointer ${
                    evCategory === 'Meeting'
                      ? 'bg-purple-900 hover:bg-purple-800'
                      : 'bg-emerald-900 hover:bg-emerald-800'
                  }`}
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE EVENT MODAL */}
      {confirmDeleteEv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">ক্যালেন্ডার থেকে মুছে ফেলবেন?</h3>
                <p className="text-xs text-slate-600">
                  <strong>&ldquo;{confirmDeleteEv.title}&rdquo;</strong> ({confirmDeleteEv.startDate}) মুছে ফেলা হবে।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setConfirmDeleteEv(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteCalendarEvent(confirmDeleteEv.id);
                  setConfirmDeleteEv(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer"
              >
                মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PER-EMPLOYEE LEAVE QUOTA EDITOR */}
      {editingQuotaEmp && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-base font-bold text-slate-900">ছুটির কোটা সমন্বয়</h3>
                <p className="text-xs text-slate-500">
                  {editingQuotaEmp.nameBn || editingQuotaEmp.name} ({editingQuotaEmp.id})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingQuotaEmp(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmpQuota} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">নৈমিত্তিক ছুটি (CL)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={quotaCl}
                  onChange={(e) => setQuotaCl(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">সিক ছুটি (SL)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={quotaSl}
                  onChange={(e) => setQuotaSl(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">অর্জিত ছুটি (EL)</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={quotaEl}
                  onChange={(e) => setQuotaEl(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono font-bold"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    updateEmployeeLeaveQuota(editingQuotaEmp.id, { isCustomQuota: false });
                    setEditingQuotaEmp(null);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> রিসেট
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingQuotaEmp(null)}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                  >
                    সংরক্ষণ
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
