import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Flight, KliaTrafficPoint } from '../types/flight';

interface KliaTrafficChartProps {
  trafficHistory: KliaTrafficPoint[];
  flights: Flight[];
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
  }>;
}

function TrafficTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg bg-[#070d18] border border-white/15 px-3 py-2 shadow-xl text-xs">
      <div className="font-mono-tabular font-semibold text-slate-200 mb-1">
        {label === 'Kini' ? 'Semasa (Kini)' : `Jam ${label}`}
      </div>
      <div className="space-y-1 font-mono-tabular">
        {payload.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center justify-between gap-4 text-[11px]"
          >
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-semibold text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KliaTrafficChart({
  trafficHistory,
  flights,
}: KliaTrafficChartProps) {
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');

  const activeDepartures = flights.filter((f) => f.origin === 'KUL').length;
  const activeArrivals = flights.filter((f) => f.destination === 'KUL').length;
  const activeDelayed = flights.filter(
    (f) => f.status === 'TERTUNDA' || f.status === 'DIALIHKAN'
  ).length;

  const hourlyDepTotal = trafficHistory.reduce((acc, p) => acc + p.berlepas, 0);
  const hourlyArrTotal = trafficHistory.reduce((acc, p) => acc + p.ketibaan, 0);

  return (
    <div className="pb-2.5 mb-2.5 border-b border-white/10">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        {/* Left: Compact KLIA Traffic Summary & Chart Mode Switch */}
        <div className="sm:w-56 shrink-0 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-100 leading-tight">
                Trafik KLIA · Sejam Lepas
              </h3>
              <p className="text-[11px] text-slate-400 font-mono-tabular mt-0.5">
                Berlepas vs Ketibaan (selang 10m)
              </p>
            </div>

            <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-slate-900 border border-white/8 shrink-0">
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                  chartType === 'bar'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Bar
              </button>
              <button
                type="button"
                onClick={() => setChartType('area')}
                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                  chartType === 'area'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Aliran
              </button>
            </div>
          </div>

          {/* Unboxed Tabular Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-white/8 font-mono-tabular">
            <div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-1.5 h-1.5 rounded-xs bg-sky-400" aria-hidden="true" />
                <span>Berlepas</span>
              </div>
              <div className="text-sm font-semibold text-sky-300 mt-0.5">
                {activeDepartures}
                <span className="text-[10px] font-normal text-slate-500 ml-1">
                  /{hourlyDepTotal}j
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-1.5 h-1.5 rounded-xs bg-emerald-400" aria-hidden="true" />
                <span>Ketibaan</span>
              </div>
              <div className="text-sm font-semibold text-emerald-300 mt-0.5">
                {activeArrivals}
                <span className="text-[10px] font-normal text-slate-500 ml-1">
                  /{hourlyArrTotal}j
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-1.5 h-1.5 rounded-xs bg-amber-400" aria-hidden="true" />
                <span>Tangguh</span>
              </div>
              <div className="text-sm font-semibold text-amber-300 mt-0.5">
                {activeDelayed}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Recharts Real-Time Visualization */}
        <div className="flex-1 min-w-0 h-[108px]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart
                data={trafficHistory}
                margin={{ top: 4, right: 6, left: -24, bottom: 0 }}
                barGap={3}
                barCategoryGap="24%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148, 163, 184, 0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.18)' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<TrafficTooltip />}
                  cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                />
                <Bar
                  dataKey="berlepas"
                  name="Berlepas KLIA"
                  fill="#38bdf8"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="ketibaan"
                  name="Ketibaan KLIA"
                  fill="#34d399"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                  isAnimationActive={false}
                />
              </BarChart>
            ) : (
              <AreaChart
                data={trafficHistory}
                margin={{ top: 4, right: 6, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="kliaDepGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="kliaArrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148, 163, 184, 0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.18)' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<TrafficTooltip />} />
                <Area
                  type="monotone"
                  dataKey="berlepas"
                  name="Berlepas KLIA"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="url(#kliaDepGrad)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="ketibaan"
                  name="Ketibaan KLIA"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#kliaArrGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
