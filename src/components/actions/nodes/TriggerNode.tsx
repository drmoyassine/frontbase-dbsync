/**
 * TriggerNode - Entry point node for workflows
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
    return (
        <div
            className={cn(
                'px-4 py-3 rounded-lg border-2 bg-card shadow-sm min-w-[150px]',
                'border-green-500/50 bg-green-500/5',
                selected && 'ring-2 ring-green-500 ring-offset-2 ring-offset-background'
            )}
        >
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-green-500/20">
                    <Zap className="w-4 h-4 text-green-500" />
                </div>
                <div className="text-sm font-medium">{data.label}</div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="w-3 h-3 !bg-green-500 !border-2 !border-background"
            />
        </div>
    );
});

TriggerNode.displayName = 'TriggerNode';
