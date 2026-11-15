import {
  Employee,
  RawPunchEvent,
  DailyAttendanceRecord,
  LeaveBalance,
  LeaveApplication,
  Meeting,
  TaskItem,
  ManagementToDoItem,
  OfficeDocument,
  NoticeItem,
  AuditLog,
  AttendancePolicyConfig,
  AttendanceCorrectionRequest,
  ActionTrackerItem,
  InAppNotification,
  InstitutionalLeavePolicy,
  CalendarEvent,
} from './types';

export const DEFAULT_INSTITUTION_LOGO =
  '/assets/aistudio/AS-SUNNAH-DAWAH-Logo-Final-_Recovered_.png-single_d2c35833.png';

export const INITIAL_POLICY: AttendancePolicyConfig = {
  officeStartTime: '09:00',
  officeEndTime: '17:00',
  gracePeriodMinutes: 15, // till 09:15 is normal
  lateThresholdMinutes: 15, // after 09:15 is late
  earlyLeaveThresholdMinutes: 30, // before 16:30 is early leave
  breakDurationMinutes: 60,
  weeklyHolidays: ['Friday'],
  autoSyncIntervalMinutes: 15,
  campusLat: 23.7985,
  campusLng: 90.4255,
  geofenceRadiusMeters: 300,
  qrRotationSeconds: 30,
  requireGpsVerification: false, // Default to office desk rolling dynamic QR mode (no GPS hardware blockage on PCs)
  specialDays: [],
  institutionLogoUrl: DEFAULT_INSTITUTION_LOGO,
};

export const INITIAL_INSTITUTIONAL_LEAVE_POLICY: InstitutionalLeavePolicy = {
  year: 2026,
  academicYearLabel: '২০২৬ শিক্ষাবর্ষ',
  casualLeaveEnabled: true,
  casualLeaveDefault: 10,
  sickLeaveEnabled: true,
  sickLeaveDefault: 14,
  earnedLeaveEnabled: true,
  earnedLeaveDefault: 18,
  dutyLeaveEnabled: true,
  hijriOffsetDays: 0,
};

export const INITIAL_CALENDAR_EVENTS: CalendarEvent[] = [];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_RAW_PUNCHES: RawPunchEvent[] = [];

export const INITIAL_DAILY_ATTENDANCE: DailyAttendanceRecord[] = [];

export const INITIAL_LEAVE_BALANCES: Record<string, LeaveBalance> = {};

export const INITIAL_LEAVE_APPLICATIONS: LeaveApplication[] = [];

export const INITIAL_MEETINGS: Meeting[] = [];

export const INITIAL_TASKS: TaskItem[] = [];

export const INITIAL_MANAGEMENT_TODO: ManagementToDoItem[] = [];

export const INITIAL_DOCUMENTS: OfficeDocument[] = [];

export const INITIAL_NOTICES: NoticeItem[] = [];

export const INITIAL_CORRECTIONS: AttendanceCorrectionRequest[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const INITIAL_NOTIFICATIONS: InAppNotification[] = [];

export const INITIAL_ACTION_TRACKER_ITEMS: ActionTrackerItem[] = [];
