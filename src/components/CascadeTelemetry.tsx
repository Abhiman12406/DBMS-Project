'use client';

import { useRef } from 'react';
import {
  CheckCircle2,
  Database,
  GitBranch,
  Layers,
  Radio,
  Timer,
  Users,
} from 'lucide-react';

import { gsap, useGSAP } from '@/lib/gsap';
import { delayClasses, formatDelay } from '@/lib/format';
import type { CascadeResult } from '@/lib/types';

interface CascadeTelemetryProps {
  cascade: CascadeResult | null;
}

function severityClasses(severity: string | undefined): string {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-[#FF5757] text-white border-black';
    case 'SEVERE':
      return 'bg-[#FF8800] text-black border-black';
    case 'MODERATE':
      return 'bg-[#4EFA8B] text-black border-black';
    default:
      return 'bg-[#00F0FF] text-black border-black';
  }
}

export function CascadeTelemetry({ cascade }: CascadeTelemetryProps) {
  const telemetryRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!cascade) return;

      // Animate the 3 KPI metric tiles with a punchy spring pop
      gsap.from('.gsap-cascade-kpi', {
        scale: 0.8,
        opacity: 0,
        y: 12,
        duration: 0.42,
        stagger: 0.08,
        ease: 'back.out(2)',
        clearProps: 'transform',
      });

      // Animate downstream propagation hops sliding in sequentially
      gsap.from('.gsap-cascade-hop', {
        x: -24,
        opacity: 0,
        duration: 0.35,
        stagger: 0.05,
        ease: 'power3.out',
        clearProps: 'transform',
      });

      // Animate depth badge pop
      gsap.from('.gsap-depth-badge', {
        scale: 0.6,
        opacity: 0,
        duration: 0.32,
        ease: 'back.out(2.2)',
        clearProps: 'transform',
      });
    },
    { scope: telemetryRef, dependencies: [cascade] },
  );

  return (
    <section
      ref={telemetryRef}
      className="brutal-card p-5 flex flex-col justify-between h-full bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]"
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-2 py-0.5 rounded">
                Recursive Engine
              </span>
              <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[9px] font-black text-black border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                CTE TRAVERSAL
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-black text-black sm:text-xl">
              <GitBranch className="h-5 w-5 text-black stroke-[2.5] shrink-0" />
              <span>Downstream Propagation</span>
            </h2>
          </div>

          {cascade ? (
            <span className="flex items-center gap-1.5 rounded-lg bg-[#4EFA8B] px-2.5 py-1 text-[10px] font-black text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
              <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>{cascade.incident.postgres_sync?.status ?? 'APPLIED'}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
              <Radio className="h-3.5 w-3.5 text-black stroke-[2.5] animate-pulse" />
              <span>STANDBY</span>
            </span>
          )}
        </div>

        {cascade ? (
          <div className="mt-4 space-y-3.5">
            {/* Incident Header Info */}
            <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3 flex flex-wrap items-center justify-between gap-2 shadow-[2px_2px_0px_0px_#000]">
              <div>
                <p className="font-mono text-xs font-black text-black flex items-center gap-2">
                  <span>{cascade.incident.incident_code}</span>
                  <span
                    className={`rounded px-2 py-0.2 text-[9px] font-black uppercase border ${severityClasses(
                      cascade.incident.severity,
                    )} shadow-[1px_1px_0px_0px_#000]`}
                  >
                    {cascade.incident.severity}
                  </span>
                </p>
                <p className="font-mono text-[9px] font-bold text-slate-600 mt-0.5 break-all">
                  Doc: {String(cascade.incident._id ?? 'local-sync')}
                </p>
              </div>

              <span className="gsap-depth-badge font-mono text-[10px] font-black text-black bg-[#FFE600] px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_#000]">
                DEPTH {Math.max(1, ...cascade.downstreamTrips.map((d) => d.min_cascade_depth))} HOPS
              </span>
            </div>

            {/* 3 Metric Tiles */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="gsap-cascade-kpi rounded-xl border-2 border-black bg-[#FF5757] p-2.5 shadow-[2px_2px_0px_0px_#000]">
                <p className="text-2xl font-black font-mono text-white">
                  {cascade.affectedTripCount}
                </p>
                <p className="text-[10px] font-black uppercase text-white mt-0.5">Trips Impacted</p>
              </div>
              <div className="gsap-cascade-kpi rounded-xl border-2 border-black bg-[#FFE600] p-2.5 shadow-[2px_2px_0px_0px_#000]">
                <p className="text-2xl font-black font-mono text-black">
                  {cascade.affectedPassengerCount}
                </p>
                <p className="text-[10px] font-black uppercase text-black mt-0.5">Stranded Pax</p>
              </div>
              <div className="gsap-cascade-kpi rounded-xl border-2 border-black bg-[#4EFA8B] p-2.5 shadow-[2px_2px_0px_0px_#000]">
                <p className="text-2xl font-black font-mono text-black flex items-center justify-center gap-0.5">
                  <Timer className="h-4 w-4 stroke-[2.5]" />
                  <span>{cascade.executionTimeMs.toFixed(1)}</span>
                </p>
                <p className="text-[10px] font-black uppercase text-black mt-0.5">ms Exec Time</p>
              </div>
            </div>

            {/* Downstream Propagation Hops */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 mb-2 flex items-center gap-1.5">
                <Layers className="h-3 w-3 stroke-[2.5]" />
                <span>Cascade Chain (Max 6 Hops)</span>
              </p>

              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {cascade.downstreamTrips.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-black bg-[#FAF8F5] p-3 text-center text-xs font-bold text-slate-700">
                    No connecting downstream trips within the 45-minute horizon.
                  </p>
                ) : (
                  cascade.downstreamTrips.slice(0, 5).map((trip) => (
                    <div
                      key={trip.trip_id}
                      className="gsap-cascade-hop flex items-center justify-between gap-2 rounded-xl border-2 border-black bg-[#FAF8F5] p-2.5 text-xs shadow-[2px_2px_0px_0px_#000] transition-transform duration-120 hover:-translate-y-0.5 hover:bg-white"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-black shadow-[1px_1px_0px_0px_#000]"
                          style={{ backgroundColor: trip.color_hex }}
                        />
                        <span className="font-mono font-black text-black">
                          {trip.train_number}
                        </span>
                        <span className="truncate text-[11px] font-bold text-slate-700">
                          {trip.origin_station} → {trip.destination_station}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded bg-black text-[#FFE600] px-1.5 py-0.5 font-mono font-black text-[9px] border border-black">
                          HOP {trip.min_cascade_depth}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${delayClasses(
                            trip.max_delay_min,
                          )}`}
                        >
                          {formatDelay(trip.max_delay_min)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Raw MongoDB Document Accordion */}
            <details className="group rounded-xl border-2 border-black bg-white p-2.5 shadow-[2px_2px_0px_0px_#000]">
              <summary className="cursor-pointer text-[10px] font-mono font-black uppercase tracking-[0.15em] text-black flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>View MongoDB Event Document</span>
                </span>
                <span className="text-[10px] font-black group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[#FAF8F5] p-2.5 font-mono text-[10.5px] font-bold leading-relaxed text-black border-2 border-black">
                {JSON.stringify(cascade.incident, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          /* Standby State */
          <div className="mt-4 rounded-2xl border-2 border-dashed border-black bg-[#FAF8F5] p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE600] border-2 border-black shadow-[3px_3px_0px_0px_#000] text-black mb-3">
              <GitBranch className="h-7 w-7 stroke-[2.5]" />
            </div>
            <h3 className="text-sm font-black text-black uppercase tracking-tight">Engine in Standby</h3>
            <p className="mt-1 text-xs font-semibold text-slate-700 leading-relaxed max-w-xs mx-auto">
              Select an incident preset above and trigger a disruption. PostgreSQL recursive CTE will traverse all connecting dependencies.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-[10px]">
              <div className="rounded-xl border-2 border-black bg-white p-2.5 shadow-[2px_2px_0px_0px_#000]">
                <span className="text-slate-600 font-bold block uppercase">Horizon window</span>
                <span className="font-mono text-black font-black text-xs">45 MINUTES</span>
              </div>
              <div className="rounded-xl border-2 border-black bg-white p-2.5 shadow-[2px_2px_0px_0px_#000]">
                <span className="text-slate-600 font-bold block uppercase">Max depth</span>
                <span className="font-mono text-black font-black text-xs">6 HOPS</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-2.5 border-t-2 border-black flex items-center justify-between text-[11px] font-bold text-black">
        <span>PostgreSQL 16 Recursive CTE</span>
        <span className="font-mono font-black text-black bg-slate-100 px-1.5 py-0.5 rounded border border-black">
          {cascade ? `${cascade.downstreamTrips.length} CONNECTING TRIPS` : 'ZERO ACTIVE CASCADES'}
        </span>
      </div>
    </section>
  );
}
