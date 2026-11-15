'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useApp, getDhakaDateTime } from '@/lib/store';
import {
  isAdministrativeRole,
  isDepartmentLeader,
  Meeting,
  MeetingDecision,
} from '@/lib/types';
import {
  getBengaliDateInfo,
  getHijriDateInfo,
  toBnDigits,
} from '@/lib/calendar-utils';
import {
  PlusCircle,
  CheckCircle2,
  X,
  Clock,
  MapPin,
  Users,
  Building2,
  FileText,
  CalendarDays,
  Printer,
  Edit3,
  Trash2,
  Search,
  AlertTriangle,
  Check,
  AlertCircle,
} from 'lucide-react';

interface DecisionDraft {
  id?: string;
  decisionText: string;
  assignedEmployeeId: string;
  assignedPersonName: string;
  deadline: string;
  alreadyInTracker?: boolean;
}

export function MeetingManagement() {
  const {
    meetings,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    createActionTrackerItem,
    employees,
    currentUser,
    focusedMeetingId,
    setFocusedMeetingId,
    setFocusedCalendarDate,
    setActiveNav,
    institutionalLeavePolicy,
  } = useApp();

  const { dateStr: todayStr } = getDhakaDateTime();
  const isAdmin = isAdministrativeRole(currentUser.role);
  const isLeader = isDepartmentLeader(currentUser.role);
  const canManageMeetings = isAdmin || isLeader;

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Scheduled' | 'Minutes_Added'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightedMeetingId, setHighlightedMeetingId] = useState<string | null>(null);

  // Create / Write-Minutes / Edit Modal
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  // Print Resolution Modal & Delete Confirm Modal
  const [printMeeting, setPrintMeeting] = useState<Meeting | null>(null);
  const [confirmDeleteMtg, setConfirmDeleteMtg] = useState<Meeting | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('সকল বিভাগ');
  const [meetingType, setMeetingType] = useState('বিভাগীয় / প্রাতিষ্ঠানিক সভা');
  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [venue, setVenue] = useState('ইনস্টিটিউট কনফারেন্স রুম');
  const [chairperson, setChairperson] = useState(currentUser.nameBn || currentUser.name);
  const [secretary, setSecretary] = useState('');
  const [agendaText, setAgendaText] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [actualAttendeeIds, setActualAttendeeIds] = useState<string[]>([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [decisionsList, setDecisionsList] = useState<DecisionDraft[]>([
    {
      decisionText: '',
      assignedEmployeeId: '',
      assignedPersonName: '',
      deadline: todayStr,
      alreadyInTracker: false,
    },
  ]);

  const departmentOptions = useMemo(() => {
    const unique = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));
    return ['সকল বিভাগ', ...unique];
  }, [employees]);

  const visibleMeetings = useMemo(() => {
    const base = canManageMeetings
      ? meetings
      : meetings.filter((m) => {
          const isInvited = m.invitedEmployeeIds?.includes(currentUser.id);
          const isAttended = m.actualAttendeeIds?.includes(currentUser.id);
          const isNamed = m.participants.some(
            (p) =>
              p.toLowerCase().includes(currentUser.name.toLowerCase()) ||
              (currentUser.nameBn && p.includes(currentUser.nameBn))
          );
          return Boolean(isInvited || isAttended || isNamed);
        });

    return [...base].sort((a, b) => b.date.localeCompare(a.date));
  }, [meetings, canManageMeetings, currentUser]);

  const scheduledPendingMeetings = useMemo(
    () => visibleMeetings.filter((m) => m.meetingStatus === 'Scheduled'),
    [visibleMeetings]
  );

  const overduePendingMeetings = useMemo(
    () => scheduledPendingMeetings.filter((m) => m.date <= todayStr),
    [scheduledPendingMeetings, todayStr]
  );

  const completedMinutesCount = useMemo(
    () => visibleMeetings.filter((m) => m.meetingStatus !== 'Scheduled').length,
    [visibleMeetings]
  );

  const filteredMeetings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleMeetings.filter((m) => {
      const effectiveStatus = m.meetingStatus || 'Minutes_Added';
      if (statusFilter !== 'ALL' && effectiveStatus !== statusFilter) return false;
      if (q) {
        return (
          m.title.toLowerCase().includes(q) ||
          (m.department && m.department.toLowerCase().includes(q)) ||
          m.chairperson.toLowerCase().includes(q) ||
          m.venue.toLowerCase().includes(q) ||
          m.agenda.some((a) => a.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [visibleMeetings, statusFilter, searchQuery]);

  const filteredModalEmployees = useMemo(() => {
    const q = attendeeSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      if (!q) return true;
      return (
        emp.id.toLowerCase().includes(q) ||
        emp.name.toLowerCase().includes(q) ||
        (emp.nameBn && emp.nameBn.toLowerCase().includes(q)) ||
        emp.department.toLowerCase().includes(q)
      );
    });
  }, [employees, attendeeSearch]);

  const populateModalForMeeting = (m: Meeting) => {
    setEditingMeeting(m);
    setTitle(m.title);
    setDepartment(m.department || 'সকল বিভাগ');
    setMeetingType(m.meetingType || 'বিভাগীয় / প্রাতিষ্ঠানিক সভা');
    setDate(m.date);
    setStartTime(m.startTime || '10:00');
    setEndTime(m.endTime || '11:30');
    setVenue(m.venue || 'ইনস্টিটিউট কনফারেন্স রুম');
    setChairperson(m.chairperson || '');
    setSecretary(m.secretary || '');
    setAgendaText(m.agenda.join('\n'));
    setMeetingNotes(m.meetingNotes || '');
    const inv = m.invitedEmployeeIds || [];
    setInvitedIds(inv);
    // When opening Scheduled meeting for the first time to add minutes, default actual attendees to invited list
    setActualAttendeeIds(
      m.actualAttendeeIds && m.actualAttendeeIds.length > 0 ? m.actualAttendeeIds : inv
    );
    setAttendeeSearch('');

    if (m.finalDecisions.length > 0) {
      setDecisionsList(
        m.finalDecisions.map((d) => ({
          id: d.id,
          decisionText: d.decisionText,
          assignedEmployeeId: d.assignedEmployeeId,
          assignedPersonName: d.assignedEmployeeName,
          deadline: d.deadline || m.date,
          alreadyInTracker: true,
        }))
      );
    } else {
      setDecisionsList([
        {
          decisionText: '',
          assignedEmployeeId: '',
          assignedPersonName: '',
          deadline: todayStr,
          alreadyInTracker: false,
        },
      ]);
    }
    setShowFormModal(true);
  };

  const openCreateModal = () => {
    setEditingMeeting(null);
    setTitle('');
    setDepartment(isAdmin ? 'সকল বিভাগ' : currentUser.department || 'সকল বিভাগ');
    setMeetingType('বিভাগীয় / প্রাতিষ্ঠানিক সভা');
    setDate(todayStr);
    setStartTime('10:00');
    setEndTime('11:30');
    setVenue('ইনস্টিটিউট কনফারেন্স রুম');
    setChairperson(currentUser.nameBn || currentUser.name);
    setSecretary('');
    setAgendaText('');
    setMeetingNotes('');
    setInvitedIds([]);
    setActualAttendeeIds([]);
    setAttendeeSearch('');
    setDecisionsList([
      {
        decisionText: '',
        assignedEmployeeId: '',
        assignedPersonName: '',
        deadline: todayStr,
        alreadyInTracker: false,
      },
    ]);
    setShowFormModal(true);
  };

  // Deep-link handling when navigating from Calendar ("মিনিটস লিখুন / দেখুন")
  useEffect(() => {
    if (!focusedMeetingId) return;
    const targetId = focusedMeetingId;
    const timer = setTimeout(() => {
      const targetMtg = meetings.find((m) => m.id === targetId);
      if (targetMtg) {
        setStatusFilter('ALL');
        setHighlightedMeetingId(targetMtg.id);
        if (targetMtg.meetingStatus === 'Scheduled' && canManageMeetings) {
          populateModalForMeeting(targetMtg);
        }
      }
      setFocusedMeetingId(null);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedMeetingId, meetings, canManageMeetings]);

  const handleAddDecisionRow = () => {
    setDecisionsList((prev) => [
      ...prev,
      {
        decisionText: '',
        assignedEmployeeId: '',
        assignedPersonName: '',
        deadline: todayStr,
        alreadyInTracker: false,
      },
    ]);
  };

  const handleRemoveDecisionRow = (idx: number) => {
    setDecisionsList((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleAttendee = (empId: string) => {
    setActualAttendeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleSaveMeetingForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const agendaArray = agendaText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const formattedDecisions: MeetingDecision[] = decisionsList
      .filter((d) => d.decisionText.trim().length > 0)
      .map((d, idx) => {
        const empById = d.assignedEmployeeId
          ? employees.find((emp) => emp.id === d.assignedEmployeeId)
          : undefined;
        const matchedEmp =
          empById ||
          employees.find(
            (emp) =>
              d.assignedPersonName.trim().length > 0 &&
              (emp.name.toLowerCase().includes(d.assignedPersonName.trim().toLowerCase()) ||
                (emp.nameBn && emp.nameBn.includes(d.assignedPersonName.trim())))
          );
        const resolvedName =
          matchedEmp?.nameBn ||
          matchedEmp?.name ||
          d.assignedPersonName.trim() ||
          'সংশ্লিষ্ট দায়িত্বশীল';

        if (!d.alreadyInTracker) {
          createActionTrackerItem({
            title: d.decisionText.trim(),
            description: `${title.trim()} (${date}) সভায় গৃহীত সিদ্ধান্ত।`,
            assignedPersonText: resolvedName,
            assignedEmployeeIds: matchedEmp ? [matchedEmp.id] : [],
            priority: 'মাঝারি',
            startDate: date,
            deadline: d.deadline || date,
            status: 'শুরু হয়নি',
            progressPercentage: 0,
            meetingTitle: title.trim(),
          });
        }

        return {
          id: d.id || `DEC-${Date.now().toString().slice(-4)}-${idx + 1}`,
          decisionText: d.decisionText.trim(),
          assignedEmployeeId: matchedEmp?.id || currentUser.id,
          assignedEmployeeName: resolvedName,
          deadline: d.deadline || date,
          supervisorId: currentUser.id,
          supervisorName: currentUser.nameBn || currentUser.name,
        };
      });

    const resolvedAttendeeIds = actualAttendeeIds.length > 0 ? actualAttendeeIds : invitedIds;
    const resolvedInvitedIds = invitedIds.length > 0 ? invitedIds : resolvedAttendeeIds;
    const participantNames = Array.from(
      new Set([...resolvedInvitedIds, ...resolvedAttendeeIds])
    ).map((id) => {
      const emp = employees.find((e) => e.id === id);
      return emp ? emp.nameBn || emp.name : id;
    });

    const hasMinutesContent =
      Boolean(meetingNotes.trim()) ||
      formattedDecisions.length > 0 ||
      actualAttendeeIds.length > 0;

    if (editingMeeting) {
      updateMeeting(editingMeeting.id, {
        title: title.trim(),
        meetingType: meetingType.trim() || 'বিভাগীয় / প্রাতিষ্ঠানিক সভা',
        date,
        startTime,
        endTime,
        venue: venue.trim() || 'ইনস্টিটিউট কনফারেন্স রুম',
        chairperson: chairperson.trim(),
        secretary: secretary.trim(),
        department: department.trim() || 'সকল বিভাগ',
        participants: participantNames,
        invitedEmployeeIds: resolvedInvitedIds,
        actualAttendeeIds: resolvedAttendeeIds,
        agenda: agendaArray,
        meetingNotes: meetingNotes.trim(),
        finalDecisions: formattedDecisions,
        approvalStatus: hasMinutesContent ? 'Published_Official' : editingMeeting.approvalStatus,
        meetingStatus: hasMinutesContent ? 'Minutes_Added' : editingMeeting.meetingStatus,
      });
    } else {
      createMeeting({
        title: title.trim(),
        meetingType: meetingType.trim() || 'বিভাগীয় / প্রাতিষ্ঠানিক সভা',
        date,
        startTime,
        endTime,
        venue: venue.trim() || 'ইনস্টিটিউট কনফারেন্স রুম',
        chairperson: chairperson.trim(),
        secretary: secretary.trim(),
        department: department.trim() || 'সকল বিভাগ',
        participants: participantNames,
        invitedEmployeeIds: resolvedInvitedIds,
        actualAttendeeIds: resolvedAttendeeIds,
        agenda: agendaArray,
        meetingNotes: meetingNotes.trim(),
        finalDecisions: formattedDecisions,
        approvalStatus: hasMinutesContent ? 'Published_Official' : 'Draft',
        meetingStatus: hasMinutesContent ? 'Minutes_Added' : 'Scheduled',
      });
    }

    setShowFormModal(false);
    setEditingMeeting(null);
  };

  const getEmployeeName = (empId: string): string => {
    const emp = employees.find((e) => e.id === empId);
    return emp ? emp.nameBn || emp.name : empId;
  };

  return (
    <div className="space-y-5 font-serif">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 text-xs text-purple-900 font-semibold">
            <FileText className="w-4 h-4" />
            <span>বাৎসরিক ক্যালেন্ডার ও সিদ্ধান্ত ট্র্যাকারের সাথে সমন্বিত</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            মিটিং মিনিটস ও সভার কার্যবিবরণী
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ক্যালেন্ডারে নির্ধারিত সভাসমূহের উপস্থিতি, আলোচ্যসূচি, কার্যবিবরণী এবং গৃহীত সিদ্ধান্ত সংরক্ষণ।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveNav('calendar')}
            className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <CalendarDays className="w-4 h-4 text-emerald-800" />
            <span>ক্যালেন্ডারে ফিরে যান</span>
          </button>

          {canManageMeetings && (
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4 text-amber-300" />
              <span>নতুন মিটিং মিনিটস যোগ করুন</span>
            </button>
          )}
        </div>
      </div>

      {/* Pending / Overdue Minutes Alert Strip */}
      {canManageMeetings && scheduledPendingMeetings.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <div className="font-bold text-amber-950">
                মিনিটস সম্পন্ন বাকি রয়েছে: {toBnDigits(scheduledPendingMeetings.length)} টি নির্ধারিত সভা
                {overduePendingMeetings.length > 0 && (
                  <span className="text-rose-700">
                    {' '}
                    ({toBnDigits(overduePendingMeetings.length)} টি সভার তারিখ অতিক্রান্ত বা আজ)
                  </span>
                )}
              </div>
              <div className="text-amber-800">
                সভা সম্পন্ন হওয়ার পর নিচে &ldquo;মিনিটস লিখুন&rdquo; বাটনে ক্লিক করে উপস্থিতি ও গৃহীত সিদ্ধান্ত যোগ করুন।
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter('Scheduled')}
            className="px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold cursor-pointer shrink-0 self-start md:self-auto"
          >
            বাকিগুলো দেখুন ({toBnDigits(scheduledPendingMeetings.length)})
          </button>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-emerald-900 text-white border-emerald-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            সব মিটিং ({toBnDigits(visibleMeetings.length)})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Scheduled')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${
              statusFilter === 'Scheduled'
                ? 'bg-purple-900 text-white border-purple-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            নির্ধারিত / মিনিটস বাকি ({toBnDigits(scheduledPendingMeetings.length)})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('Minutes_Added')}
            className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer ${
              statusFilter === 'Minutes_Added'
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            মিনিটস সম্পন্ন ({toBnDigits(completedMinutesCount)})
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="মিটিং, ডিপার্টমেন্ট বা এজেন্ডা খুঁজুন..."
            className="w-full sm:w-64 pl-8 pr-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-xs"
          />
        </div>
      </div>

      {/* Meetings List */}
      <div className="space-y-4">
        {filteredMeetings.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center space-y-2 text-xs text-slate-500">
            <p>কোনো নির্ধারিত মিটিং বা মিনিটস পাওয়া যায়নি।</p>
            {canManageMeetings && (
              <button
                type="button"
                onClick={() => setActiveNav('calendar')}
                className="text-emerald-800 font-bold hover:underline cursor-pointer"
              >
                ক্যালেন্ডার থেকে নতুন মিটিং নির্ধারণ করুন →
              </button>
            )}
          </div>
        ) : (
          filteredMeetings.map((meeting) => {
            const isScheduled = meeting.meetingStatus === 'Scheduled';
            const isHighlighted = highlightedMeetingId === meeting.id;
            const invitedList = meeting.invitedEmployeeIds || [];
            const attendedList = meeting.actualAttendeeIds || [];

            return (
              <div
                key={meeting.id}
                className={`bg-white rounded-xl border p-4 sm:p-6 shadow-2xs space-y-4 transition-colors ${
                  isHighlighted
                    ? 'border-purple-600 ring-2 ring-purple-100'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                          isScheduled
                            ? 'bg-purple-50 text-purple-900 border-purple-200'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        }`}
                      >
                        {isScheduled ? 'নির্ধারিত · মিনিটস বাকি' : 'মিনিটস সম্পন্ন'}
                      </span>

                      {meeting.department && (
                        <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-700 inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          {meeting.department}
                        </span>
                      )}

                      {meeting.calendarEventId && (
                        <span className="text-[10px] font-semibold text-slate-500 inline-flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 text-emerald-700" />
                          ক্যালেন্ডারের সাথে যুক্ত
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-bold text-slate-900">{meeting.title}</h2>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        সভাপতি: <strong className="text-slate-900">{meeting.chairperson || 'নির্ধারিত নয়'}</strong>
                      </span>
                      {meeting.secretary && (
                        <span>
                          সঞ্চালক/সচিব: <strong className="text-slate-900">{meeting.secretary}</strong>
                        </span>
                      )}
                      {meeting.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {meeting.venue}
                        </span>
                      )}
                      {(meeting.startTime || meeting.endTime) && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {meeting.startTime}
                          {meeting.endTime ? ` - ${meeting.endTime}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    <span className="text-xs font-mono tabular-nums font-semibold text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 w-fit">
                      তারিখ: {meeting.date}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {canManageMeetings && (
                        <button
                          type="button"
                          onClick={() => populateModalForMeeting(meeting)}
                          className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer inline-flex items-center gap-1 border ${
                            isScheduled
                              ? 'bg-purple-900 hover:bg-purple-800 text-white border-purple-900'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                          }`}
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>
                            {isScheduled ? 'মিনিটস লিখুন / যোগ করুন' : 'মিনিটস সম্পাদনা'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setFocusedCalendarDate(meeting.date);
                          setActiveNav('calendar');
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer inline-flex items-center gap-1"
                      >
                        <CalendarDays className="w-3 h-3 text-emerald-700" />
                        <span>ক্যালেন্ডার</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPrintMeeting(meeting)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer inline-flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" />
                        <span>প্রিন্ট</span>
                      </button>

                      {canManageMeetings && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteMtg(meeting)}
                          title="মুছুন"
                          className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Participants & Attendance Summary */}
                {(invitedList.length > 0 ||
                  attendedList.length > 0 ||
                  meeting.participants.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-slate-700 inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-purple-800" />
                      {attendedList.length > 0
                        ? `উপস্থিত (${toBnDigits(attendedList.length)} জন):`
                        : `আমন্ত্রিত (${toBnDigits(invitedList.length || meeting.participants.length)} জন):`}
                    </span>

                    <div className="flex flex-wrap gap-1.5">
                      {(attendedList.length > 0
                        ? attendedList.map(getEmployeeName)
                        : invitedList.length > 0
                        ? invitedList.map(getEmployeeName)
                        : meeting.participants
                      ).map((name, idx) => (
                        <span
                          key={`${name}-${idx}`}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-medium"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {meeting.agenda.length > 0 && (
                  <div className="p-3.5 bg-slate-50 rounded-lg text-xs space-y-1 border border-slate-100">
                    <strong className="text-slate-800 block">আলোচ্যসূচি (Agenda):</strong>
                    <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                      {meeting.agenda.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {meeting.meetingNotes && (
                  <div className="text-xs text-slate-700">
                    <strong className="text-slate-900 block mb-0.5">আলোচনার সারসংক্ষেপ:</strong>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line">
                      {meeting.meetingNotes}
                    </p>
                  </div>
                )}

                {meeting.finalDecisions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <strong className="text-xs text-slate-800 block">
                      গৃহীত সিদ্ধান্তসমূহ ({toBnDigits(meeting.finalDecisions.length)} টি):
                    </strong>
                    <div className="space-y-2">
                      {meeting.finalDecisions.map((dec) => (
                        <div
                          key={dec.id}
                          className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900">{dec.decisionText}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              দায়িত্বপ্রাপ্ত: <strong>{dec.assignedEmployeeName}</strong> · ডেডলাইন:{' '}
                              <span className="font-mono tabular-nums">{dec.deadline}</span>
                            </div>
                          </div>
                          <span className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>ট্র্যাকারে যুক্ত</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* CREATE / WRITE-MINUTES / EDIT MEETING MODAL */}
      {showFormModal && canManageMeetings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingMeeting
                    ? editingMeeting.meetingStatus === 'Scheduled'
                      ? 'মিটিং মিনিটস ও সিদ্ধান্ত লিখুন'
                      : 'মিটিং মিনিটস সম্পাদনা করুন'
                    : 'নতুন মিটিং মিনিটস ও সিদ্ধান্ত সংরক্ষণ'}
                </h3>
                {editingMeeting && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    সভার উপস্থিতি যাচাই করুন, আলোচনার বিবরণ লিখুন এবং সিদ্ধান্তগুলো ট্র্যাকারে পাঠান।
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMeetingForm} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">সভার শিরোনাম *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="যেমন: মাসিক একাডেমিক ও প্রশাসনিক পর্যালোচনা সভা"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              {/* Department */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">ডিপার্টমেন্ট / বিভাগ</label>
                <div className="flex flex-wrap gap-1.5">
                  {departmentOptions.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setDepartment(dept)}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                        department === dept
                          ? 'bg-purple-900 text-white border-purple-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">তারিখ *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">শুরুর সময়</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">শেষ সময়</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">স্থান</label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">সভাপতি</label>
                  <input
                    type="text"
                    value={chairperson}
                    onChange={(e) => setChairperson(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">সঞ্চালক / সচিব</label>
                  <input
                    type="text"
                    value={secretary}
                    onChange={(e) => setSecretary(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                  />
                </div>
              </div>

              {/* Actual Attendance Check-in */}
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-800" />
                    <span>সভায় উপস্থিত ব্যক্তিবর্গ চিহ্নিত করুন</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[10px]">
                      {toBnDigits(actualAttendeeIds.length)} জন উপস্থিত
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {invitedIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActualAttendeeIds(invitedIds)}
                        className="px-2 py-1 rounded bg-white border border-purple-200 text-purple-900 font-semibold cursor-pointer"
                      >
                        সব আমন্ত্রিত ({toBnDigits(invitedIds.length)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActualAttendeeIds(employees.map((e) => e.id))}
                      className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                    >
                      সকল স্টাফ
                    </button>
                    {actualAttendeeIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActualAttendeeIds([])}
                        className="px-2 py-1 rounded bg-white border border-rose-200 text-rose-700 font-semibold cursor-pointer"
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
                    value={attendeeSearch}
                    onChange={(e) => setAttendeeSearch(e.target.value)}
                    placeholder="শিক্ষক বা স্টাফের নাম দিয়ে খুঁজুন..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                  {filteredModalEmployees.map((emp) => {
                    const checked = actualAttendeeIds.includes(emp.id);
                    const wasInvited = invitedIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleAttendee(emp.id)}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          checked
                            ? 'bg-emerald-900 text-white border-emerald-900'
                            : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[11px] truncate">
                            {emp.nameBn || emp.name}
                            {wasInvited && !checked ? ' (আমন্ত্রিত)' : ''}
                          </div>
                          <div
                            className={`text-[10px] truncate ${
                              checked ? 'text-emerald-200' : 'text-slate-500'
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">আলোচ্যসূচি (প্রতি লাইনে একটি)</label>
                <textarea
                  rows={2}
                  value={agendaText}
                  onChange={(e) => setAgendaText(e.target.value)}
                  placeholder="সভার আলোচ্য বিষয়গুলো লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">আলোচনার সারসংক্ষেপ / মিটিং নোটস *</label>
                <textarea
                  rows={3}
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  placeholder="সভায় আলোচিত গুরুত্বপূর্ণ বিষয় ও মতামতের সারসংক্ষেপ লিখুন..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900"
                />
              </div>

              {/* Decisions */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">গৃহীত সিদ্ধান্ত ও দায়িত্ব অর্পণ (সিদ্ধান্ত ট্র্যাকারে যুক্ত হবে)</label>
                  <button
                    type="button"
                    onClick={handleAddDecisionRow}
                    className="text-emerald-800 hover:underline font-bold cursor-pointer"
                  >
                    + আরও সিদ্ধান্ত যোগ করুন
                  </button>
                </div>

                {decisionsList.map((d, index) => (
                  <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={d.decisionText}
                        onChange={(e) => {
                          const copy = [...decisionsList];
                          copy[index] = { ...copy[index], decisionText: e.target.value };
                          setDecisionsList(copy);
                        }}
                        placeholder="সিদ্ধান্তের বিবরণ লিখুন..."
                        className="flex-1 px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-900"
                      />
                      {decisionsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDecisionRow(index)}
                          className="p-1.5 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={d.assignedEmployeeId}
                        onChange={(e) => {
                          const emp = employees.find((item) => item.id === e.target.value);
                          const copy = [...decisionsList];
                          copy[index] = {
                            ...copy[index],
                            assignedEmployeeId: e.target.value,
                            assignedPersonName: emp ? emp.nameBn || emp.name : '',
                          };
                          setDecisionsList(copy);
                        }}
                        className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-900"
                      >
                        <option value="">দায়িত্বপ্রাপ্ত ব্যক্তি নির্বাচন করুন...</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.nameBn || emp.name} ({emp.department})
                          </option>
                        ))}
                      </select>

                      <input
                        type="date"
                        value={d.deadline}
                        onChange={(e) => {
                          const copy = [...decisionsList];
                          copy[index] = { ...copy[index], deadline: e.target.value };
                          setDecisionsList(copy);
                        }}
                        className="w-full px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-900"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                >
                  {editingMeeting ? 'মিটিং মিনিটস সংরক্ষণ করুন' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OFFICIAL RESOLUTION / PRINT PREVIEW MODAL */}
      {printMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-7 border border-slate-200 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-bold text-emerald-900">
                  আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট (ASDRI)
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  সভার কার্যবিবরণী ও রেজোলিউশন
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>প্রিন্ট করুন</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMeeting(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-800">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="text-base font-bold text-slate-900">{printMeeting.title}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-slate-600">
                  <div>
                    তারিখ: <strong className="font-mono text-slate-900">{printMeeting.date}</strong> (
                    {getBengaliDateInfo(printMeeting.date).formattedFull} ·{' '}
                    {getHijriDateInfo(
                      printMeeting.date,
                      institutionalLeavePolicy.hijriOffsetDays || 0
                    ).formattedShort}
                    )
                  </div>
                  <div>
                    সময়:{' '}
                    <strong className="font-mono text-slate-900">
                      {printMeeting.startTime} - {printMeeting.endTime}
                    </strong>
                  </div>
                  <div>
                    ডিপার্টমেন্ট: <strong className="text-slate-900">{printMeeting.department || 'প্রশাসন'}</strong>
                  </div>
                  <div>
                    স্থান: <strong className="text-slate-900">{printMeeting.venue}</strong>
                  </div>
                  <div>
                    সভাপতি: <strong className="text-slate-900">{printMeeting.chairperson}</strong>
                  </div>
                  {printMeeting.secretary && (
                    <div>
                      সঞ্চালক/সচিব: <strong className="text-slate-900">{printMeeting.secretary}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1.5">উপস্থিত সদস্যবৃন্দ:</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(printMeeting.actualAttendeeIds && printMeeting.actualAttendeeIds.length > 0
                    ? printMeeting.actualAttendeeIds.map(getEmployeeName)
                    : printMeeting.invitedEmployeeIds && printMeeting.invitedEmployeeIds.length > 0
                    ? printMeeting.invitedEmployeeIds.map(getEmployeeName)
                    : printMeeting.participants
                  ).map((name, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded border border-slate-200 bg-slate-50 font-medium"
                    >
                      {toBnDigits(i + 1)}. {name}
                    </span>
                  ))}
                </div>
              </div>

              {printMeeting.agenda.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">আলোচ্যসূচি (Agenda):</h4>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700">
                    {printMeeting.agenda.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ol>
                </div>
              )}

              {printMeeting.meetingNotes && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">আলোচনার বিবরণ ও সারসংক্ষেপ:</h4>
                  <p className="p-3 rounded-lg border border-slate-200 bg-white leading-relaxed whitespace-pre-line">
                    {printMeeting.meetingNotes}
                  </p>
                </div>
              )}

              {printMeeting.finalDecisions.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">গৃহীত সিদ্ধান্তসমূহ:</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[460px] text-left border border-slate-200 rounded-lg overflow-hidden">
                      <thead className="bg-slate-100 text-slate-800 font-bold">
                        <tr>
                          <th className="p-2.5 border-b border-slate-200">ক্রম</th>
                          <th className="p-2.5 border-b border-slate-200">সিদ্ধান্ত</th>
                          <th className="p-2.5 border-b border-slate-200">দায়িত্বপ্রাপ্ত</th>
                          <th className="p-2.5 border-b border-slate-200">ডেডলাইন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {printMeeting.finalDecisions.map((dec, idx) => (
                          <tr key={dec.id}>
                            <td className="p-2.5 font-mono">{toBnDigits(idx + 1)}</td>
                            <td className="p-2.5 font-semibold text-slate-900">{dec.decisionText}</td>
                            <td className="p-2.5">{dec.assignedEmployeeName}</td>
                            <td className="p-2.5 font-mono">{dec.deadline}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MEETING MODAL */}
      {confirmDeleteMtg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">মিটিং ও মিনিটস মুছে ফেলবেন?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  আপনি কি নিশ্চিত যে <strong>&ldquo;{confirmDeleteMtg.title}&rdquo;</strong> ({confirmDeleteMtg.date}) মুছে ফেলতে চান? ক্যালেন্ডারের সাথে যুক্ত থাকলে সেখান থেকেও মিটিংটি মুছে যাবে।
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setConfirmDeleteMtg(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteMeeting(confirmDeleteMtg.id);
                  setConfirmDeleteMtg(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer"
              >
                হ্যাঁ, মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
