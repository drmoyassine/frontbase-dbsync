/**
 * Image Properties Panel
 * Configuration UI for the Image component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ImagePropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const ImageProperties: React.FC<ImagePropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="image-src">Image URL</Label>
                <Input
                    id="image-src"
                    value={props.src || ''}
                    onChange={(e) => updateComponentProp('src', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="image-alt">Alt Text</Label>
                <Input
                    id="image-alt"
                    value={props.alt || ''}
                    onChange={(e) => updateComponentProp('alt', e.target.value)}
                />
            </div>
        </>
    );
};
