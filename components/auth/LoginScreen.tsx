'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { resolveInstitutionLogo } from '@/lib/initial-data';
import {
  User,
  KeyRound,
  LogIn,
  Eye,
  EyeOff,
} from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

export function LoginScreen() {
  const { employees, login, signInWithGoogleAccount, policy } = useApp();
  const activeLogoUrl = resolveInstitutionLogo(policy.institutionLogoUrl);

  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [infoMsg, setInfoMsg] = useState<string>('');
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('অনুগ্রহ করে আপনার আইডি/ইমেইল/মোবাইল নম্বর এবং পাসওয়ার্ড লিখুন।');
      return;
    }

    setLoginLoading(true);
    try {
      const success = await login(identifier, password);
      if (!success) {
        setErrorMsg(
          'আইডি/ইমেইল/মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়। (নতুন ডিভাইস হলে নিশ্চিত হোন অ্যাডমিন আপনার তথ্য ক্লাউডে সিঙ্ক করেছেন।)'
        );
      }
    } catch {
      setErrorMsg('লগইন যাচাই করতে সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogleAccount();
      if (result && !result.matchedEmployee) {
        const blockedEmail = result.unauthorizedEmail || result.user?.email || 'এই ইমেইল';
        setErrorMsg(
          `প্রবেশ অনুমোদিত নয়: (${blockedEmail}) ইমেইলটি এখনো অ্যাডমিনের "শিক্ষক ও স্টাফ" তালিকায় যুক্ত নেই। নিরাপত্তার স্বার্থে অ্যাকাউন্টটি সাথে সাথে লগআউট করা হয়েছে। অ্যাডমিন আপনার ইমেইল যুক্ত করে ক্লাউডে সিঙ্ক করার পর পুনরায় চেষ্টা করুন।`
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
          {activeLogoUrl ? (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-slate-200 p-2 shadow-2xs overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeLogoUrl}
                alt="Institution Logo"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-900 text-amber-400 border border-amber-500/40 font-bold text-2xl">
              আ
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-900">
            আস-সুন্নাহ দাওয়াহ অ্যান্ড রিসার্চ ইনস্টিটিউট
          </h1>
          <p className="text-xs text-slate-500">
            শিক্ষক ও স্টাফ লগইন পোর্টাল
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs border border-rose-200 font-medium leading-relaxed">
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="p-3 rounded-lg bg-sky-50 text-sky-900 text-xs border border-sky-200 font-medium leading-relaxed">
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
            disabled={loginLoading || googleLoading}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-900 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogIn className="w-4 h-4 text-amber-300" />
            <span>{loginLoading ? 'যাচাই হচ্ছে...' : 'লগইন করুন'}</span>
          </button>
        </form>

        {/* Official Google Sign-In */}
        <div className="space-y-3">
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="px-2.5 text-[11px] text-slate-400 bg-white">
              অথবা নিবন্ধিত Google ইমেইল দিয়ে
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
              <strong>প্রবেশ নির্দেশনা:</strong> অ্যাডমিনের দেওয়া নির্ধারিত আইডি/মোবাইল ও পাসওয়ার্ড দিয়ে যেকোনো ডিভাইস থেকে সরাসরি লগইন করতে পারবেন, অথবা নিবন্ধিত Google ইমেইল দিয়ে <span className="font-semibold">Sign in with Google</span> ব্যবহার করুন।
            </div>
          ) : (
            <div>
              <strong>লগইন নির্দেশনা:</strong> আপনার প্রতিষ্ঠানের নির্ধারিত আইডি/ইমেইল/মোবাইল ও পাসওয়ার্ড অথবা নিবন্ধিত Google অ্যাকাউন্ট দিয়ে প্রবেশ করুন। তালিকার বাইরের কোনো ইমেইল প্রবেশাধিকার পাবে না।
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
