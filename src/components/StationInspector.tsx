'use client';

import { useMemo } from 'react';
import { ArrowRight, Clock, MapPin, TrainFront } from 'lucide-react';

import type { NetworkSnapshot } from '@/lib/client';
import { delayClasses, formatClock, formatDelay } from '@/lib/format';
import type { CascadeResult } from '@/lib/types';

interface StationInspectorProps {
  snapshot: NetworkSnapshot | null;
  loading: boolean;
  selectedStationId: number;
  cascade: CascadeResult | null;
  onSelectStation?: (stationId: number) => void;
}

function prettyLineCode(code: string): string {
  return code.replace(/_LINE$/, '').replace(/_/g, ' ');
}

export function StationInspector({
  snapshot,
  loading,
  selectedStationId,
  cascade,
  onSelectStation,
}: StationInspectorProps) {
  const selectedStation = useMemo(
    () => snapshot?.stations.find((stn) => stn.station_id === selectedStationId) ?? null,
    [snapshot, selectedStationId],
  );

  const affectedStationIds = useMemo(() => {
    const ids = new Set<number>();
    if (!cascade || !snapshot) {
      return ids;
    }
    for (const stop of cascade.cascadeStops) {
      ids.add(stop.station_id);
    }
    for (const code of cascade.incident.affected_scope?.stations_affected ?? []) {
      const station = snapshot.stations.find((entry) => entry.code === code);
      if (station) {
        ids.add(station.station_id);
      }
    }
    return ids;
  }, [cascade, snapshot]);

  const isImpacted = selectedStation
    ? affectedStationIds.has(selectedStation.station_id)
    : false;

  const departures = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.stationSchedule
      .filter((row) => row.station_id === selectedStationId)
      .sort(
        (a, b) =>
          new Date(a.scheduled_departure).getTime() -
          new Date(b.scheduled_departure).getTime(),
      )
      .slice(0, 6);
  }, [snapshot, selectedStationId]);

  return (
    <section className="bento-card p-5 flex flex-col justify-between h-full">
      <div>
        {/* Header with Title and Status */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
                Station Telemetry
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 border border-white/5">
                Live Timetable
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-white sm:text-lg">
              <MapPin className="h-4 w-4 text-sky-400 shrink-0" />
              <span>{selectedStation?.name ?? 'Select Station'}</span>
              {selectedStation ? (
                <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-sky-300 border border-sky-500/20">
                  {selectedStation.code}
                </span>
              ) : null}
            </h2>
          </div>

          {selectedStation ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold border ${
                isImpacted
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              }`}
            >
              {isImpacted ? 'Cascade Impact' : 'Normal Service'}
            </span>
          ) : null}
        </div>

        {/* Station Metadata & Quick Selector */}
        {selectedStation ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-white/5 py-2 text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-white/[0.04] px-2 py-0.5 border border-white/5 font-mono text-[10px] text-slate-300">
                Zone {selectedStation.zone}
              </span>
              <span className="rounded bg-white/[0.04] px-2 py-0.5 border border-white/5 text-[10px] text-slate-300">
                {selectedStation.platform_count} Platforms
              </span>
              {selectedStation.transfer_hub_flag ? (
                <span className="rounded bg-indigo-500/15 px-2 py-0.5 border border-indigo-500/30 text-[10px] font-semibold text-indigo-300">
                  Transfer Hub
                </span>
              ) : null}
            </div>

            {/* Quick Switch Dropdown */}
            {snapshot?.stations && onSelectStation ? (
              <select
                value={selectedStationId}
                onChange={(event) => onSelectStation(Number(event.target.value))}
                aria-label="Change inspected station"
                className="rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-[10px] font-medium text-slate-300 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer"
              >
                {snapshot.stations.map((stn) => (
                  <option key={stn.station_id} value={stn.station_id} className="bg-slate-900 text-slate-200">
                    {stn.name} ({stn.code})
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}

        {/* Timetable Departures */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-2">
            <span>Next Departures</span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-slate-400 lowercase">
              <Clock className="h-3 w-3" /> sched vs est
            </span>
          </div>

          {loading && !snapshot ? (
            <div className="space-y-2 py-2">
              <div className="h-10 animate-pulse rounded-lg bg-white/5" />
              <div className="h-10 animate-pulse rounded-lg bg-white/5" />
              <div className="h-10 animate-pulse rounded-lg bg-white/5" />
            </div>
          ) : departures.length > 0 ? (
            <div className="space-y-2">
              {departures.map((row) => (
                <div
                  key={row.stop_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
                      style={{ backgroundColor: row.color_hex }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 truncate">
                        <span>{prettyLineCode(row.line_code)}</span>
                        <ArrowRight className="h-3 w-3 text-slate-500 shrink-0" />
                        <span className="text-slate-300 font-medium truncate">{row.destination_name}</span>
                      </div>
                      <p className="font-mono text-[10px] text-slate-500">
                        Train {row.train_number} · Stop #{row.stop_sequence}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="font-mono text-xs font-semibold text-slate-200">
                        {formatClock(row.estimated_departure)}
                      </p>
                      <p className="font-mono text-[9px] text-slate-500 line-through">
                        {formatClock(row.scheduled_departure)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold border ${delayClasses(
                        row.delay_departure_min,
                      )}`}
                    >
                      {formatDelay(row.delay_departure_min)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
              <TrainFront className="mx-auto h-5 w-5 text-slate-600 mb-1" />
              No upcoming scheduled stops at this station.
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="mt-4 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
        <span>Click any station node on map to inspect</span>
        <span className="font-mono text-slate-400">{departures.length} departures loaded</span>
      </div>
    </section>
  );
}
