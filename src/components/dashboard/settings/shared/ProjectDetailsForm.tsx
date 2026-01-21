/**
 * ProjectDetailsForm
 * 
 * Form component for project-level settings.
 * Used in Dashboard SettingsPanel General tab.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Globe, Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { toast } from 'sonner';

interface ProjectDetailsFormProps {
    /** Whether to wrap in a Card component */
    withCard?: boolean;
}

const MAX_FAVICON_SIZE = 256 * 1024; // 256KB
const ALLOWED_FAVICON_TYPES = ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'];

export function ProjectDetailsForm({ withCard = false }: ProjectDetailsFormProps) {
    const { project, updateProjectInDatabase, isLoading } = useBuilderStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        name: '',
        appUrl: '',
        faviconUrl: '',
        description: '',
    });
    const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Sync form with project data
    useEffect(() => {
        if (project) {
            setFormData({
                name: project.name || '',
                appUrl: project.appUrl || '',
                faviconUrl: project.faviconUrl || '',
                description: project.description || '',
            });
            if (project.faviconUrl) {
                setFaviconPreview(project.faviconUrl);
            }
        }
    }, [project]);

    const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!ALLOWED_FAVICON_TYPES.includes(file.type) && !file.name.endsWith('.ico')) {
            toast.error('Invalid file type. Use PNG or ICO files.');
            return;
        }

        // Validate file size
        if (file.size > MAX_FAVICON_SIZE) {
            toast.error('Favicon too large. Maximum size is 256KB.');
            return;
        }

        setIsUploading(true);
        try {
            // Create FormData for upload - use backend assets endpoint (not user storage)
            const uploadData = new FormData();
            uploadData.append('file', file);
            uploadData.append('asset_type', 'favicon');

            const response = await fetch('/api/project/assets/upload', {
                method: 'POST',
                body: uploadData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            const faviconUrl = result.url || result.publicUrl;

            setFormData(prev => ({ ...prev, faviconUrl }));
            setFaviconPreview(faviconUrl);
            toast.success('Favicon uploaded successfully');
        } catch (error) {
            console.error('Favicon upload error:', error);
            toast.error('Failed to upload favicon');
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemoveFavicon = () => {
        setFormData(prev => ({ ...prev, faviconUrl: '' }));
        setFaviconPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateProjectInDatabase({
                name: formData.name,
                appUrl: formData.appUrl || undefined,
                faviconUrl: formData.faviconUrl || undefined,
                description: formData.description || undefined,
            });
            toast.success('Project settings saved');
        } catch (error) {
            toast.error('Failed to save project settings');
        } finally {
            setIsSaving(false);
        }
    };

    const content = (
        <>
            <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                    id="project-name"
                    placeholder="My Website"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="app-url">App URL</Label>
                <Input
                    id="app-url"
                    placeholder="https://mysite.com"
                    value={formData.appUrl}
                    onChange={(e) => setFormData({ ...formData, appUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                    Public URL for publish/preview. Leave empty to auto-detect.
                </p>
            </div>

            {/* Favicon Upload */}
            <div className="space-y-2">
                <Label>Favicon</Label>
                <div className="flex items-center gap-4">
                    {faviconPreview ? (
                        <div className="relative">
                            <img
                                src={faviconPreview}
                                alt="Favicon preview"
                                className="w-12 h-12 rounded border border-border object-contain bg-muted"
                            />
                            <button
                                type="button"
                                onClick={handleRemoveFavicon}
                                className="absolute -top-2 -right-2 p-0.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ) : (
                        <div className="w-12 h-12 rounded border border-dashed border-border flex items-center justify-center bg-muted/50">
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                    )}
                    <div className="flex-1">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".png,.ico,image/png,image/x-icon"
                            onChange={handleFaviconUpload}
                            className="hidden"
                            id="favicon-upload"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Upload className="mr-2 h-4 w-4" />
                            )}
                            Upload Favicon
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">
                            PNG or ICO, max 256KB. Default: Frontbase logo.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="project-description">Project Description</Label>
                <Textarea
                    id="project-description"
                    placeholder="A description of your project..."
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
            </div>
            <div className="pt-2">
                <Button onClick={handleSave} disabled={isSaving || isLoading}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
            </div>
        </>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Project Settings
                    </CardTitle>
                    <CardDescription>
                        Configure your project name, URL, favicon, and description
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {content}
                </CardContent>
            </Card>
        );
    }

    return <div className="space-y-4">{content}</div>;
}
