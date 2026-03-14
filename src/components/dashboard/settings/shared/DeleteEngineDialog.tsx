import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Loader2, AlertTriangle, Copy, Check as CheckIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';

const PROVIDER_LABELS: Record<string, string> = {
    cloudflare: 'Cloudflare',
    supabase: 'Supabase',
    vercel: 'Vercel',
    netlify: 'Netlify',
    deno: 'Deno Deploy',
    upstash: 'Upstash',
};

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Copy to clipboard"
        >
            {copied ? <CheckIcon className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

export function DeleteEngineDialog({ engine, onDelete }: { engine: EdgeEngine; onDelete: (engine: EdgeEngine, alsoDeleteRemote: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const [deleteRemote, setDeleteRemote] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const hasProvider = !!engine.provider && engine.provider !== 'unknown';
    const providerLabel = PROVIDER_LABELS[engine.provider || ''] || engine.provider || 'provider';
    const engineDisplayName = engine.name;
    const confirmValid = !deleteRemote || confirmText === engineDisplayName;

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete(engine, deleteRemote);
            setOpen(false);
        } finally {
            setIsDeleting(false);
            setDeleteRemote(false);
            setConfirmText('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDeleteRemote(false); setConfirmText(''); } }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="w-4 h-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete Edge Engine?</DialogTitle>
                    <DialogDescription>
                        This removes <span className="font-medium text-foreground">{engineDisplayName}</span> from Frontbase routing.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {hasProvider && (
                        <div className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    id={`delete-remote-${engine.id}`}
                                    checked={deleteRemote}
                                    onCheckedChange={(v) => { setDeleteRemote(!!v); setConfirmText(''); }}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label htmlFor={`delete-remote-${engine.id}`} className="text-sm font-medium leading-none cursor-pointer">
                                        Also delete from {providerLabel}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Permanently removes the <code className="bg-muted px-1 rounded text-[11px]">{engineDisplayName}</code> deployment from your {providerLabel} account.
                                    </p>
                                </div>
                            </div>

                            {deleteRemote && (
                                <div className="space-y-2 pt-1 pl-7">
                                    <Alert variant="destructive" className="py-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertDescription className="text-xs">
                                            This is <strong>irreversible</strong>. The deployment and all its data will be permanently deleted from {providerLabel}.
                                        </AlertDescription>
                                    </Alert>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                            Type <span className="font-mono text-foreground font-medium">{engineDisplayName}</span>
                                            <CopyButton text={engineDisplayName} />
                                            to confirm:
                                        </Label>
                                        <Input
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder={engineDisplayName}
                                            className="h-8 text-sm font-mono"
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!hasProvider && (
                        <p className="text-sm text-muted-foreground">
                            The engine will be removed from Frontbase. You may need to manually clean up the deployment on your provider's dashboard.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirmDelete}
                        disabled={!confirmValid || isDeleting}
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {deleteRemote ? 'Delete Everywhere' : 'Remove from Frontbase'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

