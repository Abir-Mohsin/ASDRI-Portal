# ASDRI Portal Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Identity Integrity (`ownerUid` / `actorUid` / `uid`)**:
   - Non-admin users can only create documents where `ownerUid == request.auth.uid` (or `uid == request.auth.uid`, `senderUid == request.auth.uid`, `actorUid == request.auth.uid`).
   - All authenticated writes require `request.auth.token.email_verified == true`.
2. **RBAC Privilege Isolation**:
   - No user may self-assign admin roles in `/users/{uid}` or create/modify `/admins/{uid}` unless already an authorized admin (`request.auth.token.email == 'abirmohsin02@gmail.com' && email_verified == true` or existing `/admins/{uid}`).
3. **PII Isolation**:
   - Personal `email`, `phone`, and `nidOrPassport` are stored exclusively in `/users/{userId}/private/{docId}` and `/employees/{employeeId}/private/{docId}`, readable only by `isOwner` or `isAdmin()`.
   - Non-admin users cannot list or read other users' private PII, attendance records, leave balances, or leave applications.
4. **Path Variable & Payload Bounds**:
   - Every document ID on single-document operations passes `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
   - Every string validates `.size()` bounds; every array validates `.size() <= 50` and first element type if non-empty.
5. **Temporal Integrity & Immutability**:
   - `createdAt == request.time` on create; `updatedAt == request.time` on create/update; `createdAt` and `ownerUid` are immutable after creation.
   - `auditLogs` are append-only (`allow update, delete: if false`).
6. **Terminal State Locking**:
   - Completed `actionTrackerItems` (`সম্পন্ন` / `Completed`), `tasks` (`Approved` / `Cancelled`), and reviewed `corrections` / `leaveApplications` cannot be mutated by non-admin users.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Unauthenticated Read on Employees**: Anonymous `getDoc(/employees/ASDRI01)` -> `PERMISSION_DENIED`.
2. **Blanket List Scrape on Attendance**: Non-admin `getDocs(collection(db, 'attendanceRecords'))` without `ownerUid == uid` -> `PERMISSION_DENIED`.
3. **PII Leak Attempt**: Non-admin reading `/users/otherUid/private/info` -> `PERMISSION_DENIED`.
4. **Privilege Escalation**: Non-admin creating `/admins/attackerUid` with `role: "super_admin"` -> `PERMISSION_DENIED`.
5. **Unverified Email Admin Spoof**: Token with `email: "abirmohsin02@gmail.com"` and `email_verified: false` writing `/settings/attendancePolicy` -> `PERMISSION_DENIED`.
6. **Shadow Ghost Field Write**: User creating `/corrections/CORR-99` with extra field `isVerifiedBySystem: true` -> `PERMISSION_DENIED`.
7. **Identity Spoofing**: User A creating `/leaveApplications/L-1` with `ownerUid: "userB_uid"` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Creating document at `/calendarEvents/bad..id$with%20spaces` or 300-char ID -> `PERMISSION_DENIED`.
9. **Resource Exhaustion (1MB String)**: Non-admin updating `submissionReport` on an assigned `actionTrackerItems` doc with a 200,000-char string -> `PERMISSION_DENIED`.
10. **Terminal State Bypass**: Assignee updating `actionTrackerItems/ACT-001` after `status == 'সম্পন্ন'` -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Creating `/corrections/CORR-100` with client-supplied past timestamp instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
12. **Audit Log Tampering**: Even an admin attempting `updateDoc` or `deleteDoc` on `/auditLogs/AUD-001` -> `PERMISSION_DENIED`.

## 3. Emulator Verification Test Suite Spec (`firestore.rules.test.ts`)

```ts
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

describe('ASDRI Portal Firestore Rules — Dirty Dozen Suite', () => {
  it('blocks unauthenticated reads and writes', async () => {
    // assertFails(getDoc(doc(unauthDb, 'employees/ASDRI01')))
  });
  it('blocks unverified admin email spoofing', async () => {
    // assertFails(setDoc(doc(spoofedAdminDb, 'settings/attendancePolicy'), ...))
  });
  it('blocks shadow ghost fields, timestamp forgery, and terminal state mutations', async () => {
    // assertFails(...) on all 12 Dirty Dozen cases
    // assertSucceeds(...) for verified abirmohsin02@gmail.com admin & valid owner writes
  });
});
```
