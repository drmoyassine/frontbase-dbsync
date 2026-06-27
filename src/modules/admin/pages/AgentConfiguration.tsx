/**
 * AgentConfiguration — master-admin Workspace Agent configuration page.
 *
 * Mounted at /admin/agents (cloud mode, master admin only). Four tabs:
 *   1. Providers  — pick the shared LLM provider + global enabled/action settings
 *   2. Quotas     — per-plan credit limits (edit in PlansManager via LIMIT_REGISTRY)
 *   3. Usage      — analytics + per-tenant balances + manual grants + daily reset
 *   4. Add-ons    — credit-purchase feature (gated off by default)
 *
 * Applies ONLY to the Workspace Agent (backend, cloud). Edge Agents are unaffected.
 */

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Bot, Cloud, Sliders, BarChart3, Gift, Star, Loader2, RefreshCw, Zap,
    CheckCircle2, AlertTriangle, Info,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
    adminAgentsApi,
    type AgentProvider, type AgentBalanceRow, type AgentAnalytics, type AnalyticsPeriod,
} from '@/services/adminAgentsApi';
import { adminPlansApi, type Plan } from '@/services/adminPlansApi';
import { PROVIDER_ICONS } from '@/components/dashboard/settings/shared/edgeConstants';
import { STALE } from '@/lib/queryCache';
import { toast } from 'sonner';

const UNLIMITED = -1;

const inputCls = 'w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all';
const cardCls = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm';

export function AgentConfiguration() {
    const [tab, setTab] = useState<'providers' | 'quotas' | 'usage' | 'addons'>('providers');

    const tabs: [typeof tab, string, React.FC<any>][] = [
        ['providers', 'Providers', Cloud],
        ['quotas', 'Quotas', Sliders],
        ['usage', 'Usage', BarChart3],
        ['addons', 'Credit Add-ons', Gift],
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    <Bot className="w-6 h-6 text-primary-500" /> Workspace Agent
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Configure the shared LLM provider, set per-plan credit quotas, and monitor usage across all tenants.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                    Applies to the <strong>Workspace Agent</strong> (backend, cloud mode) only. Edge Agents run on each tenant&rsquo;s own provider and are not billed here.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
                {tabs.map(([key, label, Icon]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            tab === key ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                        <Icon className="w-4 h-4" />{label}
                    </button>
                ))}
            </div>

            {tab === 'providers' && <ProvidersTab />}
            {tab === 'quotas' && <QuotasTab />}
            {tab === 'usage' && <UsageTab />}
            {tab === 'addons' && <AddonsTab />}
        </div>
    );
}

/* ============================================================================
 * 1. PROVIDERS — shared LLM + global config
 * ========================================================================== */

