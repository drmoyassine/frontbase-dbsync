/**
 * WorkflowSettingsPanel — Popover panel for per-workflow settings
 * 
 * Configures runtime behavior: rate limiting, debouncing, timeouts,
 * retry count, and queue routing.
 */

import React, { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';

/** Default workflow settings (matches edge runtime defaults) */
const DEFAULTS = {
    rate_limit_enabled: true,
    rate_limit_max: 60,
    debounce_ms: 0,
    retry_count: 3,
    execution_timeout_ms: 30000,
    queue_enabled: false,
};

export type WorkflowSettings = typeof DEFAULTS;

interface WorkflowSettingsPanelProps {
    /** Current settings from the draft (may be null/undefined for new drafts) */
    settings?: Record<string, any> | null;
    /** Called when settings change — parent should include these in the next save */
    onSettingsChange: (settings: WorkflowSettings) => void;
    /** Whether the draft has been saved at least once */
    hasDraft: boolean;
}

export function WorkflowSettingsPanel({
    settings,
    onSettingsChange,
    hasDraft,
}: WorkflowSettingsPanelProps) {
    const { toast } = useToast();

    // Merge saved settings with defaults
    const [local, setLocal] = useState<WorkflowSettings>({
        ...DEFAULTS,
        ...(settings || {}),
    });

    // Sync when draft loads / reloads
    useEffect(() => {
        setLocal({ ...DEFAULTS, ...(settings || {}) });
    }, [settings]);

    const update = (key: keyof WorkflowSettings, value: any) => {
        const next = { ...local, [key]: value };
        setLocal(next);
        onSettingsChange(next);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    title="Workflow Settings"
                >
                    <Settings2 className="w-4 h-4" />
                    Settings
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4 space-y-4" side="bottom">
                <div className="space-y-1">
                    <h4 className="font-medium text-sm">Workflow Settings</h4>
                    <p className="text-xs text-muted-foreground">
                        Configure runtime behavior for this workflow.
                    </p>
                </div>

                {/* Rate Limiting */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="rate-limit" className="text-xs font-medium">
                            Rate Limiting
                        </Label>
                        <Switch
                            id="rate-limit"
                            checked={local.rate_limit_enabled}
                            onCheckedChange={(v) => update('rate_limit_enabled', v)}
                            className="scale-75"
                        />
                    </div>
                    {local.rate_limit_enabled && (
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min={1}
                                max={10000}
                                value={local.rate_limit_max}
                                onChange={(e) => update('rate_limit_max', parseInt(e.target.value) || 60)}
                                className="h-7 w-20 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">executions / minute</span>
                        </div>
                    )}
                </div>

                {/* Debounce */}
                <div className="space-y-2">
                    <Label htmlFor="debounce" className="text-xs font-medium">
                        Debounce Window
                    </Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="debounce"
                            type="number"
                            min={0}
                            max={600000}
                            step={1000}
                            value={local.debounce_ms}
                            onChange={(e) => update('debounce_ms', parseInt(e.target.value) || 0)}
                            className="h-7 w-24 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">ms (0 = disabled)</span>
                    </div>
                </div>

                {/* Execution Timeout */}
                <div className="space-y-2">
                    <Label htmlFor="timeout" className="text-xs font-medium">
                        Execution Timeout
                    </Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="timeout"
                            type="number"
                            min={1000}
                            max={300000}
                            step={1000}
                            value={local.execution_timeout_ms}
                            onChange={(e) => update('execution_timeout_ms', parseInt(e.target.value) || 30000)}
                            className="h-7 w-24 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">ms</span>
                    </div>
                </div>

                {/* Queue / Durable Execution */}
                <div className="flex items-center justify-between pt-1 border-t">
                    <div>
                        <Label htmlFor="queue" className="text-xs font-medium">
                            Durable Execution (Queue)
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                            Route through message queue for auto-retry
                        </p>
                    </div>
                    <Switch
                        id="queue"
                        checked={local.queue_enabled}
                        onCheckedChange={(v) => update('queue_enabled', v)}
                        className="scale-75"
                    />
                </div>

                {local.queue_enabled && (
                    <div className="space-y-2">
                        <Label htmlFor="retries" className="text-xs font-medium">
                            Retry Count
                        </Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="retries"
                                type="number"
                                min={0}
                                max={10}
                                value={local.retry_count}
                                onChange={(e) => update('retry_count', parseInt(e.target.value) || 3)}
                                className="h-7 w-16 text-xs"
                            />
                            <span className="text-xs text-muted-foreground">retries on failure</span>
                        </div>
                    </div>
                )}

                <p className="text-[10px] text-muted-foreground pt-2 border-t">
                    Settings are saved with the workflow and applied on publish.
                </p>
            </PopoverContent>
        </Popover>
    );
}
