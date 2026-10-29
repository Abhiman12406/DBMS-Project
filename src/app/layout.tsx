import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Transit Disruption Dependency Engine · Bento Operations Center',
  description:
    'Hybrid PostgreSQL + MongoDB demonstration of recursive disruption cascades and ACID rebooking.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#060913] text-slate-100 antialiased selection:bg-sky-500/30">
        {/* Ambient lighting layers */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-sky-500/10 blur-[128px]" />
          <div className="absolute -top-20 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[128px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-blue-600/5 blur-[160px]" />
          <div className="absolute inset-0 bg-bento-grid opacity-60" />
        </div>
        {children}
      </body>
    </html>
  );
}
