'use client';

import { useMemo, useRef } from 'react';
import { Activity, AlertTriangle, CheckCircle2, TrainFront } from 'lucide-react';

import { gsap, useGSAP } from '@/lib/gsap';
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
  const containerRef = useRef<HTMLElement>(null);

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

  useGSAP(
    () => {
      if (linesHealth.length === 0) return;

      gsap.from('.gsap-line-card', {
        y: 12,
        opacity: 0,
        scale: 0.96,
        stagger: 0.06,
        duration: 0.35,
        ease: 'power3.out',
        clearProps: 'transform',
      });
    },
    { scope: containerRef, dependencies: [linesHealth] },
  );

  return (
    <section
      ref={containerRef}
      className="brutal-card p-5 flex flex-col justify-between h-full bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]"
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-2 py-0.5 rounded">
                Fleet Operations
              </span>
              <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[9px] font-black text-black border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                4 CORRIDORS
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-black text-black sm:text-xl">
              <Activity className="h-5 w-5 text-black stroke-[2.5] shrink-0" />
              <span>Line Health Matrix</span>
            </h2>
          </div>

          <span
            className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
              totalImpacted > 0
                ? 'bg-[#FFE600] text-black'
                : 'bg-[#4EFA8B] text-black'
            }`}
          >
            {totalImpacted > 0 ? `${totalImpacted} Lines Delayed` : 'All Systems Optimal'}
          </span>
        </div>

        {/* Lines Grid */}
        <div className="mt-4 space-y-2.5">
          {loading && !snapshot ? (
            <div className="space-y-2 py-2">
              <div className="h-14 animate-pulse rounded-xl border-2 border-black bg-slate-100 shadow-[2px_2px_0px_0px_#000]" />
              <div className="h-14 animate-pulse rounded-xl border-2 border-black bg-slate-100 shadow-[2px_2px_0px_0px_#000]" />
              <div className="h-14 animate-pulse rounded-xl border-2 border-black bg-slate-100 shadow-[2px_2px_0px_0px_#000]" />
              <div className="h-14 animate-pulse rounded-xl border-2 border-black bg-slate-100 shadow-[2px_2px_0px_0px_#000]" />
            </div>
          ) : (
            linesHealth.map((item) => {
              const hasSevere = item.cancelled || item.maxDelay >= 15;
              const hasMinor = item.maxDelay > 0 && item.maxDelay < 15;

              return (
                <div
                  key={item.line.line_id}
                  className="gsap-line-card rounded-xl border-2 border-black bg-[#FAF8F5] p-3 shadow-[2px_2px_0px_0px_#000] transition-transform duration-120 hover:-translate-y-0.5 hover:bg-white hover:shadow-[3px_3px_0px_0px_#000]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-4 w-4 shrink-0 rounded-md border-2 border-black shadow-[1px_1px_0px_0px_#000]"
                        style={{ backgroundColor: item.line.color_hex }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-black text-black truncate uppercase tracking-tight">
                          {item.line.name}
                        </p>
                        <p className="font-mono text-[10px] font-bold text-slate-600">
                          {item.activeTrips} active scheduled {item.activeTrips === 1 ? 'trip' : 'trips'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-black uppercase border-2 border-black shadow-[1px_1px_0px_0px_#000] ${
                          hasSevere
                            ? 'bg-[#FF5757] text-white'
                            : hasMinor
                              ? 'bg-[#FFE600] text-black'
                              : 'bg-[#4EFA8B] text-black'
                        }`}
                      >
                        {hasSevere ? (
                          <AlertTriangle className="h-3 w-3 stroke-[2.5]" />
                        ) : hasMinor ? (
                          <Activity className="h-3 w-3 stroke-[2.5]" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 stroke-[2.5]" />
                        )}
                        {hasSevere
                          ? `Severe · +${item.maxDelay}m`
                          : hasMinor
                            ? `Minor · +${item.maxDelay}m`
                            : 'Normal service'}
                      </span>
                    </div>
                  </div>

                  {/* Delay visual progress bar */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          backgroundColor: item.line.color_hex,
                          width: `${Math.min(100, Math.max(12, 100 - item.maxDelay * 2))}%`,
                        }}
                      />
                    </div>
                    <span className="font-mono text-[10px] font-black text-black shrink-0">
                      {item.maxDelay > 0 ? `+${item.maxDelay}m delay` : '100% ON-TIME'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-2.5 border-t-2 border-black flex items-center justify-between text-[11px] font-bold text-black">
        <span className="flex items-center gap-1.5">
          <TrainFront className="h-3.5 w-3.5 text-black stroke-[2.5]" />
          <span>Fleet Capacity: <strong className="text-black font-mono font-black bg-[#FFE600] px-1 rounded border border-black">{totalTrips}</strong> active trips</span>
        </span>
        <span className="font-mono font-black text-black bg-[#00F0FF] px-1.5 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_#000]">
          GPS SYNC
        </span>
      </div>
    </section>
  );
}
