/**
 * TenantTeamPanel — tenant self-service team management (cloud).
 *
 * Invite teammates (gated by the plan's team_members seat limit), see pending
 * invites, and revoke them. Seat usage is read from /me/plan.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, X, UserPlus } from 'lucide-react';
import { tenantTeamApi } from '@/services/tenantTeamApi';
import { tenantPlanApi } from '@/services/tenantPlanApi';
import { toast } from 'sonner';

const UNLIMITED = -1;

export const TenantTeamPanel: React.FC = () => {
    const queryClient = useQueryClient();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('editor');

    const { data: invitesData, isLoading } = useQuery({
        queryKey: ['tenant-invites'],
        queryFn: () => tenantTeamApi.listInvites(),
        staleTime: 30_000,
    });
    const { data: planData } = useQuery({
        queryKey: ['my-plan'],
        queryFn: () => tenantPlanApi.getMyPlan(),
        staleTime: 30_000,
    });

    const invites = invitesData?.invites ?? [];
    const seatLimit = typeof planData?.limits?.team_members === 'number' ? planData.limits.team_members as number : undefined;
    const membersUsed = planData?.usage?.team_members ?? 0;
    const seatsUsed = membersUsed + invites.length; // pending invites reserve seats
    const isFull = seatLimit !== undefined && seatLimit !== UNLIMITED && seatsUsed >= seatLimit;

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['tenant-invites'] });
        queryClient.invalidateQueries({ queryKey: ['my-plan'] });
    };

    const inviteMutation = useMutation({
        mutationFn: () => tenantTeamApi.createInvite(email.trim().toLowerCase(), role),
        onSuccess: () => { toast.success('Invitation sent'); setEmail(''); refresh(); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to send invite'),
    });
    const revokeMutation = useMutation({
        mutationFn: (id: string) => tenantTeamApi.revokeInvite(id),
        onSuccess: () => { toast.success('Invite revoked'); refresh(); },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to revoke'),
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Team Members</CardTitle>
                <CardDescription>
                    Invite teammates to your workspace.
                    {seatLimit !== undefined && (
                        <span className="ml-1">
                            {seatLimit === UNLIMITED
                                ? 'Unlimited seats on your plan.'
                                : `${seatsUsed} of ${seatLimit} seats used (members + pending invites).`}
                        </span>
                    )}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <form
                    onSubmit={(e) => { e.preventDefault(); if (email.trim()) inviteMutation.mutate(); }}
                    className="flex flex-col sm:flex-row gap-2"
                >
                    <Input
                        type="email" placeholder="teammate@company.com" value={email}
                        onChange={(e) => setEmail(e.target.value)} required className="flex-1"
                        disabled={isFull}
                    />
                    <select
                        value={role} onChange={(e) => setRole(e.target.value as any)} disabled={isFull}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                    </select>
                    <Button type="submit" disabled={isFull || inviteMutation.isPending || !email.trim()}>
                        {inviteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send invite'}
                    </Button>
                </form>
                {isFull && (
                    <p className="text-sm text-amber-600">
                        You've used all your seats. Upgrade your plan or revoke a pending invite to add more.
                    </p>
                )}

                <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pending invites</p>
                    {isLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : invites.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No pending invites.</p>
                    ) : (
                        <ul className="divide-y divide-border rounded-lg border border-border">
                            {invites.map((inv) => (
                                <li key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <span className="truncate text-sm">{inv.email}</span>
                                        <span className="text-xs text-muted-foreground uppercase">{inv.role}</span>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(inv.id)}
                                        disabled={revokeMutation.isPending}>
                                        <X className="w-4 h-4 mr-1" />Revoke
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default TenantTeamPanel;