function ProvidersTab() {
    const queryClient = useQueryClient();

    const { data: config, isLoading: cfgLoading } = useQuery({
        queryKey: ['admin-agent-config'],
        queryFn: adminAgentsApi.getConfig,
        staleTime: STALE.DEFAULT,
    });
    const { data: providersData, isLoading: provLoading } = useQuery({
        queryKey: ['admin-agent-providers'],
        queryFn: adminAgentsApi.listProviders,
        staleTime: STALE.DEFAULT,
    });

    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [action, setAction] = useState<'block' | 'warn' | null>(null);

    // Sync local form once config loads.
    React.useEffect(() => {
        if (config) { setEnabled(config.enabled); setAction(config.quota_exceeded_action); }
    }, [config]);

    const setDefaultMut = useMutation({
        mutationFn: (providerId: string) => adminAgentsApi.setDefaultProvider(providerId),
        onSuccess: () => {
            toast.success('Default Workspace Agent provider updated');
            queryClient.invalidateQueries({ queryKey: ['admin-agent-config'] });
            queryClient.invalidateQueries({ queryKey: ['admin-agent-providers'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to set default'),
    });

    const saveConfigMut = useMutation({
        mutationFn: () => adminAgentsApi.updateConfig({
            enabled: !!enabled,
            quota_exceeded_action: action || 'block',
        }),
        onSuccess: () => {
            toast.success('Workspace Agent settings saved');
            queryClient.invalidateQueries({ queryKey: ['admin-agent-config'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to save settings'),
    });

    const providers = providersData?.providers ?? [];
    const dirty = config && (config.enabled !== !!enabled || config.quota_exceeded_action !== action);

    return (
        <div className="space-y-5">
            {/* Shared provider selection */}
            <div className={cardCls}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-primary-500" /> LLM Provider for Workspace Agent
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Select the default LLM provider that <strong>all tenants</strong> use for the Workspace Agent.
                        Your API costs scale with total usage — set quotas accordingly on the Quotas tab.
                    </p>
                    <div className="mt-2 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-lg p-3">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                            <strong>Where to add providers:</strong> connect OpenAI, Anthropic, or Google accounts in{' '}
                            <a href="/dashboard/settings" className="text-primary-500 underline">Edge Providers</a>{' '}
                            first, then mark one as the default here.
                        </span>
                    </div>
                </div>
                <div className="p-5 space-y-3">
                    {provLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
                    ) : providers.length === 0 ? (
                        <div className="text-center py-10">
                            <Cloud className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No LLM Providers</p>
                            <p className="text-sm text-slate-400">Connect an OpenAI, Anthropic, or Google provider in Edge Providers first.</p>
                        </div>
                    ) : (
                        providers.map(p => {
                            const Icon = PROVIDER_ICONS[p.provider] || Bot;
                            return (
                                <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border ${
                                    p.is_workspace_default ? 'border-primary-500 bg-primary-500/5' : 'border-slate-200 dark:border-slate-800'
                                }`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                                                {p.is_workspace_default && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/15 text-primary-600 dark:text-primary-400">
                                                        <Star className="w-3 h-3" /> Default
                                                    </span>
                                                )}
                                                {!p.is_active && (
                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-500">Inactive</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 capitalize">{p.provider}{!p.has_credentials && ' · no credentials'}</p>
                                        </div>
                                    </div>
                                    {p.is_workspace_default ? (
                                        <span className="text-xs font-medium text-slate-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Active</span>
                                    ) : (
                                        <button
                                            onClick={() => setDefaultMut.mutate(p.id)}
                                            disabled={!p.is_active || !p.has_credentials || setDefaultMut.isPending}
                                            className="px-3 py-1.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-lg disabled:opacity-40">
                                            Set as Default
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Global settings */}
            <div className={cardCls}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-slate-900 dark:text-white">Agent Settings</h3>
                </div>
                <div className="p-5 space-y-4">
                    {cfgLoading ? (
                        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                    ) : (
                        <>
                            <label className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Workspace Agent enabled</span>
                                    <p className="text-xs text-slate-400">When off, tenant turns are refused with a notice.</p>
                                </div>
                                <input type="checkbox" checked={!!enabled} onChange={e => setEnabled(e.target.checked)} className="w-5 h-5 accent-primary-600" />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">When quota is exceeded</span>
                                    <p className="text-xs text-slate-400"><strong>Block</strong> = refuse the turn · <strong>Warn</strong> = allow as overage (still logged).</p>
                                </div>
                                <select value={action || 'block'} onChange={e => setAction(e.target.value as 'block' | 'warn')} className={`${inputCls} w-40`}>
                                    <option value="block">Block</option>
                                    <option value="warn">Warn (overage)</option>
                                </select>
                            </label>
                            <div className="flex justify-end">
                                <button onClick={() => saveConfigMut.mutate()} disabled={!dirty || saveConfigMut.isPending}
                                    className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5">
                                    {saveConfigMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Save Settings
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ============================================================================
 * 2. QUOTAS — per-plan credit matrix
 * ========================================================================== */

function fmtCredit(v: number | boolean | undefined): string {
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (v === undefined || v === null) return '—';
    if (v === UNLIMITED) return 'Unlimited';
    return String(v);
}

function QuotasTab() {
    const { data, isLoading } = useQuery({
        queryKey: ['admin-plans'],
        queryFn: () => adminPlansApi.listPlans(),
        staleTime: STALE.DEFAULT,
    });
    const plans: Plan[] = (data?.plans ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

    return (
        <div className="space-y-5">
            <div className={cardCls}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Sliders className="w-4 h-4 text-primary-500" /> Credit Quotas by Plan Tier</h3>
                        <p className="text-sm text-slate-500 mt-1">Daily + monthly Workspace Agent credit limits per subscription tier.</p>
                    </div>
                    <a href="/admin/plans" className="text-sm font-medium text-primary-500 hover:underline">Edit in PlansManager →</a>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-400">
                                <th className="px-5 py-3">Plan</th>
                                <th className="px-5 py-3">Daily credits</th>
                                <th className="px-5 py-3">Monthly credits</th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-5 py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" /></td></tr>
                            ) : plans.map(p => (
                                <tr key={p.id}>
                                    <td className="px-5 py-3">
                                        <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                                        <span className="ml-2 text-xs font-mono text-slate-400">{p.slug}</span>
                                    </td>
                                    <td className="px-5 py-3">{fmtCredit((p.limits as any).agent_credits_daily)}/day</td>
                                    <td className="px-5 py-3">{fmtCredit((p.limits as any).agent_credits_monthly)}/mo</td>
                                    <td className="px-5 py-3 text-right"><a href="/admin/plans" className="text-xs text-primary-500 hover:underline">Edit</a></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-xl p-4">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary-500" />
                <div>
                    <strong className="text-slate-700 dark:text-slate-300">How credits work:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>1 credit ≈ 1 Workspace Agent turn (one message + response).</li>
                        <li>Daily credits reset at 00:00 UTC; monthly credits reset on the 1st of the month.</li>
                        <li>Daily pool is consumed first, then monthly. Support mode is free.</li>
                        <li>∞ = unlimited credits (Enterprise).</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

/* ============================================================================
 * 3. USAGE — analytics + balances + grants + reset
 * ========================================================================== */

function StatCard({ label, value, unit, icon: Icon, tone }: { label: string; value: string | number; unit?: string; icon: React.FC<any>; tone: string }) {
    return (
        <div className={cardCls + ' p-5'}>
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
                <Icon className={`w-4 h-4 ${tone}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
                {value}<span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>
            </p>
        </div>
    );
}

function UsageTab() {
    const queryClient = useQueryClient();
    const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
    const [grantFor, setGrantFor] = useState<AgentBalanceRow | null>(null);

    const { data: analytics, isLoading: anaLoading } = useQuery({
        queryKey: ['admin-agent-analytics', period],
        queryFn: () => adminAgentsApi.getAnalytics(period),
        staleTime: STALE.DEFAULT,
    });
    const { data: balancesData, isLoading: balLoading } = useQuery({
        queryKey: ['admin-agent-balances'],
        queryFn: adminAgentsApi.listBalances,
        staleTime: STALE.DEFAULT,
    });

    const grantMut = useMutation({
        mutationFn: ({ tenantId, daily, monthly }: { tenantId: string; daily: number; monthly: number }) =>
            adminAgentsApi.grantCredits(tenantId, daily, monthly),
        onSuccess: () => {
            toast.success('Credits granted');
            queryClient.invalidateQueries({ queryKey: ['admin-agent-balances'] });
            setGrantFor(null);
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to grant credits'),
    });

    const resetMut = useMutation({
        mutationFn: adminAgentsApi.resetAllDaily,
        onSuccess: (d) => {
            toast.success(`Daily reset applied to ${d.reset_count} tenant(s)`);
            queryClient.invalidateQueries({ queryKey: ['admin-agent-balances'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Reset failed'),
    });

    const balances = balancesData?.balances ?? [];
    const series = analytics?.daily_series ?? [];
    const maxSeries = useMemo(() => Math.max(1, ...series.map(s => s.credits)), [series]);

    return (
        <div className="space-y-5">
            {/* Period + reset controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                    {(['7d', '30d', '90d'] as AnalyticsPeriod[]).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md ${period === p ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}>
                            {p}
                        </button>
                    ))}
                </div>
                <button onClick={() => { if (confirm('Refill every tenant\'s daily credit pool now? (Also runs automatically at 00:05 UTC)')) resetMut.mutate(); }}
                    disabled={resetMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                    {resetMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Reset daily (all)
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Credits used" value={anaLoading ? '…' : (analytics?.total_consumed ?? 0).toLocaleString()} icon={Zap} tone="text-primary-500" />
                <StatCard label="Active tenants" value={anaLoading ? '…' : (analytics?.active_tenants ?? 0)} icon={Bot} tone="text-blue-500" />
                <StatCard label="Quota exhausted" value={anaLoading ? '…' : (analytics?.quota_exhausted ?? 0)} icon={AlertTriangle} tone="text-amber-500" />
                <StatCard label="Avg / tenant" value={anaLoading ? '…' : (analytics?.avg_credits_per_tenant ?? 0)} icon={BarChart3} tone="text-violet-500" />
            </div>

            {/* Daily series sparkline */}
            {series.length > 0 && (
                <div className={cardCls + ' p-5'}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Daily consumption</h3>
                    <div className="flex items-end gap-1 h-24">
                        {series.map(s => (
                            <div key={s.date} title={`${s.date}: ${s.credits}`} className="flex-1 bg-primary-500/70 hover:bg-primary-500 rounded-t-sm transition-colors" style={{ height: `${(s.credits / maxSeries) * 100}%`, minHeight: '2px' }} />
                        ))}
                    </div>
                </div>
            )}

            {/* Balances */}
            <div className={cardCls}>
                <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-slate-900 dark:text-white">Tenant Credit Balances</h3>
                    <p className="text-sm text-slate-500 mt-0.5">Current pools with manual grant + reset options.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-400">
                                <th className="px-5 py-3">Tenant</th>
                                <th className="px-5 py-3">Daily</th>
                                <th className="px-5 py-3">Monthly</th>
                                <th className="px-5 py-3">Bonus</th>
                                <th className="px-5 py-3">Total consumed</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {balLoading ? (
                                <tr><td colSpan={6} className="px-5 py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" /></td></tr>
                            ) : balances.length === 0 ? (
                                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">No usage yet. Balances are created on a tenant&rsquo;s first Workspace Agent turn.</td></tr>
                            ) : balances.map(b => (
                                <tr key={b.tenant_id}>
                                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{b.tenant_name}</td>
                                    <td className="px-5 py-3"><CreditCell remaining={b.daily_remaining} limit={b.daily_limit} /></td>
                                    <td className="px-5 py-3"><CreditCell remaining={b.monthly_remaining} limit={b.monthly_limit} /></td>
                                    <td className="px-5 py-3 text-slate-500 text-xs">+{b.bonus_daily ?? 0}d / +{b.bonus_monthly ?? 0}m</td>
                                    <td className="px-5 py-3 text-slate-500">{(b.total_consumed ?? 0).toLocaleString()}</td>
                                    <td className="px-5 py-3 text-right">
                                        <button onClick={() => setGrantFor(b)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-lg">
                                            <Gift className="w-3.5 h-3.5" /> Grant
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {grantFor && (
                <GrantDialog balance={grantFor} onClose={() => setGrantFor(null)} onGrant={(daily, monthly) => grantMut.mutate({ tenantId: grantFor.tenant_id, daily, monthly })} saving={grantMut.isPending} />
            )}
        </div>
    );
}

function CreditCell({ remaining, limit }: { remaining: number; limit: number }) {
    if (remaining === UNLIMITED || limit === UNLIMITED) {
        return <span className="text-slate-400">Unlimited</span>;
    }
    const empty = remaining <= 0;
    return <span className={empty ? 'text-red-500 font-medium' : 'text-slate-700 dark:text-slate-300'}>{remaining} / {limit}</span>;
}

function GrantDialog({ balance, onClose, onGrant, saving }: {
    balance: AgentBalanceRow; onClose: () => void; onGrant: (daily: number, monthly: number) => void; saving: boolean;
}) {
    const [daily, setDaily] = useState(50);
    const [monthly, setMonthly] = useState(0);
    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Gift className="w-5 h-5 text-primary-500" /> Grant credits — {balance.tenant_name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <p className="text-sm text-slate-500">Bonus credits are added on top of the plan limit now AND at every reset.</p>
                    <label className="block">
                        <span className="text-xs font-semibold text-slate-500 uppercase">Daily bonus</span>
                        <input type="number" min={0} value={daily} onChange={e => setDaily(Math.max(0, Number(e.target.value)))} className={inputCls} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-slate-500 uppercase">Monthly bonus</span>
                        <input type="number" min={0} value={monthly} onChange={e => setMonthly(Math.max(0, Number(e.target.value)))} className={inputCls} />
                    </label>
                    <p className="text-xs text-slate-400">Current: {balance.daily_remaining} daily · {balance.monthly_remaining} monthly · bonus {balance.bonus_daily ?? 0}d / {balance.bonus_monthly ?? 0}m</p>
                </div>
                <DialogFooter>
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                    <button onClick={() => onGrant(daily, monthly)} disabled={saving || (daily === 0 && monthly === 0)}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Grant credits
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ============================================================================
 * 4. ADD-ONS — credit purchases (feature-flagged, off by default)
 * ========================================================================== */

// Product decision flag. Default: OFF — master admins grant credits manually (Usage tab).
const ENABLE_CREDIT_PURCHASES = false;

function AddonsTab() {
    if (!ENABLE_CREDIT_PURCHASES) {
        return (
            <div className={cardCls}>
                <div className="p-12 text-center">
                    <Gift className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">Credit Add-ons Not Enabled</h3>
                    <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                        Tenant self-service credit purchases are disabled. Master admins can still grant one-time or recurring
                        bonus credits from the <strong>Usage</strong> tab. Enable this feature to let tenants buy additional credits
                        beyond their plan quota.
                    </p>
                </div>
            </div>
        );
    }
    // When enabled, this is where the purchase/grant flow + history would live.
    return (
        <div className={cardCls + ' p-6'}>
            <h3 className="font-bold text-slate-900 dark:text-white">Credit Add-ons</h3>
            <p className="text-sm text-slate-500 mt-1">Self-service credit purchases — coming soon.</p>
        </div>
    );
}

export default AgentConfiguration;
