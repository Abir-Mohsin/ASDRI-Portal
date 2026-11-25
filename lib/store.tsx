'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  initFirebaseAuth,
  googleSignInBasic,
  googleSignInWithDrive,
  firebaseGoogleLogout,
  handleFirestoreError,
  isBenignAbortError,
  OperationType,
} from './firebase';
import {
  syncEmployeeToFirestore,
  deleteEmployeeFromFirestore,
  fetchEmployeeFromFirestoreById,
  findEmployeeInFirestoreByEmail,
  syncAdminUserToFirestore,
  syncLinkedUsersAndAdmins,
  lookupEmployeeBindingByEmail,
  syncPortalCredentialsForEmployee,
  deletePortalCredentialsForEmployee,
  lookupPortalCredential,
  claimEmployeeAuthUidInFirestore,
  getEmployeePrivateContactInfo,
  linkGoogleUserProfile,
  syncAttendanceRecordToFirestore,
  syncRawPunchToFirestore,
  syncCorrectionToFirestore,
  syncLeaveBalanceToFirestore,
  syncLeaveApplicationToFirestore,
  syncActionTrackerToFirestore,
  deleteActionTrackerFromFirestore,
  syncMeetingToFirestore,
  deleteMeetingFromFirestore,
  syncTaskToFirestore,
  syncCalendarEventToFirestore,
  deleteCalendarEventFromFirestore,
  syncNotificationToFirestore,
  syncAuditLogToFirestore,
  syncAttendancePolicyToFirestore,
  syncLeavePolicyToFirestore,
  syncChatConversationToFirestore,
  deleteChatConversationFromFirestore,
  syncChatMessageToFirestore,
  markChatMessageReadInFirestore,
  isValidFirestoreDocId,
  renameEmployeeIdInFirestore,
  fetchFirestoreVerificationStats,
  type FirestoreVerificationStats,
} from './firestore-sync';
import { parseZkAttLogPayload, type ZkParsedPunch } from './zkteco-parser';
import { verifyAttendancePunchClient } from './client-qr';
import {
  Employee,
  DailyAttendanceRecord,
  RawPunchEvent,
  AttendanceCorrectionRequest,
  LeaveBalance,
  LeaveApplication,
  Meeting,
  TaskItem,
  ManagementToDoItem,
  OfficeDocument,
  NoticeItem,
  AuditLog,
  AttendancePolicyConfig,
  WorkspaceTier,
  ActionTrackerItem,
  InAppNotification,
  AttendanceStatus,
  PunchSession,
  CalendarEvent,
  InstitutionalLeavePolicy,
  SpecialDayConfig,
  ChatConversation,
  ChatMessage,
  isAdministrativeRole,
} from './types';
import {
  INITIAL_POLICY,
  INITIAL_EMPLOYEES,
  INITIAL_RAW_PUNCHES,
  INITIAL_DAILY_ATTENDANCE,
  INITIAL_LEAVE_BALANCES,
  INITIAL_LEAVE_APPLICATIONS,
  INITIAL_MEETINGS,
  INITIAL_TASKS,
  INITIAL_MANAGEMENT_TODO,
  INITIAL_DOCUMENTS,
  INITIAL_NOTICES,
  INITIAL_CORRECTIONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_ACTION_TRACKER_ITEMS,
  INITIAL_NOTIFICATIONS,
  INITIAL_INSTITUTIONAL_LEAVE_POLICY,
  INITIAL_CALENDAR_EVENTS,
} from './initial-data';
import { enumerateDateRange } from './calendar-utils';

export function getDhakaDateTime(): { dateStr: string; timeStr: string; shortTime: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  parts.forEach((p) => {
    map[p.type] = p.value;
  });
  const year = map.year || '2026';
  const month = map.month || '01';
  const day = map.day || '01';
  const hour = map.hour === '24' ? '00' : map.hour || '00';
  const minute = map.minute || '00';
  const second = map.second || '00';

  return {
    dateStr: `${year}-${month}-${day}`,
    timeStr: `${hour}:${minute}:${second}`,
    shortTime: `${hour}:${minute}`,
  };
}

export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 0;
  return parts[0] * 60 + parts[1];
}

function toIsoStringSafe(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return fallback;
}

export interface VerifiedPunchParams {
  employeeId: string;
  punchType: 'IN' | 'OUT';
  lat: number;
  lng: number;
  accuracy?: number;
  qrToken: string;
  isMocked?: boolean;
}

export interface VerifiedPunchResult {
  ok: boolean;
  message: string;
  code?: string;
  distanceMeters?: number;
  serverTime?: string;
  isOfflinePending?: boolean;
}

export interface AdminEditAttendanceParams {
  employeeId: string;
  date: string;
  firstInTime?: string;
  lastOutTime?: string;
  status: AttendanceStatus;
  reason: string;
}

export type CloudSyncStatus = 'disconnected' | 'syncing' | 'synced' | 'error';

export interface CloudSyncActionResult {
  ok: boolean;
  syncedToCloud: boolean;
  error?: string;
}

interface AppContextType {
  // Authentication & session
  hydrated: boolean;
  isAuthenticated: boolean;
  login: (employeeId: string, passcode?: string) => Promise<boolean>;
  logout: () => void;
  currentUser: Employee;
  setCurrentUser: (emp: Employee) => void;
  currentWorkspace: WorkspaceTier;
  setCurrentWorkspace: (ws: WorkspaceTier) => void;
  activeNav: string;
  setActiveNav: (nav: string) => void;
  focusedMeetingId: string | null;
  setFocusedMeetingId: (id: string | null) => void;
  focusedCalendarDate: string | null;
  setFocusedCalendarDate: (date: string | null) => void;
  language: 'bn' | 'en';
  setLanguage: (lang: 'bn' | 'en') => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  deviceId: string;

  // Firebase Cloud Sync & Google Drive Auth
  firebaseUser: User | null;
  firebaseAuthReady: boolean;
  hasDriveToken: boolean;
  isCloudAdmin: boolean;
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncError: string | null;
  hasPendingLocalChanges: boolean;
  cloudLastSyncedAt: string | null;
  clearCloudSyncError: () => void;
  signInWithGoogleAccount: () => Promise<{
    user: User;
    matchedEmployee?: Employee | null;
    unauthorizedEmail?: string;
  } | null>;
  connectGoogleWorkspace: () => Promise<{
    user: User;
    accessToken: string;
    matchedEmployee?: Employee | null;
    unauthorizedEmail?: string;
  } | null>;
  disconnectGoogleWorkspace: () => Promise<void>;
  pushAllLocalToFirestore: () => Promise<number>;
  verifyFirestoreCloudData: () => Promise<FirestoreVerificationStats>;

  // Data collections
  employees: Employee[];
  attendanceRecords: DailyAttendanceRecord[];
  rawPunches: RawPunchEvent[];
  corrections: AttendanceCorrectionRequest[];
  leaveBalances: Record<string, LeaveBalance>;
  leaveApplications: LeaveApplication[];
  meetings: Meeting[];
  tasks: TaskItem[];
  actionTrackerItems: ActionTrackerItem[];
  notifications: InAppNotification[];
  managementToDos: ManagementToDoItem[];
  documents: OfficeDocument[];
  notices: NoticeItem[];
  auditLogs: AuditLog[];
  policy: AttendancePolicyConfig;
  calendarEvents: CalendarEvent[];
  institutionalLeavePolicy: InstitutionalLeavePolicy;
  chatConversations: ChatConversation[];
  chatMessages: ChatMessage[];
  activeChatConversationId: string | null;
  setActiveChatConversationId: (id: string | null) => void;
  unreadChatCount: number;
  getConversationUnreadCount: (conversationId: string) => number;

  // Actions
  addEmployee: (emp: Omit<Employee, 'id'> & { id: string }) => Promise<CloudSyncActionResult>;
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<CloudSyncActionResult>;
  deleteEmployee: (id: string) => Promise<CloudSyncActionResult>;
  executeVerifiedPunch: (params: VerifiedPunchParams) => Promise<VerifiedPunchResult>;
  syncOfflinePunches: () => Promise<number>;
  adminEditAttendanceRecord: (params: AdminEditAttendanceParams) => void;
  getEmployeeLeaveOnDate: (employeeId: string, date: string) => LeaveApplication | undefined;
  getEmployeeLeaveBalance: (employeeId: string) => LeaveBalance;
  updateInstitutionalLeavePolicy: (
    updates: Partial<InstitutionalLeavePolicy>,
    applyMode?: 'non_custom' | 'all' | 'policy_only'
  ) => void;
  updateEmployeeLeaveQuota: (
    employeeId: string,
    updates: {
      casualLeaveTotal?: number;
      sickLeaveTotal?: number;
      earnedLeaveTotal?: number;
      isCustomQuota?: boolean;
    }
  ) => void;
  createCalendarEvent: (event: Omit<CalendarEvent, 'id' | 'createdAt'>) => void;
  createCalendarEventsBatch: (events: Omit<CalendarEvent, 'id' | 'createdAt'>[]) => void;
  updateCalendarEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  deleteCalendarEvent: (id: string) => void;
  recordManualPunch: (empId: string, punchType: 'IN' | 'OUT', verificationType: string) => void;
  ingestZkMachinePunches: (incomingPunches: ZkParsedPunch[]) => {
    processedCount: number;
    matchedCount: number;
    unmappedPins: string[];
  };
  simulateMachineSync: () => { newCount: number };
  importMachineLogsCSV: (csvText: string) => number;
  submitCorrectionRequest: (req: Omit<AttendanceCorrectionRequest, 'id' | 'status' | 'appliedAt'>) => void;
  approveCorrectionRequest: (id: string, approverRemarks?: string) => void;
  rejectCorrectionRequest: (id: string, approverRemarks?: string) => void;
  submitLeaveApplication: (app: Omit<LeaveApplication, 'id' | 'status' | 'appliedDate'>) => void;
  recommendLeave: (id: string, remarks: string, status: 'Recommended' | 'Not Recommended') => void;
  finalApproveLeave: (id: string, remarks: string, approved: boolean) => void;
  cancelLeaveApplication: (id: string, reason: string) => void;
  createMeeting: (m: Omit<Meeting, 'id' | 'createdAt'>) => void;
  scheduleMeetingFromCalendar: (input: {
    title: string;
    meetingType?: string;
    department: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: string;
    chairperson: string;
    secretary: string;
    agenda: string[];
    participants: string[];
    invitedEmployeeIds: string[];
    description?: string;
  }) => { calendarEvent: CalendarEvent; meeting: Meeting };
  updateMeeting: (id: string, updates: Partial<Meeting>) => void;
  deleteMeeting: (id: string) => void;
  convertDecisionToTask: (meetingId: string, decisionId: string) => TaskItem;
  createTask: (t: Omit<TaskItem, 'id' | 'createdAt'>) => void;
  updateTaskProgress: (id: string, progress: number, notes?: string) => void;
  submitTaskForReview: (id: string, notes: string, attachment?: string) => void;
  reviewTask: (id: string, approved: boolean, feedback?: string) => void;
  createActionTrackerItem: (item: Omit<ActionTrackerItem, 'id' | 'createdAt' | 'serialNo'>) => void;
  updateActionTrackerItem: (id: string, updates: Partial<ActionTrackerItem>) => void;
  deleteActionTrackerItem: (id: string) => void;
  updateActionTrackerProgress: (id: string, updates: Partial<ActionTrackerItem>) => void;
  importActionTrackerItems: (newItems: Array<Omit<ActionTrackerItem, 'id' | 'createdAt'>>) => number;
  sendNotification: (notif: Omit<InAppNotification, 'id' | 'createdAt' | 'isRead'>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: (employeeId: string) => void;
  createManagementToDo: (item: Omit<ManagementToDoItem, 'id' | 'publishedAt'>) => void;
  updateManagementToDoStatus: (id: string, status: ManagementToDoItem['status']) => void;
  createDocument: (doc: Omit<OfficeDocument, 'id'>) => void;
  createNotice: (n: Omit<NoticeItem, 'id' | 'readByEmployeeIds'>) => void;
  markNoticeAsRead: (noticeId: string, empId: string) => void;
  updatePolicy: (policy: Partial<AttendancePolicyConfig>) => void;
  logAudit: (
    action: string,
    module: AuditLog['module'],
    details: string,
    meta?: {
      beforeValue?: string;
      afterValue?: string;
      reason?: string;
      targetEmployeeId?: string;
      targetDate?: string;
    }
  ) => void;
  startDirectChat: (targetEmployeeId: string) => string;
  createGroupChat: (params: {
    title: string;
    department?: string;
    participantEmployeeIds: string[];
  }) => string;
  updateGroupChatMembers: (
    conversationId: string,
    params: { title?: string; participantEmployeeIds: string[] }
  ) => void;
  deleteGroupChat: (conversationId: string) => void;
  sendChatMessage: (params: {
    conversationId: string;
    text: string;
    replyToMessageId?: string;
    replyToSenderName?: string;
    replyToText?: string;
  }) => void;
  markConversationAsRead: (conversationId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  DEVICE_ID: 'asdri_v2_device_id',
  EMPLOYEES: 'asdri_v2_employees',
  ATTENDANCE: 'asdri_v2_attendance_records',
  RAW_PUNCHES: 'asdri_v2_raw_punches',
  CORRECTIONS: 'asdri_v2_corrections',
  POLICY: 'asdri_v2_policy',
  AUDIT_LOGS: 'asdri_v2_audit_logs',
  LEAVES: 'asdri_v2_leaves',
  LEAVE_BALANCES: 'asdri_v2_leave_balances',
  LEAVE_POLICY: 'asdri_v2_institutional_leave_policy',
  CALENDAR_EVENTS: 'asdri_v2_calendar_events',
  MEETINGS: 'asdri_v2_meetings',
  NOTIFICATIONS: 'asdri_v2_notifications',
  ACTION_TRACKER: 'asdri_v2_action_tracker',
  CHAT_CONVERSATIONS: 'asdri_v2_chat_conversations',
  CHAT_MESSAGES: 'asdri_v2_chat_messages',
  PENDING_SYNC: 'asdri_v2_pending_sync',
  AUTH_USER_ID: 'asdri_v3_auth_user_id',
  EXPLICIT_LOGOUT: 'asdri_v3_explicit_logout',
  V3_CLEAN_MIGRATED: 'asdri_v3_manual_staff_migrated',
  SYNCED_CRED_DIGESTS: 'asdri_v3_synced_cred_digests_asdri_portal',
};

const EMPTY_GUEST_USER: Employee = {
  id: '',
  name: 'Guest User',
  nameBn: 'অতিথি ব্যবহারকারী',
  email: '',
  phone: '',
  photoUrl: '',
  designation: 'Member',
  designationBn: 'সদস্য',
  department: 'প্রশাসন',
  employmentType: 'পূর্ণকালীন',
  joiningDate: '2026-01-01',
  status: 'Active',
  attendanceMachineId: '',
  shiftSchedule: '09:00 - 17:00',
  leavePolicy: 'সাধারণ নীতিমালা',
  role: 'staff',
};

const BOOTSTRAPPED_ADMIN_EMAIL = 'abirmohsin02@gmail.com';

function extractReadableSyncError(err: unknown, fallbackPath?: string): string {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown error');
  try {
    const parsed = JSON.parse(raw) as { error?: string; path?: string; authInfo?: { email?: string } };
    if (parsed?.error) {
      const pathText = parsed.path || fallbackPath || '';
      const emailText = parsed.authInfo?.email ? ` (${parsed.authInfo.email})` : '';
      if (parsed.error.toLowerCase().includes('permission')) {
        return `Firestore অনুমতি (Permission) সমস্যা: ${pathText}${emailText}`;
      }
      return `${pathText ? `${pathText}: ` : ''}${parsed.error}`;
    }
  } catch {
    // plain error string
  }
  return fallbackPath ? `${fallbackPath}: ${raw}` : raw;
}

async function runChunkedTasks<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  chunkSize = 6
): Promise<{ okCount: number; errors: string[] }> {
  let okCount = 0;
  const errors: string[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const settled = await Promise.allSettled(chunk.map((item) => worker(item)));
    for (const res of settled) {
      if (res.status === 'fulfilled') {
        okCount++;
      } else {
        errors.push(extractReadableSyncError(res.reason));
      }
    }
  }
  return { okCount, errors };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [currentUser, setCurrentUser] = useState<Employee>(EMPTY_GUEST_USER);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceTier>('institutional');
  const [activeNav, setActiveNav] = useState<string>('workspace');
  const [focusedMeetingId, setFocusedMeetingId] = useState<string | null>(null);
  const [focusedCalendarDate, setFocusedCalendarDate] = useState<string | null>(null);
  const [language, setLanguage] = useState<'bn' | 'en'>('bn');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string>('DEV-BROWSER-INIT');

  const [attendanceRecords, setAttendanceRecords] = useState<DailyAttendanceRecord[]>(INITIAL_DAILY_ATTENDANCE);
  const [rawPunches, setRawPunches] = useState<RawPunchEvent[]>(INITIAL_RAW_PUNCHES);
  const [corrections, setCorrections] = useState<AttendanceCorrectionRequest[]>(INITIAL_CORRECTIONS);
  const [leaveBalances, setLeaveBalances] = useState<Record<string, LeaveBalance>>(INITIAL_LEAVE_BALANCES);
  const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>(INITIAL_LEAVE_APPLICATIONS);
  const [meetings, setMeetings] = useState<Meeting[]>(INITIAL_MEETINGS);
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [actionTrackerItems, setActionTrackerItems] = useState<ActionTrackerItem[]>(INITIAL_ACTION_TRACKER_ITEMS);
  const [notifications, setNotifications] = useState<InAppNotification[]>(INITIAL_NOTIFICATIONS);
  const [managementToDos, setManagementToDos] = useState<ManagementToDoItem[]>(INITIAL_MANAGEMENT_TODO);
  const [documents, setDocuments] = useState<OfficeDocument[]>(INITIAL_DOCUMENTS);
  const [notices, setNotices] = useState<NoticeItem[]>(INITIAL_NOTICES);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [policy, setPolicy] = useState<AttendancePolicyConfig>(INITIAL_POLICY);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(INITIAL_CALENDAR_EVENTS);
  const [institutionalLeavePolicy, setInstitutionalLeavePolicy] = useState<InstitutionalLeavePolicy>(
    INITIAL_INSTITUTIONAL_LEAVE_POLICY
  );
  const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeChatConversationId, setActiveChatConversationId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Firebase Auth & Firestore Cloud Sync State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState<boolean>(false);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(false);
  const [isCloudAdmin, setIsCloudAdmin] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('disconnected');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [hasPendingLocalChanges, setHasPendingLocalChanges] = useState<boolean>(false);
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState<string | null>(null);

  const initialSeedAttemptedRef = useRef<boolean>(false);
  const cloudInitializedRef = useRef<boolean>(false);
  const hasPendingLocalChangesRef = useRef<boolean>(false);
  const empUidMapRef = useRef<Record<string, string>>({});
  const syncedCredDigestRef = useRef<Map<string, string>>(new Map());
  const isAuthenticatedRef = useRef<boolean>(isAuthenticated);
  const currentUserRef = useRef<Employee>(currentUser);
  const stateRef = useRef({
    employees,
    attendanceRecords,
    rawPunches,
    corrections,
    leaveBalances,
    leaveApplications,
    actionTrackerItems,
    meetings,
    tasks,
    calendarEvents,
    notifications,
    policy,
    institutionalLeavePolicy,
    chatConversations,
    chatMessages,
  });

  useEffect(() => {
    stateRef.current = {
      employees,
      attendanceRecords,
      rawPunches,
      corrections,
      leaveBalances,
      leaveApplications,
      actionTrackerItems,
      meetings,
      tasks,
      calendarEvents,
      notifications,
      policy,
      institutionalLeavePolicy,
      chatConversations,
      chatMessages,
    };
  }, [
    employees,
    attendanceRecords,
    rawPunches,
    corrections,
    leaveBalances,
    leaveApplications,
    actionTrackerItems,
    meetings,
    tasks,
    calendarEvents,
    notifications,
    policy,
    institutionalLeavePolicy,
    chatConversations,
    chatMessages,
  ]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    hasPendingLocalChangesRef.current = hasPendingLocalChanges;
  }, [hasPendingLocalChanges]);

  const markPendingLocalChange = useCallback(() => {
    hasPendingLocalChangesRef.current = true;
    setHasPendingLocalChanges(true);
    try {
      localStorage.setItem(STORAGE_KEYS.PENDING_SYNC, '1');
    } catch {
      // ignore
    }
  }, []);

  const clearPendingLocalChange = useCallback(() => {
    hasPendingLocalChangesRef.current = false;
    setHasPendingLocalChanges(false);
    try {
      localStorage.removeItem(STORAGE_KEYS.PENDING_SYNC);
    } catch {
      // ignore
    }
  }, []);

  const clearCloudSyncError = useCallback(() => {
    setCloudSyncError(null);
  }, []);

  const toPortalCloudUid = (empId: string) =>
    `portal_${empId.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user'}`;

  const isPortalCloudSession = !firebaseUser && isAuthenticated && Boolean(currentUser.id);

  const activeUid = firebaseUser?.emailVerified
    ? firebaseUser.uid
    : isPortalCloudSession
    ? toPortalCloudUid(currentUser.id)
    : null;

  const resolveActiveWriterUid = (): string | null => {
    const currentAuthUser = auth.currentUser;
    if (currentAuthUser?.emailVerified) return currentAuthUser.uid;
    if (!currentAuthUser && isAuthenticatedRef.current && currentUserRef.current?.id) {
      return toPortalCloudUid(currentUserRef.current.id);
    }
    return null;
  };

  const runCloudWrite = useCallback(
    (task: () => Promise<void>, label?: string) => {
      const currentAuthUser = auth.currentUser;
      const hasGoogleAuth = Boolean(currentAuthUser && currentAuthUser.emailVerified);
      const hasPortalAuth =
        !currentAuthUser && isAuthenticatedRef.current && Boolean(currentUserRef.current?.id);
      if (!hasGoogleAuth && !hasPortalAuth) {
        markPendingLocalChange();
        return;
      }
      setCloudSyncStatus('syncing');
      task()
        .then(() => {
          setCloudSyncStatus('synced');
          setCloudSyncError(null);
          setCloudLastSyncedAt(new Date().toISOString());
        })
        .catch((err) => {
          setCloudSyncStatus('error');
          setCloudSyncError(extractReadableSyncError(err, label));
          markPendingLocalChange();
        });
    },
    [markPendingLocalChange]
  );

  const resolveUidsForEmployeeIds = useCallback((empIds?: string[]): string[] => {
    if (!empIds || empIds.length === 0) return [];
    const result: string[] = [];
    for (const empId of empIds) {
      const uid = empUidMapRef.current[empId];
      if (uid && !result.includes(uid)) {
        result.push(uid);
      }
    }
    return result;
  }, []);

