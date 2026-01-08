export const DEFAULT_SESSION_SECONDS = 25 * 60;

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const h = hours > 0 ? `${hours.toString().padStart(2, '0')}:` : '';
  return `${h}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function getDayKey(date: Date = new Date(), timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function getDateParts(date: Date, timeZone?: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '1');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '1');
  return { year, month, day };
}

export function getWeekKey(date: Date = new Date(), timeZone?: string): string {
  const { year, month, day } = getDateParts(date, timeZone);
  const target = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNumber = Math.round((target.getTime() - firstThursday.getTime()) / 604800000) + 1;
  const weekYear = target.getUTCFullYear();
  return `${weekYear}-W${weekNumber.toString().padStart(2, '0')}`;
}
