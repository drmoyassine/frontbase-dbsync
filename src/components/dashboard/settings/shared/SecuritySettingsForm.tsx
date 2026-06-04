/**
 * SecuritySettingsForm
 * 
 * Renders security diagnostics and status panels, manual IP blocklist control,
 * local WAF configurations, and security audit logs.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import api from '@/services/api-service';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
    Shield, 
    Lock, 
    Bot, 
    Key, 
    AlertTriangle, 
    CheckCircle2, 
    HelpCircle, 
    Info, 
    Trash2, 
    Plus, 
    RefreshCw, 
    Sliders, 
    FileText, 
    Globe 
} from 'lucide-react';
import { isCloud } from '@/lib/edition';

interface SecuritySettingsFormProps {
    withCard?: boolean;
}

export function SecuritySettingsForm({ withCard = false }: SecuritySettingsFormProps) {
    const { user } = useAuthStore();
    const { toast } = useToast();
    
    // States
    const [wafEnabled, setWafEnabled] = React.useState(false);
    const [blocklist, setBlocklist] = React.useState<any[]>([]);
    const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSavingWaf, setIsSavingWaf] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    
    // New ban form states
    const [newIpOrRange, setNewIpOrRange] = React.useState('');
    const [newReason, setNewReason] = React.useState('');
    const [isBanning, setIsBanning] = React.useState(false);

    // Diagnostics calculation
    const isDefaultAdmin = user?.email === 'admin@frontbase.dev';
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    
    const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '';
    const hasTurnstile = turnstileSiteKey !== '';

    // Fetch data
    const fetchSecurityData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);
        
        try {
            const [wafRes, blockRes, auditRes] = await Promise.all([
                api.get('/api/auth/security/waf'),
                api.get('/api/auth/security/blocklist'),
                api.get('/api/auth/security/audit-logs')
            ]);
            
            setWafEnabled(wafRes.data.enabled);
            setBlocklist(blockRes.data);
            setAuditLogs(auditRes.data);
        } catch (err: any) {
            console.error('Failed to load security settings:', err);
            toast({
                title: 'Error loading settings',
                description: err.response?.data?.detail || 'Failed to fetch security parameters from backend.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    React.useEffect(() => {
        fetchSecurityData();
    }, []);

    // Toggle WAF handler
    const handleWafToggle = async (checked: boolean) => {
        setIsSavingWaf(true);
        try {
            await api.post('/api/auth/security/waf', { enabled: checked });
            setWafEnabled(checked);
            toast({
                title: checked ? 'WAF Enabled' : 'WAF Disabled',
                description: checked 
                    ? 'Incoming requests are now scanned for injection and XSS patterns.' 
                    : 'Web Application Firewall inspection has been deactivated.',
            });
            // Refresh audit logs
            const auditRes = await api.get('/api/auth/security/audit-logs');
            setAuditLogs(auditRes.data);
        } catch (err: any) {
            toast({
                title: 'WAF Update Failed',
                description: err.response?.data?.detail || 'Could not update firewall settings.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingWaf(false);
        }
    };

    // Add blocklist IP ban handler
    const handleAddBan = async (e: React.FormEvent) => {
        e.preventDefault();
        const ipToBan = newIpOrRange.trim();
        if (!ipToBan) return;
        
        setIsBanning(true);
        try {
            await api.post('/api/auth/security/blocklist', {
                ip_or_range: ipToBan,
                reason: newReason.trim() || undefined
            });
            
            toast({
                title: 'IP Address Blocked',
                description: `Successfully added block rules for ${ipToBan}`,
            });
            
            setNewIpOrRange('');
            setNewReason('');
            
            // Reload blocklist & audit logs
            const [blockRes, auditRes] = await Promise.all([
                api.get('/api/auth/security/blocklist'),
                api.get('/api/auth/security/audit-logs')
            ]);
            setBlocklist(blockRes.data);
            setAuditLogs(auditRes.data);
        } catch (err: any) {
            toast({
                title: 'Operation Failed',
                description: err.response?.data?.detail || 'Verify IP formatting (e.g. 192.168.0.1 or 10.0.0.0/24).',
                variant: 'destructive',
            });
        } finally {
            setIsBanning(false);
        }
    };

    // Remove blocklist IP ban handler
    const handleRemoveBan = async (id: string, ipOrRange: string) => {
        try {
            await api.delete(`/api/auth/security/blocklist/${id}`);
            toast({
                title: 'Block Lifted',
                description: `${ipOrRange} has been unblocked.`,
            });
            
            // Reload blocklist & audit logs
            const [blockRes, auditRes] = await Promise.all([
                api.get('/api/auth/security/blocklist'),
                api.get('/api/auth/security/audit-logs')
            ]);
            setBlocklist(blockRes.data);
            setAuditLogs(auditRes.data);
        } catch (err: any) {
            toast({
                title: 'Action Failed',
                description: err.response?.data?.detail || 'Failed to remove blocklist entry.',
                variant: 'destructive',
            });
        }
    };

    // Format action labels
    const renderActionBadge = (action: string) => {
        const styleMap: Record<string, string> = {
            'LOGIN_SUCCESS': 'bg-green-500/10 text-green-600 border-green-200 dark:border-green-800',
            'IP_BANNED': 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800',
            'IP_UNBANNED': 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800',
            'WAF_TOGGLED': 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800',
            'WAF_BLOCKED': 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 font-bold',
            'WAF_AUDIT_ADMIN': 'bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800',
        };
        
        const className = styleMap[action] || 'bg-muted text-muted-foreground';
        return (
            <Badge variant="outline" className={`${className} font-medium px-2 py-0.5 rounded-full text-[10px]`}>
                {action.replace('_', ' ')}
            </Badge>
        );
    };

    // Format date string beautifully
    const formatDate = (isoString: string) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (e) {
            return isoString;
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground font-medium">Retrieving security parameters...</p>
            </div>
        );
    }

    const content = (
        <div className="space-y-6">
            <Tabs defaultValue="firewall" className="w-full space-y-6">
                <TabsList className="grid grid-cols-3 w-full max-w-[450px]">
                    <TabsTrigger value="firewall" className="gap-1.5">
                        <Bot className="h-4 w-4" />
                        Firewall & Headers
                    </TabsTrigger>
                    <TabsTrigger value="access" className="gap-1.5">
                        <Globe className="h-4 w-4" />
                        Access Control
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="gap-1.5">
                        <FileText className="h-4 w-4" />
                        Audit Trail
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: Firewall & Security Headers */}
                <TabsContent value="firewall" className="space-y-6 outline-none">
                    {/* Section 1: Security Health & Diagnostics Checklist */}
                    <div className="grid gap-4 md:grid-cols-3">
                        {/* Credentials Security */}
                        <Card className={`border-l-4 transition-all duration-200 hover:shadow-md ${isDefaultAdmin ? 'border-l-destructive bg-destructive/5' : 'border-l-green-500 bg-green-500/5'}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Administrator Account</CardTitle>
                                {isDefaultAdmin ? (
                                    <AlertTriangle className="h-4 w-4 text-destructive animate-pulse" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    {isDefaultAdmin ? 'Default Account Active' : 'Custom Account Configured'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {isDefaultAdmin 
                                        ? 'Warning: Default admin credentials are in use. Please change ADMIN_EMAIL / ADMIN_PASSWORD.' 
                                        : 'Master account email is customized and secured.'
                                    }
                                </p>
                            </CardContent>
                        </Card>

                        {/* Connection Protocol */}
                        <Card className={`border-l-4 transition-all duration-200 hover:shadow-md ${isHttps ? 'border-l-green-500 bg-green-500/5' : 'border-l-amber-500 bg-amber-500/5'}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Connection Security</CardTitle>
                                {isHttps ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    {isHttps ? 'HTTPS Connection' : 'HTTP Unsecured'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {isHttps 
                                        ? 'Traffic between browser and Edge Server is fully encrypted.' 
                                        : 'Warning: Frontbase is running over plain HTTP. Setup SSL/HTTPS for production.'
                                    }
                                </p>
                            </CardContent>
                        </Card>

                        {/* Bot Protection status */}
                        <Card className={`border-l-4 transition-all duration-200 hover:shadow-md ${hasTurnstile ? 'border-l-green-500 bg-green-500/5' : 'border-l-blue-500 bg-blue-500/5'}`}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Bot Protection Sitekey</CardTitle>
                                {hasTurnstile ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <Info className="h-4 w-4 text-blue-500" />
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold">
                                    {hasTurnstile ? 'Cloudflare Turnstile Active' : 'Honeypot Shield Only'}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {hasTurnstile 
                                        ? 'Turnstile verification is active on login and reset requests.' 
                                        : 'Default invisible honeypot shield is active. Configure Turnstile sitekeys for CAPTCHAs.'
                                    }
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Section 2: WAF Firewall & Security Headers */}
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* WAF Switch Card */}
                        <Card className="transition-all duration-200 hover:shadow-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                    <Bot className="h-5 w-5 text-primary" />
                                    Web Application Firewall (WAF)
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 rounded font-normal">
                                        Anomaly Engine
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Scan incoming write payloads for SQL Injection and Cross-Site Scripting (XSS) using recursive decoding and weighted anomaly scoring.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                                    <div className="space-y-1">
                                        <Label htmlFor="waf-toggle" className="font-semibold block cursor-pointer">
                                            Local Anomaly Inspector
                                        </Label>
                                        <span className="text-xs text-muted-foreground block">
                                            {wafEnabled ? 'Scanning JSON fields recursively (block threshold: 5).' : 'Activate payload inspection rules.'}
                                        </span>
                                    </div>
                                    <Switch
                                        id="waf-toggle"
                                        checked={wafEnabled}
                                        onCheckedChange={handleWafToggle}
                                        disabled={isSavingWaf}
                                    />
                                </div>
                                <div className="text-xs space-y-1.5 text-muted-foreground p-3 border rounded border-dashed">
                                    <p className="font-semibold text-primary">Advanced Protections:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><strong>Obfuscation Resilient:</strong> Decodes double URL encoding, HTML entities, and comment tricks.</li>
                                        <li><strong>Weighted Scoring:</strong> Isolated terms are allowed; combined malicious signals trigger block.</li>
                                        <li><strong>Admin Exemption:</strong> Design actions are logged but never blocked for authenticated admins.</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>

                        {/* HTTP Security Headers Info Card */}
                        <Card className="transition-all duration-200 hover:shadow-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                    <Sliders className="h-5 w-5 text-primary" />
                                    HTTP Security Headers
                                </CardTitle>
                                <CardDescription>
                                    Global parameters injected into HTTP response streams to harden the client browser environment.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">X-Frame-Options</span>
                                        <Badge variant="secondary" className="font-mono bg-green-500/10 text-green-600 border-none">SAMEORIGIN</Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">X-Content-Type-Options</span>
                                        <Badge variant="secondary" className="font-mono bg-green-500/10 text-green-600 border-none">nosniff</Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">Strict-Transport-Security (HSTS)</span>
                                        <Badge variant="secondary" className="font-mono bg-blue-500/10 text-blue-600 border-none">max-age=31536000</Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">Lockout Threshold</span>
                                        <Badge variant="secondary" className="font-mono bg-amber-500/10 text-amber-600 border-none">5 Failed Attempts</Badge>
                                    </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    * Strict-Transport-Security (HSTS) becomes active when <span className="font-semibold">DEPLOYMENT_MODE</span> matches production.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Tab 2: IP Blocklist Access Control */}
                <TabsContent value="access" className="space-y-6 outline-none">
                    {/* Section 3: IP Blocklist Access Control */}
                    <Card className="transition-all duration-200 hover:shadow-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                <Globe className="h-5 w-5 text-primary" />
                                IP & Range Access Control
                            </CardTitle>
                            <CardDescription>
                                Manually ban malicious IP addresses or whole network ranges using CIDR masks (e.g. 192.168.1.0/24).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <form onSubmit={handleAddBan} className="grid gap-4 md:grid-cols-3 items-end">
                                <div className="space-y-2">
                                    <Label htmlFor="ip-ban-input" className="text-xs font-semibold">IP Address or CIDR Range</Label>
                                    <Input
                                        id="ip-ban-input"
                                        placeholder="e.g. 12.34.56.78"
                                        value={newIpOrRange}
                                        onChange={(e) => setNewIpOrRange(e.target.value)}
                                        required
                                        className="h-9"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="ip-reason-input" className="text-xs font-semibold">Reason (Optional)</Label>
                                    <Input
                                        id="ip-reason-input"
                                        placeholder="Suspicious scanning, brute-forcing, etc."
                                        value={newReason}
                                        onChange={(e) => setNewReason(e.target.value)}
                                        className="h-9"
                                    />
                                </div>
                                <Button type="submit" disabled={isBanning} className="h-9 flex items-center gap-1.5 justify-center">
                                    <Plus className="h-4 w-4" />
                                    Add Ban Rule
                                </Button>
                            </form>

                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[200px]">IP / Range</TableHead>
                                            <TableHead>Reason</TableHead>
                                            <TableHead className="w-[180px]">Banned Date</TableHead>
                                            <TableHead className="w-[80px] text-center">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {blocklist.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-sm">
                                                    No active manual IP blocklist rules configured.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            blocklist.map((ban) => (
                                                <TableRow key={ban.id} className="transition-all hover:bg-muted/10">
                                                    <TableCell className="font-mono text-xs font-semibold">
                                                        <div className="flex items-center gap-2">
                                                            {ban.ip_or_range}
                                                            {ban.reason?.includes('WAF Auto-Ban') && (
                                                                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200 dark:border-red-800 text-[9px] px-1 py-0.5 rounded font-normal">
                                                                    Auto
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{ban.reason || 'None specified'}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{formatDate(ban.created_at)}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => handleRemoveBan(ban.id, ban.ip_or_range)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 3: Security Audit Trail */}
                <TabsContent value="audit" className="space-y-6 outline-none">
                    {/* Section 4: Security Audit Trail */}
                    <Card className="transition-all duration-200 hover:shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div className="space-y-1">
                                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                    <FileText className="h-5 w-5 text-primary" />
                                    Security Audit Trail
                                </CardTitle>
                                <CardDescription>
                                    Tracks administrator settings changes, ban adjustments, and authentication events.
                                </CardDescription>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-muted-foreground hover:bg-muted"
                                onClick={() => fetchSecurityData(true)}
                                disabled={isRefreshing}
                            >
                                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-hidden max-h-[350px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm border-b">
                                        <TableRow>
                                            <TableHead className="w-[180px]">Timestamp</TableHead>
                                            <TableHead className="w-[120px]">Event</TableHead>
                                            <TableHead className="w-[120px]">IP Address</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {auditLogs.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-sm">
                                                    No recent security logs captured.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            auditLogs.map((log) => (
                                                <TableRow key={log.id} className="transition-all hover:bg-muted/10">
                                                    <TableCell className="text-xs font-medium">{formatDate(log.created_at)}</TableCell>
                                                    <TableCell>{renderActionBadge(log.action)}</TableCell>
                                                    <TableCell className="font-mono text-[11px] text-muted-foreground">{log.ip_address || 'unknown'}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]" title={log.details}>
                                                        {log.details || 'No details'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {isCloud() && (
                <>
                    <Separator />
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-600 dark:text-blue-400 flex items-start gap-3">
                        <HelpCircle className="h-5 w-5 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                            <p className="font-semibold">SuperTokens Engine Enabled</p>
                            <p className="text-xs opacity-90">
                                This instance is operating in Cloud Mode. Master administrator accounts are protected via Frontbase's built-in lockout parameters, while tenant user authentication, sessions, and secondary security checks are delegated directly to SuperTokens Cloud.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-primary" />
                        Security Settings
                    </CardTitle>
                    <CardDescription>
                        Monitor brute-force lockout status, configure Web Application Firewall, block manual IP addresses, and inspect audit logs.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {content}
                </CardContent>
            </Card>
        );
    }

    return <div className="space-y-6">{content}</div>;
}
