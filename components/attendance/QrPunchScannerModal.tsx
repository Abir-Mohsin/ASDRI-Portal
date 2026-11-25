'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, X, CheckCircle2, RefreshCw, AlertTriangle, LogIn, LogOut, Keyboard } from 'lucide-react';
import { useApp, VerifiedPunchResult } from '@/lib/store';
import { isAdministrativeRole } from '@/lib/types';
import { generateDynamicQrToken } from '@/lib/client-qr';

interface QrPunchScannerModalProps {
  isOpen: boolean;
  punchType: 'IN' | 'OUT';
  stream: MediaStream | null;
  cameraError: string | null;
  onClose: () => void;
  onComplete: (result: VerifiedPunchResult) => void;
  onRetryCamera?: () => void;
}

export function useQrCameraPunch(onPunchResult?: (result: VerifiedPunchResult) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [punchType, setPunchType] = useState<'IN' | 'OUT'>('IN');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const closeScanner = useCallback(() => {
    stopStream();
    setCameraError(null);
    setIsOpen(false);
  }, [stopStream]);

  const openCameraPunch = useCallback(
    async (targetType: 'IN' | 'OUT') => {
      stopStream();
      setPunchType(targetType);
      setCameraError(null);
      setIsOpen(true);

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setCameraError(
          'নিরাপদ HTTPS সংযোগ ছাড়া ব্রাউজার ক্যামেরা চালু করতে দেয় না। অনুগ্রহ করে HTTPS লিংক ব্যবহার করুন অথবা নিচে ৬-সংখ্যার কোড দিন।'
        );
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('এই ব্রাউজারে ক্যামেরা সমর্থিত নয়। নিচে ৬-সংখ্যার কোড দিন।');
        return;
      }

      try {
        let mediaStream: MediaStream | null = null;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch {
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (mediaStream) {
          streamRef.current = mediaStream;
          setStream(mediaStream);
        }
      } catch (err: unknown) {
        const errorObj = err as { name?: string } | undefined;
        if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
          setCameraError(
            'ক্যামেরা পারমিশন বন্ধ আছে। ব্রাউজারের অ্যাড্রেস বারের আইকন থেকে Camera "Allow" করে নিচের "পুনরায় চেষ্টা করুন" বাটনে ক্লিক করুন (অথবা ৬-সংখ্যার কোড দিন)।'
          );
        } else if (errorObj?.name === 'NotFoundError' || errorObj?.name === 'DevicesNotFoundError') {
          setCameraError('ডিভাইসে ক্যামেরা পাওয়া যায়নি। নিচে ৬-সংখ্যার কোড দিন।');
        } else {
          setCameraError('ক্যামেরা চালু করা যায়নি। পুনরায় চেষ্টা করুন অথবা নিচে ৬-সংখ্যার কোড দিন।');
        }
      }
    },
    [stopStream]
  );

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleComplete = useCallback(
    (result: VerifiedPunchResult) => {
      closeScanner();
      onPunchResult?.(result);
    },
    [closeScanner, onPunchResult]
  );

  return {
    scannerProps: {
      isOpen,
      punchType,
      stream,
      cameraError,
      onClose: closeScanner,
      onComplete: handleComplete,
      onRetryCamera: () => {
        void openCameraPunch(punchType);
      },
    },
    openCameraPunch,
    closeScanner,
  };
}

