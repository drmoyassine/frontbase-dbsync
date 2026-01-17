import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { datasourcesApi } from '@/modules/dbsync/api/datasources';
import { Datasource } from '@/modules/dbsync/types';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AuthProviderSelectorProps {
    value?: string; // dataSourceId
    onValueChange: (datasourceId: string | null) => void;
}

export function AuthProviderSelector({ value, onValueChange }: AuthProviderSelectorProps) {
    const { data: datasources = [], isLoading, error } = useQuery({
        queryKey: ['datasources-auth-providers'],
        queryFn: () => datasourcesApi.list().then(res => res.data),
    });

    // Filter for datasources that can act as auth providers
    // For MVP: type 'supabase' is the only one
    const authProviders = datasources.filter(ds => ds.type === 'supabase');

    useEffect(() => {
        // Auto-select Supabase if none selected and exactly one exists
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
                        Auto-detected
                    </Badge>
                )}
            </div>

            {authProviders.length === 0 ? (
                <Alert className="py-2 bg-slate-50">
                    <AlertCircle className="h-4 w-4 text-slate-500" />
                    <AlertDescription className="text-xs text-slate-600">
                        No Supabase datasource found. Please add one in DB Sync settings.
                    </AlertDescription>
                </Alert>
            ) : (
                <Select value={value || ''} onValueChange={(val) => onValueChange(val || null)}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Auth Provider" />
                    </SelectTrigger>
                    <SelectContent>
                        {authProviders.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                                <div className="flex items-center gap-2">
                                    <span>{provider.name}</span>
                                    <span className="text-xs text-muted-foreground">({provider.type})</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
}
