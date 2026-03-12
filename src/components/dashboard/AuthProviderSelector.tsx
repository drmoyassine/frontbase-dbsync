import React, { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Loader2, AlertCircle, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import {
  AUTH_CAPABLE_PROVIDERS,
  PROVIDER_CONFIGS,
  PROVIDER_ICONS,
} from '@/components/dashboard/settings/shared/edgeConstants';
import { ConnectProviderDialog } from '@/components/dashboard/settings/shared/ConnectProviderDialog';
import { useQueryClient } from '@tanstack/react-query';

interface AuthProviderSelectorProps {
    value?: string; // provider account ID
    onValueChange: (accountId: string | null) => void;
}

export function AuthProviderSelector({ value, onValueChange }: AuthProviderSelectorProps) {
    const { data: allProviders = [], isLoading, error } = useEdgeProviders();
    const queryClient = useQueryClient();
    const [connectOpen, setConnectOpen] = React.useState(false);

    // Filter for connected accounts that support auth
    const authProviders = React.useMemo(
        () => allProviders.filter(p => AUTH_CAPABLE_PROVIDERS.includes(p.provider)),
        [allProviders]
    );

    useEffect(() => {
        // Auto-select if none selected and exactly one exists
        if (!value && authProviders.length === 1) {
            onValueChange(authProviders[0].id);
        }
    }, [authProviders, value, onValueChange]);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching for auth providers...
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                    Failed to load auth providers. Please check your connection.
                </AlertDescription>
            </Alert>
        );
    }

    const selectedProvider = authProviders.find(p => p.id === value);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Auth Provider</Label>
                {selectedProvider && (
                    <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200 gap-1 font-normal">
                        <ShieldCheck className="h-3 w-3" />
                        Connected
                    </Badge>
                )}
            </div>

            {authProviders.length === 0 ? (
                <div className="space-y-2">
                    <Alert className="py-2 bg-slate-50">
                        <AlertCircle className="h-4 w-4 text-slate-500" />
                        <AlertDescription className="text-xs text-slate-600">
                            No auth provider connected. Connect one to enable user management.
                        </AlertDescription>
                    </Alert>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setConnectOpen(true)}
                    >
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Connect Auth Provider
                    </Button>
                </div>
            ) : (
                <Select value={value || ''} onValueChange={(val) => onValueChange(val || null)}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Auth Provider" />
                    </SelectTrigger>
                    <SelectContent>
                        {authProviders.map((provider) => {
                            const config = PROVIDER_CONFIGS[provider.provider];
                            const Icon = PROVIDER_ICONS[provider.provider];
                            return (
                                <SelectItem key={provider.id} value={provider.id}>
                                    <div className="flex items-center gap-2">
                                        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                                        <span>{provider.name}</span>
                                        <span className="text-xs text-muted-foreground">({config?.label || provider.provider})</span>
                                    </div>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            )}

            <ConnectProviderDialog
                open={connectOpen}
                onOpenChange={setConnectOpen}
                allowedProviders={AUTH_CAPABLE_PROVIDERS}
                onConnected={() => {
                    queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
                }}
            />
        </div>
    );
}
