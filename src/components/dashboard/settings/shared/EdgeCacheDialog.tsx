/**
 * EdgeCacheDialog — Create/Edit dialog for edge cache connections.
 *
 * Extracted from EdgeCachesForm.tsx for single-responsibility compliance.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Loader2, Check, Zap, AlertTriangle, Cloud, Server } from 'lucide-react';
import { CACHE_PROVIDER_OPTIONS } from '@/hooks/useEdgeCacheForm';

const PROVIDER_ICONS: Record<string, React.ElementType> = {
    upstash: Cloud,
    redis: Server,
    dragonfly: Server,
};

interface EdgeCacheDialogProps {
    dialogOpen: boolean;
    setDialogOpen: (open: boolean) => void;
    editingId: string | null;
    error: string | null;
    // Form fields
    selectedProvider: string;
    setSelectedProvider: (v: string) => void;
    formName: string;
    setFormName: (v: string) => void;
    formUrl: string;
    setFormUrl: (v: string) => void;
    formToken: string;
    setFormToken: (v: string) => void;
    formIsDefault: boolean;
    setFormIsDefault: (v: boolean) => void;
    isSaving: boolean;
    testingId: string | null;
    // Handlers
    openCreate: () => void;
    resetForm: () => void;
    handleSave: () => void;
    handleTestInline: () => void;
}

export const EdgeCacheDialog: React.FC<EdgeCacheDialogProps> = ({
    dialogOpen, setDialogOpen, editingId, error,
    selectedProvider, setSelectedProvider,
    formName, setFormName, formUrl, setFormUrl,
    formToken, setFormToken, formIsDefault, setFormIsDefault,
    isSaving, testingId, openCreate, resetForm,
    handleSave, handleTestInline,
}) => {
    return (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" /> Connect Cache
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Cache' : 'Connect Edge Cache'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your cache connection settings.'
                            : 'Add a new cache connection for your edge deployments.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider selector */}
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {CACHE_PROVIDER_OPTIONS.map(opt => {
                                const Icon = PROVIDER_ICONS[opt.value] || Cloud;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setSelectedProvider(opt.value)}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left
                                            ${selectedProvider === opt.value
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : 'border-border hover:bg-accent'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Name + URL */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Name</Label>
                            <Input
                                placeholder={`e.g. Production ${selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)}`}
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Cache URL</Label>
                            <Input
                                placeholder={CACHE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.placeholder}
                                value={formUrl}
                                onChange={e => setFormUrl(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Auth Token */}
                    <div className="space-y-1">
                        <Label>Auth Token</Label>
                        <Input
                            type="password"
                            placeholder={editingId ? '(leave blank to keep existing)' : 'Cache auth token'}
                            value={formToken}
                            onChange={e => setFormToken(e.target.value)}
                        />
                    </div>

                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-cache-default-modal"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-cache-default-modal" className="text-sm cursor-pointer">
                            Set as default cache
                        </Label>
                    </div>

                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={!formUrl || testingId === 'inline'}
                    >
                        {testingId === 'inline' ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                        ) : (
                            <><Zap className="mr-2 h-4 w-4" /> Test Connection</>
                        )}
                    </Button>
                    <Button onClick={handleSave} disabled={!formName || !formUrl || isSaving}>
                        {isSaving ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Cache'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
