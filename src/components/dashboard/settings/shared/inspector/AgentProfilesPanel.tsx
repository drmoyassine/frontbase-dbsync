import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Trash2, Save, Loader2, Database, Zap, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { API_BASE } from './types';

interface AgentProfile {
    id?: string;
    engine_id?: string;
    name: string;
    slug: string;
    system_prompt: string;
    permissions: Record<string, string[]>;
    created_at?: string;
}

export const AgentProfilesPanel: React.FC<{ engineId: string, engineName: string }> = ({ engineId, engineName }) => {
    const queryClient = useQueryClient();
    const [selectedProfileId, setSelectedProfileId] = useState<string | 'new' | null>(null);

    const [editForm, setEditForm] = useState<Partial<AgentProfile>>({});

    const { data: profiles = [], isLoading } = useQuery<AgentProfile[]>({
        queryKey: ['edge-agent-profiles', engineId],
        queryFn: async () => {
            const url = `${API_BASE}/api/edge-engines/${engineId}/agent-profiles`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch agent profiles');
            const data = await res.json();
            return data.profiles || [];
        },
        enabled: !!engineId
    });

    const saveMutation = useMutation({
        mutationFn: async (profile: Partial<AgentProfile>) => {
            const isNew = selectedProfileId === 'new';
            const url = isNew 
                ? `${API_BASE}/api/edge-engines/${engineId}/agent-profiles`
                : `${API_BASE}/api/edge-engines/${engineId}/agent-profiles/${profile.id}`;
            
            const res = await fetch(url, {
                method: isNew ? 'POST' : 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profile)
            });
            if (!res.ok) throw new Error('Failed to save profile');
            return res.json();
        },
        onSuccess: (saved) => {
            queryClient.invalidateQueries({ queryKey: ['edge-agent-profiles', engineId] });
            setSelectedProfileId(saved.id);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const url = `${API_BASE}/api/edge-engines/${engineId}/agent-profiles/${id}`;
            const res = await fetch(url, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete profile');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['edge-agent-profiles', engineId] });
            setSelectedProfileId(null);
        }
    });

    const handleSelect = (profile: AgentProfile) => {
        setSelectedProfileId(profile.id!);
        setEditForm({ ...profile });
    };

    const handleNew = () => {
        setSelectedProfileId('new');
        setEditForm({ name: '', slug: '', system_prompt: '', permissions: {} });
    };

    const togglePermission = (resource: string, perm: string) => {
        const currentPerms = editForm.permissions || {};
        const resourcePerms = currentPerms[resource] || [];
        
        let newPerms;
        if (resourcePerms.includes(perm)) {
            newPerms = resourcePerms.filter(p => p !== perm);
        } else {
            newPerms = [...resourcePerms, perm];
        }

        setEditForm({ ...editForm, permissions: { ...currentPerms, [resource]: newPerms } });
    };

    const activeProfile = selectedProfileId === 'new' ? editForm : profiles.find(p => p.id === selectedProfileId);

    // Some mock/common resources for the permissions matrix.
    // In a full implementation, you'd fetch live datasources and workflows.
    const resourceTypes = [
        { id: 'datasources.all', label: 'All Datasources', icon: Database, available: ['read'] },
        { id: 'stateDb', label: 'State Database (Platform)', icon: LayoutDashboard, available: ['read'] },
        { id: 'workflows.all', label: 'All Action Workflows', icon: Zap, available: ['trigger'] }
    ];

    return (
        <div className="flex-1 flex min-h-0 bg-background">
            {/* Left Sidebar (Profile List) */}
            <div className="w-[240px] border-r border-border bg-muted/20 flex flex-col min-h-0">
                <div className="p-3 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2">
                        <Bot className="h-4 w-4" /> Agent Profiles
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNew}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {isLoading ? (
                            <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
                        ) : profiles.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleSelect(p)}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between group ${
                                    selectedProfileId === p.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent text-foreground'
                                }`}
                            >
                                <span className="truncate">{p.name}</span>
                                <Badge variant="outline" className="text-[9px] h-4 px-1">{p.slug}</Badge>
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Main Content (Profile Editor) */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                {selectedProfileId ? (
                    <div className="p-6 max-w-3xl space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">{selectedProfileId === 'new' ? 'Create Agent Profile' : 'Edit Profile'}</h2>
                            <div className="flex items-center gap-2">
                                {selectedProfileId !== 'new' && (
                                    <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(selectedProfileId)}>
                                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                                    </Button>
                                )}
                                <Button size="sm" onClick={() => saveMutation.mutate(editForm)} disabled={saveMutation.isPending}>
                                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                    Save Profile
                                </Button>
                            </div>
                        </div>

                        <Tabs defaultValue="identity" className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="identity">Identity & Rules</TabsTrigger>
                                <TabsTrigger value="channels">Channels & APIs</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="identity" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">Profile Name</label>
                                    <Input 
                                        value={editForm.name || ''} 
                                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g. Sales Assistant" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-muted-foreground">URL Slug</label>
                                    <Input 
                                        value={editForm.slug || ''} 
                                        onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))}
                                        placeholder="e.g. sales-bot" 
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground">System Prompt (The Agent's Persona & Rules)</label>
                                <Textarea 
                                    value={editForm.system_prompt || ''}
                                    onChange={e => setEditForm(f => ({ ...f, system_prompt: e.target.value }))}
                                    placeholder="You are a helpful assistant..."
                                    className="min-h-[150px] font-mono text-[13px]"
                                />
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border">
                                <h3 className="text-sm font-semibold">Capabilities & Permissions Matrix</h3>
                                <p className="text-xs text-muted-foreground">Grants the agent tool access to the Engine's connected infrastructure.</p>
                                
                                <div className="border border-border rounded-md overflow-hidden bg-muted/10 divide-y divide-border">
                                    {resourceTypes.map(rt => {
                                        const currentPerms = editForm.permissions?.[rt.id] || [];
                                        const Icon = rt.icon;
                                        return (
                                            <div key={rt.id} className="flex justify-between items-center p-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-background border border-border p-1.5 rounded-md">
                                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium">{rt.label}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono">{rt.id}</div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    {rt.available.map(perm => {
                                                        const isEnabled = currentPerms.includes(perm) || currentPerms.includes('all');
                                                        return (
                                                            <Button
                                                                key={perm}
                                                                size="sm"
                                                                variant={isEnabled ? "default" : "outline"}
                                                                onClick={() => togglePermission(rt.id, perm)}
                                                                className={`h-7 px-3 text-xs capitalize ${isEnabled ? 'bg-primary text-white' : ''}`}
                                                            >
                                                                {perm}
                                                            </Button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            </TabsContent>
                            
                            <TabsContent value="channels" className="space-y-6">
                                <div className="space-y-1.5">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Database className="h-4 w-4" /> API Endpoint (n8n, Make, Flowise)
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Use your Frontbase Edge Engine as a drop-in replacement for any OpenAI node to directly talk to this specifically configured agent.
                                    </p>
                                    
                                    <div className="mt-4 p-3 bg-muted/30 border border-border rounded-md space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">OpenAI-Compatible Base URL</label>
                                            <code className="block p-2 bg-background border border-border rounded text-xs select-all">
                                                https://{engineName}.frontbase.dev/api/agents/{editForm.slug || 'agent-slug'}/v1
                                            </code>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Authentication Header</label>
                                            <code className="block p-2 bg-background border border-border rounded text-xs">
                                                Bearer [YOUR_EDGE_API_KEY]
                                            </code>
                                        </div>
                                        <p className="text-xs text-muted-foreground bg-primary/10 text-primary p-2 rounded border border-primary/20">
                                            <Zap className="inline-block w-3.5 h-3.5 mr-1" />
                                            <strong>Streaming Native:</strong> This endpoint fully supports Server-Sent Events (SSE). 
                                            You can directly enable "Stream Response" on your connection!
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2 border-t border-border">
                                    <h3 className="text-sm font-semibold">Consumer Messengers</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Bind this agent profile directly to external messaging platforms using webhooks.
                                    </p>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="border border-border rounded-md p-3 flex items-center justify-between bg-muted/10 opacity-60 cursor-not-allowed">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded bg-[#2AABEE]/10 flex items-center justify-center">
                                                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#2AABEE]" fill="currentColor">
                                                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c..."/>
                                                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.686c.223-.195-.054-.304-.346-.108l-6.4 4.024-2.76-.86c-.6-.188-.61-.6.125-.892l10.774-4.15c.5-.188.94.116.787.827z" />
                                                    </svg>
                                                </div>
                                                <div className="font-medium text-sm">Telegram Bot</div>
                                            </div>
                                            <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                                        </div>

                                        <div className="border border-border rounded-md p-3 flex items-center justify-between bg-muted/10 opacity-60 cursor-not-allowed">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded bg-[#4A154B]/10 flex items-center justify-center">
                                                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#4A154B]" fill="currentColor">
                                                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.523-2.522v-2.522h2.523zM15.165 17.688a2.527 2.527 0 0 1-2.523-2.523 2.526 2.526 0 0 1 2.523-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                                                    </svg>
                                                </div>
                                                <div className="font-medium text-sm">Slack App</div>
                                            </div>
                                            <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                        <Bot className="h-8 w-8 mb-2 opacity-30" />
                        <p className="text-sm">Select an agent profile or create a new one.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
