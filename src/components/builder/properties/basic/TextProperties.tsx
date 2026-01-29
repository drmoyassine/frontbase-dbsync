/**
 * Text Properties Panel
 * Configuration UI for the Text component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { VariableInput } from '../../VariableInput';

interface TextPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const TextProperties: React.FC<TextPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="text-content">Content <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
                <VariableInput
                    value={props.text || ''}
                    onChange={(value) => updateComponentProp('text', value)}
                    multiline
                    placeholder="Enter text or type @ for variables"
                />
            </div>
        </>
    );
};
