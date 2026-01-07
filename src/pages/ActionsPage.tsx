import React, { useState } from 'react';
import { useWorkflowDrafts } from '@/stores/actions';
import { Button } from '@/components/ui/button';
import { Plus, Play, GitBranch, Workflow } from 'lucide-react';
import { WorkflowEditor } from '@/components/actions/editor/WorkflowEditor';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export default function ActionsPage() {
    const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    // We fetch drafts to show the list
    const { data, isLoading } = useWorkflowDrafts();

    const handleCreate = () => {
        setEditingDraftId(null);
        setIsEditorOpen(true);
    };

    const handleEdit = (id: string) => {
        setEditingDraftId(id);
        setIsEditorOpen(true);
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

    return (
        <div className="space-y-6">
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

            {isLoading ? (
                <div>Loading...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data?.drafts?.map((draft) => (
                        <Card
                            key={draft.id}
                            className="cursor-pointer hover:border-primary transition-colors hover:shadow-md"
                            onClick={() => handleEdit(draft.id)}
                        >
                            <CardHeader className="pb-3">
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
                    {(!data?.drafts || data.drafts.length === 0) && (
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
                </div>
            )}
        </div>
    );
}
