import type { Timestamp } from 'firebase/firestore';

export type MainCareerStatus = 'active' | 'archived';

export interface MainCareer {
  id?: string;
  user_uid: string;
  title: string;
  status: MainCareerStatus;
  createdAt: Timestamp;
  activatedAt: Timestamp;
  archivedAt?: Timestamp;
  totalFocusSec: number;
  totalSessions: number;
}

export interface UserProfile {
  id?: string;
  activeMainCareerId: string | null;
  totalFocusSec: number;
  todayFocusSec: number;
  todayKey: string;
}

export type ActiveSessionStatus = 'active' | 'ended';

export interface ActiveSession {
  mainCareerId: string;
  startAt: string;
  durationSec: number;
  deviceId: string;
  heartbeatAt: string;
  status: ActiveSessionStatus;
}

export interface FocusSession {
  id?: string;
  user_uid: string;
  mainCareerId: string;
  startAt: string;
  durationSec: number;
  dayKey: string;
  createdAt: Timestamp;
}

export interface DailyTotal {
  dayKey: string;
  totalSec: number;
}
