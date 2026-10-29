'use client';

import { useCallback, useEffect, useState } from 'react';

import { BentoHeader } from '@/components/BentoHeader';
import { CascadeTelemetry } from '@/components/CascadeTelemetry';
import { ConcurrencyArena } from '@/components/ConcurrencyArena';
import { DisruptionPanel } from '@/components/DisruptionPanel';
import { LineHealthMatrix } from '@/components/LineHealthMatrix';
import { PassengerJourneyPass } from '@/components/PassengerJourneyPass';
import { type PersonaKey } from '@/components/PersonaSwitcher';
import { SqlExplainModal } from '@/components/SqlExplainModal';
import { StationInspector } from '@/components/StationInspector';
import { TransitGraph } from '@/components/TransitGraph';
import { apiRequest, type NetworkSnapshot } from '@/lib/client';
import type { CascadeResult, HealthReport, PersonaRole } from '@/lib/types';

const PERSONA_ROLE: Record<PersonaKey, PersonaRole> = {
  dispatcher: 'dispatcher',
  passenger: 'passenger',
  auditor: 'admin',
};

const PERSONA_DB_ROLE: Record<PersonaKey, string> = {
  dispatcher: 'dispatcher_role',
  passenger: 'passenger_role',
  auditor: 'transit_admin',
};

const DEMO_PASSENGER_ID = 3;

export default function HomePage() {
  const [personaKey, setPersonaKey] = useState<PersonaKey>('dispatcher');
  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
  const [networkLoading, setNetworkLoading] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [cascade, setCascade] = useState<CascadeResult | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [auditOpen, setAuditOpen] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<number>(3);

  const personaRole = PERSONA_ROLE[personaKey];
  const canOperate = personaRole !== 'passenger';

  const refresh = useCallback(() => {
    setRefreshTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setNetworkLoading(true);
    setNetworkError(null);

    apiRequest<NetworkSnapshot>('/api/network', {
      role: personaRole,
      passengerId:
        personaRole === 'passenger' ? DEMO_PASSENGER_ID : undefined,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setSnapshot(payload);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setNetworkError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setNetworkLoading(false);
        }
      });

    return () => controller.abort();
  }, [personaRole, refreshTick]);

  useEffect(() => {
    const controller = new AbortController();

    apiRequest<HealthReport>('/api/health', {
      role: 'admin',
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setHealth(payload);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHealth(null);
        }
      });

    return () => controller.abort();
  }, [refreshTick]);

  const handleCascade = useCallback((result: CascadeResult) => {
    setCascade(result);
    setRefreshTick((tick) => tick + 1);
  }, []);

  const handlePersonaChange = useCallback((next: PersonaKey) => {
    setSnapshot(null);
    setNetworkError(null);
    setPersonaKey(next);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-5">
      {/* Bento Header / Control Bar */}
      <BentoHeader
        personaKey={personaKey}
        personaRole={personaRole}
        dbRole={PERSONA_DB_ROLE[personaKey]}
        health={health}
        networkLoading={networkLoading}
        onPersonaChange={handlePersonaChange}
        onRefresh={refresh}
        onOpenAudit={() => setAuditOpen(true)}
      />

      {/* Passenger Persona Portal: RLS Boarding Pass Bento Card */}
      {personaRole === 'passenger' ? (
        <PassengerJourneyPass
          snapshot={snapshot}
          loading={networkLoading}
          passengerId={DEMO_PASSENGER_ID}
        />
      ) : null}

      {/* Primary Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
        {/* ROW 1 - BENTO HERO TILE: Live Transit Dependency Map (8 cols) */}
        <div className="col-span-12 xl:col-span-8">
          <TransitGraph
            snapshot={snapshot}
            loading={networkLoading}
            error={networkError}
            cascade={cascade}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStationId}
          />
        </div>

        {/* ROW 1 - BENTO TILE: Incident Studio & Disruption Injector (4 cols) */}
        <div className="col-span-12 xl:col-span-4">
          <DisruptionPanel
            role={personaRole}
            canOperate={canOperate}
            cascade={cascade}
            onCascade={handleCascade}
          />
        </div>

        {/* ROW 2 - BENTO TILE: Station Departures Timetable (4 cols) */}
        <div className="col-span-12 md:col-span-6 xl:col-span-4">
          <StationInspector
            snapshot={snapshot}
            loading={networkLoading}
            selectedStationId={selectedStationId}
            cascade={cascade}
            onSelectStation={setSelectedStationId}
          />
        </div>

        {/* ROW 2 - BENTO TILE: Fleet & Line Health Matrix (4 cols) */}
        <div className="col-span-12 md:col-span-6 xl:col-span-4">
          <LineHealthMatrix
            snapshot={snapshot}
            cascade={cascade}
            loading={networkLoading}
          />
        </div>

        {/* ROW 2 - BENTO TILE: Recursive Cascade Propagation Engine (4 cols) */}
        <div className="col-span-12 md:col-span-12 xl:col-span-4">
          <CascadeTelemetry
            cascade={cascade}
          />
        </div>

        {/* ROW 3 - BENTO FULL SECTION: ACID Concurrency Arena & Lock Matrix (12 cols) */}
        <div className="col-span-12">
          <ConcurrencyArena
            role={personaRole}
            canOperate={canOperate}
            snapshot={snapshot}
            onComplete={refresh}
          />
        </div>
      </div>

      {/* Bento Footer: System & Architectural Specs */}
      <footer className="bento-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-200">
            PostgreSQL 16 Engine
          </span>
          <span className="text-slate-600">·</span>
          <span>Recursive CTE Graph Traversal</span>
          <span className="text-slate-600">·</span>
          <span>Row-Level Security (RLS)</span>
          <span className="text-slate-600">·</span>
          <span>FOR UPDATE SKIP LOCKED</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-200">
            MongoDB 7 Event Store
          </span>
          <span className="text-slate-600">·</span>
          <span>Polymorphic SCADA Ingestion</span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-emerald-400">Bento UI v2.0</span>
        </div>
      </footer>

      {/* SQL & Explain Modal Drawer */}
      <SqlExplainModal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        role={personaRole}
        cascade={cascade}
      />
    </main>
  );
}
