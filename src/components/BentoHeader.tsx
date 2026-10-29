'use client';

import {
  Code2,
  Database,
  RefreshCw,
  ShieldCheck,
  TrainFront,
} from 'lucide-react';

import { PersonaSwitcher, type PersonaKey } from './PersonaSwitcher';
import type { HealthReport, PersonaRole } from '@/lib/types';

interface BentoHeaderProps {
  personaKey: PersonaKey;
  personaRole: PersonaRole;
  dbRole: string;
  health: HealthReport | null;
  networkLoading: boolean;
  onPersonaChange: (persona: PersonaKey) => void;
  onRefresh: () => void;
  onOpenAudit: () => void;
}

function HealthPill({
  label,
  version,
  connected,
  latency,
}: {
  label: string;
  version: string;
  connected: boolean;
  latency?: number;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-black border-2 border-black transition-transform ${
        connected
          ? 'bg-[#DCFCE7] text-black shadow-[2px_2px_0px_0px_#000]'
          : 'bg-[#FEE2E2] text-black shadow-[2px_2px_0px_0px_#000]'
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {connected ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 border border-black" />
          </>
        ) : (
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600 border border-black" />
        )}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-black uppercase tracking-wide text-black">{label}</span>
        <span className="font-mono text-[9px] text-white bg-black px-1 py-0.5 rounded font-black">{version}</span>
      </div>
      {connected && latency !== undefined ? (
        <span className="font-mono text-[10px] text-emerald-950 font-black pl-1.5 border-l-2 border-black">
          {latency}ms
        </span>
      ) : null}
    </div>
  );
}

export function BentoHeader({
  personaKey,
  personaRole,
  dbRole,
  health,
  networkLoading,
  onPersonaChange,
  onRefresh,
  onOpenAudit,
}: BentoHeaderProps) {
  return (
    <header className="brutal-card p-4 lg:p-5 bg-white border-[2.5px] border-black shadow-[5px_5px_0px_0px_#000000]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand & System Vitals */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFE600] border-2 border-black shadow-[3px_3px_0px_0px_#000]">
            <TrainFront className="h-6 w-6 text-black stroke-[2.5]" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 border border-black" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-black text-[#FFE600] px-1.5 py-0.5 rounded">
                Control Hub
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-[#00F0FF] px-2 py-0.5 text-[9px] font-black uppercase text-black border border-black shadow-[1px_1px_0px_0px_#000]">
                Hybrid DBMS
              </span>
            </div>
            <h1 className="mt-0.5 text-lg font-black tracking-tight text-black sm:text-2xl">
              Transit Disruption Dependency Engine
            </h1>
          </div>
        </div>

        {/* Database Health Clusters & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2">
            <HealthPill
              label="Postgres"
              version="v16"
              connected={health?.postgres.connected ?? false}
              latency={health?.postgres.latencyMs}
            />
            <HealthPill
              label="MongoDB"
              version="v7"
              connected={health?.mongodb.connected ?? false}
              latency={health?.mongodb.latencyMs}
            />
          </div>

          <div className="h-7 w-0.5 bg-black hidden sm:block mx-1" />

          {/* Persona Segmented Controller */}
          <PersonaSwitcher value={personaKey} onChange={onPersonaChange} />

          {/* Quick Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh network telemetry"
            aria-label="Refresh network telemetry"
            className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-black bg-white text-black shadow-[3px_3px_0px_0px_#000] cursor-pointer transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            <RefreshCw className={`h-4 w-4 stroke-[2.5] ${networkLoading ? 'animate-spin text-black' : ''}`} />
          </button>

          {/* SQL & Explain Auditor Modal Trigger */}
          <button
            type="button"
            onClick={onOpenAudit}
            className="flex items-center gap-2 rounded-xl border-2 border-black bg-[#FFE600] px-3.5 py-2 text-xs font-black text-black uppercase tracking-wide shadow-[3px_3px_0px_0px_#000] cursor-pointer transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            <Code2 className="h-4 w-4 stroke-[2.5]" />
            <span>SQL & Explain</span>
          </button>
        </div>
      </div>

      {/* Micro Status Ribbon */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t-2 border-black pt-2.5 text-[11px] font-bold text-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg bg-[#FAF8F5] px-2.5 py-1 border-2 border-black font-mono text-[10px] text-black shadow-[2px_2px_0px_0px_#000] font-black">
            <ShieldCheck className="h-3.5 w-3.5 text-black stroke-[2.5]" />
            <span>SET LOCAL ROLE {dbRole}</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 border-2 border-black text-slate-900 shadow-[2px_2px_0px_0px_#000]">
            <Database className="h-3.5 w-3.5 text-black stroke-[2.5]" />
            {personaRole === 'passenger'
              ? 'RLS Policy: Passenger Session Isolation active'
              : 'Full Network Telemetry & Cascade Engine access'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-700">
          <span>Recursive CTE Horizon: <strong className="text-black font-mono font-black bg-[#FFE600] px-1 rounded border border-black">45 min</strong></span>
          <span className="hidden md:inline font-black text-black">·</span>
          <span className="hidden md:inline">Lock Engine: <strong className="text-black font-mono font-black bg-[#4EFA8B] px-1 rounded border border-black">SKIP LOCKED</strong></span>
        </div>
      </div>
    </header>
  );
}
