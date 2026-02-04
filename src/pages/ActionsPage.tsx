import React, { useState, useMemo } from 'react';
import { useWorkflowDrafts, useBulkDeleteDrafts } from '@/stores/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Play, GitBranch, Workflow, Trash2, Search, X, CheckSquare, Square } from 'lucide-react';
import { WorkflowEditor } from '@/components/actions/editor/WorkflowEditor';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export default function ActionsPage() {
    const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const { toast } = useToast();
    const { data, isLoading } = useWorkflowDrafts();
    const bulkDelete = useBulkDeleteDrafts();

    // Filter drafts by search query
    const filteredDrafts = useMemo(() => {
        if (!data?.drafts) return [];
        if (!searchQuery.trim()) return data.drafts;

        const query = searchQuery.toLowerCase();
        return data.drafts.filter(draft =>
            draft.name.toLowerCase().includes(query) ||
            draft.trigger_type.toLowerCase().includes(query)
        );
    }, [data?.drafts, searchQuery]);

    const handleCreate = () => {
        setEditingDraftId(null);
        setIsEditorOpen(true);
    };

    const handleEdit = (id: string) => {
        // Don't open editor if in selection mode
        if (selectedIds.size > 0) {
            toggleSelection(id);
            return;
        }
        setEditingDraftId(id);
        setIsEditorOpen(true);
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredDrafts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredDrafts.map(d => d.id)));
        }
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const handleBulkDelete = async () => {
        try {
            const result = await bulkDelete.mutateAsync(Array.from(selectedIds));
            toast({
                title: 'Deleted',
                description: `${result.deleted} workflow(s) deleted successfully`,
            });
            setSelectedIds(new Set());
            setShowDeleteDialog(false);
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete workflows',
                variant: 'destructive',
            });
        }
    };

    if (isEditorOpen) {
        return (
            <div className="h-[calc(100vh-4rem)] -m-6">
                <WorkflowEditor
                    draftId={editingDraftId}
                    onClose={() => setIsEditorOpen(false)}
                    className="h-full"
                />
            </div>
        );
    }

    const isAllSelected = filteredDrafts.length > 0 && selectedIds.size === filteredDrafts.length;
    const hasSelection = selectedIds.size > 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Automations</h2>
                    <p className="text-muted-foreground">Manage your automation workflows.</p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Automation
                </Button>
            </div>

            {/* Search and Selection Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search workflows..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Selection controls */}
                {filteredDrafts.length > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAll}
                        className="gap-2"
                    >
                        {isAllSelected ? (
                            <CheckSquare className="h-4 w-4" />
                        ) : (
                            <Square className="h-4 w-4" />
                        )}
                        {isAllSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                )}

                {/* Bulk actions toolbar */}
                {hasSelection && (
                    <div className="flex items-center gap-2 ml-auto bg-muted/50 px-3 py-1.5 rounded-lg border">
                        <span className="text-sm font-medium">
                            {selectedIds.size} selected
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearSelection}
                            className="h-7 px-2"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowDeleteDialog(true)}
                            className="h-7 gap-1"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                    </div>
                )}
            </div>

            {/* Workflow Grid */}
            {isLoading ? (
                <div>Loading...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDrafts.map((draft) => (
                        <Card
                            key={draft.id}
                            className={cn(
                                "cursor-pointer transition-all hover:shadow-md relative",
                                selectedIds.has(draft.id)
                                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                                    : "hover:border-primary"
                            )}
                            onClick={() => handleEdit(draft.id)}
                        >
                            {/* Selection checkbox */}
                            <div
                                className="absolute top-3 right-3 z-10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelection(draft.id);
                                }}
                            >
                                <Checkbox
                                    checked={selectedIds.has(draft.id)}
                                    className="h-5 w-5 border-2"
                                />
                            </div>

                            <CardHeader className="pb-3 pr-10">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="truncate pr-2">{draft.name}</CardTitle>
                                    {draft.is_published && <Badge variant="secondary">v{draft.published_version}</Badge>}
                                </div>
                                <CardDescription>
                                    Updated {formatDistanceToNow(new Date(draft.updated_at), { addSuffix: true })}
                                </CardDescription>
                            </CardHeader>
                            <CardFooter className="text-xs text-muted-foreground flex gap-4 pt-0">
                                <span className="flex items-center gap-1 bg-secondary/30 px-2 py-1 rounded">
                                    <GitBranch className="w-3 h-3" />
                                    {draft.trigger_type}
                                </span>
                                <span className="flex items-center gap-1 bg-secondary/30 px-2 py-1 rounded">
                                    <Play className="w-3 h-3" />
                                    {draft.nodes.length} nodes
                                </span>
                            </CardFooter>
                        </Card>
                    ))}

                    {/* Empty state */}
                    {filteredDrafts.length === 0 && !searchQuery && (
                        <div className="col-span-full text-center py-16 border-2 border-dashed rounded-lg text-muted-foreground flex flex-col items-center gap-4">
                            <div className="p-4 bg-muted rounded-full">
                                <Workflow className="w-8 h-8 opacity-50" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">No automations yet</h3>
                                <p>Create your first workflow to automate actions.</p>
                            </div>
                            <Button onClick={handleCreate} variant="outline">
                                Create Automation
                            </Button>
                        </div>
                    )}

                    {/* No search results */}
                    {filteredDrafts.length === 0 && searchQuery && (
                        <div className="col-span-full text-center py-16 text-muted-foreground">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>No workflows match "{searchQuery}"</p>
                            <Button
                                variant="link"
                                onClick={() => setSearchQuery('')}
                                className="mt-2"
                            >
                                Clear search
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedIds.size} workflow(s)?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the selected
                            workflows and remove all associated data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {bulkDelete.isPending ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
