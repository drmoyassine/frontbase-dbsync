import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Loader2, AlertTriangle, Copy, Check as CheckIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface BulkDeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    onConfirm: (deleteRemote: boolean) => Promise<void>;
}

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

export function BulkDeleteDialog({ open, onOpenChange, selectedCount, onConfirm }: BulkDeleteDialogProps) {
    const [deleteRemote, setDeleteRemote] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const CONFIRM_PHRASE = 'DELETE ALL';
    const confirmValid = !deleteRemote || confirmText === CONFIRM_PHRASE;

    const handleConfirm = async () => {
        setIsDeleting(true);
        try {
            await onConfirm(deleteRemote);
            onOpenChange(false);
        } finally {
            setIsDeleting(false);
            setDeleteRemote(false);
            setConfirmText('');
        }
    };

    const handleOpenChange = (v: boolean) => {
        onOpenChange(v);
        if (!v) {
            setDeleteRemote(false);
            setConfirmText('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete {selectedCount} Edge Engine{selectedCount !== 1 ? 's' : ''}?</DialogTitle>
                    <DialogDescription>
                        This removes <span className="font-medium text-foreground">{selectedCount} selected engine{selectedCount !== 1 ? 's' : ''}</span> from Frontbase routing.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-start space-x-3">
                            <Checkbox
                                id="bulk-delete-remote"
                                checked={deleteRemote}
                                onCheckedChange={(v) => { setDeleteRemote(!!v); setConfirmText(''); }}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label htmlFor="bulk-delete-remote" className="text-sm font-medium leading-none cursor-pointer">
                                    Also delete from remote providers
                                </label>
                                <p className="text-xs text-muted-foreground">
                                    Permanently removes the selected deployments from their provider accounts.
                                </p>
                            </div>
                        </div>

                        {deleteRemote && (
                            <div className="space-y-2 pt-1 pl-7">
                                <Alert variant="destructive" className="py-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">
                                        This is <strong>irreversible</strong>. All {selectedCount} deployments and their data will be permanently deleted from their providers.
                                    </AlertDescription>
                                </Alert>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                        Type <span className="font-mono text-foreground font-medium">{CONFIRM_PHRASE}</span>
                                        <CopyButton text={CONFIRM_PHRASE} />
                                        to confirm:
                                    </Label>
                                    <Input
                                        value={confirmText}
                                        onChange={(e) => setConfirmText(e.target.value)}
                                        placeholder={CONFIRM_PHRASE}
                                        className="h-8 text-sm font-mono"
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
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
