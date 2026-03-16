// BucketListView — Bucket grid with search, sort, filter, pagination

import React from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { MultiSelectCustom } from '@/components/ui/multi-select-custom';
import {
    HardDrive, FolderOpen, Plus, RefreshCw, Settings,
    MoreVertical, Archive, X, Search, Globe, Lock, Loader2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Bucket, BucketFormState, ConfirmDialogState, BucketSortConfig } from './types';
import { formatBytes } from './utils';
import { fetchBuckets, computeSize } from './api';

import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { BucketDialog } from './dialogs/BucketDialog';

interface BucketListViewProps {
    storageProviderId: string;
    // State from parent
    bucketSearch: string;
    setBucketSearch: (v: string) => void;
    selectedProviders: string[];
    setSelectedProviders: (v: string[]) => void;
    bucketSortConfig: BucketSortConfig;
    setBucketSortConfig: (v: BucketSortConfig) => void;
    bucketPage: number;
    setBucketPage: (v: number | ((p: number) => number)) => void;
    getFilteredAndSortedBuckets: (buckets: Bucket[] | undefined) => Bucket[];
    getPaginatedBuckets: (buckets: Bucket[]) => Bucket[];
    getTotalBucketPages: (buckets: Bucket[]) => number;
    // Bucket dialog
    isBucketDialogOpen: boolean;
    setIsBucketDialogOpen: (v: boolean) => void;
    bucketDialogMode: 'create' | 'edit';
    bucketForm: BucketFormState;
    setBucketForm: (v: BucketFormState) => void;
    handleOpenCreateBucket: () => void;
    handleOpenEditBucket: (bucket: Bucket, e: React.MouseEvent) => void;
    // Confirm dialog
    confirmDialog: ConfirmDialogState;
    setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
    // Actions
    onBucketClick: (bucket: Bucket) => void;
    onBucketSubmit: () => void;
    onConfirmAction: () => void;
    onRefresh: () => Promise<void>;
    isRefreshing: boolean;
    isMutationPending: boolean;
}

