'use client';

import { ArrowRight, ShieldCheck, Ticket, TrainFront } from 'lucide-react';

import type { NetworkSnapshot } from '@/lib/client';
import { delayClasses, formatClock, formatDelay } from '@/lib/format';

interface PassengerJourneyPassProps {
  snapshot: NetworkSnapshot | null;
  loading: boolean;
  passengerId: number;
}

export function PassengerJourneyPass({
  snapshot,
  loading,
  passengerId,
}: PassengerJourneyPassProps) {
  const profile = snapshot?.passengerProfile ?? null;
  const reservations = snapshot?.myReservations ?? [];

  return (
    <section className="bento-card p-5 border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-slate-900/60 to-slate-900/60 shadow-xl shadow-sky-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-400">
              Passenger Portal · RLS Protected
            </span>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[9px] text-sky-300 border border-sky-500/30">
              Row Level Security
            </span>
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
            <Ticket className="h-5 w-5 text-sky-400" />
            <span>{profile?.full_name ?? 'Passenger Journey Pass'}</span>
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {profile?.email ?? 'Loading traveler profile…'} · passenger_id{' '}
            <strong className="text-slate-200 font-mono">
              {profile?.passenger_id ?? passengerId}
            </strong>{' '}
            · session variable{' '}
            <span className="font-mono text-sky-300 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
              app.current_passenger_id
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Zero Cross-Tenant Leakage</span>
          </span>
        </div>
      </div>

      {/* Reservation Boarding Passes */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {reservations.map((reservation) => (
          <div
            key={reservation.reservation_id}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-4 transition-all duration-200 hover:border-sky-500/30 hover:bg-slate-950/90"
          >
            {/* Top Pass Ribbon */}
            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/10"
                  style={{ backgroundColor: reservation.color_hex ?? '#38bdf8' }}
                />
                <span className="truncate text-xs font-bold text-white">
                  {reservation.line_name ?? 'Transit Service'}
                </span>
              </div>

              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-sky-300 border border-white/10">
                {reservation.booking_status}
              </span>
            </div>

            {/* Origin to Destination */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Departure</p>
                <p className="text-sm font-bold text-white">{reservation.origin_station_name}</p>
                <p className="font-mono text-xs text-sky-400">{formatClock(reservation.scheduled_start)}</p>
              </div>

              <div className="flex flex-col items-center px-2">
                <TrainFront className="h-4 w-4 text-slate-500" />
                <ArrowRight className="h-4 w-4 text-sky-400 my-0.5" />
                <span className="font-mono text-[9px] text-slate-500">{reservation.train_number ?? 'TR-01'}</span>
              </div>

              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Arrival</p>
                <p className="text-sm font-bold text-white">{reservation.destination_station_name}</p>
                <p className="font-mono text-xs text-slate-300">{formatClock(reservation.scheduled_end)}</p>
              </div>
            </div>

            {/* Delay & Booking Status Footer */}
            <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-mono text-[10px]">
                Reservation #{reservation.reservation_id}
              </span>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${delayClasses(
                  reservation.max_delay_min,
                )}`}
              >
                {formatDelay(reservation.max_delay_min)}
              </span>
            </div>
          </div>
        ))}

        {reservations.length === 0 && !loading ? (
          <div className="col-span-2 rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
            No reservations found for this passenger identity under active PostgreSQL Row Level Security.
          </div>
        ) : null}
      </div>
    </section>
  );
}
