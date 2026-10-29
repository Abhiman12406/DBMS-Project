'use client';

import { RadioTower, ShieldCheck, User } from 'lucide-react';

export type PersonaKey = 'dispatcher' | 'passenger' | 'auditor';

interface PersonaSwitcherProps {
  value: PersonaKey;
  onChange: (persona: PersonaKey) => void;
}

const OPTIONS: Array<{
  key: PersonaKey;
  label: string;
  badge: string;
  role: string;
  icon: typeof User;
}> = [
  { key: 'dispatcher', label: 'Dispatcher', badge: 'Ops', role: 'dispatcher_role', icon: RadioTower },
  { key: 'passenger', label: 'Passenger', badge: 'RLS', role: 'passenger_role', icon: User },
  { key: 'auditor', label: 'Auditor', badge: 'Admin', role: 'transit_admin', icon: ShieldCheck },
];

export function PersonaSwitcher({ value, onChange }: PersonaSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Database persona role"
      className="inline-flex items-center rounded-xl border border-white/10 bg-slate-900/60 p-1 shadow-inner backdrop-blur-md"
    >
      {OPTIONS.map((option) => {
        const active = option.key === value;
        const Icon = option.icon;

        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.key)}
            title={`Switch to ${option.label} (SET LOCAL ROLE ${option.role})`}
            className={`group relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              active
                ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-slate-950 font-semibold shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`} />
            <span>{option.label}</span>
            <span
              className={`rounded px-1 py-0.2 text-[9px] font-mono tracking-tight ${
                active
                  ? 'bg-slate-950/20 text-slate-950 font-bold'
                  : 'bg-white/5 text-slate-500 group-hover:text-slate-400'
              }`}
            >
              {option.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}
