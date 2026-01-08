'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import AccumulationBar from '@/components/AccumulationBar';
import StatProgressBar from '@/components/StatProgressBar';
import {
  linkGuestWithEmail,
  listenAuthState,
  registerWithEmail,
  signInAsGuest,
  signInWithEmail,
  signOutCurrentUser
} from '@/lib/firebase/auth';
import {
  activateMainCareer,
  archiveActiveMainCareer,
  createAndActivateMainCareer,
  endActiveSession,
  fetchGlobalStats,
  fetchUserProfile,
  heartbeat,
  listenActiveSession,
  listMainCareers,
  queryAllSessions,
  queryDailyTotals,
  queryWeeklyStats,
  startActiveSession,
  updateMainCareerTitle
} from '@/lib/firebase/firestore';
import { getOrCreateDeviceId } from '@/lib/device/deviceId';
import { DEFAULT_SESSION_SECONDS, formatDuration, getDayKey, getWeekKey } from '@/lib/time';
import { computeAvgDailySec, findMilestone, formatEtaDays } from '@/lib/core/milestones';
import type { ActiveSession, DailyStat, FocusSession, GlobalStat, MainCareer, UserProfile, WeeklyStat } from '@/types';
import type { Timestamp } from 'firebase/firestore';

function formatHoursMinutes(totalSec: number) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  return `${hours} 小时 ${minutes} 分钟`;
}

