/**
 * EdgeDatabasesForm
 * 
 * CRUD management for named edge database connections.
 * Uses Dialog modal for create/edit (same pattern as EdgeCachesForm/EdgeQueuesForm).
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    Plus, Database, Loader2, Trash2,
    Pencil, AlertTriangle, Star, Shield, Zap, Check, Layers,
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEdgeDatabases } from '@/hooks/useEdgeInfrastructure';
import { useQueryClient } from '@tanstack/react-query';
import { showTestToast, TestResult } from './edgeTestToast';
import { DeleteResourceDialog, BulkDeleteResourceDialog } from './DeleteResourceDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { AccountResourcePicker, DiscoveredResource } from './AccountResourcePicker';
import { edgeInfrastructureApi } from '@/hooks/useEdgeInfrastructure';
import { PROVIDER_ICONS, EDGE_DATABASE_PROVIDERS, ProviderBadge } from './edgeConstants';
import { EdgeResourceRow } from './EdgeResourceRow';

const API_BASE = '';

interface EdgeDatabase {
    id: string;
    name: string;
    provider: string;
    db_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system?: boolean;
    provider_account_id?: string | null;
    account_name?: string | null;
    created_at: string;
    updated_at: string;
    target_count: number;
    linked_engines?: { id: string; name: string; provider: string }[];
    supports_remote_delete?: boolean;
    schema_name?: string | null;
}

interface EdgeDatabasesFormProps {
    withCard?: boolean;
}

/** Providers derived from the centralized EDGE_DATABASE_PROVIDERS registry in edgeConstants.tsx */
const DB_PROVIDER_OPTIONS = EDGE_DATABASE_PROVIDERS;

