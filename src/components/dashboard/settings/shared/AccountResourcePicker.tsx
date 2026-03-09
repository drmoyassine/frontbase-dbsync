/**
 * AccountResourcePicker
 * 
 * Shared component for Edge DB/Cache/Queue forms.
 * Flow: Select Connected Account → Discover resources → Pick resource → auto-fill form fields
 * Falls back to manual entry if no matching accounts exist.
 * 
 * Supports filtering resources by type (e.g. only 'redis' or only 'qstash')
 * and creating new resources via the management API.
 */

import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Cloud, Link2, RefreshCw, Plus } from 'lucide-react';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';

const API_BASE = '';

export interface DiscoveredResource {
    id: string;
    name: string;
    type: string;
    // Turso
    hostname?: string;
    db_url?: string;
    org?: string;
    group?: string;
    regions?: string[];
    // Upstash Redis
    endpoint?: string;
    rest_url?: string;
    rest_token?: string;
    region?: string;
    // Neon
    pg_version?: string;
    connection_uri?: string;
    // QStash
    token?: string;
    signing_key?: string;
    next_signing_key?: string;
}

// Upstash regions available for Redis creation
const UPSTASH_REGIONS = [
    { value: 'us-east-1', label: 'US East (Virginia)' },
    { value: 'us-west-1', label: 'US West (N. California)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'EU (Ireland)' },
    { value: 'eu-central-1', label: 'EU (Frankfurt)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
    { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

interface AccountResourcePickerProps {
    /** Provider types to filter accounts by (e.g. ['turso'], ['upstash'], ['neon']) */
    compatibleProviders: string[];
    /** Only show resources with this type (e.g. 'redis', 'qstash', 'turso_db') */
    resourceTypeFilter?: string;
    /** Type to create when user clicks "Create New" (e.g. 'redis') */
    createResourceType?: string;
    /** Called when a resource is selected — form should auto-fill from this */
    onResourceSelected: (resource: DiscoveredResource, accountId: string) => void;
    /** Called when user clears/resets the account selection */
    onClear?: () => void;
    /** Currently selected account ID (for edit mode) */
    selectedAccountId?: string | null;
    /** Label override */
    label?: string;
    /** Show "or enter manually" hint */
    showManualHint?: boolean;
}

export const AccountResourcePicker: React.FC<AccountResourcePickerProps> = ({
    compatibleProviders,
    resourceTypeFilter,
    createResourceType,
    onResourceSelected,
    onClear,
    selectedAccountId,
    label = 'Connected Account',
    showManualHint = true,
}) => {
    const { data: allProviders = [] } = useEdgeProviders();
    const [selectedAccount, setSelectedAccount] = useState<string>(selectedAccountId || '');
    const [resources, setResources] = useState<DiscoveredResource[]>([]);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [discoverError, setDiscoverError] = useState<string | null>(null);

    // Create new state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createRegion, setCreateRegion] = useState('us-east-1');
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Filter providers to only compatible types
    const compatibleAccounts = allProviders.filter(
        (p: any) => compatibleProviders.includes(p.provider) && p.is_active
    );

    // Auto-discover when account is selected
    useEffect(() => {
        if (selectedAccount) {
            discoverResources(selectedAccount);
        } else {
            setResources([]);
            setDiscoverError(null);
        }
    }, [selectedAccount]);

    const discoverResources = async (accountId: string) => {
        setIsDiscovering(true);
        setDiscoverError(null);
        setResources([]);
        setShowCreateForm(false);
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/discover-by-account/${accountId}`, {
                method: 'POST',
            });

            if (!res.ok) {
                throw new Error(`Discovery failed: HTTP ${res.status}`);
            }
            const data = await res.json();
            if (data.success && data.resources) {
                // Apply type filter if specified
                const filtered = resourceTypeFilter
                    ? data.resources.filter((r: DiscoveredResource) => r.type === resourceTypeFilter)
                    : data.resources;
                setResources(filtered);
            } else {
                setDiscoverError(data.detail || 'No resources found');
            }
        } catch (e: any) {
            setDiscoverError(e.message || 'Discovery failed');
        } finally {
            setIsDiscovering(false);
        }
    };

    const handleAccountChange = (value: string) => {
        if (value === '__none__') {
            setSelectedAccount('');
            setResources([]);
            setShowCreateForm(false);
            onClear?.();
            return;
        }
        setSelectedAccount(value);
    };

    const handleResourceSelect = (resourceId: string) => {
        const resource = resources.find(r => r.id === resourceId);
        if (resource) {
            onResourceSelected(resource, selectedAccount);
        }
    };

    const handleCreateNew = async () => {
        if (!createName.trim() || !createResourceType) return;
        setIsCreating(true);
        setCreateError(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-providers/create-resource-by-account/${selectedAccount}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resource_type: createResourceType,
                    name: createName.trim(),
                    region: createRegion,
                }),
            });
            const data = await res.json();
            if (data.success && data.resource) {
                // Auto-select the newly created resource
                onResourceSelected(data.resource, selectedAccount);
                setShowCreateForm(false);
                setCreateName('');
                // Refresh discover list
                discoverResources(selectedAccount);
            } else {
                setCreateError(data.detail || 'Creation failed');
            }
        } catch (e: any) {
            setCreateError(e.message || 'Creation failed');
        } finally {
            setIsCreating(false);
        }
    };

    if (compatibleAccounts.length === 0) {
        return showManualHint ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
                <Cloud className="h-3 w-3" />
                <span>No matching accounts connected.</span>
                <a href="/frontbase-admin/settings" className="underline hover:text-foreground">
                    Connect one in Settings →
                </a>
            </div>
        ) : null;
    }

    return (
        <div className="space-y-3">
            {/* Account selector */}
            <div className="space-y-1.5">
                <Label className="text-sm">{label}</Label>
                <Select value={selectedAccount || '__none__'} onValueChange={handleAccountChange}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a connected account..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">
                            <span className="text-muted-foreground">Manual entry</span>
                        </SelectItem>
                        {compatibleAccounts.map((account: any) => (
                            <SelectItem key={account.id} value={account.id}>
                                <span className="flex items-center gap-2">
                                    <Link2 className="h-3 w-3" />
                                    {account.name}
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                                        {account.provider}
                                    </Badge>
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Discover results */}
            {selectedAccount && (
                <div className="space-y-2">
                    {isDiscovering ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Discovering resources...
                        </div>
                    ) : discoverError ? (
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-destructive">{discoverError}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => discoverResources(selectedAccount)}
                            >
                                <RefreshCw className="h-3 w-3 mr-1" /> Retry
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {resources.length > 0 && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">
                                        Select a resource ({resources.length} found)
                                    </Label>
                                    <Select onValueChange={handleResourceSelect}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Pick a resource..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {resources.map(r => (
                                                <SelectItem key={r.id} value={r.id}>
                                                    <span className="flex items-center gap-2">
                                                        {r.name}
                                                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                                                            {r.type}
                                                        </Badge>
                                                        {r.region && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {r.region}
                                                            </span>
                                                        )}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {/* Create New button */}
                            {createResourceType && !showCreateForm && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => setShowCreateForm(true)}
                                >
                                    <Plus className="h-3 w-3 mr-1.5" />
                                    Create New {createResourceType === 'redis' ? 'Redis Database' : 'Resource'}
                                </Button>
                            )}

                            {/* Create new form */}
                            {showCreateForm && (
                                <div className="p-3 border border-dashed rounded-lg space-y-3 bg-muted/30">
                                    <Label className="text-xs font-medium">
                                        Create New {createResourceType === 'redis' ? 'Redis Database' : 'Resource'}
                                    </Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Name</Label>
                                            <Input
                                                placeholder="e.g. my-cache"
                                                value={createName}
                                                onChange={e => setCreateName(e.target.value)}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Region</Label>
                                            <Select value={createRegion} onValueChange={setCreateRegion}>
                                                <SelectTrigger className="h-8 text-sm">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {UPSTASH_REGIONS.map(r => (
                                                        <SelectItem key={r.value} value={r.value}>
                                                            {r.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    {createError && (
                                        <p className="text-xs text-destructive">{createError}</p>
                                    )}
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={handleCreateNew}
                                            disabled={!createName.trim() || isCreating}
                                        >
                                            {isCreating ? (
                                                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Creating...</>
                                            ) : (
                                                <><Plus className="h-3 w-3 mr-1" /> Create</>
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setShowCreateForm(false); setCreateError(null); }}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
