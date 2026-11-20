'use client';

// Pure client-side PNG PWA icon generator from the institution's active logo.
// Generates crisp square PNGs (180x180 apple-touch-icon, 192x192, 512x512, and safe-zone padded 512x512 maskable)
// so that whatever logo is placed in the portal becomes the installed PWA app icon on Android, iOS, and Desktop.

export interface GeneratedPwaIconSet {
  icon180: string;
  icon192: string;
  icon512: string;
  iconMaskable512: string;
  isCanvasRendered: boolean;
}

function loadImageElement(src: string, useCors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (useCors && !src.startsWith('data:') && !src.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function renderSquareIconPng(
  img: HTMLImageElement,
  size: number,
  paddingRatio: number,
  backgroundColor: string
): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Solid full-bleed background (required for iOS & Android maskable icons)
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, size, size);

  const padding = Math.round(size * paddingRatio);
  const availW = size - padding * 2;
  const availH = size - padding * 2;

  const naturalW = img.naturalWidth || img.width || size;
  const naturalH = img.naturalHeight || img.height || size;
  const scale = Math.min(availW / naturalW, availH / naturalH);

  const drawW = Math.max(1, Math.round(naturalW * scale));
  const drawH = Math.max(1, Math.round(naturalH * scale));
  const offsetX = Math.round((size - drawW) / 2);
  const offsetY = Math.round((size - drawH) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

  return canvas.toDataURL('image/png');
}

export async function generatePwaIconSetFromLogo(logoUrl: string): Promise<GeneratedPwaIconSet> {
  const cleanUrl = (logoUrl || '').trim();
  if (!cleanUrl || typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      icon180: '/apple-touch-icon.png',
      icon192: '/pwa-192x192.png',
      icon512: '/pwa-512x512.png',
      iconMaskable512: '/pwa-maskable-512x512.png',
      isCanvasRendered: false,
    };
  }

  const isDefaultSvg = cleanUrl === '/icon.svg' || cleanUrl.endsWith('/icon.svg');
  // Custom uploaded logos typically have transparent or light backgrounds -> clean white tile;
  // default emerald SVG emblem -> emerald background
  const bgColor = isDefaultSvg ? '#064e3b' : '#ffffff';
  const standardPad = isDefaultSvg ? 0.0 : 0.08;
  // Android adaptive / maskable safe zone requires ~12-15% margin on every side
  const maskablePad = isDefaultSvg ? 0.12 : 0.16;

  try {
    const img = await loadImageElement(cleanUrl, true);
    const icon180 = renderSquareIconPng(img, 180, standardPad, bgColor);
    const icon192 = renderSquareIconPng(img, 192, standardPad, bgColor);
    const icon512 = renderSquareIconPng(img, 512, standardPad, bgColor);
    const iconMaskable512 = renderSquareIconPng(img, 512, maskablePad, bgColor);

    if (icon180 && icon192 && icon512 && iconMaskable512) {
      return {
        icon180,
        icon192,
        icon512,
        iconMaskable512,
        isCanvasRendered: true,
      };
    }
  } catch {
    // Fallback if external URL blocks CORS canvas export
  }

  // Fallback: resolve relative URL to absolute so blob: manifest can still load it
  const absoluteUrl =
    cleanUrl.startsWith('data:') || /^https?:\/\//i.test(cleanUrl)
      ? cleanUrl
      : `${window.location.origin}${cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`}`;

  return {
    icon180: absoluteUrl,
    icon192: absoluteUrl,
    icon512: absoluteUrl,
    iconMaskable512: absoluteUrl,
    isCanvasRendered: false,
  };
}

export function downloadDataUrlFile(dataUrl: string, fileName: string) {
  if (typeof document === 'undefined' || !dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
