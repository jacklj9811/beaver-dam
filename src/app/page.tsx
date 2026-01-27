'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import AccumulationBar from '@/components/AccumulationBar';
import {
  listenAuthState,
  changePasswordWithEmail,
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
  queryWeeklyStats,
  queryAllSessions,
  startActiveSession,
  updateMainCareerTitle
} from '@/lib/firebase/firestore';
import { getOrCreateDeviceId } from '@/lib/device/deviceId';
import { DEFAULT_SESSION_SECONDS, formatDuration, getStartOfWeek, getWeekKey } from '@/lib/time';
import { findMilestone } from '@/lib/core/milestones';
import type { ActiveSession, FocusSession, GlobalStat, MainCareer, UserProfile, WeeklyStat } from '@/types';
import type { Timestamp } from 'firebase/firestore';

type LoginPageProps = {
  authMode: 'signin' | 'signup';
  email: string;
  password: string;
  authBusy: boolean;
  authStatus: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleMode: () => void;
  onEmailAuth: () => void;
  onGuestLogin: () => void;
};

function LoginPage({
  authMode,
  email,
  password,
  authBusy,
  authStatus,
  onEmailChange,
  onPasswordChange,
  onToggleMode,
  onEmailAuth,
  onGuestLogin
}: LoginPageProps) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <section className="section-card w-full max-w-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">欢迎回来</h1>
            <p className="text-sm text-slate-400 mt-1">登录后即可同步主线与专注记录。</p>
          </div>
          <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/80 p-1 text-xs">
            <button
              className={`px-3 py-1 rounded-full transition ${
                authMode === 'signin' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => authMode === 'signup' && onToggleMode()}
              type="button"
            >
              登录
            </button>
            <button
              className={`px-3 py-1 rounded-full transition ${
                authMode === 'signup' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => authMode === 'signin' && onToggleMode()}
              type="button"
            >
              注册
            </button>
          </div>
        </div>

        {authStatus && <p className="text-amber-300 text-sm mt-3 break-all">{authStatus}</p>}

        <div className="mt-5 grid gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">邮箱</label>
            <input
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">密码</label>
            <input
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
              type="password"
              placeholder="不少于 6 位"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button className="button-primary w-full" onClick={onEmailAuth} disabled={authBusy}>
            {authMode === 'signin' ? '邮箱登录' : '注册并登录'}
          </button>
          <button
            className="text-sm text-sky-300 hover:text-sky-200 transition self-start"
            onClick={onToggleMode}
            type="button"
          >
            {authMode === 'signin' ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>

        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-slate-400">更多选项（可折叠）</summary>
          <div className="mt-3 space-y-3">
            <button
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500 transition w-full"
              onClick={onGuestLogin}
              disabled={authBusy}
              type="button"
            >
              使用匿名身份
            </button>
            <p className="text-xs text-slate-500">
              匿名登录适合快速试用，建议后续注册邮箱账号以便跨设备同步。
            </p>
          </div>
        </details>
      </section>
    </main>
  );
}

type AccountMenuProps = {
  authUser: User | null;
  authBusy: boolean;
  onSignOut: () => void;
};