export function QrPunchScannerModal({
  isOpen,
  punchType,
  stream,
  cameraError,
  onClose,
  onComplete,
  onRetryCamera,
}: QrPunchScannerModalProps) {
  const { currentUser, policy, executeVerifiedPunch } = useApp();
  const isAdmin = isAdministrativeRole(currentUser.role);

  const [manualCode, setManualCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [serverQr, setServerQr] = useState<{ token: string; shortCode: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingScanRef = useRef<boolean>(false);

  // Generate active rotating QR info for Admins (client-side, zero server dependency)
  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    const loadQr = () => {
      const rot = policy.qrRotationSeconds || 30;
      const data = generateDynamicQrToken(rot);
      setServerQr({ token: data.token, shortCode: data.shortCode });
    };
    const initTimer = setTimeout(loadQr, 0);
    const interval = setInterval(loadQr, 3000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [isOpen, isAdmin, policy.qrRotationSeconds]);

  const submitToken = useCallback(
    async (rawToken: string) => {
      const cleaned = rawToken.trim();
      if (!cleaned || processingScanRef.current) return;

      processingScanRef.current = true;
      setIsSubmitting(true);
      setInlineError(null);

      try {
        let lat = 0;
        let lng = 0;
        let accuracy: number | undefined = undefined;

        if (policy.requireGpsVerification && typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 6000,
                maximumAge: 10000,
              });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            accuracy = Math.round(pos.coords.accuracy || 15);
          } catch {
            setInlineError('GPS লোকেশন পাওয়া যায়নি। লোকেশন পারমিশন চালু করে আবার চেষ্টা করুন।');
            setIsSubmitting(false);
            processingScanRef.current = false;
            return;
          }
        }

        const resolvedToken =
          serverQr && cleaned.toUpperCase() === serverQr.shortCode.toUpperCase()
            ? serverQr.token
            : cleaned;

        const result = await executeVerifiedPunch({
          employeeId: currentUser.id,
          punchType,
          lat,
          lng,
          accuracy,
          qrToken: resolvedToken,
        });

        if (result.ok) {
          setManualCode('');
          onComplete(result);
        } else {
          setInlineError(result.message);
          processingScanRef.current = false;
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [currentUser.id, executeVerifiedPunch, onComplete, policy.requireGpsVerification, punchType, serverQr]
  );

  // Attach camera stream and continuously scan frames
  useEffect(() => {
    if (!isOpen || !stream || !videoRef.current) return;
    processingScanRef.current = false;

    const video = videoRef.current;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;

    let active = true;

    const scanLoop = async () => {
      if (!active || !videoRef.current || !canvasRef.current || processingScanRef.current) return;
      const v = videoRef.current;
      const canvas = canvasRef.current;

      if (v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth > 0 && v.videoHeight > 0) {
        let detected: string | null = null;

        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const BD = (
              window as unknown as {
                BarcodeDetector: new (opts: { formats: string[] }) => {
                  detect: (src: unknown) => Promise<Array<{ rawValue: string }>>;
                };
              }
            ).BarcodeDetector;
            const detector = new BD({ formats: ['qr_code'] });
            const codes = await detector.detect(v);
            if (codes?.[0]?.rawValue) {
              detected = codes[0].rawValue.trim();
            }
          } catch {
            // Fallback to jsQR
          }
        }

        if (!detected) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (code?.data) {
              detected = code.data.trim();
            }
          }
        }

        if (detected) {
          await submitToken(detected);
          return;
        }
      }

      if (active && !processingScanRef.current) {
        rafRef.current = requestAnimationFrame(scanLoop);
      }
    };

    video
      .play()
      .then(() => {
        if (active) {
          rafRef.current = requestAnimationFrame(scanLoop);
        }
      })
      .catch(() => {
        // Ignore play errors on close
      });

    return () => {
      active = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isOpen, stream, submitToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden border border-slate-200 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {punchType === 'IN' ? (
              <LogIn className="w-4 h-4 text-emerald-800" />
            ) : (
              <LogOut className="w-4 h-4 text-rose-700" />
            )}
            <h3 className="text-sm font-bold text-slate-900">
              {punchType === 'IN' ? 'Punch In — QR স্ক্যান' : 'Punch Out — QR স্ক্যান'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Camera Viewport */}
          {stream && !cameraError ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] border border-slate-200">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-6 border-2 border-dashed border-emerald-400/80 rounded-xl pointer-events-none flex items-end justify-center pb-2">
                <span className="text-[11px] bg-black/70 text-white px-2.5 py-0.5 rounded">
                  অফিসের QR কোডের দিকে ধরুন
                </span>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              {isSubmitting && (
                <div className="absolute inset-0 bg-emerald-950/75 flex flex-col items-center justify-center text-white text-xs gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-300" />
                  <span>যাচাই করা হচ্ছে...</span>
                </div>
              )}
            </div>
          ) : cameraError ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{cameraError}</span>
              </div>
              {onRetryCamera && (
                <button
                  type="button"
                  onClick={onRetryCamera}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-800 text-white font-semibold cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>পুনরায় ক্যামেরা চালু করুন</span>
                </button>
              )}
            </div>
          ) : (
            <div className="h-44 rounded-xl bg-slate-900 text-slate-200 flex flex-col items-center justify-center gap-2 text-xs">
              <Camera className="w-6 h-6 text-emerald-400 animate-pulse" />
              <span>ক্যামেরা চালু হচ্ছে...</span>
            </div>
          )}

          {/* Inline Error Feedback */}
          {inlineError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
              {inlineError}
            </div>
          )}

          {/* Compact 6-digit Fallback Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitToken(manualCode);
            }}
            className="flex items-center gap-2 pt-1"
          >
            <div className="relative flex-1">
              <Keyboard className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="৬-সংখ্যার কোড (বিকল্প)"
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-800"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !manualCode.trim()}
              className={`px-4 py-2 rounded-lg text-xs font-bold text-white whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                punchType === 'IN' ? 'bg-emerald-900 hover:bg-emerald-800' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isSubmitting ? 'অপেক্ষা...' : punchType === 'IN' ? 'Punch In' : 'Punch Out'}
            </button>
          </form>

          {/* Admin Quick Test / Office Screen Shortcut */}
          {isAdmin && serverQr && (
            <button
              type="button"
              onClick={() => submitToken(serverQr.token)}
              disabled={isSubmitting}
              className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>অফিস QR দিয়ে সরাসরি সম্পন্ন ({serverQr.shortCode})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
