import {
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  where,
  deleteField,
  Timestamp
} from 'firebase/firestore';
import { firestore } from './client';
import { DEFAULT_SESSION_SECONDS, getDayKey, getWeekKey } from '../time';
import type { ActiveSession, DailyStat, FocusSession, GlobalStat, MainCareer, UserProfile, WeeklyStat } from '@/types';

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const userRef = doc(firestore, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return { ...(snap.data() as UserProfile), id: snap.id };
}

export async function listMainCareers(uid: string): Promise<MainCareer[]> {
  const careersRef = collection(firestore, 'mainCareers');
  const careersQuery = query(careersRef, where('user_uid', '==', uid), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(careersQuery);
  return snapshot.docs.map((docSnap) => ({ ...(docSnap.data() as MainCareer), id: docSnap.id }));
}

export async function createAndActivateMainCareer(params: { uid: string; title: string }): Promise<string> {
  const { uid, title } = params;
  const trimmedTitle = title.trim();
  if (trimmedTitle.length < 2 || trimmedTitle.length > 30) {
    throw new Error('主线名称需为 2~30 个字符');
  }
  const careersRef = collection(firestore, 'mainCareers');
  const newCareerRef = doc(careersRef);
  const userRef = doc(firestore, 'users', uid);
  const activeSessionRef = doc(firestore, 'users', uid, 'active_session', 'current');
  const nowKey = getDayKey();
  const nowTimestamp = Timestamp.now();
  await runTransaction(firestore, async (tx) => {
    const activeSnap = await tx.get(activeSessionRef);
    if (activeSnap.exists()) {
      const activeData = activeSnap.data() as ActiveSession;
      if (activeData.status === 'active') {
        throw new Error('请先结束当前专注');
      }
    }

    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() as UserProfile | undefined;
    const existingActiveId = userData?.activeMainCareerId ?? null;
    if (existingActiveId) {
      const oldCareerRef = doc(firestore, 'mainCareers', existingActiveId);
      const oldCareerSnap = await tx.get(oldCareerRef);
      if (oldCareerSnap.exists()) {
        tx.update(oldCareerRef, { status: 'archived', archivedAt: nowTimestamp });
      }
    }

    tx.set(newCareerRef, {
      user_uid: uid,
      title: trimmedTitle,
      status: 'active',
      createdAt: nowTimestamp,
      activatedAt: nowTimestamp,
      totalFocusSec: 0,
      totalSessions: 0
    });

    const nextProfile: Partial<UserProfile> = {
      activeMainCareerId: newCareerRef.id,
      totalFocusSec: userData?.totalFocusSec ?? 0,
      todayFocusSec: userData?.todayFocusSec ?? 0,
      todayKey: userData?.todayKey ?? nowKey
    };
    tx.set(userRef, nextProfile, { merge: true });
  });

  return newCareerRef.id;
}

export async function activateMainCareer(params: { uid: string; mainCareerId: string }) {
  const { uid, mainCareerId } = params;
  const userRef = doc(firestore, 'users', uid);
  const targetRef = doc(firestore, 'mainCareers', mainCareerId);
  const activeSessionRef = doc(firestore, 'users', uid, 'active_session', 'current');
  const nowTimestamp = Timestamp.now();
  await runTransaction(firestore, async (tx) => {
    const activeSnap = await tx.get(activeSessionRef);
    if (activeSnap.exists()) {
      const activeData = activeSnap.data() as ActiveSession;
      if (activeData.status === 'active') {
        throw new Error('请先结束当前专注');
      }
    }

    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() as UserProfile | undefined;
    const existingActiveId = userData?.activeMainCareerId ?? null;

    const targetSnap = await tx.get(targetRef);
    if (!targetSnap.exists()) throw new Error('目标主线不存在');
    const targetData = targetSnap.data() as MainCareer;
    if (targetData.user_uid !== uid) throw new Error('无权限操作');

    if (existingActiveId && existingActiveId !== mainCareerId) {
      const oldCareerRef = doc(firestore, 'mainCareers', existingActiveId);
      const oldCareerSnap = await tx.get(oldCareerRef);
      if (oldCareerSnap.exists()) {
        tx.update(oldCareerRef, { status: 'archived', archivedAt: nowTimestamp });
      }
    }

    tx.update(targetRef, {
      status: 'active',
      activatedAt: nowTimestamp,
      archivedAt: deleteField()
    });
    const nowKey = getDayKey();
    tx.set(
      userRef,
      {
        activeMainCareerId: mainCareerId,
        totalFocusSec: userData?.totalFocusSec ?? 0,
        todayFocusSec: userData?.todayFocusSec ?? 0,
        todayKey: userData?.todayKey ?? nowKey
      },
      { merge: true }
    );
  });
}

export async function archiveActiveMainCareer(uid: string) {
  const userRef = doc(firestore, 'users', uid);
  const activeSessionRef = doc(firestore, 'users', uid, 'active_session', 'current');
  const nowTimestamp = Timestamp.now();
  await runTransaction(firestore, async (tx) => {
    const activeSnap = await tx.get(activeSessionRef);
    if (activeSnap.exists()) {
      const activeData = activeSnap.data() as ActiveSession;
      if (activeData.status === 'active') {
        throw new Error('请先结束当前专注');
      }
    }

    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() as UserProfile | undefined;
    const activeMainCareerId = userData?.activeMainCareerId ?? null;
    if (!activeMainCareerId) throw new Error('当前没有 active 主线');
    const careerRef = doc(firestore, 'mainCareers', activeMainCareerId);
    const careerSnap = await tx.get(careerRef);
    if (!careerSnap.exists()) throw new Error('主线不存在');
    tx.update(careerRef, { status: 'archived', archivedAt: nowTimestamp });
    const nowKey = getDayKey();
    tx.set(
      userRef,
      {
        activeMainCareerId: null,
        totalFocusSec: userData?.totalFocusSec ?? 0,
        todayFocusSec: userData?.todayFocusSec ?? 0,
        todayKey: userData?.todayKey ?? nowKey
      },
      { merge: true }
    );
  });
}

export async function updateMainCareerTitle(params: { uid: string; mainCareerId: string; title: string }) {
  const { uid, mainCareerId, title } = params;
  const trimmedTitle = title.trim();
  if (trimmedTitle.length < 2 || trimmedTitle.length > 30) {
    throw new Error('主线名称需为 2~30 个字符');
  }
  const careerRef = doc(firestore, 'mainCareers', mainCareerId);
  const activeSessionRef = doc(firestore, 'users', uid, 'active_session', 'current');
  await runTransaction(firestore, async (tx) => {
    const activeSnap = await tx.get(activeSessionRef);
    if (activeSnap.exists()) {
      const activeData = activeSnap.data() as ActiveSession;
      if (activeData.status === 'active') {
        throw new Error('请先结束当前专注');
      }
    }

    const careerSnap = await tx.get(careerRef);
    if (!careerSnap.exists()) throw new Error('主线不存在');
    const careerData = careerSnap.data() as MainCareer;
    if (careerData.user_uid !== uid) throw new Error('无权限操作');
    if (careerData.status === 'archived') throw new Error('归档主线不可修改');

    tx.update(careerRef, { title: trimmedTitle });
  });
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
  mainCareerId: string;
  deviceId: string;
  durationSec?: number;
}): Promise<ActiveSession> {
  const { uid, mainCareerId, deviceId, durationSec = DEFAULT_SESSION_SECONDS } = params;
  const activeRef = doc(firestore, 'users', uid, 'active_session', 'current');
  const userRef = doc(firestore, 'users', uid);
  const careerRef = doc(firestore, 'mainCareers', mainCareerId);
  const nowIso = new Date().toISOString();
  await runTransaction(firestore, async (tx) => {
    const existing = await tx.get(activeRef);
    const data = existing.data() as ActiveSession | undefined;
    if (existing.exists() && data?.status === 'active') {
      throw new Error('已有 active session 正在运行，拒绝重复开始');
    }
    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() as UserProfile | undefined;
    if (!userData?.activeMainCareerId) {
      throw new Error('请先创建并激活主线');
    }
    if (userData.activeMainCareerId !== mainCareerId) {
      throw new Error('当前主线已变更，请刷新');
    }
    const careerSnap = await tx.get(careerRef);
    if (!careerSnap.exists()) throw new Error('主线不存在');
    const careerData = careerSnap.data() as MainCareer;
    if (careerData.status !== 'active') throw new Error('主线未激活');
    tx.set(activeRef, {
      mainCareerId,
      startAt: nowIso,
      durationSec,
      deviceId,
      heartbeatAt: nowIso,
      status: 'active'
    });
  });
  return { mainCareerId, startAt: nowIso, durationSec, deviceId, heartbeatAt: nowIso, status: 'active' };
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
  const userRef = doc(firestore, 'users', uid);
  const now = new Date();
  const nowIso = now.toISOString();
  const nowTimestamp = Timestamp.fromDate(now);
  const todayKey = getDayKey(now, timeZone);
  const weekKey = getWeekKey(now, timeZone);
  let createdSessionId: string | null = null;
  let capturedDuration = 0;
  await runTransaction(firestore, async (tx) => {
    const activeSnap = await tx.get(activeRef);
    if (!activeSnap.exists()) throw new Error('没有 active session 可结束');
    const data = activeSnap.data() as ActiveSession;
    if (data.status !== 'active') throw new Error('session 已结束');
    if (data.deviceId !== deviceId) throw new Error('session 不属于当前设备');
    const userSnap = await tx.get(userRef);
    const userData = userSnap.data() as UserProfile | undefined;
    if (!userData?.activeMainCareerId) throw new Error('当前没有 active 主线');
    if (userData.activeMainCareerId !== data.mainCareerId) throw new Error('主线已变更，请刷新');
    const careerRef = doc(firestore, 'mainCareers', data.mainCareerId);
    const careerSnap = await tx.get(careerRef);
    if (!careerSnap.exists()) throw new Error('主线不存在');
    const careerData = careerSnap.data() as MainCareer;
    if (careerData.status !== 'active') throw new Error('主线未激活');

    const startAt = new Date(data.startAt);
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - startAt.getTime()) / 1000));
    const actualDurationSec = Math.min(elapsedSec, DEFAULT_SESSION_SECONDS);
    capturedDuration = actualDurationSec;
    const sessionRef = doc(collection(firestore, 'sessions'));
    createdSessionId = sessionRef.id;
    tx.set(sessionRef, {
      user_uid: uid,
      mainCareerId: data.mainCareerId,
      startAt: data.startAt,
      durationSec: actualDurationSec,
      dayKey: todayKey,
      createdAt: nowTimestamp
    });
    const dailyRef = doc(firestore, 'daily_stats', `${uid}_${todayKey}`);
    const dailySnap = await tx.get(dailyRef);
    const dailyData = dailySnap.data() as DailyStat | undefined;
    const nextDailyFocus = (dailyData?.totalFocusSec ?? 0) + actualDurationSec;
    const nextDailySessions = (dailyData?.totalSessions ?? 0) + 1;
    tx.set(
      dailyRef,
      {
        user_uid: uid,
        dayKey: todayKey,
        totalFocusSec: nextDailyFocus,
        totalSessions: nextDailySessions,
        updatedAt: nowTimestamp
      },
      { merge: true }
    );
    const weeklyRef = doc(firestore, 'weekly_stats', `${uid}_${weekKey}`);
    const weeklySnap = await tx.get(weeklyRef);
    const weeklyData = weeklySnap.data() as WeeklyStat | undefined;
    const nextWeeklyFocus = (weeklyData?.totalFocusSec ?? 0) + actualDurationSec;
    const nextWeeklySessions = (weeklyData?.totalSessions ?? 0) + 1;
    tx.set(
      weeklyRef,
      {
        user_uid: uid,
        weekKey: weekKey,
        totalFocusSec: nextWeeklyFocus,
        totalSessions: nextWeeklySessions,
        updatedAt: nowTimestamp
      },
      { merge: true }
    );
    const globalRef = doc(firestore, 'global_stats', uid);
    const globalSnap = await tx.get(globalRef);
    const globalData = globalSnap.data() as GlobalStat | undefined;
    const nextGlobalFocus = (globalData?.totalFocusSec ?? 0) + actualDurationSec;
    const nextGlobalSessions = (globalData?.totalSessions ?? 0) + 1;
    tx.set(
      globalRef,
      {
        user_uid: uid,
        totalFocusSec: nextGlobalFocus,
        totalSessions: nextGlobalSessions,
        updatedAt: nowTimestamp
      },
      { merge: true }
    );
    const nextCareerFocus = (careerData.totalFocusSec ?? 0) + actualDurationSec;
    const nextCareerSessions = (careerData.totalSessions ?? 0) + 1;
    tx.update(careerRef, {
      totalFocusSec: nextCareerFocus,
      totalSessions: nextCareerSessions
    });
    const nextTodayFocus =
      userData?.todayKey === todayKey ? (userData?.todayFocusSec ?? 0) + actualDurationSec : actualDurationSec;
    const nextUserTotalFocus = (userData?.totalFocusSec ?? 0) + actualDurationSec;
    if (userSnap.exists()) {
      tx.update(userRef, {
        totalFocusSec: nextUserTotalFocus,
        todayFocusSec: nextTodayFocus,
        todayKey: todayKey
      });
    } else {
      tx.set(userRef, {
        activeMainCareerId: data.mainCareerId,
        totalFocusSec: nextUserTotalFocus,
        todayFocusSec: nextTodayFocus,
        todayKey: todayKey
      });
    }
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
}): Promise<DailyStat[]> {
  const { uid, lastNDays = 14, timeZone } = params;
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (lastNDays - 1));
  const startKey = getDayKey(startDate, timeZone);
  const statsRef = collection(firestore, 'daily_stats');
  const statsQuery = query(
    statsRef,
    where('user_uid', '==', uid),
    where('dayKey', '>=', startKey),
    orderBy('dayKey', 'desc')
  );
  const snapshot = await getDocs(statsQuery);
  return snapshot.docs
    .map((docSnap) => ({ ...(docSnap.data() as DailyStat), id: docSnap.id }))
    .sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1));
}

export async function queryWeeklyStats(params: { uid: string; lastNWeeks?: number }): Promise<WeeklyStat[]> {
  const { uid, lastNWeeks = 6 } = params;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (lastNWeeks - 1) * 7);
  const startWeekKey = getWeekKey(startDate);
  const statsRef = collection(firestore, 'weekly_stats');
  const statsQuery = query(
    statsRef,
    where('user_uid', '==', uid),
    where('weekKey', '>=', startWeekKey),
    orderBy('weekKey', 'desc')
  );
  const snapshot = await getDocs(statsQuery);
  return snapshot.docs
    .map((docSnap) => ({ ...(docSnap.data() as WeeklyStat), id: docSnap.id }))
    .sort((a, b) => (a.weekKey < b.weekKey ? -1 : 1));
}

export async function fetchGlobalStats(uid: string): Promise<GlobalStat | null> {
  const globalRef = doc(firestore, 'global_stats', uid);
  const snap = await getDoc(globalRef);
  if (!snap.exists()) return null;
  return { ...(snap.data() as GlobalStat), id: snap.id };
}