export const EdgeDatabasesForm: React.FC<EdgeDatabasesFormProps> = ({ withCard = false }) => {
    const queryClient = useQueryClient();
    const { data: databases = [], isLoading } = useEdgeDatabases();
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form fields
    const [selectedProvider, setSelectedProvider] = useState<string>('turso');
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Test connection
    const [testingId, setTestingId] = useState<string | null>(null);

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Account link
    const [formAccountId, setFormAccountId] = useState<string | null>(null);

    // Bulk select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);

    // PG schema isolation
    const [formSchemaName, setFormSchemaName] = useState<string | null>(null);
    const [discoveredSchemas, setDiscoveredSchemas] = useState<{id: string; name: string; has_role?: boolean}[]>([]);
    const [isDiscoveringSchemas, setIsDiscoveringSchemas] = useState(false);
    const [schemaDiscoverError, setSchemaDiscoverError] = useState<string | null>(null);
    const [showCreateSchema, setShowCreateSchema] = useState(false);
    const [createSchemaSuffix, setCreateSchemaSuffix] = useState('');
    const [isCreatingSchema, setIsCreatingSchema] = useState(false);
    // Scoped PG role credentials (set by create-schema or reset-role-password)
    const [formRoleName, setFormRoleName] = useState<string | null>(null);
    const [formRolePassword, setFormRolePassword] = useState<string | null>(null);

    const selectableDBs = databases.filter(d => !d.is_system);
    const allSelected = selectableDBs.length > 0 && selectableDBs.every(d => selectedIds.has(d.id));
    const toggleSelect = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(selectableDBs.map(d => d.id)));
    };

    const refetchDatabases = () => queryClient.invalidateQueries({ queryKey: ['edge-databases'] });

    const resetForm = () => {
        setEditingId(null);
        setSelectedProvider('turso');
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setFormAccountId(null);
        setFormSchemaName(null);
        setDiscoveredSchemas([]);
        setSchemaDiscoverError(null);
        setShowCreateSchema(false);
        setCreateSchemaSuffix('');
        setFormRoleName(null);
        setFormRolePassword(null);
        setError(null);
    };

    const openCreate = () => {
        resetForm();
        setDialogOpen(true);
    };

    const openEdit = (db: EdgeDatabase) => {
        setEditingId(db.id);
        setSelectedProvider(db.provider);
        setFormName(db.name);
        setFormUrl(db.db_url);
        setFormToken('');
        setFormIsDefault(db.is_default);
        setFormAccountId(db.provider_account_id || null);
        setDialogOpen(true);
    };

    // Save (create or update)
    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const payload: any = {
                name: formName,
                provider: selectedProvider,
                db_url: formUrl,
                is_default: formIsDefault,
            };
            if (formToken) payload.db_token = formToken;
            if (formAccountId) payload.provider_account_id = formAccountId;
            if (formSchemaName) payload.schema_name = formSchemaName;
            if (formRoleName) payload.role_name = formRoleName;
            if (formRolePassword) payload.role_password = formRolePassword;

            const url = editingId
                ? `${API_BASE}/api/edge-databases/${editingId}`
                : `${API_BASE}/api/edge-databases/`;
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            resetForm();
            setDialogOpen(false);
            refetchDatabases();
            if (data.warning) {
                toast.warning(data.warning);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Delete
    const handleDelete = async (id: string, deleteRemote: boolean = false) => {
        setDeletingId(id);
        try {
            const url = deleteRemote
                ? `${API_BASE}/api/edge-databases/${id}?delete_remote=true`
                : `${API_BASE}/api/edge-databases/${id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            refetchDatabases();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    // Bulk Delete
    const handleBulkDelete = async (deleteRemote: boolean) => {
        setBulkLoading(true);
        try {
            const result = await edgeInfrastructureApi.batchDeleteDatabases([...selectedIds], deleteRemote);
            if (result.failed.length > 0) {
                toast.error(`${result.failed.length} database(s) failed to delete`);
            }
            if (result.success.length > 0) {
                toast.success(`${result.success.length} database(s) deleted`);
            }
            setSelectedIds(new Set());
            refetchDatabases();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBulkLoading(false);
        }
    };

    // Test saved DB
    const handleTest = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/${id}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            const db = databases.find(d => d.id === id);
            const label = DB_PROVIDER_OPTIONS.find(p => p.value === db?.provider)?.label || 'Database';
            showTestToast(data, label);
        } catch (e: any) {
            showTestToast({ success: false, message: e.message }, 'Database');
        } finally { setTestingId(null); }
    };

    // Test inline (before saving)
    const handleTestInline = async () => {
        setTestingId('inline');
        try {
            const providerLabel = DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.label || 'Database';

            if (editingId && !formToken) {
                const res = await fetch(`${API_BASE}/api/edge-databases/${editingId}/test`, { method: 'POST' });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            } else {
                const res = await fetch(`${API_BASE}/api/edge-databases/test-connection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formName || 'Test',
                        provider: selectedProvider,
                        db_url: formUrl,
                        db_token: formToken || null,
                        provider_account_id: formAccountId || null,
                    }),
                });
                const data: TestResult = await res.json();
                showTestToast(data, providerLabel);
            }
        } catch (e: any) {
            showTestToast({ success: false, message: e.message }, 'Database');
        } finally { setTestingId(null); }
    };

    const getProviderIcon = (provider: string) => {
        const Icon = PROVIDER_ICONS[provider] || Database;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ─── Dialog modal for create / edit ───
    const dbDialog = (
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
                <Button size="sm" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" /> Connect Database
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Database' : 'Connect Edge Database'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your database connection settings.'
                            : 'Add a database connection for your edge deployments.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Provider buttons — derived from EDGE_DATABASE_PROVIDERS registry */}
                    {!editingId && (
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {DB_PROVIDER_OPTIONS.map(opt => {
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={!opt.active}
                                            onClick={() => { opt.active && setSelectedProvider(opt.value); setFormAccountId(null); setFormUrl(''); setFormToken(''); setFormName(''); }}
                                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors text-left
                                                ${!opt.active
                                                    ? 'border-border opacity-50 cursor-not-allowed'
                                                    : selectedProvider === opt.value
                                                        ? 'border-primary bg-primary/5 text-primary'
                                                        : 'border-border hover:bg-accent'
                                                }`}
                                        >
                                            <Icon className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{opt.label}</span>
                                            {!opt.active && (
                                                <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Soon</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Account resource picker — PRIMARY for active providers */}
                    {(() => {
                        const prov = DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider);
                        if (!prov?.active || !prov.accountProvider || editingId) return null;
                        return (
                            <AccountResourcePicker
                                key={selectedProvider}
                                compatibleProviders={[prov.accountProvider]}
                                resourceTypeFilter={prov.resourceTypeFilter}
                                label={`Select ${prov.label} Database`}
                                existingUrls={
                                    // PG providers support schema isolation — same project can connect multiple times
                                    ['supabase', 'neon', 'postgres'].includes(selectedProvider)
                                        ? []
                                        : databases.map(d => d.db_url).filter(Boolean)
                                }
                                autoSelectSingle
                                resourceLabel="Select Database"
                                hideConnectDisplayName={!prov.createResourceType}
                                createResourceType={prov.createResourceType}
                                onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                    setFormAccountId(accountId);
                                    // Resolve URL from best available field
                                    const url = resource.connection_uri || resource.db_url
                                        || (resource.hostname ? `libsql://${resource.hostname}` : '')
                                        || resource.id || '';
                                    if (url) setFormUrl(url);
                                    if ((resource as any).token) setFormToken((resource as any).token);
                                    if (!formName) setFormName(resource.name || '');
                                    // Auto-discover PG schemas for PG-based providers
                                    if (['supabase', 'neon', 'postgres'].includes(selectedProvider) && url) {
                                        setIsDiscoveringSchemas(true);
                                        setSchemaDiscoverError(null);
                                        fetch(`${API_BASE}/api/edge-databases/discover-schemas`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ db_url: url, provider: selectedProvider, provider_account_id: accountId }),
                                        })
                                            .then(r => r.json())
                                            .then(data => {
                                                if (data.schemas) {
                                                    setDiscoveredSchemas(data.schemas);
                                                } else {
                                                    setSchemaDiscoverError(data.detail || 'Could not discover schemas');
                                                }
                                            })
                                            .catch(e => setSchemaDiscoverError(e.message))
                                            .finally(() => setIsDiscoveringSchemas(false));
                                    }
                                }}
                                onClear={() => {
                                    setFormAccountId(null);
                                    setFormUrl('');
                                    setFormToken('');
                                }}
                            />
                        );
                    })()}

                    {/* PG Schema Picker — shown for PG-based providers after resource is picked */}
                    {formAccountId && ['supabase', 'neon', 'postgres'].includes(selectedProvider) && !editingId && (
                        <div className="space-y-2">
                            <Label className="text-sm flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5" />
                                State Schema
                            </Label>
                            {isDiscoveringSchemas ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Discovering schemas...
                                </div>
                            ) : (
                                <>
                                    <select
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                        value={formSchemaName || ''}
                                        onChange={(e) => {
                                            if (e.target.value === '__create_new__') {
                                                setShowCreateSchema(true);
                                                setCreateSchemaSuffix('');
                                            } else {
                                                setFormSchemaName(e.target.value || null);
                                                // For Supabase: reset role password for existing schema (re-import)
                                                if (e.target.value && selectedProvider === 'supabase' && formAccountId) {
                                                    (async () => {
                                                        try {
                                                            const res = await fetch(`${API_BASE}/api/edge-databases/reset-role-password`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ db_url: formUrl, schema_name: e.target.value, provider_account_id: formAccountId }),
                                                            });
                                                            const data = await res.json();
                                                            if (res.ok && data.role_name) {
                                                                setFormRoleName(data.role_name);
                                                                setFormRolePassword(data.role_password);
                                                            }
                                                        } catch { /* non-blocking */ }
                                                    })();
                                                } else {
                                                    setFormRoleName(null);
                                                    setFormRolePassword(null);
                                                }
                                                setShowCreateSchema(false);
                                            }
                                        }}
                                    >
                                        <option value="">Default (frontbase_edge)</option>
                                        {discoveredSchemas.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                        <option value="__create_new__">+ Create New Schema</option>
                                    </select>

                                    {showCreateSchema && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-muted-foreground whitespace-nowrap">frontbase_edge_</span>
                                            <Input
                                                placeholder="staging"
                                                value={createSchemaSuffix}
                                                onChange={e => setCreateSchemaSuffix(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                                className="flex-1"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={!createSchemaSuffix || isCreatingSchema}
                                                onClick={async () => {
                                                    setIsCreatingSchema(true);
                                                    try {
                                                        const res = await fetch(`${API_BASE}/api/edge-databases/create-schema`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ db_url: formUrl, suffix: createSchemaSuffix, provider: selectedProvider, provider_account_id: formAccountId }),
                                                        });
                                                        const data = await res.json();
                                                        if (res.ok && data.schema_name) {
                                                            setFormSchemaName(data.schema_name);
                                                            // Store scoped role creds from Supabase create
                                                            if (data.role_name) setFormRoleName(data.role_name);
                                                            if (data.role_password) setFormRolePassword(data.role_password);
                                                            setDiscoveredSchemas(prev => [...prev, { id: data.schema_name, name: data.schema_name, has_role: !!data.role_name }]);
                                                            setShowCreateSchema(false);
                                                            setCreateSchemaSuffix('');
                                                        } else {
                                                            setError(data.detail || 'Failed to create schema');
                                                        }
                                                    } catch (e: any) {
                                                        setError(e.message);
                                                    } finally {
                                                        setIsCreatingSchema(false);
                                                    }
                                                }}
                                            >
                                                {isCreatingSchema ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create'}
                                            </Button>
                                        </div>
                                    )}

                                    {formSchemaName && (
                                        <p className="text-xs text-muted-foreground">
                                            All edge state will be stored in the <code>{formSchemaName}</code> PostgreSQL schema.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Auto-discovered summary — show when resource picked from account */}
                    {formAccountId && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                                    <Check className="h-4 w-4" />
                                    Credentials auto-filled from connected account
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">URL and auth token are configured automatically.</p>
                            </div>
                            <div className="space-y-1">
                                <Label>Connection Name</Label>
                                <Input
                                    placeholder={`e.g. Production ${selectedProvider?.charAt(0).toUpperCase()}${selectedProvider?.slice(1) || ''}`}
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Manual fields — only for inactive providers or edit mode */}
                    {(!DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.active || editingId) && !formAccountId && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label>Name</Label>
                                    <Input
                                        placeholder={`e.g. Production ${selectedProvider?.charAt(0).toUpperCase()}${selectedProvider?.slice(1) || ''}`}
                                        value={formName}
                                        onChange={e => setFormName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Database URL</Label>
                                    <Input
                                        placeholder={DB_PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.placeholder}
                                        value={formUrl}
                                        onChange={e => setFormUrl(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label>Auth Token</Label>
                                <Input
                                    type="password"
                                    placeholder={editingId ? '(leave blank to keep existing)' : 'Database auth token'}
                                    value={formToken}
                                    onChange={e => setFormToken(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-db-default"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-db-default" className="text-sm cursor-pointer">
                            Set as default database
                        </Label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={(!formUrl && !formAccountId) || testingId === 'inline'}
                    >
                        {testingId === 'inline' ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                        ) : (
                            <><Zap className="mr-2 h-4 w-4" /> Test Connection</>
                        )}
                    </Button>
                    <Button onClick={handleSave} disabled={!formName || (!formUrl && !formAccountId) || isSaving}>
                        {isSaving ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                        ) : (
                            <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Database'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    const formContent = (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Existing databases list */}
            {databases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No edge databases configured</p>
                    <p className="text-sm mt-1">Add a database to store your published pages</p>
                </div>
            ) : (
                <>
                {/* ── Bulk Action Bar ─────────────────────────── */}
                <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                        id="select-all-dbs"
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableDBs.length === 0}
                    />
                    <label htmlFor="select-all-dbs" className="text-xs text-muted-foreground cursor-pointer">
                        {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                    </label>
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs gap-1.5"
                                onClick={() => setBulkDeleteOpen(true)}
                                disabled={bulkLoading}
                            >
                                <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                        </div>
                    )}
                </div>
                <div className="space-y-3">
                    {databases.map((db) => {
                        const providerLabel = DB_PROVIDER_OPTIONS.find(p => p.value === db.provider)?.label;
                        const Icon = PROVIDER_ICONS[db.provider] || Database;
                        return (
                        <EdgeResourceRow
                            key={db.id}
                            icon={<Icon className="w-5 h-5" />}
                            name={db.name}
                            subtitle={providerLabel}
                            selectable={!db.is_system}
                            selected={selectedIds.has(db.id)}
                            onSelectChange={() => toggleSelect(db.id)}
                            showSelectSpacer={db.is_system}
                            badges={<>
                                {db.is_default && !db.is_system && (
                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                        <Star className="h-3 w-3" /> Default
                                    </Badge>
                                )}
                                {db.is_system && (
                                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                        <Shield className="h-3 w-3" /> System
                                    </Badge>
                                )}
                                {db.has_token && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                        <Shield className="w-2.5 h-2.5" /> Encrypted
                                    </Badge>
                                )}
                            </>}
                            metadata={<>
                                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    Created {new Date(db.created_at).toLocaleDateString()}
                                </span>
                                {db.target_count > 0 && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="secondary" className="text-xs cursor-default">
                                                    {db.target_count} target{db.target_count > 1 ? 's' : ''}
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                <p className="font-medium mb-1">Connected Engines:</p>
                                                {(db.linked_engines || []).map(e => (
                                                    <p key={e.id} className="text-muted-foreground">
                                                        {e.name} <span className="opacity-60">({e.provider})</span>
                                                    </p>
                                                ))}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                            </>}
                            actions={<>
                                <Button
                                    variant="ghost" size="icon"
                                    onClick={() => handleTest(db.id)}
                                    disabled={testingId === db.id}
                                    title="Test connection"
                                >
                                    {testingId === db.id
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Zap className="h-4 w-4" />}
                                </Button>
                                {!db.is_system && (
                                    <>
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(db)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <DeleteResourceDialog
                                            resourceName={db.name}
                                            resourceTypeLabel="database"
                                            provider={db.provider}
                                            supportsRemoteDelete={!!db.supports_remote_delete}
                                            dependentCount={db.target_count}
                                            dependentLabel="deployment target"
                                            onDelete={(deleteRemote) => handleDelete(db.id, deleteRemote)}
                                        />
                                    </>
                                )}
                            </>}
                        />
                        );
                    })}
                </div>
            </>
            )}

            <BulkDeleteResourceDialog
                open={bulkDeleteOpen}
                onOpenChange={setBulkDeleteOpen}
                selectedCount={selectedIds.size}
                resourceTypeLabel="database"
                onConfirm={handleBulkDelete}
            />        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5" />
                            Edge Databases
                        </CardTitle>
                        <CardDescription>
                            Manage edge database connections for your deployment targets
                        </CardDescription>
                    </div>
                    {dbDialog}
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
