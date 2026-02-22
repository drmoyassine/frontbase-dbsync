/**
 * TursoSettingsForm
 * 
 * Form component for Turso Edge Database configuration.
 * Mirrors RedisSettingsForm pattern.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, X, Database, ExternalLink, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTursoSettings } from '../hooks/useTursoSettings';

interface TursoSettingsFormProps {
    withCard?: boolean;
}

export const TursoSettingsForm: React.FC<TursoSettingsFormProps> = ({ withCard = false }) => {
    const {
        tursoEnabled,
        tursoUrl,
        tursoToken,
        setTursoEnabled,
        setTursoUrl,
        setTursoToken,
        isLoading,
        hasChanges,
        testResult,
        save,
        testConnection,
        isSaving,
        isTesting,
        saveSuccess,
    } = useTursoSettings();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const formContent = (
        <div className="space-y-6">
            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label htmlFor="turso-enabled" className="text-base">Enable Turso</Label>
                    <p className="text-sm text-muted-foreground">
                        Use Turso as the edge state database instead of local SQLite
                    </p>
                </div>
                <Switch
                    id="turso-enabled"
                    checked={tursoEnabled}
                    onCheckedChange={setTursoEnabled}
                />
            </div>

            {tursoEnabled && (
                <>
                    {/* Database URL */}
                    <div className="space-y-2">
                        <Label htmlFor="turso-url">Database URL</Label>
                        <Input
                            id="turso-url"
                            placeholder="libsql://your-db-name.turso.io"
                            value={tursoUrl}
                            onChange={(e) => setTursoUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Found in your Turso dashboard under the database details
                        </p>
                    </div>

                    {/* Auth Token */}
                    <div className="space-y-2">
                        <Label htmlFor="turso-token">Auth Token</Label>
                        <Input
                            id="turso-token"
                            type="password"
                            placeholder="Your database auth token"
                            value={tursoToken}
                            onChange={(e) => setTursoToken(e.target.value)}
                        />
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <Alert variant={testResult.success ? 'default' : 'destructive'}>
                            {testResult.success ? (
                                <Check className="h-4 w-4" />
                            ) : (
                                <X className="h-4 w-4" />
                            )}
                            <AlertDescription>{testResult.message}</AlertDescription>
                        </Alert>
                    )}

                    {/* Info */}
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                            When Turso is enabled, published pages are stored in your Turso database
                            instead of the local SQLite file. The publish strategy auto-detects this setting.
                        </AlertDescription>
                    </Alert>
                </>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
                {tursoEnabled && (
                    <Button
                        variant="outline"
                        onClick={testConnection}
                        disabled={isTesting || !tursoUrl || !tursoToken}
                    >
                        {isTesting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Testing...
                            </>
                        ) : (
                            'Test Connection'
                        )}
                    </Button>
                )}

                <Button
                    onClick={save}
                    disabled={!hasChanges || isSaving}
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : saveSuccess ? (
                        <>
                            <Check className="mr-2 h-4 w-4" />
                            Saved
                        </>
                    ) : (
                        'Save Changes'
                    )}
                </Button>

                <Button variant="ghost" size="sm" asChild>
                    <a href="https://turso.tech" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Turso Dashboard
                    </a>
                </Button>
            </div>
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Turso Edge Database
                    </CardTitle>
                    <CardDescription>
                        Configure Turso as your remote edge state database for cloud deployments
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
