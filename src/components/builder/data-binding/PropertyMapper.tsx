import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTableSchema } from '@/hooks/useSimpleData';

interface PropertyMapperProps {
    tableName: string;
    componentType: string;
    mapping: Record<string, string>;
    onMappingChange: (mapping: Record<string, string>) => void;
}

const BINDABLE_PROPERTIES: Record<string, { label: string; prop: string }[]> = {
    Text: [{ label: 'Content', prop: 'text' }],
    Heading: [{ label: 'Text', prop: 'text' }],
    Button: [{ label: 'Label', prop: 'text' }],
    Input: [
        { label: 'Value', prop: 'value' },
        { label: 'Placeholder', prop: 'placeholder' }
    ],
    Image: [
        { label: 'Image URL', prop: 'src' },
        { label: 'Alt Text', prop: 'alt' }
    ],
    Link: [
        { label: 'URL', prop: 'href' },
        { label: 'Text', prop: 'text' }
    ],
    Avatar: [
        { label: 'Image URL', prop: 'src' },
        { label: 'Fallback', prop: 'fallback' }
    ],
    Badge: [{ label: 'Text', prop: 'text' }],
    Progress: [{ label: 'Value', prop: 'value' }],
    Checkbox: [
        { label: 'Checked State', prop: 'checked' },
        { label: 'Label', prop: 'label' }
    ],
    Switch: [
        { label: 'Checked State', prop: 'checked' },
        { label: 'Label', prop: 'label' }
    ],
    Textarea: [
        { label: 'Value', prop: 'value' },
        { label: 'Placeholder', prop: 'placeholder' }
    ],
    Select: [
        { label: 'Value', prop: 'value' },
        { label: 'Placeholder', prop: 'placeholder' }
    ]
};

export function PropertyMapper({
    tableName,
    componentType,
    mapping,
    onMappingChange
}: PropertyMapperProps) {
    const { schema, loading, error } = useTableSchema(tableName);

    const properties = BINDABLE_PROPERTIES[componentType] || [];

    const handleMappingChange = (prop: string, column: string) => {
        const newMapping = { ...mapping };
        if (column === '_none') {
            delete newMapping[prop];
        } else {
            newMapping[prop] = column;
        }
        onMappingChange(newMapping);
    };

    if (!tableName) {
        return (
            <div className="text-center p-4 text-muted-foreground">
                Please select a table first.
            </div>
        );
    }

    if (loading) {
        return <div className="p-4 text-center">Loading schema...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-destructive">Error loading schema: {error}</div>;
    }

    if (properties.length === 0) {
        return (
            <div className="text-center p-4 text-muted-foreground">
                No bindable properties for this component type.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
                Map component properties to database columns.
            </div>

            {properties.map(({ label, prop }) => (
                <div key={prop} className="grid grid-cols-2 gap-4 items-center">
                    <Label>{label}</Label>
                    <Select
                        value={mapping[prop] || '_none'}
                        onValueChange={(value) => handleMappingChange(prop, value)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_none">-- None --</SelectItem>
                            {schema?.columns.map((col: any) => (
                                <SelectItem key={col.name} value={col.name}>
                                    {col.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ))}
        </div>
    );
}
