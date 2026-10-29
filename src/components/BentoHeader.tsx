'use client';

import {
  Code2,
  Database,
  RefreshCw,
  ShieldCheck,
  TrainFront,
  Wifi,
  WifiOff,
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
      className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium border transition-colors ${
        connected
          ? 'bg-emerald-500/[0.07] border-emerald-500/20 text-emerald-300'
          : 'bg-rose-500/[0.07] border-rose-500/20 text-rose-300'
      }`}
    >
      <span className="relative flex h-2 w-2">
        {connected ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </>
        ) : (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
        )}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-slate-200">{label}</span>
        <span className="font-mono text-[9px] text-slate-400 bg-white/5 px-1 py-0.5 rounded">{version}</span>
      </div>
      {connected && latency !== undefined ? (
        <span className="font-mono text-[10px] text-emerald-400/80 pl-1 border-l border-emerald-500/20">
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
    <header className="bento-card p-4 lg:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand & System Vitals */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 via-sky-500/10 to-transparent border border-sky-500/30 shadow-lg shadow-sky-500/10">
            <TrainFront className="h-5 w-5 text-sky-400" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
                Operations Center
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-medium text-sky-300 ring-1 ring-sky-500/25">
                Hybrid DBMS
              </span>
            </div>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white sm:text-xl">
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

          <div className="h-6 w-px bg-white/10 hidden sm:block mx-1" />

          {/* Persona Segmented Controller */}
          <PersonaSwitcher value={personaKey} onChange={onPersonaChange} />

          {/* Quick Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh network telemetry"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 cursor-pointer transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <RefreshCw className={`h-4 w-4 ${networkLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          {/* SQL & Explain Auditor Modal Trigger */}
          <button
            type="button"
            onClick={onOpenAudit}
            className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2 text-xs font-semibold text-sky-300 cursor-pointer transition-all duration-200 hover:border-sky-500/50 hover:bg-sky-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Code2 className="h-3.5 w-3.5 text-sky-400" />
            <span>SQL & Explain</span>
          </button>
        </div>
      </div>

      {/* Micro Status Ribbon */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5 text-[10px] text-slate-400">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2 py-0.5 border border-white/10 font-mono text-[10px] text-slate-300">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            <span>SET LOCAL ROLE {dbRole}</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2 py-0.5 border border-white/10 text-slate-400">
            <Database className="h-3 w-3 text-sky-400" />
            {personaRole === 'passenger'
              ? 'RLS Policy: Passenger Session Isolation active'
              : 'Full Network Telemetry & Cascade Engine access'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-500">
          <span>Recursive CTE Horizon: <strong className="text-slate-300 font-mono">45 min</strong></span>
          <span className="hidden md:inline">·</span>
          <span className="hidden md:inline">Lock Engine: <strong className="text-slate-300 font-mono">SKIP LOCKED</strong></span>
        </div>
      </div>
    </header>
  );
}
