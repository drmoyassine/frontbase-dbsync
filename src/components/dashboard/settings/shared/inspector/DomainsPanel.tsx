/**
 * DomainsPanel — Custom domain management for Edge Engines.
 *
 * Right-side panel in Edge Inspector for listing, adding, verifying,
 * and deleting custom domains. Works across all providers that support
 * domain management (CF, Vercel, Netlify, Deno).
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Globe, Plus, Trash2, RefreshCw, Loader2, CheckCircle2,
    AlertCircle, Clock, Copy, Check, ExternalLink, Info,
} from 'lucide-react';
import type { DomainInfo, InspectDomainsResponse } from './types';
import { API_BASE } from './types';

interface DomainsPanelProps {
    engineId: string;
    domainsData: InspectDomainsResponse | undefined;
    loadingDomains: boolean;
    providerLabel: string;
    engineUrl?: string;  // e.g. "https://frontbase-edgenew.drmoyassine.deno.net"
}

// ─── Status badge helper ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'active':
            return (
                <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-600/30 bg-emerald-500/10">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Active
                </Badge>
            );
        case 'pending':
            return (
                <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-600/30 bg-amber-500/10">
                    <Clock className="h-2.5 w-2.5" /> Pending
                </Badge>
            );
        default:
            return (
                <Badge variant="outline" className="text-[10px] gap-1 text-red-600 border-red-600/30 bg-red-500/10">
                    <AlertCircle className="h-2.5 w-2.5" /> {status}
                </Badge>
            );
    }
}

// ─── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Copy"
        >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

// ─── Component ──────────────────────────────────────────────────────────────

export const DomainsPanel: React.FC<DomainsPanelProps> = ({
    engineId, domainsData, loadingDomains, providerLabel, engineUrl,
}) => {
    const queryClient = useQueryClient();
    const [newDomain, setNewDomain] = useState('');
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    // Deno: track pending domain locally (backend doesn't persist until health-check passes)
    const [denoPendingDomain, setDenoPendingDomain] = useState<string | null>(null);
    const isDeno = providerLabel?.toLowerCase().includes('deno');

    const invalidateDomains = () => {
        queryClient.invalidateQueries({ queryKey: ['edge-inspector', 'domains', engineId] });
        // Also invalidate engine data so Endpoint URL refreshes after custom domain changes
        queryClient.invalidateQueries({ queryKey: ['edge-engines'] });
        queryClient.invalidateQueries({ queryKey: ['edge-inspector'] });
    };

    // Build console.deno.com link from engine URL
    const denoConsoleUrl = React.useMemo(() => {
        if (!isDeno || !engineUrl) return 'https://console.deno.com';
        try {
            const host = new URL(engineUrl).hostname;
            const parts = host.split('.');
            if (parts.length >= 4) return `https://console.deno.com/${parts[1]}/${parts[0]}/settings`;
        } catch { /* fallback */ }
        return 'https://console.deno.com';
    }, [isDeno, engineUrl]);

    // ── Add domain mutation ─────────────────────────────────────────────
    const addMutation = useMutation({
        mutationFn: async (domain: string) => {
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/inspect/domains`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });
            return resp.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                setNewDomain('');
                if (isDeno) {
                    // Deno: ephemeral — track pending domain locally
                    setDenoPendingDomain(data.domain?.domain || newDomain);
                    setStatusMsg({ type: 'success', text: data.detail || 'Configure this domain on the Deno console, then click Test.' });
                } else {
                    invalidateDomains();
                    setStatusMsg({ type: 'success', text: `Domain added successfully` });
                }
                setTimeout(() => setStatusMsg(null), 5000);
            } else {
                setStatusMsg({ type: 'error', text: data.detail || 'Failed to add domain' });
            }
        },
        onError: (err: Error) => {
            setStatusMsg({ type: 'error', text: err.message });
        },
    });

    // ── Delete domain mutation ──────────────────────────────────────────
    const deleteMutation = useMutation({
        mutationFn: async (domainId: string) => {
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/inspect/domains/${domainId}`, {
                method: 'DELETE',
            });
            return resp.json();
        },
        onSuccess: (data) => {
            if (data.success) {
                if (isDeno) setDenoPendingDomain(null); // Clear local pending on delete
                invalidateDomains();
                setStatusMsg({ type: 'success', text: 'Domain removed' });
                setTimeout(() => setStatusMsg(null), 3000);
            } else {
                setStatusMsg({ type: 'error', text: data.detail || 'Failed to remove domain' });
            }
        },
    });

    // ── Verify domain mutation ──────────────────────────────────────────
    const [verifyingId, setVerifyingId] = useState<string | null>(null);
    const verifyMutation = useMutation({
        mutationFn: async (domainId: string) => {
            setVerifyingId(domainId);
            const resp = await fetch(`${API_BASE}/api/edge-engines/${engineId}/inspect/domains/${domainId}/verify`, {
                method: 'POST',
            });
            return resp.json();
        },
        onSuccess: (data) => {
            setVerifyingId(null);
            if (data.success) {
                if (isDeno && data.domain?.status === 'active') {
                    // Deno health check passed — domain saved, clear pending
                    setDenoPendingDomain(null);
                }
                invalidateDomains();
                const msg = data.detail || (data.domain?.status === 'active' ? 'Domain verified!' : 'DNS not yet propagated — try again shortly');
                setStatusMsg({ type: 'success', text: msg });
            } else {
                setStatusMsg({ type: 'error', text: data.detail || 'Verification failed' });
            }
            setTimeout(() => setStatusMsg(null), 5000);
        },
        onError: (err: Error) => {
            setVerifyingId(null);
            setStatusMsg({ type: 'error', text: `Verify request failed: ${err.message}` });
            setTimeout(() => setStatusMsg(null), 5000);
        },
    });

    // ── Not supported state ─────────────────────────────────────────────
    if (domainsData && !domainsData.success) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center space-y-3 max-w-sm">
                    <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                    <p className="text-sm font-medium text-muted-foreground">Domains Not Available</p>
                    <p className="text-xs text-muted-foreground">{domainsData.detail}</p>
                </div>
            </div>
        );
    }

    const domains = domainsData?.domains ?? [];
    // For Deno, merge in the local pending domain if not already in server list
    const allDomains = React.useMemo(() => {
        if (!isDeno || !denoPendingDomain) return domains;
        const alreadySaved = domains.some((d: DomainInfo) => d.domain === denoPendingDomain);
        if (alreadySaved) return domains;
        return [{ id: denoPendingDomain, domain: denoPendingDomain, status: 'pending', provider: 'deno' } as DomainInfo, ...domains];
    }, [domains, denoPendingDomain, isDeno]);
    // Auto-clear pending if server already has it (runs after render, not inside useMemo)
    React.useEffect(() => {
        if (isDeno && denoPendingDomain && domains.some((d: DomainInfo) => d.domain === denoPendingDomain)) {
            setDenoPendingDomain(null);
        }
    }, [domains, denoPendingDomain, isDeno]);

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Custom Domains</span>
                        <Badge variant="secondary" className="text-[10px]">{providerLabel}</Badge>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={invalidateDomains}
                        title="Refresh"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {/* Status message */}
                {statusMsg && (
                    <div className={`mt-2 text-xs flex items-center gap-1.5 ${statusMsg.type === 'success' ? 'text-emerald-600' : 'text-destructive'}`}>
                        {statusMsg.type === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        {statusMsg.text}
                    </div>
                )}
            </div>

            {/* Add domain form */}
            <div className="px-4 py-3 border-b border-border shrink-0">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (newDomain.trim()) addMutation.mutate(newDomain.trim());
                    }}
                    className="flex gap-2"
                >
                    <Input
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        placeholder="app.example.com"
                        className="h-8 text-xs flex-1"
                        disabled={addMutation.isPending}
                    />
                    <Button
                        type="submit"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        disabled={!newDomain.trim() || addMutation.isPending || (isDeno && !!denoPendingDomain)}
                    >
                        {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Add
                    </Button>
                </form>
            </div>

            {/* Domain list */}
            <ScrollArea className="flex-1">
                {loadingDomains ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : allDomains.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-center space-y-2">
                            <Globe className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                            <p className="text-xs text-muted-foreground">No custom domains configured</p>
                            <p className="text-[10px] text-muted-foreground/70">{isDeno ? 'Enter your custom domain above' : 'Add a domain above to get started'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {allDomains.map((d: DomainInfo) => (
                            <div key={d.id} className="px-4 py-3 hover:bg-accent/50 transition-colors">
                                {/* Domain name + status */}
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono font-medium">{d.domain}</span>
                                        <StatusBadge status={d.status} />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {d.status === 'pending' && !isDeno && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => verifyMutation.mutate(d.id)}
                                                disabled={verifyingId === d.id}
                                                title="Verify DNS"
                                            >
                                                {verifyingId === d.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="h-3 w-3" />
                                                )}
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => deleteMutation.mutate(d.id)}
                                            disabled={deleteMutation.isPending}
                                            title="Remove domain"
                                        >
                                            {deleteMutation.isPending ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3 w-3" />
                                            )}
                                        </Button>
                                    </div>
                                </div>

                                {/* Deno: Dashboard setup instructions (for pending domains) */}
                                {isDeno && d.status === 'pending' && (
                                    <div className="mt-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
                                        <div className="flex items-start gap-2">
                                            <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                            <div className="space-y-1.5">
                                                <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">
                                                    Configure on Deno Dashboard
                                                </p>
                                                <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                                                    <li>Open your app's <strong>Settings</strong> on the Deno console</li>
                                                    <li>Under <strong>Production Domains</strong>, click <strong>Add domain</strong></li>
                                                    <li>Add <code className="text-[10px] bg-muted px-1 rounded font-mono">{d.domain}</code></li>
                                                    <li>Configure DNS records and verify on the Deno dashboard</li>
                                                </ol>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <a
                                                        href={denoConsoleUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                                                    >
                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                        Open Deno Console
                                                    </a>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-6 text-[10px] gap-1 px-2"
                                                        onClick={() => verifyMutation.mutate(d.domain)}
                                                        disabled={verifyingId === d.domain}
                                                    >
                                                        {verifyingId === d.domain ? (
                                                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                        ) : (
                                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                                        )}
                                                        Test Connection
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Non-Deno: DNS instructions (for pending domains) */}
                                {!isDeno && (d.dns_records?.length || d.dns_target) && (
                                    <div className="mt-1.5 p-2 rounded-md bg-muted/50 border border-border">
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                                            <Info className="h-3 w-3" />
                                            DNS Configuration
                                        </div>

                                        {d.dns_records && d.dns_records.length > 0 ? (
                                            <div className="space-y-1">
                                                {d.dns_records.map((rec, ri) => (
                                                    <div key={ri} className="flex items-center justify-between">
                                                        <code className="text-[11px] font-mono text-foreground">
                                                            <span className="text-muted-foreground">{rec.type}</span> {rec.name} → {rec.content}
                                                        </code>
                                                        <CopyButton text={rec.content} />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : d.dns_target ? (
                                            <div className="flex items-center justify-between">
                                                <code className="text-[11px] font-mono text-foreground">
                                                    CNAME → {d.dns_target}
                                                </code>
                                                <CopyButton text={d.dns_target} />
                                            </div>
                                        ) : null}

                                        <div className="mt-1.5 text-[10px] text-muted-foreground">
                                            {d.provider === 'cloudflare' ? (
                                                <span className="text-emerald-600">✓ Proxy OK — traffic stays on Cloudflare's edge network</span>
                                            ) : (
                                                <span className="text-amber-600">⚠ DNS-only (do not proxy) — required for SSL verification</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* SSL status */}
                                {d.ssl_status && (
                                    <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                                        SSL: <span className={d.ssl_status === 'active' || d.ssl_status === 'success' ? 'text-emerald-600' : 'text-amber-600'}>{d.ssl_status}</span>
                                    </div>
                                )}

                                {/* Deno: Active domain confirmation */}
                                {isDeno && d.status === 'active' && (
                                    <div className="mt-1.5 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
                                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Custom domain active — used as Endpoint URL
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};
