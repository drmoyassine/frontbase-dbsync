/**
 * Alert Properties Panel
 * Configuration UI for the Alert component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface AlertPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const AlertProperties: React.FC<AlertPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <div className="space-y-2">
            <Label htmlFor="alert-message">Message</Label>
            <Textarea
                id="alert-message"
                value={props.message || ''}
                onChange={(e) => updateComponentProp('message', e.target.value)}
                rows={3}
            />
        </div>
    );
};
