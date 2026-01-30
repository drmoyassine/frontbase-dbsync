/**
 * ProjectDetailsForm
 * 
 * Form component for project-level settings.
 * Uses AssetUploader for hybrid favicon upload (Supabase storage or URL fallback).
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Globe, Loader2 } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { toast } from 'sonner';
import { AssetUploader } from '@/components/shared/AssetUploader';

interface ProjectDetailsFormProps {
    /** Whether to wrap in a Card component */
    withCard?: boolean;
}

export function ProjectDetailsForm({ withCard = false }: ProjectDetailsFormProps) {
    const { project, updateProjectInDatabase, isLoading } = useBuilderStore();

    const [formData, setFormData] = useState({
        name: '',
        appUrl: '',
        faviconUrl: '',
        logoUrl: '',
        description: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    // Sync form with project data - only on mount or project ID change
    useEffect(() => {
        if (project) {
            setFormData({
                name: project.name || '',
                appUrl: project.appUrl || '',
                faviconUrl: project.faviconUrl || '',
                logoUrl: project.logoUrl || '',
                description: project.description || '',
            });
        }
    }, [project?.id]); // Only sync on project ID change, not every project update

    // Handle favicon URL changes from AssetUploader
    const handleFaviconChange = async (url: string) => {
        setFormData(prev => ({ ...prev, faviconUrl: url }));

        // Auto-save to database - pass empty string to clear, not undefined
        try {
            await updateProjectInDatabase({ faviconUrl: url });
        } catch (error) {
            console.error('Failed to save favicon:', error);
        }
    };

    // Handle logo URL changes from AssetUploader
    const handleLogoChange = async (url: string) => {
        setFormData(prev => ({ ...prev, logoUrl: url }));

        // Auto-save to database
        try {
            await updateProjectInDatabase({ logoUrl: url });
        } catch (error) {
            console.error('Failed to save logo:', error);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateProjectInDatabase({
                name: formData.name,
                appUrl: formData.appUrl || undefined,
                faviconUrl: formData.faviconUrl || undefined,
                logoUrl: formData.logoUrl || undefined,
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

            {/* Favicon & Logo Uploads */}
            <div className="grid grid-cols-2 gap-6">
                <AssetUploader
                    value={formData.faviconUrl}
                    onChange={handleFaviconChange}
                    assetType="favicon"
                    accept=".png,.ico,image/png,image/x-icon"
                    maxSize={256 * 1024}
                    label="Favicon"
                    helpText="PNG or ICO, max 256KB. Used in browser tabs."
                />
                <AssetUploader
                    value={formData.logoUrl}
                    onChange={handleLogoChange}
                    assetType="logo"
                    accept="image/*"
                    maxSize={1024 * 1024}
                    label="Logo"
                    helpText="PNG, SVG or JPG, max 1MB. Used for branding."
                />
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
