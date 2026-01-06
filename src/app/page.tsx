'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import AccumulationBar from '@/components/AccumulationBar';
import { listenAuthState, registerWithEmail, signInAsGuest, signInWithEmail, signOutCurrentUser } from '@/lib/firebase/auth';
import {
  createOrGetPrimaryEndeavor,
  endActiveSession,
  heartbeat,
  listenActiveSession,
  queryAllSessions,
  queryDailyTotals,
  startActiveSession,
  updateEndeavorName
} from '@/lib/firebase/firestore';
import { getOrCreateDeviceId } from '@/lib/device/deviceId';
import { DEFAULT_SESSION_SECONDS, formatDuration, getDayKey } from '@/lib/time';
import { computeAvgDailySec, findMilestone, formatEtaDays } from '@/lib/core/milestones';
import type { ActiveSession, DailyTotal, Endeavor, FocusSession } from '@/types';

function formatHoursMinutes(totalSec: number) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  return `${hours} 小时 ${minutes} 分钟`;
}

export default function Home() {
  const [uid, setUid] = useState<string | null>(null);
  const [endeavor, setEndeavor] = useState<Endeavor | null>(null);
  const [editingName, setEditingName] = useState('');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [remainingSec, setRemainingSec] = useState(DEFAULT_SESSION_SECONDS);
  const [allSessions, setAllSessions] = useState<FocusSession[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [nameStatus, setNameStatus] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(2);

  useEffect(() => {
    const unsubscribe = listenAuthState((user) => {
      setAuthUser(user);
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!uid) return;
    const [sessions, totals] = await Promise.all([queryAllSessions(uid), queryDailyTotals({ uid })]);
    setAllSessions(sessions);
    setDailyTotals(totals);
  }, [uid]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const init = async () => {
      if (!uid) {
        setEndeavor(null);
        setEditingName('');
        setAllSessions([]);
        setDailyTotals([]);
        setActiveSession(null);
        setDataLoading(false);
        return;
      }
      setDataLoading(true);
      try {
        const primary = await createOrGetPrimaryEndeavor(uid);
        setEndeavor(primary);
        setEditingName(primary.name);
        await refreshSessions();
        unsub = listenActiveSession(uid, (session) => setActiveSession(session));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '初始化失败');
      } finally {
        setDataLoading(false);
      }
    };
    init();
    return () => {
      if (unsub) unsub();
    };
  }, [refreshSessions, uid]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') {
      setRemainingSec(DEFAULT_SESSION_SECONDS);
      return undefined;
    }
    const tick = () => {
      const startAt = new Date(activeSession.startAt);
      const elapsed = Math.floor((Date.now() - startAt.getTime()) / 1000);
      setRemainingSec(Math.max(0, activeSession.durationSec - elapsed));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  useEffect(() => {
    if (!uid || !activeSession || activeSession.status !== 'active' || !deviceId || activeSession.deviceId !== deviceId)
      return undefined;
    const beat = () => heartbeat(uid, deviceId).catch(() => undefined);
    const interval = setInterval(beat, 45000);
    return () => clearInterval(interval);
  }, [activeSession, deviceId, uid]);

  const handleStart = async () => {
    if (!endeavor || !uid) return;
    setStatus(null);
    try {
      await startActiveSession({ uid, endeavorId: endeavor.id ?? '', deviceId, durationSec: DEFAULT_SESSION_SECONDS });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法开始专注');
    }
  };

  const handleEnd = async () => {
    if (!uid) return;
    setStatus(null);
    try {
      await endActiveSession({ uid, deviceId });
      await refreshSessions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '结束失败');
    }
  };

  const handleRename = async () => {
    if (!endeavor?.id || editingName.trim().length === 0) return;
    setNameStatus(null);
    setSavingName(true);
    const nextName = editingName.trim();
    try {
      await updateEndeavorName(endeavor.id, nextName);
      setEndeavor({ ...endeavor, name: nextName });
      setNameStatus({ message: '名称已保存', variant: 'success' });
    } catch (error) {
      setNameStatus({
        message: error instanceof Error ? error.message : '名称保存失败',
        variant: 'error'
      });
    } finally {
      setSavingName(false);
    }
  };

  const todayKey = getDayKey();
  const todayTotalSec = dailyTotals.find((d) => d.dayKey === todayKey)?.totalSec ?? 0;
  const totalFocusSec = allSessions.reduce((acc, cur) => acc + cur.durationSec, 0);
  const milestoneInfo = findMilestone(totalFocusSec);
  const avgDailySec = computeAvgDailySec(dailyTotals, 14);
  const etaText = formatEtaDays(milestoneInfo.remainingSec, avgDailySec);
  const focusPercent = todayTotalSec / 86400;

  const isLockedByOther = activeSession && activeSession.status === 'active' && activeSession.deviceId !== deviceId;
  const isActiveLocally = activeSession && activeSession.status === 'active' && activeSession.deviceId === deviceId;

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setAuthStatus('请输入邮箱和密码');
      return;
    }
    setAuthStatus(null);
    setAuthBusy(true);
    try {
      if (authMode === 'signin') {
        await signInWithEmail(email, password);
        setAuthStatus('登录成功');
      } else {
        await registerWithEmail(email, password);
        setAuthStatus('注册成功，已自动登录');
      }
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : '账号操作失败');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGuestLogin = async () => {
    setAuthStatus(null);
    setAuthBusy(true);
    try {
      await signInAsGuest();
      setAuthStatus('已使用匿名身份登录，可随时升级为邮箱账号');
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : '匿名登录失败');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthStatus(null);
    setAuthBusy(true);
    try {
      await signOutCurrentUser();
      setStatus(null);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : '退出失败');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <main className="layout-grid">
      <section className="section-card">
        <div className="section-title">账号登录</div>
        <p className="text-sm text-slate-400 mb-3">使用邮箱密码可以在不同设备之间同步数据，匿名登录适合快速试用。</p>
        {authStatus && <p className="text-amber-300 text-sm mb-2 break-all">{authStatus}</p>}
        {!authReady ? (
          <p className="text-slate-400">正在检查登录状态...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">邮箱</label>
                <input
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">密码</label>
                <input
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                  type="password"
                  placeholder="不少于 6 位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button className="button-primary" onClick={handleEmailAuth} disabled={authBusy}>
                {authMode === 'signin' ? '邮箱登录' : '注册并登录'}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500 transition"
                onClick={() => setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))}
                disabled={authBusy}
              >
                {authMode === 'signin' ? '切换到注册' : '已有账号，去登录'}
              </button>
              <button
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500 transition"
                onClick={handleGuestLogin}
                disabled={authBusy}
              >
                使用匿名身份
              </button>
              {uid && (
                <button
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500 transition"
                  onClick={handleSignOut}
                  disabled={authBusy}
                >
                  退出登录
                </button>
              )}
            </div>
            <div className="mt-3 text-sm text-slate-300">
              {uid ? (
                <p>
                  当前账号：{authUser?.email ?? '匿名用户'} {authUser?.isAnonymous && '(匿名)'}
                </p>
              ) : (
                <p>当前未登录，请先选择登录方式。</p>
              )}
            </div>
          </>
        )}
      </section>

      {!uid && authReady && (
        <section className="section-card">
          <p className="text-slate-300 text-sm">登录后即可开始记录专注时长，邮箱账号可在不同平台复用。</p>
        </section>
      )}

      {uid && (
        <>
          <header className="section-card">
            <p className="text-sm text-slate-300">主线事业</p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
              <input
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 w-full sm:w-auto"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleRename}
                placeholder="输入事业名称"
              />
              <button className="button-primary sm:w-auto" onClick={handleRename} disabled={savingName}>
                保存名称
              </button>
            </div>
            {nameStatus && (
              <p
                className={`text-sm mt-1 ${nameStatus.variant === 'success' ? 'text-emerald-300' : 'text-amber-300'}`}
              >
                {nameStatus.message}
              </p>
            )}
            <p className="text-slate-400 text-sm mt-2">默认只存在一个 active 主线事业，轻量改名入口。</p>
          </header>

          <section className="section-card">
            <div className="section-title">计时控制区</div>
            {status && <p className="text-amber-300 text-sm mb-2 break-all">{status}</p>}
            {dataLoading ? (
              <p className="text-slate-400">加载中...</p>
            ) : isLockedByOther ? (
              <div className="space-y-3">
                <p className="text-xl font-semibold text-amber-400">另一设备正在专注</p>
                <p className="text-slate-400 text-sm">当前设备不可开始，等待对方结束。</p>
                <button className="button-primary" disabled>
                  开始专注
                </button>
              </div>
            ) : isActiveLocally ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="text-5xl font-mono text-sky-200">{formatDuration(remainingSec)}</div>
                  <div className="text-slate-400 text-sm">
                    <p>开始于：{new Date(activeSession.startAt).toLocaleTimeString()}</p>
                    <p>心跳每 45 秒自动续约</p>
                  </div>
                </div>
                <button className="button-primary" onClick={handleEnd}>
                  结束
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-5xl font-mono text-slate-200">{formatDuration(DEFAULT_SESSION_SECONDS)}</div>
                <button className="button-primary" onClick={handleStart} disabled={!deviceId || !uid}>
                  开始专注
                </button>
                <p className="text-slate-400 text-sm">开始专注需联网并写入 active session。</p>
              </div>
            )}
          </section>

          <section className="section-card">
            <div className="section-title">统计与可视化</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">今日专注时间</p>
                <p className="text-2xl font-semibold">{formatDuration(todayTotalSec)}</p>
              </div>
              <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">今日专注度</p>
                <p className="text-2xl font-semibold">{(focusPercent * 100).toFixed(1)}%</p>
              </div>
              <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">累计专注时间</p>
                <p className="text-2xl font-semibold">{formatHoursMinutes(totalFocusSec)}</p>
              </div>
              <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700">
                <p className="text-slate-400 text-sm">下一个里程碑</p>
                <p className="text-xl font-semibold">
                  {milestoneInfo.nextMilestone ? `${milestoneInfo.nextMilestone} 小时` : '已超越所有里程碑'}
                </p>
                <p className="text-slate-400 text-sm mt-1">ETA: {milestoneInfo.nextMilestone ? etaText : 'N/A'}</p>
              </div>
            </div>
            <AccumulationBar
              totalFocusSec={totalFocusSec}
              nextMilestoneHour={milestoneInfo.nextMilestone}
              prevMilestoneHour={milestoneInfo.prevMilestone}
              zoomLevel={zoomLevel}
              onZoomChange={setZoomLevel}
            />
          </section>
        </>
      )}
    </main>
  );
}
