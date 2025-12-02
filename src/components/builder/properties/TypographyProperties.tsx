import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

interface TypographyPropertiesProps {
    type: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
    hasBinding: boolean;
}

export const TypographyProperties: React.FC<TypographyPropertiesProps> = ({
    type,
    props,
    updateComponentProp,
    onDataBindingClick,
    hasBinding
}) => {
    // Heading component
    if (type === 'Heading') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="heading-text">Text</Label>
                    <Input
                        id="heading-text"
                        value={props.text || ''}
                        onChange={(e) => updateComponentProp('text', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="heading-level">Level</Label>
                    <Select value={props.level || 'h1'} onValueChange={(value) => updateComponentProp('level', value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="h1">H1</SelectItem>
                            <SelectItem value="h2">H2</SelectItem>
                            <SelectItem value="h3">H3</SelectItem>
                            <SelectItem value="h4">H4</SelectItem>
                            <SelectItem value="h5">H5</SelectItem>
                            <SelectItem value="h6">H6</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2 pt-2 border-t">
                    <Label>Data Binding</Label>
                    <Button
                        variant="outline"
                        onClick={onDataBindingClick}
                        className="w-full justify-start"
                    >
                        <Database className="mr-2 h-4 w-4" />
                        {hasBinding ? 'Edit Data Binding' : 'Configure Data Binding'}
                    </Button>
                </div>
            </>
        );
    }

    // Text component
    if (type === 'Text') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="text-content">Content</Label>
                    <Textarea
                        id="text-content"
                        value={props.text || ''}
                        onChange={(e) => updateComponentProp('text', e.target.value)}
                        rows={4}
                    />
                </div>
                <div className="space-y-2 pt-2 border-t">
                    <Label>Data Binding</Label>
                    <Button
                        variant="outline"
                        onClick={onDataBindingClick}
                        className="w-full justify-start"
                    >
                        <Database className="mr-2 h-4 w-4" />
                        {hasBinding ? 'Edit Data Binding' : 'Configure Data Binding'}
                    </Button>
                </div>
            </>
        );
    }

    // Link component
    if (type === 'Link') {
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
                        {hasBinding ? 'Edit Data Binding' : 'Configure Data Binding'}
                    </Button>
                </div>
            </>
        );
    }

    return null;
};
