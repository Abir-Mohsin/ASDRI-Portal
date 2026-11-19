// ASDRI Portal Types

export type Role =
  | 'super_admin'
  | 'director'
  | 'deputy_director'
  | 'assistant_director'
  | 'admin_incharge'
  | 'coordinator'
  | 'dept_head'
  | 'teacher'
  | 'staff';

export function getRoleLabel(role: Role, isBn: boolean = true): string {
  switch (role) {
    case 'super_admin':
      return isBn ? 'সুপার এডমিন' : 'Super Admin';
    case 'director':
    case 'deputy_director':
    case 'assistant_director':
    case 'admin_incharge':
      return isBn ? 'এডমিন' : 'Admin';
    case 'coordinator':
    case 'dept_head':
      return isBn ? 'কো-অর্ডিনেটর' : 'Coordinator';
    case 'teacher':
      return isBn ? 'শিক্ষক' : 'Teacher';
    case 'staff':
      return isBn ? 'স্টাফ' : 'Staff';
    default:
      return role;
  }
}

export function isSuperAdminRole(role: Role): boolean {
  return role === 'super_admin';
}

export function isExecutiveRole(role: Role): boolean {
  return role === 'super_admin' || role === 'director' || role === 'deputy_director';
}

export function isAdministrativeRole(role: Role): boolean {
  return (
    role === 'super_admin' ||
    role === 'director' ||
    role === 'deputy_director' ||
    role === 'assistant_director' ||
    role === 'admin_incharge'
  );
}

export function isDepartmentLeader(role: Role): boolean {
  return role === 'coordinator' || role === 'dept_head';
}

export function isPersonalScopeOnly(role: Role): boolean {
  return role === 'teacher' || role === 'staff';
}

export type WorkspaceTier = 'personal' | 'department' | 'institutional';

export type Department = string;
export type EmploymentType = string;
export type EmployeeStatus = 'Active' | 'Inactive' | 'Resigned';

export interface Employee {
  id: string; // e.g. "ASDRI01"
  name: string;
  nameBn: string;
  email: string;
  phone: string;
  password?: string; // Login password set by Super Admin / Admin
  photoUrl: string;
  designation: string;
  designationBn: string;
  department: string;
  employmentType: string;
  joiningDate: string;
  reportingToId?: string;
  reportingToName?: string;
  status: EmployeeStatus;
  attendanceMachineId: string;
  shiftSchedule: string;
  leavePolicy: string;
  nidOrPassport?: string;
  bloodGroup?: string;
  role: Role;
}

export type PunchType = 'IN' | 'OUT' | 'UNKNOWN';
export type VerificationType =
  | 'Mobile_GPS_QR'
  | 'GPS+QR'
  | 'Fingerprint'
  | 'Face'
  | 'RFID Card'
  | 'Manual Punch'
  | 'Admin Correction';

export interface PunchSession {
  id: string;
  inTime: string; // HH:mm
  inTimestamp?: string;
  inFullTime?: string; // HH:mm:ss (Asia/Dhaka)
  outTime?: string; // HH:mm
  outTimestamp?: string;
  outFullTime?: string; // HH:mm:ss (Asia/Dhaka)
  inLocation?: {
    lat: number;
    lng: number;
    distanceMeters: number;
  };
  outLocation?: {
    lat: number;
    lng: number;
    distanceMeters: number;
  };
  inQrTokenId?: string;
  outQrTokenId?: string;
  inDeviceId?: string;
  outDeviceId?: string;
  deviceId?: string;
  durationMinutes?: number;
  verificationStatus: 'Verified' | 'Pending_Sync' | 'Admin_Corrected' | 'Manual_Approved';
}

export interface RawPunchEvent {
  id: string;
  machineId: string;
  employeeId: string;
  attendanceMachineId: string;
  timestamp: string;
  punchDate: string;
  punchTime: string;
  punchType: PunchType;
  verificationType: VerificationType;
  deviceId: string;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  qrTokenUsed?: string;
  location?: {
    lat: number;
    lng: number;
    distanceMeters: number;
  };
  qrTokenId?: string;
  syncStatus: 'synced' | 'pending' | 'duplicate_skipped';
}

export type AttendanceStatus = 'Present' | 'Late' | 'Absent' | 'Leave' | 'Half Day' | 'Missing Punch';

