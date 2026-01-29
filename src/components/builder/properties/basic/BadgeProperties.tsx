/**
 * Badge Properties Panel
 * Configuration UI for the Badge component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VariableInput } from '../../VariableInput';
import { IconPicker } from '../IconPicker';

interface BadgePropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
}

export const BadgeProperties: React.FC<BadgePropertiesProps> = ({
    props,
    updateComponentProp
}) => {
    return (
        <>
            <div className="space-y-2">
                <Label htmlFor="badge-text">Text <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
                <VariableInput
                    value={props.text || ''}
                    onChange={(value) => updateComponentProp('text', value)}
                    placeholder="Badge text"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="badge-variant">Variant</Label>
                <Select value={props.variant || 'default'} onValueChange={(value) => updateComponentProp('variant', value)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="secondary">Secondary</SelectItem>
                        <SelectItem value="destructive">Destructive</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="badge-icon">Icon (Optional)</Label>
                <IconPicker
                    value={props.icon || ''}
                    onChange={(value) => updateComponentProp('icon', value)}
                />
            </div>
            {props.icon && (
                <div className="space-y-2">
                    <Label htmlFor="badge-icon-position">Icon Position</Label>
                    <Select value={props.iconPosition || 'left'} onValueChange={(value) => updateComponentProp('iconPosition', value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-2">
                <Label htmlFor="badge-bg-color">Background Color</Label>
                <div className="flex gap-2">
                    <Input
                        id="badge-bg-color"
                        type="color"
                        value={props.backgroundColor || '#000000'}
                        onChange={(e) => updateComponentProp('backgroundColor', e.target.value)}
                        className="w-20 h-9 p-1 cursor-pointer"
                    />
                    <Input
                        type="text"
                        value={props.backgroundColor || ''}
                        onChange={(e) => updateComponentProp('backgroundColor', e.target.value)}
                        placeholder="CSS color"
                        className="flex-1"
                    />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="badge-text-color">Text Color</Label>
                <div className="flex gap-2">
                    <Input
                        id="badge-text-color"
                        type="color"
                        value={props.textColor || '#000000'}
                        onChange={(e) => updateComponentProp('textColor', e.target.value)}
                        className="w-20 h-9 p-1 cursor-pointer"
                    />
                    <Input
                        type="text"
                        value={props.textColor || ''}
                        onChange={(e) => updateComponentProp('textColor', e.target.value)}
                        placeholder="CSS color"
                        className="flex-1"
                    />
                </div>
            </div>
            {props.icon && (
                <div className="space-y-2">
                    <Label htmlFor="badge-icon-color">Icon Color</Label>
                    <div className="flex gap-2">
                        <Input
                            id="badge-icon-color"
                            type="color"
                            value={props.iconColor || '#000000'}
                            onChange={(e) => updateComponentProp('iconColor', e.target.value)}
                            className="w-20 h-9 p-1 cursor-pointer"
                        />
                        <Input
                            type="text"
                            value={props.iconColor || ''}
                            onChange={(e) => updateComponentProp('iconColor', e.target.value)}
                            placeholder="CSS color"
                            className="flex-1"
                        />
                    </div>
                </div>
            )}
        </>
    );
};
