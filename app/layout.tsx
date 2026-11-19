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

const ABORT_GUARD_SCRIPT = `(function(){if(typeof window==='undefined')return;var isBenign=function(r){if(!r)return false;if(typeof r==='object'){if(r.name==='AbortError')return true;if(typeof r.message==='string'&&(r.message.indexOf('signal is aborted without reason')!==-1||r.message.indexOf('The user aborted a request')!==-1))return true;}if(typeof r==='string'&&(r.indexOf('signal is aborted without reason')!==-1||r.indexOf('AbortError')!==-1))return true;return false;};window.addEventListener('unhandledrejection',function(e){if(isBenign(e.reason)){e.preventDefault();e.stopImmediatePropagation();}},true);window.addEventListener('error',function(e){if(isBenign(e.error)||isBenign(e.message)){e.preventDefault();e.stopImmediatePropagation();}},true);})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ABORT_GUARD_SCRIPT }} />
      </head>
      <body
        className="antialiased min-h-screen selection:bg-emerald-600/20 selection:text-emerald-950 dark:selection:text-emerald-100 font-serif"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
