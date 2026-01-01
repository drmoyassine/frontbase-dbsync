import React, { useState, useEffect } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { getDefaultPageStyles } from '@/lib/styles/defaults';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreatePageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPageCreated: (pageId: string) => void;
}

export const CreatePageDialog: React.FC<CreatePageDialogProps> = ({
    open,
    onOpenChange,
    onPageCreated,
}) => {
    const { pages } = useBuilderStore();
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');

    // Auto-generate slug from name
    useEffect(() => {
        if (name) {
            const generatedSlug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            setSlug(generatedSlug);
        }
    }, [name]);

    const validateSlug = () => {
        if (!slug) {
            setError('Slug is required');
            return false;
        }

        // Check for slug uniqueness
        const existingSlugs = new Set(pages.map(p => p.slug));
        if (existingSlugs.has(slug)) {
            setError('A page with this slug already exists');
            return false;
        }

        // Validate slug format
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            setError('Slug must contain only lowercase letters, numbers, and hyphens');
            return false;
        }

        setError('');
        return true;
    };

    const handleCreate = async () => {
        if (!name) {
            setError('Page name is required');
            return;
        }

        if (!validateSlug()) {
            return;
        }

        setIsCreating(true);
        setError('');

        try {
            const { createPageInDatabase } = useBuilderStore.getState();

            const pageData = {
                name,
                slug,
                title: name,
                description: 'A new page created with Frontbase',
                keywords: '',
                isPublic: false,
                isHomepage: false,
                containerStyles: getDefaultPageStyles(),
                layoutData: {
                    content: [], // Start with empty canvas
                    root: {}
                }
            };

            const newPageId = await createPageInDatabase(pageData);

            if (newPageId) {
                onPageCreated(newPageId);
                onOpenChange(false);
                // Reset form
                setName('');
                setSlug('');
                setError('');
            } else {
                throw new Error('Failed to create page');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create page');
        } finally {
            setIsCreating(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            // Reset form when closing
            setName('');
            setSlug('');
            setError('');
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create New Page</DialogTitle>
                    <DialogDescription>
                        Enter a name and slug for your new page. The slug will be used in the URL.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Page Name</Label>
                        <Input
                            id="name"
                            placeholder="My New Page"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isCreating}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="slug">Slug</Label>
                        <Input
                            id="slug"
                            placeholder="my-new-page"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            onBlur={validateSlug}
                            disabled={isCreating}
                        />
                        <p className="text-sm text-muted-foreground">
                            URL: /{slug || 'your-slug'}
                        </p>
                    </div>

                    {error && (
                        <div className="text-sm text-destructive">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={isCreating}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} disabled={isCreating}>
                        {isCreating ? 'Creating...' : 'Create Page'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