export interface DailyAttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  date: string; // YYYY-MM-DD (Asia/Dhaka)
  firstInTime?: string; // HH:mm
  lastOutTime?: string; // HH:mm
  isCurrentlyIn?: boolean;
  isCurrentlyPunchedIn?: boolean;
  sessions?: PunchSession[];
  totalWorkingDurationMinutes: number;
  breakDurationMinutes: number;
  lateDurationMinutes: number;
  earlyLeaveMinutes: number;
  status: AttendanceStatus;
  isMissingPunch: boolean;
  leaveType?: string;
  deviceId?: string;
  gpsDistanceMeters?: number;
  qrTokenId?: string;
  verificationStatus?: 'Verified' | 'Pending_Sync' | 'Admin_Corrected' | 'Manual_Approved' | 'Leave';
  remarks?: string;
}

export interface AttendanceCorrectionRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  date: string;
  requestedType: 'IN' | 'OUT' | 'BOTH';
  correctedInTime?: string;
  correctedOutTime?: string;
  beforeInTime?: string;
  beforeOutTime?: string;
  beforeStatus?: string;
  reason: string;
  evidenceAttachment?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approverId?: string;
  approverName?: string;
  approvalRemarks?: string;
  appliedAt: string;
  reviewedAt?: string;
}

export type LeaveType =
  | 'Casual Leave (CL)'
  | 'Sick Leave (SL)'
  | 'Earned Leave (EL)'
  | 'Duty Leave (DL)'
  | 'Maternity / Paternity Leave'
  | 'Special Leave';

export interface LeaveBalance {
  employeeId: string;
  year: number;
  casualLeaveTotal: number;
  casualLeaveUsed: number;
  sickLeaveTotal: number;
  sickLeaveUsed: number;
  earnedLeaveTotal: number;
  earnedLeaveUsed: number;
  dutyLeaveUsed: number;
  isCustomQuota?: boolean;
}

export interface InstitutionalLeavePolicy {
  year: number;
  academicYearLabel: string;
  casualLeaveEnabled: boolean;
  casualLeaveDefault: number;
  sickLeaveEnabled: boolean;
  sickLeaveDefault: number;
  earnedLeaveEnabled: boolean;
  earnedLeaveDefault: number;
  dutyLeaveEnabled: boolean;
  hijriOffsetDays: -1 | 0 | 1;
  updatedAt?: string;
  updatedBy?: string;
}

export type CalendarEventCategory =
  | 'Holiday'
  | 'Academic'
  | 'Exam'
  | 'Event'
  | 'Special_Working_Day'
  | 'Meeting';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  category: CalendarEventCategory;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  timeLabel?: string;
  location?: string;
  department?: string;
  linkedMeetingId?: string;
  createdBy?: string;
  createdAt: string;
}

export interface LeaveApplication {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  contactDuringLeave: string;
  attachmentName?: string;
  status: 'Pending_Dept_Head' | 'Pending_Director' | 'Approved' | 'Rejected' | 'Cancelled';
  deptHeadRecommendation?: 'Recommended' | 'Not Recommended';
  deptHeadRemarks?: string;
  deptHeadReviewerId?: string;
  directorRemarks?: string;
  directorReviewerId?: string;
  appliedDate: string;
  reviewedDate?: string;
}

export interface MeetingDecision {
  id: string;
  decisionText: string;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  deadline: string;
  supervisorId: string;
  supervisorName: string;
  convertedToTaskId?: string;
}

export type MeetingStatus = 'Scheduled' | 'Minutes_Added';

export interface Meeting {
  id: string;
  title: string;
  meetingType: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  chairperson: string;
  secretary: string;
  department?: string;
  participants: string[];
  invitedEmployeeIds?: string[];
  actualAttendeeIds?: string[];
  agenda: string[];
  meetingNotes: string;
  finalDecisions: MeetingDecision[];
  approvalStatus: 'Draft' | 'Published_Official' | 'Archived';
  meetingStatus?: MeetingStatus;
  calendarEventId?: string;
  createdAt: string;
}

