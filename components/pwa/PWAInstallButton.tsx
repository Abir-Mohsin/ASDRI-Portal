'use client';

import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/lib/usePWAInstall';
import { useApp } from '@/lib/store';
import { resolveInstitutionLogo } from '@/lib/initial-data';

interface PWAInstallButtonProps {
  variant?: 'header' | 'drawer';
  onAfterClick?: () => void;
}

export function PWAInstallButton({ variant = 'header', onAfterClick }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { policy } = useApp();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;
  if (!isInstallable && !isIOS) return null;

  const activeLogoUrl = resolveInstitutionLogo(policy.institutionLogoUrl);

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      onAfterClick?.();
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'drawer' ? (
        <button
          type="button"
          onClick={handleClick}
          className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-emerald-950 bg-amber-400 hover:bg-amber-300 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>অ্যাপ হিসেবে ইনস্টল করুন</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title="অ্যাপ হিসেবে ইনস্টল করুন"
          className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">অ্যাপ ইনস্টল</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-800" />
                <h3 className="text-sm font-bold">iPhone / iPad-এ অ্যাপ ইনস্টল</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                aria-label="বন্ধ করুন"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-1.5 py-2">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-md p-2 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeLogoUrl}
                  alt="ASDRI Portal App Icon"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-[11px] font-bold text-slate-700">ASDRI Portal</span>
            </div>

            <ol className="text-xs text-slate-700 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                Safari ব্রাউজারের নিচে{' '}
                <span className="inline-flex items-center gap-1 font-bold text-emerald-900">
                  <Share className="w-3.5 h-3.5 inline" /> Share
                </span>{' '}
                বাটনে ট্যাপ করুন।
              </li>
              <li>
                তালিকা থেকে <strong>Add to Home Screen</strong> নির্বাচন করুন।
              </li>
              <li>
                উপরে ডানে <strong>Add</strong> বাটনে ট্যাপ করলেই আপনার প্রতিষ্ঠানের লোগোসহ অ্যাপটি হোম স্ক্রিনে যুক্ত হবে।
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-xl bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
            >
              বুঝেছি
            </button>
          </div>
        </div>
      )}
    </>
  );
}
