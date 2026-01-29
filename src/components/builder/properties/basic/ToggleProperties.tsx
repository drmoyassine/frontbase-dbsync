/**
 * Toggle Properties Panel
 * Configuration UI for Checkbox and Switch components
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface TogglePropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const ToggleProperties: React.FC<TogglePropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="label-text">Label</Label>
                <Input
                    id="label-text"
                    value={props.label || ''}
                    onChange={(e) => updateComponentProp('label', e.target.value)}
                />
            </div>
        </>
    );
};
