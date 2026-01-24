import { generateTicks, getScaleStepHours } from '@/lib/core/milestones';

interface Props {
  totalFocusSec: number;
  nextMilestoneHour: number | null;
  prevMilestoneHour: number | null;
  zoomLevel: number;
  onZoomChange?: (level: number) => void;
  markers?: Array<{ label: string; seconds: number; colorClass: string }>;
}

export default function AccumulationBar({
  totalFocusSec,
  nextMilestoneHour,
  prevMilestoneHour,
  zoomLevel,
  onZoomChange,
  markers = []
}: Props) {
  const totalHours = totalFocusSec / 3600;
  const hours = Math.floor(totalHours);
  const minutes = Math.floor((totalFocusSec % 3600) / 60);
  const remainingHours = nextMilestoneHour ? Math.max(0, nextMilestoneHour - totalHours) : 0;
  const progressPercent = nextMilestoneHour ? Math.min(100, (totalHours / nextMilestoneHour) * 100) : 100;
  const nearMilestone = progressPercent >= 85 && !!nextMilestoneHour;
  const targetHours = nextMilestoneHour ?? Math.max(totalHours, prevMilestoneHour ?? 0);
  const step = getScaleStepHours(zoomLevel);
  const ticks = generateTicks(targetHours, step);
  const markerHours = (seconds: number) => seconds / 3600;
  const formatMarkerLabel = (seconds: number) => `${markerHours(seconds).toFixed(1)}h`;
  const scaleMax = ticks.length ? ticks[ticks.length - 1] : targetHours;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex justify-between items-center text-sm text-slate-300">
        <div>
          已累积 <span className="font-semibold text-slate-50">{hours} 小时 {minutes} 分钟</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">刻度</span>
          <input
            type="range"
            min={0}
            max={4}
            value={zoomLevel}
            onChange={(e) => onZoomChange?.(Number(e.target.value))}
            className="accent-focus-primary"
          />
          <span className="text-slate-200 text-xs">{step}h / 格</span>
        </div>
      </div>
      <div className="text-slate-400 text-sm">
        {nextMilestoneHour ? (
          <span>
            距离下一个里程碑（{nextMilestoneHour}h）还差{' '}
            <span className="text-slate-50 font-semibold">{remainingHours.toFixed(1)} 小时</span>
          </span>
        ) : (
          <span>已超越所有里程碑</span>
        )}
      </div>
      <div className="relative overflow-visible">
        <div className="relative h-6 rounded-full bg-slate-800 border border-slate-700 overflow-hidden">
          <div
            className={`h-full ${nearMilestone ? 'bg-gradient-to-r from-amber-300 via-sky-400 to-sky-600' : 'bg-focus-primary'}`}
            style={{ width: `${progressPercent}%` }}
          />
          <div className="absolute inset-0 pointer-events-none text-[10px] text-slate-400">
            {ticks.map((tick, idx) => {
              const percent = scaleMax ? (tick / scaleMax) * 100 : 0;
              const clampedPercent = Math.max(0, Math.min(100, percent));
              const translate =
                clampedPercent <= 0 ? 'translateX(0)' : clampedPercent >= 100 ? 'translateX(-100%)' : 'translateX(-50%)';
              return (
                <div
                  key={`${tick}-${idx}`}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${clampedPercent}%`, transform: translate }}
                >
                  <div className="w-px h-3 bg-slate-600" />
                  <span className="mt-1">{tick}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="absolute inset-x-0 top-0 h-6 pointer-events-none">
          {markers.map((marker) => {
            const percent = targetHours ? Math.min(100, (markerHours(marker.seconds) / targetHours) * 100) : 0;
            return (
              <div
                key={`${marker.label}-${marker.seconds}`}
                className="absolute flex flex-col items-center"
                style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
              >
                <span className="text-[10px] text-slate-200 bg-slate-900/80 px-1 rounded -translate-y-2 whitespace-nowrap">
                  {marker.label} {formatMarkerLabel(marker.seconds)}
                </span>
                <div className={`w-px h-6 ${marker.colorClass}`} />
              </div>
            );
          })}
        </div>
      </div>
      {nearMilestone && (
        <p className="text-amber-300 text-sm">已超过 85%，即将抵达里程碑，加油！</p>
      )}
    </div>
  );
}