export function BucketListView({
    storageProviderId,
    bucketSearch, setBucketSearch,
    selectedProviders, setSelectedProviders,
    bucketSortConfig, setBucketSortConfig,
    bucketPage, setBucketPage,
    getFilteredAndSortedBuckets, getPaginatedBuckets, getTotalBucketPages,
    isBucketDialogOpen, setIsBucketDialogOpen,
    bucketDialogMode, bucketForm, setBucketForm,
    handleOpenCreateBucket, handleOpenEditBucket,
    confirmDialog, setConfirmDialog,
    onBucketClick, onBucketSubmit, onConfirmAction, onRefresh, isRefreshing, isMutationPending,
}: BucketListViewProps) {
    // ── Bucket query ──
    const { data: bucketsResult, isLoading: bucketsLoading, error: bucketsError } = useQuery({
        queryKey: ['storage-buckets', storageProviderId],
        queryFn: () => fetchBuckets(storageProviderId),
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
    });
    const buckets = bucketsResult?.buckets;
    const permissionWarning = bucketsResult?.permissionWarning;

    // ── Cached bucket sizes (L1: React Query, L2: Redis backend) ──
    const bucketSizeQueries = useQueries({
        queries: (buckets ?? []).map((b) => ({
            queryKey: ['storage-size', storageProviderId, b.name, '__root__'],
            queryFn: () => computeSize(storageProviderId, b.name, ''),
            staleTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
        })),
    });
    const bucketSizes = React.useMemo(() => {
        const map: Record<string, { size: number | undefined; isLoading: boolean; isError: boolean }> = {};
        (buckets ?? []).forEach((b, i) => {
            const q = bucketSizeQueries[i];
            map[b.name] = { size: q?.data, isLoading: q?.isLoading ?? true, isError: q?.isError ?? false };
        });
        return map;
    }, [buckets, bucketSizeQueries]);

    // ── Computed values ──
    const filteredAndSortedBuckets = getFilteredAndSortedBuckets(buckets);
    const paginatedBuckets = getPaginatedBuckets(filteredAndSortedBuckets);
    const totalBucketPages = getTotalBucketPages(filteredAndSortedBuckets);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <HardDrive className="h-5 w-5" />
                            Storage Buckets
                        </CardTitle>
                        <CardDescription>Select a bucket to browse files</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleOpenCreateBucket}>
                            <Plus className="h-4 w-4 mr-2" />
                            New Bucket
                        </Button>
                        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {/* Search / Filter / Sort toolbar */}
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search buckets..."
                                className="pl-8"
                                value={bucketSearch}
                                onChange={(e) => { setBucketSearch(e.target.value); setBucketPage(1); }}
                            />
                        </div>
                        <MultiSelectCustom
                            options={[{ label: 'Supabase', value: 'Supabase' }]}
                            selected={selectedProviders}
                            onChange={(val) => { setSelectedProviders(val); setBucketPage(1); }}
                            placeholder="Providers"
                            className="w-[180px]"
                        />
                        <Select
                            value={`${bucketSortConfig.key}-${bucketSortConfig.direction}`}
                            onValueChange={(value) => {
                                const [key, direction] = value.split('-');
                                setBucketSortConfig({ key: key as any, direction: direction as any });
                            }}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                                <SelectItem value="size-desc">Largest First</SelectItem>
                                <SelectItem value="size-asc">Smallest First</SelectItem>
                                <SelectItem value="created_at-desc">Newest First</SelectItem>
                                <SelectItem value="created_at-asc">Oldest First</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Permission warning banner */}
                {permissionWarning && (
                    <div className="flex items-start gap-3 p-3 mb-4 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/30 text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p className="text-sm">{permissionWarning}</p>
                    </div>
                )}

                {/* Bucket list */}
                {bucketsLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : bucketsError ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>Failed to load buckets</p>
                        <p className="text-sm">{(bucketsError as Error).message}</p>
                    </div>
                ) : paginatedBuckets.length > 0 ? (
                    <div className="space-y-2">
                        {paginatedBuckets.map((bucket) => (
                            <div
                                key={bucket.id}
                                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => onBucketClick(bucket)}
                            >
                                <div className="flex items-center gap-3">
                                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                                    <div className="flex flex-col">
                                        <span className="font-medium">{bucket.name}</span>
                                        <div className="flex items-center gap-2 mt-1">
                                            {bucket.provider && (
                                                <Badge variant="outline" className="text-[10px] font-semibold bg-[#006239]/10 text-[#006239] border-[#006239]/20">
                                                    {bucket.provider}
                                                </Badge>
                                            )}
                                            <span className="text-[11px] text-muted-foreground">
                                                Created {new Date(bucket.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-end">
                                        <span className="text-sm font-medium">
                                            {(() => {
                                                const s = bucketSizes[bucket.name];
                                                if (!s || s.isLoading) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Calculating…</span>;
                                                if (s.isError) return <span className="text-xs text-muted-foreground">—</span>;
                                                return formatBytes(s.size ?? 0);
                                            })()}
                                        </span>
                                        <Badge variant={bucket.public ? 'default' : 'secondary'} className="mt-1 h-5 text-[10px]">
                                            {bucket.public ? (<><Globe className="h-3 w-3 mr-1" /> Public</>) : (<><Lock className="h-3 w-3 mr-1" /> Private</>)}
                                        </Badge>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenuItem onClick={(e) => handleOpenEditBucket(bucket, e)}>
                                                <Settings className="h-4 w-4 mr-2" /> Settings
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setConfirmDialog({ isOpen: true, title: 'Empty Bucket', description: `Are you sure you want to empty the bucket "${bucket.name}"? This cannot be undone.`, actionLabel: 'Empty', variant: 'destructive', actionType: 'empty', targetId: bucket.id }); }}>
                                                <Archive className="h-4 w-4 mr-2" /> Empty Bucket
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDialog({ isOpen: true, title: 'Delete Bucket', description: `Are you sure you want to delete the bucket "${bucket.name}"? This action cannot be undone.`, actionLabel: 'Delete', variant: 'destructive', actionType: 'deleteBucket', targetId: bucket.id }); }}>
                                                <X className="h-4 w-4 mr-2" /> Delete Bucket
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}

                        {totalBucketPages > 1 && (
                            <div className="mt-6 border-t pt-4">
                                <Pagination>
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious onClick={() => setBucketPage((p: number) => Math.max(1, p - 1))} className={bucketPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                                        </PaginationItem>
                                        {Array.from({ length: totalBucketPages }, (_, i) => (
                                            <PaginationItem key={i}>
                                                <PaginationLink onClick={() => setBucketPage(i + 1)} isActive={bucketPage === i + 1} className="cursor-pointer">
                                                    {i + 1}
                                                </PaginationLink>
                                            </PaginationItem>
                                        ))}
                                        <PaginationItem>
                                            <PaginationNext onClick={() => setBucketPage((p: number) => Math.min(totalBucketPages, p + 1))} className={bucketPage === totalBucketPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        <FolderOpen className="mx-auto h-12 w-12 mb-4" />
                        <p>No storage buckets found</p>
                        <Button variant="link" onClick={handleOpenCreateBucket}>Create your first bucket</Button>
                    </div>
                )}
            </CardContent>

            {/* Dialogs */}
            <BucketDialog
                open={isBucketDialogOpen}
                onOpenChange={setIsBucketDialogOpen}
                mode={bucketDialogMode}
                form={bucketForm}
                onFormChange={setBucketForm}
                onSubmit={onBucketSubmit}
                isPending={isMutationPending}
            />
            <ConfirmDialog
                dialog={confirmDialog}
                onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}
                onConfirm={onConfirmAction}
            />
        </Card>
    );
}