function AccountMenu({ authUser, authBusy, onSignOut }: AccountMenuProps) {
  return (
    <div className="flex justify-end">
      <details className="relative">
        <summary className="list-none cursor-pointer px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/60 text-sm text-slate-200 hover:border-slate-700 transition">
          {authUser?.email ?? '匿名用户'}
          {authUser?.isAnonymous && <span className="ml-2 text-xs text-slate-400">(匿名)</span>}
        </summary>
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 shadow-lg p-3">
          <p className="text-xs text-slate-400">当前账号</p>
          <p className="text-sm text-slate-200 mt-1 break-all">
            {authUser?.email ?? '匿名用户'}
            {authUser?.isAnonymous && '（匿名）'}
          </p>
          <button
            className="mt-3 w-full px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:border-slate-500 transition"
            onClick={onSignOut}
            disabled={authBusy}
            type="button"
          >
            退出登录
          </button>
        </div>
      </details>
    </div>
  );
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
  const [globalStats, setGlobalStats] = useState<GlobalStat | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStat[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [nameStatus, setNameStatus] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(2);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [autoEnding, setAutoEnding] = useState(false);

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
    const [sessions, global, weekly] = await Promise.all([
      queryAllSessions(uid),
      fetchGlobalStats(uid),
      queryWeeklyStats({ uid, lastNWeeks: 2 })
    ]);
    setAllSessions(sessions);
    setGlobalStats(global);
    setWeeklyStats(weekly);
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
        setGlobalStats(null);
        setWeeklyStats([]);
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

  const isLockedByOther = !!(activeSession && activeSession.status === 'active' && activeSession.deviceId !== deviceId);
  const isActiveLocally = !!(activeSession && activeSession.status === 'active' && activeSession.deviceId === deviceId);
  const isAnySessionActive = activeSession?.status === 'active';

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') return;
    if (!isActiveLocally || autoEnding) return;
    if (remainingSec > 0) return;
    setAutoEnding(true);
    endActiveSession({ uid: uid ?? '', deviceId })
      .then(() => Promise.all([refreshSessions(), refreshMainCareers()]))
      .catch((error) => setStatus(error instanceof Error ? error.message : '结束失败'))
      .finally(() => setAutoEnding(false));
  }, [
    activeSession,
    autoEnding,
    deviceId,
    isActiveLocally,
    refreshMainCareers,
    refreshSessions,
    remainingSec,
    uid
  ]);

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

  const totalFocusSec =
    globalStats?.totalFocusSec ?? userProfile?.totalFocusSec ?? allSessions.reduce((acc, cur) => acc + cur.durationSec, 0);
  const now = new Date();
  const startOfWeek = getStartOfWeek(now);
  const currentWeekKey = getWeekKey(now);
  const previousWeekKey = getWeekKey(new Date(startOfWeek.getTime() - 24 * 60 * 60 * 1000));
  const thisWeekTotalSec = weeklyStats.find((stat) => stat.weekKey === currentWeekKey)?.totalFocusSec ?? 0;
  const lastWeekTotalSec = weeklyStats.find((stat) => stat.weekKey === previousWeekKey)?.totalFocusSec ?? 0;
  const startOfWeekTotalSec = Math.max(0, totalFocusSec - thisWeekTotalSec);
  const elapsedThisWeekSec = Math.max(0, Math.floor((now.getTime() - startOfWeek.getTime()) / 1000));
  const weekSeconds = 7 * 24 * 60 * 60;
  const expectedTotalBaselineSec = startOfWeekTotalSec + lastWeekTotalSec;
  const expectedTotalTrendSec =
    startOfWeekTotalSec +
    ((lastWeekTotalSec + thisWeekTotalSec) / (weekSeconds + elapsedThisWeekSec)) * (14 * 24 * 60 * 60);
  const milestoneInfo = findMilestone(totalFocusSec);
  const accumulationMarkers = [
    { label: '預期累積A', seconds: expectedTotalBaselineSec, colorClass: 'bg-emerald-300' },
    { label: '預期累積B', seconds: expectedTotalTrendSec, colorClass: 'bg-sky-300' }
  ];
  if (milestoneInfo.nextMilestone) {
    accumulationMarkers.push({
      label: '下一里程碑',
      seconds: milestoneInfo.nextMilestone * 3600,
      colorClass: 'bg-amber-300'
    });
  }

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

  const handleChangePassword = async () => {
    if (passwordBusy) return;
    if (!currentPassword || !nextPassword || !confirmPassword) {
      setPasswordStatus('请完整填写当前密码与新密码');
      return;
    }
    if (nextPassword.length < 6) {
      setPasswordStatus('新密码长度至少 6 位');
      return;
    }
    if (nextPassword !== confirmPassword) {
      setPasswordStatus('两次输入的新密码不一致');
      return;
    }
    setPasswordStatus(null);
    setPasswordBusy(true);
    try {
      await changePasswordWithEmail(currentPassword, nextPassword);
      setPasswordStatus('密码已更新');
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordStatus(error instanceof Error ? error.message : '密码修改失败');
    } finally {
      setPasswordBusy(false);
    }
  };

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-10">
        <p className="text-slate-400">正在检查登录状态...</p>
      </main>
    );
  }

  if (!uid) {
    return (
      <LoginPage
        authMode={authMode}
        email={email}
        password={password}
        authBusy={authBusy}
        authStatus={authStatus}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onToggleMode={() => setAuthMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))}
        onEmailAuth={handleEmailAuth}
        onGuestLogin={handleGuestLogin}
      />
    );
  }

  return (
    <main className="layout-grid">
      <AccountMenu authUser={authUser} authBusy={authBusy} onSignOut={handleSignOut} />
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
            <div className="flex items-center gap-4">
              <div className="text-4xl font-mono text-sky-200">{formatDuration(remainingSec)}</div>
              <div className="text-slate-400 text-xs">
                <p>开始于：{new Date(activeSession.startAt).toLocaleTimeString()}</p>
                <p>倒计时归零后会自动结束</p>
              </div>
            </div>
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
        <div className="section-title">账号安全</div>
        {authUser?.isAnonymous ? (
          <p className="text-slate-400 text-sm">匿名账号无法修改密码，请先升级为邮箱账号。</p>
        ) : (
          <div className="grid gap-4 max-w-md">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-300">当前密码</label>
              <input
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="输入当前密码"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-300">新密码</label>
              <input
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                type="password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-300">确认新密码</label>
              <input
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
              />
            </div>
            <button className="button-primary" onClick={handleChangePassword} disabled={passwordBusy}>
              {passwordBusy ? '更新中...' : '更新密码'}
            </button>
            {passwordStatus && <p className="text-sm text-amber-300">{passwordStatus}</p>}
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
        <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 space-y-2">
          <p className="text-slate-300 text-sm">主线进度条</p>
          <p className="text-slate-400 text-xs">统计含义：累计专注时长 / 下一里程碑</p>
          <AccumulationBar
            totalFocusSec={totalFocusSec}
            nextMilestoneHour={milestoneInfo.nextMilestone}
            prevMilestoneHour={milestoneInfo.prevMilestone}
            zoomLevel={zoomLevel}
            onZoomChange={setZoomLevel}
            markers={accumulationMarkers}
          />
          <p className="text-slate-500 text-xs">数据来源：global_stats</p>
        </div>
      </section>
    </main>
  );
}
