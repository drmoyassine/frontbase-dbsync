/**
 * Avatar Properties Panel
 * Configuration UI for the Avatar component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface AvatarPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const AvatarProperties: React.FC<AvatarPropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="avatar-src">Image URL</Label>
                <Input
                    id="avatar-src"
                    value={props.src || ''}
                    onChange={(e) => updateComponentProp('src', e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="avatar-fallback">Fallback Text</Label>
                <Input
                    id="avatar-fallback"
                    value={props.fallback || ''}
                    onChange={(e) => updateComponentProp('fallback', e.target.value)}
                    maxLength={2}
                />
            </div>
        </>
    );
};
