/**
 * Textarea Properties Panel
 * Configuration UI for the Textarea component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface TextareaPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const TextareaProperties: React.FC<TextareaPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="textarea-label">Label</Label>
                <Input
                    id="textarea-label"
                    value={props.label || ''}
                    onChange={(e) => updateComponentProp('label', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="textarea-placeholder">Placeholder</Label>
                <Input
                    id="textarea-placeholder"
                    value={props.placeholder || ''}
                    onChange={(e) => updateComponentProp('placeholder', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="textarea-rows">Rows</Label>
                <Input
                    id="textarea-rows"
                    type="number"
                    value={props.rows || 3}
                    onChange={(e) => updateComponentProp('rows', parseInt(e.target.value))}
                />
            </div>
        </>
    );
};
