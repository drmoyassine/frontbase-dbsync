import React from 'react';
import { Mail, Save, Server, Loader2, CheckCircle2 } from 'lucide-react';
import { useEmailSettings } from '../hooks';

export function EmailProviderSettingsForm() {
    const {
        provider, setProvider,
        smtpHost, setSmtpHost,
        smtpPort, setSmtpPort,
        smtpUser, setSmtpUser,
        smtpPassword, setSmtpPassword,
        smtpSecure, setSmtpSecure,
        fromEmail, setFromEmail,
        fromName, setFromName,
        isLoading, hasChanges, isSaving, saveSuccess,
        save
    } = useEmailSettings();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading email configuration...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-foreground">Email Provider</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure the email provider for system notifications and admin invites.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Provider</label>
                        <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as any)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="smtp">Custom SMTP Server</option>
                            <option value="resend" disabled>Resend (Coming Soon)</option>
                            <option value="mailgun" disabled>Mailgun (Coming Soon)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Sender Name</label>
                        <input
                            type="text"
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Frontbase Admin"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Sender Email</label>
                        <input
                            type="email"
                            value={fromEmail}
                            onChange={(e) => setFromEmail(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="noreply@mycompany.com"
                        />
                    </div>
                </div>

                {provider === 'smtp' && (
                    <div className="space-y-4 bg-muted/30 p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-2">
                            <Server className="w-5 h-5 text-muted-foreground" />
                            <h4 className="font-medium text-foreground">SMTP Configuration</h4>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2 space-y-2">
                                <label className="text-sm font-medium text-foreground">SMTP Host</label>
                                <input
                                    type="text"
                                    value={smtpHost}
                                    onChange={(e) => setSmtpHost(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
                                    placeholder="smtp.example.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Port</label>
                                <input
                                    type="number"
                                    value={smtpPort}
                                    onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">SMTP Username</label>
                            <input
                                type="text"
                                value={smtpUser}
                                onChange={(e) => setSmtpUser(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
                                placeholder="postmaster@yourdomain.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">SMTP Password</label>
                            <input
                                type="password"
                                value={smtpPassword}
                                onChange={(e) => setSmtpPassword(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm"
                                placeholder="••••••••••••"
                            />
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                            <input
                                type="checkbox"
                                id="smtpSecure"
                                checked={smtpSecure}
                                onChange={(e) => setSmtpSecure(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <label htmlFor="smtpSecure" className="text-sm font-medium text-foreground">
                                Use Secure Connection (TLS/SSL)
                            </label>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-border mt-8">
                <div className="text-sm text-muted-foreground">
                    {saveSuccess && !hasChanges && (
                        <span className="flex items-center text-green-600 dark:text-green-400">
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Settings saved successfully
                        </span>
                    )}
                </div>

                <button
                    onClick={save}
                    disabled={!hasChanges || isSaving}
                    className="flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Provider Configuration
                </button>
            </div>
        </div>
    );
}
