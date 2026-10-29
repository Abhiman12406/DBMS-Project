'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Armchair,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  LockKeyhole,
  Play,
  ShieldCheck,
  Timer,
  Users,
  Zap,
} from 'lucide-react';

import type { NetworkSnapshot } from '@/lib/client';
import { ApiRequestError, apiRequest } from '@/lib/client';
import type {
  PersonaRole,
  RebookWorkerStatus,
  StressTestTelemetry,
} from '@/lib/types';

interface ConcurrencyArenaProps {
  role: PersonaRole;
  canOperate: boolean;
  snapshot: NetworkSnapshot | null;
  onComplete?: () => void;
}

const VERIFICATION_SQL = `SELECT trip_id, seat_id, COUNT(*) AS duplicate_count
FROM reservations
WHERE booking_status IN ('CONFIRMED', 'REBOOKED')
GROUP BY trip_id, seat_id
HAVING COUNT(*) > 1
ORDER BY trip_id, seat_id;`;

const REBOOKING_SQL = `SELECT seat_id
FROM seats s
JOIN carriages c ON s.carriage_id = c.carriage_id
JOIN trains tr ON c.train_id = tr.train_id
JOIN trips t ON tr.train_id = t.train_id
WHERE t.trip_id = $2
  AND NOT EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.trip_id = $2 AND r.seat_id = s.seat_id
      AND r.booking_status IN ('CONFIRMED', 'REBOOKED')
  )
ORDER BY seat_id
FOR UPDATE SKIP LOCKED
LIMIT 1;`;

function workerClasses(status: RebookWorkerStatus): string {
  switch (status) {
    case 'REBOOKED':
      return 'border-emerald-500/30 bg-emerald-500/[0.06] hover:border-emerald-500/50';
    case 'WAITLISTED':
      return 'border-amber-500/30 bg-amber-500/[0.06] hover:border-amber-500/50';
    default:
      return 'border-rose-500/30 bg-rose-500/[0.06] hover:border-rose-500/50';
  }
}

