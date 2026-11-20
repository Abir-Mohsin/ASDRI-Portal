'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import { resolveInstitutionLogo } from '@/lib/initial-data';
import { generatePwaIconSetFromLogo } from '@/lib/pwa-icon-generator';

const CACHED_LOGO_KEY = 'asdri_pwa_active_logo_v1';

function upsertHeadLink(selector: string, attrs: Record<string, string>) {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement('link');
    document.head.appendChild(link);
  }
  Object.entries(attrs).forEach(([k, v]) => {
    link?.setAttribute(k, v);
  });
}

/**
 * Synchronizes the active institution logo (policy.institutionLogoUrl) with:
 * 1) Dynamic Web App Manifest (<link rel="manifest">) using absolute origin URLs + crisp 192/512 PNG icons
 * 2) iOS Home Screen icon (<link rel="apple-touch-icon">)
 * 3) Browser tab favicon (<link rel="icon">)
 */
export function DynamicPwaIconSync() {
  const { policy } = useApp();
  const activeLogoUrl = resolveInstitutionLogo(policy.institutionLogoUrl);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let cancelled = false;

    const effectiveLogo = (() => {
      if (activeLogoUrl && activeLogoUrl !== '/icon.svg') {
        try {
          window.localStorage.setItem(CACHED_LOGO_KEY, activeLogoUrl);
        } catch {
          // Ignore quota errors
        }
        return activeLogoUrl;
      }
      try {
        const cached = window.localStorage.getItem(CACHED_LOGO_KEY);
        if (cached && cached.trim()) return cached.trim();
      } catch {
        // Ignore storage errors
      }
      return activeLogoUrl;
    })();

    const syncIconsAndManifest = async () => {
      const iconSet = await generatePwaIconSetFromLogo(effectiveLogo);
      if (cancelled) return;

      // 1. Update Browser Favicon (192px PNG)
      document.head
        .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
        .forEach((el) => el.remove());

      upsertHeadLink('link[rel="icon"][data-asdri-dynamic="true"]', {
        rel: 'icon',
        type: 'image/png',
        sizes: '192x192',
        href: iconSet.icon192,
        'data-asdri-dynamic': 'true',
      });

      // 2. Update iOS Safari Home Screen Icon (180x180 PNG)
      document.head
        .querySelectorAll('link[rel="apple-touch-icon"]')
        .forEach((el) => el.remove());

      upsertHeadLink('link[rel="apple-touch-icon"][data-asdri-dynamic="true"]', {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: iconSet.icon180,
        'data-asdri-dynamic': 'true',
      });

      // 3. Build & swap Dynamic Web App Manifest with absolute origin URLs so blob: resolves cleanly
      const origin = window.location.origin;
      const manifestData = {
        id: `${origin}/`,
        name: 'ASDRI Portal — আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট',
        short_name: 'ASDRI Portal',
        description:
          'আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট (ASDRI) কর্মকর্তা ও শিক্ষক উপস্থিতি, সিদ্ধান্ত ও কাজ ব্যবস্থাপনা পোর্টাল',
        start_url: `${origin}/`,
        scope: `${origin}/`,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#064e3b',
        theme_color: '#064e3b',
        icons: [
          {
            src: iconSet.icon192,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: iconSet.icon512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: iconSet.iconMaskable512,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      };

      const manifestBlob = new Blob([JSON.stringify(manifestData)], {
        type: 'application/manifest+json',
      });
      const nextBlobUrl = URL.createObjectURL(manifestBlob);

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = nextBlobUrl;

      let manifestLink = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.setAttribute('rel', 'manifest');
        document.head.appendChild(manifestLink);
      }
      manifestLink.setAttribute('href', nextBlobUrl);
    };

    void syncIconsAndManifest();

    return () => {
      cancelled = true;
    };
  }, [activeLogoUrl]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  return null;
}
