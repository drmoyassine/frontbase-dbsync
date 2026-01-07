/**
 * PropertiesPane - Node Configuration Sidebar
 * 
 * Shows configuration options for the selected node.
 */

import React from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActionsStore } from '@/stores/actions';
import { cn } from '@/lib/utils';

interface PropertiesPaneProps {
    className?: string;
}

export function PropertiesPane({ className }: PropertiesPaneProps) {
    const { nodes, selectedNodeId, updateNode, removeNode, selectNode } = useActionsStore();

    const selectedNode = nodes.find((n) => n.id === selectedNodeId);

    if (!selectedNode) {
        return (
            <div className={cn('w-72 bg-background border-l p-4', className)}>
                <div className="text-sm text-muted-foreground text-center py-8">
                    Select a node to configure
                </div>
            </div>
        );
    }

    const handleInputChange = (inputName: string, value: any) => {
        const updatedInputs = selectedNode.data.inputs.map((input) =>
            input.name === inputName ? { ...input, value } : input
        );
        updateNode(selectedNode.id, { inputs: updatedInputs });
    };

    const handleDelete = () => {
        removeNode(selectedNode.id);
    };

    return (
        <div className={cn('w-72 bg-background border-l flex flex-col', className)}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div>
                    <h3 className="font-semibold text-sm">{selectedNode.data.label}</h3>
                    <p className="text-xs text-muted-foreground">{selectedNode.data.type}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => selectNode(null)}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Properties */}
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* Node Label */}
                <div className="space-y-2">
                    <Label htmlFor="node-label">Label</Label>
                    <Input
                        id="node-label"
                        value={selectedNode.data.label}
                        onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                    />
                </div>

                {/* Dynamic Inputs */}
                {selectedNode.data.inputs.map((input) => (
                    <div key={input.name} className="space-y-2">
                        <Label htmlFor={`input-${input.name}`}>
                            {input.name}
                            {input.required && <span className="text-destructive ml-1">*</span>}
                        </Label>

                        {input.type === 'string' && (
                            <Input
                                id={`input-${input.name}`}
                                value={input.value || ''}
                                onChange={(e) => handleInputChange(input.name, e.target.value)}
                                placeholder={input.description}
                            />
                        )}

                        {input.type === 'json' && (
                            <Textarea
                                id={`input-${input.name}`}
                                value={typeof input.value === 'object' ? JSON.stringify(input.value, null, 2) : input.value || ''}
                                onChange={(e) => {
                                    try {
                                        const parsed = JSON.parse(e.target.value);
                                        handleInputChange(input.name, parsed);
                                    } catch {
                                        handleInputChange(input.name, e.target.value);
                                    }
                                }}
                                placeholder={input.description || 'JSON value'}
                                rows={4}
                                className="font-mono text-xs"
                            />
                        )}

                        {input.type === 'select' && (
                            <Select
                                value={input.value || ''}
                                onValueChange={(value) => handleInputChange(input.name, value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {/* Add options based on input.options if available */}
                                    <SelectItem value="option1">Option 1</SelectItem>
                                    <SelectItem value="option2">Option 2</SelectItem>
                                </SelectContent>
                            </Select>
                        )}

                        {input.description && (
                            <p className="text-xs text-muted-foreground">{input.description}</p>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t">
                <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={handleDelete}
                >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Node
                </Button>
            </div>
        </div>
    );
}
