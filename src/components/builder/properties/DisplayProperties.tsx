import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import { IconPicker } from './IconPicker';
import { VariableInput } from '../VariableInput';

interface DisplayPropertiesProps {
    type: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
    hasBinding: boolean;
}

export const DisplayProperties: React.FC<DisplayPropertiesProps> = ({
    type,
    props,
    updateComponentProp,
    onDataBindingClick,
    hasBinding
}) => {
    // Alert component
    if (type === 'Alert') {
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
    }

    // Badge component
    if (type === 'Badge') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="badge-text">Text</Label>
                    <Input
                        id="badge-text"
                        value={props.text || ''}
                        onChange={(e) => updateComponentProp('text', e.target.value)}
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
    }

    // Progress component
    if (type === 'Progress') {
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
    }

    // Chart component
    if (type === 'Chart') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="chart-type">Chart Type</Label>
                    <Select value={props.chartType || 'bar'} onValueChange={(value) => updateComponentProp('chartType', value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="bar">Bar Chart</SelectItem>
                            <SelectItem value="line">Line Chart</SelectItem>
                            <SelectItem value="pie">Pie Chart</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    // Grid component
    if (type === 'Grid') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="grid-columns">Columns</Label>
                    <Select value={(props.columns || 3).toString()} onValueChange={(value) => updateComponentProp('columns', parseInt(value))}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 Column</SelectItem>
                            <SelectItem value="2">2 Columns</SelectItem>
                            <SelectItem value="3">3 Columns</SelectItem>
                            <SelectItem value="4">4 Columns</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    // Card Component
    if (type === 'Card') {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="card-title">Title <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
                    <VariableInput
                        value={props.title || ''}
                        onChange={(value) => updateComponentProp('title', value)}
                        placeholder="Card title or type @ for variables"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="card-desc">Description <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
                    <VariableInput
                        value={props.description || ''}
                        onChange={(value) => updateComponentProp('description', value)}
                        placeholder="Card description or type @ for variables"
                        multiline
                    />
                </div>

                <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Icon</Label>
                    <div className="space-y-2">
                        <Label htmlFor="card-icon">Icon Name</Label>
                        <IconPicker
                            value={props.icon}
                            onChange={(val) => updateComponentProp('icon', val)}
                        />
                    </div>
                    {props.icon && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Size</Label>
                                <Select value={props.iconSize || 'md'} onValueChange={(v) => updateComponentProp('iconSize', v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sm">Small</SelectItem>
                                        <SelectItem value="md">Medium</SelectItem>
                                        <SelectItem value="lg">Large</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Color</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="color"
                                        value={props.iconColor || '#000000'}
                                        onChange={(e) => updateComponentProp('iconColor', e.target.value)}
                                        className="w-8 h-8 p-1 px-1"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Alignment</Label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Icon Align</Label>
                            <Select value={props.iconAlignment || 'center'} onValueChange={(v) => updateComponentProp('iconAlignment', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="left">Left</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                    <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Text Align</Label>
                            <Select value={props.textAlignment || 'center'} onValueChange={(v) => updateComponentProp('textAlignment', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="left">Left</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                    <SelectItem value="right">Right</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
