/**
 * Embed Properties Panel
 * Configuration UI for the Embed component (iframe/script)
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

interface EmbedPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const EmbedProperties: React.FC<EmbedPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    const embedType = props.embedType || 'iframe';

    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="embed-type">Embed Type</Label>
                <Select value={embedType} onValueChange={(value) => updateComponentProp('embedType', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="iframe">Iframe (URL)</SelectItem>
                        <SelectItem value="script">Script (HTML/JS)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {embedType === 'iframe' ? (
                <>
                    <div className="space-y-2">
                        <Label htmlFor="embed-src">URL</Label>
                        <Input
                            id="embed-src"
                            value={props.src || ''}
                            onChange={(e) => updateComponentProp('src', e.target.value)}
                            placeholder="https://example.com/embed"
                        />
                        <p className="text-xs text-muted-foreground">
                            Paste the iframe URL from Typeform, Tally, YouTube, etc.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="embed-title">Title (Accessibility)</Label>
                        <Input
                            id="embed-title"
                            value={props.title || ''}
                            onChange={(e) => updateComponentProp('title', e.target.value)}
                            placeholder="Embedded content"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="embed-sandbox">Sandbox Permissions</Label>
                        <Select
                            value={props.sandbox || 'allow-scripts allow-same-origin allow-forms'}
                            onValueChange={(value) => updateComponentProp('sandbox', value)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="allow-scripts allow-same-origin allow-forms">Standard (Forms)</SelectItem>
                                <SelectItem value="allow-scripts allow-same-origin allow-forms allow-popups">With Popups</SelectItem>
                                <SelectItem value="allow-scripts allow-same-origin">Minimal</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </>
            ) : (
                <>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700">
                            Script embeds execute raw HTML/JS. Only use trusted sources.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="embed-html">HTML / Script Code</Label>
                        <Textarea
                            id="embed-html"
                            value={props.html || ''}
                            onChange={(e) => updateComponentProp('html', e.target.value)}
                            placeholder='<script src="..."></script>'
                            rows={6}
                            className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                            Paste the embed code provided by the service.
                        </p>
                    </div>
                </>
            )}

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label htmlFor="embed-width">Width</Label>
                    <Input
                        id="embed-width"
                        value={props.width || '100%'}
                        onChange={(e) => updateComponentProp('width', e.target.value)}
                        placeholder="100%"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="embed-height">Height</Label>
                    <Input
                        id="embed-height"
                        value={props.height || '400px'}
                        onChange={(e) => updateComponentProp('height', e.target.value)}
                        placeholder="400px"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="embed-loading">Loading</Label>
                <Select value={props.loading || 'lazy'} onValueChange={(value) => updateComponentProp('loading', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="lazy">Lazy (Recommended)</SelectItem>
                        <SelectItem value="eager">Eager</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </>
    );
};