export type TaskStatus =
  | 'Backlog'
  | 'To Do'
  | 'In Progress'
  | 'On Hold'
  | 'Submitted for Review'
  | 'Revision Required'
  | 'Approved'
  | 'Cancelled';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  category: string;
  department: string;
  assignedPersonId: string;
  assignedPersonName: string;
  supervisorId: string;
  supervisorName: string;
  startDate: string;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  progressPercentage: number;
  relatedMeetingId?: string;
  relatedDecisionId?: string;
  relatedProjectName?: string;
  submissionNotes?: string;
  submissionAttachment?: string;
  submissionFiles?: SubmittedFileAttachment[];
  revisionFeedback?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SubmittedFileAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  webUrl: string;
  downloadUrl?: string;
  driveFileId?: string;
  storageProvider?: 'google_drive' | 'onedrive';
  oneDriveItemId?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ManagementToDoItem {
  id: string;
  title: string;
  description: string;
  targetDepartment: string;
  leadPerson: string;
  priority: 'Urgent' | 'High' | 'Routine';
  deadline: string;
  status: 'In Progress' | 'Upcoming' | 'Completed' | 'Deferred';
  strategicGoal: string;
  publishedBy: string;
  publishedAt: string;
}

export interface OfficeDocument {
  id: string;
  memoNumber: string;
  title: string;
  category: string;
  department: string;
  publishedDate: string;
  signatory: string;
  signatoryDesignation: string;
  summary: string;
  content: string;
  attachmentName?: string;
  status: 'Active' | 'Archived';
}

export interface NoticeItem {
  id: string;
  title: string;
  description: string;
  category: string;
  targetAudience: string;
  department?: string;
  publishedDate: string;
  expiryDate?: string;
  publishedBy: string;
  isUrgent: boolean;
  readByEmployeeIds: string[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: string;
  module: 'Attendance' | 'Leave' | 'Task' | 'Meeting' | 'Employee' | 'Document' | 'System';
  details: string;
  beforeValue?: string;
  afterValue?: string;
  reason?: string;
  targetEmployeeId?: string;
  targetDate?: string;
}

export interface SpecialDayConfig {
  id?: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'Holiday' | 'Working_Day' | 'Special_Working_Day';
}

export interface AttendancePolicyConfig {
  officeStartTime: string;
  officeEndTime: string;
  gracePeriodMinutes: number;
  lateThresholdMinutes: number;
  earlyLeaveThresholdMinutes: number;
  breakDurationMinutes: number;
  weeklyHolidays: string[];
  specialDays?: SpecialDayConfig[];
  campusLat?: number;
  campusLng?: number;
  geofenceRadiusMeters?: number;
  qrRotationSeconds?: number;
  requireGpsVerification?: boolean; // If false, office desk dynamic QR scan alone is sufficient (no GPS blockage)
  autoSyncIntervalMinutes: number;
  institutionLogoUrl?: string;
}

export interface InAppNotification {
  id: string;
  recipientEmployeeId: string;
  recipientName: string;
  senderEmployeeId: string;
  senderName: string;
  title: string;
  message: string;
  linkType: 'task' | 'meeting' | 'leave' | 'tracker' | 'notice' | 'chat';
  linkId?: string;
  actionTrackerId?: string;
  relatedTaskId?: string;
  createdAt: string;
  isRead: boolean;
  priority: 'normal' | 'urgent';
}

export type ChatConversationType = 'direct' | 'group';

export interface ChatConversation {
  id: string;
  type: ChatConversationType;
  title: string;
  department?: string;
  participantEmployeeIds: string[];
  participantUids?: string[];
  isDefaultGroup?: boolean;
  createdByEmployeeId: string;
  createdByName: string;
  lastMessageText?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderEmployeeId: string;
  senderName: string;
  senderRole?: Role;
  text: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToText?: string;
  readByEmployeeIds: string[];
  createdAt: string;
}

export interface ActionTrackerItem {
  id: string;
  serialNo: number;
  title: string;
  description: string;
  assignedPersonText: string;
  assignedEmployeeIds?: string[];
  priority: 'নিম্ন' | 'মাঝারি' | 'উচ্চ' | 'জরুরি' | 'Low' | 'Medium' | 'High' | 'Urgent';
  startDate?: string;
  deadline: string;
  status: 'শুরু হয়নি' | 'চলমান' | 'সম্পন্ন' | 'স্থগিত' | 'Not Started' | 'In Progress' | 'Completed' | 'Deferred';
  progressPercentage: number;
  latestUpdate?: string;
  submissionReport?: string;
  submissionFiles?: SubmittedFileAttachment[];
  submittedAt?: string;
  submittedBy?: string;
  delayReason?: string;
  nextAction?: string;
  followupDate?: string;
  completionDate?: string;
  remarks?: string;
  meetingId?: string;
  meetingTitle?: string;
  createdAt: string;
}
