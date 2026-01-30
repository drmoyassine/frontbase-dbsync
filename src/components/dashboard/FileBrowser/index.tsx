// FileBrowser - Main Component
// Re-exports from the refactored module

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { MultiSelectCustom } from '@/components/ui/multi-select-custom';

// Icons
import {
    HardDrive, FolderOpen, Folder, FolderPlus, File, Upload, Trash2, Copy, MoreVertical,
    ArrowLeft, RefreshCw, Lock, Globe, Plus, Edit2, Archive, Settings, Search, Check,
    Move, X, ArrowUp, ArrowDown, ChevronsUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Local modules
import { Bucket, StorageFile } from './types';
import { MIME_TYPE_OPTIONS, PAGE_SIZE } from './constants';
import { formatBytes, getFileIcon } from './utils';
import { fetchBuckets, fetchFiles, getSignedUrl } from './api';
import { useFileBrowserState } from './hooks/useFileBrowserState';
import { useStorageMutations } from './hooks/useStorageMutations';

// Types
interface FileBrowserProps {
    onNavigationChange?: (isBrowsing: boolean) => void;
    /** When true, clicking a file calls onFileSelect instead of opening */
    selectMode?: boolean;
    /** Callback when a file is selected (selectMode must be true) */
    onFileSelect?: (url: string, file: StorageFile) => void;
    /** Auto-navigate to this bucket on mount */
    initialBucket?: string;
    /** Hide bucket list and only show files */
    hideBucketList?: boolean;
}

export function FileBrowser({
    onNavigationChange,
    selectMode = false,
    onFileSelect,
    initialBucket,
    hideBucketList = false,
}: FileBrowserProps = {}) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [uploadingCount, setUploadingCount] = React.useState(0);

    // Use refactored state hook
    const state = useFileBrowserState();
    const {
        currentBucket, setCurrentBucket, currentPath, setCurrentPath, page, setPage,
        sortConfig, handleSort, getSortedFiles,
        isBucketDialogOpen, setIsBucketDialogOpen, bucketDialogMode, editingBucketId, bucketForm, setBucketForm,
        handleOpenCreateBucket, handleOpenEditBucket,
        confirmDialog, setConfirmDialog,
        isFolderDialogOpen, setIsFolderDialogOpen, newFolderName, setNewFolderName,
        isRenameDialogOpen, setIsRenameDialogOpen, renameTarget, newName, setNewName, handleRename,
        bucketSearch, setBucketSearch, fileSearch, setFileSearch,
        selectedFiles, setSelectedFiles, handleSelectAll, handleSelectFile,
        selectedProviders, setSelectedProviders, bucketSortConfig, setBucketSortConfig, bucketPage, setBucketPage,
        getFilteredAndSortedBuckets, getPaginatedBuckets, getTotalBucketPages,
        isMoveDialogOpen, setIsMoveDialogOpen, moveTargets, setMoveTargets, moveDestBucket, setMoveDestBucket, moveDestPath, setMoveDestPath, handleMove,
        handleBucketClick, handleBack,
    } = state;

    // Notify parent about navigation state
    React.useEffect(() => {
        onNavigationChange?.(!!currentBucket);
    }, [currentBucket, onNavigationChange]);

    // Auto-navigate to initial bucket if specified
    React.useEffect(() => {
        if (initialBucket && !currentBucket) {
            setCurrentBucket(initialBucket);
        }
    }, [initialBucket]);

    // Use refactored mutations hook
    const mutations = useStorageMutations({
        currentBucket,
        currentPath,
        editingBucketId,
        setIsBucketDialogOpen,
        setIsFolderDialogOpen,
        setNewFolderName,
        setIsRenameDialogOpen,
        setRenameTarget: state.setRenameTarget,
        setNewName,
        setIsMoveDialogOpen,
        setMoveTargets,
        setSelectedFiles,
        setConfirmDialog,
        setCurrentBucket,
    });

    const {
        createBucketMutation, updateBucketMutation, deleteBucketMutation, emptyBucketMutation,
        deleteMutation, uploadMutation, createFolderMutation, renameMutation, moveMutation,
    } = mutations;

    // Queries
    const { data: buckets, isLoading: bucketsLoading, error: bucketsError, refetch: refetchBuckets } = useQuery({
        queryKey: ['storage-buckets'],
        queryFn: fetchBuckets,
    });

    const fullPath = currentBucket ? `${currentBucket}/${currentPath}`.replace(/\/$/, '') : '';

    const { data: files, isLoading: filesLoading, error: filesError, refetch: refetchFiles } = useQuery({
        queryKey: ['storage-files', fullPath, page, fileSearch],
        queryFn: () => fetchFiles(currentBucket!, currentPath || undefined, page, PAGE_SIZE, fileSearch),
        enabled: !!currentBucket,
    });

    const { data: destFolders, isLoading: destFoldersLoading } = useQuery({
        queryKey: ['storage-files', moveDestBucket, moveDestPath, 'folders-only'],
        queryFn: async () => {
            const files = await fetchFiles(moveDestBucket!, moveDestPath || undefined, 0, 100);
            return files.filter((f) => f.isFolder);
        },
        enabled: isMoveDialogOpen && !!moveDestBucket,
    });

    // Event Handlers
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            // Use refetch instead of invalidateQueries to wait for actual data
            // Add minimum delay so spinner is visible even on fast responses
            await Promise.all([
                refetchBuckets(),
                currentBucket ? refetchFiles() : Promise.resolve(),
                new Promise(resolve => setTimeout(resolve, 500)), // Minimum 500ms for UX
            ]);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            setUploadingCount(files.length);
            // Upload files sequentially
            Array.from(files).forEach(file => uploadMutation.mutate(file));
        }
        e.target.value = '';
    };

    const handleFileClick = async (file: StorageFile) => {
        if (file.isFolder) {
            const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
            setCurrentPath(newPath);
            setPage(0);
        } else {
            const path = currentPath ? `${currentPath}/${file.name}` : file.name;
            try {
                if (!currentBucket) throw new Error('No bucket selected');
                const url = await getSignedUrl(path, currentBucket);

                // In selectMode, call onFileSelect instead of opening
                if (selectMode && onFileSelect) {
                    onFileSelect(url, file);
                } else {
                    window.open(url, '_blank');
                }
            } catch (e) {
                toast({ title: 'Open Failed', description: 'Failed to open file.', variant: 'destructive' });
            }
        }
    };

    const handleCopyUrl = async (fileName: string) => {
        const path = currentPath ? `${currentPath}/${fileName}` : fileName;
        try {
            if (!currentBucket) throw new Error('No bucket selected');
            const url = await getSignedUrl(path, currentBucket);
            await navigator.clipboard.writeText(url);
            toast({ title: 'URL Copied', description: 'The file URL has been copied to your clipboard.' });
        } catch (e) {
            toast({ title: 'Copy Failed', description: 'Failed to copy file URL.', variant: 'destructive' });
        }
    };

    const handleDelete = (fileName: string) => {
        const path = currentPath ? `${currentPath}/${fileName}` : fileName;
        setConfirmDialog({
            isOpen: true,
            title: 'Delete File',
            description: `Are you sure you want to delete ${fileName}? This cannot be undone.`,
            actionLabel: 'Delete',
            variant: 'destructive',
            actionType: 'delete',
            targetId: path,
        });
    };

    const handleBulkDelete = () => {
        if (selectedFiles.size === 0) return;
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Multiple Files',
            description: `Are you sure you want to delete ${selectedFiles.size} files? This cannot be undone.`,
            actionLabel: 'Delete All',
            variant: 'destructive',
            actionType: 'delete',
            targetId: null,
        });
    };

    const handleConfirmAction = () => {
        if (!confirmDialog.actionType) return;

        if (confirmDialog.actionType === 'delete') {
            if (selectedFiles.size > 0 && !confirmDialog.targetId) {
                const paths = Array.from(selectedFiles).map((name) => (currentPath ? `${currentPath}/${name}` : name));
                deleteMutation.mutate(paths);
                setSelectedFiles(new Set());
            } else if (confirmDialog.targetId) {
                deleteMutation.mutate([confirmDialog.targetId]);
            }
        } else if (confirmDialog.actionType === 'empty' && confirmDialog.targetId) {
            emptyBucketMutation.mutate(confirmDialog.targetId);
        } else if (confirmDialog.actionType === 'deleteBucket' && confirmDialog.targetId) {
            deleteBucketMutation.mutate(confirmDialog.targetId);
        }
    };

    const handleBucketSubmit = () => {
        const fileSize = bucketForm.fileSizeLimit ? parseFloat(bucketForm.fileSizeLimit) * 1024 * 1024 : undefined;
        const mimeTypes = bucketForm.allowedMimeTypes ? bucketForm.allowedMimeTypes.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

        if (bucketDialogMode === 'create') {
            createBucketMutation.mutate({ name: bucketForm.name, public: bucketForm.public, fileSizeLimit: fileSize, allowedMimeTypes: mimeTypes });
        } else {
            updateBucketMutation.mutate({ id: editingBucketId, public: bucketForm.public, fileSizeLimit: fileSize, allowedMimeTypes: mimeTypes });
        }
    };

    const handleCreateFolder = () => {
        if (newFolderName.trim()) {
            createFolderMutation.mutate(newFolderName.trim());
        }
    };

    const handleRenameSubmit = () => {
        if (renameTarget && newName.trim() && newName !== renameTarget.name) {
            renameMutation.mutate({ oldName: renameTarget.name, newName: newName.trim() });
        }
    };

    const handleMoveSubmit = () => {
        if (moveDestBucket && moveTargets.length > 0) {
            moveMutation.mutate({ targets: moveTargets, destBucket: moveDestBucket, destPath: moveDestPath, sourceBucket: currentBucket! });
        }
    };

    // Computed values
    const filteredAndSortedBuckets = getFilteredAndSortedBuckets(buckets);
    const paginatedBuckets = getPaginatedBuckets(filteredAndSortedBuckets);
    const totalBucketPages = getTotalBucketPages(filteredAndSortedBuckets);
    const sortedFiles = files ? getSortedFiles(files) : [];
    const filteredFiles = sortedFiles.filter((f) => fileSearch === '' || f.name.toLowerCase().includes(fileSearch.toLowerCase()));

    // Get current bucket data for breadcrumb
    const currentBucketData = buckets?.find(b => b.name === currentBucket);

    // Build breadcrumb segments for file list view
    const breadcrumbSegments = React.useMemo(() => {
        const segments: { label: string; path: string | null }[] = [
            { label: currentBucketData?.provider || 'Supabase', path: null }, // Provider - go to bucket list
            { label: currentBucket || '', path: '' }, // Bucket root
        ];
        if (currentPath) {
            const parts = currentPath.split('/');
            parts.forEach((part, index) => {
                segments.push({
                    label: part,
                    path: parts.slice(0, index + 1).join('/')
                });
            });
        }
        return segments;
    }, [currentBucket, currentPath, currentBucketData?.provider]);

    const handleBreadcrumbClick = (segment: { label: string; path: string | null }) => {
        if (segment.path === null) {
            setCurrentBucket(null);
            setCurrentPath('');
        } else {
            setCurrentPath(segment.path);
        }
        setPage(0);
    };

    // =========================================================================
    // RENDER: Bucket List View
    // =========================================================================
    if (!currentBucket) {
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
                            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
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
                                    onClick={() => handleBucketClick(bucket)}
                                >
                                    <div className="flex items-center gap-3">
                                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                                        <div className="flex flex-col">
                                            <span className="font-medium">{bucket.name}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="outline" className="text-[10px] font-semibold bg-[#006239]/10 text-[#006239] border-[#006239]/20">
                                                    {bucket.provider}
                                                </Badge>
                                                <span className="text-[11px] text-muted-foreground">
                                                    Created {new Date(bucket.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-end">
                                            <span className="text-sm font-medium">{formatBytes(bucket.size)}</span>
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
                                                <PaginationPrevious onClick={() => setBucketPage((p) => Math.max(1, p - 1))} className={bucketPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                                            </PaginationItem>
                                            {Array.from({ length: totalBucketPages }, (_, i) => (
                                                <PaginationItem key={i}>
                                                    <PaginationLink onClick={() => setBucketPage(i + 1)} isActive={bucketPage === i + 1} className="cursor-pointer">
                                                        {i + 1}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            ))}
                                            <PaginationItem>
                                                <PaginationNext onClick={() => setBucketPage((p) => Math.min(totalBucketPages, p + 1))} className={bucketPage === totalBucketPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
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

                {/* Bucket Dialog */}
                <Dialog open={isBucketDialogOpen} onOpenChange={setIsBucketDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{bucketDialogMode === 'create' ? 'Create Bucket' : 'Edit Bucket'}</DialogTitle>
                            <DialogDescription>Configure storage bucket settings.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            {bucketDialogMode === 'create' && (
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input id="name" value={bucketForm.name} onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })} placeholder="e.g., uploads" />
                                </div>
                            )}
                            <div className="flex items-center space-x-2">
                                <Switch id="public" checked={bucketForm.public} onCheckedChange={(checked) => setBucketForm({ ...bucketForm, public: checked })} />
                                <Label htmlFor="public">Public Bucket</Label>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="size">Max File Size (MB)</Label>
                                <Input id="size" type="number" value={bucketForm.fileSizeLimit} onChange={(e) => setBucketForm({ ...bucketForm, fileSizeLimit: e.target.value })} placeholder="No limit" />
                            </div>
                            <div className="grid gap-2">
                                <Label>Allowed Mime Types</Label>
                                <MultiSelectCustom
                                    selected={bucketForm.allowedMimeTypes ? bucketForm.allowedMimeTypes.split(',').map((s) => s.trim()).filter(Boolean) : []}
                                    options={MIME_TYPE_OPTIONS}
                                    onChange={(selected) => setBucketForm({ ...bucketForm, allowedMimeTypes: selected.join(', ') })}
                                    placeholder="Select MIME types"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsBucketDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleBucketSubmit}>{bucketDialogMode === 'create' ? 'Create' : 'Save Changes'}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Confirm Dialog */}
                <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirmAction} className={confirmDialog.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>
                                {confirmDialog.actionLabel}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </Card>
        );
    }

    // =========================================================================
    // RENDER: File List View
    // =========================================================================
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={handleBack}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        {/* Breadcrumb Navigation */}
                        <nav className="flex items-center gap-1 text-sm">
                            {breadcrumbSegments.map((segment, index) => (
                                <React.Fragment key={index}>
                                    {index > 0 && <span className="text-muted-foreground mx-1">/</span>}
                                    {index === 0 ? (
                                        <Badge
                                            variant="outline"
                                            className="cursor-pointer hover:bg-muted text-[10px] font-semibold bg-[#006239]/10 text-[#006239] border-[#006239]/20"
                                            onClick={() => handleBreadcrumbClick(segment)}
                                        >
                                            {segment.label}
                                        </Badge>
                                    ) : index === breadcrumbSegments.length - 1 ? (
                                        <span className="font-medium flex items-center gap-1">
                                            <FolderOpen className="h-4 w-4" />
                                            {segment.label}
                                        </span>
                                    ) : (
                                        <button
                                            className="text-muted-foreground hover:text-foreground hover:underline"
                                            onClick={() => handleBreadcrumbClick(segment)}
                                        >
                                            {segment.label}
                                        </button>
                                    )}
                                </React.Fragment>
                            ))}
                        </nav>
                    </div>
                    <div className="flex gap-2 items-center">
                        {selectedFiles.size > 0 && (
                            <div className="flex items-center gap-2 mr-2 bg-muted/50 px-3 py-1 rounded-full border text-sm">
                                <span className="font-medium text-muted-foreground">{selectedFiles.size} selected</span>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedFiles(new Set())} title="Deselect All">
                                    <X className="h-3 w-3" />
                                </Button>
                                <div className="w-px h-4 bg-border mx-1" />
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleBulkDelete} title="Delete Selected">
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleMove(Array.from(selectedFiles).map((name) => (currentPath ? `${currentPath}/${name}` : name)))} title="Move Selected">
                                    <Move className="h-3 w-3" />
                                </Button>
                            </div>
                        )}
                        <div className="relative w-[200px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input type="search" placeholder="Search files..." className="pl-8 h-9" value={fileSearch} onChange={(e) => setFileSearch(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}><RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} /></Button>
                            <Button variant="outline" size="sm" onClick={() => setIsFolderDialogOpen(true)}><FolderPlus className="h-4 w-4 mr-1" /> New Folder</Button>
                            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                                <Upload className="h-4 w-4 mr-1" /> {uploadMutation.isPending ? `Uploading${uploadingCount > 1 ? ` ${uploadingCount}` : ''}...` : 'Upload'}
                            </Button>
                            {/* Bucket Actions Hamburger Menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                        const bucket = buckets?.find(b => b.name === currentBucket);
                                        if (bucket) handleOpenEditBucket(bucket, {} as React.MouseEvent);
                                    }}>
                                        <Settings className="h-4 w-4 mr-2" /> Bucket Settings
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                        const bucket = buckets?.find(b => b.name === currentBucket);
                                        if (bucket) setConfirmDialog({ isOpen: true, title: 'Empty Bucket', description: `Are you sure you want to empty "${bucket.name}"? This will delete all files.`, actionLabel: 'Empty', variant: 'destructive', actionType: 'empty', targetId: bucket.id });
                                    }}>
                                        <Archive className="h-4 w-4 mr-2" /> Empty Bucket
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => {
                                        const bucket = buckets?.find(b => b.name === currentBucket);
                                        if (bucket) setConfirmDialog({ isOpen: true, title: 'Delete Bucket', description: `Are you sure you want to delete "${bucket.name}"?`, actionLabel: 'Delete', variant: 'destructive', actionType: 'deleteBucket', targetId: bucket.id });
                                    }}>
                                        <X className="h-4 w-4 mr-2" /> Delete Bucket
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {filesLoading ? (
                    <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : filesError ? (
                    <div className="text-center py-8 text-muted-foreground"><p>Failed to load files</p><p className="text-sm">{(filesError as Error).message}</p></div>
                ) : files && files.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <div className="flex items-center justify-center">
                                        <div className={cn("h-4 w-4 rounded border border-primary flex items-center justify-center cursor-pointer transition-colors", selectedFiles.size > 0 && selectedFiles.size === files.length ? "bg-primary text-primary-foreground" : "bg-transparent")} onClick={() => handleSelectAll(selectedFiles.size !== files.length, files)}>
                                            {selectedFiles.size > 0 && selectedFiles.size === files.length && <Check className="h-3 w-3" />}
                                        </div>
                                    </div>
                                </TableHead>
                                <TableHead className="w-[40%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-1">Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'name' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[20%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('type')}>
                                    <div className="flex items-center gap-1">Type {sortConfig.key === 'type' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'type' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[20%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('updated_at')}>
                                    <div className="flex items-center gap-1">Date Modified {sortConfig.key === 'updated_at' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'updated_at' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[15%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('size')}>
                                    <div className="flex items-center gap-1">Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)} {sortConfig.key !== 'size' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}</div>
                                </TableHead>
                                <TableHead className="w-[5%]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredFiles.map((file) => {
                                const FileIcon = getFileIcon(file.name);
                                return (
                                    <TableRow key={file.id}>
                                        <TableCell>
                                            <div className="flex items-center justify-center">
                                                <div className={cn("h-4 w-4 rounded border border-primary flex items-center justify-center cursor-pointer transition-colors", selectedFiles.has(file.name) ? "bg-primary text-primary-foreground" : "bg-transparent")} onClick={(e) => { e.stopPropagation(); handleSelectFile(file.name, !selectedFiles.has(file.name)); }}>
                                                    {selectedFiles.has(file.name) && <Check className="h-3 w-3" />}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                {file.isFolder ? <Folder className="h-4 w-4 text-blue-500 fill-blue-500/20" /> : <FileIcon className="h-4 w-4 text-muted-foreground" />}
                                                <button onClick={() => handleFileClick(file)} className={cn("font-medium text-sm text-left hover:underline", file.isFolder ? "text-foreground font-semibold" : "text-foreground")}>{file.name}</button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{file.isFolder ? 'Folder' : file.mimetype || file.name.split('.').pop()?.toUpperCase() || 'File'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{file.updated_at ? new Date(file.updated_at).toLocaleDateString() : '-'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{formatBytes(file.size)}</TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleCopyUrl(file.name)}><Copy className="h-4 w-4 mr-2" /> Copy URL</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleRename(file)}><Edit2 className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleMove(currentPath ? `${currentPath}/${file.name}` : file.name)}><Move className="h-4 w-4 mr-2" /> Move</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDelete(file.name)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center py-8 text-muted-foreground"><File className="mx-auto h-12 w-12 mb-4" /><p>No files in this bucket</p><p className="text-sm">Upload files to get started</p></div>
                )}

                {files && files.length > 0 && (
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
                        <div className="text-sm text-muted-foreground">Page {page + 1}</div>
                        <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={files.length < PAGE_SIZE}>Next</Button>
                    </div>
                )}
            </CardContent>

            {/* Confirm Dialog */}
            <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle><AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmAction} className={confirmDialog.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>{confirmDialog.actionLabel}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* New Folder Dialog */}
            <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Create New Folder</DialogTitle><DialogDescription>Enter a name for the new folder.</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="folderName">Folder Name</Label>
                            <Input id="folderName" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g., images" onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFolderDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || createFolderMutation.isPending}>{createFolderMutation.isPending ? 'Creating...' : 'Create'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rename Dialog */}
            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Rename {renameTarget?.isFolder ? 'Folder' : 'File'}</DialogTitle><DialogDescription>Enter a new name for "{renameTarget?.name}".</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="newName">New Name</Label>
                            <Input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleRenameSubmit} disabled={!newName.trim() || newName === renameTarget?.name || renameMutation.isPending}>{renameMutation.isPending ? 'Renaming...' : 'Rename'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Move Dialog */}
            <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader><DialogTitle>Move {moveTargets.length} items</DialogTitle><DialogDescription>Select destination bucket and folder.</DialogDescription></DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label>Destination Bucket</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {buckets?.map((b) => (
                                    <Button key={b.id} variant={moveDestBucket === b.name ? 'default' : 'outline'} size="sm" onClick={() => { setMoveDestBucket(b.name); setMoveDestPath(''); }} className="justify-start truncate">
                                        <HardDrive className="h-4 w-4 mr-2 flex-shrink-0" /> {b.name}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        {moveDestBucket && (
                            <div className="space-y-2 border rounded-md p-3 max-h-[250px] overflow-y-auto">
                                <Label className="text-xs text-muted-foreground uppercase">Path: {moveDestPath || 'Root'}</Label>
                                <div className="space-y-1">
                                    {moveDestPath && (
                                        <Button variant="ghost" size="sm" className="w-full justify-start text-blue-500" onClick={() => { const parts = moveDestPath.split('/'); parts.pop(); setMoveDestPath(parts.join('/')); }}>
                                            <ArrowLeft className="h-4 w-4 mr-2" /> Back
                                        </Button>
                                    )}
                                    {destFoldersLoading ? (<div className="p-2 space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>) : destFolders && destFolders.length > 0 ? (
                                        destFolders.map((folder) => (
                                            <Button key={folder.name} variant="ghost" size="sm" className="w-full justify-start" onClick={() => setMoveDestPath(moveDestPath ? `${moveDestPath}/${folder.name}` : folder.name)}>
                                                <Folder className="h-4 w-4 mr-2 text-blue-500 fill-blue-500/20" /> {folder.name}
                                            </Button>
                                        ))
                                    ) : (<p className="text-xs text-muted-foreground p-2">No subfolders</p>)}
                                    <p className="text-xs text-muted-foreground italic px-2 py-1 border-t mt-2 pt-2">Moving to: {moveDestPath || 'Root'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleMoveSubmit} disabled={!moveDestBucket || moveMutation.isPending}>{moveMutation.isPending ? 'Moving...' : 'Move Here'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

export default FileBrowser;
