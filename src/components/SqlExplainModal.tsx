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
      className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-slate-400 hover:bg-white/10 hover:text-slate-200 transition cursor-pointer"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
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
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tripId = cascade?.applied.trip_id ?? 1;
  const stationId = cascade?.cascadeStops[0]?.station_id ?? 3;
  const delayMin = cascade?.cascadeStops[0]?.propagated_delay_min ?? 45;

  useEffect(() => {
    if (!open) {
      return;
    }

    setTab('plan');

    if (role !== 'admin') {
      setAudit(null);
      setLoading(false);
      setError(
        'The auditor persona (SET LOCAL ROLE transit_admin) is required to read pg_roles, pg_locks, and EXPLAIN ANALYZE output.',
      );
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiRequest<AuditPayload>(
      `/api/audit?tripId=${tripId}&stationId=${stationId}&delayMin=${delayMin}`,
      { role, signal: controller.signal },
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
        className="absolute inset-0 cursor-default bg-slate-950/80 backdrop-blur-md transition-opacity"
      />

      {/* Bento Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sql-explain-title"
        className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl shadow-black/80 backdrop-blur-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
                Auditor Console
              </span>
              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[9px] text-sky-300 border border-sky-500/20">
                transit_admin
              </span>
            </div>
            <h2
              id="sql-explain-title"
              className="mt-1 flex items-center gap-2 text-lg font-bold text-white sm:text-xl"
            >
              <Code2 className="h-5 w-5 text-sky-400" />
              <span>SQL & Performance Analyzer</span>
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Raw recursive CTE queries, EXPLAIN ANALYZE execution trees, pg_locks concurrency, and PostgreSQL RBAC catalogs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {audit?.identity.data ? (
              <span className="hidden rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-xs font-semibold text-emerald-300 border border-emerald-500/20 sm:inline">
                session: {audit.identity.data.current_user}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 cursor-pointer transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 px-4 py-2.5 bg-white/[0.01]">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer transition-all duration-200 ${
                  active
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm shadow-sky-500/10'
                    : 'text-slate-400 border border-transparent hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{entry.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {role !== 'admin' ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Auditor persona required for live database inspects. The raw SQL queries below are available, but pg_catalog reads and EXPLAIN ANALYZE require switching persona to <strong>Auditor</strong>.
              </span>
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              <span>Executing EXPLAIN (ANALYZE, BUFFERS) query…</span>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="break-words">{error}</span>
            </div>
          ) : null}

          {/* TAB 1: Plan */}
          {tab === 'plan' ? (
            <div className="space-y-4">
              {planSummary ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="truncate text-xs font-bold text-white font-mono">
                      {planSummary.nodeType}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Node Type</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="text-xs font-bold text-white font-mono">
                      {planSummary.actualRows}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Actual Rows</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="text-xs font-bold text-sky-300 font-mono">
                      {planSummary.actualTime}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Node Time</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="text-xs font-bold text-emerald-300 font-mono">
                      {planSummary.executionTime}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Execution</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <p className="text-xs font-bold text-amber-300 font-mono">
                      {planSummary.planningTime}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Planning</p>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-white/10 bg-[#040711] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                    Query Signature
                  </p>
                  <CopyButton text={audit?.explain.query ?? 'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)'} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-sky-300">
                  {audit?.explain.query ?? 'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)'}
                </pre>
                <p className="mt-2 text-[10px] text-slate-500 font-mono">
                  Parameters: tripId = {tripId} · stationId = {stationId} · delayMin = {delayMin}m
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#040711] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
                  </p>
                  {audit?.explain.plan ? <CopyButton text={formatJson(audit.explain.plan)} /> : null}
                </div>
                <pre className="max-h-[46vh] overflow-auto whitespace-pre font-mono text-[10px] leading-relaxed text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
                  {audit?.explain.plan
                    ? formatJson(audit.explain.plan)
                    : 'Plan is unavailable for this persona. Switch to Auditor persona.'}
                </pre>
              </div>
            </div>
          ) : null}

          {/* TAB 2: Locks */}
          {tab === 'locks' ? (
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#040711]">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.15em] text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Lock Type</th>
                    <th className="px-4 py-3 font-semibold">Lock Mode</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Active Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(audit?.locks.data ?? []).map((lock) => (
                    <tr key={`${lock.locktype}-${lock.mode}-${lock.granted}`} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 font-mono text-slate-200">
                        {lock.locktype}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-300">
                        {lock.mode}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                            lock.granted
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                          }`}
                        >
                          {lock.granted ? 'granted' : 'waiting'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-400">
                        {lock.lock_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audit?.locks.error ? (
                <p className="p-4 text-xs text-rose-300">{audit.locks.error}</p>
              ) : null}
              {!loading && (audit?.locks.data?.length ?? 0) === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">
                  No locks currently held or catalog blocked under this persona.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* TAB 3: Roles */}
          {tab === 'roles' ? (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#040711]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.15em] text-slate-400 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Database Role</th>
                      <th className="px-4 py-3 font-semibold">Superuser</th>
                      <th className="px-4 py-3 font-semibold">Can Login</th>
                      <th className="px-4 py-3 font-semibold">Inherit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(audit?.roles.data ?? []).map((roleRow) => (
                      <tr key={roleRow.rolname} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 font-mono font-bold text-sky-300">
                          {roleRow.rolname}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {roleRow.rolsuper ? 'yes' : 'no'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {roleRow.rolcanlogin ? 'yes' : 'no'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {roleRow.rolinherit ? 'yes' : 'no'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {audit?.roles.error ? (
                  <p className="p-4 text-xs text-rose-300">{audit.roles.error}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-[#040711] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-mono">
                    PostgreSQL Row-Level Security Policy
                  </p>
                  <CopyButton text={RLS_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
                  {RLS_SQL}
                </pre>
              </div>
            </div>
          ) : null}

          {/* TAB 4: Raw SQL */}
          {tab === 'sql' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-[#040711] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-sky-400 font-mono">
                    Recursive Cascade CTE (PostgreSQL)
                  </p>
                  <CopyButton text={CASCADE_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre font-mono text-[10px] leading-relaxed text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
                  {CASCADE_SQL}
                </pre>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#040711] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-400 font-mono">
                    Pessimistic Seat Rebooking (FOR UPDATE SKIP LOCKED)
                  </p>
                  <CopyButton text={REBOOK_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre font-mono text-[10px] leading-relaxed text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
                  {REBOOK_SQL}
                </pre>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#040711] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-amber-400 font-mono">
                    Row-Level Security Tenant Isolation Policy
                  </p>
                  <CopyButton text={RLS_SQL} />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-300 bg-black/40 p-3 rounded-lg border border-white/5">
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
