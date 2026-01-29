/**
 * Progress Properties Panel
 * Configuration UI for the Progress component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ProgressPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const ProgressProperties: React.FC<ProgressPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="progress-value">Value (0-100)</Label>
                <Input
                    id="progress-value"
                    type="number"
                    min="0"
                    max="100"
                    value={props.value || 50}
                    onChange={(e) => updateComponentProp('value', parseInt(e.target.value))}
                />
            </div>
        </>
    );
};
