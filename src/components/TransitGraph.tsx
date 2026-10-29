'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, MapPin, Radio, TrainFront } from 'lucide-react';

import type { NetworkSnapshot } from '@/lib/client';
import type {
  CascadeResult,
  StationScheduleRow,
  TransitStation,
} from '@/lib/types';

export interface TransitGraphProps {
  snapshot: NetworkSnapshot | null;
  loading: boolean;
  error: string | null;
  cascade: CascadeResult | null;
  selectedStationId?: number;
  onSelectStation?: (stationId: number) => void;
}

interface StationPosition {
  x: number;
  y: number;
  labelDx: number;
  labelDy: number;
  anchor: 'start' | 'middle' | 'end';
}

interface GraphEdge {
  key: string;
  from: number;
  to: number;
  color: string;
  lineCode: string;
}

const STATION_POSITIONS: Record<number, StationPosition> = {
  1: { x: 340, y: 40, labelDx: 16, labelDy: 4, anchor: 'start' },
  2: { x: 340, y: 110, labelDx: 16, labelDy: 4, anchor: 'start' },
  3: { x: 340, y: 220, labelDx: 18, labelDy: 4, anchor: 'start' },
  4: { x: 340, y: 320, labelDx: 16, labelDy: 4, anchor: 'start' },
  5: { x: 340, y: 420, labelDx: 16, labelDy: 4, anchor: 'start' },
  6: { x: 60, y: 220, labelDx: 14, labelDy: 4, anchor: 'start' },
  7: { x: 190, y: 220, labelDx: 0, labelDy: 26, anchor: 'middle' },
  8: { x: 490, y: 220, labelDx: 0, labelDy: 26, anchor: 'middle' },
  9: { x: 620, y: 220, labelDx: -14, labelDy: 4, anchor: 'end' },
  10: { x: 110, y: 60, labelDx: 14, labelDy: 4, anchor: 'start' },
  11: { x: 230, y: 130, labelDx: -14, labelDy: -6, anchor: 'end' },
  12: { x: 440, y: 300, labelDx: 14, labelDy: 4, anchor: 'start' },
  13: { x: 560, y: 380, labelDx: -14, labelDy: 4, anchor: 'end' },
  14: { x: 480, y: 150, labelDx: 14, labelDy: 4, anchor: 'start' },
  15: { x: 620, y: 70, labelDx: -14, labelDy: 4, anchor: 'end' },
};

const TRAIN_ANCHORS: Record<string, { x: number; y: number }> = {
  RED_LINE: { x: 378, y: 166 },
  BLUE_LINE: { x: 110, y: 198 },
  GREEN_LINE: { x: 168, y: 96 },
  AIRPORT_EXPRESS: { x: 536, y: 112 },
};

function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

function buildEdges(schedule: StationScheduleRow[]): GraphEdge[] {
  const byTrip = new Map<number, StationScheduleRow[]>();

  for (const row of schedule) {
    const rows = byTrip.get(row.trip_id) ?? [];
    rows.push(row);
    byTrip.set(row.trip_id, rows);
  }

  const edges = new Map<string, GraphEdge>();

  for (const rows of byTrip.values()) {
    const ordered = [...rows].sort((a, b) => a.stop_sequence - b.stop_sequence);

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];
      const key = edgeKey(current.station_id, next.station_id);

      if (!edges.has(key)) {
        edges.set(key, {
          key,
          from: current.station_id,
          to: next.station_id,
          color: current.color_hex,
          lineCode: current.line_code,
        });
      }
    }
  }

  return [...edges.values()];
}

function buildAffectedEdges(cascade: CascadeResult | null): Set<string> {
  const affected = new Set<string>();

  if (!cascade) {
    return affected;
  }

  const byTrip = new Map<number, typeof cascade.cascadeStops>();

  for (const row of cascade.cascadeStops) {
    const rows = byTrip.get(row.trip_id) ?? [];
    rows.push(row);
    byTrip.set(row.trip_id, rows);
  }

  for (const rows of byTrip.values()) {
    const ordered = [...rows].sort((a, b) => a.stop_sequence - b.stop_sequence);

    for (let index = 0; index < ordered.length - 1; index += 1) {
      affected.add(edgeKey(ordered[index].station_id, ordered[index + 1].station_id));
    }
  }

  return affected;
}

