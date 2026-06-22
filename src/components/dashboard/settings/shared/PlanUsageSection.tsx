/**
 * PlanUsageSection — tenant-facing plan / subscription / limits view.
 *
 * Shows the current plan, limits vs live usage, and lets owners/admins request
 * an upgrade or downgrade (no payment gateway — master admin approves the
 * request). Cloud-only; the parent gates rendering with isCloud().
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Check, Clock, X } from 'lucide-react';
import { tenantPlanApi } from '@/services/tenantPlanApi';
import { STALE } from '@/lib/queryCache';
import type { Plan } from '@/services/adminPlansApi';
import { toast } from 'sonner';

const UNLIMITED = -1;

function fmtLimit(v: number | boolean): string {
    if (typeof v === 'boolean') return v ? 'Included' : 'Not included';
    return v === UNLIMITED ? 'Unlimited' : v.toLocaleString();
}

export const PlanUsageSection: React.FC = () => {
    const queryClient = useQueryClient();
    const [pickerOpen, setPickerOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['my-plan'],
        queryFn: () => tenantPlanApi.getMyPlan(),
        staleTime: STALE.DEFAULT,
    });
    const { data: addonsData } = useQuery({
        queryKey: ['my-addons'],
        queryFn: () => tenantPlanApi.getMyAddons(),
        staleTime: 60_000, // custom TTL (not a STALE tier)
    });
    const { data: publicData } = useQuery({
        queryKey: ['public-plans'],
        queryFn: () => tenantPlanApi.listPublicPlans(),
        enabled: pickerOpen,
        staleTime: 60_000, // custom TTL (not a STALE tier)
    });

    const requestMutation = useMutation({
        mutationFn: ({ slug, note }: { slug: string; note?: string }) => tenantPlanApi.requestChange(slug, note),
        onSuccess: () => {
            toast.success('Plan change requested — an admin will review it shortly');
            setPickerOpen(false);
            queryClient.invalidateQueries({ queryKey: ['my-plan'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to submit request'),
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => tenantPlanApi.cancelRequest(id),
        onSuccess: () => {
            toast.success('Request cancelled');
            queryClient.invalidateQueries({ queryKey: ['my-plan'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to cancel'),
    });

    if (isLoading) {
        return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    }
    if (!data?.plan) {
        return <p className="text-sm text-muted-foreground">No plan is associated with this workspace.</p>;
    }

    const { plan, limits, usage, pending_request } = data;
    const detailed = publicData?.detailed ?? [];

    return (
        <div className="space-y-6">
            {/* Current plan */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                {plan.name}
                                {plan.highlighted && plan.badge && (
                                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-primary/10 text-primary uppercase">{plan.badge}</span>
                                )}
                            </CardTitle>
                            <CardDescription>{plan.description || 'Your current subscription plan.'}</CardDescription>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold">{plan.price_display}<span className="text-sm font-normal text-muted-foreground">{plan.price_period}</span></p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Limits vs usage */}
                    <div className="space-y-3">
                        {Object.entries(limits).filter(([key, value]) => {
                            // Show feature flags + any limit we track usage for; hide dormant
                            // (disabled/unlimited) operational caps that have no usage counter.
                            if (typeof value !== 'number') return true;
                            if (usage[key] != null) return true;
                            return value !== UNLIMITED;
                        }).map(([key, value]) => {
                            const used = usage[key];
                            const isNum = typeof value === 'number';
                            const pct = isNum && value !== UNLIMITED && (value as number) > 0 && used != null
                                ? Math.min(100, (used / (value as number)) * 100) : null;
                            return (
                                <div key={key} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="capitalize text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                                        <span className="font-medium">
                                            {used != null && isNum ? `${used.toLocaleString()} / ` : ''}{fmtLimit(value)}
                                        </span>
                                    </div>
                                    {pct != null && <Progress value={pct} className="h-1.5" />}
                                </div>
                            );
                        })}
                    </div>

                    {pending_request ? (
                        <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                            <div className="flex items-center gap-2 text-sm">
                                <Clock className="w-4 h-4 text-amber-500" />
                                <span>Pending {pending_request.direction} to <strong>{pending_request.to_plan}</strong> — awaiting admin approval.</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(pending_request.id)} disabled={cancelMutation.isPending}>
                                <X className="w-4 h-4 mr-1" />Cancel
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={() => setPickerOpen(true)}>Change plan</Button>
                    )}
                </CardContent>
            </Card>

            {/* Managed add-ons (managed tiers) */}
            {data?.plan?.infra_mode === 'managed' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Managed add-ons</CardTitle>
                        <CardDescription>
                            Frontbase-managed infrastructure included with your plan. Add-ons are granted by your account manager.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            const addons = addonsData?.addons ?? {};
                            const entries = Object.entries(addons);
                            if (entries.length === 0) {
                                return <p className="text-sm text-muted-foreground">No managed add-ons active.</p>;
                            }
                            return (
                                <ul className="text-sm space-y-1">
                                    {entries.map(([type, qty]) => (
                                        <li key={type} className="flex justify-between">
                                            <span className="capitalize text-muted-foreground">{type.replace(/^managed_/, '').replace(/_/g, ' ')}</span>
                                            <span className="font-medium">×{qty}</span>
                                        </li>
                                    ))}
                                </ul>
                            );
                        })()}
                    </CardContent>
                </Card>
            )}

            {/* Plan picker */}
            {pickerOpen && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Choose a plan</CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setPickerOpen(false)}><X className="w-4 h-4" /></Button>
                    </CardHeader>
                    <CardContent>
                        {!publicData ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {detailed.map((p: Plan) => {
                                    const current = p.slug === plan.slug;
                                    const upgrade = p.sort_order > plan.sort_order;
                                    return (
                                        <div key={p.id} className={`rounded-xl border p-4 flex flex-col gap-2 ${current ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-semibold">{p.name}</h4>
                                                {current && <span className="text-[10px] font-semibold uppercase text-primary">Current</span>}
                                            </div>
                                            <p className="text-xl font-bold">{p.price_display}<span className="text-xs font-normal text-muted-foreground">{p.price_period}</span></p>
                                            <ul className="text-xs text-muted-foreground space-y-1 flex-1">
                                                {p.features.slice(0, 5).map((f, i) => (
                                                    <li key={i} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary shrink-0" />{f}</li>
                                                ))}
                                            </ul>
                                            <Button size="sm" disabled={current || requestMutation.isPending}
                                                variant={upgrade ? 'default' : 'outline'}
                                                onClick={() => requestMutation.mutate({ slug: p.slug })}>
                                                {current ? 'Current plan' : (
                                                    <>{upgrade ? <ArrowUpCircle className="w-4 h-4 mr-1" /> : <ArrowDownCircle className="w-4 h-4 mr-1" />}
                                                        Request {upgrade ? 'upgrade' : 'downgrade'}</>
                                                )}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default PlanUsageSection;
