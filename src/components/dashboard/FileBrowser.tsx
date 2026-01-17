import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    HardDrive,
    FolderOpen,
    Folder,
    FolderPlus,
    File,
    Upload,
    Trash2,
    Copy,
    ExternalLink,
    MoreVertical,
    ArrowLeft,
    RefreshCw,
    Lock,
    Globe,
    Image,
    FileText,
    Film,
    Music,
    Plus,
    Edit2,
    Archive,
    Settings,
    Search,
    Check,
    Move,
    X,
    ArrowUp,
    ArrowDown,
    ChevronsUpDown
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MultiSelectCustom } from '@/components/ui/multi-select-custom';

// Constants
const MIME_TYPE_OPTIONS = [
    { label: 'Images (any)', value: 'image/*' },
    { label: 'PNG Image', value: 'image/png' },
    { label: 'JPEG Image', value: 'image/jpeg' },
    { label: 'GIF Image', value: 'image/gif' },
    { label: 'SVG Image', value: 'image/svg+xml' },
    { label: 'WebP Image', value: 'image/webp' },
    { label: 'PDF Document', value: 'application/pdf' },
    { label: 'JSON Data', value: 'application/json' },
    { label: 'Text File', value: 'text/plain' },
    { label: 'HTML File', value: 'text/html' },
    { label: 'CSV File', value: 'text/csv' },
    { label: 'Video (any)', value: 'video/*' },
    { label: 'MP4 Video', value: 'video/mp4' },
    { label: 'Audio (any)', value: 'audio/*' },
    { label: 'MP3 Audio', value: 'audio/mpeg' },
    { label: 'Archive (ZIP)', value: 'application/zip' },
];

// Types
interface Bucket {
    id: string;
    name: string;
    public: boolean;
    created_at: string;
    provider: string;
    size: number;
    file_size_limit?: number;
    allowed_mime_types?: string[];
}

interface StorageFile {
    name: string;
    id: string;
    size: number;
    updated_at?: string;
    mimetype?: string;
    isFolder: boolean;
    metadata?: any;
}

// Keeping FileObject as an alias or consolidating to StorageFile
type FileObject = StorageFile;

type SortKey = 'name' | 'type' | 'updated_at' | 'size';
type SortDirection = 'asc' | 'desc';

// API functions
const EDGE_API = import.meta.env.VITE_EDGE_API_URL || '';

async function createBucket(name: string, isPublic: boolean, fileSizeLimit?: number, allowedMimeTypes?: string[]) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, public: isPublic, file_size_limit: fileSizeLimit, allowed_mime_types: allowedMimeTypes }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create bucket');
    return data.bucket;
}

async function updateBucket(id: string, isPublic: boolean, fileSizeLimit?: number, allowedMimeTypes?: string[]) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public: isPublic, file_size_limit: fileSizeLimit, allowed_mime_types: allowedMimeTypes }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to update bucket');
    return data;
}

async function deleteBucket(id: string) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets/${id}`, {
        method: 'DELETE',
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to delete bucket');
}

async function emptyBucket(id: string) {
    const res = await fetch(`${EDGE_API}/api/storage/buckets/${id}/empty`, {
        method: 'POST',
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to empty bucket');
}

async function fetchBuckets(): Promise<Bucket[]> {
    const res = await fetch(`${EDGE_API}/api/storage/buckets`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch buckets');
    return data.buckets;
}

async function fetchFiles(bucket: string, path?: string, page: number = 0, limit: number = 10, search?: string): Promise<StorageFile[]> {
    const params = new URLSearchParams();
    params.set('bucket', bucket);
    if (path) params.set('path', path);
    params.set('limit', limit.toString());
    params.set('offset', (page * limit).toString());
    if (search) params.set('search', search);

    const url = `${EDGE_API}/api/storage/list?${params.toString()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch files');
    return data.files;
}

// ... (other API functions)

// ...

// Queries

