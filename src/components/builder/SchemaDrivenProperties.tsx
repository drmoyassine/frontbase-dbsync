/**
 * SchemaDrivenProperties — renders a list of property fields described by a
 * `PropertyFieldConfig[]` (see registry/propertySchemas.ts).
 *
 * Replaces the bespoke `*Properties.tsx` panels for simple components. Each
 * field maps to a shared UI primitive (VariableInput, Select, ColorInput,
 * IconPicker, …) so rendering stays consistent and new components need only a
 * schema — no new file and no switch case.
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VariableInput } from './VariableInput';
import { IconPicker } from './properties/IconPicker';
import { ColorInput } from './properties/ColorInput';
import type { PropertyFieldConfig } from './registry/propertySchemas';

interface SchemaDrivenPropertiesProps {
    fields: PropertyFieldConfig[];
    props: Record<string, any>;
    updateProp: (key: string, value: any) => void;
}

export const SchemaDrivenProperties: React.FC<SchemaDrivenPropertiesProps> = ({
    fields,
    props,
    updateProp,
}) => {
    return (
        <>
            {fields.map((field) => (
                <PropertyField
                    key={field.name}
                    field={field}
                    value={props[field.name]}
                    onChange={(value) => updateProp(field.name, value)}
                    allProps={props}
                />
            ))}
        </>
    );
};

interface PropertyFieldProps {
    field: PropertyFieldConfig;
    value: any;
    onChange: (value: any) => void;
    allProps: Record<string, any>;
}

const PropertyField: React.FC<PropertyFieldProps> = ({ field, value, onChange, allProps }) => {
    // Conditional visibility (e.g. icon options only when an icon is set).
    if (field.visible && !field.visible(allProps)) return null;

    const label = field.label ?? field.name;
    // Variable-capable text inputs show the "@ for variables" hint, matching the
    // previous bespoke panels (Heading, Badge, Text).
    const showVariableHint = field.type === 'text';

    const renderLabel = () => (
        <Label className="text-sm font-medium">
            {label}
            {showVariableHint && (
                <span className="text-muted-foreground text-xs"> (@ for variables)</span>
            )}
        </Label>
    );

    switch (field.type) {
        case 'text':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <VariableInput
                        value={value ?? ''}
                        onChange={onChange}
                        syntaxContext={field.syntaxContext ?? 'output'}
                        multiline={field.multiline}
                        placeholder={field.placeholder}
                        allowedGroups={field.allowedGroups}
                    />
                </div>
            );

        case 'input':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Input
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder}
                    />
                </div>
            );

        case 'textarea':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Textarea
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={field.placeholder}
                        rows={field.rows ?? 3}
                    />
                </div>
            );

        case 'number':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Input
                        type="number"
                        value={value ?? field.defaultValue ?? ''}
                        onChange={(e) => onChange(parseInt(e.target.value, 10))}
                        min={field.min}
                        max={field.max}
                    />
                </div>
            );

        case 'select':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <Select
                        value={value ?? field.defaultValue ?? ''}
                        onValueChange={onChange}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {field.options.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            );

        case 'boolean':
            return (
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{label}</Label>
                    <Switch
                        checked={value ?? field.defaultValue ?? false}
                        onCheckedChange={onChange}
                    />
                </div>
            );

        case 'color':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <ColorInput value={value ?? ''} onChange={onChange} />
                </div>
            );

        case 'icon':
            return (
                <div className="space-y-2">
                    {renderLabel()}
                    <IconPicker value={value ?? ''} onChange={onChange} />
                </div>
            );

        default:
            return null;
    }
};
