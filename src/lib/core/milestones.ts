const MILESTONES_HOURS = [20, 40, 100, 200, 300, 500, 1000, 1500, 2000, 4000, 7000, 10000];

export interface MilestoneInfo {
  prevMilestone: number | null;
  nextMilestone: number | null;
  remainingSec: number;
  progressRatio: number;
}

export function findMilestone(totalFocusSec: number): MilestoneInfo {
  const totalHours = totalFocusSec / 3600;
  let prev: number | null = null;
  let next: number | null = null;
  for (const m of MILESTONES_HOURS) {
    if (totalHours < m) {
      next = m;
      break;
    }
    prev = m;
  }
  const remainingSec = next ? Math.max(0, next * 3600 - totalFocusSec) : 0;
  const progressRatio = next ? Math.min(1, totalFocusSec / (next * 3600)) : 1;
  return { prevMilestone: prev, nextMilestone: next, remainingSec, progressRatio };
}

export function computeAvgDailySec(totals: { dayKey: string; totalSec: number }[], window = 14): number {
  if (window <= 0) return 0;
  const sum = totals.reduce((acc, cur) => acc + cur.totalSec, 0);
  return sum / window;
}

export function formatEtaDays(remainingSec: number, avgDailySec: number): string {
  if (avgDailySec <= 0) return 'N/A';
  const days = remainingSec / avgDailySec;
  return days < 1 ? '<1 天' : `${days.toFixed(1)} 天`;
}

export { MILESTONES_HOURS };

export function getScaleStepHours(zoomLevel: number): number {
  const steps = [25, 10, 5, 1, 0.5];
  const index = Math.min(steps.length - 1, Math.max(0, zoomLevel));
  return steps[index];
}

export function generateTicks(targetHours: number, stepHours: number): number[] {
  const ticks: number[] = [];
  const safeTarget = targetHours > 0 ? targetHours : stepHours;
  for (let h = 0; h <= safeTarget + 0.0001; h += stepHours) {
    ticks.push(Number(h.toFixed(2)));
  }
  if (ticks[ticks.length - 1] < safeTarget) {
    ticks.push(Number(safeTarget.toFixed(2)));
  }
  return ticks;
}
