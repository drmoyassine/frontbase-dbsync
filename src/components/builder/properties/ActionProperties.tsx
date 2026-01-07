import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import { ActionConfigurator, ActionBinding } from '@/components/actions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ActionPropertiesProps {
    componentId?: string;
    props: Record<string, any>;
    updateComponentProp: (key: string, value: any) => void;
    onDataBindingClick: () => void;
    hasBinding: boolean;
}

export const ActionProperties: React.FC<ActionPropertiesProps> = ({
    componentId,
    props,
    updateComponentProp,
    onDataBindingClick,
    hasBinding
}) => {
    // Get action bindings from props
    const actionBindings: ActionBinding[] = props.actionBindings || [];

    const handleBindingsChange = (bindings: ActionBinding[]) => {
        updateComponentProp('actionBindings', bindings);
    };

    return (
        <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 p-4">
                <div className="space-y-2">
                    <Label htmlFor="btn-text">Text</Label>
                    <Input
                        id="btn-text"
                        value={props.text || ''}
                        onChange={(e) => updateComponentProp('text', e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="btn-variant">Variant</Label>
                    <Select value={props.variant || 'default'} onValueChange={(value) => updateComponentProp('variant', value)}>
                        <SelectTrigger id="btn-variant">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="secondary">Secondary</SelectItem>
                            <SelectItem value="destructive">Destructive</SelectItem>
                            <SelectItem value="outline">Outline</SelectItem>
                            <SelectItem value="ghost">Ghost</SelectItem>
                            <SelectItem value="link">Link</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="btn-size">Size</Label>
                    <Select value={props.size || 'default'} onValueChange={(value) => updateComponentProp('size', value)}>
                        <SelectTrigger id="btn-size">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="sm">Small</SelectItem>
                            <SelectItem value="lg">Large</SelectItem>
                            <SelectItem value="icon">Icon</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

            </TabsContent>

            <TabsContent value="actions" className="space-y-4 p-4">
                <ActionConfigurator
                    componentId={componentId || 'button'}
                    componentType="Button"
                    bindings={actionBindings}
                    onBindingsChange={handleBindingsChange}
                    availableTriggers={['onClick', 'onHover']}
                />
            </TabsContent>
        </Tabs>
    );
};
