'use client';

import React, { useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { resolveInstitutionLogo } from '@/lib/initial-data';
import {
  Bell,
  Calendar,
  CheckCheck,
  Clock,
  Download,
  FileText,
  ImagePlus,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { getRoleLabel, isAdministrativeRole } from '@/lib/types';
import { PWAInstallButton } from '@/components/pwa/PWAInstallButton';
import { downloadDataUrlFile, generatePwaIconSetFromLogo } from '@/lib/pwa-icon-generator';

export function Header() {
  const {
    currentUser,
    activeNav,
    setActiveNav,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    setFocusedMeetingId,
    unreadChatCount,
    setActiveChatConversationId,
    logout,
    policy,
    updatePolicy,
  } = useApp();

  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [logoUrlInput, setLogoUrlInput] = useState(
    resolveInstitutionLogo(policy.institutionLogoUrl)
  );
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = isAdministrativeRole(currentUser.role);
  const activeLogoUrl = resolveInstitutionLogo(policy.institutionLogoUrl);

  const openLogoModal = () => {
    setLogoUrlInput(resolveInstitutionLogo(policy.institutionLogoUrl));
    setLogoError(null);
    setShowLogoModal(true);
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const img = new window.Image();
      img.onload = () => {
        const trySizes = [512, 384, 288, 220];
        let bestDataUrl = '';
        for (const maxDim of trySizes) {
          const canvas = document.createElement('canvas');
          let w = img.width || maxDim;
          let h = img.height || maxDim;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.clearRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          const candidate = canvas.toDataURL('image/png');
          bestDataUrl = candidate;
          if (candidate.length <= 140000) {
            break;
          }
        }
        setLogoUrlInput(bestDataUrl || dataUrl);
      };
      img.onerror = () => {
        setLogoError('সঠিক ছবির ফাইল (PNG, JPG, SVG বা WEBP) নির্বাচন করুন।');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = (e: React.FormEvent) => {
    e.preventDefault();
    updatePolicy({
      institutionLogoUrl: logoUrlInput.trim(),
    });
    setShowLogoModal(false);
  };

  const handleDownloadStaticPwaIcons = async () => {
    const targetLogo = logoUrlInput.trim() || activeLogoUrl;
    const iconSet = await generatePwaIconSetFromLogo(targetLogo);
    if (!iconSet.isCanvasRendered) {
      setLogoError('বাহ্যিক লিংক থেকে সরাসরি PNG তৈরি করা যায়নি। অনুগ্রহ করে লোগো ফাইলটি সরাসরি আপলোড করুন।');
      return;
    }
    const files = [
      { url: iconSet.icon192, name: 'pwa-192x192.png' },
      { url: iconSet.icon512, name: 'pwa-512x512.png' },
      { url: iconSet.iconMaskable512, name: 'pwa-maskable-512x512.png' },
      { url: iconSet.icon180, name: 'apple-touch-icon.png' },
    ];
    files.forEach((f, idx) => {
      window.setTimeout(() => {
        downloadDataUrlFile(f.url, f.name);
      }, idx * 200);
    });
  };

  const myNotifications = notifications.filter(
    (n) => n.recipientEmployeeId === currentUser.id
  );
  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  const navItems = [
    { id: 'workspace', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
    { id: 'action-tracker', label: 'সিদ্ধান্ত ও কাজ ট্র্যাকার', icon: ListChecks },
    { id: 'meetings', label: 'মিটিং ও কার্যবিবরণী', icon: Video },
    { id: 'attendance', label: 'উপস্থিতি ও পাঞ্চ', icon: Clock },
    { id: 'leaves', label: 'ছুটি ব্যবস্থাপনা', icon: FileText },
    { id: 'calendar', label: 'বার্ষিক ক্যালেন্ডার', icon: Calendar },
    { id: 'chat', label: 'অভ্যন্তরীণ চ্যাট', icon: MessageSquare },
    ...(isAdministrativeRole(currentUser.role)
      ? [{ id: 'employees', label: 'শিক্ষক ও স্টাফ', icon: Users }]
      : []),
  ] as const;

  const handleNotificationClick = (notifId: string, linkType: string, linkId?: string) => {
    markNotificationAsRead(notifId);
    setShowNotifDropdown(false);
    if (linkType === 'tracker') {
      setActiveNav('action-tracker');
    } else if (linkType === 'meeting') {
      if (linkId) setFocusedMeetingId(linkId);
      setActiveNav('meetings');
    } else if (linkType === 'leave') {
      setActiveNav('leaves');
    } else if (linkType === 'chat') {
      if (linkId) setActiveChatConversationId(linkId);
      setActiveNav('chat');
    } else if (linkType === 'task') {
      setActiveNav('workspace');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-emerald-950 text-white border-b border-emerald-900 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* Top Bar */}
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            {/* Mobile Left: Hamburger Button + Logo + Compact Name */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setShowMobileSidebar(true)}
                aria-label="মেনু খুলুন"
                className="relative md:hidden p-2 -ml-1 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 text-amber-300 border border-emerald-800 transition-colors cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-emerald-950" />
                )}
              </button>

              <div className="relative group shrink-0">
                {activeLogoUrl ? (
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-1 border border-amber-400/50 flex items-center justify-center overflow-hidden shadow-2xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeLogoUrl}
                      alt="Institution Logo"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-900 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-base sm:text-lg">
                    আ
                  </div>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openLogoModal}
                    title="প্রতিষ্ঠানের লোগো যুক্ত বা পরিবর্তন করুন"
                    className="hidden sm:flex absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 items-center justify-center shadow-xs border border-emerald-950 cursor-pointer"
                  >
                    <ImagePlus className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-base font-bold tracking-tight text-white truncate">
                  আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট
                </h1>
                <p className="text-[10px] sm:text-xs text-emerald-200/80 truncate hidden sm:block">
                  অভ্যন্তরীণ দাপ্তরিক ব্যবস্থাপনা ও সিদ্ধান্ত ট্র্যাকার পোর্টাল
                </p>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <PWAInstallButton variant="header" />

              {/* Notification Bell */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                  aria-label="নোটিফিকেশন"
                  className="relative p-2 rounded-lg bg-emerald-900/70 hover:bg-emerald-800 text-emerald-100 border border-emerald-800 transition-colors cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-14 sm:top-auto sm:mt-2 sm:w-80 bg-white text-slate-900 rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        নোটিফিকেশন ({unreadCount} অপঠিত)
                      </span>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllNotificationsAsRead(currentUser.id)}
                          className="text-[11px] font-semibold text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> সব পঠিত করুন
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {myNotifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          কোনো নোটিফিকেশন নেই
                        </div>
                      ) : (
                        myNotifications.slice(0, 12).map((n) => (
                          <button
                            key={n.id}
                            onClick={() => handleNotificationClick(n.id, n.linkType, n.linkId)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex flex-col gap-1 cursor-pointer ${
                              !n.isRead ? 'bg-emerald-50/50' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-800 line-clamp-1">
                                {n.title}
                              </span>
                              {!n.isRead && (
                                <span className="w-2 h-2 rounded-full bg-emerald-700 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 line-clamp-2">{n.message}</p>
                            <span className="text-[10px] text-slate-400">{n.createdAt}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Current User Badge (Desktop & Tablet) */}
              <div className="hidden md:flex items-center gap-2 pl-2 border-l border-emerald-800">
                <div className="text-right">
                  <div className="text-xs font-bold text-white leading-tight max-w-[160px] truncate">
                    {currentUser.nameBn || currentUser.name}
                  </div>
                  <div className="text-[10px] text-amber-300 font-medium">
                    {getRoleLabel(currentUser.role, true) || currentUser.designationBn}
                  </div>
                </div>
              </div>

              {/* Logout Button (Desktop; on mobile it is also inside the sidebar drawer) */}
              <button
                onClick={logout}
                title="লগআউট করুন"
                className="hidden sm:flex items-center gap-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-100 border border-rose-800/80 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">লগআউট</span>
              </button>
            </div>
          </div>

          {/* Desktop Navigation Bar (Hidden on mobile so mobile stays clean) */}
          <nav className="hidden md:flex items-center gap-1.5 py-2 border-t border-emerald-900/80 overflow-x-auto no-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                activeNav === item.id ||
                (item.id === 'calendar' && activeNav === 'calendar-policy');
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 shadow-2xs font-bold'
                      : 'text-emerald-100/90 hover:bg-emerald-900 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {item.id === 'chat' && unreadChatCount > 0 && (
                    <span
                      className={`ml-0.5 min-w-5 h-5 px-1.5 rounded-md text-[10px] font-extrabold tabular-nums inline-flex items-center justify-center ${
                        isActive
                          ? 'bg-emerald-950 text-amber-300'
                          : 'bg-amber-400 text-slate-950'
                      }`}
                    >
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Mobile Sidebar Drawer (Opens when clicking the Hamburger Menu button) */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            onClick={() => setShowMobileSidebar(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Sidebar Panel */}
          <aside className="relative z-10 w-72 max-w-[84vw] bg-white text-slate-900 h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Drawer Top Header */}
              <div className="p-4 bg-emerald-950 text-white border-b border-emerald-900">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white p-1 border border-amber-400/50 flex items-center justify-center overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeLogoUrl}
                        alt="Logo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        আস-সুন্নাহ ইনস্টিটিউট
                      </div>
                      <div className="text-[10px] text-emerald-200/80 truncate">
                        দাপ্তরিক ব্যবস্থাপনা পোর্টাল
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMobileSidebar(false)}
                    aria-label="মেনু বন্ধ করুন"
                    className="p-1.5 rounded-lg bg-emerald-900 text-emerald-100 hover:bg-emerald-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* User Profile Card inside Mobile Drawer */}
                <div className="mt-4 pt-3 border-t border-emerald-900/90 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {currentUser.nameBn || currentUser.name}
                    </div>
                    <div className="text-[11px] text-amber-300 font-medium truncate">
                      {getRoleLabel(currentUser.role, true) || currentUser.designationBn} ·{' '}
                      <span className="font-mono text-emerald-200">{currentUser.id}</span>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileSidebar(false);
                      openLogoModal();
                    }}
                    className="mt-3 w-full py-1.5 px-2.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-amber-300 border border-emerald-800 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>প্রতিষ্ঠানের লোগো পরিবর্তন করুন</span>
                  </button>
                )}
              </div>

              {/* Navigation Links */}
              <div className="px-3 py-3">
                <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  নেভিগেশন মেনু
                </div>
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      activeNav === item.id ||
                      (item.id === 'calendar' && activeNav === 'calendar-policy');
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveNav(item.id);
                          setShowMobileSidebar(false);
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2.5 cursor-pointer text-left ${
                          isActive
                            ? 'bg-emerald-900 text-white shadow-2xs'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-amber-300' : 'text-emerald-800'
                          }`}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.id === 'chat' && unreadChatCount > 0 && (
                          <span
                            className={`min-w-5 h-5 px-1.5 rounded-md text-[10px] font-extrabold tabular-nums inline-flex items-center justify-center ${
                              isActive
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-emerald-900 text-white'
                            }`}
                          >
                            {unreadChatCount > 99 ? '99+' : unreadChatCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Drawer Footer: Install & Logout */}
            <div className="p-3 border-t border-slate-200 bg-slate-50/60 space-y-2">
              <PWAInstallButton
                variant="drawer"
                onAfterClick={() => setShowMobileSidebar(false)}
              />
              <button
                type="button"
                onClick={() => {
                  setShowMobileSidebar(false);
                  logout();
                }}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>লগআউট করুন</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Institution Logo Upload / Update Modal (Admin Only) */}
      {isAdmin && showLogoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  প্রতিষ্ঠানের লোগো যুক্ত / পরিবর্তন করুন
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  লোগোটি হেডার, লগইন পেজ এবং মোবাইল/ডেস্কটপ অ্যাপ আইকন হিসেবে স্বয়ংক্রিয়ভাবে ব্যবহৃত হবে।
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
              <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex flex-col items-center justify-center gap-1.5">
                  {logoUrlInput ? (
                    <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 p-2 flex items-center justify-center overflow-hidden shadow-2xs">
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
                  <span className="text-[11px] text-slate-500">পোর্টাল লোগো</span>
                </div>

                <div className="flex flex-col items-center justify-center gap-1.5 border-l border-slate-200 pl-3">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 p-2 flex items-center justify-center overflow-hidden shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrlInput || '/icon.svg'}
                      alt="App Icon Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">
                    অ্যাপ আইকন প্রিভিউ
                  </span>
                </div>
              </div>

              {logoUrlInput && (
                <button
                  type="button"
                  onClick={handleDownloadStaticPwaIcons}
                  className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-800" />
                  <span>অ্যাপ আইকন ফাইল (PNG প্যাক) ডাউনলোড করুন</span>
                </button>
              )}

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
    </>
  );
}
