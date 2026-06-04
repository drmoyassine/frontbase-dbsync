/**
 * SecuritySettingsForm
 * 
 * Renders security diagnostics and status panels for self-hosted and cloud deployments.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/stores/auth';
import { 
    Shield, 
    Lock, 
    Bot, 
    Key, 
    AlertTriangle, 
    CheckCircle2, 
    HelpCircle, 
    Info, 
    ExternalLink 
} from 'lucide-react';
import { isCloud } from '@/lib/edition';

interface SecuritySettingsFormProps {
    withCard?: boolean;
}

export function SecuritySettingsForm({ withCard = false }: SecuritySettingsFormProps) {
    const { user } = useAuthStore();
    
    // 1. Diagnostics calculations
    const isDefaultAdmin = user?.email === 'admin@frontbase.dev';
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    
    const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '';
    const hasTurnstile = turnstileSiteKey !== '';

    const content = (
        <div className="space-y-6">
            {/* Section 1: Security Health & Diagnostics Checklist */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Credentials Security */}
                <Card className={`border-l-4 ${isDefaultAdmin ? 'border-l-destructive bg-destructive/5' : 'border-l-green-500 bg-green-500/5'}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Administrator Account</CardTitle>
                        {isDefaultAdmin ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
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
                <Card className={`border-l-4 ${isHttps ? 'border-l-green-500 bg-green-500/5' : 'border-l-amber-500 bg-amber-500/5'}`}>
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
                <Card className={`border-l-4 ${hasTurnstile ? 'border-l-green-500 bg-green-500/5' : 'border-l-blue-500 bg-blue-500/5'}`}>
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

            <Separator />

            {/* Section 2: Protection Mechanics */}
            <div className="space-y-4">
                <div>
                    <Label className="text-base font-semibold flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Brute Force Attack Defense
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                        Secures the administration control panel endpoints against automated dictionary attacks.
                    </p>
                </div>

                <div className="rounded-lg border p-4 bg-muted/20">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">Policy Status</span>
                            <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">Active & Guarding</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">Failed Attempts Threshold</span>
                            <span className="text-muted-foreground">5 Failed Requests</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">Lockout Duration</span>
                            <span className="text-muted-foreground">15 Minutes (Temporary IP & Email ban)</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">Target Routes Locked</span>
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">/login, /forgot-password, /reset-password</span>
                        </div>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Section 3: Bot Protection details */}
            <div className="space-y-4">
                <div>
                    <Label className="text-base font-semibold flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        Antispam & Bot Honeypot Shield
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                        Detects and discards malicious headless bots from spamming authentication routers.
                    </p>
                </div>

                <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <div className="text-sm">
                            <span className="font-semibold block">Invisible Honeypot Shield Active</span>
                            <span className="text-muted-foreground text-xs mt-0.5 block">
                                Authentication forms render hidden fields that automated spam-scripts fill out. The backend identifies these and instantly rejects the connection.
                            </span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-2">
                        <Key className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="text-sm">
                            <span className="font-semibold block">Turnstile Setup (Optional)</span>
                            <span className="text-muted-foreground text-xs mt-0.5 block">
                                To show visible CAPTCHA validations, add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` variables to your server environment (.env).
                            </span>
                        </div>
                    </div>
                </div>
            </div>

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
                        Monitor brute-force lockout status, bot honeypot configuration, and connection protocol security checks.
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
