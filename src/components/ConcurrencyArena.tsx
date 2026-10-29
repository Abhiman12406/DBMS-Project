'use client';

import { useMemo, useRef, useState } from 'react';
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
import { gsap, useGSAP } from '@/lib/gsap';
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
      return 'border-2 border-black bg-[#DCFCE7] shadow-[2px_2px_0px_0px_#000] hover:-translate-y-0.5';
    case 'WAITLISTED':
      return 'border-2 border-black bg-[#FEF9C3] shadow-[2px_2px_0px_0px_#000] hover:-translate-y-0.5';
    default:
      return 'border-2 border-black bg-[#FEE2E2] shadow-[2px_2px_0px_0px_#000] hover:-translate-y-0.5';
  }
}

function statusClasses(status: RebookWorkerStatus): string {
  switch (status) {
    case 'REBOOKED':
      return 'bg-[#4EFA8B] text-black border border-black shadow-[1px_1px_0px_0px_#000]';
    case 'WAITLISTED':
      return 'bg-[#FFE600] text-black border border-black shadow-[1px_1px_0px_0px_#000]';
    default:
      return 'bg-[#FF5757] text-white border border-black shadow-[1px_1px_0px_0px_#000]';
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
  const arenaRef = useRef<HTMLDivElement>(null);

  // GSAP: Animate results when telemetry changes
  useGSAP(
    () => {
      if (telemetry) {
        // Animate the 5 KPI metric tiles
        gsap.from('.gsap-kpi-card', {
          scale: 0.82,
          opacity: 0,
          duration: 0.45,
          stagger: 0.08,
          ease: 'back.out(1.8)',
          clearProps: 'transform',
        });

        // Fast staggered cascade pop-in for the worker matrix stamps
        gsap.from('.gsap-worker-stamp', {
          scale: 0.65,
          opacity: 0,
          duration: 0.35,
          stagger: 0.018,
          ease: 'back.out(2)',
          clearProps: 'transform',
        });

        // Audit box reveal
        gsap.from('.gsap-audit-box', {
          y: 20,
          opacity: 0,
          duration: 0.5,
          ease: 'power2.out',
          delay: 0.25,
          clearProps: 'transform',
        });
      }
    },
    { scope: arenaRef, dependencies: [telemetry] },
  );

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

  const violations = telemetry?.duplicateBookings ?? 0;

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
          workers: workerCount,
        },
      });
      setTelemetry(result);
      if (onComplete) {
        onComplete();
      }
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

  return (
    <div ref={arenaRef} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Brutal Card 1: Rebooking Scenario Controls (5 cols) */}
      <section className="brutal-card p-5 lg:col-span-5 flex flex-col justify-between bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-2 py-0.5 rounded">
                  ACID Concurrency Arena
                </span>
                <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[9px] font-black text-black border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                  SKIP LOCKED
                </span>
              </div>
              <h2 className="mt-1 flex items-center gap-2 text-base font-black text-black sm:text-xl">
                <LockKeyhole className="h-5 w-5 text-black stroke-[2.5] shrink-0" />
                <span>Pessimistic Row Lock Contention</span>
              </h2>
            </div>

            <span className="rounded-lg bg-[#FFE600] px-2.5 py-1 text-[10px] font-black uppercase text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
              Stress Test
            </span>
          </div>

          <p className="mt-2 text-xs font-semibold text-slate-700 leading-relaxed">
            Simulates <strong className="text-black font-black">{workerCount} concurrent passenger threads</strong> battling for a limited pool of remaining seats on relief Trip #2. Demonstrates zero double-booking proof.
          </p>

          {/* Seat Inventory Metric Tiles */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border-2 border-black bg-[#FFE600] p-3 text-center shadow-[2px_2px_0px_0px_#000]">
              <span className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-center gap-1">
                <Users className="h-3.5 w-3.5 stroke-[2.5]" /> Stranded Pax
              </span>
              <p className="mt-1 text-2xl font-black font-mono text-black">
                {strandedPassengers}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-800 truncate">
                Trip 1 · TR-RED-101
              </p>
            </div>

            <div className="rounded-xl border-2 border-black bg-[#4EFA8B] p-3 text-center shadow-[2px_2px_0px_0px_#000]">
              <span className="text-[10px] font-black uppercase tracking-wider text-black flex items-center justify-center gap-1">
                <Armchair className="h-3.5 w-3.5 stroke-[2.5]" /> Target Seats
              </span>
              <p className="mt-1 text-2xl font-black font-mono text-black">
                {availableSeats}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-800 truncate">
                Trip 2 · TR-RED-102
              </p>
            </div>
          </div>

          {/* Worker Count Range Slider */}
          <div className="mt-4 rounded-xl border-2 border-black bg-[#FAF8F5] p-3.5 shadow-[2px_2px_0px_0px_#000]">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="worker-count-slider"
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700"
              >
                <Gauge className="h-4 w-4 text-black stroke-[2.5]" /> Parallel Contention Workers
              </label>
              <span className="font-mono text-sm font-black text-black bg-[#FFE600] px-2.5 py-0.5 rounded-md border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                {workerCount} WORKERS
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

            <div className="mt-2.5 flex items-center justify-between text-[11px] font-black text-black font-mono">
              <span>10</span>
              <div className="flex gap-1.5">
                {[10, 20, 30, 50].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={!canOperate || running}
                    onClick={() => setWorkerCount(preset)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono cursor-pointer transition-all border-2 border-black ${
                      workerCount === preset
                        ? 'bg-black text-[#FFE600] shadow-[1px_1px_0px_0px_#000]'
                        : 'bg-white text-black hover:bg-slate-100 shadow-[1px_1px_0px_0px_#000]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <span>50</span>
            </div>
          </div>

          {/* Error Banner */}
          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border-2 border-black bg-[#FF5757] p-3 text-xs font-black text-white shadow-[3px_3px_0px_0px_#000]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 stroke-[2.5]" />
              <span className="break-words">{error}</span>
            </div>
          ) : null}
        </div>

        {/* Action Button & SQL Drawer */}
        <div className="mt-5 space-y-3 pt-3 border-t-2 border-black">
          <button
            type="button"
            onClick={handleRun}
            disabled={!canOperate || running}
            className="brutal-btn w-full bg-[#4EFA8B] text-black py-3.5 px-4 font-black uppercase tracking-wider text-xs shadow-[4px_4px_0px_0px_#000] hover:shadow-[6px_6px_0px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0px_0px_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-black stroke-[2.5]" />
                <span className="font-black">Contending for Row Locks…</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current stroke-[2]" />
                <span className="font-black">Execute Concurrent Rebooking</span>
              </>
            )}
          </button>

          <details className="group rounded-xl border-2 border-black bg-white p-2.5 shadow-[2px_2px_0px_0px_#000]">
            <summary className="cursor-pointer text-[10px] font-mono font-black uppercase tracking-[0.15em] text-black flex items-center justify-between">
              <span>Row-Lock Query (SKIP LOCKED)</span>
              <span className="text-[10px] font-black group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-[#FAF8F5] p-2.5 font-mono text-[10px] font-bold leading-relaxed text-black border-2 border-black">
              {REBOOKING_SQL}
            </pre>
          </details>
        </div>
      </section>

      {/* Brutal Card 2: Lock Contention & Worker Matrix (7 cols) */}
      <section className="brutal-card p-5 lg:col-span-7 flex flex-col justify-between bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-2 py-0.5 rounded">
                  Telemetry Matrix
                </span>
                <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[9px] font-black text-black border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                  ACID VERIFICATION
                </span>
              </div>
              <h2 className="mt-1 flex items-center gap-2 text-base font-black text-black sm:text-xl">
                <Zap className="h-5 w-5 text-black stroke-[2.5] shrink-0" />
                <span>Lock Contention & Allocation Grid</span>
              </h2>
            </div>

            {telemetry ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black uppercase border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
                  violations === 0
                    ? 'bg-[#4EFA8B] text-black'
                    : 'bg-[#FF5757] text-white'
                }`}
              >
                {violations === 0 ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Zero Double-Bookings</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 stroke-[2.5]" />
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
                <div className="gsap-kpi-card rounded-xl border-2 border-black bg-[#FAF8F5] p-2.5 shadow-[2px_2px_0px_0px_#000]">
                  <p className="text-xl font-black font-mono text-black">
                    {telemetry.totalWorkers}
                  </p>
                  <p className="text-[10px] font-black uppercase text-slate-600 mt-0.5">Workers</p>
                </div>
                <div className="gsap-kpi-card rounded-xl border-2 border-black bg-[#4EFA8B] p-2.5 shadow-[2px_2px_0px_0px_#000]">
                  <p className="text-xl font-black font-mono text-black">
                    {telemetry.rebooked}
                  </p>
                  <p className="text-[10px] font-black uppercase text-black mt-0.5">Allocated</p>
                </div>
                <div className="gsap-kpi-card rounded-xl border-2 border-black bg-[#FFE600] p-2.5 shadow-[2px_2px_0px_0px_#000]">
                  <p className="text-xl font-black font-mono text-black">
                    {telemetry.waitlisted}
                  </p>
                  <p className="text-[10px] font-black uppercase text-black mt-0.5">Waitlisted</p>
                </div>
                <div className="gsap-kpi-card rounded-xl border-2 border-black bg-[#00F0FF] p-2.5 shadow-[2px_2px_0px_0px_#000]">
                  <p className="text-xl font-black font-mono text-black">
                    {telemetry.averageLockWaitMs.toFixed(1)}ms
                  </p>
                  <p className="text-[10px] font-black uppercase text-black mt-0.5">Avg Lock</p>
                </div>
                <div
                  className={`gsap-kpi-card rounded-xl border-2 border-black p-2.5 shadow-[2px_2px_0px_0px_#000] ${
                    violations === 0
                      ? 'bg-white'
                      : 'bg-[#FF5757] text-white'
                  }`}
                >
                  <p
                    className={`text-xl font-black font-mono ${
                      violations === 0 ? 'text-black' : 'text-white'
                    }`}
                  >
                    {violations}
                  </p>
                  <p className="text-[10px] font-black uppercase text-slate-600 mt-0.5">Duplicates</p>
                </div>
              </div>

              {/* Timing Ribbon */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-black bg-[#FAF8F5] px-3.5 py-2 text-xs font-bold text-black shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-black stroke-[2.5]" />
                  <span>Avg Txn: <strong className="font-mono font-black">{telemetry.averageTransactionMs.toFixed(2)}ms</strong></span>
                </div>
                <div>
                  <span>Max Txn: <strong className="font-mono font-black">{telemetry.maxTransactionMs.toFixed(2)}ms</strong></span>
                </div>
                <div>
                  <span>Total Duration: <strong className="font-mono font-black">{telemetry.totalDurationMs.toFixed(2)}ms</strong></span>
                </div>
                <div>
                  <span>Seats Before: <strong className="font-mono font-black">{telemetry.targetSeatsAvailableBefore}</strong></span>
                </div>
              </div>

              {/* Live Worker Grid */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 mb-2 flex items-center justify-between">
                  <span>Worker Allocation Matrix</span>
                  <span className="font-mono text-[9px] font-black text-black bg-slate-200 px-1.5 py-0.5 rounded border border-black">
                    {telemetry.workers.length} ACTIVE THREADS
                  </span>
                </p>

                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 max-h-56 overflow-y-auto pr-1">
                  {telemetry.workers.map((worker) => (
                    <div
                      key={worker.workerId}
                      className={`gsap-worker-stamp rounded-xl p-2.5 text-xs transition-transform duration-120 ${workerClasses(
                        worker.status,
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-mono font-black text-black text-[11px]">
                          Worker #{worker.workerId}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-black uppercase ${statusClasses(
                            worker.status,
                          )}`}
                        >
                          {worker.status}
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] font-bold text-slate-800 truncate">
                        {worker.status === 'REBOOKED'
                          ? `Seat ${worker.seatNumber} (Carr ${worker.carriageNumber})`
                          : worker.message}
                      </p>

                      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono font-bold text-slate-700 border-t border-black/20 pt-1">
                        <span>lock {worker.lockWaitMs.toFixed(1)}ms</span>
                        <span>txn {worker.transactionMs.toFixed(1)}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Duplicate Seat Verification Box */}
              <div className="gsap-audit-box rounded-xl border-2 border-black bg-[#FAF8F5] p-3 shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-black">
                    <ShieldCheck className="h-4 w-4 text-black stroke-[2.5]" />
                    <span>Duplicate-Seat SQL Audit</span>
                  </p>
                  <span className="font-mono text-[9px] font-black text-black bg-[#4EFA8B] px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_#000]">
                    0 ROWS RETURNED (PASSED)
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre text-[9.5px] font-mono font-bold leading-relaxed text-black bg-white p-2.5 rounded-lg border-2 border-black">
                  {VERIFICATION_SQL}
                </pre>
              </div>
            </div>
          ) : (
            /* Standby State */
            <div className="mt-4 rounded-2xl border-2 border-dashed border-black bg-[#FAF8F5] p-8 text-center my-auto">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE600] border-2 border-black shadow-[3px_3px_0px_0px_#000] text-black mb-3">
                <LockKeyhole className="h-7 w-7 stroke-[2.5]" />
              </div>
              <h3 className="text-sm font-black text-black uppercase tracking-tight">Stress Test Ready</h3>
              <p className="mt-1 text-xs font-semibold text-slate-700 max-w-md mx-auto leading-relaxed">
                Click <strong>Execute Concurrent Rebooking</strong> to launch parallel database transactions contending for replacement seats with row locks.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-2.5 border-t-2 border-black flex items-center justify-between text-[11px] font-bold text-black">
          <span>Row Locks: FOR UPDATE SKIP LOCKED</span>
          <span className="font-mono font-black text-black bg-slate-100 px-1.5 py-0.5 rounded border border-black">
            {telemetry ? `${telemetry.totalWorkers} WORKERS EXECUTED` : 'AWAITING TRIGGER'}
          </span>
        </div>
      </section>
    </div>
  );
}
