'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  X,
  RefreshCw,
  AlertTriangle,
  LogIn,
  LogOut,
  SwitchCamera,
  Play,
} from 'lucide-react';
import { useApp, VerifiedPunchResult } from '@/lib/store';

type FacingMode = 'environment' | 'user';

interface QrPunchScannerModalProps {
  isOpen: boolean;
  punchType: 'IN' | 'OUT';
  stream: MediaStream | null;
  cameraError: string | null;
  cameraErrorCode: string | null;
  facingMode: FacingMode;
  onClose: () => void;
  onComplete: (result: VerifiedPunchResult) => void;
  onRetryCamera?: () => void;
  onSwitchCamera?: () => void;
}

export function useQrCameraPunch(onPunchResult?: (result: VerifiedPunchResult) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [punchType, setPunchType] = useState<'IN' | 'OUT'>('IN');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraErrorCode, setCameraErrorCode] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');

  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef<number>(0);
  const isOpenRef = useRef<boolean>(false);
  const punchTypeRef = useRef<'IN' | 'OUT'>('IN');
  const facingModeRef = useRef<FacingMode>('environment');
  const onPunchResultRef = useRef(onPunchResult);

  useEffect(() => {
    onPunchResultRef.current = onPunchResult;
  }, [onPunchResult]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const closeScanner = useCallback(() => {
    requestIdRef.current += 1;
    isOpenRef.current = false;
    stopStream();
    setCameraError(null);
    setCameraErrorCode(null);
    setIsOpen(false);
  }, [stopStream]);

  const startCameraStream = useCallback(
    async (targetType: 'IN' | 'OUT', preferredFacing: FacingMode) => {
      const reqId = ++requestIdRef.current;
      stopStream();
      punchTypeRef.current = targetType;
      facingModeRef.current = preferredFacing;
      isOpenRef.current = true;
      setPunchType(targetType);
      setFacingMode(preferredFacing);
      setCameraError(null);
      setCameraErrorCode(null);
      setIsOpen(true);

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setCameraErrorCode('InsecureContext');
        setCameraError(
          'নিরাপদ HTTPS সংযোগ ছাড়া ব্রাউজার ক্যামেরা চালু করতে দেয় না। হাজিরা দিতে অনুগ্রহ করে HTTPS লিংক ব্যবহার করুন।'
        );
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraErrorCode('UnsupportedMediaDevices');
        setCameraError(
          'এই ব্রাউজারে ক্যামেরা সমর্থিত নয়। হাজিরা দিতে ক্যামেরাযুক্ত ডিভাইস ও আধুনিক ব্রাউজার (Chrome/Safari) ব্যবহার করুন।'
        );
        return;
      }

      const acquireStream = async (): Promise<MediaStream> => {
        const attempts: MediaStreamConstraints[] = [
          {
            video: { facingMode: { ideal: preferredFacing } },
            audio: false,
          },
          {
            video: true,
            audio: false,
          },
        ];

        let lastErr: unknown = null;
        for (let i = 0; i < attempts.length; i++) {
          try {
            return await navigator.mediaDevices.getUserMedia(attempts[i]);
          } catch (err) {
            lastErr = err;
            const errName = (err as { name?: string })?.name || '';
            // Do not blindly retry when permission or security policy explicitly denied camera access
            if (
              errName === 'NotAllowedError' ||
              errName === 'PermissionDeniedError' ||
              errName === 'SecurityError'
            ) {
              throw err;
            }
          }
        }
        throw lastErr;
      };

      try {
        const mediaStream = await acquireStream();

        // If user closed modal or triggered a newer request while waiting for permission, stop immediately
        if (reqId !== requestIdRef.current || !isOpenRef.current) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        const videoTracks = mediaStream.getVideoTracks();
        if (videoTracks.length === 0) {
          mediaStream.getTracks().forEach((t) => t.stop());
          setCameraErrorCode('NoVideoTrack');
          setCameraError('ডিভাইসের ক্যামেরা থেকে ভিডিও সিগন্যাল পাওয়া যায়নি। পুনরায় চেষ্টা করুন।');
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
      } catch (err: unknown) {
        if (reqId !== requestIdRef.current || !isOpenRef.current) return;

        const errorObj = err as { name?: string; message?: string } | undefined;
        const errName = errorObj?.name || 'CameraError';
        const errMsg = errorObj?.message || '';
        setCameraErrorCode(errName);

        const inIframe =
          typeof window !== 'undefined' &&
          (() => {
            try {
              return window.self !== window.top;
            } catch {
              return true;
            }
          })();

        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'SecurityError'
        ) {
          if (inIframe && errMsg.toLowerCase().includes('policy')) {
            setCameraError(
              'এই প্রিভিউ ফ্রেমে ক্যামেরা ব্লক করা আছে। অ্যাপটি নতুন ট্যাবে (অথবা আপনার লাইভ asdri-portal ওয়েব অ্যাড্রেসে) ওপেন করে ক্যামেরা Allow করুন।'
            );
          } else {
            setCameraError(
              'ক্যামেরা পারমিশন বন্ধ আছে। ব্রাউজারের অ্যাড্রেস বারের আইকন থেকে Camera "Allow" করুন (অথবা নতুন ট্যাবে ওপেন করুন), এরপর নিচের "পুনরায় ক্যামেরা চালু করুন" বাটনে ক্লিক করুন।'
            );
          }
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setCameraError('এই ডিভাইসে কোনো ক্যামেরা পাওয়া যায়নি। হাজিরা দিতে ক্যামেরাযুক্ত ডিভাইস ব্যবহার করুন।');
        } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
          setCameraError(
            'ক্যামেরাটি বর্তমানে অন্য কোনো অ্যাপ বা ব্রাউজার ট্যাবে ব্যবহৃত হচ্ছে। সেটি বন্ধ করে পুনরায় চেষ্টা করুন।'
          );
        } else {
          setCameraError('ক্যামেরা চালু করা যায়নি। অনুগ্রহ করে নিচের বাটনে ক্লিক করে পুনরায় চেষ্টা করুন।');
        }
      }
    },
    [stopStream]
  );

  const openCameraPunch = useCallback(
    async (targetType: 'IN' | 'OUT') => {
      await startCameraStream(targetType, 'environment');
    },
    [startCameraStream]
  );

  const retryCamera = useCallback(() => {
    void startCameraStream(punchTypeRef.current, facingModeRef.current);
  }, [startCameraStream]);

  const switchCamera = useCallback(() => {
    const nextFacing: FacingMode =
      facingModeRef.current === 'environment' ? 'user' : 'environment';
    void startCameraStream(punchTypeRef.current, nextFacing);
  }, [startCameraStream]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      isOpenRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleComplete = useCallback(
    (result: VerifiedPunchResult) => {
      closeScanner();
      onPunchResultRef.current?.(result);
    },
    [closeScanner]
  );

  return {
    scannerProps: {
      isOpen,
      punchType,
      stream,
      cameraError,
      cameraErrorCode,
      facingMode,
      onClose: closeScanner,
      onComplete: handleComplete,
      onRetryCamera: retryCamera,
      onSwitchCamera: switchCamera,
    },
    openCameraPunch,
    closeScanner,
  };
}

