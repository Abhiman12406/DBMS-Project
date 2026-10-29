'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap';
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

  const mainRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const personaRole = PERSONA_ROLE[personaKey];
  const canOperate = personaRole !== 'passenger';

  useGSAP(
    () => {
      // 1. Scroll-driven Progress Bar linked to ScrollTrigger
      if (progressBarRef.current && mainRef.current) {
        gsap.to(progressBarRef.current, {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: mainRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.15,
          },
        });
      }

      // 2. Initial Page Entrance Timeline (Header + Row 1 Hero Tiles)
      const tl = gsap.timeline();

      tl.from('.gsap-header', {
        y: -35,
        opacity: 0,
        duration: 0.65,
        ease: 'back.out(1.5)',
        clearProps: 'transform',
      }).from(
        '.gsap-row-1-col',
        {
          y: 45,
          opacity: 0,
          duration: 0.7,
          stagger: 0.15,
          ease: 'power3.out',
          clearProps: 'transform',
        },
        '-=0.25',
      );

      // 3. ScrollTrigger Batch/Stagger for Row 2 (Inspector, Health Matrix, Telemetry)
      gsap.from('.gsap-row-2-card', {
        scrollTrigger: {
          trigger: '.gsap-row-2-container',
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        y: 50,
        opacity: 0,
        duration: 0.65,
        stagger: 0.12,
        ease: 'back.out(1.25)',
        clearProps: 'transform',
      });

      // 4. ScrollTrigger for Row 3 (ACID Concurrency Arena)
      gsap.from('.gsap-concurrency-section', {
        scrollTrigger: {
          trigger: '.gsap-concurrency-section',
          start: 'top 82%',
          toggleActions: 'play none none none',
        },
        y: 60,
        opacity: 0,
        duration: 0.75,
        ease: 'power3.out',
        clearProps: 'transform',
      });

      // 5. ScrollTrigger for Footer
      gsap.from('.gsap-footer', {
        scrollTrigger: {
          trigger: '.gsap-footer',
          start: 'top 95%',
          toggleActions: 'play none none none',
        },
        scale: 0.96,
        opacity: 0,
        duration: 0.5,
        ease: 'back.out(1.4)',
        clearProps: 'transform',
      });
    },
    { scope: mainRef },
  );

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
    <main
      ref={mainRef}
      className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-5"
    >
      {/* Pinned Neu-Brutalist ScrollTrigger Progress Indicator */}
      <div className="fixed top-0 left-0 right-0 h-1.5 z-50 bg-black pointer-events-none">
        <div
          ref={progressBarRef}
          className="h-full w-full bg-[#FFE600] origin-left scale-x-0 border-b border-black"
        />
      </div>

      {/* Bento Header / Control Bar */}
      <div className="gsap-header">
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
      </div>

      {/* Passenger Persona Portal: RLS Boarding Pass Bento Card */}
      {personaRole === 'passenger' ? (
        <div className="gsap-passenger-pass">
          <PassengerJourneyPass
            snapshot={snapshot}
            loading={networkLoading}
            passengerId={DEMO_PASSENGER_ID}
          />
        </div>
      ) : null}

      {/* Primary Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
        {/* ROW 1 - BENTO HERO TILE: Live Transit Dependency Map (8 cols) */}
        <div className="col-span-12 xl:col-span-8 gsap-row-1-col">
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
        <div className="col-span-12 xl:col-span-4 gsap-row-1-col">
          <DisruptionPanel
            role={personaRole}
            canOperate={canOperate}
            cascade={cascade}
            onCascade={handleCascade}
          />
        </div>

        {/* ROW 2 - BENTO SECTION (3 TILES) */}
        <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 gsap-row-2-container">
          {/* Station Departures Timetable (1 col) */}
          <div className="gsap-row-2-card">
            <StationInspector
              snapshot={snapshot}
              loading={networkLoading}
              selectedStationId={selectedStationId}
              cascade={cascade}
              onSelectStation={setSelectedStationId}
            />
          </div>

          {/* Fleet & Line Health Matrix (1 col) */}
          <div className="gsap-row-2-card">
            <LineHealthMatrix
              snapshot={snapshot}
              cascade={cascade}
              loading={networkLoading}
            />
          </div>

          {/* Recursive Cascade Propagation Engine (1 col) */}
          <div className="col-span-1 md:col-span-2 xl:col-span-1 gsap-row-2-card">
            <CascadeTelemetry
              cascade={cascade}
            />
          </div>
        </div>

        {/* ROW 3 - BENTO FULL SECTION: ACID Concurrency Arena & Lock Matrix (12 cols) */}
        <div className="col-span-12 gsap-concurrency-section">
          <ConcurrencyArena
            role={personaRole}
            canOperate={canOperate}
            snapshot={snapshot}
            onComplete={refresh}
          />
        </div>
      </div>

      {/* Neu-Brutalist Engineering Specifications Footer */}
      <footer className="brutal-card p-4 bg-white flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-800 gsap-footer">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FFE600] px-2 py-0.5 border-2 border-black font-black text-black text-[11px] shadow-[2px_2px_0px_0px_#000]">
            POSTGRESQL 16
          </span>
          <span className="text-black font-black">·</span>
          <span>Recursive CTE Graph Traversal</span>
          <span className="text-black font-black">·</span>
          <span>Row-Level Security (RLS)</span>
          <span className="text-black font-black">·</span>
          <span>FOR UPDATE SKIP LOCKED</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#4EFA8B] px-2 py-0.5 border-2 border-black font-black text-black text-[11px] shadow-[2px_2px_0px_0px_#000]">
            MONGODB 7
          </span>
          <span className="text-black font-black">·</span>
          <span>Polymorphic SCADA Ingestion</span>
          <span className="text-black font-black">·</span>
          <span className="font-mono font-black text-black bg-[#C084FC] px-2 py-0.5 rounded-md border-2 border-black shadow-[2px_2px_0px_0px_#000]">
            NEU-BRUTALISM UI v3.0
          </span>
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
