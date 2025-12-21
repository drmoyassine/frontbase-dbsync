import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

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
                <div className="space-y-2 pt-2 border-t">
                    <Label>Data Binding</Label>
                    <Button
                        variant="outline"
                        onClick={onDataBindingClick}
                        className="w-full justify-start"
                    >
                        <Database className="mr-2 h-4 w-4" />
                        {hasBinding ? 'Edit Data Binding' : 'Configure Data Binding'}
                    </Button>
                </div>
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
                <div className="space-y-2 pt-2 border-t">
                    <Label>Data Binding</Label>
                    <Button
                        variant="outline"
                        onClick={onDataBindingClick}
                        className="w-full justify-start"
                    >
                        <Database className="mr-2 h-4 w-4" />
                        {hasBinding ? 'Edit Data Binding' : 'Configure Data Binding'}
                    </Button>
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
                <div className="space-y-2">
                    <Label>Data Binding</Label>
                    <Button
                        variant="outline"
                        onClick={onDataBindingClick}
                        className="w-full justify-start"
                    >
                        <Database className="mr-2 h-4 w-4" />
                        {hasBinding ? 'Edit Data Binding' : 'Configure Data Binding'}
                    </Button>
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
                <div className="space-y-2">
                    <Label>Data Binding</Label>
                    <Button
                        variant="outline"
                        onClick={onDataBindingClick}
                        className="w-full justify-start"
                    >
                        <Database className="mr-2 h-4 w-4" />
                        {hasBinding ? 'Edit Data Binding' : 'Configure Data Binding'}
                    </Button>
                </div>
            </div>
        );
    }

    return null;
};
