/**
 * Link Properties Panel
 * Configuration UI for the Link component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database } from 'lucide-react';

interface LinkPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
}

export const LinkProperties: React.FC<LinkPropertiesProps> = ({
    props,
    updateComponentProp,
    onDataBindingClick
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="link-text">Text</Label>
                <Input
                    id="link-text"
                    value={props.text || ''}
                    onChange={(e) => updateComponentProp('text', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="link-href">URL</Label>
                <Input
                    id="link-href"
                    value={props.href || ''}
                    onChange={(e) => updateComponentProp('href', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="link-target">Target</Label>
                <Select value={props.target || '_self'} onValueChange={(value) => updateComponentProp('target', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="_self">Same Tab</SelectItem>
                        <SelectItem value="_blank">New Tab</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    variant="outline"
                    onClick={onDataBindingClick}
                    className="w-full justify-start"
                >
                    <Database className="mr-2 h-4 w-4" />
                    {props.binding ? 'Edit Data Binding' : 'Configure Data Binding'}
                </Button>
            </div>
        </>
    );
};
