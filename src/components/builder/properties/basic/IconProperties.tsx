/**
 * Icon Properties Panel
 * Configuration UI for the Icon component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconPicker } from '../IconPicker';
import { ColorPicker } from '@/components/builder/style-controls/ColorPicker';

interface IconPropertiesProps {
    props: Record<string, any>;
    styles: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    updateComponentStyle: (key: string, value: any) => void;
}

export const IconProperties: React.FC<IconPropertiesProps> = ({
    props,
    styles,
    updateComponentProp,
    updateComponentStyle
}) => {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Icon</Label>
                <IconPicker
                    value={props.icon || props.name || 'Star'}
                    onChange={(icon) => updateComponentProp('icon', icon)}
                />
            </div>

            <div className="space-y-2">
                <Label>Size</Label>
                <Select value={props.size || 'md'} onValueChange={(value) => updateComponentProp('size', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="xs">Extra Small (xs)</SelectItem>
                        <SelectItem value="sm">Small (sm)</SelectItem>
                        <SelectItem value="md">Medium (md)</SelectItem>
                        <SelectItem value="lg">Large (lg)</SelectItem>
                        <SelectItem value="xl">Extra Large (xl)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <ColorPicker
                label="Icon Color"
                value={props.color || styles.color || '#000000'}
                onChange={(color) => {
                    updateComponentProp('color', color);
                    updateComponentStyle('color', color);
                }}
                property="textColor"
            />
        </div>
    );
};
