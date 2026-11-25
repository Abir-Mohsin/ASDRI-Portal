import { getApps, getApp, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer,
  type FirestoreSettings,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createFirestoreInstance() {
  const rawDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId?.trim();
  const isCustomDb = Boolean(rawDbId && rawDbId !== '(default)');
  try {
    // Disabling fetch streams prevents Chromium/Next.js 15 unhandled
    // "AbortError: signal is aborted without reason" from WebChannel stream teardown.
    const settings = {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    } as FirestoreSettings;
    return isCustomDb && rawDbId
      ? initializeFirestore(app, settings, rawDbId)
      : initializeFirestore(app, settings);
  } catch {
    return isCustomDb && rawDbId ? getFirestore(app, rawDbId) : getFirestore(app);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);

if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics optional in restricted environments
    });
}

export const WORKSPACE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

// Basic Google Sign-In provider (identity only — NO Drive scope, avoids unverified-scope blocks at login)
const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// Drive-enabled Google provider (used ONLY when connecting Google Drive for file uploads/backups)
const googleProvider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory cache ONLY for Google OAuth access token (never localStorage/sessionStorage)
let isSigningIn = false;
let cachedDriveAccessToken: string | null = null;
let connectionTestStarted = false;
let abortGuardInstalled = false;

export function isBenignAbortError(reason: unknown): boolean {
  if (!reason) return false;
  if (typeof reason === 'object') {
    const err = reason as { name?: string; message?: string };
    if (err.name === 'AbortError') return true;
    if (
      typeof err.message === 'string' &&
      (err.message.includes('signal is aborted without reason') ||
        err.message.includes('The user aborted a request'))
    ) {
      return true;
    }
  }
  if (
    typeof reason === 'string' &&
    (reason.includes('signal is aborted without reason') || reason.includes('AbortError'))
  ) {
    return true;
  }
  return false;
}

function installGlobalAbortErrorGuard(): void {
  if (typeof window === 'undefined' || abortGuardInstalled) return;
  abortGuardInstalled = true;

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      if (isBenignAbortError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      if (isBenignAbortError(event.error) || isBenignAbortError(event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

installGlobalAbortErrorGuard();

export async function testFirestoreConnection(): Promise<void> {
  if (typeof window === 'undefined' || connectionTestStarted) return;
  connectionTestStarted = true;
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isBenignAbortError(error)) return;
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export function initFirebaseAuth(
  onUserChange: (user: User | null, hasDriveToken: boolean) => void
) {
  installGlobalAbortErrorGuard();
  testFirestoreConnection();
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedDriveAccessToken = null;
      onUserChange(null, false);
    } else if (!isSigningIn) {
      onUserChange(user, Boolean(cachedDriveAccessToken));
    }
  });
}

export async function googleSignInBasic(): Promise<{
  user: User;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, basicGoogleProvider);
    return {
      user: result.user,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function googleSignInWithDrive(): Promise<{
  user: User;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedDriveAccessToken = credential?.accessToken || null;
    return {
      user: result.user,
      accessToken: cachedDriveAccessToken || '',
    };
  } finally {
    isSigningIn = false;
  }
}

export async function getDriveAccessToken(): Promise<string | null> {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken(): void {
  cachedDriveAccessToken = null;
}

export async function firebaseGoogleLogout(): Promise<void> {
  cachedDriveAccessToken = null;
  await signOut(auth);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
