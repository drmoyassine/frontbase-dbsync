/**
 * Input Properties Panel
 * Configuration UI for the Input component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InputPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const InputProperties: React.FC<InputPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="input-label">Label</Label>
                <Input
                    id="input-label"
                    value={props.label || ''}
                    onChange={(e) => updateComponentProp('label', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="input-placeholder">Placeholder</Label>
                <Input
                    id="input-placeholder"
                    value={props.placeholder || ''}
                    onChange={(e) => updateComponentProp('placeholder', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="input-type">Type</Label>
                <Select value={props.inputType || 'text'} onValueChange={(value) => updateComponentProp('inputType', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="password">Password</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </>
    );
};
