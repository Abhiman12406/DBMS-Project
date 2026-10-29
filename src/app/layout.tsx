import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Transit Disruption Dependency Engine · Neu Brutalism Operations Center',
  description:
    'Hybrid PostgreSQL + MongoDB demonstration of recursive disruption cascades and ACID rebooking in a high-contrast Neu-Brutalist design.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F4F0EA] text-slate-950 font-sans antialiased selection:bg-[#FFE600] selection:text-black">
        {/* Neu-Brutalist Technical Grid & Ambient Pattern */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          {/* Subtle geometric dot grid with paper texture feel */}
          <div className="absolute inset-0 bg-brutal-grid opacity-20" />
          {/* Subtle retro ruler lines */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-black" />
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black" />
        </div>
        {children}
      </body>
    </html>
  );
}
