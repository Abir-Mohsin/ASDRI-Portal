import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#064e3b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'ASDRI Portal | আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট',
  description: 'ASDRI Integrated Institutional Management System (IIMS) — Mobile Attendance, GPS & Dynamic QR Punch, Task & Meeting Tracker.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ASDRI Portal',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'ASDRI Portal | আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট',
    description: 'ASDRI Integrated Institutional Management System (IIMS)',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body
        className="antialiased min-h-screen selection:bg-emerald-600/20 selection:text-emerald-950 dark:selection:text-emerald-100 font-serif"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