export function QrPunchScannerModal(props: QrPunchScannerModalProps) {
  if (!props.isOpen) return null;
  return <QrPunchScannerDialog {...props} />;
}

function QrPunchScannerDialog({
  punchType,
  stream,
  cameraError,
  cameraErrorCode,
  facingMode,
  onClose,
  onComplete,
  onRetryCamera,
  onSwitchCamera,
}: QrPunchScannerModalProps) {
  const { currentUser, policy, executeVerifiedPunch } = useApp();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [readyStream, setReadyStream] = useState<MediaStream | null>(null);
  const [playTapStream, setPlayTapStream] = useState<MediaStream | null>(null);

  const videoReady = Boolean(stream && readyStream === stream);
  const needsPlayTap = Boolean(stream && playTapStream === stream);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingScanRef = useRef<boolean>(false);
  const lastScanTsRef = useRef<number>(0);

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

        const result = await executeVerifiedPunch({
          employeeId: currentUser.id,
          punchType,
          lat,
          lng,
          accuracy,
          qrToken: cleaned,
        });

        if (result.ok) {
          onComplete(result);
        } else {
          setInlineError(result.message);
          processingScanRef.current = false;
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [currentUser.id, executeVerifiedPunch, onComplete, policy.requireGpsVerification, punchType]
  );

  // Keep latest submitToken in ref so parent clock re-renders NEVER tear down the live camera feed!
  const submitTokenRef = useRef(submitToken);
  useEffect(() => {
    submitTokenRef.current = submitToken;
  }, [submitToken]);

  // Attach MediaStream cleanly once per stream change and scan frames at a smooth mobile-safe rate
  useEffect(() => {
    if (!stream) return;

    const video = videoRef.current;
    if (!video) return;

    processingScanRef.current = false;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('muted', 'true');

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    let active = true;
    let markedReady = false;
    let detectorInstance: {
      detect: (src: unknown) => Promise<Array<{ rawValue: string }>>;
    } | null = null;

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const BD = (
          window as unknown as {
            BarcodeDetector: new (opts: { formats: string[] }) => {
              detect: (src: unknown) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;
        detectorInstance = new BD({ formats: ['qr_code'] });
      } catch {
        detectorInstance = null;
      }
    }

    const markReady = () => {
      if (!active || markedReady) return;
      markedReady = true;
      setReadyStream(stream);
      setPlayTapStream(null);
    };

    const scanLoop = async (timestamp: number) => {
      if (!active) return;

      const v = videoRef.current;
      const canvas = canvasRef.current;

      if (
        !processingScanRef.current &&
        v &&
        canvas &&
        v.readyState >= v.HAVE_CURRENT_DATA &&
        v.videoWidth > 0 &&
        v.videoHeight > 0
      ) {
        markReady();

        // Throttle frame decoding to ~8 FPS so mobile CPUs never stall or drop video frames
        if (timestamp - lastScanTsRef.current >= 120) {
          lastScanTsRef.current = timestamp;
          let detected: string | null = null;

          if (detectorInstance) {
            try {
              const codes = await detectorInstance.detect(v);
              if (codes?.[0]?.rawValue) {
                detected = codes[0].rawValue.trim();
              }
            } catch {
              // Fallback to jsQR
            }
          }

          if (!detected) {
            const maxDim = 640;
            const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
            const targetW = Math.max(160, Math.round(v.videoWidth * scale));
            const targetH = Math.max(120, Math.round(v.videoHeight * scale));
            if (canvas.width !== targetW) canvas.width = targetW;
            if (canvas.height !== targetH) canvas.height = targetH;

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, targetW, targetH);
              const imageData = ctx.getImageData(0, 0, targetW, targetH);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'attemptBoth',
              });
              if (code?.data) {
                detected = code.data.trim();
              }
            }
          }

          if (detected && active) {
            await submitTokenRef.current(detected);
            if (!active) return;
          }
        }
      }

      if (active) {
        rafRef.current = requestAnimationFrame(scanLoop);
      }
    };

    const tryStartPlayback = () => {
      if (!active || !videoRef.current) return;
      videoRef.current
        .play()
        .then(() => {
          if (!active) return;
          setPlayTapStream(null);
          if (videoRef.current && videoRef.current.videoWidth > 0) {
            markReady();
          }
        })
        .catch(() => {
          if (!active) return;
          setPlayTapStream(stream);
        });
    };

    const handleLoadedMetadata = () => {
      if (!active) return;
      tryStartPlayback();
    };

    const handlePlaying = () => {
      if (!active) return;
      markReady();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('playing', handlePlaying);

    tryStartPlayback();
    rafRef.current = requestAnimationFrame(scanLoop);

    return () => {
      active = false;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('playing', handlePlaying);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  const handleManualPlayTap = () => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video
      .play()
      .then(() => {
        setPlayTapStream(null);
        setReadyStream(stream);
      })
      .catch(() => {
        onRetryCamera?.();
      });
  };

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
          <div className="flex items-center gap-1">
            {stream && !cameraError && onSwitchCamera && (
              <button
                type="button"
                onClick={onSwitchCamera}
                title={facingMode === 'environment' ? 'ফ্রন্ট ক্যামেরায় যান' : 'ব্যাক ক্যামেরায় যান'}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
                <span>ঘোরান</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Camera Viewport — keep <video> mounted whenever no error so stream attaches immediately */}
          {!cameraError ? (
            <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[4/3] border border-slate-200">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {stream && videoReady && !needsPlayTap && (
                <div className="absolute inset-6 border-2 border-dashed border-emerald-400/80 rounded-xl pointer-events-none flex items-end justify-center pb-2">
                  <span className="text-[11px] bg-black/70 text-white px-2.5 py-0.5 rounded">
                    অফিসের QR কোডের দিকে ধরুন
                  </span>
                </div>
              )}

              {(!stream || (!videoReady && !needsPlayTap)) && (
                <div className="absolute inset-0 bg-slate-900/90 text-slate-200 flex flex-col items-center justify-center gap-2 text-xs">
                  <Camera className="w-6 h-6 text-emerald-400 animate-pulse" />
                  <span>ক্যামেরা চালু হচ্ছে...</span>
                </div>
              )}

              {needsPlayTap && stream && (
                <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-3 p-4 text-center">
                  <p className="text-xs text-slate-200">
                    ক্যামেরা প্রিভিউ শুরু করতে নিচের বাটনে ট্যাপ করুন
                  </p>
                  <button
                    type="button"
                    onClick={handleManualPlayTap}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>ক্যামেরা চালু করুন</span>
                  </button>
                </div>
              )}

              {isSubmitting && (
                <div className="absolute inset-0 bg-emerald-950/75 flex flex-col items-center justify-center text-white text-xs gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-300" />
                  <span>যাচাই করা হচ্ছে...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="leading-relaxed">{cameraError}</p>
                  {cameraErrorCode && (
                    <p className="text-[10px] font-mono text-amber-700/80">
                      কোড: {cameraErrorCode}
                    </p>
                  )}
                </div>
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
          )}

          {/* Inline Error Feedback */}
          {inlineError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
              {inlineError}
            </div>
          )}

          {/* Camera-Only Policy Note */}
          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            নিরাপত্তার স্বার্থে শুধুমাত্র অফিসের স্ক্রিনে প্রদর্শিত QR কোড ক্যামেরা দিয়ে স্ক্যান করেই Punch In / Out সম্পন্ন করা যাবে।
          </p>
        </div>
      </div>
    </div>
  );
}
