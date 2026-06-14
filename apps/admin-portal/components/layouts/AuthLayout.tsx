'use client';

import * as React from 'react';
import { GlassCard } from "@repo/ui";
import { cn } from "@repo/ui/lib/utils";
import { Montserrat } from 'next/font/google';


import { ShieldCheck } from 'lucide-react';

const montserrat = Montserrat({ subsets: ['latin'] });

interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[60fr_40fr] bg-background selection:bg-accent/30">
      {/* Left Panel: Auth Form */}
      <div className="relative flex items-center justify-center p-6 lg:p-12 overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px]" />
        
        <div className="w-full max-w-[400px] z-10 animate-fade-up">
          <div className="mb-12 flex flex-col items-center lg:items-start">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-display font-extrabold tracking-tight">
                Scrolloop <span className="text-accent">Sentry</span>
              </span>
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1" />
            </div>
          </div>
          
          <GlassCard tier={2} className="p-8 lg:p-10">
            {children}
          </GlassCard>
          
          <div className="mt-8 text-center lg:text-left">
            <p className="text-[11px] font-display font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
              Scrolloop Sentry &middot; Enterprise Identity
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel: Editorial/Decorative */}
      <div className="hidden lg:flex flex-col justify-between p-16 bg-[#1A1916] relative overflow-hidden">
        {/* Radial Gradient Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_#0D0C0B_100%)]" />

        
        <div className="relative z-10 flex flex-col items-center justify-center flex-1">
          <div className="w-24 h-24 rounded-full bg-accent/10 backdrop-blur-xl border border-accent/20 flex items-center justify-center animate-scale-in">
            <ShieldCheck className="w-10 h-10 text-accent" strokeWidth={1.5} />
          </div>
        </div>

        <div className="relative z-10 space-y-4 max-w-sm">
          <blockquote className="text-3xl font-display font-light italic text-[#F5F4F2] leading-tight tracking-tight">
            "Identity, <br />
            engineered for <br />
            trust."
          </blockquote>
          <div className="flex items-center gap-3 pt-4">
            <div className="w-8 h-px bg-accent/50" />
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-accent/80">
              Authentication Redefined
            </p>
          </div>
        </div>
        
        {/* Subtle texture/noise could go here */}
      </div>
    </div>
  );
}
