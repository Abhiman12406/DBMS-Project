'use client';

import { useRef } from 'react';
import { ArrowRight, ShieldCheck, Ticket, TrainFront } from 'lucide-react';

import { gsap, useGSAP } from '@/lib/gsap';
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
  const passRef = useRef<HTMLElement>(null);
  const profile = snapshot?.passengerProfile ?? null;
  const reservations = snapshot?.myReservations ?? [];

  useGSAP(
    () => {
      if (reservations.length === 0) return;

      // Boarding pass ticket entrance animation (strictly rectilinear with zero rotation)
      gsap.from('.gsap-boarding-ticket', {
        scale: 0.96,
        y: 16,
        opacity: 0,
        duration: 0.38,
        stagger: 0.07,
        ease: 'power3.out',
        clearProps: 'transform',
      });
    },
    { scope: passRef, dependencies: [reservations] },
  );

  return (
    <section
      ref={passRef}
      className="brutal-card p-5 bg-[#FFFDF8] border-[3px] border-black shadow-[6px_6px_0px_0px_#000000]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-[#FFE600] text-black px-2 py-0.5 border border-black rounded shadow-[1px_1px_0px_0px_#000]">
              Passenger Portal · RLS Protected
            </span>
            <span className="rounded bg-[#00F0FF] px-2 py-0.5 font-mono text-[9px] font-black uppercase text-black border border-black shadow-[1px_1px_0px_0px_#000]">
              Row Level Security
            </span>
          </div>
          <h2 className="mt-1.5 flex items-center gap-2 text-xl font-black text-black sm:text-2xl">
            <Ticket className="h-6 w-6 text-black stroke-[2.5]" />
            <span>{profile?.full_name ?? 'Passenger Journey Pass'}</span>
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-700">
            {profile?.email ?? 'Loading traveler profile…'} · passenger_id{' '}
            <strong className="text-black font-mono font-black bg-white px-1.5 py-0.2 rounded border border-black">
              #{profile?.passenger_id ?? passengerId}
            </strong>{' '}
            · session variable{' '}
            <span className="font-mono text-black font-black bg-[#FFE600] px-1.5 py-0.2 rounded border border-black">
              app.current_passenger_id
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg bg-[#4EFA8B] px-3 py-1.5 text-xs font-black text-black border-2 border-black shadow-[3px_3px_0px_0px_#000]">
            <ShieldCheck className="h-4 w-4 text-black stroke-[2.5]" />
            <span>Zero Cross-Tenant Leakage</span>
          </span>
        </div>
      </div>

      {/* Reservation Boarding Passes */}
      <div
        className={`mt-5 grid gap-4 ${
          reservations.length === 1
            ? 'grid-cols-1 max-w-xl'
            : reservations.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {reservations.map((reservation) => (
          <div
            key={reservation.reservation_id}
            className="gsap-boarding-ticket group relative flex flex-col justify-between overflow-hidden rounded-xl border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000000] transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#000000]"
          >
            <div>
              {/* Top Pass Ribbon */}
              <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-black shadow-[1px_1px_0px_0px_#000]"
                    style={{ backgroundColor: reservation.color_hex ?? '#38bdf8' }}
                  />
                  <span className="truncate text-xs font-black text-black uppercase tracking-tight">
                    {reservation.line_name ?? 'Transit Service'}
                  </span>
                </div>

                <span className="rounded-md bg-black px-2.5 py-0.5 text-[10px] font-mono font-black text-[#FFE600] border border-black">
                  {reservation.booking_status}
                </span>
              </div>

              {/* Origin to Destination */}
              <div className="mt-3.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Departure</p>
                  <p className="text-base font-black text-black">{reservation.origin_station_name}</p>
                  <p className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1 py-0.5 rounded border border-slate-300 inline-block mt-0.5">
                    {formatClock(reservation.scheduled_start)}
                  </p>
                </div>

                <div className="flex flex-col items-center px-3 py-1 rounded-lg bg-amber-50 border-2 border-black">
                  <TrainFront className="h-4 w-4 text-black stroke-[2]" />
                  <ArrowRight className="h-4 w-4 text-black stroke-[2.5] my-0.5" />
                  <span className="font-mono text-[9px] font-black text-black">{reservation.train_number ?? 'TR-01'}</span>
                </div>

                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Arrival</p>
                  <p className="text-base font-black text-black">{reservation.destination_station_name}</p>
                  <p className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1 py-0.5 rounded border border-slate-300 inline-block mt-0.5">
                    {formatClock(reservation.scheduled_end)}
                  </p>
                </div>
              </div>
            </div>

            {/* Delay & Booking Status Footer */}
            <div className="mt-3.5 pt-2.5 border-t-2 border-black flex items-center justify-between text-[11px]">
              <span className="font-mono text-[11px] font-black text-black bg-slate-100 px-2 py-0.5 rounded border border-black">
                PASS #{reservation.reservation_id}
              </span>

              <span
                className={`rounded-md px-2.5 py-0.5 text-[10px] font-black uppercase ${delayClasses(
                  reservation.max_delay_min,
                )}`}
              >
                {formatDelay(reservation.max_delay_min)}
              </span>
            </div>
          </div>
        ))}

        {reservations.length === 0 && !loading ? (
          <div className="col-span-full rounded-xl border-2 border-dashed border-black bg-white p-6 text-center text-xs font-bold text-slate-700">
            No reservations found for this passenger identity under active PostgreSQL Row Level Security.
          </div>
        ) : null}
      </div>
    </section>
  );
}
