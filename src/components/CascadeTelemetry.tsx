'use client';

import {
  CheckCircle2,
  Database,
  GitBranch,
  Layers,
  Radio,
  Timer,
  Users,
} from 'lucide-react';

import { delayClasses, formatDelay } from '@/lib/format';
import type { CascadeResult } from '@/lib/types';

interface CascadeTelemetryProps {
  cascade: CascadeResult | null;
}

function severityClasses(severity: string | undefined): string {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'SEVERE':
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'MODERATE':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    default:
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  }
}

export function CascadeTelemetry({ cascade }: CascadeTelemetryProps) {
  return (
    <section className="bento-card p-5 flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">
                Recursive Engine
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 border border-white/5">
                CTE Traversal
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-white sm:text-lg">
              <GitBranch className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Downstream Propagation</span>
            </h2>
          </div>

          {cascade ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" />
              <span>{cascade.incident.postgres_sync?.status ?? 'APPLIED'}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-400 border border-white/10">
              <Radio className="h-3 w-3 text-sky-400 animate-pulse" />
              <span>Standby</span>
            </span>
          )}
        </div>

        {cascade ? (
          <div className="mt-4 space-y-3.5">
            {/* Incident Header Info */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-bold text-white flex items-center gap-2">
                  <span>{cascade.incident.incident_code}</span>
                  <span
                    className={`rounded-full px-2 py-0.2 text-[9px] font-semibold border ${severityClasses(
                      cascade.incident.severity,
                    )}`}
                  >
                    {cascade.incident.severity}
                  </span>
                </p>
                <p className="font-mono text-[9px] text-slate-400 mt-0.5 break-all">
                  Mongo Doc: {cascade.incident._id ?? 'local-sync'}
                </p>
              </div>

              <span className="font-mono text-[10px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                Depth {Math.max(1, ...cascade.downstreamTrips.map((d) => d.min_cascade_depth))} hops
              </span>
            </div>

            {/* 3 Metric Tiles */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <p className="text-xl font-bold font-mono text-white">
                  {cascade.affectedTripCount}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Trips Impacted</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <p className="text-xl font-bold font-mono text-amber-300">
                  {cascade.affectedPassengerCount}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Stranded Pax</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <p className="text-xl font-bold font-mono text-emerald-300 flex items-center justify-center gap-0.5">
                  <Timer className="h-3.5 w-3.5" />
                  <span>{cascade.executionTimeMs.toFixed(1)}</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">ms Exec Time</p>
              </div>
            </div>

            {/* Downstream Propagation Hops */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2 flex items-center gap-1.5">
                <Layers className="h-3 w-3" />
                <span>Cascade Chain (Max 6 Hops)</span>
              </p>

              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {cascade.downstreamTrips.length === 0 ? (
                  <p className="rounded-lg border border-white/5 p-3 text-center text-xs text-slate-500">
                    No connecting downstream trips within the 45-minute horizon.
                  </p>
                ) : (
                  cascade.downstreamTrips.slice(0, 5).map((trip) => (
                    <div
                      key={trip.trip_id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2 text-xs transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: trip.color_hex }}
                        />
                        <span className="font-mono font-bold text-slate-200">
                          {trip.train_number}
                        </span>
                        <span className="truncate text-[11px] text-slate-400">
                          {trip.origin_station} → {trip.destination_station}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                          Hop {trip.min_cascade_depth}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold border ${delayClasses(
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
            <details className="group rounded-xl border border-white/10 bg-slate-950/80 p-2.5 transition-colors">
              <summary className="cursor-pointer text-[10px] font-mono font-medium uppercase tracking-[0.15em] text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Database className="h-3 w-3 text-sky-400" />
                  <span>View MongoDB Event Document</span>
                </span>
                <span className="text-[9px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/50 p-2 font-mono text-[10px] leading-relaxed text-slate-300 border border-white/5">
                {JSON.stringify(cascade.incident, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          /* Standby State */
          <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3">
              <GitBranch className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">Engine in Standby</h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Select an incident preset above and trigger a disruption. PostgreSQL recursive CTE will traverse all connecting dependencies.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-[10px]">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                <span className="text-slate-500 block">Horizon window</span>
                <span className="font-mono text-slate-200 font-semibold">45 minutes</span>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                <span className="text-slate-500 block">Max recursion depth</span>
                <span className="font-mono text-slate-200 font-semibold">6 hops</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
        <span>PostgreSQL 16 Recursive CTE</span>
        <span className="font-mono text-slate-400">
          {cascade ? `${cascade.downstreamTrips.length} connecting trips` : 'Zero cascades active'}
        </span>
      </div>
    </section>
  );
}
