/**
 * Chart Properties Panel
 * Configuration UI for the Chart component
 */

import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database } from 'lucide-react';

interface ChartPropertiesProps {
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
}

export const ChartProperties: React.FC<ChartPropertiesProps> = ({
    props,
    updateComponentProp,
    onDataBindingClick
}) => {
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
                    {props.binding ? 'Edit Data Binding' : 'Configure Data Binding'}
                </Button>
            </div>
        </div>
    );
};
