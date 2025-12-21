import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ContainerPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const ContainerProperties: React.FC<ContainerPropertiesProps> = ({ props, updateComponentProp }) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="container-padding">Padding</Label>
                <Select value={props.padding || 'p-4'} onValueChange={(value) => updateComponentProp('padding', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="p-0">None</SelectItem>
                        <SelectItem value="p-2">Small</SelectItem>
                        <SelectItem value="p-4">Medium</SelectItem>
                        <SelectItem value="p-8">Large</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="container-layout">Layout</Label>
                <Select value={props.layout || 'flex-col'} onValueChange={(value) => updateComponentProp('layout', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="flex-col">Vertical</SelectItem>
                        <SelectItem value="flex-row">Horizontal</SelectItem>
                        <SelectItem value="grid">Grid</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="container-gap">Gap</Label>
                <Select value={props.gap || 'gap-4'} onValueChange={(value) => updateComponentProp('gap', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="gap-0">None</SelectItem>
                        <SelectItem value="gap-2">Small</SelectItem>
                        <SelectItem value="gap-4">Medium</SelectItem>
                        <SelectItem value="gap-8">Large</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </>
    );
};
