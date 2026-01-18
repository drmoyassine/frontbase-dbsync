/**
 * ProjectDetailsForm
 * 
 * Form component for project-level settings (SEO, meta tags).
 * Used in Dashboard SettingsPanel General tab.
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Globe } from 'lucide-react';

interface ProjectDetailsFormProps {
    /** Whether to wrap in a Card component */
    withCard?: boolean;
}

export function ProjectDetailsForm({ withCard = false }: ProjectDetailsFormProps) {
    // TODO: Connect to project settings API when available
    const content = (
        <>
            <div className="space-y-2">
                <Label htmlFor="default-title">Default Page Title</Label>
                <Input
                    id="default-title"
                    placeholder="My Website"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="default-description">Default Meta Description</Label>
                <Textarea
                    id="default-description"
                    placeholder="A description of your website..."
                    rows={2}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="default-keywords">Default Keywords</Label>
                <Input
                    id="default-keywords"
                    placeholder="keyword1, keyword2, keyword3"
                />
            </div>
            <div className="pt-2">
                <Button>Save Changes</Button>
            </div>
        </>
    );

    if (withCard) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Project Details
                    </CardTitle>
                    <CardDescription>
                        Configure default SEO and meta information for your website
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