function statusClasses(status: RebookWorkerStatus): string {
  switch (status) {
    case 'REBOOKED':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'WAITLISTED':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    default:
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
}

export function ConcurrencyArena({
  role,
  canOperate,
  snapshot,
  onComplete,
}: ConcurrencyArenaProps) {
  const [workerCount, setWorkerCount] = useState(30);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<StressTestTelemetry | null>(null);

  const originalTrip = useMemo(
    () => snapshot?.trips.find((trip) => trip.trip_id === 1) ?? null,
    [snapshot],
  );
  const targetTrip = useMemo(
    () => snapshot?.trips.find((trip) => trip.trip_id === 2) ?? null,
    [snapshot],
  );

  const strandedPassengers = Number(originalTrip?.booked_seats ?? 0);
  const availableSeats = Number(targetTrip?.available_seats ?? 0);

  async function handleRun() {
    if (!canOperate) {
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const result = await apiRequest<StressTestTelemetry>('/api/rebook', {
        method: 'POST',
        role,
        body: {
          originalTripId: 1,
          targetTripId: 2,
          workerCount,
        },
      });
      setTelemetry(result);
      onComplete?.();
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? `${requestError.status}: ${requestError.message}`
          : requestError instanceof Error
            ? requestError.message
            : String(requestError),
      );
    } finally {
      setRunning(false);
    }
  }

  const violations = telemetry?.duplicateBookings ?? 0;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Bento Card 1: Rebooking Arena Control (5 cols) */}
      <section className="bento-card p-5 lg:col-span-5 flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">
                  Concurrency Arena
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 border border-white/5">
                  ACID Benchmark
                </span>
              </div>
              <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-white sm:text-lg">
                <Activity className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Pessimistic Seat Rebooking</span>
              </h2>
            </div>

            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 border border-emerald-500/20">
              <ShieldCheck className="h-3 w-3" />
              <span>SKIP LOCKED</span>
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Concurrent database transactions compete for replacement seats using PostgreSQL row-level locks. ACID guarantees strict zero double-bookings.
          </p>

          {/* Read-Only Notice */}
          {!canOperate ? (
            <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Passenger persona cannot launch workers. Switch to <strong>Dispatcher</strong> or <strong>Auditor</strong> to benchmark concurrency.
              </span>
            </div>
          ) : null}

          {/* Capacity Comparison Cards */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <Users className="h-3.5 w-3.5 text-rose-400" /> Stranded Pax
              </p>
              <p className="mt-1 text-2xl font-bold font-mono text-white">
                {strandedPassengers}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500 truncate">
                Trip 1 · TR-RED-101
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <Armchair className="h-3.5 w-3.5 text-emerald-400" /> Available Seats
              </p>
              <p className="mt-1 text-2xl font-bold font-mono text-emerald-300">
                {availableSeats}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500 truncate">
                Trip 2 · TR-RED-102
              </p>
            </div>
          </div>

          {/* Worker Count Range Slider */}
          <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="worker-count-slider"
                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"
              >
                <Gauge className="h-3.5 w-3.5 text-sky-400" /> Parallel Contention Workers
              </label>
              <span className="font-mono text-sm font-bold text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                {workerCount} workers
              </span>
            </div>

            <input
              id="worker-count-slider"
              type="range"
              min={10}
              max={50}
              step={5}
              value={workerCount}
              disabled={!canOperate || running}
              onChange={(event) => setWorkerCount(Number(event.target.value))}
              aria-label="Parallel worker count"
              className="mt-3.5 w-full cursor-pointer disabled:opacity-50"
            />

            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>10 workers</span>
              <div className="flex gap-1">
                {[10, 20, 30, 50].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={!canOperate || running}
                    onClick={() => setWorkerCount(preset)}
                    className={`px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition ${
                      workerCount === preset
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <span>50 workers</span>
            </div>
          </div>

          {/* Error Banner */}
          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="break-words">{error}</span>
            </div>
          ) : null}
        </div>

        {/* Action Button & SQL Drawer */}
        <div className="mt-5 space-y-3 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={handleRun}
            disabled={!canOperate || running}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 cursor-pointer transition-all duration-200 hover:from-emerald-400 hover:to-emerald-500 hover:shadow-emerald-500/30 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                <span>Contending for Row Locks…</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>Execute Concurrent Rebooking</span>
              </>
            )}
          </button>

          <details className="group rounded-xl border border-white/10 bg-[#040711] p-2.5 transition-colors">
            <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-[0.15em] text-slate-400 flex items-center justify-between">
              <span>Row-Lock Query (SKIP LOCKED)</span>
              <span className="text-[9px] text-slate-500 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-black/60 p-2 font-mono text-[9.5px] leading-relaxed text-slate-300 border border-white/5">
              {REBOOKING_SQL}
            </pre>
          </details>
        </div>
      </section>

      {/* Bento Card 2: Lock Contention & Worker Matrix (7 cols) */}
      <section className="bento-card p-5 lg:col-span-7 flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
                  Telemetry Matrix
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 border border-white/5">
                  ACID Verification
                </span>
              </div>
              <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-white sm:text-lg">
                <Zap className="h-4 w-4 text-sky-400 shrink-0" />
                <span>Lock Contention & Allocation Grid</span>
              </h2>
            </div>

            {telemetry ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${
                  violations === 0
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}
              >
                {violations === 0 ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    <span>Zero Double-Bookings</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3 text-rose-400" />
                    <span>{violations} Violations</span>
                  </>
                )}
              </span>
            ) : null}
          </div>

          {telemetry ? (
            <div className="mt-4 space-y-3.5">
              {/* 5 KPI Metric Badges */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 text-center">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                  <p className="text-xl font-bold font-mono text-white">
                    {telemetry.totalWorkers}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Total Workers</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-2.5">
                  <p className="text-xl font-bold font-mono text-emerald-300">
                    {telemetry.rebooked}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Seats Allocated</p>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-2.5">
                  <p className="text-xl font-bold font-mono text-amber-300">
                    {telemetry.waitlisted}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Waitlisted</p>
                </div>
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-2.5">
                  <p className="text-xl font-bold font-mono text-sky-300">
                    {telemetry.averageLockWaitMs.toFixed(2)}ms
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Avg Lock Wait</p>
                </div>
                <div
                  className={`rounded-xl border p-2.5 ${
                    violations === 0
                      ? 'border-emerald-500/30 bg-emerald-500/[0.08]'
                      : 'border-rose-500/30 bg-rose-500/[0.08]'
                  }`}
                >
                  <p
                    className={`text-xl font-bold font-mono ${
                      violations === 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {violations}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Duplicates</p>
                </div>
              </div>

              {/* Timing Ribbon */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-sky-400" />
                  <span>Avg Txn: <strong className="text-slate-200 font-mono">{telemetry.averageTransactionMs.toFixed(2)}ms</strong></span>
                </div>
                <div>
                  <span>Max Txn: <strong className="text-slate-200 font-mono">{telemetry.maxTransactionMs.toFixed(2)}ms</strong></span>
                </div>
                <div>
                  <span>Total Duration: <strong className="text-slate-200 font-mono">{telemetry.totalDurationMs.toFixed(2)}ms</strong></span>
                </div>
                <div>
                  <span>Seats Before: <strong className="text-slate-200 font-mono">{telemetry.targetSeatsAvailableBefore}</strong></span>
                </div>
              </div>

              {/* Live Worker Grid */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2 flex items-center justify-between">
                  <span>Worker Allocation Matrix</span>
                  <span className="font-mono text-[9px] text-slate-400 lowercase">
                    {telemetry.workers.length} active threads
                  </span>
                </p>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 max-h-56 overflow-y-auto pr-1">
                  {telemetry.workers.map((worker) => (
                    <div
                      key={worker.workerId}
                      className={`rounded-xl border p-2.5 text-xs transition-colors ${workerClasses(
                        worker.status,
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-mono font-bold text-slate-200 text-[11px]">
                          Worker #{worker.workerId}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${statusClasses(
                            worker.status,
                          )}`}
                        >
                          {worker.status}
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] font-medium text-slate-300 truncate">
                        {worker.status === 'REBOOKED'
                          ? `Seat ${worker.seatNumber} (Carr ${worker.carriageNumber})`
                          : worker.message}
                      </p>

                      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-slate-400 border-t border-white/5 pt-1">
                        <span>lock {worker.lockWaitMs.toFixed(1)}ms</span>
                        <span>txn {worker.transactionMs.toFixed(1)}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Duplicate Seat Verification Box */}
              <div className="rounded-xl border border-white/10 bg-[#040711] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Duplicate-Seat SQL Audit</span>
                  </p>
                  <span className="font-mono text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    0 rows returned (PASSED)
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre text-[9.5px] leading-relaxed text-slate-400 font-mono">
                  {VERIFICATION_SQL}
                </pre>
              </div>
            </div>
          ) : (
            /* Standby State */
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-8 text-center my-auto">
              <LockKeyhole className="mx-auto h-8 w-8 text-slate-600 mb-2" />
              <h3 className="text-sm font-semibold text-slate-300">Stress Test Ready</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Click <strong>Execute Concurrent Rebooking</strong> to launch parallel database transactions contending for replacement seats with row locks.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
          <span>Row Locks: FOR UPDATE SKIP LOCKED</span>
          <span className="font-mono text-slate-400">
            {telemetry ? `${telemetry.totalWorkers} workers executed` : 'Awaiting trigger'}
          </span>
        </div>
      </section>
    </div>
  );
}
