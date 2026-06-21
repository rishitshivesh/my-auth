'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@scrolloop/sdk';
import { authClient } from '@/lib/auth-client';
import { ChevronDown, Building2, Plus } from 'lucide-react';

interface OrgMembership {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  isGuest: boolean;
  logoUrl?: string;
}

export function TenantSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const { data: orgs = [] } = useQuery<OrgMembership[]>({
    queryKey: ['user', 'orgs'],
    queryFn: () => authClient.getUserOrgs(),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Derive current org from JWT claims (no extra fetch needed)
  const claims = authClient.getTokenClaims();
  const currentSlug = (claims?.tenantSlug as string) ?? '';
  const currentOrg = orgs.find((o) => o.slug === currentSlug) ?? orgs[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!currentOrg) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-1 border border-border/40">
        <div className="w-6 h-6 rounded bg-accent/20 animate-pulse" />
        <div className="w-24 h-3 rounded bg-black/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-1 hover:bg-surface-2 border border-border/40 transition-all"
      >
        {currentOrg.logoUrl ? (
          <img
            src={currentOrg.logoUrl}
            alt={currentOrg.name}
            className="w-6 h-6 rounded object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded bg-accent text-white text-[10px] font-bold font-mono shrink-0">
            {currentOrg.name.charAt(0).toUpperCase()}
          </div>
        )}

        <span className="text-sm font-medium text-text-primary max-w-[140px] truncate">
          {currentOrg.name}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 text-text-tertiary transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-64 rounded-xl bg-surface-3 border border-border/40 shadow-xl z-50 overflow-hidden">
          <div className="p-1.5">
            {orgs.map((org) => {
              const isActive = org.slug === currentSlug;
              return (
                <button
                  key={org.tenantId}
                  onClick={() => {
                    setOpen(false);
                    if (!isActive) {
                      router.push(`/t/${org.slug}/dashboard`);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-accent-soft text-accent'
                      : 'text-text-primary hover:bg-surface-1'
                  }`}
                >
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={org.name}
                      className="w-7 h-7 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded text-xs font-bold font-mono shrink-0 ${
                        isActive ? 'bg-accent text-white' : 'bg-accent/10 text-accent'
                      }`}
                    >
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{org.name}</div>
                    <div className="text-[11px] text-text-tertiary capitalize flex items-center gap-1">
                      {org.role}
                      {org.isGuest && (
                        <span className="px-1 py-0.5 rounded text-[9px] bg-warning/10 text-warning font-medium">
                          Guest
                        </span>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border/40 p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                router.push('/onboarding');
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-1 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
