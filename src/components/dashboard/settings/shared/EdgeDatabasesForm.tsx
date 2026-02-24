/**
 * EdgeDatabasesForm
 * 
 * CRUD management for named edge database connections.
 * Follows the same UX pattern as DeploymentTargetsForm:
 *   List → "Add Database" button → Provider selection → Connection form
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Database, Plus, Trash2, Pencil, Loader2, Check, X,
    Star, Shield, Zap, AlertTriangle, HardDrive, Cloud, Globe,
} from 'lucide-react';

const API_BASE = '';

interface EdgeDatabase {
    id: string;
    name: string;
    provider: string;
    db_url: string;
    has_token: boolean;
    is_default: boolean;
    is_system?: boolean;
    created_at: string;
    updated_at: string;
    target_count: number;
}

interface TestResult {
    success: boolean;
    message: string;
    latency_ms?: number;
}

interface EdgeDatabasesFormProps {
    withCard?: boolean;
}

const PROVIDER_OPTIONS = [
    { value: 'turso', label: 'Turso', icon: Cloud, placeholder: 'libsql://your-db.turso.io' },
    { value: 'neon', label: 'Neon Postgres', icon: Globe, placeholder: 'postgresql://...' },
    { value: 'sqlite', label: 'Local SQLite', icon: HardDrive, placeholder: 'file:local' },
];

export const EdgeDatabasesForm: React.FC<EdgeDatabasesFormProps> = ({ withCard = false }) => {
    const [databases, setDatabases] = useState<EdgeDatabase[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add flow state (mirrors DeploymentTargetsForm pattern)
    const [showAddFlow, setShowAddFlow] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

    // Form fields
    const [formName, setFormName] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formToken, setFormToken] = useState('');
    const [formIsDefault, setFormIsDefault] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Edit mode
    const [editingId, setEditingId] = useState<string | null>(null);

    // Test connection
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    // Delete
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchDatabases = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setDatabases(data);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchDatabases(); }, [fetchDatabases]);

    const resetAddFlow = () => {
        setShowAddFlow(false);
        setSelectedProvider(null);
        setEditingId(null);
        setFormName('');
        setFormUrl('');
        setFormToken('');
        setFormIsDefault(false);
        setTestResult(null);
    };

    const startEdit = (db: EdgeDatabase) => {
        setEditingId(db.id);
        setSelectedProvider(db.provider);
        setFormName(db.name);
        setFormUrl(db.db_url);
        setFormToken('');
        setFormIsDefault(db.is_default);
        setShowAddFlow(true);
        setTestResult(null);
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
            resetAddFlow();
            await fetchDatabases();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Delete
    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || `HTTP ${res.status}`);
            }
            await fetchDatabases();
        } catch (e: any) { setError(e.message); }
        finally { setDeletingId(null); }
    };

    // Test saved DB
    const handleTest = async (id: string) => {
        setTestingId(id);
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/${id}/test`, { method: 'POST' });
            const data = await res.json();
            setTestResult({ ...data, _dbId: id } as any);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message } as any);
        } finally { setTestingId(null); }
    };

    // Test inline (before saving)
    const handleTestInline = async () => {
        setTestingId('inline');
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/api/edge-databases/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName || 'Test',
                    provider: selectedProvider,
                    db_url: formUrl,
                    db_token: formToken || null,
                }),
            });
            const data = await res.json();
            setTestResult(data);
        } catch (e: any) {
            setTestResult({ success: false, message: e.message });
        } finally { setTestingId(null); }
    };

    const getProviderIcon = (provider: string) => {
        const opt = PROVIDER_OPTIONS.find(p => p.value === provider);
        const Icon = opt?.icon || Database;
        return <Icon className="h-4 w-4" />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // ─── Provider selection + connection form (shown when adding) ───
    const providerSelectionStep = (
        <div className="p-4 rounded-lg border border-dashed space-y-4">
            <Label className="text-sm font-medium">
                {editingId ? 'Edit Database' : 'Select a provider'}
            </Label>

            {/* Provider buttons */}
            {!editingId && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PROVIDER_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => setSelectedProvider(opt.value)}
                                className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors text-left
                                    ${selectedProvider === opt.value
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-border hover:bg-accent'
                                    }`}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Connection form (shows after provider selected) */}
            {selectedProvider && (
                <div className="space-y-4 pt-2 border-t">
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
                            <Label>Database URL</Label>
                            <Input
                                placeholder={PROVIDER_OPTIONS.find(p => p.value === selectedProvider)?.placeholder}
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

                    {/* Test result */}
                    {testResult && (
                        <Alert variant={testResult.success ? 'default' : 'destructive'}>
                            {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                            <AlertDescription>
                                {testResult.message}
                                {testResult.latency_ms != null && ` (${testResult.latency_ms}ms)`}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex gap-2">
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
                                <><Check className="mr-2 h-4 w-4" /> {editingId ? 'Update' : 'Add Database'}</>
                            )}
                        </Button>
                        <Button variant="ghost" onClick={resetAddFlow}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Cancel if no provider selected yet */}
            {!selectedProvider && !editingId && (
                <Button variant="ghost" onClick={resetAddFlow} className="w-full">Cancel</Button>
            )}
        </div>
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
            {databases.length === 0 && !showAddFlow ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Database className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No edge databases configured</p>
                    <p className="text-sm mt-1">Add a database to store your published pages</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {databases.map((db) => (
                        <div key={db.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                            <div className="flex items-center gap-3">
                                {getProviderIcon(db.provider)}
                                <span className="font-medium">{db.name}</span>
                                <Badge variant="outline" className="text-xs">{db.provider}</Badge>
                                {db.is_default && (
                                    <Badge variant="secondary" className="text-xs gap-1">
                                        <Star className="h-3 w-3" /> Default
                                    </Badge>
                                )}
                                {db.is_system && (
                                    <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                                        <Shield className="h-3 w-3" /> System
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {db.db_url}
                                </span>
                                {db.target_count > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                        {db.target_count} target{db.target_count > 1 ? 's' : ''}
                                    </Badge>
                                )}
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
                                        <Button variant="ghost" size="icon" onClick={() => startEdit(db)} title="Edit">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost" size="icon"
                                            onClick={() => handleDelete(db.id)}
                                            disabled={deletingId === db.id}
                                        >
                                            {deletingId === db.id
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Trash2 className="h-4 w-4 text-destructive" />}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Test result for list items */}
            {testResult && !showAddFlow && (
                <Alert variant={testResult.success ? 'default' : 'destructive'}>
                    {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    <AlertDescription>
                        {testResult.message}
                        {testResult.latency_ms != null && ` (${testResult.latency_ms}ms)`}
                    </AlertDescription>
                </Alert>
            )}

            {/* Add flow or button */}
            {showAddFlow ? providerSelectionStep : (
                <Button variant="outline" onClick={() => { setShowAddFlow(true); setError(null); setTestResult(null); }} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Database
                </Button>
            )}
        </div>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Edge Databases
                    </CardTitle>
                    <CardDescription>
                        Manage edge database connections for your deployment targets
                    </CardDescription>
                </CardHeader>
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
};
