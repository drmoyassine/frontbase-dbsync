/**
 * ConditionNode - If/else branching node
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
    return (
        <div
            className={cn(
                'px-4 py-3 rounded-lg border-2 bg-card shadow-sm min-w-[150px]',
                'border-purple-500/50 bg-purple-500/5',
                selected && 'ring-2 ring-purple-500 ring-offset-2 ring-offset-background'
            )}
        >
            <Handle
                type="target"
                position={Position.Left}
                className="w-3 h-3 !bg-purple-500 !border-2 !border-background"
            />

            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-purple-500/20">
                    <GitBranch className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-sm font-medium">{data.label}</div>
            </div>

            {/* True output */}
            <Handle
                type="source"
                position={Position.Right}
                id="true"
                style={{ top: '30%' }}
                className="w-3 h-3 !bg-green-500 !border-2 !border-background"
            />

            {/* False output */}
            <Handle
                type="source"
                position={Position.Right}
                id="false"
                style={{ top: '70%' }}
                className="w-3 h-3 !bg-red-500 !border-2 !border-background"
            />

            {/* Labels for outputs */}
            <div className="absolute right-[-30px] top-[20%] text-xs text-green-500">✓</div>
            <div className="absolute right-[-30px] top-[60%] text-xs text-red-500">✗</div>
        </div>
    );
});

ConditionNode.displayName = 'ConditionNode';