  // Hydrate initial local state cache cleanly
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        let storedDevice = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
        if (!storedDevice) {
          storedDevice = `MOB-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;
          localStorage.setItem(STORAGE_KEYS.DEVICE_ID, storedDevice);
        }
        setDeviceId(storedDevice);

        const isCleanMigrated = localStorage.getItem(STORAGE_KEYS.V3_CLEAN_MIGRATED) === '1';
        let hydratedEmployees: Employee[] = [];
        const savedEmployees = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
        if (savedEmployees) {
          const parsed = JSON.parse(savedEmployees);
          if (Array.isArray(parsed)) {
            hydratedEmployees = isCleanMigrated
              ? parsed
              : parsed.filter(
                  (emp: Employee) =>
                    typeof emp?.email === 'string' &&
                    emp.email.trim().length > 0 &&
                    !emp.email.toLowerCase().endsWith('@as-sunnah.org')
                );
          }
        }
        if (!isCleanMigrated) {
          localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(hydratedEmployees));
          localStorage.setItem(STORAGE_KEYS.V3_CLEAN_MIGRATED, '1');
        }
        setEmployees(hydratedEmployees);
        stateRef.current.employees = hydratedEmployees;

        const savedAtt = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
        if (savedAtt) setAttendanceRecords(JSON.parse(savedAtt));

        const savedRaw = localStorage.getItem(STORAGE_KEYS.RAW_PUNCHES);
        if (savedRaw) setRawPunches(JSON.parse(savedRaw));

        const savedCorr = localStorage.getItem(STORAGE_KEYS.CORRECTIONS);
        if (savedCorr) setCorrections(JSON.parse(savedCorr));

        const savedPolicy = localStorage.getItem(STORAGE_KEYS.POLICY);
        if (savedPolicy) {
          const parsedPol = JSON.parse(savedPolicy);
          setPolicy({
            ...INITIAL_POLICY,
            ...parsedPol,
            institutionLogoUrl: parsedPol.institutionLogoUrl || INITIAL_POLICY.institutionLogoUrl,
          });
        }

        const savedLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
        if (savedLogs) setAuditLogs(JSON.parse(savedLogs));

        const savedLeaves = localStorage.getItem(STORAGE_KEYS.LEAVES);
        if (savedLeaves) setLeaveApplications(JSON.parse(savedLeaves));

        const savedLeaveBalances = localStorage.getItem(STORAGE_KEYS.LEAVE_BALANCES);
        if (savedLeaveBalances) {
          const parsedBal = JSON.parse(savedLeaveBalances) as Record<string, LeaveBalance>;
          if (isCleanMigrated) {
            setLeaveBalances(parsedBal);
          } else {
            const keptIds = new Set(hydratedEmployees.map((e) => e.id));
            const filteredBal: Record<string, LeaveBalance> = {};
            for (const [k, v] of Object.entries(parsedBal)) {
              if (keptIds.has(k)) filteredBal[k] = v;
            }
            setLeaveBalances(filteredBal);
            localStorage.setItem(STORAGE_KEYS.LEAVE_BALANCES, JSON.stringify(filteredBal));
          }
        }

        const explicitLogout = localStorage.getItem(STORAGE_KEYS.EXPLICIT_LOGOUT) === '1';
        const savedAuthUserId = localStorage.getItem(STORAGE_KEYS.AUTH_USER_ID);
        if (!explicitLogout && savedAuthUserId && hydratedEmployees.length > 0) {
          const restoredUser = hydratedEmployees.find((e) => e.id === savedAuthUserId);
          if (restoredUser) {
            currentUserRef.current = restoredUser;
            isAuthenticatedRef.current = true;
            setCurrentUser(restoredUser);
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem(STORAGE_KEYS.AUTH_USER_ID);
          }
        } else if (!isCleanMigrated) {
          localStorage.removeItem(STORAGE_KEYS.AUTH_USER_ID);
        }

        const savedLeavePolicy = localStorage.getItem(STORAGE_KEYS.LEAVE_POLICY);
        if (savedLeavePolicy) {
          setInstitutionalLeavePolicy({
            ...INITIAL_INSTITUTIONAL_LEAVE_POLICY,
            ...JSON.parse(savedLeavePolicy),
          });
        }

        const savedCalendarEvents = localStorage.getItem(STORAGE_KEYS.CALENDAR_EVENTS);
        if (savedCalendarEvents) {
          const parsedCal = JSON.parse(savedCalendarEvents);
          if (Array.isArray(parsedCal)) setCalendarEvents(parsedCal);
        }

        const savedMeetings = localStorage.getItem(STORAGE_KEYS.MEETINGS);
        if (savedMeetings) {
          const parsedMtg = JSON.parse(savedMeetings);
          if (Array.isArray(parsedMtg)) setMeetings(parsedMtg);
        }

        const savedNotifs = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
        if (savedNotifs) setNotifications(JSON.parse(savedNotifs));

        const savedActions = localStorage.getItem(STORAGE_KEYS.ACTION_TRACKER);
        if (savedActions) {
          try {
            const parsed = JSON.parse(savedActions);
            if (Array.isArray(parsed)) setActionTrackerItems(parsed);
          } catch {
            // ignore
          }
        }

        const savedConvs = localStorage.getItem(STORAGE_KEYS.CHAT_CONVERSATIONS);
        if (savedConvs) {
          try {
            const parsed = JSON.parse(savedConvs);
            if (Array.isArray(parsed)) setChatConversations(parsed);
          } catch {
            // ignore
          }
        }

        const savedMsgs = localStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES);
        if (savedMsgs) {
          try {
            const parsed = JSON.parse(savedMsgs);
            if (Array.isArray(parsed)) setChatMessages(parsed);
          } catch {
            // ignore
          }
        }

        const pendingFlag = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC);
        if (pendingFlag === '1') {
          hasPendingLocalChangesRef.current = true;
          setHasPendingLocalChanges(true);
        }

        const savedCredDigests = localStorage.getItem(STORAGE_KEYS.SYNCED_CRED_DIGESTS);
        if (savedCredDigests) {
          try {
            const parsed = JSON.parse(savedCredDigests) as Record<string, string>;
            if (parsed && typeof parsed === 'object') {
              syncedCredDigestRef.current = new Map(Object.entries(parsed));
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore storage errors
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Push current institutional state to Firestore (resilient, chunked, error-reporting)
  const pushAllLocalToFirestore = useCallback(async (): Promise<number> => {
    const user = auth.currentUser;
    const isPortalUser = !user && isAuthenticatedRef.current && Boolean(currentUserRef.current?.id);

    if (!user && !isPortalUser) {
      const msg = 'ক্লাউড সিঙ্ক করতে আগে লগইন করুন।';
      setCloudSyncError(msg);
      throw new Error(msg);
    }
    if (user && !user.emailVerified) {
      const msg = 'আপনার Google অ্যাকাউন্টের ইমেইল যাচাইকৃত নয়।';
      setCloudSyncError(msg);
      throw new Error(msg);
    }

    const uid = user
      ? user.uid
      : `portal_${currentUserRef.current.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user'}`;
    setCloudSyncStatus('syncing');
    setCloudSyncError(null);

    const PORTAL_ADMIN_ROLES = [
      'super_admin',
      'director',
      'deputy_director',
      'assistant_director',
      'admin_incharge',
    ];

    let adminFlag = false;
    if (user) {
      adminFlag = user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
      if (!adminFlag) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', uid));
          adminFlag = adminSnap.exists();
        } catch {
          adminFlag = false;
        }
      }
    } else if (isPortalUser) {
      adminFlag = PORTAL_ADMIN_ROLES.includes(currentUserRef.current.role);
    }

    const snapshot = stateRef.current;
    let totalSynced = 0;
    const allErrors: string[] = [];

    if (adminFlag) {
      if (user?.email) {
        await syncAdminUserToFirestore({
          uid,
          email: user.email,
          role: 'super_admin',
        }).catch((e) => {
          allErrors.push(extractReadableSyncError(e, `admins/${uid}`));
        });
      }

      const linkedMap = await syncLinkedUsersAndAdmins(snapshot.employees);
      empUidMapRef.current = { ...empUidMapRef.current, ...linkedMap };

      const policyTasks: Promise<void>[] = [
        syncAttendancePolicyToFirestore(snapshot.policy, uid)
          .then(() => {
            totalSynced++;
          })
          .catch((e) => {
            allErrors.push(extractReadableSyncError(e, 'settings/attendancePolicy'));
          }),
        syncLeavePolicyToFirestore(snapshot.institutionalLeavePolicy, uid)
          .then(() => {
            totalSynced++;
          })
          .catch((e) => {
            allErrors.push(extractReadableSyncError(e, 'settings/institutionalLeavePolicy'));
          }),
      ];
      await Promise.all(policyTasks);

      syncedCredDigestRef.current.clear();
      try {
        localStorage.removeItem(STORAGE_KEYS.SYNCED_CRED_DIGESTS);
      } catch {
        // ignore
      }

      const empRes = await runChunkedTasks(snapshot.employees, (emp) =>
        syncEmployeeToFirestore(emp, uid, false, empUidMapRef.current[emp.id])
      );
      totalSynced += empRes.okCount;
      allErrors.push(...empRes.errors);

      const balRes = await runChunkedTasks(Object.values(snapshot.leaveBalances), (bal) =>
        syncLeaveBalanceToFirestore(bal, empUidMapRef.current[bal.employeeId] || uid)
      );
      totalSynced += balRes.okCount;
      allErrors.push(...balRes.errors);

      const attRes = await runChunkedTasks(snapshot.attendanceRecords, (rec) =>
        syncAttendanceRecordToFirestore(rec, empUidMapRef.current[rec.employeeId] || uid)
      );
      totalSynced += attRes.okCount;
      allErrors.push(...attRes.errors);

      const rawRes = await runChunkedTasks(
        snapshot.rawPunches.filter((p) => p.syncStatus !== 'pending'),
        (p) => syncRawPunchToFirestore(p, empUidMapRef.current[p.employeeId] || uid)
      );
      totalSynced += rawRes.okCount;
      allErrors.push(...rawRes.errors);

      const corrRes = await runChunkedTasks(snapshot.corrections, (corr) =>
        syncCorrectionToFirestore(corr, empUidMapRef.current[corr.employeeId] || uid)
      );
      totalSynced += corrRes.okCount;
      allErrors.push(...corrRes.errors);

      const leaveRes = await runChunkedTasks(snapshot.leaveApplications, (leave) =>
        syncLeaveApplicationToFirestore(leave, empUidMapRef.current[leave.employeeId] || uid)
      );
      totalSynced += leaveRes.okCount;
      allErrors.push(...leaveRes.errors);

      const trackerRes = await runChunkedTasks(snapshot.actionTrackerItems, (item) =>
        syncActionTrackerToFirestore(item, uid, resolveUidsForEmployeeIds(item.assignedEmployeeIds))
      );
      totalSynced += trackerRes.okCount;
      allErrors.push(...trackerRes.errors);

      const mtgRes = await runChunkedTasks(snapshot.meetings, (mtg) =>
        syncMeetingToFirestore(mtg, uid, resolveUidsForEmployeeIds(mtg.invitedEmployeeIds))
      );
      totalSynced += mtgRes.okCount;
      allErrors.push(...mtgRes.errors);

      const taskRes = await runChunkedTasks(snapshot.tasks, (t) =>
        syncTaskToFirestore(t, uid, empUidMapRef.current[t.assignedPersonId])
      );
      totalSynced += taskRes.okCount;
      allErrors.push(...taskRes.errors);

      const calRes = await runChunkedTasks(snapshot.calendarEvents, (ev) =>
        syncCalendarEventToFirestore(ev, uid)
      );
      totalSynced += calRes.okCount;
      allErrors.push(...calRes.errors);

      const notifRes = await runChunkedTasks(snapshot.notifications.slice(0, 50), (n) =>
        syncNotificationToFirestore(n, uid, empUidMapRef.current[n.recipientEmployeeId] || uid)
      );
      totalSynced += notifRes.okCount;
      allErrors.push(...notifRes.errors);

      const convRes = await runChunkedTasks(snapshot.chatConversations, (c) =>
        syncChatConversationToFirestore(c, uid, resolveUidsForEmployeeIds(c.participantEmployeeIds))
      );
      totalSynced += convRes.okCount;
      allErrors.push(...convRes.errors);

      const msgRes = await runChunkedTasks(snapshot.chatMessages.slice(-200), (m) =>
        syncChatMessageToFirestore(m, uid)
      );
      totalSynced += msgRes.okCount;
      allErrors.push(...msgRes.errors);
    } else {
      // Non-admin staff member: sync own personal attendance, corrections, leave requests, and chat messages cleanly
      const myEmpId = currentUserRef.current.id;
      const myAtt = snapshot.attendanceRecords.filter((r) => r.employeeId === myEmpId);
      const myRaw = snapshot.rawPunches.filter(
        (p) => p.employeeId === myEmpId && p.syncStatus !== 'pending'
      );
      const myCorr = snapshot.corrections.filter(
        (c) => c.employeeId === myEmpId && c.status === 'Pending'
      );
      const myLeaves = snapshot.leaveApplications.filter(
        (l) => l.employeeId === myEmpId && l.status === 'Pending_Dept_Head'
      );
      const myConvs = snapshot.chatConversations.filter((c) =>
        c.participantEmployeeIds.includes(myEmpId)
      );
      const myMsgs = snapshot.chatMessages
        .filter((m) => m.senderEmployeeId === myEmpId)
        .slice(-100);

      const resList = await Promise.all([
        runChunkedTasks(myAtt, (r) => syncAttendanceRecordToFirestore(r, uid)),
        runChunkedTasks(myRaw, (p) => syncRawPunchToFirestore(p, uid)),
        runChunkedTasks(myCorr, (c) => syncCorrectionToFirestore(c, uid)),
        runChunkedTasks(myLeaves, (l) => syncLeaveApplicationToFirestore(l, uid)),
        runChunkedTasks(myConvs, (c) =>
          syncChatConversationToFirestore(c, uid, resolveUidsForEmployeeIds(c.participantEmployeeIds))
        ),
        runChunkedTasks(myMsgs, (m) => syncChatMessageToFirestore(m, uid)),
      ]);
      for (const r of resList) {
        totalSynced += r.okCount;
        allErrors.push(...r.errors);
      }
    }

    if (allErrors.length > 0) {
      const summaryErr = `${allErrors.length} টি রেকর্ড সিঙ্ক হয়নি (${allErrors[0]})`;
      setCloudSyncStatus('error');
      setCloudSyncError(summaryErr);
      throw new Error(summaryErr);
    }