async function deleteFile(paths: string[], bucket?: string): Promise<void> {
    console.log('[FileBrowser] deleteFile called with:', { paths, bucket });
    try {
        const res = await fetch(`${EDGE_API}/api/storage/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths, bucket }),
        });
        const data = await res.json();
        if (!data.success) {
            console.error('[FileBrowser] Delete failed response:', data);
            throw new Error(data.error || 'Failed to delete');
        }
        console.log('[FileBrowser] Delete successful');
    } catch (e) {
        console.error('[FileBrowser] Delete error:', e);
        throw e;
    }
}

async function getSignedUrl(path: string, bucket: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('path', path);
    params.set('bucket', bucket);

    const res = await fetch(`${EDGE_API}/api/storage/signed-url?${params.toString()}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to get URL');
    return data.signedUrl;
}

async function uploadFile(file: File, path?: string, bucket?: string): Promise<{ path: string; publicUrl: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (path) formData.append('path', path);
    if (bucket) formData.append('bucket', bucket);

    const res = await fetch(`${EDGE_API}/api/storage/upload`, {
        method: 'POST',
        body: formData,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to upload');
    return { path: data.path, publicUrl: data.publicUrl };
}

async function createFolder(folderPath: string, bucket: string): Promise<void> {
    const res = await fetch(`${EDGE_API}/api/storage/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath, bucket }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create folder');
}

async function moveFile(sourceKey: string, destinationKey: string, options?: { sourceBucket?: string; destBucket?: string }): Promise<void> {
    const res = await fetch(`${EDGE_API}/api/storage/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sourceKey,
            destinationKey,
            sourceBucket: options?.sourceBucket,
            destBucket: options?.destBucket
        }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to move/rename');
}

// Helpers
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return Image;
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return Film;
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return Music;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return FileText;
    return File;
}

// Components
export function FileBrowser() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // State
    const [currentBucket, setCurrentBucket] = useState<string | null>(null);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [page, setPage] = useState(0);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });
    const pageSize = 10;
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Auto-deselect on navigation
    React.useEffect(() => {
        setSelectedFiles(new Set());
    }, [currentBucket, currentPath]);

    // Bucket Dialog State
    const [isBucketDialogOpen, setIsBucketDialogOpen] = useState(false);
    const [bucketDialogMode, setBucketDialogMode] = useState<'create' | 'edit'>('create');
    const [editingBucketId, setEditingBucketId] = useState<string | null>(null);
    const [bucketForm, setBucketForm] = useState({
        name: '',
        public: false,
        fileSizeLimit: '',
        allowedMimeTypes: ''
    });

    // Confirmation Dialog State
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        actionLabel: string;
        actionType: 'delete' | 'empty' | 'deleteBucket' | null;
        targetId: string | null;
        variant?: 'default' | 'destructive';
    }>({
        isOpen: false,
        title: '',
        description: '',
        actionLabel: '',
        actionType: null,
        targetId: null,
    });

    // Folder Dialog State
    const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // Rename Dialog State
    // Rename Dialog State
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<{ name: string; isFolder: boolean } | null>(null);
    const [newName, setNewName] = useState('');

    // Search & Multi-Select State
    const [bucketSearch, setBucketSearch] = useState('');
    const [fileSearch, setFileSearch] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

    // Bucket Advanced Controls State
    const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
    const [bucketSortConfig, setBucketSortConfig] = useState<{
        key: 'name' | 'created_at' | 'size';
        direction: 'asc' | 'desc';
    }>({ key: 'name', direction: 'asc' });
    const [bucketPage, setBucketPage] = useState(1);
    const bucketPageSize = 5; // Smaller size for buckets as they are high level

    // Move Dialog State
    const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
    const [moveTargets, setMoveTargets] = useState<string[]>([]);
    const [moveDestBucket, setMoveDestBucket] = useState<string | null>(null);
    const [moveDestPath, setMoveDestPath] = useState<string>('');

    // Queries
    const { data: buckets, isLoading: bucketsLoading, error: bucketsError, refetch: refetchBuckets } = useQuery({
        queryKey: ['storage-buckets'],
        queryFn: fetchBuckets,
    });

    const fullPath = currentBucket ? `${currentBucket}/${currentPath}`.replace(/\/$/, '') : '';

    const { data: files, isLoading: filesLoading, error: filesError, refetch: refetchFiles } = useQuery({
        queryKey: ['storage-files', fullPath, page, fileSearch],
        queryFn: () => fetchFiles(currentBucket!, currentPath || undefined, page, pageSize, fileSearch),
        enabled: !!currentBucket,
    });

    const { data: destFolders, isLoading: destFoldersLoading } = useQuery({
        queryKey: ['storage-files', moveDestBucket, moveDestPath, 'folders-only'],
        queryFn: async () => {
            const files = await fetchFiles(moveDestBucket!, moveDestPath || undefined, 0, 100);
            return files.filter(f => f.isFolder);
        },
        enabled: isMoveDialogOpen && !!moveDestBucket,
    });

    // Multi-Select Handlers
    const handleSelectAll = (checked: boolean) => {
        if (checked && files) {
            setSelectedFiles(new Set(files.map(f => f.name)));
        } else {
            setSelectedFiles(new Set());
        }
    };

    const handleSelectFile = (name: string, checked: boolean) => {
        const newSelected = new Set(selectedFiles);
        if (checked) {
            newSelected.add(name);
        } else {
            newSelected.delete(name);
        }
        setSelectedFiles(newSelected);
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
            targetId: null // We'll handle bulk delete by checking selectedFiles in the mutation or handler
        });
    };

    const createBucketMutation = useMutation({
        mutationFn: (data: any) => createBucket(data.name, data.public, data.fileSizeLimit, data.allowedMimeTypes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-buckets'] });
            setIsBucketDialogOpen(false);
            toast({ title: "Bucket created" });
        },
        onError: (err) => toast({ title: "Failed to create bucket", description: (err as Error).message, variant: "destructive" })
    });

    const updateBucketMutation = useMutation({
        mutationFn: (data: any) => updateBucket(data.id, data.public, data.fileSizeLimit, data.allowedMimeTypes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-buckets'] });
            setIsBucketDialogOpen(false);
            toast({ title: "Bucket updated" });
        },
        onError: (err) => toast({ title: "Failed to update bucket", description: (err as Error).message, variant: "destructive" })
    });

    const deleteBucketMutation = useMutation({
        mutationFn: deleteBucket,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-buckets'] });
            if (currentBucket === editingBucketId) setCurrentBucket(null);
            toast({ title: "Bucket deleted" });
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        },
        onError: (err) => toast({ title: "Failed to delete bucket", description: (err as Error).message, variant: "destructive" })
    });

    const emptyBucketMutation = useMutation({
        mutationFn: emptyBucket,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files'] });
            toast({ title: "Bucket emptied" });
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        },
        onError: (err) => toast({ title: "Failed to empty bucket", description: (err as Error).message, variant: "destructive" })
    });

    const handleOpenCreateBucket = () => {
        setBucketDialogMode('create');
        setBucketForm({ name: '', public: false, fileSizeLimit: '', allowedMimeTypes: '' });
        setIsBucketDialogOpen(true);
    };

    const handleOpenEditBucket = (bucket: Bucket, e: React.MouseEvent) => {
        e.stopPropagation();
        setBucketDialogMode('edit');
        setEditingBucketId(bucket.id);
        setBucketForm({
            name: bucket.name,
            public: bucket.public,
            fileSizeLimit: bucket.file_size_limit ? (bucket.file_size_limit / (1024 * 1024)).toString() : '',
            allowedMimeTypes: bucket.allowed_mime_types?.join(', ') || ''
        });
        setIsBucketDialogOpen(true);
    };

    const handleBucketSubmit = () => {
        const fileSize = bucketForm.fileSizeLimit ? parseFloat(bucketForm.fileSizeLimit) * 1024 * 1024 : undefined;
        const mimeTypes = bucketForm.allowedMimeTypes ? bucketForm.allowedMimeTypes.split(',').map(t => t.trim()).filter(Boolean) : undefined;

        if (bucketDialogMode === 'create') {
            createBucketMutation.mutate({
                name: bucketForm.name,
                public: bucketForm.public,
                fileSizeLimit: fileSize,
                allowedMimeTypes: mimeTypes
            });
        } else {
            updateBucketMutation.mutate({
                id: editingBucketId,
                public: bucketForm.public,
                fileSizeLimit: fileSize,
                allowedMimeTypes: mimeTypes
            });
        }
    };

    // Handlers
    const handleCopyUrl = async (fileName: string) => {
        const path = currentPath ? `${currentPath}/${fileName}` : fileName;
        try {
            if (!currentBucket) throw new Error('No bucket selected');
            const url = await getSignedUrl(path, currentBucket);
            await navigator.clipboard.writeText(url);
            toast({
                title: "URL Copied",
                description: "The file URL has been copied to your clipboard.",
            });
        } catch (e) {
            console.error('Failed to copy URL:', e);
            toast({
                title: "Copy Failed",
                description: "Failed to copy file URL.",
                variant: "destructive",
            });
        }
    };

    const handleFileClick = async (file: StorageFile) => {
        if (file.isFolder) {
            const newPath = currentPath ? `${currentPath}/${file.name}` : file.name;
            setCurrentPath(newPath);
            setPage(0);
        } else {
            // Open file in new tab
            const path = currentPath ? `${currentPath}/${file.name}` : file.name;
            try {
                if (!currentBucket) throw new Error('No bucket selected');
                const url = await getSignedUrl(path, currentBucket);
                window.open(url, '_blank');
            } catch (e) {
                console.error('Failed to open file:', e);
                toast({
                    title: "Open Failed",
                    description: "Failed to open file.",
                    variant: "destructive",
                });
            }
        }
    };

    // Mutations
    const deleteMutation = useMutation({
        mutationFn: (paths: string[]) => {
            console.log('[FileBrowser] Mutating delete for:', paths);
            return deleteFile(paths, currentBucket || undefined);
        },
        onSuccess: () => {
            console.log('[FileBrowser] Delete mutation success');
            queryClient.invalidateQueries({ queryKey: ['storage-files'] });
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            toast({ title: "File deleted" });
        },
        onError: (error) => {
            console.error('[FileBrowser] Delete mutation error:', error);
            toast({
                title: "Delete Failed",
                description: (error as Error).message,
                variant: "destructive"
            });
            // Keep dialog open on error? Or close? Let's close it to avoid stuck state, or keep it.
            // setConfirmDialog(prev => ({ ...prev, isOpen: false })); 
        }
    });

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const path = currentPath ? `${currentPath}/${file.name}` : file.name;
            return uploadFile(file, path, currentBucket || undefined);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files'] });
            toast({ title: "File uploaded" });
        },
        onError: (error) => {
            toast({ title: "Upload Failed", description: (error as Error).message, variant: "destructive" });
        }
    });

    const createFolderMutation = useMutation({
        mutationFn: async (folderName: string) => {
            const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
            return createFolder(folderPath, currentBucket!);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files'] });
            setIsFolderDialogOpen(false);
            setNewFolderName('');
            toast({ title: "Folder created" });
        },
        onError: (error) => {
            toast({ title: "Create Folder Failed", description: (error as Error).message, variant: "destructive" });
        }
    });

    const renameMutation = useMutation({
        mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
            const sourceKey = currentPath ? `${currentPath}/${oldName}` : oldName;
            const destKey = currentPath ? `${currentPath}/${newName}` : newName;
            return moveFile(sourceKey, destKey, { sourceBucket: currentBucket!, destBucket: currentBucket! });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files'] });
            setIsRenameDialogOpen(false);
            setRenameTarget(null);
            setNewName('');
            toast({ title: "Renamed successfully" });
        },
        onError: (error) => {
            toast({ title: "Rename Failed", description: (error as Error).message, variant: "destructive" });
        }
    });

    // Handlers
    const moveMutation = useMutation({
        mutationFn: async ({ targets, destBucket, destPath, sourceBucket }: { targets: string[]; destBucket: string; destPath: string; sourceBucket: string }) => {
            return Promise.all(targets.map(targetPath => {
                const fileName = targetPath.split('/').pop()!;
                const destinationKey = destPath ? `${destPath}/${fileName}` : fileName;
                return moveFile(targetPath, destinationKey, { sourceBucket, destBucket });
            }));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['storage-files'] });
            setIsMoveDialogOpen(false);
            setMoveTargets([]);
            setSelectedFiles(new Set());
            toast({ title: "Moved successfully" });
        },
        onError: (error) => {
            toast({ title: "Move Failed", description: (error as Error).message, variant: "destructive" });
        }
    });

    // Handlers
    const handleMove = (paths: string | string[]) => {
        const targetPaths = Array.isArray(paths) ? paths : [paths];
        setMoveTargets(targetPaths);
        setMoveDestBucket(currentBucket);
        setMoveDestPath(''); // Start at root of current/selected bucket
        setIsMoveDialogOpen(true);
    };

    const handleMoveSubmit = () => {
        if (moveDestBucket && moveTargets.length > 0) {
            moveMutation.mutate({
                targets: moveTargets,
                destBucket: moveDestBucket,
                destPath: moveDestPath,
                sourceBucket: currentBucket!
            });
        }
    };

    const handleBucketClick = (bucket: Bucket) => {
        setCurrentBucket(bucket.name);
        setCurrentPath('');
        setPage(0);
    };

    const handleBack = () => {
        if (currentPath) {
            const parts = currentPath.split('/');
            parts.pop();
            setCurrentPath(parts.join('/'));
            setPage(0);
        } else {
            setCurrentBucket(null);
            setPage(0);
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
            targetId: path
        });
    };

    const handleConfirmAction = () => {
        if (!confirmDialog.actionType) return;

        if (confirmDialog.actionType === 'delete') {
            // Check if it's a bulk delete or single delete
            if (selectedFiles.size > 0 && !confirmDialog.targetId) {
                // Bulk delete
                const paths = Array.from(selectedFiles).map(name => currentPath ? `${currentPath}/${name}` : name);
                deleteMutation.mutate(paths);
                setSelectedFiles(new Set()); // Clear selection after delete
            } else if (confirmDialog.targetId) {
                // Single delete
                deleteMutation.mutate([confirmDialog.targetId]);
            }
        } else if (confirmDialog.actionType === 'empty' && confirmDialog.targetId) {
            emptyBucketMutation.mutate(confirmDialog.targetId);
        } else if (confirmDialog.actionType === 'deleteBucket' && confirmDialog.targetId) {
            deleteBucketMutation.mutate(confirmDialog.targetId);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            uploadMutation.mutate(file);
        }
        e.target.value = '';
    };

    const handleRefresh = () => {
        refetchBuckets();
        refetchFiles();
    };

    const handleRename = (file: StorageFile) => {
        setRenameTarget({ name: file.name, isFolder: file.isFolder || false });
        setNewName(file.name);
        setIsRenameDialogOpen(true);
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

    // Sorting Logic
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getSortedFiles = (files: FileObject[]) => {
        return [...files].sort((a, b) => {
            // Always keep folders on top
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;

            let aValue: any = a[sortConfig.key === 'type' ? 'mimetype' : sortConfig.key];
            let bValue: any = b[sortConfig.key === 'type' ? 'mimetype' : sortConfig.key];

            // Handle undefined/null
            if (!aValue) aValue = '';
            if (!bValue) bValue = '';

            // Handle type sorting specifically
            if (sortConfig.key === 'type') {
                aValue = a.isFolder ? 'Folder' : a.mimetype || a.name.split('.').pop() || '';
                bValue = b.isFolder ? 'Folder' : b.mimetype || b.name.split('.').pop() || '';
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const sortedFiles = files ? getSortedFiles(files) : [];

    // Filter by search
    const filteredFiles = sortedFiles.filter(f =>
        fileSearch === '' || f.name.toLowerCase().includes(fileSearch.toLowerCase())
    );

    // Final filtered and sorted buckets for the view
    const filteredAndSortedBuckets = React.useMemo(() => {
        if (!buckets) return [];

        return [...buckets]
            .filter(b => {
                const matchesSearch = b.name.toLowerCase().includes(bucketSearch.toLowerCase());
                const matchesProvider = selectedProviders.length === 0 || selectedProviders.includes(b.provider);
                return matchesSearch && matchesProvider;
            })
            .sort((a, b) => {
                const { key, direction } = bucketSortConfig;
                let aValue: any = a[key as keyof Bucket];
                let bValue: any = b[key as keyof Bucket];

                if (aValue < bValue) return direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [buckets, bucketSearch, selectedProviders, bucketSortConfig]);

    const paginatedBuckets = filteredAndSortedBuckets.slice(
        (bucketPage - 1) * bucketPageSize,
        bucketPage * bucketPageSize
    );

    const totalBucketPages = Math.ceil(filteredAndSortedBuckets.length / bucketPageSize);

    // Render bucket list
    if (!currentBucket) {
        // Pagination (apply after sort)
        // We need to re-apply filtering here, as 'files' is already filtered by search/buckets above in query? 
        // Wait, 'files' from useQuery is raw data. The filtering happens in queryFn or component?
        // Looking at fetchFiles, it returns paginated data if limit is passed. But here limit is 100.
        // If we want client side sort, we should probably fetch more or sort existing page.
        // Assuming 'files' is the current view data.

        // Actually, 'files' corresponds to the *current page* if we use pagination in useQuery.
        // BUT the current implementation of useQuery uses separate page state but fetchFiles seems to fetch a range?
        // Let's look at useQuery implementation again.
        // Line 317: queryKey: ['storage-files', currentBucket, currentPath, page],
        // queryFn: () => fetchFiles(currentBucket!, currentPath || undefined, page, pageSize),
        // So 'files' is JUST the current page. Sorting 10 items is weird if there are more.
        // However, user asked for "sort functionality to the columns". 
        // Ideally we should do server side sort, but standard Supabase storage list doesn't support sorting params easily.
        // So client side sort of the *fetched* files is what we can do now. 

        // If we are doing client side search/sort on the page, the pagination might feel weird.
        // But let's proceed with sorting the current view.
        const filteredBuckets = buckets?.filter(b => b.name.toLowerCase().includes(bucketSearch.toLowerCase())) || [];
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
                            <Button variant="outline" size="sm" onClick={handleRefresh}>
                                <RefreshCw className="h-4 w-4" />
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
                                    onChange={(e) => {
                                        setBucketSearch(e.target.value);
                                        setBucketPage(1); // Reset to first page on search
                                    }}
                                />
                            </div>
                            <MultiSelectCustom
                                options={[{ label: 'Supabase', value: 'Supabase' }]}
                                selected={selectedProviders}
                                onChange={(val) => {
                                    setSelectedProviders(val);
                                    setBucketPage(1);
                                }}
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
                                                {bucket.public ? (
                                                    <><Globe className="h-3 w-3 mr-1" /> Public</>
                                                ) : (
                                                    <><Lock className="h-3 w-3 mr-1" /> Private</>
                                                )}
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
                                                    <Settings className="h-4 w-4 mr-2" />
                                                    Settings
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmDialog({
                                                        isOpen: true,
                                                        title: 'Empty Bucket',
                                                        description: `Are you sure you want to empty the bucket "${bucket.name}"? This cannot be undone.`,
                                                        actionLabel: 'Empty',
                                                        variant: 'destructive',
                                                        actionType: 'empty',
                                                        targetId: bucket.id
                                                    });
                                                }}>
                                                    <Archive className="h-4 w-4 mr-2" />
                                                    Empty Bucket
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmDialog({
                                                            isOpen: true,
                                                            title: 'Delete Bucket',
                                                            description: `Are you sure you want to delete the bucket "${bucket.name}"? This action cannot be undone.`,
                                                            actionLabel: 'Delete',
                                                            variant: 'destructive',
                                                            actionType: 'deleteBucket',
                                                            targetId: bucket.id
                                                        });
                                                    }}
                                                >
                                                    <X className="h-4 w-4 mr-2" />
                                                    Delete Bucket
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
                                                <PaginationPrevious
                                                    onClick={() => setBucketPage(p => Math.max(1, p - 1))}
                                                    className={bucketPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
                                            </PaginationItem>
                                            {Array.from({ length: totalBucketPages }, (_, i) => (
                                                <PaginationItem key={i}>
                                                    <PaginationLink
                                                        onClick={() => setBucketPage(i + 1)}
                                                        isActive={bucketPage === i + 1}
                                                        className="cursor-pointer"
                                                    >
                                                        {i + 1}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            ))}
                                            <PaginationItem>
                                                <PaginationNext
                                                    onClick={() => setBucketPage(p => Math.min(totalBucketPages, p + 1))}
                                                    className={bucketPage === totalBucketPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                                />
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
                            <Button variant="link" onClick={handleOpenCreateBucket}>
                                Create your first bucket
                            </Button>
                        </div>
                    )}
                </CardContent>

                <Dialog open={isBucketDialogOpen} onOpenChange={setIsBucketDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{bucketDialogMode === 'create' ? 'Create Bucket' : 'Edit Bucket'}</DialogTitle>
                            <DialogDescription>
                                Configure storage bucket settings.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            {bucketDialogMode === 'create' && (
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input
                                        id="name"
                                        value={bucketForm.name}
                                        onChange={(e) => setBucketForm({ ...bucketForm, name: e.target.value })}
                                        placeholder="e.g., uploads"
                                    />
                                </div>
                            )}
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="public"
                                    checked={bucketForm.public}
                                    onCheckedChange={(checked) => setBucketForm({ ...bucketForm, public: checked })}
                                />
                                <Label htmlFor="public">Public Bucket</Label>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="size">Max File Size (MB)</Label>
                                <Input
                                    id="size"
                                    type="number"
                                    value={bucketForm.fileSizeLimit}
                                    onChange={(e) => setBucketForm({ ...bucketForm, fileSizeLimit: e.target.value })}
                                    placeholder="No limit"
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Allowed Mime Types</Label>
                                <MultiSelectCustom
                                    selected={bucketForm.allowedMimeTypes ? bucketForm.allowedMimeTypes.split(',').map(s => s.trim()).filter(Boolean) : []}
                                    options={MIME_TYPE_OPTIONS}
                                    onChange={(selected) => setBucketForm({ ...bucketForm, allowedMimeTypes: selected.join(', ') })}
                                    placeholder="Select MIME types (e.g. image/jpeg)"
                                />
                                <p className="text-[0.8rem] text-muted-foreground">
                                    Leave empty to allow all file types. content-type
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsBucketDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleBucketSubmit}>
                                {bucketDialogMode === 'create' ? 'Create' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {confirmDialog.description}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmAction}
                                className={confirmDialog.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
                            >
                                {confirmDialog.actionLabel}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </Card >
        );
    }

    // Render file list
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={handleBack}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <FolderOpen className="h-5 w-5" />
                                {currentBucket}{currentPath && `/${currentPath}`}
                            </CardTitle>
                        </div>
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
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleMove(Array.from(selectedFiles).map(name => currentPath ? `${currentPath}/${name}` : name))} title="Move Selected">
                                    <Move className="h-3 w-3" />
                                </Button>
                                {/* We could add Bulk Move here later */}
                            </div>
                        )}
                        <div className="relative w-[200px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search files..."
                                className="pl-8 h-9"
                                value={fileSearch}
                                onChange={(e) => setFileSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleRefresh}>
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setIsFolderDialogOpen(true)}>
                                <FolderPlus className="h-4 w-4 mr-1" />
                                New Folder
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadMutation.isPending}
                            >
                                <Upload className="h-4 w-4 mr-1" />
                                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {filesLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : filesError ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>Failed to load files</p>
                        <p className="text-sm">{(filesError as Error).message}</p>
                    </div>
                ) : files && files.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <div className="flex items-center justify-center">
                                        <div
                                            className={cn(
                                                "h-4 w-4 rounded border border-primary flex items-center justify-center cursor-pointer transition-colors",
                                                selectedFiles.size > 0 && selectedFiles.size === files.length ? "bg-primary text-primary-foreground" : "bg-transparent"
                                            )}
                                            onClick={() => handleSelectAll(selectedFiles.size !== files.length)}
                                        >
                                            {selectedFiles.size > 0 && selectedFiles.size === files.length && <Check className="h-3 w-3" />}
                                        </div>
                                    </div>
                                </TableHead>
                                <TableHead className="w-[40%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-1">
                                        Name
                                        {sortConfig.key === 'name' && (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                        {sortConfig.key !== 'name' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}
                                    </div>
                                </TableHead>
                                <TableHead className="w-[20%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('type')}>
                                    <div className="flex items-center gap-1">
                                        Type
                                        {sortConfig.key === 'type' && (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                        {sortConfig.key !== 'type' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}
                                    </div>
                                </TableHead>
                                <TableHead className="w-[20%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('updated_at')}>
                                    <div className="flex items-center gap-1">
                                        Date Modified
                                        {sortConfig.key === 'updated_at' && (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                        {sortConfig.key !== 'updated_at' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}
                                    </div>
                                </TableHead>
                                <TableHead className="w-[15%] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('size')}>
                                    <div className="flex items-center gap-1">
                                        Size
                                        {sortConfig.key === 'size' && (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                        )}
                                        {sortConfig.key !== 'size' && <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />}
                                    </div>
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
                                                <div
                                                    className={cn(
                                                        "h-4 w-4 rounded border border-primary flex items-center justify-center cursor-pointer transition-colors",
                                                        selectedFiles.has(file.name) ? "bg-primary text-primary-foreground" : "bg-transparent"
                                                    )}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectFile(file.name, !selectedFiles.has(file.name));
                                                    }}
                                                >
                                                    {selectedFiles.has(file.name) && <Check className="h-3 w-3" />}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                {file.isFolder ? (
                                                    <Folder className="h-4 w-4 text-blue-500 fill-blue-500/20" />
                                                ) : (
                                                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                                                )}
                                                <button
                                                    onClick={() => handleFileClick(file)}
                                                    className={cn(
                                                        "font-medium text-sm text-left hover:underline",
                                                        file.isFolder ? "text-foreground font-semibold" : "text-foreground"
                                                    )}
                                                >
                                                    {file.name}
                                                </button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {file.isFolder ? 'Folder' : file.mimetype || file.name.split('.').pop()?.toUpperCase() || 'File'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {file.updated_at ? new Date(file.updated_at).toLocaleDateString() : '-'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {formatBytes(file.size)}
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleCopyUrl(file.name)}>
                                                        <Copy className="h-4 w-4 mr-2" />
                                                        Copy URL
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleRename(file)}>
                                                        <Edit2 className="h-4 w-4 mr-2" />
                                                        Rename
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleMove(currentPath ? `${currentPath}/${file.name}` : file.name)}>
                                                        <Move className="h-4 w-4 mr-2" />
                                                        Move
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(file.name)}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        <File className="mx-auto h-12 w-12 mb-4" />
                        <p>No files in this bucket</p>
                        <p className="text-sm">Upload files to get started</p>
                    </div>
                )}

                {/* Pagination Controls */}
                {files && files.length > 0 && (
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            Previous
                        </Button>
                        <div className="text-sm text-muted-foreground">
                            Page {page + 1}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => p + 1)}
                            disabled={files.length < pageSize}
                        >
                            Next
                        </Button>
                    </div>
                )}
            </CardContent>

            {/* Delete confirmation dialog for file list view */}
            <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDialog.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmAction}
                            className={confirmDialog.variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
                        >
                            {confirmDialog.actionLabel}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* New Folder Dialog */}
            <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Folder</DialogTitle>
                        <DialogDescription>
                            Enter a name for the new folder.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="folderName">Folder Name</Label>
                            <Input
                                id="folderName"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                placeholder="e.g., images"
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFolderDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleCreateFolder}
                            disabled={!newFolderName.trim() || createFolderMutation.isPending}
                        >
                            {createFolderMutation.isPending ? 'Creating...' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rename Dialog */}
            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename {renameTarget?.isFolder ? 'Folder' : 'File'}</DialogTitle>
                        <DialogDescription>
                            Enter a new name for "{renameTarget?.name}".
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="newName">New Name</Label>
                            <Input
                                id="newName"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleRenameSubmit}
                            disabled={!newName.trim() || newName === renameTarget?.name || renameMutation.isPending}
                        >
                            {renameMutation.isPending ? 'Renaming...' : 'Rename'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Move Destination Picker Dialog */}
            <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Move {moveTargets.length} items</DialogTitle>
                        <DialogDescription>
                            Select destination bucket and folder.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {/* Bucket Selection */}
                        <div className="space-y-2">
                            <Label>Destination Bucket</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {buckets?.map(b => (
                                    <Button
                                        key={b.id}
                                        variant={moveDestBucket === b.name ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => {
                                            setMoveDestBucket(b.name);
                                            setMoveDestPath('');
                                        }}
                                        className="justify-start truncate"
                                    >
                                        <HardDrive className="h-4 w-4 mr-2 flex-shrink-0" />
                                        {b.name}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Folder Picker logic - simple list for now as we don't have a dedicated recursive picker */}
                        {moveDestBucket && (
                            <div className="space-y-2 border rounded-md p-3 max-h-[250px] overflow-y-auto">
                                <Label className="text-xs text-muted-foreground uppercase">Path: {moveDestPath || 'Root'}</Label>
                                <div className="space-y-1">
                                    {moveDestPath && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-start text-blue-500"
                                            onClick={() => {
                                                const parts = moveDestPath.split('/');
                                                parts.pop();
                                                setMoveDestPath(parts.join('/'));
                                            }}
                                        >
                                            <ArrowLeft className="h-4 w-4 mr-2" />
                                            Back
                                        </Button>
                                    )}
                                    {destFoldersLoading ? (
                                        <div className="p-2 space-y-2">
                                            <Skeleton className="h-8 w-full" />
                                            <Skeleton className="h-8 w-full" />
                                        </div>
                                    ) : destFolders && destFolders.length > 0 ? (
                                        destFolders.map(folder => (
                                            <Button
                                                key={folder.name}
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start"
                                                onClick={() => setMoveDestPath(moveDestPath ? `${moveDestPath}/${folder.name}` : folder.name)}
                                            >
                                                <Folder className="h-4 w-4 mr-2 text-blue-500 fill-blue-500/20" />
                                                {folder.name}
                                            </Button>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground p-2">No subfolders</p>
                                    )}
                                    <p className="text-xs text-muted-foreground italic px-2 py-1 border-t mt-2 pt-2">
                                        Tip: Moving to the path "{moveDestPath || 'Root'}"
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleMoveSubmit}
                            disabled={!moveDestBucket || moveMutation.isPending}
                        >
                            {moveMutation.isPending ? 'Moving...' : 'Move Here'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card >
    );
}
