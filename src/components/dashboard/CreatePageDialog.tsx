import React, { useState, useEffect, useRef } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PageExportEnvelope, validatePageExport } from '@/types/page-export';

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
    const [activeTab, setActiveTab] = useState('create');

    // Import state
    const [importData, setImportData] = useState<PageExportEnvelope | null>(null);
    const [importName, setImportName] = useState('');
    const [importSlug, setImportSlug] = useState('');
    const [importError, setImportError] = useState('');
    const [importFileName, setImportFileName] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const validateSlug = (slugToCheck: string = slug) => {
        if (!slugToCheck) {
            setError('Slug is required');
            return false;
        }

        // Check for slug uniqueness
        const existingSlugs = new Set(pages.map(p => p.slug));
        if (existingSlugs.has(slugToCheck)) {
            setError('A page with this slug already exists');
            return false;
        }

        // Validate slug format
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugToCheck)) {
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

    // --- Import Logic ---

    const processImportFile = (file: File) => {
        setImportError('');
        setImportData(null);
        setImportFileName(file.name);

        if (!file.name.endsWith('.json') && !file.name.endsWith('.frontbase.json')) {
            setImportError('Please select a .json or .frontbase.json file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target?.result as string);
                const validationError = validatePageExport(parsed);
                if (validationError) {
                    setImportError(validationError);
                    return;
                }

                const envelope = parsed as PageExportEnvelope;
                setImportData(envelope);
                setImportName(envelope.page.name);
                setImportSlug(envelope.page.slug);
            } catch {
                setImportError('Failed to parse JSON file');
            }
        };
        reader.readAsText(file);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processImportFile(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processImportFile(file);
    };

    const handleImport = async () => {
        if (!importData) return;

        // Validate import slug
        if (!importSlug) {
            setImportError('Slug is required');
            return;
        }

        const existingSlugs = new Set(pages.map(p => p.slug));
        if (existingSlugs.has(importSlug)) {
            setImportError('A page with this slug already exists. Please change the slug.');
            return;
        }

        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(importSlug)) {
            setImportError('Slug must contain only lowercase letters, numbers, and hyphens');
            return;
        }

        setIsCreating(true);
        setImportError('');

        try {
            const { createPageInDatabase } = useBuilderStore.getState();

            const pageData = {
                name: importName,
                slug: importSlug,
                title: importData.page.title || importName,
                description: importData.page.description || '',
                keywords: importData.page.keywords || '',
                isPublic: false,
                isHomepage: false,
                containerStyles: importData.page.containerStyles || getDefaultPageStyles(),
                layoutData: importData.page.layoutData || { content: [], root: {} },
            };

            const newPageId = await createPageInDatabase(pageData);

            if (newPageId) {
                onPageCreated(newPageId);
                onOpenChange(false);
                resetForm();
            } else {
                throw new Error('Failed to import page');
            }
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Failed to import page');
        } finally {
            setIsCreating(false);
        }
    };

    const resetForm = () => {
        setName('');
        setSlug('');
        setError('');
        setActiveTab('create');
        setImportData(null);
        setImportName('');
        setImportSlug('');
        setImportError('');
        setImportFileName('');
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) resetForm();
        onOpenChange(newOpen);
    };

    const componentCount = importData?.page.layoutData?.content?.length ?? 0;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>New Page</DialogTitle>
                    <DialogDescription>
                        Create a blank page or import from a previously exported file.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="create">Create</TabsTrigger>
                        <TabsTrigger value="import">Import</TabsTrigger>
                    </TabsList>

                    {/* --- Create Tab (original form) --- */}
                    <TabsContent value="create" className="mt-4">
                        <div className="grid gap-4">
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
                                    onBlur={() => validateSlug()}
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

                        <DialogFooter className="mt-6">
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
                    </TabsContent>

                    {/* --- Import Tab --- */}
                    <TabsContent value="import" className="mt-4">
                        <div className="grid gap-4">
                            {/* Drop zone */}
                            {!importData && (
                                <div
                                    className={`
                                        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                                        transition-colors duration-200
                                        ${isDragging
                                            ? 'border-primary bg-primary/5'
                                            : 'border-muted-foreground/25 hover:border-primary/50'
                                        }
                                    `}
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                >
                                    <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                                    <p className="text-sm font-medium">
                                        Drop a <code>.frontbase.json</code> file here
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        or click to browse
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={handleFileSelect}
                                    />
                                </div>
                            )}

                            {/* Preview card */}
                            {importData && (
                                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        <span className="text-sm font-medium">File loaded</span>
                                        <span className="text-xs text-muted-foreground ml-auto">{importFileName}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground space-y-1">
                                        <p><strong>Components:</strong> {componentCount}</p>
                                        <p><strong>Exported:</strong> {new Date(importData.exportedAt).toLocaleDateString()}</p>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full text-xs"
                                        onClick={() => {
                                            setImportData(null);
                                            setImportFileName('');
                                            setImportError('');
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                    >
                                        Choose a different file
                                    </Button>
                                </div>
                            )}

                            {/* Editable name & slug */}
                            {importData && (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="import-name">Page Name</Label>
                                        <Input
                                            id="import-name"
                                            value={importName}
                                            onChange={(e) => setImportName(e.target.value)}
                                            disabled={isCreating}
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="import-slug">Slug</Label>
                                        <Input
                                            id="import-slug"
                                            value={importSlug}
                                            onChange={(e) => setImportSlug(e.target.value)}
                                            disabled={isCreating}
                                        />
                                        <p className="text-sm text-muted-foreground">
                                            URL: /{importSlug || 'your-slug'}
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* Error display */}
                            {importError && (
                                <div className="flex items-start gap-2 text-sm text-destructive">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{importError}</span>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="mt-6">
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={isCreating}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={isCreating || !importData}
                            >
                                {isCreating ? 'Importing...' : 'Import Page'}
                            </Button>
                        </DialogFooter>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
