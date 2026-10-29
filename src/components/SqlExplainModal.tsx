'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  GitBranch,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  X,
} from 'lucide-react';

import type { AuditPayload } from '@/lib/client';
import { ApiRequestError, apiRequest } from '@/lib/client';
import type { CascadeResult, PersonaRole } from '@/lib/types';

interface SqlExplainModalProps {
  open: boolean;
  onClose: () => void;
  role: PersonaRole;
  cascade: CascadeResult | null;
}

type TabKey = 'plan' | 'locks' | 'roles' | 'sql';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Code2 }> = [
  { key: 'plan', label: 'EXPLAIN Plan', icon: GitBranch },
  { key: 'locks', label: 'pg_locks', icon: LockKeyhole },
  { key: 'roles', label: 'RBAC Grants', icon: ShieldCheck },
  { key: 'sql', label: 'Raw Queries', icon: Code2 },
];

const CASCADE_SQL = `WITH RECURSIVE downstream_cascade AS (
  -- Anchor: the disrupted trip from the affected station onward
  SELECT ts.trip_id, ts.station_id, ts.stop_sequence,
         ts.delay_arrival_min AS propagated_delay_min,
         1 AS cascade_depth, ARRAY[ts.trip_id] AS trip_path
  FROM timetable_stops ts
  WHERE ts.trip_id = $1 AND ts.station_id = $2

  UNION ALL

  -- Recursive: connecting trips within the 45-minute horizon
  SELECT next_stop.trip_id, next_stop.station_id, next_stop.stop_sequence,
         cascade.propagated_delay_min + $3,
         cascade.cascade_depth + 1,
         cascade.trip_path || next_stop.trip_id
  FROM downstream_cascade cascade
  JOIN timetable_stops current_stop
    ON current_stop.trip_id = cascade.trip_id
   AND current_stop.station_id = cascade.station_id
  JOIN timetable_stops next_stop
    ON next_stop.station_id = current_stop.station_id
   AND next_stop.trip_id <> cascade.trip_id
  WHERE NOT (next_stop.trip_id = ANY(cascade.trip_path))
    AND cascade.cascade_depth < 6
    AND next_stop.scheduled_departure
        <= current_stop.scheduled_departure + INTERVAL '45 minutes'
)
SELECT * FROM downstream_cascade
ORDER BY cascade_depth, scheduled_arrival;`;

const REBOOK_SQL = `SELECT seat_id
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

const RLS_SQL = `ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;

