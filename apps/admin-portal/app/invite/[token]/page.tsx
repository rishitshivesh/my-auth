'use client';

import * as React from 'react';
import { AuthLayout } from '@/components/layouts/AuthLayout';
import { GlassCard, SentryButton, SentryInput } from "@repo/ui";

import { useValidateInvite, useAcceptInvite } from '@/lib/queries';
import { useParams, useRouter } from 'next/navigation';
import { UserPlus, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getErrorMessage } from "@/lib/api-error";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const { data: invite, isLoading: isValidating, isError } = useValidateInvite(token);
  const { mutate: acceptInvite, isPending: isAccepting } = useAcceptInvite();

  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    acceptInvite({ token, name, password }, {
      onSuccess: () => {
        setSuccess(true);
        const slug = invite?.tenantSlug;
        setTimeout(() => router.push(slug ? `/t/${slug}/dashboard` : '/u/login'), 2000);
      },
      onError: (err) => setError(getErrorMessage(err))
    });
  };

  if (isValidating) {
    return (
      <AuthLayout>
        <div className="py-12 flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-sm font-body text-muted-foreground">Validating your invitation...</p>
        </div>
      </AuthLayout>
    );
  }

  if (isError) {
    return (
      <AuthLayout>
        <div className="space-y-6 text-center py-8">
          <div className="flex justify-center">
             <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
               <AlertCircle className="w-10 h-10" strokeWidth={1.5} />
             </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-display font-semibold">Invitation Expired</h2>
            <p className="text-sm font-body text-muted-foreground">This link is no longer valid or has already been used.</p>
          </div>
          <SentryButton variant="ghost" className="w-full" onClick={() => router.push('/u/login')}>
            Back to Sign In
          </SentryButton>
        </div>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout>
        <div className="space-y-8 py-8 text-center animate-fade-up">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <CheckCircle2 className="w-10 h-10" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-display font-semibold">Welcome Aboard</h2>
            <p className="text-sm font-body text-muted-foreground">Your account has been created. Redirecting to your workspace...</p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="space-y-8 animate-fade-up">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-accent mb-2">
            <UserPlus className="w-4 h-4" />
            <span className="text-[10px] font-display font-bold uppercase tracking-wider">Join Workspace</span>
          </div>
          <h2 className="text-2xl font-display font-light text-foreground">
            Complete your profile
          </h2>
          <p className="text-sm font-body text-muted-foreground">
            You've been invited to join <span className="text-foreground font-semibold">{invite?.tenantName || 'a new workspace'}</span>.
          </p>
        </div>

        <div className="space-y-6">
          <SentryInput
            label="Full Name"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <SentryInput
            label="Create Password"
            type="password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText="Minimum 12 characters recommended"
          />

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 p-3 rounded-sm border border-destructive/20">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          <SentryButton
            type="submit"
            className="w-full"
            variant="accent"
            isLoading={isAccepting}
          >
            Create Account
          </SentryButton>
        </div>

        <p className="text-[10px] text-center text-muted-foreground font-body leading-relaxed">
          By joining, you agree to the workspace security policies and terms of service.
        </p>
      </form>
    </AuthLayout>
  );
}
