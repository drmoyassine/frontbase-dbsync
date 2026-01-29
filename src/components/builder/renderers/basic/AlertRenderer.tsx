import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RendererProps } from '../types';

export const AlertRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => (
    <Alert className={combinedClassName} style={inlineStyles}>
        <AlertDescription>
            {effectiveProps.message || 'This is an alert message.'}
        </AlertDescription>
    </Alert>
);
