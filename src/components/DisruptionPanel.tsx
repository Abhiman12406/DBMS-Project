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
  severityBg: string;
  payload: Record<string, unknown>;
}

const PRESETS: DisruptionPreset[] = [
  {
    id: 'catenary-central',
    label: 'Catenary Failure @ Central Hub',
    shortLabel: 'Catenary Trip',
    description: 'SCADA reports total feeder trip on Red Line at Central Station.',
    severity: 'CRITICAL',
    severityBg: 'bg-[#FF5757] text-white',
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
    severityBg: 'bg-[#FF8800] text-black',
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
    severityBg: 'bg-[#4EFA8B] text-black',
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
    <section className="brutal-card p-5 h-full flex flex-col justify-between bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-[#FF5757] text-white px-2 py-0.5 border border-black rounded shadow-[1px_1px_0px_0px_#000]">
                Disruption Injector
              </span>
              <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[9px] font-black text-black border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                SCADA Sensor
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-black text-black sm:text-xl">
              <Zap className="h-5 w-5 text-black stroke-[2.5] shrink-0" />
              <span>Incident Studio</span>
            </h2>
          </div>

          <span className="font-mono text-[10px] font-black text-black bg-[#FFE600] px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_#000]">
            POST /api/disruptions
          </span>
        </div>

        {/* Read-Only Warning if Passenger */}
        {!canOperate ? (
          <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border-2 border-black bg-[#FFE600] p-3 text-xs font-bold text-black shadow-[3px_3px_0px_0px_#000]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-black stroke-[2.5]" />
            <span>
              Passenger persona is read-only. Switch to <strong>Dispatcher</strong> or <strong>Auditor</strong> to inject live incidents.
            </span>
          </div>
        ) : null}

        {/* Incident Presets Chips */}
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 mb-2">
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
                  className={`w-full rounded-xl border-2 border-black p-2.5 text-left cursor-pointer transition-all duration-120 disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? 'bg-[#FFE600] shadow-[4px_4px_0px_0px_#000] -translate-y-0.5'
                      : 'bg-[#FAF8F5] shadow-[2px_2px_0px_0px_#000] hover:bg-slate-100 hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-black text-black">
                      <Zap className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
                      <span>{preset.label}</span>
                    </span>
                    <span className={`rounded px-1.5 py-0.2 text-[9px] font-black uppercase border border-black shadow-[1px_1px_0px_0px_#000] ${preset.severityBg}`}>
                      {preset.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-800 leading-snug line-clamp-1">
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
              className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 flex items-center gap-1.5"
            >
              <Code2 className="h-3 w-3 stroke-[2.5]" />
              <span>Polymorphic Mongo Document</span>
            </label>
            <span className="font-mono text-[9px] font-black text-black bg-slate-200 px-1.5 py-0.5 rounded border border-black">
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
            className="w-full resize-y rounded-xl border-2 border-black bg-[#FAF8F5] p-3 font-mono text-[11px] font-bold leading-relaxed text-black outline-none transition focus:bg-white focus:shadow-[4px_4px_0px_0px_#000] disabled:cursor-not-allowed disabled:opacity-60 shadow-[3px_3px_0px_0px_#000]"
          />
        </div>

        {/* Error Feedback */}
        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border-2 border-black bg-[#FF5757] p-3 text-xs font-black text-white shadow-[3px_3px_0px_0px_#000]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 stroke-[2.5]" />
            <span className="break-words">{error}</span>
          </div>
        ) : null}
      </div>

      {/* Action CTA Button */}
      <div className="mt-4 pt-3 border-t-2 border-black space-y-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canOperate || submitting}
          className="brutal-btn w-full bg-[#FF5757] text-white py-3 px-4 shadow-[4px_4px_0px_0px_#000] hover:shadow-[6px_6px_0px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0px_0px_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin stroke-[2.5]" />
              <span className="font-black">Propagating Cascade via Recursive CTE…</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current stroke-[2]" />
              <span className="font-black tracking-wide">Inject Disruption & Run Cascade</span>
            </>
          )}
        </button>

        <p className="text-center font-mono text-[10px] font-black text-slate-700 flex items-center justify-center gap-1.5">
          <Database className="h-3 w-3 text-black stroke-[2.5]" />
          <span>MongoDB Polymorphic Write ➔ PostgreSQL CTE</span>
        </p>
      </div>
    </section>
  );
}
