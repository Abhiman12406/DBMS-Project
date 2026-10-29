'use client';

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, MapPin, Radio, TrainFront } from 'lucide-react';

import type { NetworkSnapshot } from '@/lib/client';
import { gsap, useGSAP } from '@/lib/gsap';
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
    <g className="gsap-train-glyph" transform={`translate(${x} ${y})`} pointerEvents="none">
      {/* Hard offset shadow */}
      <rect x={-13} y={-7} width={30} height={18} rx={4} fill="#000000" />
      {/* Train Body */}
      <rect x={-15} y={-9} width={30} height={18} rx={4} fill={color} stroke="#000000" strokeWidth={2.5} />
      {/* Windshield */}
      <rect x={-10} y={-5} width={20} height={6} rx={2} fill="#FFFFFF" stroke="#000000" strokeWidth={1.5} />
      {/* Wheels */}
      <circle cx={-8} cy={10} r={2.5} fill="#000000" />
      <circle cx={8} cy={10} r={2.5} fill="#000000" />
      {/* Count Badge Stamp */}
      <g transform="translate(0, -15)">
        <rect x={-24} y={-8} width={48} height={14} rx={3} fill="#000000" />
        <text
          x={0}
          y={2}
          textAnchor="middle"
          fontSize={8.5}
          fontWeight={900}
          fill="#FFE600"
          fontFamily="monospace"
        >
          {count} TRIPS
        </text>
      </g>
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
      fontWeight={station.transfer_hub_flag ? 900 : 800}
      fill="#000000"
      paintOrder="stroke fill"
      stroke="#FFFFFF"
      strokeWidth={4}
      strokeLinejoin="round"
      className="pointer-events-none select-none tracking-tight font-sans"
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
  const graphRef = useRef<HTMLElement>(null);

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

  // GSAP: Ambient Train Hover and Station Radial Pop-in
  useGSAP(
    () => {
      // Train glyph subtle floating animation
      gsap.to('.gsap-train-glyph', {
        y: '-=2.5',
        duration: 1.8,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
        stagger: 0.25,
      });

      // Station nodes initial radial bounce
      if (snapshot?.stations.length) {
        gsap.from('.gsap-station-node', {
          scale: 0.65,
          opacity: 0,
          duration: 0.55,
          stagger: {
            each: 0.035,
            from: 'center',
          },
          ease: 'back.out(2)',
        });
      }

      // Quick focus buttons stagger
      gsap.from('.gsap-focus-chip', {
        scale: 0.88,
        opacity: 0,
        duration: 0.45,
        stagger: 0.04,
        ease: 'power2.out',
      });
    },
    { scope: graphRef, dependencies: [Boolean(snapshot)] },
  );

  // GSAP: Dynamic alert pulse when cascade occurs
  useGSAP(
    () => {
      if (cascade) {
        gsap.from('.gsap-affected-edge', {
          strokeDashoffset: 100,
          opacity: 0.3,
          duration: 0.75,
          ease: 'power2.out',
        });
        gsap.from('.gsap-affected-beacon', {
          scale: 0,
          opacity: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: 'elastic.out(1, 0.75)',
        });
      }
    },
    { scope: graphRef, dependencies: [cascade] },
  );

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
    <section
      ref={graphRef}
      className="brutal-card p-5 h-full flex flex-col justify-between bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]"
    >
      <div>
        {/* Card Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-2 py-0.5 rounded">
                Network Topology
              </span>
              <span className="rounded bg-[#FAF8F5] px-2 py-0.5 font-mono text-[9px] font-bold text-black border-2 border-black shadow-[1px_1px_0px_0px_#000]">
                METRO GRID
              </span>
            </div>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-black sm:text-xl">
              <Radio className="h-5 w-5 text-black stroke-[2.5] shrink-0" />
              <span>Live Transit Dependency Map</span>
            </h2>
          </div>

          {/* Map Legend */}
          <div className="flex items-center gap-3 text-[11px] font-black text-black bg-[#FAF8F5] border-2 border-black px-3 py-1.5 rounded-xl shadow-[2px_2px_0px_0px_#000]">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#4EFA8B] border border-black shadow-[1px_1px_0px_0px_#000]" />
              <span>Normal</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#FFE600] border border-black shadow-[1px_1px_0px_0px_#000]" />
              <span>Minor Delay</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#FF5757] border border-black shadow-[1px_1px_0px_0px_#000] animate-pulse" />
              <span>Severe / Cascade</span>
            </span>
          </div>
        </div>

        {/* Quick Station Focus Chips */}
        {snapshot ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-black mr-1 flex items-center gap-1">
              <MapPin className="h-3 w-3 stroke-[2.5]" /> Focus:
            </span>
            {quickStations.map((stn) => {
              const active = stn.id === selectedStationId;
              const isAffected = affectedStationIds.has(stn.id);

              return (
                <button
                  key={stn.id}
                  type="button"
                  onClick={() => handleSelectStation(stn.id)}
                  className={`gsap-focus-chip group flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs cursor-pointer transition-all duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
                    active
                      ? 'bg-[#FFE600] text-black font-black border-2 border-black shadow-[3px_3px_0px_0px_#000] -translate-y-0.5'
                      : isAffected
                        ? 'bg-[#FF5757] text-white font-black border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:bg-rose-600'
                        : 'bg-white text-black font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] hover:bg-slate-100 hover:-translate-y-0.5'
                  }`}
                >
                  <span>{stn.name}</span>
                  {isAffected ? (
                    <span className="h-2 w-2 rounded-full bg-white border border-black animate-ping" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Error Alert */}
        {error ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border-2 border-black bg-[#FF5757] p-3.5 text-sm font-black text-white shadow-[4px_4px_0px_0px_#000]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 stroke-[2.5]" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Loading Skeleton */}
        {!snapshot && loading ? (
          <div className="mt-4 h-[440px] animate-pulse rounded-2xl border-2 border-black bg-slate-100 shadow-[4px_4px_0px_0px_#000]" />
        ) : null}

        {/* Empty State */}
        {!snapshot && !loading && !error ? (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-black bg-[#FAF8F5] p-8 text-center text-sm font-bold text-black">
            Network data is currently not available.
          </div>
        ) : null}

        {/* Interactive SVG Network Map */}
        {snapshot ? (
          <div className="mt-4 overflow-hidden rounded-2xl border-[2.5px] border-black bg-[#FFFDF8] shadow-[4px_4px_0px_0px_#000000] relative">
            <svg
              viewBox="0 0 700 470"
              role="img"
              aria-label="Transit network map with live disruption status"
              className="h-auto w-full select-none"
            >
              <defs>
                <pattern
                  id="transit-grid-brutal"
                  width="35"
                  height="35"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 35 0 L 0 0 0 35"
                    fill="none"
                    stroke="#E5E0D8"
                    strokeWidth="1"
                  />
                  <circle cx="0" cy="0" r="1.5" fill="#D1CABE" />
                </pattern>
              </defs>

              <rect width="700" height="470" fill="url(#transit-grid-brutal)" />

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
                    {/* Underlying Track Shadow / Base Border */}
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="#000000"
                      strokeWidth={11}
                      strokeLinecap="round"
                    />
                    {/* Active Line Color Track */}
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={edge.color}
                      strokeWidth={impacted ? 8 : 7}
                      strokeLinecap="round"
                      opacity={impacted ? 1 : 0.9}
                    />
                    {/* Impacted Pulsing Dash */}
                    {impacted ? (
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="#FFE600"
                        strokeWidth={4}
                        strokeLinecap="round"
                        strokeDasharray="8 8"
                        className="gsap-affected-edge animate-pulse"
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

                const color = stationColors.get(station.station_id) ?? '#000000';
                const radius = station.transfer_hub_flag ? 12.5 : 9;
                const selected = station.station_id === selectedStationId;
                const impacted = affectedStationIds.has(station.station_id);

                return (
                  <g
                    key={station.station_id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect station ${station.name}`}
                    className="gsap-station-node cursor-pointer outline-none transition-transform duration-150"
                    onClick={() => handleSelectStation(station.station_id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectStation(station.station_id);
                      }
                    }}
                  >
                    <title>{`${station.name} (${station.code}) - Click to inspect departures`}</title>

                    {/* Disruption Cascade Ping */}
                    {impacted ? (
                      <circle
                        cx={position.x}
                        cy={position.y}
                        r={radius + 12}
                        fill="#FF5757"
                        opacity={0.35}
                        className="gsap-affected-beacon animate-ping"
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
                          stroke="#000000"
                          strokeWidth={2.5}
                          strokeDasharray="4 4"
                          className="animate-spin-slow"
                        />
                        <circle
                          cx={position.x}
                          cy={position.y}
                          r={radius + 13}
                          fill="#FFE600"
                          opacity={0.35}
                        />
                      </>
                    ) : null}

                    {/* Node Shadow Offset */}
                    <circle
                      cx={position.x + 2}
                      cy={position.y + 2}
                      r={radius}
                      fill="#000000"
                    />

                    {/* Outer Ring */}
                    <circle
                      cx={position.x}
                      cy={position.y}
                      r={radius}
                      fill={selected ? '#FFE600' : '#FFFFFF'}
                      stroke="#000000"
                      strokeWidth={selected ? 4 : 3}
                    />

                    {/* Inner Hub Core */}
                    {station.transfer_hub_flag ? (
                      <circle
                        cx={position.x}
                        cy={position.y}
                        r={radius - 4.5}
                        fill={color}
                        stroke="#000000"
                        strokeWidth={1.5}
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

      {/* Footer summary */}
      <div className="mt-4 pt-3 border-t-2 border-black flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-black">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <TrainFront className="h-3.5 w-3.5 text-black stroke-[2.5]" />
            <span>15 STATIONS · 4 CORRIDORS</span>
          </span>
          <span>·</span>
          <span className="text-slate-600">Click any station node or focus button</span>
        </div>
        <span className="font-mono font-black text-black bg-[#FFE600] px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_#000]">
          STATION ID #{selectedStationId}
        </span>
      </div>
    </section>
  );
}
