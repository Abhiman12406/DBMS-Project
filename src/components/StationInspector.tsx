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
    <section className="brutal-card p-5 flex flex-col justify-between h-full bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]">
      <div>
        {/* Header with Title and Status */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-2 py-0.5 rounded">
                Station Telemetry
              </span>
              <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[9px] font-black text-black border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                Live Board
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-base font-black text-black sm:text-xl">
              <MapPin className="h-5 w-5 text-black stroke-[2.5] shrink-0" />
              <span>{selectedStation?.name ?? 'Select Station'}</span>
              {selectedStation ? (
                <span className="rounded bg-[#00F0FF] px-2 py-0.5 font-mono text-[10px] font-black text-black border border-black shadow-[1px_1px_0px_0px_#000]">
                  {selectedStation.code}
                </span>
              ) : null}
            </h2>
          </div>

          {selectedStation ? (
            <span
              className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
                isImpacted
                  ? 'bg-[#FF5757] text-white animate-pulse'
                  : 'bg-[#4EFA8B] text-black'
              }`}
            >
              {isImpacted ? 'Cascade Impact' : 'Normal Service'}
            </span>
          ) : null}
        </div>

        {/* Station Metadata & Quick Selector */}
        {selectedStation ? (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-y-2 border-black py-2.5 text-xs font-bold text-black">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#FAF8F5] px-2 py-0.5 border-2 border-black font-mono text-[10px] font-black shadow-[1px_1px_0px_0px_#000]">
                Zone {selectedStation.zone}
              </span>
              <span className="rounded-md bg-[#FAF8F5] px-2 py-0.5 border-2 border-black text-[10px] font-black shadow-[1px_1px_0px_0px_#000]">
                {selectedStation.platform_count} Platforms
              </span>
              {selectedStation.transfer_hub_flag ? (
                <span className="rounded-md bg-[#C084FC] px-2 py-0.5 border-2 border-black text-[10px] font-black text-black shadow-[1px_1px_0px_0px_#000]">
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
                className="rounded-lg border-2 border-black bg-white px-2 py-1 text-xs font-black text-black outline-none transition shadow-[2px_2px_0px_0px_#000] cursor-pointer focus:shadow-[3px_3px_0px_0px_#000]"
              >
                {snapshot.stations.map((stn) => (
                  <option key={stn.station_id} value={stn.station_id} className="text-black font-bold">
                    {stn.name} ({stn.code})
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}

        {/* Timetable Departures */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 mb-2">
            <span>Next Departures</span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-black">
              <Clock className="h-3 w-3 stroke-[2.5]" /> sched vs est
            </span>
          </div>

          {loading && !snapshot ? (
            <div className="space-y-2 py-2">
              <div className="h-11 animate-pulse rounded-xl border-2 border-black bg-slate-100 shadow-[2px_2px_0px_0px_#000]" />
              <div className="h-11 animate-pulse rounded-xl border-2 border-black bg-slate-100 shadow-[2px_2px_0px_0px_#000]" />
              <div className="h-11 animate-pulse rounded-xl border-2 border-black bg-slate-100 shadow-[2px_2px_0px_0px_#000]" />
            </div>
          ) : departures.length > 0 ? (
            <div className="space-y-2">
              {departures.map((row) => (
                <div
                  key={row.stop_id}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#FAF8F5] p-2.5 shadow-[2px_2px_0px_0px_#000] transition-transform duration-120 hover:-translate-y-0.5 hover:bg-white hover:shadow-[3px_3px_0px_0px_#000]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-black shadow-[1px_1px_0px_0px_#000]"
                      style={{ backgroundColor: row.color_hex }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-black text-black truncate">
                        <span>{prettyLineCode(row.line_code)}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-black stroke-[2.5] shrink-0" />
                        <span className="text-slate-900 font-bold truncate">{row.destination_name}</span>
                      </div>
                      <p className="font-mono text-[10px] font-bold text-slate-600">
                        Train {row.train_number} · Stop #{row.stop_sequence}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <p className="font-mono text-xs font-black text-black">
                        {formatClock(row.estimated_departure)}
                      </p>
                      <p className="font-mono text-[9px] font-bold text-slate-500 line-through">
                        {formatClock(row.scheduled_departure)}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${delayClasses(
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
            <div className="rounded-xl border-2 border-dashed border-black bg-[#FAF8F5] p-6 text-center text-xs font-bold text-slate-700">
              <TrainFront className="mx-auto h-6 w-6 text-black stroke-[2] mb-1" />
              No upcoming scheduled stops at this station.
            </div>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="mt-4 pt-2.5 border-t-2 border-black flex items-center justify-between text-[11px] font-bold text-black">
        <span>Click any station node to inspect</span>
        <span className="font-mono font-black bg-[#FFE600] px-1.5 py-0.5 rounded border border-black">
          {departures.length} DEPARTURES
        </span>
      </div>
    </section>
  );
}
