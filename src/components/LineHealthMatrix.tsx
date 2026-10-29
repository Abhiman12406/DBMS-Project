'use client';

import { useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, TrainFront } from 'lucide-react';

import type { NetworkSnapshot } from '@/lib/client';
import type { CascadeResult, TransitLine } from '@/lib/types';

interface LineHealthMatrixProps {
  snapshot: NetworkSnapshot | null;
  cascade: CascadeResult | null;
  loading: boolean;
}

interface LineHealthItem {
  line: TransitLine;
  maxDelay: number;
  cancelled: boolean;
  impacted: boolean;
  activeTrips: number;
}

export function LineHealthMatrix({
  snapshot,
  cascade,
  loading,
}: LineHealthMatrixProps) {
  const affectedTripIds = useMemo(() => {
    const ids = new Set<number>();
    if (!cascade) {
      return ids;
    }
    for (const stop of cascade.cascadeStops) {
      ids.add(stop.trip_id);
    }
    for (const trip of cascade.downstreamTrips) {
      ids.add(trip.trip_id);
    }
    return ids;
  }, [cascade]);

  const linesHealth = useMemo<LineHealthItem[]>(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.lines.map((line) => {
      const trips = snapshot.trips.filter((trip) => trip.line_code === line.code);
      const maxDelay = trips.reduce(
        (max, trip) => Math.max(max, Number(trip.max_delay_min ?? 0)),
        0,
      );

      return {
        line,
        maxDelay,
        cancelled: trips.some((trip) => trip.trip_status === 'CANCELLED'),
        impacted: trips.some((trip) => affectedTripIds.has(trip.trip_id)),
        activeTrips: trips.length,
      };
    });
  }, [snapshot, affectedTripIds]);

  const totalTrips = linesHealth.reduce((acc, item) => acc + item.activeTrips, 0);
  const totalImpacted = linesHealth.filter((item) => item.impacted || item.maxDelay > 0).length;

  return (
    <section className="bento-card p-5 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">
                Fleet Operations
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 border border-white/5">
                4 Corridors
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-white sm:text-lg">
              <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Line Health Matrix</span>
            </h2>
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold border ${
              totalImpacted > 0
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
            }`}
          >
            {totalImpacted > 0 ? `${totalImpacted} Lines Delayed` : 'All Systems Optimal'}
          </span>
        </div>

        {/* Lines Grid */}
        <div className="mt-4 space-y-2.5">
          {loading && !snapshot ? (
            <div className="space-y-2 py-2">
              <div className="h-14 animate-pulse rounded-xl bg-white/5" />
              <div className="h-14 animate-pulse rounded-xl bg-white/5" />
              <div className="h-14 animate-pulse rounded-xl bg-white/5" />
              <div className="h-14 animate-pulse rounded-xl bg-white/5" />
            </div>
          ) : (
            linesHealth.map((item) => {
              const hasSevere = item.cancelled || item.maxDelay >= 15;
              const hasMinor = item.maxDelay > 0 && item.maxDelay < 15;

              return (
                <div
                  key={item.line.line_id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-md ring-2 ring-white/10 shadow-sm"
                        style={{ backgroundColor: item.line.color_hex }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-100 truncate">
                          {item.line.name}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {item.activeTrips} active scheduled {item.activeTrips === 1 ? 'trip' : 'trips'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border ${
                          hasSevere
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : hasMinor
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                        }`}
                      >
                        {hasSevere ? (
                          <AlertTriangle className="h-2.5 w-2.5" />
                        ) : hasMinor ? (
                          <Activity className="h-2.5 w-2.5" />
                        ) : (
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        )}
                        {hasSevere
                          ? `Severe · +${item.maxDelay}m`
                          : hasMinor
                            ? `Minor · +${item.maxDelay}m`
                            : 'Normal service'}
                      </span>
                    </div>
                  </div>

                  {/* Delay visual bar */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          backgroundColor: item.line.color_hex,
                          width: `${Math.min(100, Math.max(12, 100 - item.maxDelay * 2))}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono text-[9px] text-slate-400 shrink-0">
                      {item.maxDelay > 0 ? `+${item.maxDelay}m delay` : '100% on-time'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <TrainFront className="h-3 w-3 text-slate-400" />
          <span>Fleet Capacity: <strong className="text-slate-300 font-mono">{totalTrips}</strong> active trips</span>
        </span>
        <span className="font-mono text-emerald-400/80">Realtime GPS Sync</span>
      </div>
    </section>
  );
}
