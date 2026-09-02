"use client";

import { useMemo } from "react";

type Point = { label: string; value: number };

export function LineChart({ series, height = 180, suffix = "", color = "#37d3ff" }: { series: Point[]; height?: number; suffix?: string; color?: string }) {
  const { path, area, points, min, max } = useMemo(() => {
    if (!series.length) return { path: "", area: "", points: [] as Array<{ x: number; y: number; p: Point }>, min: 0, max: 0 };
    const values = series.map((s) => s.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.15 || 5;
    const minV = Math.max(0, lo - pad);
    const maxV = hi + pad;
    const w = 100;
    const h = 100;
    const pts = series.map((p, i) => ({
      x: series.length === 1 ? w / 2 : (i / (series.length - 1)) * w,
      y: h - ((p.value - minV) / (maxV - minV || 1)) * h,
      p,
    }));
    const d = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(" ");
    const a = `${d} L100,100 L0,100 Z`;
    return { path: d, area: a, points: pts, min: minV, max: maxV };
  }, [series]);

  if (!series.length) return <p className="py-6 text-center text-xs text-muted">尚無資料</p>;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.4" />
        ))}
        <path d={area} fill={`url(#fill-${color.replace("#", "")})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{series[0]?.label}</span>
        <span>
          {Math.round(min)}–{Math.round(max)}
          {suffix}
        </span>
        <span>{series[series.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function BarChart({ series, height = 160, suffix = "" }: { series: Point[]; height?: number; suffix?: string }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  if (!series.length) return <p className="py-6 text-center text-xs text-muted">尚無資料</p>;
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto no-scrollbar" style={{ height }}>
      {series.map((s, i) => (
        <div key={`${s.label}-${i}`} className="flex min-w-[26px] flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] tabular-nums text-muted">{s.value > 0 ? `${s.value}${suffix}` : ""}</span>
          <div
            className="w-full rounded-t-lg bg-gradient-to-t from-[#7c5cff]/40 to-[#37d3ff] transition-all"
            style={{ height: `${Math.max(3, (s.value / max) * (height - 40))}px` }}
            title={`${s.label}: ${s.value}${suffix}`}
          />
          <span className="max-w-[46px] truncate text-[10px] text-muted">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({ data, size = 150 }: { data: Array<{ label: string; value: number }>; size?: number }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const palette = ["#7c5cff", "#37d3ff", "#ffc857", "#4ade80", "#fb7185", "#a78bfa", "#22d3ee"];
  if (!total) return <p className="py-6 text-center text-xs text-muted">尚無資料</p>;
  let offset = 0;
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={d.label}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={palette[i % palette.length]}
              strokeWidth="14"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="flex-1 space-y-1 text-xs">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="tabular-nums text-muted">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ values, color = "#4ade80" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - lo) / (hi - lo || 1)) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}
