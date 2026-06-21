/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Smartphone, Laptop, Sparkles, Orbit, SmartphoneIcon } from 'lucide-react';

interface MobileFrameProps {
  children: React.ReactNode;
}

export default function MobileFrame({ children }: MobileFrameProps) {
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  useEffect(() => {
    const checkSize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  if (isMobileScreen) {
    return <div className="w-full h-screen bg-slate-50 text-slate-900">{children}</div>;
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col md:flex-row items-center justify-center p-4 gap-8 font-sans select-none overflow-hidden radial-bg">
      {/* Decorative ambient blurred backgrounds */}
      <div className="absolute top-1/4 -left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[150px] pointer-events-none" />

      {/* Info Panel explaining the mobile focus */}
      <div className="max-w-xs text-left hidden lg:flex flex-col gap-5 text-slate-300 z-10 p-4 animate-fade-in">
        <div className="inline-flex items-center gap-2 text-indigo-400 bg-indigo-950/50 px-3 py-1.5 rounded-full border border-indigo-800/30 text-xs font-semibold w-fit">
          <Sparkles className="w-4.5 h-4.5 animate-pulse" />
          Mobile Only Architecture
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white font-sans italic">
            dranfrean
          </h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1 font-mono">
            Skeletal 2D Animation Kit
          </p>
        </div>
        <p className="text-sm leading-relaxed text-slate-400 font-sans">
          This system is custom-engineered exclusively for **mobile touchscreens**. Desktop mode is deactivated to optimize low-latency touch calculations.
        </p>

        <div className="border border-slate-800/50 bg-slate-900/50 p-3.5 rounded-2xl flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            Interactive Simulation
          </div>
          <p className="text-xs text-slate-400">
            Use this fully functional phone viewport mock to rig, animate, keyframe, and test video exports exactly like on an actual device.
          </p>
        </div>

        <div className="text-[11px] font-mono text-slate-500">
          UTC: 2026-06-18
        </div>
      </div>

      {/* Simulated Device Frame */}
      <div className="relative flex flex-col items-center justify-center z-10">
        {/* Shadow & Chassis reflection glow */}
        <div className="absolute inset-0 bg-indigo-500/5 rounded-[52px] blur-3xl scale-105 pointer-events-none" />

        {/* Outer Phone Ring */}
        <div className="relative w-[390px] h-[844px] max-h-[92vh] rounded-[52px] border-[14px] border-slate-900 bg-slate-950 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] outline-none flex flex-col overflow-hidden">
          {/* Dynamic Notch / Speaker Island */}
          <div className="absolute top-0 inset-x-0 h-8 flex justify-center items-start z-50 pointer-events-none">
            <div className="bg-slate-900 h-5 w-32 rounded-b-2xl flex items-center justify-between px-4">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-950/80 border border-slate-800/20" />
              <span className="w-12 h-1 rounded-full bg-slate-950/60" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/20" />
            </div>
          </div>

          {/* Time & Battery Status bar */}
          <div className="absolute top-1.5 inset-x-0 px-6 flex justify-between items-center text-[11.5px] font-semibold text-slate-900 z-40 font-sans pointer-events-none mix-blend-difference select-none">
            <div>11:19</div>
            <div className="flex items-center gap-1.5">
              <span>LTE</span>
              <div className="w-[18px] h-[9.5px] border border-white/80 rounded-sm p-[0.5px] flex items-center">
                <div className="w-full h-full bg-white rounded-2xs" />
              </div>
            </div>
          </div>

          {/* Phone Screen App Container */}
          <div className="w-full h-full bg-white select-text pt-6 pb-4 overflow-y-auto overflow-x-hidden relative flex flex-col">
            {children}
          </div>

          {/* Bottom virtual home indicator pill */}
          <div className="absolute bottom-1 inset-x-0 h-4 flex justify-center items-center pointer-events-none z-50">
            <div className="w-32 h-1.5 bg-slate-800 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
