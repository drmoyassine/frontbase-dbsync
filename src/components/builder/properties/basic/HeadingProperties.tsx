/**
 * Heading Properties Panel
 * Configuration UI for the Heading component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VariableInput } from '../../VariableInput';

interface HeadingPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const HeadingProperties: React.FC<HeadingPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="heading-text">Text <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
                <VariableInput
                    value={props.text || ''}
                    onChange={(value) => updateComponentProp('text', value)}
                    placeholder="Enter heading text or type @ for variables"
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
        </>
    );
};
