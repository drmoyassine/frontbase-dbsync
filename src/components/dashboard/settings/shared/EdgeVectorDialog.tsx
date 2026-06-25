/**
 * EdgeVectorDialog — Create/Edit dialog for edge vector stores.
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
import { Plus, Loader2, Zap, AlertTriangle, Database } from 'lucide-react';
import { EDGE_VECTOR_PROVIDERS } from '@/hooks/useEdgeVectorForm';

interface EdgeVectorDialogProps {
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

export const EdgeVectorDialog: React.FC<EdgeVectorDialogProps> = ({
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
                    <Plus className="w-4 h-4 mr-2" /> Connect Vector DB
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit Vector Store' : 'Connect Edge Vector DB'}</DialogTitle>
                    <DialogDescription>
                        {editingId
                            ? 'Update your vector database connection settings.'
                            : 'Add a new vector database connection for your edge deployments.'}
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
                        <div className="grid grid-cols-2 gap-2">
                            {EDGE_VECTOR_PROVIDERS.map(opt => {
                                const isStub = opt.value !== 'pgvector';
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { setSelectedProvider(opt.value); }}
                                        className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-sm transition-colors text-left relative
                                            ${selectedProvider === opt.value
                                                ? 'border-primary bg-primary/5 text-primary'
                                                : 'border-border hover:bg-accent'
                                            }`}
                                    >
                                        <div className="font-medium flex items-center gap-1.5">
                                            <Database className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{opt.label}</span>
                                        </div>
                                        {isStub && (
                                            <span className="text-[10px] text-muted-foreground opacity-75">v1 Stub</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label>Connection Name</Label>
                            <Input
                                placeholder="e.g. Production pgvector"
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>{selectedProvider === 'pgvector' ? 'Postgres DSN (Connection String)' : 'Connection URL'}</Label>
                            <Input
                                placeholder={selectedProvider === 'pgvector' ? 'postgresql://user:pass@host:5432/db' : 'https://vector-db.example.com'}
                                value={formUrl}
                                onChange={e => setFormUrl(e.target.value)}
                            />
                        </div>

                        {selectedProvider !== 'pgvector' && (
                            <div className="space-y-1">
                                <Label>Auth Token / Key (Optional)</Label>
                                <Input
                                    type="password"
                                    placeholder="Enter authorization credentials"
                                    value={formToken}
                                    onChange={e => setFormToken(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Default toggle */}
                    <div className="flex items-center gap-2">
                        <Switch
                            id="edge-vector-default-modal"
                            checked={formIsDefault}
                            onCheckedChange={setFormIsDefault}
                        />
                        <Label htmlFor="edge-vector-default-modal" className="cursor-pointer text-sm">
                            Set as default vector store
                        </Label>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestInline}
                        disabled={testingId === 'inline' || !formUrl}
                        className="gap-2"
                    >
                        {testingId === 'inline' ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Testing...
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                                Test Connection
                            </>
                        )}
                    </Button>

                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !formName || !formUrl}
                        className="gap-2"
                    >
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {editingId ? 'Save Changes' : 'Connect Store'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
