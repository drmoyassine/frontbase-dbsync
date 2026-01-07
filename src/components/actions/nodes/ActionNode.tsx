/**
 * ActionNode - Generic action node (HTTP, Transform, etc.)
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Send, Code, MessageSquare, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ElementType> = {
    action: Send,
    http_request: Send,
    transform: Code,
    log: MessageSquare,
    database: Database,
};

export const ActionNode = memo(({ data, selected }: NodeProps) => {
    const Icon = iconMap[data.type] || Send;

    return (
        <div
            className={cn(
                'px-4 py-3 rounded-lg border-2 bg-card shadow-sm min-w-[150px]',
                'border-blue-500/50 bg-blue-500/5',
                selected && 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background'
            )}
        >
            <Handle
                type="target"
                position={Position.Left}
                className="w-3 h-3 !bg-blue-500 !border-2 !border-background"
            />

            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-blue-500/20">
                    <Icon className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-sm font-medium">{data.label}</div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="w-3 h-3 !bg-blue-500 !border-2 !border-background"
            />
        </div>
    );
});

ActionNode.displayName = 'ActionNode';