function TrainGlyph({
  x,
  y,
  color,
  count,
}: {
  x: number;
  y: number;
  color: string;
  count: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect x={-14} y={-8} width={28} height={16} rx={5} fill={color} opacity={0.95} className="shadow-md" />
      <rect x={-9} y={-4} width={18} height={5} rx={1.5} fill="#050912" opacity={0.8} />
      <circle cx={-8} cy={9} r={2.5} fill="#e2e8f0" />
      <circle cx={8} cy={9} r={2.5} fill="#e2e8f0" />
      <text x={0} y={-13} textAnchor="middle" fontSize={9} fontWeight={600} fill={color} className="font-mono">
        {count} trips
      </text>
    </g>
  );
}

function StationLabel({
  station,
  position,
}: {
  station: TransitStation;
  position: StationPosition;
}) {
  return (
    <text
      x={position.x + position.labelDx}
      y={position.y + position.labelDy}
      textAnchor={position.anchor}
      fontSize={station.transfer_hub_flag ? 12 : 11}
      fontWeight={station.transfer_hub_flag ? 700 : 500}
      fill={station.transfer_hub_flag ? '#ffffff' : '#cbd5e1'}
      className="drop-shadow-sm pointer-events-none select-none"
    >
      {station.name}
    </text>
  );
}

