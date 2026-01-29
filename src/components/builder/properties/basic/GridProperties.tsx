/**
 * Grid Properties Panel
 * Configuration UI for the Grid component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database } from 'lucide-react';

interface GridPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
}

export const GridProperties: React.FC<GridPropertiesProps> = ({
    props,
    updateComponentProp,
    onDataBindingClick
}) => {
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
                    {props.binding ? 'Edit Data Binding' : 'Configure Data Binding'}
                </Button>
            </div>
        </div>
    );
};
