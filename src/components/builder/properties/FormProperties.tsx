import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

interface FormPropertiesProps {
    type: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
    hasBinding: boolean;
}

export const FormProperties: React.FC<FormPropertiesProps> = ({
    type,
    props,
    updateComponentProp,
    onDataBindingClick,
    hasBinding
}) => {
    // Input component
    if (type === 'Input') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="input-label">Label</Label>
                    <Input
                        id="input-label"
                        value={props.label || ''}
                        onChange={(e) => updateComponentProp('label', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="input-placeholder">Placeholder</Label>
                    <Input
                        id="input-placeholder"
                        value={props.placeholder || ''}
                        onChange={(e) => updateComponentProp('placeholder', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="input-type">Type</Label>
                    <Select value={props.inputType || 'text'} onValueChange={(value) => updateComponentProp('inputType', value)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="password">Password</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
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

    // Textarea component
    if (type === 'Textarea') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="textarea-label">Label</Label>
                    <Input
                        id="textarea-label"
                        value={props.label || ''}
                        onChange={(e) => updateComponentProp('label', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="textarea-placeholder">Placeholder</Label>
                    <Input
                        id="textarea-placeholder"
                        value={props.placeholder || ''}
                        onChange={(e) => updateComponentProp('placeholder', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="textarea-rows">Rows</Label>
                    <Input
                        id="textarea-rows"
                        type="number"
                        value={props.rows || 3}
                        onChange={(e) => updateComponentProp('rows', parseInt(e.target.value))}
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

    // Select component
    if (type === 'Select') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="select-placeholder">Placeholder</Label>
                    <Input
                        id="select-placeholder"
                        value={props.placeholder || ''}
                        onChange={(e) => updateComponentProp('placeholder', e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="select-options">Options (one per line)</Label>
                    <Textarea
                        id="select-options"
                        value={(props.options || []).join('\n')}
                        onChange={(e) => updateComponentProp('options', e.target.value.split('\n').filter(Boolean))}
                        rows={4}
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

    // Checkbox/Switch component
    if (type === 'Checkbox' || type === 'Switch') {
        return (
            <>
                <div className="space-y-2">
                    <Label htmlFor="label-text">Label</Label>
                    <Input
                        id="label-text"
                        value={props.label || ''}
                        onChange={(e) => updateComponentProp('label', e.target.value)}
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

    return null;
};
