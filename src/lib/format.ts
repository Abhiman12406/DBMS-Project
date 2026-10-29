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
    return 'bg-[#FF5757] text-white border-2 border-black font-black shadow-[2px_2px_0px_0px_#000]';
  }
  if (value > 0) {
    return 'bg-[#FFE600] text-black border-2 border-black font-black shadow-[2px_2px_0px_0px_#000]';
  }
  return 'bg-[#4EFA8B] text-black border-2 border-black font-black shadow-[2px_2px_0px_0px_#000]';
}