export function TransitGraph({
  snapshot,
  loading,
  error,
  cascade,
  selectedStationId: externalSelectedStationId,
  onSelectStation,
}: TransitGraphProps) {
  const [internalSelectedStationId, setInternalSelectedStationId] = useState<number>(3);

  const selectedStationId = externalSelectedStationId !== undefined
    ? externalSelectedStationId
    : internalSelectedStationId;

  function handleSelectStation(id: number) {
    if (onSelectStation) {
      onSelectStation(id);
    } else {
      setInternalSelectedStationId(id);
    }
  }

  const edges = useMemo(
    () => (snapshot ? buildEdges(snapshot.stationSchedule) : []),
    [snapshot],
  );

  const affectedEdges = useMemo(() => buildAffectedEdges(cascade), [cascade]);

  const affectedTripIds = useMemo(() => {
    const ids = new Set<number>();
    if (!cascade) {
      return ids;
    }
    for (const stop of cascade.cascadeStops) {
      ids.add(stop.trip_id);
    }
    for (const trip of cascade.downstreamTrips) {
      ids.add(trip.trip_id);
    }
    return ids;
  }, [cascade]);

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

  const stationColors = useMemo(() => {
    const colors = new Map<number, string>();
    for (const edge of edges) {
      if (!colors.has(edge.from)) {
        colors.set(edge.from, edge.color);
      }
      if (!colors.has(edge.to)) {
        colors.set(edge.to, edge.color);
      }
    }
    return colors;
  }, [edges]);

  const lineHealthRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.lines.map((line) => {
      const trips = snapshot.trips.filter((trip) => trip.line_code === line.code);
      return {
        line,
        activeTrips: trips.length,
      };
    });
  }, [snapshot]);

  // Major hubs for quick focus chips
  const quickStations = useMemo(() => {
    if (!snapshot) return [];
    return [
      { id: 3, name: 'Central Hub', code: 'STN_CENTRAL' },
      { id: 7, name: 'West Junction', code: 'STN_WEST' },
      { id: 2, name: 'Finance Dist', code: 'STN_FINANCE' },
      { id: 6, name: 'Riverfront', code: 'STN_RIVER' },
      { id: 14, name: 'Airport T1', code: 'STN_AIRPORT_1' },
      { id: 11, name: 'Tech Park', code: 'STN_TECH' },
    ];
  }, [snapshot]);

  return (
    <section className="bento-card p-5 h-full flex flex-col justify-between">
      <div>
        {/* Bento Card Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
                Network Topology
              </span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400 border border-white/5">
                Metropolitan Grid
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
              <Radio className="h-5 w-5 text-sky-400 shrink-0" />
              <span>Live Transit Dependency Map</span>
            </h2>
          </div>

          {/* Map Legend */}
          <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400 bg-white/[0.02] border border-white/5 px-3 py-1.5 rounded-xl">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
              <span>Normal</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
              <span>Minor Delay</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50 animate-pulse" />
              <span>Severe / Blocked</span>
            </span>
          </div>
        </div>

        {/* Quick Station Focus Chips */}
        {snapshot ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 mr-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Quick Focus:
            </span>
            {quickStations.map((stn) => {
              const active = stn.id === selectedStationId;
              const isAffected = affectedStationIds.has(stn.id);

              return (
                <button
                  key={stn.id}
                  type="button"
                  onClick={() => handleSelectStation(stn.id)}
                  className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    active
                      ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20 ring-1 ring-sky-400'
                      : isAffected
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                        : 'bg-white/[0.04] text-slate-300 border border-white/5 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span>{stn.name}</span>
                  {isAffected ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Error Alert */}
        {error ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Loading Skeleton */}
        {!snapshot && loading ? (
          <div className="mt-4 h-[440px] animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" />
        ) : null}

        {/* Empty State */}
        {!snapshot && !loading && !error ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">
            Network data is currently not available.
          </div>
        ) : null}

        {/* Interactive SVG Network Map */}
        {snapshot ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#040711] shadow-inner relative">
            <svg
              viewBox="0 0 700 470"
              role="img"
              aria-label="Transit network map with live disruption status"
              className="h-auto w-full select-none"
            >
              <defs>
                <pattern
                  id="transit-grid-bento"
                  width="35"
                  height="35"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 35 0 L 0 0 0 35"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="0.8"
                    opacity="0.3"
                  />
                </pattern>
                {/* Glow Filter */}
                <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              <rect width="700" height="470" fill="url(#transit-grid-bento)" />

              {/* Transit Line Edges */}
              {edges.map((edge) => {
                const from = STATION_POSITIONS[edge.from];
                const to = STATION_POSITIONS[edge.to];

                if (!from || !to) {
                  return null;
                }

                const impacted = affectedEdges.has(edge.key);

                return (
                  <g key={edge.key}>
                    {/* Underlying Track */}
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="#0f172a"
                      strokeWidth={10}
                      strokeLinecap="round"
                    />
                    {/* Active Line Color */}
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={edge.color}
                      strokeWidth={impacted ? 8 : 6}
                      strokeLinecap="round"
                      opacity={impacted ? 0.95 : 0.75}
                    />
                    {/* Impacted Pulsing Dash */}
                    {impacted ? (
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="#f59e0b"
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        strokeDasharray="6 8"
                        className="animate-pulse"
                      />
                    ) : null}
                  </g>
                );
              })}

              {/* Train Fleet Position Glyphs */}
              {lineHealthRows.map((item) => {
                const anchor = TRAIN_ANCHORS[item.line.code];
                if (!anchor) {
                  return null;
                }
                return (
                  <TrainGlyph
                    key={item.line.code}
                    x={anchor.x}
                    y={anchor.y}
                    color={item.line.color_hex}
                    count={item.activeTrips}
                  />
                );
              })}

              {/* Station Nodes */}
              {snapshot.stations.map((station) => {
                const position = STATION_POSITIONS[station.station_id];
                if (!position) {
                  return null;
                }

                const color = stationColors.get(station.station_id) ?? '#94a3b8';
                const radius = station.transfer_hub_flag ? 12 : 8.5;
                const selected = station.station_id === selectedStationId;
                const impacted = affectedStationIds.has(station.station_id);

                return (
                  <g
                    key={station.station_id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect station ${station.name}`}
                    className="cursor-pointer outline-none transition-transform duration-200 focus-visible:opacity-90"
                    onClick={() => handleSelectStation(station.station_id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectStation(station.station_id);
                      }
                    }}
                  >
                    <title>{`${station.name} (${station.code}) - Click to inspect departures`}</title>

                    {/* Disruption Cascade Beacon */}
                    {impacted ? (
                      <circle
                        cx={position.x}
                        cy={position.y}
                        r={radius + 12}
                        fill="#f59e0b"
                        opacity={0.2}
                        className="animate-ping"
                      />
                    ) : null}

                    {/* Selected Station Halo */}
                    {selected ? (
                      <>
                        <circle
                          cx={position.x}
                          cy={position.y}
                          r={radius + 8}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          className="animate-spin-slow"
                        />
                        <circle
                          cx={position.x}
                          cy={position.y}
                          r={radius + 14}
                          fill="#38bdf8"
                          opacity={0.12}
                        />
                      </>
                    ) : null}

                    {/* Outer Ring */}
                    <circle
                      cx={position.x}
                      cy={position.y}
                      r={radius}
                      fill="#060913"
                      stroke={selected ? '#38bdf8' : color}
                      strokeWidth={selected ? 4.5 : 3.5}
                    />

                    {/* Inner Hub Core */}
                    {station.transfer_hub_flag ? (
                      <circle
                        cx={position.x}
                        cy={position.y}
                        r={radius - 5}
                        fill={color}
                        opacity={0.9}
                      />
                    ) : null}

                    <StationLabel station={station} position={position} />
                  </g>
                );
              })}
            </svg>
          </div>
        ) : null}
      </div>

      {/* Bento Footer summary */}
      <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <TrainFront className="h-3 w-3 text-sky-400" />
            <span>15 Stations · 4 Corridors</span>
          </span>
          <span>·</span>
          <span>Click any station node or quick-chip to inspect</span>
        </div>
        <span className="font-mono text-slate-400">Station ID #{selectedStationId} selected</span>
      </div>
    </section>
  );
}
