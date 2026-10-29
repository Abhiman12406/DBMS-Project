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
  activeBg: string;
}> = [
  { key: 'dispatcher', label: 'Dispatcher', badge: 'Ops', role: 'dispatcher_role', icon: RadioTower, activeBg: 'bg-[#FFE600]' },
  { key: 'passenger', label: 'Passenger', badge: 'RLS', role: 'passenger_role', icon: User, activeBg: 'bg-[#00F0FF]' },
  { key: 'auditor', label: 'Auditor', badge: 'Admin', role: 'transit_admin', icon: ShieldCheck, activeBg: 'bg-[#C084FC]' },
];

export function PersonaSwitcher({ value, onChange }: PersonaSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Database persona role"
      className="inline-flex items-center rounded-xl border-2 border-black bg-white p-1 shadow-[3px_3px_0px_0px_#000000] gap-1"
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
            className={`group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
              active
                ? `${option.activeBg} text-black font-black border-2 border-black shadow-[2px_2px_0px_0px_#000000] -translate-y-0.5`
                : 'text-slate-800 font-bold border-2 border-transparent hover:bg-slate-100 hover:text-black'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="tracking-tight">{option.label}</span>
            <span
              className={`rounded px-1.5 py-0.2 text-[9px] font-mono tracking-tight font-black border ${
                active
                  ? 'bg-black text-white border-black'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
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
