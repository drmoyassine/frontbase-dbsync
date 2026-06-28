import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save, Bot, Wrench, Puzzle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    adminAgentsApi,
    AgentProfileConfig,
    AgentProfileConfigUpdate,
    WorkspaceProfileName,
} from '@/services/adminAgentsApi';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PERMISSION_CATALOG } from './permissionCatalog';
import { McpServersManager } from './McpServersManager';
import { SkillsManager } from './SkillsManager';

/** Default parameter values for the "Reset to defaults" action. */
const PARAM_DEFAULTS: Record<WorkspaceProfileName, { temperature: number; max_tokens: number; top_p: number }> = {
    workspace: { temperature: 0.7, max_tokens: 4096, top_p: 0.9 },
    support: { temperature: 0.5, max_tokens: 2048, top_p: 0.95 },
};

function ProfileForm({
    useType,
    config,
    onSave,
    saving,
}: {
    useType: WorkspaceProfileName;
    config: AgentProfileConfig;
    onSave: (payload: AgentProfileConfigUpdate) => void;
    saving: boolean;
}) {
    const [temperature, setTemperature] = useState<number>(config.temperature ?? PARAM_DEFAULTS[useType].temperature);
    const [maxTokens, setMaxTokens] = useState<number>(config.max_tokens ?? PARAM_DEFAULTS[useType].max_tokens);
    const [topP, setTopP] = useState<number>(config.top_p ?? PARAM_DEFAULTS[useType].top_p);
    const [systemPrompt, setSystemPrompt] = useState<string>(config.system_prompt ?? '');
    const [excludedTools, setExcludedTools] = useState<string[]>(config.excluded_tools ?? []);
    const [permissions, setPermissions] = useState<Record<string, string[]>>(config.permissions ?? {});

    // Re-sync local state when the loaded config changes (e.g. on profile switch / refetch).
    useEffect(() => {
        setTemperature(config.temperature ?? PARAM_DEFAULTS[useType].temperature);
        setMaxTokens(config.max_tokens ?? PARAM_DEFAULTS[useType].max_tokens);
        setTopP(config.top_p ?? PARAM_DEFAULTS[useType].top_p);
        setSystemPrompt(config.system_prompt ?? '');
        setExcludedTools(config.excluded_tools ?? []);
        setPermissions(config.permissions ?? {});
    }, [useType, config]);

    const reset = () => {
        setTemperature(PARAM_DEFAULTS[useType].temperature);
        setMaxTokens(PARAM_DEFAULTS[useType].max_tokens);
        setTopP(PARAM_DEFAULTS[useType].top_p);
    };

    const togglePermission = (resource: string, action: string) => {
        const current = permissions[resource] || [];
        const next = current.includes(action)
            ? current.filter((a) => a !== action)
            : [...current, action];
        setPermissions({ ...permissions, [resource]: next });
    };

    return (
        <div className="space-y-6">
            {/* Generation parameters */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Bot className="w-4 h-4 text-purple-500" /> Generation Parameters
                    </h4>
                    <Button variant="ghost" size="sm" onClick={reset} className="text-xs text-slate-500">
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset to defaults
                    </Button>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">Temperature</span>
                        <span className="font-mono text-slate-900 dark:text-white">{temperature.toFixed(2)}</span>
                    </div>
                    <Slider value={[temperature]} min={0} max={2} step={0.05}
                        onValueChange={(v) => setTemperature(v[0])} />
                    <p className="text-[11px] text-slate-400">Lower = focused/deterministic · Higher = creative</p>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">Top P (nucleus sampling)</span>
                        <span className="font-mono text-slate-900 dark:text-white">{topP.toFixed(2)}</span>
                    </div>
                    <Slider value={[topP]} min={0} max={1} step={0.05}
                        onValueChange={(v) => setTopP(v[0])} />
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-slate-600 dark:text-slate-400">Max Tokens</label>
                    <Input type="number" min={1} max={128000} value={maxTokens}
                        onChange={(e) => setMaxTokens(Math.max(1, Math.min(128000, Number(e.target.value) || 1)))} />
                </div>
            </div>

            {/* System prompt */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 bg-white dark:bg-slate-900">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">System Prompt</h4>
                <Textarea
                    rows={6}
                    placeholder="Leave blank to use the built-in default prompt."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="text-sm"
                />
                <p className="text-[11px] text-slate-400">
                    Overrides the agent's built-in system prompt for the <b>{useType}</b> profile.
                </p>
            </div>

            {/* Tool permissions */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 bg-white dark:bg-slate-900">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-purple-500" /> Tool Permissions
                </h4>
                <p className="text-[11px] text-slate-400">
                    Deny-by-default. The agent can only use tools whose permission is granted.{' '}
                    {useType === 'support' && 'Support is read-only by default.'}
                </p>
                <div className="space-y-3">
                    {PERMISSION_CATALOG.map((group) => (
                        <div key={group.label}>
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                {group.label}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {group.resources.map((res) => (
                                    <div key={res.resource} className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1">
                                        <span className="text-[11px] font-mono px-1.5 text-slate-500">{res.resource}</span>
                                        {res.actions.map((act) => {
                                            const on = (permissions[res.resource] || []).includes(act);
                                            return (
                                                <button
                                                    key={act}
                                                    onClick={() => togglePermission(res.resource, act)}
                                                    className={`text-[11px] px-2 py-0.5 rounded capitalize transition-colors ${
                                                        on
                                                            ? 'bg-purple-600 text-white'
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                    }`}
                                                >
                                                    {act}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end">
                <Button
                    onClick={() =>
                        onSave({
                            temperature,
                            max_tokens: maxTokens,
                            top_p: topP,
                            system_prompt: systemPrompt || null,
                            permissions,
                            excluded_tools: excludedTools,
                        })
                    }
                    disabled={saving}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save {useType} profile
                </Button>
            </div>
        </div>
    );
}

export function WorkspaceProfileEditor() {
    const queryClient = useQueryClient();
    const [active, setActive] = useState<WorkspaceProfileName | 'global-tools'>('workspace');

    const { data, isLoading } = useQuery({
        queryKey: ['admin-agent-profiles'],
        queryFn: () => adminAgentsApi.getProfileConfigs(),
    });

    const saveMutation = useMutation({
        mutationFn: ({ useType, payload }: { useType: WorkspaceProfileName; payload: AgentProfileConfigUpdate }) =>
            adminAgentsApi.updateProfileConfig(useType, payload),
        onSuccess: () => {
            toast.success('Workspace Agent profile updated');
            queryClient.invalidateQueries({ queryKey: ['admin-agent-profiles'] });
        },
        onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to save profile'),
    });

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-md font-bold text-slate-900 dark:text-white">Workspace Agent Profiles</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                    Configure generation parameters, system prompt, and tool permissions per profile.
                    Workspace turns consume credits; Support turns are free.
                </p>
            </div>
            <Tabs value={active} onValueChange={(v) => setActive(v as WorkspaceProfileName | 'global-tools')}>
                <TabsList>
                    <TabsTrigger value="workspace">Workspace (credit)</TabsTrigger>
                    <TabsTrigger value="support">Support (free)</TabsTrigger>
                    <TabsTrigger value="global-tools">Global Tools & Skills</TabsTrigger>
                </TabsList>
                <TabsContent value="workspace" className="mt-4">
                    <ProfileForm
                        useType="workspace"
                        config={data.profiles.workspace}
                        saving={saveMutation.isPending && saveMutation.variables?.useType === 'workspace'}
                        onSave={(payload) => saveMutation.mutate({ useType: 'workspace', payload })}
                    />
                </TabsContent>
                <TabsContent value="support" className="mt-4">
                    <ProfileForm
                        useType="support"
                        config={data.profiles.support}
                        saving={saveMutation.isPending && saveMutation.variables?.useType === 'support'}
                        onSave={(payload) => saveMutation.mutate({ useType: 'support', payload })}
                    />
                </TabsContent>
                <TabsContent value="global-tools" className="mt-4 space-y-6">
                    <div className="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Puzzle className="h-4 w-4" /> Global MCP Servers
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Connect external tool servers using the Model Context Protocol (MCP). The Workspace Agent will be able to discover and invoke tools provided by these servers.
                        </p>
                        <div className="mt-4">
                            <McpServersManager profileId={undefined} />
                        </div>
                    </div>

                    <div className="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-xl p-5 bg-white dark:bg-slate-900">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Zap className="h-4 w-4" /> Global Agent Skills
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Install pre-built skill packages that give your agent specialized abilities.
                        </p>
                        <div className="mt-4">
                            <SkillsManager profileId={undefined} />
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
