'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { DEFAULT_INSTITUTION_LOGO } from '@/lib/initial-data';
import {
  User,
  KeyRound,
  LogIn,
  Eye,
  EyeOff,
} from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

export function LoginScreen() {
  const { login, connectGoogleWorkspace, employees, policy } = useApp();
  const activeLogoUrl = policy.institutionLogoUrl || DEFAULT_INSTITUTION_LOGO;

  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [infoMsg, setInfoMsg] = useState<string>('');
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('অনুগ্রহ করে আপনার আইডি/ইমেইল/মোবাইল নম্বর এবং পাসওয়ার্ড লিখুন।');
      return;
    }

    const success = login(identifier, password);
    if (!success) {
      setErrorMsg('আইডি/ইমেইল/মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।');
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setGoogleLoading(true);
    try {
      const result = await connectGoogleWorkspace();
      if (result?.user?.email && !result.matchedEmployee) {
        setInfoMsg(
          `Google অ্যাকাউন্ট (${result.user.email}) যাচাই হয়েছে, তবে এই ইমেইলটি এখনো কোনো ASDRI আইডিতে যুক্ত বা ক্লাউডে সিঙ্ক হয়নি। অনুগ্রহ করে অ্যাডমিন হিসেবে "শিক্ষক ও স্টাফ" মেনু থেকে আইডিতে এই ইমেইলটি যোগ করে ক্লাউডে সিঙ্ক করুন, অথবা আপনার আইডি ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।`
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Google Sign-In সম্পন্ন হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 text-slate-900 p-4 font-serif">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-white border border-slate-200 p-1.5 shadow-2xs overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeLogoUrl}
              alt="আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট লোগো"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট
          </h1>
          <p className="text-xs text-slate-500">
            শিক্ষক ও স্টাফ লগইন পোর্টাল
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs border border-rose-200 font-medium">
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="p-3 rounded-lg bg-sky-50 text-sky-900 text-xs border border-sky-200 font-medium">
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          {/* Identifier Input: ID / Email / Mobile */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              আইডি / ইমেইল / মোবাইল নম্বর
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="আইডি, ইমেইল বা মোবাইল নম্বর লিখুন"
                className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              পাসওয়ার্ড
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="আপনার পাসওয়ার্ড লিখুন"
                className="w-full pl-9 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-700"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogIn className="w-4 h-4 text-amber-300" />
            <span>লগইন করুন</span>
          </button>
        </form>

        {/* Official Google Sign-In */}
        <div className="space-y-3">
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="px-2.5 text-[11px] text-slate-400 bg-white">
              অথবা Google অ্যাকাউন্ট দিয়ে
            </span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <GoogleSignInButton
            onClick={handleGoogleLogin}
            loading={googleLoading}
            fullWidth
            label="Sign in with Google"
          />
        </div>

        {/* Clean Info Note */}
        <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5 leading-relaxed">
          {employees.length === 0 ? (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
              <strong>প্রথমবার সেটআপ:</strong> এখনো কোনো শিক্ষক বা স্টাফ যুক্ত নেই। সুপার এডমিন হিসেবে প্রবেশ করতে উপরে{' '}
              <span className="font-semibold">Sign in with Google</span>-এ ক্লিক করুন এবং ভেতরে গিয়ে ম্যানুয়ালি সবার নাম ও তথ্য যুক্ত করুন।
            </div>
          ) : (
            <div>
              <strong>লগইন নির্দেশনা:</strong> আপনার প্রতিষ্ঠানের নির্ধারিত আইডি/ইমেইল ও পাসওয়ার্ড অথবা নিবন্ধিত Google অ্যাকাউন্ট দিয়ে প্রবেশ করুন।
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
