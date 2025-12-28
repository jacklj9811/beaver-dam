export type EndeavorStatus = 'active' | 'archived';

export interface Endeavor {
  id?: string;
  user_uid: string;
  name: string;
  isPrimary: true;
  status: EndeavorStatus;
  createdAt: string;
  updatedAt: string;
}

export type ActiveSessionStatus = 'active' | 'ended';

export interface ActiveSession {
  endeavorId: string;
  startAt: string;
  durationSec: number;
  deviceId: string;
  heartbeatAt: string;
  status: ActiveSessionStatus;
}

export interface FocusSession {
  id?: string;
  user_uid: string;
  endeavorId: string;
  startAt: string;
  durationSec: number;
  dayKey: string;
  createdAt: string;
}

export interface DailyTotal {
  dayKey: string;
  totalSec: number;
}
