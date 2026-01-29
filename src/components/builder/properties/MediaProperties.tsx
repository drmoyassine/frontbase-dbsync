import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

interface MediaPropertiesProps {
    type: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
    hasBinding: boolean;
}

export const MediaProperties: React.FC<MediaPropertiesProps> = ({
    type,
    props,
    updateComponentProp,
    onDataBindingClick,
    hasBinding
}) => {
    // Image component
    if (type === 'Image') {
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
    }

    // Avatar component
    if (type === 'Avatar') {
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
    }

    return null;
};
