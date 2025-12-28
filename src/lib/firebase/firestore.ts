import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where
} from 'firebase/firestore';
import { firestore } from './client';
import { DEFAULT_SESSION_SECONDS, getDayKey } from '../time';
import type { ActiveSession, DailyTotal, Endeavor, FocusSession } from '@/types';

export async function createOrGetPrimaryEndeavor(uid: string, defaultName = '我的主线事业'): Promise<Endeavor> {
  const endeavorsRef = collection(firestore, 'endeavors');
  const primaryQuery = query(endeavorsRef, where('user_uid', '==', uid), where('isPrimary', '==', true), limit(1));
  const existing = await getDocs(primaryQuery);
  if (!existing.empty) {
    const docSnap = existing.docs[0];
    return { ...(docSnap.data() as Endeavor), id: docSnap.id };
  }
  const now = new Date().toISOString();
  const docRef = await addDoc(endeavorsRef, {
    user_uid: uid,
    name: defaultName,
    isPrimary: true,
    status: 'active',
    createdAt: now,
    updatedAt: now
  });
  return {
    id: docRef.id,
    user_uid: uid,
    name: defaultName,
    isPrimary: true,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
}

export async function updateEndeavorName(endeavorId: string, name: string) {
  const ref = doc(firestore, 'endeavors', endeavorId);
  await updateDoc(ref, { name, updatedAt: new Date().toISOString() });
}

export function listenActiveSession(uid: string, onChange: (session: ActiveSession | null) => void) {
  const activeRef = doc(firestore, 'users', uid, 'active_session', 'current');
  return onSnapshot(activeRef, (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange(snap.data() as ActiveSession);
  });
}

export async function startActiveSession(params: {
  uid: string;
  endeavorId: string;
  deviceId: string;
  durationSec?: number;
}): Promise<ActiveSession> {
  const { uid, endeavorId, deviceId, durationSec = DEFAULT_SESSION_SECONDS } = params;
  const activeRef = doc(firestore, 'users', uid, 'active_session', 'current');
  const nowIso = new Date().toISOString();
  await runTransaction(firestore, async (tx) => {
    const existing = await tx.get(activeRef);
    const data = existing.data() as ActiveSession | undefined;
    if (existing.exists() && data?.status === 'active') {
      throw new Error('已有 active session 正在运行，拒绝重复开始');
    }
    tx.set(activeRef, {
      endeavorId,
      startAt: nowIso,
      durationSec,
      deviceId,
      heartbeatAt: nowIso,
      status: 'active'
    });
  });
  return { endeavorId, startAt: nowIso, durationSec, deviceId, heartbeatAt: nowIso, status: 'active' };
}

export async function heartbeat(uid: string, deviceId: string) {
  const activeRef = doc(firestore, 'users', uid, 'active_session', 'current');
  const heartbeatAt = new Date().toISOString();
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(activeRef);
    if (!snap.exists()) throw new Error('没有可用的 active session');
    const data = snap.data() as ActiveSession;
    if (data.deviceId !== deviceId) throw new Error('session 被其他设备占用');
    if (data.status !== 'active') throw new Error('session 已结束');
    tx.update(activeRef, { heartbeatAt });
  });
  return heartbeatAt;
}

export async function endActiveSession(params: {
  uid: string;
  deviceId: string;
  timeZone?: string;
}): Promise<{ durationSec: number; sessionId: string } | null> {
  const { uid, deviceId, timeZone } = params;
  const activeRef = doc(firestore, 'users', uid, 'active_session', 'current');
  const now = new Date();
  const nowIso = now.toISOString();
  let createdSessionId: string | null = null;
  let capturedDuration = 0;
  await runTransaction(firestore, async (tx) => {
    const activeSnap = await tx.get(activeRef);
    if (!activeSnap.exists()) throw new Error('没有 active session 可结束');
    const data = activeSnap.data() as ActiveSession;
    if (data.status !== 'active') throw new Error('session 已结束');
    if (data.deviceId !== deviceId) throw new Error('session 不属于当前设备');

    const startAt = new Date(data.startAt);
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - startAt.getTime()) / 1000));
    const actualDurationSec = Math.min(elapsedSec, DEFAULT_SESSION_SECONDS);
    capturedDuration = actualDurationSec;
    const sessionRef = doc(collection(firestore, 'sessions'));
    createdSessionId = sessionRef.id;
    tx.set(sessionRef, {
      user_uid: uid,
      endeavorId: data.endeavorId,
      startAt: data.startAt,
      durationSec: actualDurationSec,
      dayKey: getDayKey(now, timeZone),
      createdAt: nowIso
    });
    tx.update(activeRef, { status: 'ended', heartbeatAt: nowIso });
  });
  if (!createdSessionId) return null;
  return { durationSec: capturedDuration, sessionId: createdSessionId };
}

export async function querySessionsByDay(uid: string, dayKey: string): Promise<FocusSession[]> {
  const sessionsRef = collection(firestore, 'sessions');
  const sessionsQuery = query(
    sessionsRef,
    where('user_uid', '==', uid),
    where('dayKey', '==', dayKey),
    orderBy('startAt', 'desc')
  );
  const snapshot = await getDocs(sessionsQuery);
  return snapshot.docs.map((docSnap) => ({ ...(docSnap.data() as FocusSession), id: docSnap.id }));
}

export async function queryAllSessions(uid: string): Promise<FocusSession[]> {
  const sessionsRef = collection(firestore, 'sessions');
  const sessionsQuery = query(sessionsRef, where('user_uid', '==', uid), orderBy('startAt', 'desc'));
  const snapshot = await getDocs(sessionsQuery);
  return snapshot.docs.map((docSnap) => ({ ...(docSnap.data() as FocusSession), id: docSnap.id }));
}

export async function queryDailyTotals(params: {
  uid: string;
  lastNDays?: number;
  timeZone?: string;
}): Promise<DailyTotal[]> {
  const { uid, lastNDays = 14, timeZone } = params;
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (lastNDays - 1));
  const sessionsRef = collection(firestore, 'sessions');
  const sessionsQuery = query(
    sessionsRef,
    where('user_uid', '==', uid),
    where('startAt', '>=', startDate.toISOString()),
    orderBy('startAt', 'desc')
  );
  const snapshot = await getDocs(sessionsQuery);
  const totals = new Map<string, number>();
  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as FocusSession;
    const key = getDayKey(new Date(data.startAt), timeZone);
    totals.set(key, (totals.get(key) ?? 0) + data.durationSec);
  });
  return Array.from(totals.entries())
    .map(([day, totalSec]) => ({ dayKey: day, totalSec }))
    .sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1));
}
