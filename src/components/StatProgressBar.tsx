interface StatProgressBarProps {
  title: string;
  description: string;
  valueLabel: string;
  percent: number;
  note?: string;
}

export default function StatProgressBar({ title, description, valueLabel, percent, note }: StatProgressBarProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  return (
    <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 space-y-3">
      <div>
        <p className="text-slate-300 text-sm">{title}</p>
        <p className="text-slate-400 text-xs mt-1">{description}</p>
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-50 font-semibold">{valueLabel}</span>
        <span className="text-slate-400">{clampedPercent.toFixed(1)}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-900 border border-slate-700 overflow-hidden">
        <div className="h-full bg-focus-primary" style={{ width: `${clampedPercent}%` }} />
      </div>
      {note && <p className="text-slate-500 text-xs">{note}</p>}
    </div>
  );
}
