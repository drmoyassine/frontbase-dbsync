/**
 * ActionNode - Generic action node (HTTP, Transform, etc.)
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Send, Code, MessageSquare, Database, Bell, ExternalLink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ElementType> = {
    // Actions
    action: Send,
    http_request: Send,
    transform: Code,
    log: MessageSquare,
    // Integrations
    database: Database,
    // Interface
    toast: Bell,
    redirect: ExternalLink,
    refresh: RefreshCw,
};

export const ActionNode = memo(({ data, selected }: NodeProps) => {
    const Icon = iconMap[data.type] || Send;

    // Determine color scheme based on node type category
    const getColorScheme = (type: string) => {
        const interfaceNodes = ['toast', 'redirect', 'refresh'];
        const integrationNodes = ['database'];

        if (interfaceNodes.includes(type)) {
            return {
                border: 'border-pink-500/50 bg-pink-500/5',
                ring: 'ring-pink-500',
                handle: '!bg-pink-500',
                iconBg: 'bg-pink-500/20',
                iconText: 'text-pink-500',
            };
        }
        if (integrationNodes.includes(type)) {
            return {
                border: 'border-orange-500/50 bg-orange-500/5',
                ring: 'ring-orange-500',
                handle: '!bg-orange-500',
                iconBg: 'bg-orange-500/20',
                iconText: 'text-orange-500',
            };
        }
        // Default: blue for actions
        return {
            border: 'border-blue-500/50 bg-blue-500/5',
            ring: 'ring-blue-500',
            handle: '!bg-blue-500',
            iconBg: 'bg-blue-500/20',
            iconText: 'text-blue-500',
        };
    };

    const colors = getColorScheme(data.type);

    return (
        <div
            className={cn(
                'px-4 py-3 rounded-lg border-2 bg-card shadow-sm min-w-[150px]',
                colors.border,
                selected && `ring-2 ${colors.ring} ring-offset-2 ring-offset-background`
            )}
        >
            <Handle
                type="target"
                position={Position.Left}
                className={cn('w-3 h-3 !border-2 !border-background', colors.handle)}
            />

            <div className="flex items-center gap-2">
                <div className={cn('p-1.5 rounded', colors.iconBg)}>
                    <Icon className={cn('w-4 h-4', colors.iconText)} />
                </div>
                <div className="text-sm font-medium">{data.label}</div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className={cn('w-3 h-3 !border-2 !border-background', colors.handle)}
            />
        </div>
    );
});

ActionNode.displayName = 'ActionNode';
