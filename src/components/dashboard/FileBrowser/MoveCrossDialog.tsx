/**
 * MoveCrossDialog (Sprint 4B) — move a file to a different bucket/provider.
 *
 * Picks a destination storage provider → fetches its buckets → picks a dest
 * bucket + key → calls `moveFileCross` (backend streams the object through:
 * download source → upload dest → delete source). The source is deleted only
 * after the destination write succeeds, so a mid-move failure loses nothing.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { fetchBuckets, moveFileCross } from './api';
import { toast } from 'sonner';

export interface StorageProviderOption {
    id: string;
    name: string;
}

interface MoveCrossDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    source: { providerId: string; providerName: string; bucket: string; key: string };
    providers: StorageProviderOption[];
    onMoved?: () => void;
}

const basename = (key: string) => key.split('/').filter(Boolean).pop() || key;

export function MoveCrossDialog({
    open, onOpenChange, source, providers, onMoved,
}: MoveCrossDialogProps) {
    const [destProviderId, setDestProviderId] = useState('');
    const [destBucket, setDestBucket] = useState('');
    const [destKey, setDestKey] = useState(basename(source.key));
    const [moving, setMoving] = useState(false);

    // Other providers (exclude the source so cross-bucket stays meaningful,
    // though same-provider cross-bucket is allowed by the backend).
    const destProviders = providers.filter((p) => p.id !== source.providerId);

    const { data: bucketsResult, isLoading: bucketsLoading } = useQuery({
        queryKey: ['storage-buckets', destProviderId],
        queryFn: () => fetchBuckets(destProviderId),
        enabled: !!destProviderId,
    });
    const destBuckets = bucketsResult?.buckets ?? [];

    const canMove = !!destProviderId && !!destBucket && !!destKey && !moving;

    const handleMove = async () => {
        setMoving(true);
        try {
            const { bytes } = await moveFileCross({
                sourceProviderId: source.providerId,
                sourceBucket: source.bucket,
                sourceKey: source.key,
                destProviderId,
                destBucket,
                destKey,
            });
            toast.success(`Moved to ${destBucket}/${destKey}`, {
                description: bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB transferred` : undefined,
            });
            onMoved?.();
            onOpenChange(false);
        } catch (e: any) {
            toast.error('Move failed', { description: e?.message });
        } finally {
            setMoving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Move to another bucket</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{source.key}</span>
                        <div>from {source.providerName} / {source.bucket}</div>
                    </div>

                    <div className="space-y-2">
                        <Label>Destination provider</Label>
                        <select
                            value={destProviderId}
                            onChange={(e) => { setDestProviderId(e.target.value); setDestBucket(''); }}
                            className="w-full px-3 py-2 text-sm border rounded-md bg-background"
                        >
                            <option value="">Select provider…</option>
                            {destProviders.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label>Destination bucket</Label>
                        {bucketsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading buckets…
                            </div>
                        ) : (
                            <select
                                value={destBucket}
                                onChange={(e) => setDestBucket(e.target.value)}
                                disabled={!destProviderId}
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background disabled:opacity-50"
                            >
                                <option value="">Select bucket…</option>
                                {destBuckets.map((b: any) => (
                                    <option key={b.id ?? b.name} value={b.name}>{b.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="dest-key">Destination path</Label>
                        <Input
                            id="dest-key"
                            value={destKey}
                            onChange={(e) => setDestKey(e.target.value)}
                            placeholder="folder/filename.ext"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={moving}>
                        Cancel
                    </Button>
                    <Button onClick={handleMove} disabled={!canMove}>
                        {moving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Move file
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
