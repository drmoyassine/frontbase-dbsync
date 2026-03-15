import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { HardDrive, Plus, Trash2 } from 'lucide-react';
import { FileBrowser } from './FileBrowser';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  STORAGE_CAPABLE_PROVIDERS,
  PROVIDER_CONFIGS,
  PROVIDER_ICONS,
  EDGE_STORAGE_PROVIDERS,
} from '@/components/dashboard/settings/shared/edgeConstants';
import { ConnectProviderDialog } from '@/components/dashboard/settings/shared/ConnectProviderDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEdgeProviders } from '@/hooks/useEdgeInfrastructure';
import api from '@/services/api-service';

// ── API ───────────────────────────────────────────────────────────────

interface StorageProviderRecord {
  id: string;
  name: string;
  provider: string;
  provider_account_id: string;
  account_name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string | null;
}

const storageProvidersApi = {
  list: async (): Promise<StorageProviderRecord[]> => {
    const res = await api.get('/api/storage/providers/');
    return res.data;
  },
  create: async (data: { provider_account_id: string; name?: string }): Promise<StorageProviderRecord> => {
    const res = await api.post('/api/storage/providers/', data);
    return res.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/storage/providers/${id}`);
  },
};

// ── Hook ──────────────────────────────────────────────────────────────

function useStorageProviders() {
  return useQuery({
    queryKey: ['storage-providers'],
    queryFn: storageProvidersApi.list,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

// ── Add-Storage Dialog — Unified with provider tabs ───────────────────

const STORAGE_PROVIDER_OPTIONS = EDGE_STORAGE_PROVIDERS;

function AddStorageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: allAccounts = [] } = useEdgeProviders();
  const { data: existingProviders = [] } = useStorageProviders();
  const [selectedProvider, setSelectedProvider] = React.useState<string>('cloudflare');
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>('');
  const [connectOpen, setConnectOpen] = React.useState(false);

  // Filter accounts by selected provider
  const availableAccounts = React.useMemo(() => {
    const prov = STORAGE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
    if (!prov?.accountProvider) return [];
    const existingIds = new Set(existingProviders.map(p => p.provider_account_id));
    return allAccounts.filter(
      a => a.provider === prov.accountProvider && !existingIds.has(a.id)
    );
  }, [allAccounts, existingProviders, selectedProvider]);

  const createMutation = useMutation({
    mutationFn: storageProvidersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-providers'] });
      toast.success('Storage provider added');
      setSelectedAccountId('');
      onOpenChange(false);
    },
    onError: () => toast.error('Failed to add storage provider'),
  });

  const handleAdd = () => {
    if (!selectedAccountId) return;
    createMutation.mutate({ provider_account_id: selectedAccountId });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Storage Provider</DialogTitle>
            <DialogDescription>
              Select a provider and connect an account for file storage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Provider tabs — 3 col grid matching DB/Cache/Queue */}
            <div className="space-y-2">
              <Label>Provider</Label>
              <div className="grid grid-cols-3 gap-2">
                {STORAGE_PROVIDER_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { opt.active && setSelectedProvider(opt.value); setSelectedAccountId(''); }}
                      disabled={!opt.active}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left relative
                        ${selectedProvider === opt.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : opt.active
                            ? 'border-border hover:bg-accent'
                            : 'border-border opacity-50 cursor-not-allowed'
                        }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{opt.label}</span>
                      {!opt.active && (
                        <Badge variant="outline" className="text-[10px] ml-auto px-1.5 py-0">Soon</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Account picker — scoped to selected provider */}
            {(() => {
              const prov = STORAGE_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
              if (!prov?.active || !prov.accountProvider) return null;

              return availableAccounts.length > 0 ? (
                <div className="space-y-3">
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAccounts.map(a => {
                        const config = PROVIDER_CONFIGS[a.provider];
                        const AcctIcon = PROVIDER_ICONS[a.provider];
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            <div className="flex items-center gap-2">
                              {AcctIcon && <AcctIcon className="h-4 w-4" />}
                              <span>{a.name}</span>
                              <span className="text-xs text-muted-foreground">({config?.label || a.provider})</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="text-center space-y-3 py-4">
                  <p className="text-sm text-muted-foreground">
                    No {prov.label} accounts available. Connect one first.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Connect {PROVIDER_CONFIGS[prov.accountProvider]?.label || prov.label} Account
                  </Button>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)}>
              Connect New Account
            </Button>
            <Button
              size="sm"
              disabled={!selectedAccountId || createMutation.isPending}
              onClick={handleAdd}
            >
              {createMutation.isPending ? 'Adding...' : 'Add Storage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConnectProviderDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        allowedProviders={STORAGE_CAPABLE_PROVIDERS}
        onConnected={() => {
          queryClient.invalidateQueries({ queryKey: ['edge-providers'] });
        }}
      />
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────

export const StoragePanel: React.FC = () => {
  const { data: storageProviders = [], isLoading } = useStorageProviders();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [activeProviderId, setActiveProviderId] = React.useState<string | null>(null);

  // Auto-select first provider
  React.useEffect(() => {
    if (!activeProviderId && storageProviders.length > 0) {
      setActiveProviderId(storageProviders[0].id);
    }
  }, [storageProviders, activeProviderId]);

  const deleteMutation = useMutation({
    mutationFn: storageProvidersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage-providers'] });
      toast.success('Storage provider removed');
      setActiveProviderId(null);
    },
    onError: () => toast.error('Failed to remove storage provider'),
  });

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Remove storage provider "${name}"?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storage</h1>
          <p className="text-muted-foreground">
            Manage files and media with your storage providers
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Storage
        </Button>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {storageProviders.length === 0 && !isLoading ? (
          <Card className="col-span-full flex flex-col items-center justify-center py-12 border-dashed">
            <HardDrive className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No storage providers added</p>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Storage Provider
            </Button>
          </Card>
        ) : (
          storageProviders.map(sp => {
            const config = PROVIDER_CONFIGS[sp.provider];
            const Icon = PROVIDER_ICONS[sp.provider] || HardDrive;
            const isActive = activeProviderId === sp.id;
            return (
              <Card
                key={sp.id}
                className={`flex flex-col cursor-pointer transition-all shadow-sm ${
                  isActive
                    ? 'ring-2 ring-primary border-primary/50'
                    : 'border-muted-foreground/10 hover:border-primary/30'
                }`}
                onClick={() => setActiveProviderId(sp.id)}
              >
                <CardHeader className="pb-2 flex-shrink-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="p-2 bg-primary/5 rounded-lg">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant={isActive ? 'default' : 'secondary'} className="font-medium text-xs">
                      {isActive ? 'Active' : 'Connected'}
                    </Badge>
                  </div>
                  <CardTitle className="text-base">{sp.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {config?.label || sp.provider} · {sp.account_name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex flex-col justify-end pt-0 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(sp.id, sp.name);
                    }}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* File Browser — scoped to active provider */}
      {activeProviderId && <FileBrowser storageProviderId={activeProviderId} />}

      <AddStorageDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
};