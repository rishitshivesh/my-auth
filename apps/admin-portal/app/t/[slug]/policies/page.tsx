'use client';

import * as React from 'react';
import { PortalLayout } from '@/components/layouts/portal-layout';
import {
  GlassCard,
  PageHeader,
  SentryButton,
  SentryInput,
  SentrySkeleton,
  StatusBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { Textarea } from '@repo/ui/components/ui/textarea';
import { cn } from "@repo/ui/lib/utils";
import {
  usePolicies,
  useCreatePolicy,
  useUpdatePolicy,
  useDeletePolicy,
  useSimulatePolicy,
} from '@/lib/queries';
import type { Policy, PolicyDocument } from '@/lib/types';
import {
  ScrollText,
  Plus,
  Search,
  ChevronRight,
  Lock,
  AlertTriangle,
  Info,
  Play,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const STARTER_DOCUMENT: PolicyDocument = {
  Version: '2024-01-01',
  Statement: [
    {
      Sid: 'AllowReadAccess',
      Effect: 'Allow',
      Action: ['users:read'],
      Resource: ['*'],
    },
  ],
};

export default function PoliciesPage() {
  const { data: policiesData, isLoading } = usePolicies();
  const policies = policiesData?.data ?? [];

  const [selectedPolicyId, setSelectedPolicyId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Create dialog
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState('');
  const [createDescription, setCreateDescription] = React.useState('');
  const [createType, setCreateType] = React.useState<'managed' | 'inline'>('managed');
  const [createDocumentStr, setCreateDocumentStr] = React.useState(JSON.stringify(STARTER_DOCUMENT, null, 2));
  const [createDocError, setCreateDocError] = React.useState('');

  // Edit mode
  const [isEditing, setIsEditing] = React.useState(false);
  const [editDocumentStr, setEditDocumentStr] = React.useState('');
  const [editDocError, setEditDocError] = React.useState('');

  // Delete dialog
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);

  // Simulate section
  const [showSimulate, setShowSimulate] = React.useState(false);
  const [simUserId, setSimUserId] = React.useState('');
  const [simAction, setSimAction] = React.useState('');
  const [simResource, setSimResource] = React.useState('*');

  const createPolicy = useCreatePolicy();
  const updatePolicy = useUpdatePolicy();
  const deletePolicy = useDeletePolicy();
  const simulate = useSimulatePolicy();

  const filteredPolicies = policies.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedPolicy = policies.find(p => p.id === selectedPolicyId) ?? filteredPolicies[0] ?? policies[0];

  React.useEffect(() => {
    if (policies.length > 0 && !selectedPolicyId) {
      setSelectedPolicyId(policies[0]?.id ?? null);
    }
  }, [policies, selectedPolicyId]);

  React.useEffect(() => {
    if (selectedPolicy) {
      setEditDocumentStr(JSON.stringify(selectedPolicy.document, null, 2));
      setIsEditing(false);
      setShowSimulate(false);
      simulate.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPolicy?.id]);

  const parseDocument = (str: string): PolicyDocument | null => {
    try {
      const doc = JSON.parse(str) as PolicyDocument;
      if (!doc.Version || !Array.isArray(doc.Statement)) return null;
      return doc;
    } catch {
      return null;
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateDocError('');
    const doc = parseDocument(createDocumentStr);
    if (!doc) {
      setCreateDocError('Invalid JSON. Must have "Version" and "Statement" array.');
      return;
    }
    try {
      const created = await createPolicy.mutateAsync({
        name: createName,
        description: createDescription || undefined,
        document: doc,
        type: createType,
      });
      setIsCreateOpen(false);
      setCreateName('');
      setCreateDescription('');
      setCreateDocumentStr(JSON.stringify(STARTER_DOCUMENT, null, 2));
      setSelectedPolicyId(created.id);
    } catch {
      // handled by withErrorHandler
    }
  };

  const handleSaveEdit = async () => {
    setEditDocError('');
    const doc = parseDocument(editDocumentStr);
    if (!doc) {
      setEditDocError('Invalid JSON. Must have "Version" and "Statement" array.');
      return;
    }
    if (!selectedPolicy) return;
    try {
      await updatePolicy.mutateAsync({ id: selectedPolicy.id, document: doc });
      setIsEditing(false);
    } catch {
      // handled by withErrorHandler
    }
  };

  const handleDelete = async () => {
    if (!selectedPolicy) return;
    try {
      await deletePolicy.mutateAsync(selectedPolicy.id);
      setIsDeleteOpen(false);
      setSelectedPolicyId(null);
    } catch {
      // handled by withErrorHandler
    }
  };

  const handleSimulate = async () => {
    if (!simUserId || !simAction) return;
    try {
      await simulate.mutateAsync({
        userId: simUserId,
        action: simAction,
        resource: simResource || '*',
      });
    } catch {
      // handled by withErrorHandler
    }
  };

  const dialogStyle = {
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    borderColor: 'rgba(255, 255, 255, 0.60)',
  };

  return (
    <PortalLayout>
      <div className="space-y-8 h-full flex flex-col">
        <PageHeader
          title="IAM Policies"
          subtitle="Create and manage identity-based access policies"
          action={
            <SentryButton variant="accent" className="gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              New Policy
            </SentryButton>
          }
        />

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
          {/* Policy List Sidebar */}
          <div className="space-y-4 flex flex-col min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <SentryInput
                placeholder="Search policies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-black/5 border-transparent focus:bg-white"
              />
            </div>

            <GlassCard tier={1} className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <SentrySkeleton key={i} className="h-14 w-full" />
                ))
              ) : filteredPolicies.length > 0 ? (
                filteredPolicies.map((policy) => (
                  <button
                    key={policy.id}
                    onClick={() => setSelectedPolicyId(policy.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-sm transition-all text-left group',
                      selectedPolicy?.id === policy.id
                        ? 'bg-accent/10 border border-accent/20'
                        : 'border border-transparent hover:bg-black/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'p-2 rounded-sm transition-colors',
                        selectedPolicy?.id === policy.id ? 'bg-accent/20 text-accent' : 'bg-black/5 text-muted-foreground'
                      )}>
                        <ScrollText className="w-3.5 h-3.5" />
                      </div>
                      <div className="space-y-0.5">
                        <p className={cn(
                          'text-sm font-display font-semibold leading-none',
                          selectedPolicy?.id === policy.id ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {policy.name}
                        </p>
                        <p className="text-[10px] font-body text-muted-foreground/60 capitalize">
                          {policy.type} {policy.isSystem ? '· system' : ''}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      'w-3.5 h-3.5 transition-all',
                      selectedPolicy?.id === policy.id ? 'text-accent opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                    )} />
                  </button>
                ))
              ) : (
                <div className="py-8 text-center">
                  <p className="text-xs font-body text-muted-foreground">No policies found</p>
                </div>
              )}
            </GlassCard>
          </div>

          {/* Policy Detail Panel */}
          <div className="lg:col-span-2 min-h-0">
            {selectedPolicy ? (
              <GlassCard tier={2} className="h-full flex flex-col p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-display font-semibold">{selectedPolicy.name}</h2>
                      <StatusBadge status={selectedPolicy.isSystem ? 'system' : 'active'} className="capitalize">
                        {selectedPolicy.type}
                      </StatusBadge>
                    </div>
                    <p className="text-sm font-body text-muted-foreground">{selectedPolicy.description || 'No description'}</p>
                  </div>
                  {!selectedPolicy.isSystem && !isEditing && (
                    <div className="flex items-center gap-2">
                      <SentryButton variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setIsEditing(true)}>
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </SentryButton>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-6 scrollbar-hide pr-1">
                  {/* Document Editor */}
                  <section className="space-y-3">
                    <h3 className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60 border-b border-border/50 pb-2">
                      Policy Document
                    </h3>
                    {isEditing ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editDocumentStr}
                          onChange={(e) => { setEditDocumentStr(e.target.value); setEditDocError(''); }}
                          rows={14}
                          className="font-mono text-xs resize-none"
                          style={{ background: 'var(--color-surface-2, rgba(255,255,255,0.80))' }}
                        />
                        {editDocError && (
                          <p className="text-xs text-destructive font-body">{editDocError}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <SentryButton
                            variant="accent"
                            size="sm"
                            onClick={handleSaveEdit}
                            isLoading={updatePolicy.isPending}
                          >
                            Save Document
                          </SentryButton>
                          <SentryButton
                            variant="ghost"
                            size="sm"
                            onClick={() => { setIsEditing(false); setEditDocError(''); setEditDocumentStr(JSON.stringify(selectedPolicy.document, null, 2)); }}
                          >
                            Cancel
                          </SentryButton>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-xs font-mono p-4 rounded-sm overflow-x-auto" style={{ background: 'rgba(0,0,0,0.04)', lineHeight: 1.6 }}>
                        {JSON.stringify(selectedPolicy.document, null, 2)}
                      </pre>
                    )}
                  </section>

                  {/* Simulate Section */}
                  <section className="space-y-4">
                    <button
                      onClick={() => { setShowSimulate(v => !v); simulate.reset(); }}
                      className="flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-[0.1em] text-muted-foreground/60 border-b border-border/50 pb-2 w-full hover:text-muted-foreground transition-colors"
                    >
                      <Play className="w-3 h-3" />
                      Simulate Policy Evaluation
                      {showSimulate ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                    </button>

                    {showSimulate && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <SentryInput
                            label="User ID"
                            placeholder="uuid"
                            value={simUserId}
                            onChange={(e) => setSimUserId(e.target.value)}
                            className="font-mono text-xs"
                          />
                          <SentryInput
                            label="Action"
                            placeholder="users:read"
                            value={simAction}
                            onChange={(e) => setSimAction(e.target.value)}
                            className="font-mono text-xs"
                          />
                          <SentryInput
                            label="Resource"
                            placeholder="*"
                            value={simResource}
                            onChange={(e) => setSimResource(e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>

                        <SentryButton
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          disabled={!simUserId || !simAction}
                          onClick={handleSimulate}
                          isLoading={simulate.isPending}
                        >
                          <Play className="w-3.5 h-3.5" />
                          Run Simulation
                        </SentryButton>

                        {simulate.data && (
                          <div className={cn(
                            'flex items-start gap-3 p-4 rounded-sm border',
                            simulate.data.allowed
                              ? 'bg-accent/5 border-accent/20'
                              : 'bg-destructive/5 border-destructive/20'
                          )}>
                            {simulate.data.allowed
                              ? <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                              : <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            }
                            <div className="space-y-1">
                              <p className={cn('text-sm font-display font-semibold', simulate.data.allowed ? 'text-accent' : 'text-destructive')}>
                                {simulate.data.allowed ? 'ALLOW' : 'DENY'}
                              </p>
                              <p className="text-xs font-mono text-muted-foreground">{simulate.data.reason}</p>
                              {simulate.data.matchedPolicy && (
                                <p className="text-xs font-body text-muted-foreground">Matched: {simulate.data.matchedPolicy}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </div>

                {!selectedPolicy.isSystem && !isEditing && (
                  <div className="mt-6 pt-6 border-t border-border/50 flex justify-end">
                    <SentryButton
                      variant="ghost"
                      className="text-destructive border-destructive/20 hover:bg-destructive/5 gap-2"
                      onClick={() => setIsDeleteOpen(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Policy
                    </SentryButton>
                  </div>
                )}
              </GlassCard>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-border rounded-md">
                {isLoading ? (
                  <SentrySkeleton className="h-8 w-48" />
                ) : (
                  <div className="text-center space-y-2">
                    <ScrollText className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm font-body text-muted-foreground">Select a policy to view details</p>
                    <SentryButton variant="ghost" size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
                      <Plus className="w-3.5 h-3.5" />
                      Create your first policy
                    </SentryButton>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE POLICY DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={(o) => { if (!o) { setIsCreateOpen(false); setCreateName(''); setCreateDescription(''); setCreateDocError(''); setCreateDocumentStr(JSON.stringify(STARTER_DOCUMENT, null, 2)); } }}>
        <DialogContent className="text-neutral-900 border max-w-2xl" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg">Create Policy</DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              Define an IAM-style policy document with Allow/Deny statements.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <SentryInput
                label="Policy Name"
                placeholder="e.g. ReadOnlyAccess"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
              />
              <div className="space-y-1.5">
                <label className="text-xs font-display font-semibold text-muted-foreground">Type</label>
                <Select value={createType} onValueChange={(v) => setCreateType(v as 'managed' | 'inline')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="managed">Managed</SelectItem>
                    <SelectItem value="inline">Inline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <SentryInput
              label="Description (optional)"
              placeholder="Grants read-only access to all resources"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-display font-semibold text-muted-foreground">Policy Document (JSON)</label>
              <Textarea
                value={createDocumentStr}
                onChange={(e) => { setCreateDocumentStr(e.target.value); setCreateDocError(''); }}
                rows={10}
                className="font-mono text-xs resize-none"
                required
              />
              {createDocError && (
                <p className="text-xs text-destructive font-body">{createDocError}</p>
              )}
            </div>

            <DialogFooter className="pt-4 border-t border-border/50 gap-2">
              <SentryButton type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</SentryButton>
              <SentryButton type="submit" variant="accent" isLoading={createPolicy.isPending}>Create Policy</SentryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE POLICY DIALOG */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="text-neutral-900 border" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-lg text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Policy?
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-neutral-600">
              This is permanent. Any roles that have <span className="font-semibold text-neutral-800">"{selectedPolicy?.name}"</span> attached will immediately lose its access grants.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 border-t border-border/50 gap-2">
            <SentryButton type="button" variant="ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</SentryButton>
            <SentryButton type="button" variant="destructive" onClick={handleDelete} isLoading={deletePolicy.isPending}>Confirm Delete</SentryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
