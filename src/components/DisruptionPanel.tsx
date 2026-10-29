'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Code2,
  Database,
  Loader2,
  Play,
  ShieldAlert,
  Zap,
} from 'lucide-react';

import { ApiRequestError, apiRequest } from '@/lib/client';
import type { CascadeResult, PersonaRole } from '@/lib/types';

interface DisruptionPanelProps {
  role: PersonaRole;
  canOperate: boolean;
  cascade: CascadeResult | null;
  onCascade: (result: CascadeResult) => void;
}

interface DisruptionPreset {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  severity: string;
  accent: string;
  badgeClass: string;
  payload: Record<string, unknown>;
}

const PRESETS: DisruptionPreset[] = [
  {
    id: 'catenary-central',
    label: 'Catenary Failure @ Central Hub',
    shortLabel: 'Catenary Trip',
    description: 'SCADA reports total feeder trip on Red Line at Central Station.',
    severity: 'CRITICAL',
    accent: 'text-rose-300',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    payload: {
      incident_type: 'CATENARY_POWER_FAILURE',
      severity: 'CRITICAL',
      source: 'SCADA_GRID_SENSOR_04',
      affected_scope: {
        primary_line_code: 'RED_LINE',
        stations_affected: ['STN_CENTRAL', 'STN_FINANCE'],
        track_segment_ids: [3, 4],
      },
      raw_telemetry: {
        feeder_voltage_kv: 0,
        breaker_trip: 'CB-19',
        smoke_detected: true,
      },
      tripId: 1,
      stationId: 3,
      delayMin: 45,
      reason: 'CATENARY_FAILURE_CASCADE',
    },
  },
  {
    id: 'signal-west-junction',
    label: 'Signal Glitch @ West Junction',
    shortLabel: 'Signal Fault',
    description: 'Interlocking monitor loses signal aspect on Blue Line.',
    severity: 'SEVERE',
    accent: 'text-amber-300',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    payload: {
      incident_type: 'SIGNAL_SYSTEM_FAULT',
      severity: 'SEVERE',
      source: 'INTERLOCKING_MONITOR',
      affected_scope: {
        primary_line_code: 'BLUE_LINE',
        stations_affected: ['STN_WEST', 'STN_RIVER'],
      },
      raw_telemetry: {
        signal_aspect: 'DARK',
        block_id: 'B-207',
        retry_count: 4,
      },
      tripId: 7,
      stationId: 7,
      delayMin: 20,
      reason: 'SIGNAL_INTERLOCKING_FAULT',
    },
  },
  {
    id: 'track-maintenance',
    label: 'Track Maintenance Delay',
    shortLabel: 'Possession Overrun',
    description: 'Engineering works overrun on Green Line Tech Park corridor.',
    severity: 'MODERATE',
    accent: 'text-emerald-300',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    payload: {
      incident_type: 'TRACK_OBSTRUCTION',
      severity: 'MODERATE',
      source: 'MAINTENANCE_DISPATCH',
      affected_scope: {
        primary_line_code: 'GREEN_LINE',
        stations_affected: ['STN_TECH'],
      },
      raw_telemetry: {
        obstruction_type: 'ENGINEERING_WORKS',
        possession_id: 'POS-G12',
        crew_on_track: true,
      },
      tripId: 13,
      stationId: 11,
      delayMin: 15,
      reason: 'PLANNED_MAINTENANCE_OVERRUN',
    },
  },
];

export function DisruptionPanel({
  role,
  canOperate,
  cascade,
  onCascade,
}: DisruptionPanelProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESETS[0].id);
  const [jsonText, setJsonText] = useState<string>(
    JSON.stringify(PRESETS[0].payload, null, 2),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePreset = useMemo(
    () => PRESETS.find((preset) => preset.id === selectedPresetId) ?? null,
    [selectedPresetId],
  );

  function selectPreset(preset: DisruptionPreset) {
    setSelectedPresetId(preset.id);
    setJsonText(JSON.stringify(preset.payload, null, 2));
    setError(null);
  }

  async function handleSubmit() {
    if (!canOperate) {
      return;
    }

    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (parseError) {
      setError(
        `Payload must be valid JSON: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await apiRequest<CascadeResult>('/api/disruptions', {
        method: 'POST',
        role,
        body: payload,
      });
      onCascade(result);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? `${requestError.status}: ${requestError.message}`
          : requestError instanceof Error
            ? requestError.message
            : String(requestError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bento-card p-5 h-full flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-rose-400">
                Disruption Injector
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 border border-white/5">
                SCADA Sensor
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-white sm:text-lg">
              <Zap className="h-4 w-4 text-rose-400 shrink-0" />
              <span>Incident Studio</span>
            </h2>
          </div>

          <span className="font-mono text-[10px] text-slate-500 bg-white/[0.03] px-2 py-0.5 rounded border border-white/5">
            POST /api/disruptions
          </span>
        </div>

        {/* Read-Only Warning if Passenger */}
        {!canOperate ? (
          <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Passenger persona is read-only. Switch to <strong>Dispatcher</strong> or <strong>Auditor</strong> to inject live incidents.
            </span>
          </div>
        ) : null}

        {/* Incident Presets Chips */}
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">
            Select Incident Scenario
          </p>
          <div className="space-y-2">
            {PRESETS.map((preset) => {
              const active = preset.id === selectedPresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!canOperate || submitting}
                  onClick={() => selectPreset(preset)}
                  className={`w-full rounded-xl border p-2.5 text-left cursor-pointer transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? 'border-sky-500/60 bg-sky-500/10 shadow-sm shadow-sky-500/10 ring-1 ring-sky-500/30'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-2 text-xs font-semibold ${preset.accent}`}>
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      <span>{preset.label}</span>
                    </span>
                    <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold border ${preset.badgeClass}`}>
                      {preset.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 leading-snug line-clamp-1">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* JSON Payload Editor */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="incident-payload"
              className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 flex items-center gap-1.5"
            >
              <Code2 className="h-3 w-3" />
              <span>Polymorphic Mongo Document</span>
            </label>
            <span className="font-mono text-[9px] text-slate-500">
              {activePreset ? activePreset.shortLabel : 'Custom Payload'}
            </span>
          </div>

          <textarea
            id="incident-payload"
            value={jsonText}
            onChange={(event) => {
              setJsonText(event.target.value);
              setSelectedPresetId('custom');
              setError(null);
            }}
            disabled={!canOperate || submitting}
            spellCheck={false}
            rows={7}
            className="w-full resize-y rounded-xl border border-white/10 bg-[#040711] p-3 font-mono text-[10.5px] leading-relaxed text-slate-200 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-60 shadow-inner"
          />
        </div>

        {/* Error Feedback */}
        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span className="break-words">{error}</span>
          </div>
        ) : null}
      </div>

      {/* Action CTA Button */}
      <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canOperate || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-500/20 cursor-pointer transition-all duration-200 hover:from-rose-400 hover:to-rose-500 hover:shadow-rose-500/30 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Propagating Cascade via Recursive CTE…</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              <span>Inject Disruption & Run Cascade</span>
            </>
          )}
        </button>

        <p className="text-center font-mono text-[9px] text-slate-500 flex items-center justify-center gap-1.5">
          <Database className="h-3 w-3 text-slate-500" />
          <span>MongoDB Polymorphic Write ➔ PostgreSQL CTE</span>
        </p>
      </div>
    </section>
  );
}
