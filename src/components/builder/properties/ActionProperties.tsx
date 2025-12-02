import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

interface ActionPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
    hasBinding: boolean;
}

export const ActionProperties: React.FC<ActionPropertiesProps> = ({
    props,
    updateComponentProp,
    onDataBindingClick,
    hasBinding
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="btn-text">Text</Label>
                <Input
                    id="btn-text"
                    value={props.text || ''}
                    onChange={(e) => updateComponentProp('text', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="btn-variant">Variant</Label>
                <Select value={props.variant || 'default'} onValueChange={(value) => updateComponentProp('variant', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="secondary">Secondary</SelectItem>
                        <SelectItem value="destructive">Destructive</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                        <SelectItem value="ghost">Ghost</SelectItem>
                        <SelectItem value="link">Link</SelectItem>
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
};
