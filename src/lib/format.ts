export function formatClock(value: string | Date | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDelay(minutes: number | string | null | undefined): string {
  const value = Number(minutes ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 'On time';
  }
  return `+${Math.round(value)} min`;
}

export function delayClasses(minutes: number | string | null | undefined): string {
  const value = Number(minutes ?? 0);
  if (value >= 15) {
    return 'bg-rose-500/15 text-rose-300 ring-rose-500/30';
  }
  if (value > 0) {
    return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
  }
  return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30';
}