export default function Home() {
  const [uid, setUid] = useState<string | null>(null);
  const [mainCareers, setMainCareers] = useState<MainCareer[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newCareerName, setNewCareerName] = useState('');
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
  const [dailyTotals, setDailyTotals] = useState<DailyStat[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStat[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStat | null>(null);
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
    const [sessions, totals, weeks, global] = await Promise.all([
      queryAllSessions(uid),
      queryDailyTotals({ uid }),
      queryWeeklyStats({ uid }),
      fetchGlobalStats(uid)
    ]);
    setAllSessions(sessions);
    setDailyTotals(totals);
    setWeeklyStats(weeks);
    setGlobalStats(global);
  }, [uid]);

  const refreshMainCareers = useCallback(async () => {
    if (!uid) return;
    const [careers, profile] = await Promise.all([listMainCareers(uid), fetchUserProfile(uid)]);
    setMainCareers(careers);
    setUserProfile(profile);
  }, [uid]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const init = async () => {
      if (!uid) {
        setMainCareers([]);
        setUserProfile(null);
        setEditingName('');
        setNewCareerName('');
        setAllSessions([]);
        setDailyTotals([]);
        setWeeklyStats([]);
        setGlobalStats(null);
        setActiveSession(null);
        setDataLoading(false);
        return;
      }
      setDataLoading(true);
      try {
        await Promise.all([refreshSessions(), refreshMainCareers()]);
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
  }, [refreshMainCareers, refreshSessions, uid]);

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
    if (!activeMainCareer || !uid) return;
    setStatus(null);
    try {
      await startActiveSession({
        uid,
        mainCareerId: activeMainCareer.id ?? '',
        deviceId,
        durationSec: DEFAULT_SESSION_SECONDS
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法开始专注');
    }
  };

  const handleEnd = async () => {
    if (!uid) return;
    setStatus(null);
    try {
      await endActiveSession({ uid, deviceId });
      await Promise.all([refreshSessions(), refreshMainCareers()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '结束失败');
    }
  };

  const handleRename = async () => {
    if (!activeMainCareer?.id || editingName.trim().length === 0) return;
    setNameStatus(null);
    setSavingName(true);
    const nextName = editingName.trim();
    try {
      await updateMainCareerTitle({ uid: uid ?? '', mainCareerId: activeMainCareer.id, title: nextName });
      setMainCareers((prev) =>
        prev.map((career) => (career.id === activeMainCareer.id ? { ...career, title: nextName } : career))
      );
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

  const handleCreateNewCareer = async () => {
    if (!uid) return;
    setStatus(null);
    const title = newCareerName.trim();
    try {
      const confirmed =
        activeMainCareer?.status === 'active'
          ? window.confirm('切换主线会归档当前主线；历史专注不可转移。确认继续？')
          : true;
      if (!confirmed) return;
      await createAndActivateMainCareer({ uid, title });
      setNewCareerName('');
      await refreshMainCareers();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建主线失败');
    }
  };

  const handleActivateCareer = async (careerId: string) => {
    if (!uid) return;
    setStatus(null);
    const confirmed = window.confirm('切换主线会归档当前主线；历史专注不可转移。确认继续？');
    if (!confirmed) return;
    try {
      await activateMainCareer({ uid, mainCareerId: careerId });
      await refreshMainCareers();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '切换主线失败');
    }
  };

  const handleArchiveCareer = async () => {
    if (!uid) return;
    setStatus(null);
    const confirmed = window.confirm('归档后不可再计入专注。确认归档？');
    if (!confirmed) return;
    try {
      await archiveActiveMainCareer(uid);
      await refreshMainCareers();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '归档失败');
    }
  };

  const todayKey = getDayKey();
  const todayStat = dailyTotals.find((stat) => stat.dayKey === todayKey);
  const todayTotalSec =
    todayStat?.totalFocusSec ??
    (userProfile?.todayKey === todayKey ? userProfile?.todayFocusSec ?? 0 : 0);
  const totalFocusSec =
    globalStats?.totalFocusSec ?? userProfile?.totalFocusSec ?? allSessions.reduce((acc, cur) => acc + cur.durationSec, 0);
  const milestoneInfo = findMilestone(totalFocusSec);
  const avgDailySec = computeAvgDailySec(
    dailyTotals.map((stat) => ({ dayKey: stat.dayKey, totalSec: stat.totalFocusSec })),
    14
  );
  const etaText = formatEtaDays(milestoneInfo.remainingSec, avgDailySec);
  const focusPercent = todayTotalSec / 86400;

  const weekKey = getWeekKey();
  const currentWeekStat = weeklyStats.find((stat) => stat.weekKey === weekKey);
  const currentWeekSec = currentWeekStat?.totalFocusSec ?? 0;
  const previousWeeks = weeklyStats.filter((stat) => stat.weekKey !== weekKey).slice(-4);
  const averagePrevWeekSec =
    previousWeeks.length > 0
      ? previousWeeks.reduce((acc, stat) => acc + stat.totalFocusSec, 0) / previousWeeks.length
      : 0;
  const weeklyTargetSec = averagePrevWeekSec > 0 ? averagePrevWeekSec : Math.max(currentWeekSec, 0);
  const weeklyPercent = weeklyTargetSec > 0 ? (currentWeekSec / weeklyTargetSec) * 100 : 0;

  const isLockedByOther = !!(activeSession && activeSession.status === 'active' && activeSession.deviceId !== deviceId);
  const isActiveLocally = !!(activeSession && activeSession.status === 'active' && activeSession.deviceId === deviceId);
  const isAnySessionActive = activeSession?.status === 'active';

  const activeMainCareerId = userProfile?.activeMainCareerId ?? null;
  const activeMainCareer = mainCareers.find((career) => career.id === activeMainCareerId) ?? null;
  const sortedCareers = [...mainCareers].sort((a, b) => {
    if (a.id === activeMainCareerId) return -1;
    if (b.id === activeMainCareerId) return 1;
    const aTime = (a.activatedAt ?? a.createdAt).toMillis();
    const bTime = (b.activatedAt ?? b.createdAt).toMillis();
    return bTime - aTime;
  });
  const formatTimestamp = (value?: Timestamp) => (value ? value.toDate().toLocaleString() : '—');

  useEffect(() => {
    setEditingName(activeMainCareer?.title ?? '');
  }, [activeMainCareer?.id, activeMainCareer?.title]);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setAuthStatus('请输入邮箱和密码');
      return;
    }
    setAuthStatus(null);
    setAuthBusy(true);
    try {
      if (authUser?.isAnonymous) {
        await linkGuestWithEmail(email, password);
        setAuthStatus('已升级为邮箱账号');
      } else if (authMode === 'signin') {
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

  const isAnonymousUser = authUser?.isAnonymous;

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
                {isAnonymousUser ? '升级为邮箱账号' : authMode === 'signin' ? '邮箱登录' : '注册并登录'}
              </button>
              {!isAnonymousUser && (
                <button
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500 transition"
                  onClick={() => setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))}
                  disabled={authBusy}
                >
                  {authMode === 'signin' ? '切换到注册' : '已有账号，去登录'}
                </button>
              )}
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
            {status && <p className="text-amber-300 text-sm mt-2 break-all">{status}</p>}
            <div className="grid gap-4 mt-3">
              <div className="flex flex-col gap-2">
                <p className="text-slate-300 text-sm">当前主线</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <input
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 w-full sm:w-auto disabled:opacity-60"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleRename}
                    placeholder={activeMainCareer ? '输入主线名称' : '请先创建主线'}
                    disabled={!activeMainCareer || activeMainCareer.status === 'archived' || isAnySessionActive}
                  />
                  <button
                    className="button-primary sm:w-auto"
                    onClick={handleRename}
                    disabled={!activeMainCareer || savingName || activeMainCareer.status === 'archived' || isAnySessionActive}
                  >
                    保存名称
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg border border-rose-400/60 text-rose-200 hover:border-rose-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleArchiveCareer}
                    disabled={!activeMainCareer || activeMainCareer.status !== 'active' || isAnySessionActive}
                  >
                    归档当前主线
                  </button>
                </div>
                {activeMainCareer ? (
                  <p className="text-slate-400 text-sm">
                    状态：{activeMainCareer.status === 'active' ? 'Active' : 'Archived'} ·
                    累计 {formatDuration(activeMainCareer.totalFocusSec)} / {activeMainCareer.totalSessions} 次
                  </p>
                ) : (
                  <p className="text-slate-400 text-sm">当前没有 active 主线，请先创建并激活。</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-slate-300 text-sm">创建并激活新主线</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <input
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 w-full sm:w-auto disabled:opacity-60"
                    value={newCareerName}
                    onChange={(e) => setNewCareerName(e.target.value)}
                    placeholder="输入新的主线名称"
                    disabled={isAnySessionActive}
                  />
                  <button
                    className="button-primary sm:w-auto"
                    onClick={handleCreateNewCareer}
                    disabled={isAnySessionActive || newCareerName.trim().length < 2}
                  >
                    创建并激活
                  </button>
                </div>
              </div>
            </div>
            {nameStatus && (
              <p
                className={`text-sm mt-1 ${nameStatus.variant === 'success' ? 'text-emerald-300' : 'text-amber-300'}`}
              >
                {nameStatus.message}
              </p>
            )}
            {isAnySessionActive && <p className="text-slate-400 text-sm mt-2">请先结束当前专注后再管理主线。</p>}
          </header>

          <section className="section-card">
            <div className="section-title">计时控制区</div>
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
                <button
                  className="button-primary"
                  onClick={handleStart}
                  disabled={!deviceId || !uid || !activeMainCareer}
                >
                  开始专注
                </button>
                {!activeMainCareer ? (
                  <p className="text-amber-300 text-sm">请先创建并激活主线后再开始专注。</p>
                ) : (
                  <p className="text-slate-400 text-sm">开始专注需联网并写入 active session。</p>
                )}
              </div>
            )}
          </section>

          <section className="section-card">
            <div className="section-title">主线历史</div>
            {sortedCareers.length === 0 ? (
              <p className="text-slate-400 text-sm">暂未创建主线。</p>
            ) : (
              <div className="space-y-3">
                {sortedCareers.map((career) => (
                  <div
                    key={career.id}
                    className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div>
                      <p className="text-lg font-semibold text-slate-100">{career.title}</p>
                      <p className="text-slate-400 text-sm">
                        状态：{career.status === 'active' ? 'Active' : 'Archived'} ·
                        累计 {formatDuration(career.totalFocusSec)} / {career.totalSessions} 次
                      </p>
                      <p className="text-slate-500 text-xs mt-1">
                        启用：{formatTimestamp(career.activatedAt)} · 归档：{formatTimestamp(career.archivedAt)}
                      </p>
                    </div>
                    {career.status === 'archived' && (
                      <button
                        className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:border-slate-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleActivateCareer(career.id ?? '')}
                        disabled={isAnySessionActive}
                      >
                        激活此主线
                      </button>
                    )}
                  </div>
                ))}
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
            <div className="grid gap-4 mt-4 lg:grid-cols-3">
              <StatProgressBar
                title="今日进度条"
                description="统计含义：今日专注时长 / 24 小时"
                valueLabel={`${formatDuration(todayTotalSec)} / 24:00:00`}
                percent={focusPercent * 100}
                note="数据来源：daily_stats"
              />
              <StatProgressBar
                title="趋势进度条"
                description={
                  averagePrevWeekSec > 0
                    ? '统计含义：本周累计 / 近 4 周平均'
                    : '统计含义：本周累计（暂无历史周均）'
                }
                valueLabel={`${formatDuration(currentWeekSec)} / ${formatDuration(weeklyTargetSec)}`}
                percent={weeklyPercent}
                note="数据来源：weekly_stats"
              />
              <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 space-y-2">
                <p className="text-slate-300 text-sm">主线进度条</p>
                <p className="text-slate-400 text-xs">统计含义：累计专注时长 / 下一里程碑</p>
                <AccumulationBar
                  totalFocusSec={totalFocusSec}
                  nextMilestoneHour={milestoneInfo.nextMilestone}
                  prevMilestoneHour={milestoneInfo.prevMilestone}
                  zoomLevel={zoomLevel}
                  onZoomChange={setZoomLevel}
                />
                <p className="text-slate-500 text-xs">数据来源：global_stats</p>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
