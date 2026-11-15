'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { DEFAULT_INSTITUTION_LOGO } from '@/lib/initial-data';
import {
  isAdministrativeRole,
  isDepartmentLeader,
  getRoleLabel,
} from '@/lib/types';
import {
  LayoutDashboard,
  CalendarCheck,
  CheckSquare,
  FileText,
  Users,
  LogOut,
  Calendar,
  CalendarDays,
  Bell,
  Check,
  ImagePlus,
  Upload,
  Trash2,
  X,
} from 'lucide-react';

export function Header() {
  const {
    currentUser,
    activeNav,
    setActiveNav,
    logout,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    policy,
    updatePolicy,
  } = useApp();

  const role = currentUser.role;
  const isAdmin = isAdministrativeRole(role);
  const isLeader = isDepartmentLeader(role);
  const activeLogoUrl = policy.institutionLogoUrl || DEFAULT_INSTITUTION_LOGO;

  const [showLogoModal, setShowLogoModal] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);

    if (!file.type.startsWith('image/')) {
      setLogoError('অনুগ্রহ করে একটি সঠিক ছবি ফাইল (PNG, JPG, SVG বা WebP) নির্বাচন করুন।');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = typeof reader.result === 'string' ? reader.result : '';
      if (!resultStr) return;

      const img = new window.Image();
      img.onload = () => {
        const maxDim = 180;
        let w = img.width || 180;
        let h = img.height || 180;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/png', 0.92);
          setLogoUrlInput(compressedDataUrl);
        } else {
          setLogoUrlInput(resultStr);
        }
      };
      img.onerror = () => {
        setLogoUrlInput(resultStr);
      };
      img.src = resultStr;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = (e: React.FormEvent) => {
    e.preventDefault();
    updatePolicy({ institutionLogoUrl: logoUrlInput.trim() || DEFAULT_INSTITUTION_LOGO });
    setShowLogoModal(false);
  };

  // Notifications for the current user
  const myNotifications = notifications.filter((n) => n.recipientEmployeeId === currentUser.id);
  const unreadCount = myNotifications.filter((n) => !n.isRead).length;
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scoped Navigation Tabs
  const navItems = [
    {
      id: 'workspace',
      label: isAdmin ? 'ড্যাশবোর্ড' : 'আমার ড্যাশবোর্ড',
      icon: LayoutDashboard,
      show: true,
    },
    {
      id: 'action-tracker',
      label: isAdmin || isLeader ? 'সিদ্ধান্ত ও কাজ' : 'আমার কাজ ও জমা',
      icon: CheckSquare,
      show: true,
    },
    {
      id: 'meetings',
      label: 'মিটিং মিনিটস',
      icon: FileText,
      show: isAdmin || isLeader,
    },
    {
      id: 'attendance',
      label: 'উপস্থিতি',
      icon: CalendarCheck,
      show: true,
    },
    {
      id: 'leaves',
      label: 'ছুটি',
      icon: Calendar,
      show: true,
    },
    {
      id: 'calendar',
      label: 'বার্ষিক ক্যালেন্ডার',
      icon: CalendarDays,
      show: true,
    },
    {
      id: 'employees',
      label: 'শিক্ষক ও স্টাফ',
      icon: Users,
      show: isAdmin,
    },
  ].filter((item) => item.show);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-2xs font-serif">
      <div className="h-1 bg-emerald-900" />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 sm:gap-3 h-14 sm:h-15">
          {/* Brand + Compact Desktop Navigation Grouped Together */}
          <div className="flex items-center gap-2 lg:gap-4 min-w-0">
            <div className="flex items-center gap-1 min-w-0 shrink">
              <button
                onClick={() => setActiveNav('workspace')}
                className="text-left flex items-center gap-2 cursor-pointer min-w-0 shrink focus:outline-none"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-white border border-slate-200 p-0.5 flex items-center justify-center overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeLogoUrl}
                    alt="ASDRI Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-sm sm:text-base font-bold text-slate-900 block leading-tight truncate">
                    ASDRI Portal
                  </span>
                  <span className="hidden lg:block text-[10px] text-slate-500 leading-tight truncate">
                    আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট
                  </span>
                </div>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoUrlInput(activeLogoUrl);
                    setLogoError(null);
                    setShowLogoModal(true);
                  }}
                  title="প্রতিষ্ঠানের লোগো যুক্ত বা পরিবর্তন করুন"
                  className="p-1 rounded-md text-slate-400 hover:text-emerald-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="hidden md:block h-5 w-px bg-slate-200 shrink-0" />

            {/* Direct Navigation (Desktop) - Compact spacing */}
            <nav className="hidden md:flex items-center gap-0.5 bg-slate-50/80 p-1 rounded-xl border border-slate-200/80">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeNav === item.id || (item.id === 'calendar' && activeNav === 'calendar-policy');
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-emerald-900 text-white shadow-2xs'
                        : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-300' : 'text-emerald-800'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Controls: Notification + Logged-in User Display + Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                title="নোটিফিকেশন"
                className="relative p-2 text-slate-600 hover:text-emerald-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center text-[9px] font-bold font-mono text-white bg-amber-600 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="fixed inset-x-3 top-16 sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-xs">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900">নোটিফিকেশন ({unreadCount} নতুন)</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllNotificationsAsRead(currentUser.id)}
                        className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                      >
                        <Check className="w-3 h-3" />
                        <span>সব পঠিত</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {myNotifications.length === 0 ? (
                      <div className="py-6 text-center text-slate-400">
                        কোনো নতুন বিজ্ঞপ্তি নেই।
                      </div>
                    ) : (
                      myNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => {
                            markNotificationAsRead(notif.id);
                            setShowNotifications(false);
                            setActiveNav('action-tracker');
                          }}
                          className={`p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-2.5 ${
                            !notif.isRead ? 'bg-amber-50/40' : ''
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                              !notif.isRead ? 'bg-amber-500' : 'bg-transparent'
                            }`}
                          />
                          <div className="flex-1 space-y-0.5">
                            <div className="font-semibold text-slate-900">{notif.title}</div>
                            <p className="text-[11px] text-slate-600 leading-relaxed">{notif.message}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Static Logged-in User Badge */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  role === 'super_admin'
                    ? 'bg-amber-500'
                    : isAdmin
                    ? 'bg-emerald-600'
                    : 'bg-blue-500'
                }`}
              />
              <div className="text-left leading-tight">
                <span className="font-bold text-slate-900 block max-w-[88px] sm:max-w-[130px] truncate">
                  {currentUser.nameBn || currentUser.name}
                </span>
                <span className="hidden sm:block text-[10px] text-slate-500 truncate max-w-[140px]">
                  {currentUser.id} · {getRoleLabel(currentUser.role, true)}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              title="লগআউট করুন"
              className="px-2 sm:px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">লগআউট</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Strip - Compact spacing */}
        <div className="flex md:hidden items-center gap-1 overflow-x-auto no-scrollbar py-1.5 border-t border-slate-100 -mx-3 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeNav === item.id || (item.id === 'calendar' && activeNav === 'calendar-policy');
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-900 text-white shadow-2xs'
                    : 'text-slate-700 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-300' : 'text-emerald-800'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Institutional Logo Upload / Setup Modal (Admins Only) */}
      {isAdmin && showLogoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  প্রতিষ্ঠানের লোগো যুক্ত / পরিবর্তন করুন
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  লোগোটি হেডার এবং লগইন পেজে সকলের জন্য প্রদর্শিত হবে।
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {logoError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                {logoError}
              </div>
            )}

            <form onSubmit={handleSaveLogo} className="space-y-4">
              {/* Preview */}
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50 border border-slate-200 gap-2">
                {logoUrlInput ? (
                  <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 p-2 flex items-center justify-center overflow-hidden shadow-2xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrlInput}
                      alt="Logo Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-emerald-900 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold text-2xl">
                    আ
                  </div>
                )}
                <span className="text-[11px] text-slate-500">লোগো প্রিভিউ</span>
              </div>

              {/* Upload from Device */}
              <div>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-emerald-700/40 hover:border-emerald-700 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-950 font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-emerald-800" />
                  <span>কম্পিউটার বা মোবাইল থেকে লোগো ছবি আপলোড করুন</span>
                </button>
              </div>

              {/* Or Direct URL */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  অথবা সরাসরি ছবির লিংক (URL) দিন
                </label>
                <input
                  type="text"
                  value={logoUrlInput.startsWith('data:') ? '' : logoUrlInput}
                  onChange={(e) => setLogoUrlInput(e.target.value)}
                  placeholder="যেমন: https://example.com/logo.png বা /logo.png"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-900 font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                {logoUrlInput ? (
                  <button
                    type="button"
                    onClick={() => setLogoUrlInput('')}
                    className="px-3 py-2 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>লোগো মুছুন</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoModal(false)}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-bold cursor-pointer"
                  >
                    লোগো সংরক্ষণ করুন
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