CREATE POLICY p_reservations_passenger_isolation ON reservations
    FOR SELECT
    TO passenger_role
    USING (
        passenger_id = NULLIF(
            current_setting('app.current_passenger_id', true), ''
        )::INT
    );`;

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarizePlan(plan: unknown): {
  nodeType: string;
  actualRows: string;
  actualTime: string;
  executionTime: string;
  planningTime: string;
} | null {
  if (!Array.isArray(plan) || plan.length === 0) {
    return null;
  }

  const root = plan[0] as {
    Plan?: Record<string, unknown>;
    'Execution Time'?: number;
    'Planning Time'?: number;
  };
  const node = root.Plan ?? {};

  return {
    nodeType: String(node['Node Type'] ?? 'Unknown'),
    actualRows: String(node['Actual Rows'] ?? '—'),
    actualTime: `${Number(node['Actual Total Time'] ?? 0).toFixed(2)} ms`,
    executionTime: `${Number(root['Execution Time'] ?? 0).toFixed(2)} ms`,
    planningTime: `${Number(root['Planning Time'] ?? 0).toFixed(2)} ms`,
  };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
      className="flex items-center gap-1 rounded-md border-2 border-black bg-[#FFE600] px-2 py-1 text-[10px] font-mono font-black text-black shadow-[1px_1px_0px_0px_#000] hover:-translate-y-0.5 transition cursor-pointer"
    >
      {copied ? <Check className="h-3 w-3 stroke-[2.5]" /> : <Copy className="h-3 w-3 stroke-[2.5]" />}
      <span>{copied ? 'COPIED' : 'COPY'}</span>
    </button>
  );
}

export function SqlExplainModal({
  open,
  onClose,
  role,
  cascade,
}: SqlExplainModalProps) {
  const [tab, setTab] = useState<TabKey>('plan');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);

  const tripId = cascade?.cascadeStops[0]?.trip_id ?? 1;
  const stationId = cascade?.cascadeStops[0]?.station_id ?? 3;
  const delayMin = 45;

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiRequest<AuditPayload>(
      `/api/audit?tripId=${tripId}&stationId=${stationId}&delayMin=${delayMin}`,
      {
        role,
        signal: controller.signal,
      },
    )
      .then((payload) => {
        if (!controller.signal.aborted) {
          setAudit(payload);
        }
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          requestError instanceof ApiRequestError
            ? `${requestError.status}: ${requestError.message}`
            : requestError instanceof Error
              ? requestError.message
              : String(requestError),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [open, role, tripId, stationId, delayMin]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const planSummary = useMemo(
    () => summarizePlan(audit?.explain.plan),
    [audit],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close SQL console"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm transition-opacity"
      />

      {/* Neu-Brutalist Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sql-explain-title"
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border-[3px] border-black bg-white shadow-[8px_8px_0px_0px_#000000]"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-black p-5 bg-[#FAF8F5]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-2 py-0.5 rounded">
                Auditor Console
              </span>
              <span className="rounded bg-[#00F0FF] px-2 py-0.5 font-mono text-[9px] font-black text-black border border-black shadow-[1px_1px_0px_0px_#000]">
                transit_admin
              </span>
            </div>
            <h2
              id="sql-explain-title"
              className="mt-1 flex items-center gap-2 text-lg font-black text-black sm:text-2xl"
            >
              <Code2 className="h-6 w-6 text-black stroke-[2.5]" />
              <span>SQL & Performance Analyzer</span>
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-700">
              Raw recursive CTE queries, EXPLAIN ANALYZE execution trees, pg_locks concurrency, and PostgreSQL RBAC catalogs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {audit?.identity.data ? (
              <span className="hidden rounded-lg bg-[#4EFA8B] px-3 py-1 font-mono text-xs font-black text-black border-2 border-black shadow-[2px_2px_0px_0px_#000] sm:inline">
                SESSION: {audit.identity.data.current_user}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl border-2 border-black bg-white p-2 text-black shadow-[2px_2px_0px_0px_#000] cursor-pointer transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
            >
              <X className="h-5 w-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex gap-2 overflow-x-auto border-b-2 border-black px-4 py-3 bg-[#FAF8F5]">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black cursor-pointer transition-all duration-120 border-2 border-black ${
                  active
                    ? 'bg-[#FFE600] text-black shadow-[3px_3px_0px_0px_#000] -translate-y-0.5'
                    : 'bg-white text-black hover:bg-slate-100 shadow-[1px_1px_0px_0px_#000]'
                }`}
              >
                <Icon className="h-4 w-4 stroke-[2.5]" />
                <span className="uppercase tracking-wide">{entry.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#FFFDF8]">
          {role !== 'admin' ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border-2 border-black bg-[#FFE600] p-3.5 text-xs font-bold text-black shadow-[3px_3px_0px_0px_#000]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-black stroke-[2.5]" />
              <span>
                Auditor persona required for live database inspects. The raw SQL queries below are available, but pg_catalog reads and EXPLAIN ANALYZE require switching persona to <strong>Auditor</strong>.
              </span>
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm font-black text-black">
              <Loader2 className="h-8 w-8 animate-spin text-black stroke-[2.5]" />
              <span>Executing EXPLAIN (ANALYZE, BUFFERS) query…</span>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border-2 border-black bg-[#FF5757] p-3.5 text-xs font-black text-white shadow-[3px_3px_0px_0px_#000]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 stroke-[2.5]" />
              <span className="break-words">{error}</span>
            </div>
          ) : null}

          {/* TAB 1: Plan */}
          {tab === 'plan' ? (
            <div className="space-y-4">
              {planSummary ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3 text-center shadow-[2px_2px_0px_0px_#000]">
                    <p className="truncate text-xs font-black text-black font-mono">
                      {planSummary.nodeType}
                    </p>
                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-wider mt-1">Node Type</p>
                  </div>
                  <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3 text-center shadow-[2px_2px_0px_0px_#000]">
                    <p className="text-xs font-black text-black font-mono">
                      {planSummary.actualRows}
                    </p>
                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-wider mt-1">Actual Rows</p>
                  </div>
                  <div className="rounded-xl border-2 border-black bg-[#00F0FF] p-3 text-center shadow-[2px_2px_0px_0px_#000]">
                    <p className="text-xs font-black text-black font-mono">
                      {planSummary.actualTime}
                    </p>
                    <p className="text-[10px] text-black font-black uppercase tracking-wider mt-1">Node Time</p>
                  </div>
                  <div className="rounded-xl border-2 border-black bg-[#4EFA8B] p-3 text-center shadow-[2px_2px_0px_0px_#000]">
                    <p className="text-xs font-black text-black font-mono">
                      {planSummary.executionTime}
                    </p>
                    <p className="text-[10px] text-black font-black uppercase tracking-wider mt-1">Execution</p>
                  </div>
                  <div className="rounded-xl border-2 border-black bg-[#FFE600] p-3 text-center shadow-[2px_2px_0px_0px_#000]">
                    <p className="text-xs font-black text-black font-mono">
                      {planSummary.planningTime}
                    </p>
                    <p className="text-[10px] text-black font-black uppercase tracking-wider mt-1">Planning</p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3.5 shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] font-mono font-black uppercase tracking-[0.18em] text-black">
                    Query Signature
                  </p>
                  <CopyButton text={audit?.explain.query ?? 'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)'} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs font-bold text-black bg-white p-3 rounded-lg border-2 border-black">
                  {audit?.explain.query ?? 'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)'}
                </pre>
                <p className="mt-2 text-[10px] text-slate-700 font-mono font-bold">
                  Parameters: tripId = {tripId} · stationId = {stationId} · delayMin = {delayMin}m
                </p>
              </div>

              <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3.5 shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] font-mono font-black uppercase tracking-[0.18em] text-black">
                    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
                  </p>
                  {audit?.explain.plan ? <CopyButton text={formatJson(audit.explain.plan)} /> : null}
                </div>
                <pre className="max-h-[46vh] overflow-auto whitespace-pre font-mono text-[11px] font-bold leading-relaxed text-black bg-white p-3 rounded-lg border-2 border-black">
                  {audit?.explain.plan
                    ? formatJson(audit.explain.plan)
                    : 'Plan is unavailable for this persona. Switch to Auditor persona.'}
                </pre>
              </div>
            </div>
          ) : null}

          {/* TAB 2: Locks */}
          {tab === 'locks' ? (
            <div className="overflow-x-auto rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF8F5] text-[10px] uppercase tracking-[0.15em] text-black border-b-2 border-black">
                  <tr>
                    <th className="px-4 py-3 font-black">Lock Type</th>
                    <th className="px-4 py-3 font-black">Lock Mode</th>
                    <th className="px-4 py-3 font-black">Status</th>
                    <th className="px-4 py-3 font-black">Active Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black">
                  {(audit?.locks.data ?? []).map((lock) => (
                    <tr key={`${lock.locktype}-${lock.mode}-${lock.granted}`} className="hover:bg-amber-50/50">
                      <td className="px-4 py-2.5 font-mono font-bold text-black">
                        {lock.locktype}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-black">
                        {lock.mode}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-black uppercase border border-black shadow-[1px_1px_0px_0px_#000] ${
                            lock.granted
                              ? 'bg-[#4EFA8B] text-black'
                              : 'bg-[#FF5757] text-white'
                          }`}
                        >
                          {lock.granted ? 'GRANTED' : 'WAITING'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono font-black text-black">
                        {lock.lock_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audit?.locks.error ? (
                <p className="p-4 text-xs font-bold text-[#FF5757]">{audit.locks.error}</p>
              ) : null}
              {!loading && (audit?.locks.data?.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-xs font-bold text-slate-700">
                  No locks currently held or catalog blocked under this persona.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* TAB 3: Roles */}
          {tab === 'roles' ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF8F5] text-[10px] uppercase tracking-[0.15em] text-black border-b-2 border-black">
                    <tr>
                      <th className="px-4 py-3 font-black">Database Role</th>
                      <th className="px-4 py-3 font-black">Superuser</th>
                      <th className="px-4 py-3 font-black">Can Login</th>
                      <th className="px-4 py-3 font-black">Inherit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-black">
                    {(audit?.roles.data ?? []).map((roleRow) => (
                      <tr key={roleRow.rolname} className="hover:bg-amber-50/50">
                        <td className="px-4 py-2.5 font-mono font-black text-black">
                          {roleRow.rolname}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-700">
                          {roleRow.rolsuper ? 'yes' : 'no'}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-700">
                          {roleRow.rolcanlogin ? 'yes' : 'no'}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-700">
                          {roleRow.rolinherit ? 'yes' : 'no'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {audit?.roles.error ? (
                  <p className="p-4 text-xs font-bold text-[#FF5757]">{audit.roles.error}</p>
                ) : null}
              </div>

              <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3.5 shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-black font-mono font-black">
                    PostgreSQL Row-Level Security Policy
                  </p>
                  <CopyButton text={RLS_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10.5px] font-bold leading-relaxed text-black bg-white p-3 rounded-lg border-2 border-black">
                  {RLS_SQL}
                </pre>
              </div>
            </div>
          ) : null}

          {/* TAB 4: Raw SQL */}
          {tab === 'sql' ? (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3.5 shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-black font-mono font-black">
                    Recursive Cascade CTE (PostgreSQL)
                  </p>
                  <CopyButton text={CASCADE_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre font-mono text-[10.5px] font-bold leading-relaxed text-black bg-white p-3 rounded-lg border-2 border-black">
                  {CASCADE_SQL}
                </pre>
              </div>

              <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3.5 shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-black font-mono font-black">
                    Pessimistic Seat Rebooking (FOR UPDATE SKIP LOCKED)
                  </p>
                  <CopyButton text={REBOOK_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre font-mono text-[10.5px] font-bold leading-relaxed text-black bg-white p-3 rounded-lg border-2 border-black">
                  {REBOOK_SQL}
                </pre>
              </div>

              <div className="rounded-xl border-2 border-black bg-[#FAF8F5] p-3.5 shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-black font-mono font-black">
                    Row-Level Security Tenant Isolation Policy
                  </p>
                  <CopyButton text={RLS_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10.5px] font-bold leading-relaxed text-black bg-white p-3 rounded-lg border-2 border-black">
                  {RLS_SQL}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