    clearPendingLocalChange();
    setCloudSyncStatus('synced');
    setCloudSyncError(null);
    setCloudLastSyncedAt(new Date().toISOString());
    return totalSynced;
  }, [clearPendingLocalChange, resolveUidsForEmployeeIds]);

  const verifyFirestoreCloudData = useCallback(async (): Promise<FirestoreVerificationStats> => {
    const user = auth.currentUser;
    if (user?.emailVerified) {
      return fetchFirestoreVerificationStats(isCloudAdmin, user.uid);
    }
    if (!user && isAuthenticatedRef.current && currentUserRef.current?.id) {
      const portalUid = `portal_${currentUserRef.current.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user'}`;
      return fetchFirestoreVerificationStats(true, portalUid);
    }
    throw new Error('ক্লাউড ডেটা যাচাই করতে আগে লগইন করুন।');
  }, [isCloudAdmin]);

  const applyFirebaseUserSession = useCallback(
    async (
      user: User | null,
      driveTokenPresent: boolean,
      forceUiLogin = false
    ): Promise<Employee | null> => {
      setFirebaseUser(user);
      setHasDriveToken(driveTokenPresent);
      initialSeedAttemptedRef.current = false;
      cloudInitializedRef.current = false;

      if (!user) {
        setIsCloudAdmin(false);
        setCloudSyncStatus('disconnected');
        setCloudSyncError(null);
        setFirebaseAuthReady(true);
        return null;
      }

      // Hold listeners until admin claim, employee binding, and profile link finish
      setFirebaseAuthReady(false);

      const isBootstrappedAdmin =
        Boolean(user.emailVerified) &&
        user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

      let adminFlag = false;
      let setupError: string | null = null;

      if (isBootstrappedAdmin && user.email) {
        adminFlag = true;
        try {
          await syncAdminUserToFirestore({
            uid: user.uid,
            email: user.email,
            role: 'super_admin',
          });
        } catch (err) {
          setupError = extractReadableSyncError(err, `admins/${user.uid}`);
        }
      } else if (user.emailVerified) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', user.uid));
          adminFlag = adminSnap.exists();
        } catch {
          adminFlag = false;
        }
      }

      setIsCloudAdmin(adminFlag);
      setCloudSyncStatus(setupError ? 'error' : 'syncing');
      setCloudSyncError(setupError);

      try {
        const userEmailLower = user.email?.toLowerCase() || '';
        let matched: Employee | undefined = userEmailLower
          ? stateRef.current.employees.find((e) => e.email.toLowerCase() === userEmailLower)
          : undefined;

        // Cross-device lookup via zero-PII emailBindings / Firestore
        let matchedViaBinding = false;
        if (!matched && userEmailLower && user.emailVerified) {
          const binding = await lookupEmployeeBindingByEmail(userEmailLower);
          if (binding?.employeeId) {
            matchedViaBinding = true;
            const bindingPlaceholder: Employee = {
              id: binding.employeeId,
              name: binding.displayName || binding.employeeId,
              nameBn: binding.displayName || binding.employeeId,
              email: user.email || '',
              phone: '',
              photoUrl: user.photoURL || '',
              designation: 'Member',
              designationBn: 'সদস্য',
              department: 'প্রশাসন',
              employmentType: 'পূর্ণকালীন',
              joiningDate: getDhakaDateTime().dateStr,
              status: 'Active',
              attendanceMachineId: '',
              shiftSchedule: '09:00 - 17:00',
              leavePolicy: 'সাধারণ নীতিমালা',
              role: binding.role || 'teacher',
            };

            // Link /users/{uid} FIRST and self-claim authUid so first-time staff can read their own employee doc immediately
            try {
              await linkGoogleUserProfile({
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || binding.displayName || binding.employeeId,
                employee: bindingPlaceholder,
                isCloudAdmin: adminFlag,
              });
              await claimEmployeeAuthUidInFirestore(binding.employeeId, user.uid);
            } catch {
              // continue fetching profile
            }

            const existingLocal = stateRef.current.employees.find(
              (e) => e.id === binding.employeeId
            );
            if (existingLocal) {
              matched = {
                ...existingLocal,
                email: user.email || existingLocal.email,
              };
            } else {
              const remoteEmp = await fetchEmployeeFromFirestoreById(binding.employeeId);
              if (remoteEmp) {
                matched = {
                  ...remoteEmp,
                  email: user.email || remoteEmp.email,
                };
              } else {
                matched = bindingPlaceholder;
              }
            }
          }
        }

        if (!matched && adminFlag && userEmailLower) {
          const foundRemote = await findEmployeeInFirestoreByEmail(userEmailLower);
          if (foundRemote) {
            matched = foundRemote;
          }
        }

        // First-time clean bootstrap for Super Admin ONLY when no profile exists anywhere yet
        if (!matched && isBootstrappedAdmin && user.email) {
          const usedIds = new Set(stateRef.current.employees.map((e) => e.id.toUpperCase()));
          let newAdminId = 'ADMIN-01';
          let seq = 1;
          while (usedIds.has(newAdminId)) {
            seq++;
            newAdminId = `ADMIN-${String(seq).padStart(2, '0')}`;
          }
          const cleanDisplayName = (user.displayName || '').trim() || 'Super Admin';
          const lp = stateRef.current.institutionalLeavePolicy;
          const bootstrappedAdmin: Employee = {
            id: newAdminId,
            name: cleanDisplayName,
            nameBn: cleanDisplayName,
            email: user.email,
            phone: '',
            password: '123456',
            photoUrl: user.photoURL || '',
            designation: 'Super Admin',
            designationBn: 'সুপার এডমিন',
            department: 'প্রশাসন',
            employmentType: 'পূর্ণকালীন',
            joiningDate: getDhakaDateTime().dateStr,
            status: 'Active',
            attendanceMachineId: '',
            shiftSchedule: '09:00 - 17:00',
            leavePolicy: 'সাধারণ নীতিমালা',
            role: 'super_admin',
          };
          const newBal: LeaveBalance = {
            employeeId: newAdminId,
            year: lp.year,
            casualLeaveTotal: lp.casualLeaveEnabled ? lp.casualLeaveDefault : 0,
            casualLeaveUsed: 0,
            sickLeaveTotal: lp.sickLeaveEnabled ? lp.sickLeaveDefault : 0,
            sickLeaveUsed: 0,
            earnedLeaveTotal: lp.earnedLeaveEnabled ? lp.earnedLeaveDefault : 0,
            earnedLeaveUsed: 0,
            dutyLeaveUsed: 0,
            isCustomQuota: false,
          };

          matched = bootstrappedAdmin;
          setEmployees((prev) =>
            prev.some((e) => e.id === bootstrappedAdmin.id) ? prev : [...prev, bootstrappedAdmin]
          );
          setLeaveBalances((prev) =>
            prev[newAdminId] ? prev : { ...prev, [newAdminId]: newBal }
          );
          try {
            await syncEmployeeToFirestore(bootstrappedAdmin, user.uid, true, user.uid);
            await syncLeaveBalanceToFirestore(newBal, user.uid);
          } catch (err) {
            setCloudSyncStatus('error');
            setCloudSyncError(extractReadableSyncError(err, `employees/${newAdminId}`));
          }
        }

        if (matched) {
          empUidMapRef.current[matched.id] = user.uid;
          const matchedSnapshot = matched;
          setEmployees((prev) => {
            const exists = prev.some((e) => e.id === matchedSnapshot.id);
            if (!exists) return [...prev, matchedSnapshot];
            return prev.map((e) =>
              e.id === matchedSnapshot.id
                ? {
                    ...e,
                    email: matchedSnapshot.email || e.email,
                    photoUrl: matchedSnapshot.photoUrl || e.photoUrl,
                  }
                : e
            );
          });

          let explicitLogout = false;
          let savedAuthId = '';
          try {
            explicitLogout = localStorage.getItem(STORAGE_KEYS.EXPLICIT_LOGOUT) === '1';
            savedAuthId = localStorage.getItem(STORAGE_KEYS.AUTH_USER_ID) || '';
          } catch {
            // ignore
          }

          const shouldSwitchPortalUser =
            forceUiLogin ||
            (!explicitLogout &&
              (!isAuthenticatedRef.current ||
                !currentUserRef.current.id ||
                !savedAuthId ||
                savedAuthId === matched.id));

          if (shouldSwitchPortalUser) {
            currentUserRef.current = matched;
            isAuthenticatedRef.current = true;
            setCurrentUser(matched);
            setIsAuthenticated(true);
            if (forceUiLogin) {
              setActiveNav('workspace');
            }
            try {
              localStorage.setItem(STORAGE_KEYS.AUTH_USER_ID, matched.id);
              localStorage.removeItem(STORAGE_KEYS.EXPLICIT_LOGOUT);
            } catch {
              // ignore
            }
          }

          if (user.emailVerified && !matchedViaBinding) {
            try {
              await linkGoogleUserProfile({
                uid: user.uid,
                email: user.email || matched.email,
                displayName: user.displayName || matched.nameBn || matched.name,
                employee: matched,
                isCloudAdmin: adminFlag,
              });
              await claimEmployeeAuthUidInFirestore(matched.id, user.uid);
            } catch (err) {
              setCloudSyncStatus('error');
              setCloudSyncError(extractReadableSyncError(err, `users/${user.uid}`));
            }
          }
          return matched;
        }

        // Strict whitelist enforcement: any Google email NOT added in "শিক্ষক ও স্টাফ" must be signed out immediately
        try {
          await firebaseGoogleLogout();
        } catch {
          // ignore sign-out cleanup error
        }
        setFirebaseUser(null);
        setHasDriveToken(false);
        setIsCloudAdmin(false);
        setCloudSyncStatus('disconnected');
        setCloudSyncError(null);
        return null;
      } finally {
        setFirebaseAuthReady(true);
      }
    },
    []
  );

  // Initialize Firebase Auth & check admin privileges
  useEffect(() => {
    const unsubscribe = initFirebaseAuth(async (user, driveTokenPresent) => {
      try {
        await applyFirebaseUserSession(user, driveTokenPresent);
      } catch (err) {
        if (!isBenignAbortError(err)) {
          console.error('Auth session error:', err);
        }
      }
    });

    return () => unsubscribe();
  }, [applyFirebaseUserSession]);

  // Attach real-time Firestore onSnapshot listeners when signed in via Google OR Portal ID/Password
  useEffect(() => {
    const canAttachCloudListeners =
      Boolean(firebaseUser) || (isAuthenticated && Boolean(currentUser.id));
    if (!hydrated || !firebaseAuthReady || !canAttachCloudListeners) return;

    const isPortalMode = !firebaseUser;
    const uid = firebaseUser
      ? firebaseUser.uid
      : `portal_${currentUser.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user'}`;
    const useFullCollectionQueries = isPortalMode || isCloudAdmin;
    const unsubs: Unsubscribe[] = [];
    let cancelled = false;

    const onListenerError = (path: string, error: unknown) => {
      if (cancelled || isBenignAbortError(error)) return;
      setCloudSyncStatus('error');
      setCloudSyncError(extractReadableSyncError(error, path));
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Error state already surfaced cleanly in UI banner
      }
    };

    const startSyncAndListeners = async () => {
      // Flush local edits made before cloud connected BEFORE listeners overwrite them
      if (hasPendingLocalChangesRef.current && !initialSeedAttemptedRef.current) {
        try {
          await pushAllLocalToFirestore();
          initialSeedAttemptedRef.current = true;
        } catch {
          // cloudSyncError state already populated; allow retry on next mount/reconnect
        }
      }

      if (cancelled) return;

      // For Google cloud admins, watch /users so newly signed-in colleagues get linked authUid & /admins docs automatically
      if (isCloudAdmin && !isPortalMode) {
        unsubs.push(
          onSnapshot(
            collection(db, 'users'),
            (snap) => {
              const nextMap: Record<string, string> = {};
              snap.docs.forEach((d) => {
                const data = d.data();
                const u = String(data.uid || d.id || '').trim();
                const empId = String(data.employeeId || '').trim();
                if (u && empId) nextMap[empId] = u;
              });
              empUidMapRef.current = { ...empUidMapRef.current, ...nextMap };
              syncLinkedUsersAndAdmins(stateRef.current.employees)
                .then((m) => {
                  empUidMapRef.current = { ...empUidMapRef.current, ...m };
                })
                .catch(() => {});
            },
            () => {
              // ignore users watch failure
            }
          )
        );
      }

      // Public calendar events
      const calQuery = useFullCollectionQueries
        ? collection(db, 'calendarEvents')
        : query(collection(db, 'calendarEvents'), where('isPublicCalendar', '==', true));
      unsubs.push(
        onSnapshot(
          calQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              const list = snap.docs
                .map((d) => {
                  const data = d.data();
                  return {
                    id: data.id || d.id,
                    title: data.title,
                    description: data.description,
                    category: data.category,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    timeLabel: data.timeLabel,
                    location: data.location,
                    department: data.department,
                    linkedMeetingId: data.linkedMeetingId,
                    createdBy: data.createdBy,
                    createdAt: toIsoStringSafe(data.createdAt, new Date().toISOString()),
                  } as CalendarEvent;
                })
                .sort((a, b) => a.startDate.localeCompare(b.startDate));
              setCalendarEvents(list);
            }
            setCloudSyncStatus('synced');
            setCloudSyncError(null);
            setCloudLastSyncedAt(new Date().toISOString());
          },
          (error) => {
            onListenerError('calendarEvents', error);
          }
        )
      );

      // Institutional settings
      unsubs.push(
        onSnapshot(
          doc(db, 'settings', 'attendancePolicy'),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setPolicy((prev) => ({
                ...prev,
                officeStartTime: data.officeStartTime ?? prev.officeStartTime,
                officeEndTime: data.officeEndTime ?? prev.officeEndTime,
                gracePeriodMinutes: data.gracePeriodMinutes ?? prev.gracePeriodMinutes,
                lateThresholdMinutes: data.lateThresholdMinutes ?? prev.lateThresholdMinutes,
                earlyLeaveThresholdMinutes:
                  data.earlyLeaveThresholdMinutes ?? prev.earlyLeaveThresholdMinutes,
                breakDurationMinutes: data.breakDurationMinutes ?? prev.breakDurationMinutes,
                weeklyHolidays: data.weeklyHolidays ?? prev.weeklyHolidays,
                specialDays: data.specialDays ?? prev.specialDays,
                campusLat: data.campusLat ?? prev.campusLat,
                campusLng: data.campusLng ?? prev.campusLng,
                geofenceRadiusMeters: data.geofenceRadiusMeters ?? prev.geofenceRadiusMeters,
                qrRotationSeconds: data.qrRotationSeconds ?? prev.qrRotationSeconds,
                requireGpsVerification: data.requireGpsVerification ?? prev.requireGpsVerification,
                autoSyncIntervalMinutes: data.autoSyncIntervalMinutes ?? prev.autoSyncIntervalMinutes,
                institutionLogoUrl: data.institutionLogoUrl ?? prev.institutionLogoUrl,
              }));
            }
          },
          (error) => {
            onListenerError('settings/attendancePolicy', error);
          }
        )
      );

      unsubs.push(
        onSnapshot(
          doc(db, 'settings', 'institutionalLeavePolicy'),
          (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setInstitutionalLeavePolicy((prev) => ({
                ...prev,
                year: data.year ?? prev.year,
                academicYearLabel: data.academicYearLabel ?? prev.academicYearLabel,
                casualLeaveEnabled: data.casualLeaveEnabled ?? prev.casualLeaveEnabled,
                casualLeaveDefault: data.casualLeaveDefault ?? prev.casualLeaveDefault,
                sickLeaveEnabled: data.sickLeaveEnabled ?? prev.sickLeaveEnabled,
                sickLeaveDefault: data.sickLeaveDefault ?? prev.sickLeaveDefault,
                earnedLeaveEnabled: data.earnedLeaveEnabled ?? prev.earnedLeaveEnabled,
                earnedLeaveDefault: data.earnedLeaveDefault ?? prev.earnedLeaveDefault,
                dutyLeaveEnabled: data.dutyLeaveEnabled ?? prev.dutyLeaveEnabled,
                hijriOffsetDays: data.hijriOffsetDays ?? prev.hijriOffsetDays,
                updatedBy: data.updatedBy ?? prev.updatedBy,
                updatedAt: toIsoStringSafe(data.updatedAt, prev.updatedAt || ''),
              }));
            }
          },
          (error) => {
            onListenerError('settings/institutionalLeavePolicy', error);
          }
        )
      );

      // Employees
      const empQuery = useFullCollectionQueries
        ? collection(db, 'employees')
        : query(collection(db, 'employees'), where('authUid', '==', uid));
      unsubs.push(
        onSnapshot(
          empQuery,
          async (snap) => {
            const isEffectiveAdmin =
              isCloudAdmin ||
              (isPortalMode && isAdministrativeRole(currentUserRef.current.role));
            if (
              snap.empty &&
              isEffectiveAdmin &&
              !initialSeedAttemptedRef.current &&
              stateRef.current.employees.length > 0
            ) {
              initialSeedAttemptedRef.current = true;
              try {
                await pushAllLocalToFirestore();
              } catch {
                // error surfaced cleanly
              }
              return;
            }
            if (snap.empty && isPortalMode && stateRef.current.employees.length > 0) {
              return;
            }
            cloudInitializedRef.current = true;
            const docsSnapshot = snap.docs;
            const privateContacts = await Promise.all(
              docsSnapshot.map(async (d) => {
                const empId = d.data().id || d.id;
                const info = await getEmployeePrivateContactInfo(empId);
                return [empId, info] as const;
              })
            );
            const privateMap = new Map(privateContacts);
            const prevById = new Map(stateRef.current.employees.map((e) => [e.id, e]));

            const mapped: Employee[] = docsSnapshot.map((d) => {
              const data = d.data();
              const empId = data.id || d.id;
              if (typeof data.authUid === 'string' && data.authUid) {
                empUidMapRef.current[empId] = data.authUid;
              }
              const old = prevById.get(empId);
              const priv = privateMap.get(empId);
              const rawEmail = priv?.email || old?.email || '';
              const rawPhone = priv?.phone || old?.phone || '';
              return {
                id: empId,
                name: data.name,
                nameBn: data.nameBn || data.name,
                email: rawEmail.endsWith('@portal.local') ? '' : rawEmail,
                phone: rawPhone === 'N/A' || rawPhone === '0000000000' ? '' : rawPhone,
                bloodGroup: priv?.bloodGroup || old?.bloodGroup,
                password: old?.password,
                photoUrl: data.photoUrl || old?.photoUrl || '',
                designation: data.designation,
                designationBn: data.designationBn || data.designation,
                department: data.department,
                employmentType: data.employmentType || 'পূর্ণকালীন',
                joiningDate: data.joiningDate || '2026-01-01',
                reportingToId: data.reportingToId,
                reportingToName: data.reportingToName,
                status: data.status || 'Active',
                attendanceMachineId: data.attendanceMachineId || '',
                shiftSchedule: data.shiftSchedule || '09:00 - 17:00',
                leavePolicy: data.leavePolicy || 'সাধারণ নীতিমালা',
                role: data.role || 'staff',
              } as Employee;
            });

            setEmployees(mapped);

            const curId = currentUserRef.current.id;
            const refreshedCur = curId ? mapped.find((m) => m.id === curId) : undefined;
            if (refreshedCur) {
              setCurrentUser(refreshedCur);
            } else if (!isAuthenticatedRef.current && firebaseUser?.emailVerified) {
              let explicitLogout = false;
              try {
                explicitLogout = localStorage.getItem(STORAGE_KEYS.EXPLICIT_LOGOUT) === '1';
              } catch {
                // ignore
              }
              if (!explicitLogout) {
                const emailLow = (firebaseUser.email || '').toLowerCase();
                const byAuth =
                  mapped.find((m) => empUidMapRef.current[m.id] === uid) ||
                  mapped.find((m) => m.email.toLowerCase() === emailLow);
                if (byAuth) {
                  currentUserRef.current = byAuth;
                  isAuthenticatedRef.current = true;
                  setCurrentUser(byAuth);
                  setIsAuthenticated(true);
                  try {
                    localStorage.setItem(STORAGE_KEYS.AUTH_USER_ID, byAuth.id);
                  } catch {
                    // ignore
                  }
                }
              }
            }
          },
          (error) => {
            onListenerError('employees', error);
          }
        )
      );

      // Attendance Records
      const attQuery = useFullCollectionQueries
        ? collection(db, 'attendanceRecords')
        : query(collection(db, 'attendanceRecords'), where('ownerUid', '==', uid));
      unsubs.push(
        onSnapshot(
          attQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              const list = snap.docs.map((d) => d.data() as DailyAttendanceRecord);
              setAttendanceRecords(list);
            }
          },
          (error) => {
            onListenerError('attendanceRecords', error);
          }
        )
      );

      // Corrections
      const corrQuery = useFullCollectionQueries
        ? collection(db, 'corrections')
        : query(collection(db, 'corrections'), where('ownerUid', '==', uid));
      unsubs.push(
        onSnapshot(
          corrQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              setCorrections(snap.docs.map((d) => d.data() as AttendanceCorrectionRequest));
            }
          },
          (error) => {
            onListenerError('corrections', error);
          }
        )
      );

      // Leave Balances
      const balQuery = useFullCollectionQueries
        ? collection(db, 'leaveBalances')
        : query(collection(db, 'leaveBalances'), where('ownerUid', '==', uid));
      unsubs.push(
        onSnapshot(
          balQuery,
          (snap) => {
            if (!snap.empty) {
              const map: Record<string, LeaveBalance> = {};
              snap.docs.forEach((d) => {
                const bal = d.data() as LeaveBalance;
                map[bal.employeeId || d.id] = bal;
              });
              setLeaveBalances((prev) => ({ ...prev, ...map }));
            }
          },
          (error) => {
            onListenerError('leaveBalances', error);
          }
        )
      );

      // Leave Applications
      const leaveQuery = useFullCollectionQueries
        ? collection(db, 'leaveApplications')
        : query(collection(db, 'leaveApplications'), where('ownerUid', '==', uid));
      unsubs.push(
        onSnapshot(
          leaveQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              setLeaveApplications(snap.docs.map((d) => d.data() as LeaveApplication));
            }
          },
          (error) => {
            onListenerError('leaveApplications', error);
          }
        )
      );

      // Action Tracker Items (with Google Drive submissionFiles)
      const trackerQuery = useFullCollectionQueries
        ? collection(db, 'actionTrackerItems')
        : query(collection(db, 'actionTrackerItems'), where('assigneeUids', 'array-contains', uid));
      unsubs.push(
        onSnapshot(
          trackerQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              const list = snap.docs
                .map((d) => {
                  const data = d.data();
                  return {
                    ...data,
                    createdAt: toIsoStringSafe(data.createdAt, new Date().toISOString()),
                  } as ActionTrackerItem;
                })
                .sort((a, b) => (a.serialNo || 0) - (b.serialNo || 0));
              setActionTrackerItems(list);
            }
          },
          (error) => {
            onListenerError('actionTrackerItems', error);
          }
        )
      );

      // Meetings
      const meetingQuery = useFullCollectionQueries
        ? collection(db, 'meetings')
        : query(collection(db, 'meetings'), where('participantUids', 'array-contains', uid));
      unsubs.push(
        onSnapshot(
          meetingQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              setMeetings(
                snap.docs.map((d) => ({
                  ...(d.data() as Meeting),
                  createdAt: toIsoStringSafe(d.data().createdAt, new Date().toISOString()),
                }))
              );
            }
          },
          (error) => {
            onListenerError('meetings', error);
          }
        )
      );

      // Tasks
      const taskQuery = useFullCollectionQueries
        ? collection(db, 'tasks')
        : query(collection(db, 'tasks'), where('assigneeUid', '==', uid));
      unsubs.push(
        onSnapshot(
          taskQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              setTasks(
                snap.docs.map((d) => ({
                  ...(d.data() as TaskItem),
                  createdAt: toIsoStringSafe(d.data().createdAt, new Date().toISOString()),
                }))
              );
            }
          },
          (error) => {
            onListenerError('tasks', error);
          }
        )
      );

      // Notifications
      const notifQuery = useFullCollectionQueries
        ? collection(db, 'notifications')
        : query(collection(db, 'notifications'), where('recipientUid', '==', uid));
      unsubs.push(
        onSnapshot(
          notifQuery,
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              setNotifications(
                snap.docs.map((d) => ({
                  ...(d.data() as InAppNotification),
                  createdAt: toIsoStringSafe(d.data().createdAt, new Date().toISOString()),
                }))
              );
            }
          },
          (error) => {
            onListenerError('notifications', error);
          }
        )
      );

      // Chat Conversations (Real-time internal personal & group threads)
      unsubs.push(
        onSnapshot(
          collection(db, 'chatConversations'),
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              const list = snap.docs.map((d) => {
                const data = d.data();
                return {
                  ...(data as ChatConversation),
                  id: String(data.id || d.id),
                  participantEmployeeIds: Array.isArray(data.participantEmployeeIds)
                    ? data.participantEmployeeIds
                    : [],
                  createdAt: toIsoStringSafe(data.createdAt, new Date().toISOString()),
                  updatedAt: toIsoStringSafe(data.updatedAt, new Date().toISOString()),
                } as ChatConversation;
              });
              setChatConversations((prev) => {
                const byId = new Map<string, ChatConversation>();
                prev.forEach((c) => byId.set(c.id, c));
                list.forEach((c) => byId.set(c.id, c));
                return Array.from(byId.values());
              });
            }
          },
          (error) => {
            onListenerError('chatConversations', error);
          }
        )
      );

      // Chat Messages (Real-time message stream)
      unsubs.push(
        onSnapshot(
          collection(db, 'chatMessages'),
          (snap) => {
            if (!snap.empty || cloudInitializedRef.current) {
              const cloudList = snap.docs.map((d) => {
                const data = d.data();
                return {
                  ...(data as ChatMessage),
                  id: String(data.id || d.id),
                  readByEmployeeIds: Array.isArray(data.readByEmployeeIds)
                    ? data.readByEmployeeIds
                    : [],
                  createdAt: toIsoStringSafe(data.createdAt, new Date().toISOString()),
                } as ChatMessage;
              });
              setChatMessages((prev) => {
                const prevMap = new Map<string, ChatMessage>();
                prev.forEach((m) => prevMap.set(m.id, m));
                const merged = cloudList.map((cloudMsg) => {
                  const localMsg = prevMap.get(cloudMsg.id);
                  if (!localMsg) return cloudMsg;
                  const mergedReadBy = Array.from(
                    new Set([
                      ...(cloudMsg.readByEmployeeIds || []),
                      ...(localMsg.readByEmployeeIds || []),
                    ])
                  );
                  return {
                    ...cloudMsg,
                    createdAt: cloudMsg.createdAt || localMsg.createdAt,
                    readByEmployeeIds: mergedReadBy,
                  };
                });
                return merged.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
              });
            }
          },
          (error) => {
            onListenerError('chatMessages', error);
          }
        )
      );

      // Admin Audit Logs
      if (useFullCollectionQueries) {
        unsubs.push(
          onSnapshot(
            collection(db, 'auditLogs'),
            (snap) => {
              if (!snap.empty || cloudInitializedRef.current) {
                const list = snap.docs
                  .map((d) => d.data() as AuditLog)
                  .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
                setAuditLogs(list);
              }
            },
            (error) => {
              onListenerError('auditLogs', error);
            }
          )
        );
      }
    };

    const startTimer = setTimeout(() => {
      if (!cancelled) {
        void startSyncAndListeners().catch((err) => {
          if (!isBenignAbortError(err)) {
            console.error('Firestore listener startup error:', err);
          }
        });
      }
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // Ignore teardown errors
        }
      });
    };
  }, [
    hydrated,
    firebaseAuthReady,
    firebaseUser,
    isCloudAdmin,
    isAuthenticated,
    currentUser.id,
    pushAllLocalToFirestore,
  ]);

  // Automatic Admin portalCredentials backfill so ID/Password works seamlessly on every other browser
  useEffect(() => {
    const canAdminSync =
      hydrated &&
      firebaseAuthReady &&
      (isCloudAdmin ||
        (!firebaseUser && isAuthenticated && isAdministrativeRole(currentUser.role)));
    if (!canAdminSync || employees.length === 0) return;

    const currentAuthUser = auth.currentUser;
    const writerUid = currentAuthUser?.emailVerified
      ? currentAuthUser.uid
      : !currentAuthUser && isAuthenticated && currentUser.id
      ? `portal_${currentUser.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user'}`
      : null;
    if (!writerUid) return;

    const pendingEmployees = employees.filter((emp) => {
      const pwd = emp.password?.trim();
      if (!pwd) return false;
      const digest = `${emp.id}|${emp.email || ''}|${emp.phone || ''}|${emp.role}|${emp.nameBn || ''}|${emp.name || ''}|${pwd}`;
      return syncedCredDigestRef.current.get(emp.id) !== digest;
    });
    if (pendingEmployees.length === 0) return;

    let cancelled = false;
    const backfill = async () => {
      for (const emp of pendingEmployees) {
        if (cancelled) break;
        const pwd = emp.password!.trim();
        const digest = `${emp.id}|${emp.email || ''}|${emp.phone || ''}|${emp.role}|${emp.nameBn || ''}|${emp.name || ''}|${pwd}`;
        try {
          await syncPortalCredentialsForEmployee(emp, writerUid, false);
          syncedCredDigestRef.current.set(emp.id, digest);
          try {
            localStorage.setItem(
              STORAGE_KEYS.SYNCED_CRED_DIGESTS,
              JSON.stringify(Object.fromEntries(syncedCredDigestRef.current.entries()))
            );
          } catch {
            // ignore storage errors
          }
        } catch (err) {
          if (!cancelled && !isBenignAbortError(err)) {
            const msg = extractReadableSyncError(err, `portalCredentials/${emp.id}`);
            setCloudSyncStatus('error');
            setCloudSyncError(msg);
          }
          break;
        }
      }
    };
    void backfill();

    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    firebaseAuthReady,
    isCloudAdmin,
    firebaseUser,
    isAuthenticated,
    currentUser.id,
    currentUser.role,
    employees,
  ]);

  // Save local state fallback to localStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(attendanceRecords));
      localStorage.setItem(STORAGE_KEYS.RAW_PUNCHES, JSON.stringify(rawPunches));
      localStorage.setItem(STORAGE_KEYS.CORRECTIONS, JSON.stringify(corrections));
      localStorage.setItem(STORAGE_KEYS.POLICY, JSON.stringify(policy));
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
      localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(leaveApplications));
      localStorage.setItem(STORAGE_KEYS.LEAVE_BALANCES, JSON.stringify(leaveBalances));
      localStorage.setItem(STORAGE_KEYS.LEAVE_POLICY, JSON.stringify(institutionalLeavePolicy));
      localStorage.setItem(STORAGE_KEYS.CALENDAR_EVENTS, JSON.stringify(calendarEvents));
      localStorage.setItem(STORAGE_KEYS.MEETINGS, JSON.stringify(meetings));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
      localStorage.setItem(STORAGE_KEYS.ACTION_TRACKER, JSON.stringify(actionTrackerItems));
      localStorage.setItem(STORAGE_KEYS.CHAT_CONVERSATIONS, JSON.stringify(chatConversations));
      localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(chatMessages));
    } catch {
      // Ignore quota errors
    }
  }, [
    hydrated,
    employees,
    attendanceRecords,
    rawPunches,
    corrections,
    policy,
    auditLogs,
    leaveApplications,
    leaveBalances,
    institutionalLeavePolicy,
    calendarEvents,
    meetings,
    notifications,
    actionTrackerItems,
    chatConversations,
    chatMessages,
  ]);

  // Cross-tab instant chat synchronization (supports read receipts & live replies across tabs even offline)
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      try {
        if (e.key === STORAGE_KEYS.CHAT_MESSAGES && e.newValue) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setChatMessages(parsed as ChatMessage[]);
          }
        } else if (e.key === STORAGE_KEYS.CHAT_CONVERSATIONS && e.newValue) {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setChatConversations(parsed as ChatConversation[]);
          }
        }
      } catch {
        // Ignore malformed storage payload
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [hydrated]);

  // Sync dark class on html
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const signInWithGoogleAccount = async () => {
    const res = await googleSignInBasic();
    if (res) {
      const matchedEmployee = await applyFirebaseUserSession(res.user, false, true);
      return {
        user: res.user,
        matchedEmployee,
        unauthorizedEmail: !matchedEmployee ? res.user.email || '' : undefined,
      };
    }
    return null;
  };

  const connectGoogleWorkspace = async () => {
    const res = await googleSignInWithDrive();
    if (res) {
      const matchedEmployee = await applyFirebaseUserSession(
        res.user,
        Boolean(res.accessToken),
        true
      );
      return {
        ...res,
        matchedEmployee,
        unauthorizedEmail: !matchedEmployee ? res.user.email || '' : undefined,
      };
    }
    return null;
  };

  const disconnectGoogleWorkspace = async () => {
    await firebaseGoogleLogout();
    setFirebaseUser(null);
    setHasDriveToken(false);
    setIsCloudAdmin(false);
    setCloudSyncStatus('disconnected');
  };

  const logAudit = (
    action: string,
    module: AuditLog['module'],
    details: string,
    meta?: {
      beforeValue?: string;
      afterValue?: string;
      reason?: string;
      targetEmployeeId?: string;
      targetDate?: string;
    }
  ) => {
    const actor = currentUserRef.current?.id ? currentUserRef.current : currentUser;
    const actorId = actor.id?.trim() || 'SYSTEM';
    const actorName = actor.nameBn || actor.name || actorId;
    const actorRole = actor.role || 'staff';

    const newLog: AuditLog = {
      id: `AUD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actorRole,
      action,
      module,
      details,
      beforeValue: meta?.beforeValue,
      afterValue: meta?.afterValue,
      reason: meta?.reason,
      targetEmployeeId: meta?.targetEmployeeId,
      targetDate: meta?.targetDate,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
    const writerUid = resolveActiveWriterUid();
    if (writerUid) {
      syncAuditLogToFirestore(newLog, writerUid).catch((err) => {
        setCloudSyncError(extractReadableSyncError(err, `auditLogs/${newLog.id}`));
      });
    }
  };

  const sendNotification = useCallback(
    (notifData: Omit<InAppNotification, 'id' | 'createdAt' | 'isRead'>) => {
      const newNotif: InAppNotification = {
        ...notifData,
        id: `NOTIF-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      setNotifications((prev) => [newNotif, ...prev]);
      const currentAuth = auth.currentUser;
      const writerUid = currentAuth?.emailVerified
        ? currentAuth.uid
        : !currentAuth && isAuthenticatedRef.current && currentUserRef.current?.id
        ? `portal_${currentUserRef.current.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user'}`
        : null;
      if (writerUid) {
        const recipientUid =
          empUidMapRef.current[newNotif.recipientEmployeeId] || writerUid;
        runCloudWrite(
          () => syncNotificationToFirestore(newNotif, writerUid, recipientUid),
          `notifications/${newNotif.id}`
        );
      } else {
        markPendingLocalChange();
      }
    },
    [runCloudWrite, markPendingLocalChange]
  );

  const login = async (identifier: string, passcode?: string): Promise<boolean> => {
    const cleanInput = identifier.trim().toLowerCase();
    const cleanDigits = identifier.replace(/[\s\-+]/g, '');

    const completeLogin = async (emp: Employee) => {
      // Ensure a leftover Google session for a different account doesn't hijack portal Firestore writes
      if (auth.currentUser) {
        const authEmail = (auth.currentUser.email || '').trim().toLowerCase();
        const empEmail = (emp.email || '').trim().toLowerCase();
        if (!empEmail || authEmail !== empEmail) {
          try {
            await firebaseGoogleLogout();
          } catch {
            // ignore sign-out cleanup error
          }
          setFirebaseUser(null);
          setHasDriveToken(false);
          setIsCloudAdmin(false);
        }
      }
      currentUserRef.current = emp;
      isAuthenticatedRef.current = true;
      setCurrentUser(emp);
      setIsAuthenticated(true);
      setActiveNav('workspace');
      try {
        localStorage.setItem(STORAGE_KEYS.AUTH_USER_ID, emp.id);
        localStorage.removeItem(STORAGE_KEYS.EXPLICIT_LOGOUT);
      } catch {
        // ignore
      }
      logAudit('LOGIN', 'System', `${emp.nameBn || emp.name} (${emp.id}) লগইন করেছেন`);
    };

    // 1) Fast local match ONLY when this browser already holds a verified explicit password for that user
    const localEmp = employees.find((e) => {
      const idMatch = e.id.toLowerCase() === cleanInput;
      const emailMatch = e.email.toLowerCase() === cleanInput;
      const empPhoneDigits = e.phone.replace(/[\s\-+]/g, '');
      const phoneMatch =
        cleanDigits.length >= 6 &&
        (empPhoneDigits === cleanDigits || empPhoneDigits.endsWith(cleanDigits));
      return idMatch || emailMatch || phoneMatch;
    });

    if (localEmp) {
      if (passcode === undefined) {
        await completeLogin(localEmp);
        return true;
      }
      const expectedPassword = localEmp.password?.trim();
      if (expectedPassword && passcode.trim() === expectedPassword) {
        await completeLogin(localEmp);
        return true;
      }
    }

    // 2) Cross-device cloud credential hash lookup (works on any fresh browser without Admin logging in first!)
    if (passcode !== undefined && passcode.trim().length > 0) {
      const cred = await lookupPortalCredential(identifier, passcode);
      if (cred.status === 'error') {
        if (cred.errorCode === 'permission-denied') {
          throw new Error(
            'Firestore Security Rules (firestore.rules) এখনো আপনার Firebase প্রজেক্টে ডেপ্লয় করা হয়নি অথবা অনুমতি নেই। অনুগ্রহ করে অ্যাডমিন পিসি থেকে firebase deploy --only firestore:rules চালান।'
          );
        }
        throw new Error(
          'Firestore সার্ভারের সাথে সংযোগ করতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
        );
      }
      if (cred.status === 'found') {
        const remoteEmp = await fetchEmployeeFromFirestoreById(cred.employeeId);
        const resolvedEmp: Employee = remoteEmp
          ? { ...remoteEmp, password: passcode.trim() }
          : {
              id: cred.employeeId,
              name: cred.displayName || cred.employeeId,
              nameBn: cred.displayName || cred.employeeId,
              email: cleanInput.includes('@') ? identifier.trim() : '',
              phone: '',
              password: passcode.trim(),
              photoUrl: '',
              designation: 'Member',
              designationBn: 'সদস্য',
              department: 'প্রশাসন',
              employmentType: 'পূর্ণকালীন',
              joiningDate: getDhakaDateTime().dateStr,
              status: 'Active',
              attendanceMachineId: '',
              shiftSchedule: '09:00 - 17:00',
              leavePolicy: 'সাধারণ নীতিমালা',
              role: cred.role || 'teacher',
            };

        setEmployees((prev) =>
          prev.some((e) => e.id === resolvedEmp.id)
            ? prev.map((e) => (e.id === resolvedEmp.id ? { ...e, ...resolvedEmp } : e))
            : [...prev, resolvedEmp]
        );
        await completeLogin(resolvedEmp);
        return true;
      }
    }

    return false;
  };

  const logout = () => {
    logAudit('LOGOUT', 'System', `${currentUser.nameBn || currentUser.name} (${currentUser.id}) লগআউট করেছেন`);
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER_ID);
      localStorage.setItem(STORAGE_KEYS.EXPLICIT_LOGOUT, '1');
    } catch {
      // ignore
    }
    isAuthenticatedRef.current = false;
    currentUserRef.current = EMPTY_GUEST_USER;
    setIsAuthenticated(false);
    setCurrentUser(EMPTY_GUEST_USER);
  };

  const getEmployeeLeaveOnDate = (employeeId: string, date: string): LeaveApplication | undefined => {
    return leaveApplications.find(
      (app) =>
        app.employeeId === employeeId &&
        app.status === 'Approved' &&
        app.startDate <= date &&
        app.endDate >= date
    );
  };

  const evaluateAttendanceMetrics = (
    firstInTime: string | undefined,
    lastOutTime: string | undefined,
    sessions: PunchSession[],
    empId: string,
    dateStr: string
  ): {
    status: AttendanceStatus;
    lateDurationMinutes: number;
    earlyLeaveMinutes: number;
    totalWorkingDurationMinutes: number;
    isCurrentlyIn: boolean;
    isMissingPunch: boolean;
  } => {
    const approvedLeave = getEmployeeLeaveOnDate(empId, dateStr);
    const isCurrentlyIn = sessions.some((s) => !s.outTime);

    let totalWorkingDurationMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    if (totalWorkingDurationMinutes === 0 && firstInTime && lastOutTime && !isCurrentlyIn) {
      const inMin = parseTimeToMinutes(firstInTime);
      const outMin = parseTimeToMinutes(lastOutTime);
      if (outMin > inMin) {
        totalWorkingDurationMinutes = outMin - inMin;
      }
    }

    let lateDurationMinutes = 0;
    let status: AttendanceStatus = 'Absent';

    if (firstInTime) {
      const inMin = parseTimeToMinutes(firstInTime);
      const startMin = parseTimeToMinutes(policy.officeStartTime);
      const graceLimit = startMin + policy.gracePeriodMinutes;
      if (inMin > graceLimit) {
        lateDurationMinutes = inMin - startMin;
        status = 'Late';
      } else {
        status = 'Present';
      }
    } else if (approvedLeave) {
      status = 'Leave';
    }

    let earlyLeaveMinutes = 0;
    if (lastOutTime && !isCurrentlyIn) {
      const outMin = parseTimeToMinutes(lastOutTime);
      const endMin = parseTimeToMinutes(policy.officeEndTime);
      const earlyLimit = endMin - policy.earlyLeaveThresholdMinutes;
      if (outMin < earlyLimit) {
        earlyLeaveMinutes = endMin - outMin;
      }
    }

    const isMissingPunch = Boolean(firstInTime && !lastOutTime);

    return {
      status,
      lateDurationMinutes,
      earlyLeaveMinutes,
      totalWorkingDurationMinutes,
      isCurrentlyIn,
      isMissingPunch,
    };
  };

  const executeVerifiedPunch = async (params: VerifiedPunchParams): Promise<VerifiedPunchResult> => {
    const { employeeId, punchType, lat, lng, accuracy, qrToken, isMocked } = params;
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) {
      return { ok: false, message: 'কর্মকর্তা বা শিক্ষকের তথ্য পাওয়া যায়নি।' };
    }

    const dhakaNow = getDhakaDateTime();
    const existingRecord = attendanceRecords.find(
      (r) => r.employeeId === employeeId && r.date === dhakaNow.dateStr
    );
    const currentSessions = existingRecord?.sessions || [];
    const hasOpenSession = currentSessions.some((s) => !s.outTime);

    if (punchType === 'IN' && hasOpenSession) {
      return {
        ok: false,
        code: 'ALREADY_PUNCHED_IN',
        message: 'আপনি ইতিমধ্যে Punch In অবস্থায় আছেন। পুনরায় Punch In করার আগে অবশ্যই Punch Out করতে হবে।',
      };
    }
    if (punchType === 'OUT' && !hasOpenSession) {
      return {
        ok: false,
        code: 'NOT_PUNCHED_IN',
        message: 'আপনি এখনো Punch In করেননি। Punch Out করার আগে অবশ্যই Punch In করতে হবে।',
      };
    }

    const recentRaw = rawPunches.find(
      (p) =>
        p.employeeId === employeeId &&
        Math.abs(new Date(p.timestamp).getTime() - Date.now()) < 10000
    );
    if (recentRaw) {
      return {
        ok: false,
        code: 'DUPLICATE_SIMULTANEOUS',
        message: 'একই সময়ে একাধিকবার Punch গ্রহণ করা যাবে না। অনুগ্রহ করে কয়েক সেকেন্ড অপেক্ষা করুন।',
      };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const pendingRaw: RawPunchEvent = {
        id: `RAW-PEND-${Date.now().toString().slice(-6)}`,
        machineId: 'MOBILE-GPS-QR',
        employeeId: emp.id,
        attendanceMachineId: emp.attendanceMachineId,
        timestamp: new Date().toISOString(),
        punchDate: dhakaNow.dateStr,
        punchTime: dhakaNow.timeStr,
        punchType,
        verificationType: 'Mobile_GPS_QR',
        deviceId,
        syncStatus: 'pending',
        lat,
        lng,
        qrTokenUsed: qrToken,
      };
      setRawPunches((prev) => [pendingRaw, ...prev]);
      logAudit(
        'OFFLINE_PUNCH_QUEUED',
        'Attendance',
        `অফলাইন অবস্থায় ${emp.nameBn || emp.name}-এর ${punchType} অনুরোধ Pending হিসেবে সংরক্ষিত হয়েছে।`
      );
      return {
        ok: true,
        isOfflinePending: true,
        message:
          'ইন্টারনেট সংযোগ নেই। আপনার Punch টি Pending হিসেবে সংরক্ষিত হয়েছে। অনলাইনে সংযুক্ত হলে সার্ভার যাচাইয়ের পর উপস্থিতি নিশ্চিত হবে।',
      };
    }

    try {
      const data = verifyAttendancePunchClient({
        employeeId: emp.id,
        punchType,
        deviceId,
        gps: {
          lat,
          lng,
          accuracy,
          isMocked,
          timestamp: Date.now(),
        },
        qrInput: qrToken,
        policyConfig: {
          campusLat: policy.campusLat,
          campusLng: policy.campusLng,
          geofenceRadiusMeters: policy.geofenceRadiusMeters,
          qrRotationSeconds: policy.qrRotationSeconds,
          requireGpsVerification: policy.requireGpsVerification,
        },
      });

      if (!data.ok || !data.verification) {
        logAudit(
          'PUNCH_VERIFICATION_REJECTED',
          'Attendance',
          `${emp.nameBn || emp.name} (${emp.id})-এর ${punchType} ব্যর্থ: ${data.error || 'Verification failed'}`
        );
        return {
          ok: false,
          code: data.code,
          distanceMeters: data.distanceMeters,
          message: data.error || 'উপস্থিতি যাচাই ব্যর্থ হয়েছে।',
        };
      }

      const { serverDate, serverTime, shortTime, distanceMeters } = data.verification;
      const nowIso = new Date().toISOString();

      const verifiedRaw: RawPunchEvent = {
        id: `RAW-${Date.now().toString().slice(-6)}`,
        machineId: 'MOBILE-GPS-QR',
        employeeId: emp.id,
        attendanceMachineId: emp.attendanceMachineId,
        timestamp: nowIso,
        punchDate: serverDate,
        punchTime: serverTime,
        punchType,
        verificationType: 'Mobile_GPS_QR',
        deviceId,
        syncStatus: 'synced',
        lat,
        lng,
        distanceMeters,
        qrTokenUsed: qrToken,
      };
      setRawPunches((prev) => [verifiedRaw, ...prev]);
      runCloudWrite(
        () => syncRawPunchToFirestore(verifiedRaw, activeUid || auth.currentUser?.uid || ''),
        `rawPunches/${verifiedRaw.id}`
      );

      let updatedSessions: PunchSession[] = [];
      let firstInTime = existingRecord?.firstInTime;
      let lastOutTime = existingRecord?.lastOutTime;

      if (punchType === 'IN') {
        const newSession: PunchSession = {
          id: `SES-${Date.now().toString().slice(-6)}`,
          inTime: shortTime,
          inTimestamp: nowIso,
          inLocation: { lat, lng, distanceMeters },
          inDeviceId: deviceId,
          verificationStatus: 'Verified',
        };
        updatedSessions = [...currentSessions, newSession];
        if (!firstInTime) {
          firstInTime = shortTime;
        }
      } else {
        updatedSessions = currentSessions.map((s) => {
          if (!s.outTime) {
            const inMin = parseTimeToMinutes(s.inTime);
            const outMin = parseTimeToMinutes(shortTime);
            const duration = Math.max(1, outMin >= inMin ? outMin - inMin : 1);
            return {
              ...s,
              outTime: shortTime,
              outTimestamp: nowIso,
              outLocation: { lat, lng, distanceMeters },
              outDeviceId: deviceId,
              durationMinutes: duration,
              verificationStatus: 'Verified',
            };
          }
          return s;
        });
        lastOutTime = shortTime;
      }

      const metrics = evaluateAttendanceMetrics(firstInTime, lastOutTime, updatedSessions, emp.id, serverDate);

      let savedRecord: DailyAttendanceRecord;
      if (existingRecord) {
        savedRecord = {
          ...existingRecord,
          firstInTime,
          lastOutTime,
          sessions: updatedSessions,
          totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
          lateDurationMinutes: metrics.lateDurationMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          status: metrics.status,
          isCurrentlyIn: metrics.isCurrentlyIn,
          isMissingPunch: metrics.isMissingPunch,
          verificationStatus: 'Verified',
          deviceId,
          remarks:
            punchType === 'IN'
              ? `Dynamic QR যাচাইকৃত প্রবেশ (${shortTime})`
              : `Dynamic QR যাচাইকৃত প্রস্থান (${shortTime})`,
        };
        setAttendanceRecords((prev) => prev.map((r) => (r.id === existingRecord.id ? savedRecord : r)));
      } else {
        savedRecord = {
          id: `ATT-${Date.now().toString().slice(-6)}`,
          employeeId: emp.id,
          employeeName: emp.nameBn || emp.name,
          department: emp.department,
          date: serverDate,
          firstInTime,
          lastOutTime,
          sessions: updatedSessions,
          totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
          breakDurationMinutes: policy.breakDurationMinutes,
          lateDurationMinutes: metrics.lateDurationMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          status: metrics.status,
          isCurrentlyIn: metrics.isCurrentlyIn,
          isMissingPunch: metrics.isMissingPunch,
          verificationStatus: 'Verified',
          deviceId,
          remarks: `Dynamic QR যাচাইকৃত প্রবেশ (${shortTime})`,
        };
        setAttendanceRecords((prev) => [savedRecord, ...prev]);
      }

      runCloudWrite(
        () => syncAttendanceRecordToFirestore(savedRecord, activeUid || auth.currentUser?.uid || ''),
        `attendanceRecords/${savedRecord.id}`
      );

      if (punchType === 'IN') {
        sendNotification({
          recipientEmployeeId: emp.id,
          recipientName: emp.nameBn || emp.name,
          senderEmployeeId: 'SYSTEM',
          senderName: 'উপস্থিতি সিস্টেম',
          title: `Punch In সফল হয়েছে (${shortTime})`,
          message: `আপনার আজকের প্রবেশ (${serverDate}, সময়: ${shortTime}) Dynamic QR যাচাইয়ের মাধ্যমে নিশ্চিত করা হয়েছে।`,
          linkType: 'notice',
          priority: 'normal',
        });

        if (metrics.lateDurationMinutes > 0 && updatedSessions.length === 1) {
          sendNotification({
            recipientEmployeeId: emp.id,
            recipientName: emp.nameBn || emp.name,
            senderEmployeeId: 'SYSTEM',
            senderName: 'উপস্থিতি সিস্টেম',
            title: `বিলম্বে প্রবেশ (Late Entry: ${metrics.lateDurationMinutes} মিনিট)`,
            message: `অফিস শুরুর নির্ধারিত সময় (${policy.officeStartTime}, গ্রেস পিরিয়ড ${policy.gracePeriodMinutes} মি.) অতিক্রম হওয়ায় আপনার উপস্থিতি Late Entry হিসেবে রেকর্ড হয়েছে।`,
            linkType: 'notice',
            priority: 'urgent',
          });
        }
      } else {
        const hrs = Math.floor(metrics.totalWorkingDurationMinutes / 60);
        const mins = metrics.totalWorkingDurationMinutes % 60;
        sendNotification({
          recipientEmployeeId: emp.id,
          recipientName: emp.nameBn || emp.name,
          senderEmployeeId: 'SYSTEM',
          senderName: 'উপস্থিতি সিস্টেম',
          title: `Punch Out সফল হয়েছে (${shortTime})`,
          message: `আপনার প্রস্থান (${shortTime}) সফলভাবে রেকর্ড হয়েছে। আজকের মোট কর্মঘণ্টা: ${hrs} ঘণ্টা ${mins} মিনিট।${
            metrics.earlyLeaveMinutes > 0 ? ` (নির্ধারিত সময়ের ${metrics.earlyLeaveMinutes} মিনিট পূর্বে প্রস্থান)` : ''
          }`,
          linkType: 'notice',
          priority: 'normal',
        });
      }

      logAudit(
        punchType === 'IN' ? 'PUNCH_IN_VERIFIED' : 'PUNCH_OUT_VERIFIED',
        'Attendance',
        `${emp.nameBn || emp.name} (${emp.id}) ${punchType} সম্পন্ন করেছেন (সময়: ${shortTime}, ডিভাইস: ${deviceId})`
      );

      return {
        ok: true,
        serverTime: shortTime,
        distanceMeters,
        message:
          punchType === 'IN'
            ? `আলহামদুলিল্লাহ! আপনার Punch In (${shortTime}) সফলভাবে রেকর্ড হয়েছে।`
            : `আলহামদুলিল্লাহ! আপনার Punch Out (${shortTime}) সফলভাবে রেকর্ড হয়েছে।`,
      };
    } catch {
      return {
        ok: false,
        message: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি। আপনার ইন্টারনেট সংযোগ পরীক্ষা করুন।',
      };
    }
  };

  const syncOfflinePunches = async (): Promise<number> => {
    const pendingList = rawPunches.filter((p) => p.syncStatus === 'pending');
    if (pendingList.length === 0) return 0;

    let syncedCount = 0;
    for (const item of pendingList) {
      if (item.lat !== undefined && item.lng !== undefined && item.qrTokenUsed) {
        const res = await executeVerifiedPunch({
          employeeId: item.employeeId,
          punchType: item.punchType === 'IN' ? 'IN' : 'OUT',
          lat: item.lat,
          lng: item.lng,
          qrToken: item.qrTokenUsed,
        });
        if (res.ok && !res.isOfflinePending) {
          syncedCount++;
          setRawPunches((prev) => prev.filter((p) => p.id !== item.id));
        }
      }
    }
    return syncedCount;
  };

  const adminEditAttendanceRecord = (params: AdminEditAttendanceParams) => {
    const { employeeId, date, firstInTime, lastOutTime, status, reason } = params;
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;

    const existing = attendanceRecords.find((r) => r.employeeId === employeeId && r.date === date);
    const beforeValue = existing
      ? `Status: ${existing.status}, In: ${existing.firstInTime || 'N/A'}, Out: ${existing.lastOutTime || 'N/A'}`
      : 'কোনো রেকর্ড ছিল না (Absent)';
    const afterValue = `Status: ${status}, In: ${firstInTime || 'N/A'}, Out: ${lastOutTime || 'N/A'}`;

    const sessions: PunchSession[] =
      firstInTime
        ? [
            {
              id: `SES-ADM-${Date.now().toString().slice(-5)}`,
              inTime: firstInTime,
              inTimestamp: new Date().toISOString(),
              outTime: lastOutTime,
              outTimestamp: lastOutTime ? new Date().toISOString() : undefined,
              durationMinutes:
                firstInTime && lastOutTime
                  ? Math.max(0, parseTimeToMinutes(lastOutTime) - parseTimeToMinutes(firstInTime))
                  : 0,
              verificationStatus: 'Manual_Approved',
            },
          ]
        : [];

    const metrics = evaluateAttendanceMetrics(firstInTime, lastOutTime, sessions, employeeId, date);

    const updatedRec: DailyAttendanceRecord = existing
      ? {
          ...existing,
          firstInTime,
          lastOutTime,
          sessions,
          status,
          totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
          lateDurationMinutes: metrics.lateDurationMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          isCurrentlyIn: Boolean(firstInTime && !lastOutTime),
          isMissingPunch: Boolean(firstInTime && !lastOutTime),
          verificationStatus: 'Manual_Approved',
          remarks: `এডমিন কর্তৃক সংশোধিত (${currentUser.nameBn || currentUser.name}): ${reason}`,
        }
      : {
          id: `ATT-${Date.now().toString().slice(-6)}`,
          employeeId: emp.id,
          employeeName: emp.nameBn || emp.name,
          department: emp.department,
          date,
          firstInTime,
          lastOutTime,
          sessions,
          totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
          breakDurationMinutes: policy.breakDurationMinutes,
          lateDurationMinutes: metrics.lateDurationMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          status,
          isCurrentlyIn: Boolean(firstInTime && !lastOutTime),
          isMissingPunch: Boolean(firstInTime && !lastOutTime),
          verificationStatus: 'Manual_Approved',
          remarks: `এডমিন কর্তৃক সংযোজিত (${currentUser.nameBn || currentUser.name}): ${reason}`,
        };

    setAttendanceRecords((prev) =>
      existing ? prev.map((r) => (r.id === existing.id ? updatedRec : r)) : [updatedRec, ...prev]
    );
    runCloudWrite(
      () =>
        syncAttendanceRecordToFirestore(
          updatedRec,
          empUidMapRef.current[emp.id] || activeUid || auth.currentUser?.uid || ''
        ),
      `attendanceRecords/${updatedRec.id}`
    );

    logAudit(
      'ADMIN_ATTENDANCE_EDIT',
      'Attendance',
      `${emp.nameBn || emp.name} (${date})-এর হাজিরা এডমিন কর্তৃক পরিবর্তন করা হয়েছে। কারণ: ${reason}`,
      {
        beforeValue,
        afterValue,
        reason,
        targetEmployeeId: emp.id,
        targetDate: date,
      }
    );

    sendNotification({
      recipientEmployeeId: emp.id,
      recipientName: emp.nameBn || emp.name,
      senderEmployeeId: currentUser.id,
      senderName: currentUser.nameBn || currentUser.name,
      title: `হাজিরা রেকর্ড হালনাগাদ (${date})`,
      message: `প্রশাসন কর্তৃক আপনার ${date} তারিখের উপস্থিতি রেকর্ড হালনাগাদ করা হয়েছে (${afterValue})। কারণ: ${reason}`,
      linkType: 'notice',
      priority: 'normal',
    });
  };

  const addEmployee = async (
    empData: Omit<Employee, 'id'> & { id: string }
  ): Promise<CloudSyncActionResult> => {
    const cleanId = (empData.id || '').trim();
    if (!isValidFirestoreDocId(cleanId)) {
      return {
        ok: false,
        syncedToCloud: false,
        error:
          'সঠিক আইডি লিখুন (শুধুমাত্র ইংরেজি অক্ষর, সংখ্যা, হাইফেন (-) বা আন্ডারস্কোর (_) ব্যবহার করুন, সর্বোচ্চ ৬৪ অক্ষর)।',
      };
    }

    if (employees.some((e) => e.id.toLowerCase() === cleanId.toLowerCase())) {
      return {
        ok: false,
        syncedToCloud: false,
        error: `"${cleanId}" আইডিটি ইতিমধ্যে অন্য একজন শিক্ষক/স্টাফের জন্য ব্যবহৃত হয়েছে।`,
      };
    }

    const newEmp: Employee = {
      ...empData,
      id: cleanId,
      password: empData.password || '123456',
    };
    const lp = institutionalLeavePolicy;
    const newBal: LeaveBalance = {
      employeeId: cleanId,
      year: lp.year,
      casualLeaveTotal: lp.casualLeaveEnabled ? lp.casualLeaveDefault : 0,
      casualLeaveUsed: 0,
      sickLeaveTotal: lp.sickLeaveEnabled ? lp.sickLeaveDefault : 0,
      sickLeaveUsed: 0,
      earnedLeaveTotal: lp.earnedLeaveEnabled ? lp.earnedLeaveDefault : 0,
      earnedLeaveUsed: 0,
      dutyLeaveUsed: 0,
      isCustomQuota: false,
    };

    setEmployees((prev) => [...prev, newEmp]);
    setLeaveBalances((prev) => ({ ...prev, [cleanId]: newBal }));
    logAudit(
      'CREATE_EMPLOYEE',
      'Employee',
      `নতুন শিক্ষক/স্টাফ যুক্ত করা হয়েছে: ${newEmp.nameBn || newEmp.name} (${cleanId})`
    );

    const writerUid = resolveActiveWriterUid();
    if (!writerUid) {
      markPendingLocalChange();
      return {
        ok: true,
        syncedToCloud: false,
        error:
          'তথ্য স্থানীয়ভাবে সংরক্ষিত হয়েছে, তবে ক্লাউডে সংযুক্ত না থাকায় এখনো Firestore-এ যায়নি।',
      };
    }

    setCloudSyncStatus('syncing');
    try {
      await syncEmployeeToFirestore(newEmp, writerUid, true);
      await syncLeaveBalanceToFirestore(newBal, writerUid);
      setCloudSyncStatus('synced');
      setCloudSyncError(null);
      setCloudLastSyncedAt(new Date().toISOString());
      return { ok: true, syncedToCloud: true };
    } catch (err) {
      const msg = extractReadableSyncError(err, `employees/${cleanId}`);
      setCloudSyncStatus('error');
      setCloudSyncError(msg);
      markPendingLocalChange();
      return { ok: true, syncedToCloud: false, error: msg };
    }
  };

  const updateEmployee = async (
    id: string,
    data: Partial<Employee>
  ): Promise<CloudSyncActionResult> => {
    const baseEmp = employees.find((e) => e.id === id);
    if (!baseEmp) {
      return { ok: false, syncedToCloud: false, error: 'সংশ্লিষ্ট শিক্ষক/স্টাফকে খুঁজে পাওয়া যায়নি।' };
    }

    const nextId = data.id !== undefined ? data.id.trim() : id;
    if (data.id !== undefined) {
      if (!isValidFirestoreDocId(nextId)) {
        return {
          ok: false,
          syncedToCloud: false,
          error:
            'সঠিক আইডি লিখুন (শুধুমাত্র ইংরেজি অক্ষর, সংখ্যা, হাইফেন (-) বা আন্ডারস্কোর (_) ব্যবহার করুন, সর্বোচ্চ ৬৪ অক্ষর)।',
        };
      }
      if (
        nextId !== id &&
        employees.some((e) => e.id !== id && e.id.toLowerCase() === nextId.toLowerCase())
      ) {
        return {
          ok: false,
          syncedToCloud: false,
          error: `"${nextId}" আইডিটি ইতিমধ্যে অন্য একজন শিক্ষক/স্টাফের জন্য ব্যবহৃত হয়েছে।`,
        };
      }
    }

    const cleanedIncomingPassword =
      typeof data.password === 'string' ? data.password.trim() : undefined;
    const nextPassword =
      data.password !== undefined
        ? cleanedIncomingPassword && cleanedIncomingPassword.length > 0
          ? cleanedIncomingPassword
          : baseEmp.password
        : baseEmp.password;
    const mergedEmp: Employee = {
      ...baseEmp,
      ...data,
      id: nextId,
      password: nextPassword,
    };
    const isRenamingId = nextId !== id;

    setEmployees((prev) => prev.map((e) => (e.id === id ? mergedEmp : e)));

    let renamedBalance: LeaveBalance | undefined;
    if (isRenamingId) {
      const prevBal = leaveBalances[id];
      if (prevBal) {
        renamedBalance = { ...prevBal, employeeId: nextId };
      }
      setLeaveBalances((prev) => {
        const next = { ...prev };
        if (next[id]) {
          next[nextId] = { ...next[id], employeeId: nextId };
          delete next[id];
        }
        return next;
      });
      setAttendanceRecords((prev) =>
        prev.map((r) =>
          r.employeeId === id
            ? { ...r, employeeId: nextId, employeeName: mergedEmp.nameBn || mergedEmp.name }
            : r
        )
      );
      setRawPunches((prev) =>
        prev.map((p) => (p.employeeId === id ? { ...p, employeeId: nextId } : p))
      );
      setCorrections((prev) =>
        prev.map((c) => (c.employeeId === id ? { ...c, employeeId: nextId } : c))
      );
      setLeaveApplications((prev) =>
        prev.map((l) => (l.employeeId === id ? { ...l, employeeId: nextId } : l))
      );
      setTasks((prev) =>
        prev.map((t) => ({
          ...t,
          assignedPersonId: t.assignedPersonId === id ? nextId : t.assignedPersonId,
          supervisorId: t.supervisorId === id ? nextId : t.supervisorId,
        }))
      );
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          recipientEmployeeId: n.recipientEmployeeId === id ? nextId : n.recipientEmployeeId,
          senderEmployeeId: n.senderEmployeeId === id ? nextId : n.senderEmployeeId,
        }))
      );
      setActionTrackerItems((prev) =>
        prev.map((item) => ({
          ...item,
          assignedEmployeeIds: item.assignedEmployeeIds?.map((eid) => (eid === id ? nextId : eid)),
        }))
      );
      setMeetings((prev) =>
        prev.map((m) => ({
          ...m,
          invitedEmployeeIds: m.invitedEmployeeIds?.map((eid) => (eid === id ? nextId : eid)),
          actualAttendeeIds: m.actualAttendeeIds?.map((eid) => (eid === id ? nextId : eid)),
        }))
      );
      if (empUidMapRef.current[id]) {
        empUidMapRef.current[nextId] = empUidMapRef.current[id];
        delete empUidMapRef.current[id];
      }
    }

    if (currentUser.id === id) {
      setCurrentUser(mergedEmp);
      currentUserRef.current = mergedEmp;
      if (isRenamingId) {
        try {
          localStorage.setItem(STORAGE_KEYS.AUTH_USER_ID, nextId);
        } catch {
          // ignore
        }
      }
    }

    logAudit(
      'UPDATE_EMPLOYEE',
      'Employee',
      isRenamingId
        ? `প্রোফাইল ও আইডি হালনাগাদ করা হয়েছে (${id} → ${nextId})`
        : `প্রোফাইল হালনাগাদ করা হয়েছে (ID: ${id})`
    );

    const writerUid = resolveActiveWriterUid();
    if (!writerUid) {
      markPendingLocalChange();
      return {
        ok: true,
        syncedToCloud: false,
        error:
          'তথ্য স্থানীয়ভাবে আপডেট হয়েছে, তবে ক্লাউডে সংযুক্ত না থাকায় এখনো Firestore-এ যায়নি।',
      };
    }

    const linkedAuthUid = empUidMapRef.current[nextId] || empUidMapRef.current[id];
    setCloudSyncStatus('syncing');
    try {
      const credentialsIdentityChanged =
        isRenamingId ||
        (mergedEmp.email || '') !== (baseEmp.email || '') ||
        (mergedEmp.phone || '') !== (baseEmp.phone || '') ||
        (nextPassword || '') !== (baseEmp.password || '');
      if (baseEmp.password?.trim() && credentialsIdentityChanged) {
        await deletePortalCredentialsForEmployee(baseEmp, baseEmp.password);
      }

      if (isRenamingId) {
        await renameEmployeeIdInFirestore({
          oldId: id,
          newEmp: mergedEmp,
          leaveBalance: renamedBalance,
          uid: writerUid,
          linkedAuthUid,
        });
      } else {
        await syncEmployeeToFirestore(mergedEmp, writerUid, false, linkedAuthUid);
      }
      if (isCloudAdmin) {
        await syncLinkedUsersAndAdmins([mergedEmp]);
      }
      setCloudSyncStatus('synced');
      setCloudSyncError(null);
      setCloudLastSyncedAt(new Date().toISOString());
      return { ok: true, syncedToCloud: true };
    } catch (err) {
      const msg = extractReadableSyncError(err, `employees/${nextId}`);
      setCloudSyncStatus('error');
      setCloudSyncError(msg);
      markPendingLocalChange();
      return { ok: true, syncedToCloud: false, error: msg };
    }
  };

  const deleteEmployee = async (id: string): Promise<CloudSyncActionResult> => {
    const target = employees.find((e) => e.id === id);
    if (!target) {
      return { ok: false, syncedToCloud: false, error: 'শিক্ষক/স্টাফকে খুঁজে পাওয়া যায়নি।' };
    }
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setLeaveBalances((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    logAudit(
      'DELETE_EMPLOYEE',
      'Employee',
      `শিক্ষক/স্টাফ মুছে ফেলা হয়েছে: ${target.nameBn || target.name} (${id})`
    );

    const writerUid = resolveActiveWriterUid();
    if (!writerUid) {
      markPendingLocalChange();
      return { ok: true, syncedToCloud: false };
    }

    setCloudSyncStatus('syncing');
    try {
      await deleteEmployeeFromFirestore(id, target.email, target);
      setCloudSyncStatus('synced');
      setCloudSyncError(null);
      setCloudLastSyncedAt(new Date().toISOString());
      return { ok: true, syncedToCloud: true };
    } catch (err) {
      const msg = extractReadableSyncError(err, `employees/${id}`);
      setCloudSyncStatus('error');
      setCloudSyncError(msg);
      markPendingLocalChange();
      return { ok: true, syncedToCloud: false, error: msg };
    }
  };

  const recordManualPunch = (empId: string, punchType: 'IN' | 'OUT', verificationType: string) => {
    const dhaka = getDhakaDateTime();
    adminEditAttendanceRecord({
      employeeId: empId,
      date: dhaka.dateStr,
      firstInTime: punchType === 'IN' ? dhaka.shortTime : undefined,
      lastOutTime: punchType === 'OUT' ? dhaka.shortTime : undefined,
      status: 'Present',
      reason: `Manual entry (${verificationType})`,
    });
  };

  const ingestZkMachinePunches = useCallback(
    (incomingPunches: ZkParsedPunch[]) => {
      if (!incomingPunches || incomingPunches.length === 0) {
        return {
          processedCount: 0,
          matchedCount: 0,
          unmappedPins: [] as string[],
        };
      }

      const currentEmps = stateRef.current.employees;
      const existingRawIds = new Set(stateRef.current.rawPunches.map((p) => p.id));
      const sorted = [...incomingPunches].sort((a, b) =>
        `${a.dateStr} ${a.timeStr}`.localeCompare(`${b.dateStr} ${b.timeStr}`)
      );

      const findEmployeeByPin = (pin: string): Employee | undefined => {
        const cleanPin = pin.trim().toLowerCase();
        if (!cleanPin) return undefined;
        // 1. Exact match on attendanceMachineId
        const exactMachine = currentEmps.find(
          (e) => (e.attendanceMachineId || '').trim().toLowerCase() === cleanPin
        );
        if (exactMachine) return exactMachine;
        // 2. Exact match on employee ID
        const exactId = currentEmps.find((e) => e.id.trim().toLowerCase() === cleanPin);
        if (exactId) return exactId;
        // 3. Numeric match on attendanceMachineId (e.g. PIN "1" matches "ZK-001" or "001")
        if (/^\d+$/.test(cleanPin)) {
          const pinNum = Number(cleanPin);
          const numericMachineMatches = currentEmps.filter((e) => {
            const digits = (e.attendanceMachineId || '').replace(/\D+/g, '');
            return digits.length > 0 && Number(digits) === pinNum;
          });
          if (numericMachineMatches.length === 1) return numericMachineMatches[0];
        }
        return undefined;
      };

      const newRawEvents: RawPunchEvent[] = [];
      const updatedRecordsMap = new Map<string, DailyAttendanceRecord>();
      for (const rec of stateRef.current.attendanceRecords) {
        updatedRecordsMap.set(`${rec.employeeId}__${rec.date}`, rec);
      }

      const dirtyRecordKeys = new Set<string>();
      const unmappedPinSet = new Set<string>();
      let matchedCount = 0;

      for (const punch of sorted) {
        const emp = findEmployeeByPin(punch.machinePin);
        if (!emp) {
          unmappedPinSet.add(punch.machinePin);
          continue;
        }
        matchedCount++;

        if (existingRawIds.has(punch.id)) {
          continue;
        }
        existingRawIds.add(punch.id);

        const key = `${emp.id}__${punch.dateStr}`;
        const existingRec = updatedRecordsMap.get(key);

        let effectivePunchType: 'IN' | 'OUT' = 'IN';
        if (punch.punchType === 'OUT') {
          effectivePunchType = 'OUT';
        } else if (punch.punchType === 'IN' && !existingRec?.firstInTime) {
          effectivePunchType = 'IN';
        } else if (existingRec?.firstInTime) {
          const firstInMin = parseTimeToMinutes(existingRec.firstInTime);
          const punchMin = parseTimeToMinutes(punch.shortTime);
          if (punchMin >= firstInMin + 5) {
            effectivePunchType = 'OUT';
          } else {
            effectivePunchType = 'IN';
          }
        }

        const rawEvt: RawPunchEvent = {
          id: punch.id,
          machineId: punch.serialNumber || 'ZK-F09',
          employeeId: emp.id,
          attendanceMachineId: emp.attendanceMachineId || punch.machinePin,
          timestamp: punch.timestampIso,
          punchDate: punch.dateStr,
          punchTime: punch.timeStr,
          punchType: effectivePunchType,
          verificationType: punch.verificationType,
          deviceId: punch.serialNumber || 'ZK-F09',
          syncStatus: 'synced',
        };
        newRawEvents.push(rawEvt);

        let firstInTime = existingRec?.firstInTime;
        let lastOutTime = existingRec?.lastOutTime;

        if (effectivePunchType === 'IN') {
          if (
            !firstInTime ||
            parseTimeToMinutes(punch.shortTime) < parseTimeToMinutes(firstInTime)
          ) {
            firstInTime = punch.shortTime;
          }
        } else {
          if (!firstInTime) {
            firstInTime = punch.shortTime;
          } else if (
            !lastOutTime ||
            parseTimeToMinutes(punch.shortTime) >= parseTimeToMinutes(lastOutTime)
          ) {
            lastOutTime = punch.shortTime;
          }
        }

        const durationMinutes =
          firstInTime && lastOutTime
            ? Math.max(0, parseTimeToMinutes(lastOutTime) - parseTimeToMinutes(firstInTime))
            : 0;

        const sessions = firstInTime
          ? [
              {
                id:
                  existingRec?.sessions?.[0]?.id ||
                  `SES-ZK-${Date.now().toString().slice(-5)}`,
                inTime: firstInTime,
                inTimestamp: `${punch.dateStr}T${firstInTime}:00+06:00`,
                inDeviceId: punch.serialNumber || 'ZK-F09',
                outTime: lastOutTime,
                outTimestamp: lastOutTime
                  ? `${punch.dateStr}T${lastOutTime}:00+06:00`
                  : undefined,
                outDeviceId: lastOutTime ? punch.serialNumber || 'ZK-F09' : undefined,
                durationMinutes,
                verificationStatus: 'Verified' as const,
              },
            ]
          : [];

        const metrics = evaluateAttendanceMetrics(
          firstInTime,
          lastOutTime,
          sessions,
          emp.id,
          punch.dateStr
        );

        const nextRec: DailyAttendanceRecord = existingRec
          ? {
              ...existingRec,
              firstInTime,
              lastOutTime,
              sessions,
              totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
              lateDurationMinutes: metrics.lateDurationMinutes,
              earlyLeaveMinutes: metrics.earlyLeaveMinutes,
              status: metrics.status,
              isCurrentlyIn: metrics.isCurrentlyIn,
              isMissingPunch: metrics.isMissingPunch,
              verificationStatus: 'Verified',
              deviceId: punch.serialNumber || 'ZK-F09',
              remarks: `ZKTeco F09 মেশিন সিঙ্ক (${punch.verificationType})`,
            }
          : {
              id: `ATT-ZK-${emp.id}-${punch.dateStr}`,
              employeeId: emp.id,
              employeeName: emp.nameBn || emp.name,
              department: emp.department,
              date: punch.dateStr,
              firstInTime,
              lastOutTime,
              sessions,
              totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
              breakDurationMinutes: stateRef.current.policy.breakDurationMinutes,
              lateDurationMinutes: metrics.lateDurationMinutes,
              earlyLeaveMinutes: metrics.earlyLeaveMinutes,
              status: metrics.status,
              isCurrentlyIn: metrics.isCurrentlyIn,
              isMissingPunch: metrics.isMissingPunch,
              verificationStatus: 'Verified',
              deviceId: punch.serialNumber || 'ZK-F09',
              remarks: `ZKTeco F09 মেশিন সিঙ্ক (${punch.verificationType})`,
            };

        updatedRecordsMap.set(key, nextRec);
        dirtyRecordKeys.add(key);
      }

      if (newRawEvents.length > 0) {
        setRawPunches((prev) => [...newRawEvents, ...prev]);
        const allUpdatedAttendance = Array.from(updatedRecordsMap.values()).sort((a, b) =>
          b.date.localeCompare(a.date)
        );
        setAttendanceRecords(allUpdatedAttendance);

        for (const rawEvt of newRawEvents) {
          const targetOwnerUid =
            empUidMapRef.current[rawEvt.employeeId] || activeUid || auth.currentUser?.uid || '';
          runCloudWrite(
            () => syncRawPunchToFirestore(rawEvt, targetOwnerUid),
            `rawPunches/${rawEvt.id}`
          );
        }

        for (const dirtyKey of dirtyRecordKeys) {
          const rec = updatedRecordsMap.get(dirtyKey);
          if (rec) {
            const targetOwnerUid =
              empUidMapRef.current[rec.employeeId] || activeUid || auth.currentUser?.uid || '';
            runCloudWrite(
              () => syncAttendanceRecordToFirestore(rec, targetOwnerUid),
              `attendanceRecords/${rec.id}`
            );
          }
        }
      }

      return {
        processedCount: newRawEvents.length,
        matchedCount,
        unmappedPins: Array.from(unmappedPinSet),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeUid, runCloudWrite]
  );

  const simulateMachineSync = () => ({ newCount: 0 });

  const importMachineLogsCSV = (csvText: string): number => {
    const parsed = parseZkAttLogPayload(csvText, 'ZK-F09-USB');
    const summary = ingestZkMachinePunches(parsed);
    return summary.processedCount;
  };

  const submitCorrectionRequest = (reqData: Omit<AttendanceCorrectionRequest, 'id' | 'status' | 'appliedAt'>) => {
    const existing = attendanceRecords.find(
      (r) => r.employeeId === reqData.employeeId && r.date === reqData.date
    );
    const newCorr: AttendanceCorrectionRequest = {
      ...reqData,
      id: `CORR-${Date.now().toString().slice(-5)}`,
      beforeInTime: existing?.firstInTime,
      beforeOutTime: existing?.lastOutTime,
      beforeStatus: existing?.status || 'Absent',
      status: 'Pending',
      appliedAt: new Date().toISOString(),
    };
    setCorrections((prev) => [newCorr, ...prev]);
    runCloudWrite(
      () =>
        syncCorrectionToFirestore(
          newCorr,
          empUidMapRef.current[newCorr.employeeId] || activeUid || auth.currentUser?.uid || ''
        ),
      `corrections/${newCorr.id}`
    );

    const admins = employees.filter(
      (e) => e.role === 'super_admin' || e.role === 'admin_incharge' || e.role === 'director'
    );
    admins.forEach((admin) => {
      if (admin.id !== reqData.employeeId) {
        sendNotification({
          recipientEmployeeId: admin.id,
          recipientName: admin.nameBn || admin.name,
          senderEmployeeId: reqData.employeeId,
          senderName: reqData.employeeName,
          title: `হাজিরা সংশোধনের আবেদন: ${reqData.employeeName}`,
          message: `${reqData.date} তারিখের হাজিরা সংশোধনের জন্য আবেদন করা হয়েছে। কারণ: ${reqData.reason}`,
          linkType: 'notice',
          priority: 'urgent',
        });
      }
    });

    logAudit(
      'SUBMIT_ATTENDANCE_CORRECTION',
      'Attendance',
      `${reqData.employeeName} (${reqData.date})-এর হাজিরা সংশোধনের আবেদন জমা দিয়েছেন। কারণ: ${reqData.reason}`,
      {
        reason: reqData.reason,
        targetEmployeeId: reqData.employeeId,
        targetDate: reqData.date,
      }
    );
  };

  const approveCorrectionRequest = (id: string, approverRemarks: string = 'যাচাইপূর্বক অনুমোদিত') => {
    const corr = corrections.find((c) => c.id === id);
    if (!corr) return;

    const existing = attendanceRecords.find(
      (r) => r.employeeId === corr.employeeId && r.date === corr.date
    );
    const emp = employees.find((e) => e.id === corr.employeeId);

    const beforeIn = existing?.firstInTime || corr.beforeInTime || 'N/A';
    const beforeOut = existing?.lastOutTime || corr.beforeOutTime || 'N/A';
    const beforeStatus = existing?.status || corr.beforeStatus || 'Absent';

    const newIn = corr.correctedInTime || existing?.firstInTime;
    const newOut = corr.correctedOutTime || existing?.lastOutTime;

    const sessions: PunchSession[] = newIn
      ? [
          {
            id: `SES-CORR-${Date.now().toString().slice(-5)}`,
            inTime: newIn,
            inTimestamp: new Date().toISOString(),
            outTime: newOut,
            outTimestamp: newOut ? new Date().toISOString() : undefined,
            durationMinutes:
              newIn && newOut ? Math.max(0, parseTimeToMinutes(newOut) - parseTimeToMinutes(newIn)) : 0,
            verificationStatus: 'Manual_Approved',
          },
        ]
      : [];

    const metrics = evaluateAttendanceMetrics(newIn, newOut, sessions, corr.employeeId, corr.date);

    const updatedCorr: AttendanceCorrectionRequest = {
      ...corr,
      status: 'Approved',
      beforeInTime: beforeIn,
      beforeOutTime: beforeOut,
      beforeStatus: beforeStatus as AttendanceStatus,
      approverId: currentUser.id,
      approverName: currentUser.nameBn || currentUser.name,
      approvalRemarks: approverRemarks,
      reviewedAt: new Date().toISOString(),
    };

    const updatedRec: DailyAttendanceRecord = existing
      ? {
          ...existing,
          firstInTime: newIn,
          lastOutTime: newOut,
          sessions,
          totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
          lateDurationMinutes: metrics.lateDurationMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          status: metrics.status === 'Absent' ? 'Present' : metrics.status,
          isCurrentlyIn: Boolean(newIn && !newOut),
          isMissingPunch: Boolean(newIn && !newOut),
          verificationStatus: 'Manual_Approved',
          remarks: `সংশোধন অনুমোদিত (${currentUser.nameBn || currentUser.name}): ${approverRemarks}`,
        }
      : {
          id: `ATT-${Date.now().toString().slice(-6)}`,
          employeeId: corr.employeeId,
          employeeName: corr.employeeName,
          department: emp?.department || 'প্রশাসন',
          date: corr.date,
          firstInTime: newIn,
          lastOutTime: newOut,
          sessions,
          totalWorkingDurationMinutes: metrics.totalWorkingDurationMinutes,
          breakDurationMinutes: policy.breakDurationMinutes,
          lateDurationMinutes: metrics.lateDurationMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          status: metrics.status === 'Absent' ? 'Present' : metrics.status,
          isCurrentlyIn: Boolean(newIn && !newOut),
          isMissingPunch: Boolean(newIn && !newOut),
          verificationStatus: 'Manual_Approved',
          remarks: `সংশোধন অনুমোদিত (${currentUser.nameBn || currentUser.name}): ${approverRemarks}`,
        };

    setCorrections((prev) => prev.map((c) => (c.id === id ? updatedCorr : c)));
    setAttendanceRecords((prev) =>
      existing ? prev.map((r) => (r.id === existing.id ? updatedRec : r)) : [updatedRec, ...prev]
    );

    const ownerUidForCorr =
      empUidMapRef.current[corr.employeeId] || activeUid || auth.currentUser?.uid || '';
    runCloudWrite(async () => {
      await syncCorrectionToFirestore(updatedCorr, ownerUidForCorr);
      await syncAttendanceRecordToFirestore(updatedRec, ownerUidForCorr);
    }, `corrections/${updatedCorr.id}`);

    const beforeValue = `Status: ${beforeStatus}, In: ${beforeIn}, Out: ${beforeOut}`;
    const afterValue = `Status: ${metrics.status === 'Absent' ? 'Present' : metrics.status}, In: ${newIn || 'N/A'}, Out: ${newOut || 'N/A'}`;

    logAudit(
      'APPROVE_ATTENDANCE_CORRECTION',
      'Attendance',
      `${corr.employeeName} (${corr.date})-এর হাজিরা সংশোধন আবেদন অনুমোদন করা হয়েছে।`,
      {
        beforeValue,
        afterValue,
        reason: `${corr.reason} | অনুমোদন নোট: ${approverRemarks}`,
        targetEmployeeId: corr.employeeId,
        targetDate: corr.date,
      }
    );

    sendNotification({
      recipientEmployeeId: corr.employeeId,
      recipientName: corr.employeeName,
      senderEmployeeId: currentUser.id,
      senderName: currentUser.nameBn || currentUser.name,
      title: `হাজিরা সংশোধন আবেদন অনুমোদিত (${corr.date})`,
      message: `আপনার ${corr.date} তারিখের হাজিরা সংশোধনের আবেদনটি অনুমোদিত হয়েছে (প্রবেশ: ${newIn || '-'}, প্রস্থান: ${newOut || '-'})। মন্তব্য: ${approverRemarks}`,
      linkType: 'notice',
      priority: 'normal',
    });
  };

  const rejectCorrectionRequest = (id: string, approverRemarks: string = 'যথাযথ তথ্যের অভাবে নামঞ্জুর') => {
    const corr = corrections.find((c) => c.id === id);
    if (!corr) return;

    const updatedCorr: AttendanceCorrectionRequest = {
      ...corr,
      status: 'Rejected',
      approverId: currentUser.id,
      approverName: currentUser.nameBn || currentUser.name,
      approvalRemarks: approverRemarks,
      reviewedAt: new Date().toISOString(),
    };
    setCorrections((prev) => prev.map((c) => (c.id === id ? updatedCorr : c)));
    runCloudWrite(
      () =>
        syncCorrectionToFirestore(
          updatedCorr,
          empUidMapRef.current[corr.employeeId] || activeUid || auth.currentUser?.uid || ''
        ),
      `corrections/${updatedCorr.id}`
    );

    logAudit(
      'REJECT_ATTENDANCE_CORRECTION',
      'Attendance',
      `${corr.employeeName} (${corr.date})-এর হাজিরা সংশোধন আবেদন নামঞ্জুর করা হয়েছে। কারণ: ${approverRemarks}`,
      {
        beforeValue: `In: ${corr.beforeInTime || 'N/A'}, Out: ${corr.beforeOutTime || 'N/A'}`,
        afterValue: 'পরিবর্তন হয়নি (Rejected)',
        reason: approverRemarks,
        targetEmployeeId: corr.employeeId,
        targetDate: corr.date,
      }
    );

    sendNotification({
      recipientEmployeeId: corr.employeeId,
      recipientName: corr.employeeName,
      senderEmployeeId: currentUser.id,
      senderName: currentUser.nameBn || currentUser.name,
      title: `হাজিরা সংশোধন আবেদন নামঞ্জুর (${corr.date})`,
      message: `আপনার ${corr.date} তারিখের হাজিরা সংশোধনের আবেদনটি নামঞ্জুর করা হয়েছে। কারণ: ${approverRemarks}`,
      linkType: 'notice',
      priority: 'urgent',
    });
  };

  const submitLeaveApplication = (appData: Omit<LeaveApplication, 'id' | 'status' | 'appliedDate'>) => {
    const newId = `L-${institutionalLeavePolicy.year}-${String(leaveApplications.length + 1).padStart(3, '0')}`;
    const newApp: LeaveApplication = {
      ...appData,
      id: newId,
      status: 'Pending_Dept_Head',
      appliedDate: getDhakaDateTime().dateStr,
    };
    setLeaveApplications((prev) => [newApp, ...prev]);
    runCloudWrite(
      () =>
        syncLeaveApplicationToFirestore(
          newApp,
          empUidMapRef.current[newApp.employeeId] || activeUid || auth.currentUser?.uid || ''
        ),
      `leaveApplications/${newApp.id}`
    );
    logAudit('SUBMIT_LEAVE', 'Leave', `${appData.employeeName} ছুটির আবেদন জমা দিয়েছেন (${appData.leaveType})`);
  };

  const recommendLeave = (id: string, remarks: string, status: 'Recommended' | 'Not Recommended') => {
    const existing = leaveApplications.find((a) => a.id === id);
    if (!existing) return;
    const updated: LeaveApplication = {
      ...existing,
      status: status === 'Recommended' ? 'Pending_Director' : 'Rejected',
      deptHeadRecommendation: status,
      deptHeadRemarks: remarks,
      deptHeadReviewerId: currentUser.id,
      reviewedDate: getDhakaDateTime().dateStr,
    };
    setLeaveApplications((prev) => prev.map((a) => (a.id === id ? updated : a)));
    runCloudWrite(
      () =>
        syncLeaveApplicationToFirestore(
          updated,
          empUidMapRef.current[updated.employeeId] || activeUid || auth.currentUser?.uid || ''
        ),
      `leaveApplications/${updated.id}`
    );
    logAudit('RECOMMEND_LEAVE', 'Leave', `বিভাগীয় প্রধান ছুটির আবেদন ${id} সুপারিশ করেছেন: ${status}`);
  };

  const finalApproveLeave = (id: string, remarks: string, approved: boolean) => {
    const app = leaveApplications.find((a) => a.id === id);
    if (!app) return;

    const updatedApp: LeaveApplication = {
      ...app,
      status: approved ? 'Approved' : 'Rejected',
      directorRemarks: remarks,
      directorReviewerId: currentUser.id,
      reviewedDate: getDhakaDateTime().dateStr,
    };
    setLeaveApplications((prev) => prev.map((a) => (a.id === id ? updatedApp : a)));
    const leaveOwnerUid =
      empUidMapRef.current[app.employeeId] || activeUid || auth.currentUser?.uid || '';
    runCloudWrite(
      () => syncLeaveApplicationToFirestore(updatedApp, leaveOwnerUid),
      `leaveApplications/${updatedApp.id}`
    );

    if (approved) {
      const lp = institutionalLeavePolicy;
      const existing = leaveBalances[app.employeeId] || {
        employeeId: app.employeeId,
        year: lp.year,
        casualLeaveTotal: lp.casualLeaveEnabled ? lp.casualLeaveDefault : 0,
        casualLeaveUsed: 0,
        sickLeaveTotal: lp.sickLeaveEnabled ? lp.sickLeaveDefault : 0,
        sickLeaveUsed: 0,
        earnedLeaveTotal: lp.earnedLeaveEnabled ? lp.earnedLeaveDefault : 0,
        earnedLeaveUsed: 0,
        dutyLeaveUsed: 0,
        isCustomQuota: false,
      };
      const bal: LeaveBalance = { ...existing };
      if (app.leaveType.includes('Casual')) bal.casualLeaveUsed += app.totalDays;
      else if (app.leaveType.includes('Sick')) bal.sickLeaveUsed += app.totalDays;
      else if (app.leaveType.includes('Earned')) bal.earnedLeaveUsed += app.totalDays;
      else if (app.leaveType.includes('Duty')) bal.dutyLeaveUsed += app.totalDays;

      setLeaveBalances((prev) => ({ ...prev, [app.employeeId]: bal }));
      runCloudWrite(
        () => syncLeaveBalanceToFirestore(bal, leaveOwnerUid),
        `leaveBalances/${bal.employeeId}`
      );

      setAttendanceRecords((prev) =>
        prev.map((r) => {
          if (r.employeeId === app.employeeId && r.date >= app.startDate && r.date <= app.endDate && !r.firstInTime) {
            const nextRec: DailyAttendanceRecord = {
              ...r,
              status: 'Leave',
              remarks: `অনুমোদিত ছুটি: ${app.leaveType}`,
            };
            runCloudWrite(
              () => syncAttendanceRecordToFirestore(nextRec, leaveOwnerUid),
              `attendanceRecords/${nextRec.id}`
            );
            return nextRec;
          }
          return r;
        })
      );
    }

    sendNotification({
      recipientEmployeeId: app.employeeId,
      recipientName: app.employeeName,
      senderEmployeeId: currentUser.id,
      senderName: currentUser.nameBn || currentUser.name,
      title: approved ? `ছুটির আবেদন অনুমোদিত (${app.leaveType})` : `ছুটির আবেদন নামঞ্জুর (${app.leaveType})`,
      message: `${app.startDate} থেকে ${app.endDate} পর্যন্ত আপনার ছুটির আবেদনটি ${
        approved ? 'অনুমোদিত হয়েছে এবং উপস্থিতি রেকর্ডে যুক্ত হয়েছে' : 'নামঞ্জুর করা হয়েছে'
      }। মন্তব্য: ${remarks}`,
      linkType: 'leave',
      priority: approved ? 'normal' : 'urgent',
    });

    logAudit(
      approved ? 'APPROVE_LEAVE_FINAL' : 'REJECT_LEAVE_FINAL',
      'Leave',
      `ছুটির আবেদন ${id} (${app.employeeName}) ${approved ? 'অনুমোদিত' : 'নামঞ্জুর'} করা হয়েছে`
    );
  };

  const cancelLeaveApplication = (id: string, reason: string) => {
    const app = leaveApplications.find((a) => a.id === id);
    if (!app) return;

    const updatedApp: LeaveApplication = {
      ...app,
      status: 'Cancelled',
      directorRemarks: `বাতিলকৃত: ${reason}`,
      reviewedDate: getDhakaDateTime().dateStr,
    };
    setLeaveApplications((prev) => prev.map((a) => (a.id === id ? updatedApp : a)));
    const cancelOwnerUid =
      empUidMapRef.current[app.employeeId] || activeUid || auth.currentUser?.uid || '';
    runCloudWrite(
      () => syncLeaveApplicationToFirestore(updatedApp, cancelOwnerUid),
      `leaveApplications/${updatedApp.id}`
    );

    setAttendanceRecords((prev) =>
      prev.map((r) => {
        if (r.employeeId === app.employeeId && r.date >= app.startDate && r.date <= app.endDate && r.status === 'Leave') {
          const nextRec: DailyAttendanceRecord = {
            ...r,
            status: r.firstInTime ? 'Present' : 'Absent',
            remarks: `ছুটি বাতিল হওয়ায় উপস্থিতি পুনঃগণনাকৃত (${reason})`,
          };
          runCloudWrite(
            () => syncAttendanceRecordToFirestore(nextRec, cancelOwnerUid),
            `attendanceRecords/${nextRec.id}`
          );
          return nextRec;
        }
        return r;
      })
    );

    logAudit('CANCEL_LEAVE', 'Leave', `${app.employeeName}-এর ছুটি (${app.startDate} - ${app.endDate}) বাতিল করা হয়েছে। কারণ: ${reason}`);
  };

  const createMeeting = (mData: Omit<Meeting, 'id' | 'createdAt'>) => {
    const newId = `MTG-${(mData.date || '2026').slice(0, 4)}-${Date.now().toString().slice(-5)}-${Math.random()
      .toString(36)
      .slice(2, 4)
      .toUpperCase()}`;
    const hasMinutes =
      Boolean(mData.meetingNotes?.trim()) || (mData.finalDecisions && mData.finalDecisions.length > 0);
    const calId =
      mData.calendarEventId ||
      `CAL-MTG-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`;

    const newMeeting: Meeting = {
      ...mData,
      id: newId,
      meetingStatus: mData.meetingStatus || (hasMinutes ? 'Minutes_Added' : 'Scheduled'),
      calendarEventId: calId,
      createdAt: new Date().toISOString(),
    };
    setMeetings((prev) => [newMeeting, ...prev]);

    if (!mData.calendarEventId) {
      const timeLabel =
        mData.startTime && mData.endTime ? `${mData.startTime} - ${mData.endTime}` : mData.startTime || undefined;
      const newEvent: CalendarEvent = {
        id: calId,
        title: newMeeting.title,
        description:
          newMeeting.agenda.length > 0
            ? `আলোচ্যসূচি: ${newMeeting.agenda.slice(0, 2).join(', ')}`
            : newMeeting.meetingNotes?.slice(0, 180) || undefined,
        category: 'Meeting',
        startDate: newMeeting.date,
        endDate: newMeeting.date,
        timeLabel,
        location: newMeeting.venue || undefined,
        department: newMeeting.department || undefined,
        linkedMeetingId: newId,
        createdBy: currentUser.nameBn || currentUser.name,
        createdAt: new Date().toISOString(),
      };
      setCalendarEvents((prev) =>
        [...prev, newEvent].sort((a, b) => a.startDate.localeCompare(b.startDate))
      );
      runCloudWrite(
        () => syncCalendarEventToFirestore(newEvent, activeUid || auth.currentUser?.uid || ''),
        `calendarEvents/${newEvent.id}`
      );
    }

    const participantUids = resolveUidsForEmployeeIds(newMeeting.invitedEmployeeIds);
    runCloudWrite(
      () =>
        syncMeetingToFirestore(
          newMeeting,
          activeUid || auth.currentUser?.uid || '',
          participantUids
        ),
      `meetings/${newMeeting.id}`
    );
    logAudit('CREATE_MEETING', 'Meeting', `নতুন মিটিং তৈরি করা হয়েছে: ${newMeeting.title} (${newId})`);
  };

  const scheduleMeetingFromCalendar = (input: {
    title: string;
    meetingType?: string;
    department: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: string;
    chairperson: string;
    secretary: string;
    agenda: string[];
    participants: string[];
    invitedEmployeeIds: string[];
    description?: string;
  }): { calendarEvent: CalendarEvent; meeting: Meeting } => {
    const suffix = `${Date.now().toString().slice(-5)}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    const calId = `CAL-MTG-${suffix}`;
    const mtgId = `MTG-${(input.date || '2026').slice(0, 4)}-${suffix}`;
    const nowIso = new Date().toISOString();
    const timeLabel =
      input.startTime && input.endTime
        ? `${input.startTime} - ${input.endTime}`
        : input.startTime || undefined;

    const newMeeting: Meeting = {
      id: mtgId,
      title: input.title.trim(),
      meetingType: input.meetingType?.trim() || 'বিভাগীয় / প্রাতিষ্ঠানিক সভা',
      date: input.date,
      startTime: input.startTime || '10:00',
      endTime: input.endTime || '11:30',
      venue: input.venue.trim() || 'ইনস্টিটিউট কনফারেন্স রুম',
      chairperson: input.chairperson.trim() || currentUser.nameBn || currentUser.name,
      secretary: input.secretary.trim() || '',
      department: input.department.trim() || 'সকল বিভাগ',
      participants: input.participants,
      invitedEmployeeIds: input.invitedEmployeeIds,
      actualAttendeeIds: [],
      agenda: input.agenda,
      meetingNotes: input.description?.trim() || '',
      finalDecisions: [],
      approvalStatus: 'Draft',
      meetingStatus: 'Scheduled',
      calendarEventId: calId,
      createdAt: nowIso,
    };

    const newEvent: CalendarEvent = {
      id: calId,
      title: input.title.trim(),
      description:
        input.description?.trim() ||
        (input.agenda.length > 0 ? `এজেন্ডা: ${input.agenda.slice(0, 3).join(' · ')}` : undefined),
      category: 'Meeting',
      startDate: input.date,
      endDate: input.date,
      timeLabel,
      location: input.venue.trim() || undefined,
      department: input.department.trim() || undefined,
      linkedMeetingId: mtgId,
      createdBy: currentUser.nameBn || currentUser.name,
      createdAt: nowIso,
    };

    setMeetings((prev) => [newMeeting, ...prev]);
    setCalendarEvents((prev) =>
      [...prev, newEvent].sort((a, b) => a.startDate.localeCompare(b.startDate))
    );

    const participantUids = resolveUidsForEmployeeIds(newMeeting.invitedEmployeeIds);
    runCloudWrite(async () => {
      const uid = activeUid || auth.currentUser?.uid || '';
      await syncCalendarEventToFirestore(newEvent, uid);
      await syncMeetingToFirestore(newMeeting, uid, participantUids);
    }, `meetings/${mtgId}`);

    input.invitedEmployeeIds.forEach((empId) => {
      const emp = employees.find((e) => e.id === empId);
      if (emp) {
        sendNotification({
          recipientEmployeeId: emp.id,
          recipientName: emp.nameBn || emp.name,
          senderEmployeeId: currentUser.id,
          senderName: currentUser.nameBn || currentUser.name,
          title: `নতুন সভার আমন্ত্রণ: ${newMeeting.title}`,
          message: `তারিখ: ${newMeeting.date}${timeLabel ? ` (${timeLabel})` : ''}, স্থান: ${newMeeting.venue}, ডিপার্টমেন্ট: ${newMeeting.department}।`,
          linkType: 'meeting',
          linkId: mtgId,
          priority: 'normal',
        });
      }
    });

    logAudit(
      'SCHEDULE_MEETING',
      'Meeting',
      `ক্যালেন্ডার থেকে নতুন সভা নির্ধারণ করা হয়েছে: ${newMeeting.title} (${newMeeting.date})`
    );

    return { calendarEvent: newEvent, meeting: newMeeting };
  };

  const updateMeeting = (id: string, updates: Partial<Meeting>) => {
    const existing = meetings.find((m) => m.id === id);
    if (!existing) return;

    const updatedMeeting: Meeting = {
      ...existing,
      ...updates,
    };

    setMeetings((prev) => prev.map((m) => (m.id === id ? updatedMeeting : m)));
    const participantUids = resolveUidsForEmployeeIds(updatedMeeting.invitedEmployeeIds);
    runCloudWrite(
      () =>
        syncMeetingToFirestore(
          updatedMeeting,
          activeUid || auth.currentUser?.uid || '',
          participantUids
        ),
      `meetings/${updatedMeeting.id}`
    );

    if (existing.calendarEventId) {
      const calEv = calendarEvents.find((ev) => ev.id === existing.calendarEventId);
      if (calEv) {
        const timeLabel =
          updatedMeeting.startTime && updatedMeeting.endTime
            ? `${updatedMeeting.startTime} - ${updatedMeeting.endTime}`
            : updatedMeeting.startTime || calEv.timeLabel;
        const updatedCalEv: CalendarEvent = {
          ...calEv,
          title: updatedMeeting.title,
          startDate: updatedMeeting.date,
          endDate: updatedMeeting.date,
          timeLabel,
          location: updatedMeeting.venue || calEv.location,
          department: updatedMeeting.department || calEv.department,
          description:
            updatedMeeting.agenda.length > 0
              ? `এজেন্ডা: ${updatedMeeting.agenda.slice(0, 3).join(' · ')}`
              : calEv.description,
        };
        setCalendarEvents((prev) =>
          prev
            .map((ev) => (ev.id === existing.calendarEventId ? updatedCalEv : ev))
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
        );
        runCloudWrite(
          () => syncCalendarEventToFirestore(updatedCalEv, activeUid || auth.currentUser?.uid || ''),
          `calendarEvents/${updatedCalEv.id}`
        );
      }
    }

    if (existing.meetingStatus === 'Scheduled' && updatedMeeting.meetingStatus === 'Minutes_Added') {
      const notifyIds = Array.from(
        new Set([...(updatedMeeting.invitedEmployeeIds || []), ...(updatedMeeting.actualAttendeeIds || [])])
      );
      notifyIds.forEach((empId) => {
        if (empId === currentUser.id) return;
        const emp = employees.find((e) => e.id === empId);
        if (emp) {
          sendNotification({
            recipientEmployeeId: emp.id,
            recipientName: emp.nameBn || emp.name,
            senderEmployeeId: currentUser.id,
            senderName: currentUser.nameBn || currentUser.name,
            title: `মিটিং মিনিটস প্রকাশিত হয়েছে: ${updatedMeeting.title}`,
            message: `${updatedMeeting.date} তারিখের সভার কার্যবিবরণী ও গৃহীত সিদ্ধান্তসমূহ সংরক্ষণ করা হয়েছে।`,
            linkType: 'meeting',
            linkId: updatedMeeting.id,
            priority: 'normal',
          });
        }
      });
    }

    logAudit('UPDATE_MEETING', 'Meeting', `মিটিং ও মিনিটস হালনাগাদ করা হয়েছে: ${updatedMeeting.title} (${id})`);
  };

  const deleteMeeting = (id: string) => {
    const existing = meetings.find((m) => m.id === id);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    runCloudWrite(() => deleteMeetingFromFirestore(id), `meetings/${id}`);

    if (existing?.calendarEventId) {
      const calEventIdToDelete = existing.calendarEventId;
      const nextCal = calendarEvents.filter((ev) => ev.id !== calEventIdToDelete);
      setCalendarEvents(nextCal);
      runCloudWrite(
        () => deleteCalendarEventFromFirestore(calEventIdToDelete),
        `calendarEvents/${calEventIdToDelete}`
      );
    }

    logAudit('DELETE_MEETING', 'Meeting', `মিটিং মুছে ফেলা হয়েছে: ${existing?.title || id}`);
  };

  const convertDecisionToTask = (meetingId: string, decisionId: string): TaskItem => {
    const mtg = meetings.find((m) => m.id === meetingId);
    const dec = mtg?.finalDecisions.find((d) => d.id === decisionId);
    if (!mtg || !dec) throw new Error('Decision not found');

    const emp = employees.find((e) => e.id === dec.assignedEmployeeId) || employees[0] || currentUser;
    const newTaskId = `TSK-${100 + tasks.length + 1}`;

    const newTask: TaskItem = {
      id: newTaskId,
      title: dec.decisionText,
      description: `Action item resulting from Meeting ${mtg.title} (${mtg.date}) on agenda items.`,
      category: 'Institutional Administration',
      department: emp.department,
      assignedPersonId: dec.assignedEmployeeId,
      assignedPersonName: dec.assignedEmployeeName,
      supervisorId: dec.supervisorId,
      supervisorName: dec.supervisorName,
      startDate: getDhakaDateTime().dateStr,
      deadline: dec.deadline,
      priority: 'High',
      status: 'To Do',
      progressPercentage: 0,
      relatedMeetingId: meetingId,
      relatedDecisionId: decisionId,
      createdAt: new Date().toISOString(),
    };

    const updatedMeeting: Meeting = {
      ...mtg,
      finalDecisions: mtg.finalDecisions.map((d) =>
        d.id === decisionId ? { ...d, convertedToTaskId: newTaskId } : d
      ),
    };

    setTasks((prev) => [newTask, ...prev]);
    setMeetings((prev) => prev.map((m) => (m.id === meetingId ? updatedMeeting : m)));

    const taskAssigneeUid = empUidMapRef.current[newTask.assignedPersonId];
    const mtgParticipantUids = resolveUidsForEmployeeIds(updatedMeeting.invitedEmployeeIds);
    runCloudWrite(async () => {
      const uid = activeUid || auth.currentUser?.uid || '';
      await syncTaskToFirestore(newTask, uid, taskAssigneeUid);
      await syncMeetingToFirestore(updatedMeeting, uid, mtgParticipantUids);
    }, `tasks/${newTaskId}`);

    logAudit('CONVERT_DECISION_TO_TASK', 'Task', `Generated task ${newTaskId} from meeting decision ${decisionId}`);
    return newTask;
  };

  const createTask = (tData: Omit<TaskItem, 'id' | 'createdAt'>) => {
    const newTaskId = `TSK-${100 + tasks.length + 1}`;
    const newTask: TaskItem = {
      ...tData,
      id: newTaskId,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);
    runCloudWrite(
      () =>
        syncTaskToFirestore(
          newTask,
          activeUid || auth.currentUser?.uid || '',
          empUidMapRef.current[newTask.assignedPersonId]
        ),
      `tasks/${newTaskId}`
    );

    sendNotification({
      recipientEmployeeId: tData.assignedPersonId,
      recipientName: tData.assignedPersonName,
      senderEmployeeId: currentUser.id,
      senderName: currentUser.name,
      title: `নতুন টাস্ক অর্পণ: ${tData.title}`,
      message: `${currentUser.name} আপনাকে একটি নতুন দায়িত্ব অর্পণ করেছেন। ডেডলাইন: ${tData.deadline}।`,
      linkType: 'task',
      linkId: newTaskId,
      priority: tData.priority === 'Urgent' || tData.priority === 'High' ? 'urgent' : 'normal',
    });

    logAudit('CREATE_TASK', 'Task', `Created task ${newTask.title} (${newTaskId}) assigned to ${tData.assignedPersonName}`);
  };

  const updateTaskProgress = (id: string, progress: number, notes?: string) => {
    const existing = tasks.find((t) => t.id === id);
    if (!existing) return;
    const updated: TaskItem = {
      ...existing,
      progressPercentage: progress,
      status:
        progress >= 100 && existing.status === 'In Progress'
          ? 'Submitted for Review'
          : existing.status === 'To Do'
          ? 'In Progress'
          : existing.status,
      submissionNotes: notes || existing.submissionNotes,
    };
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    runCloudWrite(
      () =>
        syncTaskToFirestore(
          updated,
          activeUid || auth.currentUser?.uid || '',
          empUidMapRef.current[updated.assignedPersonId]
        ),
      `tasks/${updated.id}`
    );
    logAudit('UPDATE_TASK_PROGRESS', 'Task', `Updated progress for ${id} to ${progress}%`);
  };

  const submitTaskForReview = (id: string, notes: string, attachment?: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    sendNotification({
      recipientEmployeeId: task.supervisorId,
      recipientName: task.supervisorName,
      senderEmployeeId: currentUser.id,
      senderName: currentUser.name,
      title: `টাস্ক সম্পন্ন ও অনুমোদনের জন্য জমা: ${task.title}`,
      message: `${currentUser.name} টাস্কটি সম্পন্ন করে আপনার পর্যালোচনার জন্য জমা দিয়েছেন।`,
      linkType: 'task',
      linkId: task.id,
      priority: 'urgent',
    });

    const updated: TaskItem = {
      ...task,
      status: 'Submitted for Review',
      progressPercentage: 100,
      submissionNotes: notes,
      submissionAttachment: attachment || task.submissionAttachment,
    };
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    runCloudWrite(
      () =>
        syncTaskToFirestore(
          updated,
          activeUid || auth.currentUser?.uid || '',
          empUidMapRef.current[updated.assignedPersonId]
        ),
      `tasks/${updated.id}`
    );
    logAudit('SUBMIT_TASK_REVIEW', 'Task', `Task ${id} submitted for supervisor review`);
  };

  const reviewTask = (id: string, approved: boolean, feedback?: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    sendNotification({
      recipientEmployeeId: task.assignedPersonId,
      recipientName: task.assignedPersonName,
      senderEmployeeId: currentUser.id,
      senderName: currentUser.name,
      title: approved ? `টাস্ক অনুমোদিত হয়েছে: ${task.title}` : `টাস্কে সংশোধন প্রয়োজন: ${task.title}`,
      message: feedback || (approved ? 'আপনার কাজ সফলভাবে অনুমোদিত হয়েছে।' : 'সুপারভাইজার পুনরায় পর্যালোচনার নির্দেশ দিয়েছেন।'),
      linkType: 'task',
      linkId: task.id,
      priority: approved ? 'normal' : 'urgent',
    });

    const updated: TaskItem = {
      ...task,
      status: approved ? 'Approved' : 'Revision Required',
      revisionFeedback: feedback || task.revisionFeedback,
      completedAt: approved ? new Date().toISOString() : undefined,
    };
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    runCloudWrite(
      () =>
        syncTaskToFirestore(
          updated,
          activeUid || auth.currentUser?.uid || '',
          empUidMapRef.current[updated.assignedPersonId]
        ),
      `tasks/${updated.id}`
    );
    logAudit(approved ? 'APPROVE_TASK' : 'REVISE_TASK', 'Task', `Supervisor reviewed task ${id}: ${approved ? 'Approved' : 'Revision requested'}`);
  };

  const markNotificationAsRead = (id: string) => {
    const existing = notifications.find((n) => n.id === id);
    if (!existing) return;
    const updated = { ...existing, isRead: true };
    setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
    runCloudWrite(
      () =>
        syncNotificationToFirestore(
          updated,
          activeUid || auth.currentUser?.uid || '',
          empUidMapRef.current[updated.recipientEmployeeId]
        ),
      `notifications/${updated.id}`
    );
  };

  const markAllNotificationsAsRead = (empId: string) => {
    const toUpdate = notifications.filter((n) => n.recipientEmployeeId === empId && !n.isRead);
    setNotifications((prev) =>
      prev.map((n) => (n.recipientEmployeeId === empId && !n.isRead ? { ...n, isRead: true } : n))
    );
    if (toUpdate.length > 0) {
      runCloudWrite(async () => {
        const uid = activeUid || auth.currentUser?.uid || '';
        const recipientUid = empUidMapRef.current[empId];
        await Promise.all(
          toUpdate.map((n) => syncNotificationToFirestore({ ...n, isRead: true }, uid, recipientUid))
        );
      }, 'notifications/markAllRead');
    }
  };

  const createActionTrackerItem = (itemData: Omit<ActionTrackerItem, 'id' | 'createdAt' | 'serialNo'>) => {
    const nextSerial = actionTrackerItems.reduce((m, i) => Math.max(m, i.serialNo || 0), 0) + 1;
    const newId = `ACT-${String(nextSerial).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
    const newItem: ActionTrackerItem = {
      ...itemData,
      id: newId,
      serialNo: nextSerial,
      createdAt: new Date().toISOString(),
    };
    setActionTrackerItems((prev) => [newItem, ...prev]);
    const assigneeUidsForNew = resolveUidsForEmployeeIds(newItem.assignedEmployeeIds);
    runCloudWrite(
      () =>
        syncActionTrackerToFirestore(
          newItem,
          activeUid || auth.currentUser?.uid || '',
          assigneeUidsForNew
        ),
      `actionTrackerItems/${newItem.id}`
    );

    if (itemData.assignedEmployeeIds && itemData.assignedEmployeeIds.length > 0) {
      itemData.assignedEmployeeIds.forEach((empId) => {
        const emp = employees.find((e) => e.id === empId);
        if (emp) {
          sendNotification({
            recipientEmployeeId: emp.id,
            recipientName: emp.name,
            senderEmployeeId: currentUser.id,
            senderName: currentUser.name,
            title: `সিদ্ধান্ত বাস্তবায়ন ট্র্যাকারে নতুন দায়িত্ব: ${itemData.title}`,
            message: `${currentUser.name} আপনাকে সিদ্ধান্ত বাস্তবায়ন ট্র্যাকারে দায়িত্ব অর্পণ করেছেন। ডেডলাইন: ${itemData.deadline}।`,
            linkType: 'tracker',
            linkId: newId,
            priority: itemData.priority === 'জরুরি' || itemData.priority === 'উচ্চ' ? 'urgent' : 'normal',
          });
        }
      });
    }

    logAudit('CREATE_ACTION_ITEM', 'Task', `Added Action Tracker item ${newItem.title} (${newId})`);
  };

  const updateActionTrackerItem = (id: string, updates: Partial<ActionTrackerItem>) => {
    const existing = actionTrackerItems.find((i) => i.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    setActionTrackerItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    const assigneeUids = resolveUidsForEmployeeIds(updated.assignedEmployeeIds);
    runCloudWrite(
      () =>
        syncActionTrackerToFirestore(
          updated,
          activeUid || auth.currentUser?.uid || '',
          assigneeUids
        ),
      `actionTrackerItems/${id}`
    );
    logAudit('EDIT_ACTION_ITEM', 'Task', `Admin edited Action Tracker item ${id}`);
  };

  const deleteActionTrackerItem = (id: string) => {
    setActionTrackerItems((prev) => prev.filter((item) => item.id !== id));
    runCloudWrite(() => deleteActionTrackerFromFirestore(id), `actionTrackerItems/${id}`);
    logAudit('DELETE_ACTION_ITEM', 'Task', `Admin deleted Action Tracker item ${id}`);
  };

  const updateActionTrackerProgress = (id: string, updates: Partial<ActionTrackerItem>) => {
    const existing = actionTrackerItems.find((i) => i.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    setActionTrackerItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    const assigneeUids = resolveUidsForEmployeeIds(updated.assignedEmployeeIds);
    runCloudWrite(
      () =>
        syncActionTrackerToFirestore(
          updated,
          activeUid || auth.currentUser?.uid || '',
          assigneeUids
        ),
      `actionTrackerItems/${id}`
    );

    if (
      updates.submissionReport ||
      updates.status === 'সম্পন্ন' ||
      (updates.submissionFiles && updates.submissionFiles.length > 0)
    ) {
      const admins = employees.filter(
        (e) => e.role === 'super_admin' || e.role === 'admin_incharge' || e.role === 'director'
      );
      admins.forEach((admin) => {
        if (admin.id !== currentUser.id) {
          sendNotification({
            recipientEmployeeId: admin.id,
            recipientName: admin.name,
            senderEmployeeId: currentUser.id,
            senderName: currentUser.name,
            title: `কাজ জমা দেওয়া হয়েছে: ${existing.title}`,
            message: `${currentUser.nameBn || currentUser.name} কাজটির অগ্রগতি (${updates.progressPercentage ?? existing.progressPercentage}%) ও রিপোর্ট জমা দিয়েছেন।`,
            linkType: 'tracker',
            actionTrackerId: id,
            priority: 'urgent',
          });
        }
      });
    }

    logAudit('UPDATE_ACTION_ITEM', 'Task', `Updated Action Tracker item ${id}`);
  };

  const importActionTrackerItems = (newItems: Array<Omit<ActionTrackerItem, 'id' | 'createdAt'>>): number => {
    let count = 0;
    const currentMaxSerial = actionTrackerItems.reduce((max, item) => Math.max(max, item.serialNo), 0);

    const formatted: ActionTrackerItem[] = newItems.map((item, idx) => {
      count++;
      const serial = currentMaxSerial + idx + 1;
      const itemId = `ACT-${String(serial).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;

      if (item.assignedEmployeeIds && item.assignedEmployeeIds.length > 0) {
        item.assignedEmployeeIds.forEach((empId) => {
          const emp = employees.find((e) => e.id === empId);
          if (emp) {
            sendNotification({
              recipientEmployeeId: emp.id,
              recipientName: emp.name,
              senderEmployeeId: currentUser.id,
              senderName: currentUser.name,
              title: `নতুন দায়িত্ব ইম্পোর্ট হয়েছে: ${item.title}`,
              message: `সিদ্ধান্ত বাস্তবায়ন ট্র্যাকারে নতুন কাজ ইম্পোর্ট করা হয়েছে। ডেডলাইন: ${item.deadline}।`,
              linkType: 'tracker',
              linkId: itemId,
              priority: 'normal',
            });
          }
        });
      }

      const fullItem: ActionTrackerItem = {
        ...item,
        id: itemId,
        serialNo: serial,
        createdAt: new Date().toISOString(),
      };
      return fullItem;
    });

    setActionTrackerItems((prev) => [...prev, ...formatted]);
    runCloudWrite(async () => {
      const uid = activeUid || auth.currentUser?.uid || '';
      const res = await runChunkedTasks(formatted, (fullItem) =>
        syncActionTrackerToFirestore(
          fullItem,
          uid,
          resolveUidsForEmployeeIds(fullItem.assignedEmployeeIds)
        )
      );
      if (res.errors.length > 0) {
        throw new Error(res.errors[0]);
      }
    }, 'actionTrackerItems/import');
    logAudit('IMPORT_ACTION_ITEMS', 'Task', `Imported ${count} Action Tracker items into system`);
    return count;
  };

  const createManagementToDo = (itemData: Omit<ManagementToDoItem, 'id' | 'publishedAt'>) => {
    const newId = `MGT-2026-${String(managementToDos.length + 1).padStart(2, '0')}`;
    const newItem: ManagementToDoItem = {
      ...itemData,
      id: newId,
      publishedAt: getDhakaDateTime().dateStr,
    };
    setManagementToDos((prev) => [newItem, ...prev]);
    logAudit('CREATE_MANAGEMENT_TODO', 'System', `Management To-Do published: ${newItem.title}`);
  };

  const updateManagementToDoStatus = (id: string, status: ManagementToDoItem['status']) => {
    setManagementToDos((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    logAudit('UPDATE_MANAGEMENT_TODO', 'System', `Management To-Do ${id} status set to ${status}`);
  };

  const createDocument = (docData: Omit<OfficeDocument, 'id'>) => {
    const newId = `DOC-2026-${String(documents.length + 1).padStart(3, '0')}`;
    const newDoc: OfficeDocument = {
      ...docData,
      id: newId,
    };
    setDocuments((prev) => [newDoc, ...prev]);
    logAudit('CREATE_DOCUMENT', 'Document', `Published official document: ${newDoc.memoNumber}`);
  };

  const createNotice = (nData: Omit<NoticeItem, 'id' | 'readByEmployeeIds'>) => {
    const newId = `NTC-${String(notices.length + 1).padStart(3, '0')}`;
    const newNotice: NoticeItem = {
      ...nData,
      id: newId,
      readByEmployeeIds: [currentUser.id],
    };
    setNotices((prev) => [newNotice, ...prev]);
    logAudit('CREATE_NOTICE', 'System', `Published notice: ${newNotice.title}`);
  };

  const markNoticeAsRead = (noticeId: string, empId: string) => {
    setNotices((prev) =>
      prev.map((n) =>
        n.id === noticeId && !n.readByEmployeeIds.includes(empId)
          ? { ...n, readByEmployeeIds: [...n.readByEmployeeIds, empId] }
          : n
      )
    );
  };

  const syncCalendarSpecialDaysToAttendance = (eventsList: CalendarEvent[]) => {
    const derivedSpecialDays: SpecialDayConfig[] = [];
    eventsList.forEach((ev) => {
      if (ev.category === 'Holiday' || ev.category === 'Special_Working_Day') {
        const dates = enumerateDateRange(ev.startDate, ev.endDate);
        dates.forEach((d) => {
          derivedSpecialDays.push({
            id: ev.id,
            date: d,
            title: ev.title,
            type: ev.category === 'Holiday' ? 'Holiday' : 'Special_Working_Day',
          });
        });
      }
    });

    const manualOnly = (policy.specialDays || []).filter((sd) => !sd.id?.startsWith('CAL-'));
    const derivedDates = new Set(derivedSpecialDays.map((d) => d.date));
    const merged = [...manualOnly.filter((sd) => !derivedDates.has(sd.date)), ...derivedSpecialDays];
    const nextPolicy = { ...policy, specialDays: merged };
    setPolicy(nextPolicy);
    runCloudWrite(
      () => syncAttendancePolicyToFirestore(nextPolicy, activeUid || auth.currentUser?.uid || ''),
      'settings/attendancePolicy'
    );
  };

  const createCalendarEvent = (eventData: Omit<CalendarEvent, 'id' | 'createdAt'>) => {
    const newEvent: CalendarEvent = {
      ...eventData,
      id: `CAL-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
      endDate: eventData.endDate || eventData.startDate,
      createdBy: currentUser.nameBn || currentUser.name,
      createdAt: new Date().toISOString(),
    };
    const updatedList = [...calendarEvents, newEvent].sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );
    setCalendarEvents(updatedList);
    syncCalendarSpecialDaysToAttendance(updatedList);
    runCloudWrite(
      () => syncCalendarEventToFirestore(newEvent, activeUid || auth.currentUser?.uid || ''),
      `calendarEvents/${newEvent.id}`
    );
    logAudit(
      'CREATE_CALENDAR_EVENT',
      'System',
      `বার্ষিক ক্যালেন্ডারে নতুন ইভেন্ট যুক্ত হয়েছে: ${newEvent.title} (${newEvent.startDate})`
    );
  };

  const createCalendarEventsBatch = (
    eventsData: Omit<CalendarEvent, 'id' | 'createdAt'>[]
  ) => {
    if (!eventsData || eventsData.length === 0) return;
    const nowIso = new Date().toISOString();
    const authorName = currentUser.nameBn || currentUser.name;
    const createdEvents: CalendarEvent[] = eventsData.map((eventData, idx) => ({
      ...eventData,
      id: `CAL-${Date.now().toString().slice(-6)}-${idx + 1}-${Math.random().toString(36).slice(2, 5)}`,
      endDate:
        eventData.endDate && eventData.endDate >= eventData.startDate
          ? eventData.endDate
          : eventData.startDate,
      createdBy: authorName,
      createdAt: nowIso,
    }));

    const updatedList = [...calendarEvents, ...createdEvents].sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );
    setCalendarEvents(updatedList);
    syncCalendarSpecialDaysToAttendance(updatedList);

    const uid = activeUid || auth.currentUser?.uid || '';
    createdEvents.forEach((ev) => {
      runCloudWrite(
        () => syncCalendarEventToFirestore(ev, uid),
        `calendarEvents/${ev.id}`
      );
    });

    logAudit(
      'CREATE_CALENDAR_EVENT_BATCH',
      'System',
      `বার্ষিক ক্যালেন্ডারে একসাথে ${createdEvents.length} টি ইভেন্ট/ছুটি যুক্ত হয়েছে`
    );
  };

  const updateCalendarEvent = (id: string, updates: Partial<CalendarEvent>) => {
    let editedEvent: CalendarEvent | undefined;
    const updatedList = calendarEvents
      .map((ev) => {
        if (ev.id === id) {
          editedEvent = {
            ...ev,
            ...updates,
            endDate: updates.endDate || updates.startDate || ev.endDate,
          };
          return editedEvent;
        }
        return ev;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    setCalendarEvents(updatedList);
    syncCalendarSpecialDaysToAttendance(updatedList);
    if (editedEvent) {
      const evToSync = editedEvent;
      runCloudWrite(
        () => syncCalendarEventToFirestore(evToSync, activeUid || auth.currentUser?.uid || ''),
        `calendarEvents/${evToSync.id}`
      );
    }

    if (editedEvent?.linkedMeetingId) {
      const linkedMtg = meetings.find((m) => m.id === editedEvent?.linkedMeetingId);
      if (linkedMtg) {
        const updatedMtg: Meeting = {
          ...linkedMtg,
          title: editedEvent.title,
          date: editedEvent.startDate,
          venue: editedEvent.location ?? linkedMtg.venue,
          department: editedEvent.department ?? linkedMtg.department,
        };
        setMeetings((prev) => prev.map((m) => (m.id === linkedMtg.id ? updatedMtg : m)));
        const participantUids = resolveUidsForEmployeeIds(updatedMtg.invitedEmployeeIds);
        runCloudWrite(
          () =>
            syncMeetingToFirestore(
              updatedMtg,
              activeUid || auth.currentUser?.uid || '',
              participantUids
            ),
          `meetings/${updatedMtg.id}`
        );
      }
    }

    logAudit('UPDATE_CALENDAR_EVENT', 'System', `বার্ষিক ক্যালেন্ডার ইভেন্ট আপডেট করা হয়েছে: ${id}`);
  };

  const deleteCalendarEvent = (id: string) => {
    const existing = calendarEvents.find((e) => e.id === id);
    const updatedList = calendarEvents.filter((ev) => ev.id !== id);
    setCalendarEvents(updatedList);
    syncCalendarSpecialDaysToAttendance(updatedList);
    runCloudWrite(() => deleteCalendarEventFromFirestore(id), `calendarEvents/${id}`);

    if (existing?.linkedMeetingId) {
      const mtgId = existing.linkedMeetingId;
      setMeetings((prev) => prev.filter((m) => m.id !== mtgId));
      runCloudWrite(() => deleteMeetingFromFirestore(mtgId), `meetings/${mtgId}`);
    }

    logAudit(
      'DELETE_CALENDAR_EVENT',
      'System',
      `বার্ষিক ক্যালেন্ডার ইভেন্ট মুছে ফেলা হয়েছে: ${existing?.title || id}`
    );
  };

  const getEmployeeLeaveBalance = (employeeId: string): LeaveBalance => {
    const existing = leaveBalances[employeeId];
    const lp = institutionalLeavePolicy;
    if (existing) {
      return {
        ...existing,
        year: lp.year,
        casualLeaveTotal: existing.isCustomQuota
          ? existing.casualLeaveTotal
          : lp.casualLeaveEnabled
          ? lp.casualLeaveDefault
          : 0,
        sickLeaveTotal: existing.isCustomQuota
          ? existing.sickLeaveTotal
          : lp.sickLeaveEnabled
          ? lp.sickLeaveDefault
          : 0,
        earnedLeaveTotal: existing.isCustomQuota
          ? existing.earnedLeaveTotal
          : lp.earnedLeaveEnabled
          ? lp.earnedLeaveDefault
          : 0,
      };
    }
    return {
      employeeId,
      year: lp.year,
      casualLeaveTotal: lp.casualLeaveEnabled ? lp.casualLeaveDefault : 0,
      casualLeaveUsed: 0,
      sickLeaveTotal: lp.sickLeaveEnabled ? lp.sickLeaveDefault : 0,
      sickLeaveUsed: 0,
      earnedLeaveTotal: lp.earnedLeaveEnabled ? lp.earnedLeaveDefault : 0,
      earnedLeaveUsed: 0,
      dutyLeaveUsed: 0,
      isCustomQuota: false,
    };
  };

  const updateInstitutionalLeavePolicy = (
    updates: Partial<InstitutionalLeavePolicy>,
    applyMode: 'non_custom' | 'all' | 'policy_only' = 'non_custom'
  ) => {
    const nextPolicy: InstitutionalLeavePolicy = {
      ...institutionalLeavePolicy,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.nameBn || currentUser.name,
    };
    setInstitutionalLeavePolicy(nextPolicy);
    runCloudWrite(
      () => syncLeavePolicyToFirestore(nextPolicy, activeUid || auth.currentUser?.uid || ''),
      'settings/institutionalLeavePolicy'
    );

    if (applyMode !== 'policy_only') {
      const nextBalances: Record<string, LeaveBalance> = { ...leaveBalances };
      const updatedBalancesList: LeaveBalance[] = [];
      employees.forEach((emp) => {
        const cur = nextBalances[emp.id] || {
          employeeId: emp.id,
          year: nextPolicy.year,
          casualLeaveTotal: nextPolicy.casualLeaveDefault,
          casualLeaveUsed: 0,
          sickLeaveTotal: nextPolicy.sickLeaveDefault,
          sickLeaveUsed: 0,
          earnedLeaveTotal: nextPolicy.earnedLeaveDefault,
          earnedLeaveUsed: 0,
          dutyLeaveUsed: 0,
          isCustomQuota: false,
        };

        if (applyMode === 'all' || !cur.isCustomQuota) {
          const updatedBal: LeaveBalance = {
            ...cur,
            year: nextPolicy.year,
            casualLeaveTotal: nextPolicy.casualLeaveEnabled ? nextPolicy.casualLeaveDefault : 0,
            sickLeaveTotal: nextPolicy.sickLeaveEnabled ? nextPolicy.sickLeaveDefault : 0,
            earnedLeaveTotal: nextPolicy.earnedLeaveEnabled ? nextPolicy.earnedLeaveDefault : 0,
            isCustomQuota: applyMode === 'all' ? false : cur.isCustomQuota,
          };
          nextBalances[emp.id] = updatedBal;
          updatedBalancesList.push(updatedBal);
        }
      });
      setLeaveBalances(nextBalances);
      if (updatedBalancesList.length > 0) {
        runCloudWrite(async () => {
          const uid = activeUid || auth.currentUser?.uid || '';
          const res = await runChunkedTasks(updatedBalancesList, (b) =>
            syncLeaveBalanceToFirestore(b, empUidMapRef.current[b.employeeId] || uid)
          );
          if (res.errors.length > 0) {
            throw new Error(res.errors[0]);
          }
        }, 'leaveBalances/bulkQuotaUpdate');
      }
    }

    logAudit(
      'UPDATE_LEAVE_POLICY',
      'Leave',
      `প্রাতিষ্ঠানিক ছুটির নীতিমালা হালনাগাদ হয়েছে (CL: ${nextPolicy.casualLeaveEnabled ? nextPolicy.casualLeaveDefault : 'বন্ধ'}, SL: ${nextPolicy.sickLeaveEnabled ? nextPolicy.sickLeaveDefault : 'বন্ধ'}, EL: ${nextPolicy.earnedLeaveEnabled ? nextPolicy.earnedLeaveDefault : 'বন্ধ'})`
    );
  };

  const updateEmployeeLeaveQuota = (
    employeeId: string,
    updates: {
      casualLeaveTotal?: number;
      sickLeaveTotal?: number;
      earnedLeaveTotal?: number;
      isCustomQuota?: boolean;
    }
  ) => {
    const lp = institutionalLeavePolicy;
    const existing = leaveBalances[employeeId] || {
      employeeId,
      year: lp.year,
      casualLeaveTotal: lp.casualLeaveEnabled ? lp.casualLeaveDefault : 0,
      casualLeaveUsed: 0,
      sickLeaveTotal: lp.sickLeaveEnabled ? lp.sickLeaveDefault : 0,
      sickLeaveUsed: 0,
      earnedLeaveTotal: lp.earnedLeaveEnabled ? lp.earnedLeaveDefault : 0,
      earnedLeaveUsed: 0,
      dutyLeaveUsed: 0,
      isCustomQuota: false,
    };

    const isCustom = updates.isCustomQuota !== undefined ? updates.isCustomQuota : true;

    const updatedBal: LeaveBalance = !isCustom
      ? {
          ...existing,
          casualLeaveTotal: lp.casualLeaveEnabled ? lp.casualLeaveDefault : 0,
          sickLeaveTotal: lp.sickLeaveEnabled ? lp.sickLeaveDefault : 0,
          earnedLeaveTotal: lp.earnedLeaveEnabled ? lp.earnedLeaveDefault : 0,
          isCustomQuota: false,
        }
      : {
          ...existing,
          casualLeaveTotal: updates.casualLeaveTotal ?? existing.casualLeaveTotal,
          sickLeaveTotal: updates.sickLeaveTotal ?? existing.sickLeaveTotal,
          earnedLeaveTotal: updates.earnedLeaveTotal ?? existing.earnedLeaveTotal,
          isCustomQuota: true,
        };

    setLeaveBalances((prev) => ({ ...prev, [employeeId]: updatedBal }));
    runCloudWrite(
      () =>
        syncLeaveBalanceToFirestore(
          updatedBal,
          empUidMapRef.current[employeeId] || activeUid || auth.currentUser?.uid || ''
        ),
      `leaveBalances/${employeeId}`
    );

    const emp = employees.find((e) => e.id === employeeId);
    logAudit(
      'UPDATE_EMPLOYEE_LEAVE_QUOTA',
      'Leave',
      `${emp?.nameBn || employeeId}-এর ব্যক্তিগত ছুটির কোটা হালনাগাদ করা হয়েছে।`
    );
  };

  // Derive default institutional and departmental chat groups merged with persisted conversations
  const mergedChatConversations = React.useMemo(() => {
    const activeEmps = employees.filter((e) => e.status === 'Active');
    if (activeEmps.length === 0) return chatConversations;

    const allIds = activeEmps.map((e) => e.id);
    const deptMap = new Map<string, string[]>();
    for (const emp of activeEmps) {
      const dept = (emp.department || 'প্রশাসন').trim();
      if (!dept) continue;
      const list = deptMap.get(dept) || [];
      list.push(emp.id);
      deptMap.set(dept, list);
    }

    const next = [...chatConversations];

    // 1. General Institutional Group (GRP-GENERAL)
    const genIdx = next.findIndex((c) => c.id === 'GRP-GENERAL');
    if (genIdx === -1) {
      next.unshift({
        id: 'GRP-GENERAL',
        type: 'group',
        title: 'ASDRI সাধারণ চ্যানেল (সকল সদস্য)',
        participantEmployeeIds: allIds,
        isDefaultGroup: true,
        createdByEmployeeId: currentUser.id || allIds[0] || 'SYSTEM',
        createdByName: 'ASDRI প্রশাসন',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    } else {
      const existingGen = next[genIdx];
      const mergedIds = Array.from(new Set([...existingGen.participantEmployeeIds, ...allIds]));
      if (mergedIds.length !== existingGen.participantEmployeeIds.length) {
        next[genIdx] = {
          ...existingGen,
          participantEmployeeIds: mergedIds,
        };
      }
    }

    // 2. Departmental Default Groups
    let deptCounter = 1;
    for (const [deptName, memberIds] of deptMap.entries()) {
      let hash = 0;
      for (let i = 0; i < deptName.length; i++) {
        hash = (hash * 31 + deptName.charCodeAt(i)) >>> 0;
      }
      const deptGroupId = `GRP-DEPT-${hash.toString(36).toUpperCase() || deptCounter}`;
      deptCounter++;

      const dIdx = next.findIndex(
        (c) => c.id === deptGroupId || (c.isDefaultGroup && c.department === deptName)
      );
      if (dIdx === -1) {
        next.push({
          id: deptGroupId,
          type: 'group',
          title: `${deptName} বিভাগ`,
          department: deptName,
          participantEmployeeIds: memberIds,
          isDefaultGroup: true,
          createdByEmployeeId: currentUser.id || memberIds[0] || 'SYSTEM',
          createdByName: 'ASDRI প্রশাসন',
          createdAt: '2026-01-01T00:00:00.000Z',
        });
      } else {
        const existingDept = next[dIdx];
        const mergedIds = Array.from(
          new Set([...existingDept.participantEmployeeIds, ...memberIds])
        );
        if (mergedIds.length !== existingDept.participantEmployeeIds.length) {
          next[dIdx] = {
            ...existingDept,
            participantEmployeeIds: mergedIds,
          };
        }
      }
    }

    return next;
  }, [chatConversations, employees, currentUser.id]);

  const getConversationUnreadCount = useCallback(
    (conversationId: string): number => {
      if (!currentUser.id) return 0;
      const conv = mergedChatConversations.find((c) => c.id === conversationId);
      if (!conv) return 0;
      const isParticipant =
        conv.isDefaultGroup || conv.participantEmployeeIds.includes(currentUser.id);
      if (!isParticipant) return 0;

      return chatMessages.filter(
        (m) =>
          m.conversationId === conversationId &&
          m.senderEmployeeId !== currentUser.id &&
          !m.readByEmployeeIds.includes(currentUser.id)
      ).length;
    },
    [mergedChatConversations, chatMessages, currentUser.id]
  );

  const unreadChatCount = React.useMemo(() => {
    if (!currentUser.id) return 0;
    const accessibleIds = new Set(
      mergedChatConversations
        .filter((c) => c.isDefaultGroup || c.participantEmployeeIds.includes(currentUser.id))
        .map((c) => c.id)
    );
    return chatMessages.filter(
      (m) =>
        accessibleIds.has(m.conversationId) &&
        m.senderEmployeeId !== currentUser.id &&
        !m.readByEmployeeIds.includes(currentUser.id)
    ).length;
  }, [mergedChatConversations, chatMessages, currentUser.id]);

  const startDirectChat = useCallback(
    (targetEmployeeId: string): string => {
      const myId = currentUser.id;
      if (!myId || !targetEmployeeId) return '';

      const pair = [myId, targetEmployeeId].sort();
      const sanitizePart = (s: string) => s.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const directId = `DM-${sanitizePart(pair[0])}__${sanitizePart(pair[1])}`;

      const existing = mergedChatConversations.find(
        (c) =>
          c.id === directId ||
          (c.type === 'direct' &&
            c.participantEmployeeIds.length === 2 &&
            c.participantEmployeeIds.includes(myId) &&
            c.participantEmployeeIds.includes(targetEmployeeId))
      );

      if (existing) {
        setActiveChatConversationId(existing.id);
        return existing.id;
      }

      const targetEmp = employees.find((e) => e.id === targetEmployeeId);
      const myName = currentUser.nameBn || currentUser.name;
      const targetName = targetEmp ? targetEmp.nameBn || targetEmp.name : targetEmployeeId;

      const newConv: ChatConversation = {
        id: directId,
        type: 'direct',
        title: `${myName} ও ${targetName}`,
        participantEmployeeIds: pair,
        createdByEmployeeId: myId,
        createdByName: myName,
        createdAt: new Date().toISOString(),
      };

      setChatConversations((prev) => [newConv, ...prev.filter((c) => c.id !== directId)]);
      setActiveChatConversationId(directId);

      const writerUid = activeUid || auth.currentUser?.uid || '';
      if (writerUid) {
        runCloudWrite(
          () =>
            syncChatConversationToFirestore(
              newConv,
              writerUid,
              resolveUidsForEmployeeIds(pair)
            ),
          `chatConversations/${directId}`
        );
      } else {
        markPendingLocalChange();
      }

      return directId;
    },
    [
      currentUser,
      mergedChatConversations,
      employees,
      activeUid,
      runCloudWrite,
      resolveUidsForEmployeeIds,
      markPendingLocalChange,
    ]
  );

  const createGroupChat = useCallback(
    (params: {
      title: string;
      department?: string;
      participantEmployeeIds: string[];
    }): string => {
      const cleanTitle = params.title.trim();
      if (!cleanTitle) return '';
      const myId = currentUser.id || 'ADMIN';
      const myName = currentUser.nameBn || currentUser.name || 'প্রশাসন';
      const members = Array.from(new Set([myId, ...params.participantEmployeeIds])).filter(Boolean);
      const groupId = `GRP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newGroup: ChatConversation = {
        id: groupId,
        type: 'group',
        title: cleanTitle,
        department: params.department?.trim() || undefined,
        participantEmployeeIds: members,
        isDefaultGroup: false,
        createdByEmployeeId: myId,
        createdByName: myName,
        createdAt: new Date().toISOString(),
      };

      setChatConversations((prev) => [newGroup, ...prev]);
      setActiveChatConversationId(groupId);

      const writerUid = activeUid || auth.currentUser?.uid || '';
      if (writerUid) {
        runCloudWrite(
          () =>
            syncChatConversationToFirestore(
              newGroup,
              writerUid,
              resolveUidsForEmployeeIds(members)
            ),
          `chatConversations/${groupId}`
        );
      } else {
        markPendingLocalChange();
      }

      return groupId;
    },
    [
      currentUser,
      activeUid,
      runCloudWrite,
      resolveUidsForEmployeeIds,
      markPendingLocalChange,
    ]
  );

  const updateGroupChatMembers = useCallback(
    (
      conversationId: string,
      params: { title?: string; participantEmployeeIds: string[] }
    ) => {
      const existing = mergedChatConversations.find((c) => c.id === conversationId);
      if (!existing || existing.type !== 'group') return;

      const updatedMembers = Array.from(new Set(params.participantEmployeeIds)).filter(Boolean);
      const updatedConv: ChatConversation = {
        ...existing,
        title: params.title?.trim() || existing.title,
        participantEmployeeIds: updatedMembers,
        updatedAt: new Date().toISOString(),
      };

      setChatConversations((prev) => {
        const existsInPrev = prev.some((c) => c.id === conversationId);
        if (existsInPrev) {
          return prev.map((c) => (c.id === conversationId ? updatedConv : c));
        }
        return [updatedConv, ...prev];
      });

      const writerUid = activeUid || auth.currentUser?.uid || '';
      if (writerUid) {
        runCloudWrite(
          () =>
            syncChatConversationToFirestore(
              updatedConv,
              writerUid,
              resolveUidsForEmployeeIds(updatedMembers)
            ),
          `chatConversations/${conversationId}`
        );
      } else {
        markPendingLocalChange();
      }
    },
    [
      mergedChatConversations,
      activeUid,
      runCloudWrite,
      resolveUidsForEmployeeIds,
      markPendingLocalChange,
    ]
  );

  const deleteGroupChat = useCallback(
    (conversationId: string) => {
      const target = mergedChatConversations.find((c) => c.id === conversationId);
      if (!target || target.isDefaultGroup) return;

      setChatConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeChatConversationId === conversationId) {
        setActiveChatConversationId(null);
      }

      const writerUid = activeUid || auth.currentUser?.uid || '';
      if (writerUid) {
        runCloudWrite(
          () => deleteChatConversationFromFirestore(conversationId),
          `chatConversations/${conversationId}`
        );
      } else {
        markPendingLocalChange();
      }
    },
    [mergedChatConversations, activeChatConversationId, activeUid, runCloudWrite, markPendingLocalChange]
  );

  const sendChatMessage = useCallback(
    (params: {
      conversationId: string;
      text: string;
      replyToMessageId?: string;
      replyToSenderName?: string;
      replyToText?: string;
    }) => {
      const cleanText = params.text.trim();
      if (!cleanText || !params.conversationId) return;

      const myId = currentUser.id || 'USER';
      const myName = currentUser.nameBn || currentUser.name || 'সদস্য';
      const nowIso = new Date().toISOString();
      const msgId = `MSG-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newMsg: ChatMessage = {
        id: msgId,
        conversationId: params.conversationId,
        senderEmployeeId: myId,
        senderName: myName,
        senderRole: currentUser.role,
        text: cleanText,
        replyToMessageId: params.replyToMessageId,
        replyToSenderName: params.replyToSenderName,
        replyToText: params.replyToText,
        readByEmployeeIds: [myId],
        createdAt: nowIso,
      };

      setChatMessages((prev) => [...prev, newMsg]);

      let targetConv = mergedChatConversations.find((c) => c.id === params.conversationId);
      if (targetConv) {
        const updatedConv: ChatConversation = {
          ...targetConv,
          lastMessageText: cleanText.slice(0, 200),
          lastMessageSenderId: myId,
          lastMessageSenderName: myName,
          lastMessageAt: nowIso,
          updatedAt: nowIso,
        };
        targetConv = updatedConv;
        setChatConversations((prev) => {
          const existsInPrev = prev.some((c) => c.id === params.conversationId);
          if (existsInPrev) {
            return prev.map((c) => (c.id === params.conversationId ? updatedConv : c));
          }
          return [updatedConv, ...prev];
        });
      }

      const writerUid = activeUid || auth.currentUser?.uid || '';
      if (writerUid) {
        const convToSync = targetConv;
        runCloudWrite(async () => {
          await syncChatMessageToFirestore(newMsg, writerUid);
          if (convToSync) {
            await syncChatConversationToFirestore(
              convToSync,
              writerUid,
              resolveUidsForEmployeeIds(convToSync.participantEmployeeIds)
            );
          }
        }, `chatMessages/${msgId}`);
      } else {
        markPendingLocalChange();
      }

      // Send in-app notification to conversation participants (except sender)
      if (targetConv) {
        const recipients = targetConv.participantEmployeeIds.filter((id) => id !== myId);
        const preview = cleanText.length > 80 ? `${cleanText.slice(0, 80)}...` : cleanText;
        for (const recId of recipients) {
          const recEmp = employees.find((e) => e.id === recId);
          sendNotification({
            recipientEmployeeId: recId,
            recipientName: recEmp ? recEmp.nameBn || recEmp.name : recId,
            senderEmployeeId: myId,
            senderName: myName,
            title:
              targetConv.type === 'direct'
                ? `${myName} আপনাকে একটি বার্তা পাঠিয়েছেন`
                : `${targetConv.title}-এ ${myName}-এর নতুন বার্তা`,
            message: preview,
            linkType: 'chat',
            linkId: targetConv.id,
            priority: 'normal',
          });
        }
      }
    },
    [
      currentUser,
      mergedChatConversations,
      employees,
      activeUid,
      runCloudWrite,
      resolveUidsForEmployeeIds,
      markPendingLocalChange,
      sendNotification,
    ]
  );

  const markConversationAsRead = useCallback(
    (conversationId: string) => {
      const myId = currentUser.id;
      if (!myId || !conversationId) return;

      const unreadMsgs = chatMessages.filter(
        (m) =>
          m.conversationId === conversationId &&
          m.senderEmployeeId !== myId &&
          !m.readByEmployeeIds.includes(myId)
      );

      if (unreadMsgs.length === 0) return;

      const updatedMsgMap = new Map<string, ChatMessage>();
      for (const m of unreadMsgs) {
        updatedMsgMap.set(m.id, {
          ...m,
          readByEmployeeIds: Array.from(new Set([...m.readByEmployeeIds, myId])),
        });
      }

      setChatMessages((prev) => prev.map((m) => updatedMsgMap.get(m.id) || m));

      // Also mark matching chat notifications for this conversation as read
      setNotifications((prev) =>
        prev.map((n) =>
          n.recipientEmployeeId === myId &&
          n.linkType === 'chat' &&
          n.linkId === conversationId &&
          !n.isRead
            ? { ...n, isRead: true }
            : n
        )
      );

      const writerUid = activeUid || auth.currentUser?.uid || '';
      if (writerUid) {
        const toSync = Array.from(updatedMsgMap.values());
        runCloudWrite(async () => {
          for (const msg of toSync) {
            await markChatMessageReadInFirestore(msg.id, myId, msg, writerUid);
          }
        }, `chatMessages/read`);
      } else {
        markPendingLocalChange();
      }
    },
    [currentUser.id, chatMessages, activeUid, runCloudWrite, markPendingLocalChange]
  );

  const updatePolicy = (newPolicy: Partial<AttendancePolicyConfig>) => {
    const updated = { ...policy, ...newPolicy };
    setPolicy(updated);
    runCloudWrite(
      () => syncAttendancePolicyToFirestore(updated, activeUid || auth.currentUser?.uid || ''),
      'settings/attendancePolicy'
    );
    logAudit(
      'UPDATE_ATTENDANCE_POLICY',
      'System',
      `অফিস সময় ও উপস্থিতি নীতিমালা হালনাগাদ করা হয়েছে (শুরু: ${updated.officeStartTime}, শেষ: ${updated.officeEndTime}, গ্রেস: ${updated.gracePeriodMinutes} মি., ব্যাসার্ধ: ${updated.geofenceRadiusMeters} মি.)`
    );
  };

  return (
    <AppContext.Provider
      value={{
        hydrated,
        isAuthenticated,
        login,
        logout,
        currentUser,
        setCurrentUser,
        currentWorkspace,
        setCurrentWorkspace,
        activeNav,
        setActiveNav,
        focusedMeetingId,
        setFocusedMeetingId,
        focusedCalendarDate,
        setFocusedCalendarDate,
        language,
        setLanguage,
        darkMode,
        setDarkMode,
        deviceId,
        firebaseUser,
        firebaseAuthReady,
        hasDriveToken,
        isCloudAdmin,
        cloudSyncStatus,
        cloudLastSyncedAt,
        cloudSyncError,
        hasPendingLocalChanges,
        clearCloudSyncError,
        signInWithGoogleAccount,
        connectGoogleWorkspace,
        disconnectGoogleWorkspace,
        pushAllLocalToFirestore,
        verifyFirestoreCloudData,
        employees,
        attendanceRecords,
        rawPunches,
        corrections,
        leaveBalances,
        leaveApplications,
        meetings,
        tasks,
        actionTrackerItems,
        notifications,
        managementToDos,
        documents,
        notices,
        auditLogs,
        policy,
        calendarEvents,
        institutionalLeavePolicy,
        chatConversations: mergedChatConversations,
        chatMessages,
        activeChatConversationId,
        setActiveChatConversationId,
        unreadChatCount,
        getConversationUnreadCount,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        executeVerifiedPunch,
        syncOfflinePunches,
        adminEditAttendanceRecord,
        getEmployeeLeaveOnDate,
        getEmployeeLeaveBalance,
        updateInstitutionalLeavePolicy,
        updateEmployeeLeaveQuota,
        createCalendarEvent,
        createCalendarEventsBatch,
        updateCalendarEvent,
        deleteCalendarEvent,
        recordManualPunch,
        ingestZkMachinePunches,
        simulateMachineSync,
        importMachineLogsCSV,
        submitCorrectionRequest,
        approveCorrectionRequest,
        rejectCorrectionRequest,
        submitLeaveApplication,
        recommendLeave,
        finalApproveLeave,
        cancelLeaveApplication,
        createMeeting,
        scheduleMeetingFromCalendar,
        updateMeeting,
        deleteMeeting,
        convertDecisionToTask,
        createTask,
        updateTaskProgress,
        submitTaskForReview,
        reviewTask,
        createActionTrackerItem,
        updateActionTrackerItem,
        deleteActionTrackerItem,
        updateActionTrackerProgress,
        importActionTrackerItems,
        sendNotification,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        createManagementToDo,
        updateManagementToDoStatus,
        createDocument,
        createNotice,
        markNoticeAsRead,
        updatePolicy,
        logAudit,
        startDirectChat,
        createGroupChat,
        updateGroupChatMembers,
        deleteGroupChat,
        sendChatMessage,
        markConversationAsRead,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
