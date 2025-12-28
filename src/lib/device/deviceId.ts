const STORAGE_KEY = 'focusline_device_id';

function generateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `device-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return 'server';
  }
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const next = generateId();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch (error) {
    console.warn('deviceId fallback', error);
    return generateId();
  }
}
