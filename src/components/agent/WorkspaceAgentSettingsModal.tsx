/**
 * WorkspaceAgentSettingsModal — tenant/user-side agent overrides.
 *
 * Opened from the gear icon in the Workspace Agent widget header. MVP scope:
 *   • General tab  — temperature, max_tokens, top_p, timeout
 *   • Prompt tab   — optional custom system-prompt override
 *
 * Settings persist via /api/agent/settings and apply on the next agent turn
 * (the executor merges profile → tenant → user). Admins (can_modify_tenant)
 * additionally get a scope toggle to write tenant-wide defaults.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, RotateCcw, Info } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { agentSettingsApi } from '@/services/agentSettingsApi';
import type {
  AgentSettings,
  AgentSettingsGeneral,
  AgentSettingsSystem,
  SettingsSource,
} from '@/types/agentSettings';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful save/reset so the chat can react if needed. */
  onSettingsApplied?: () => void;
}

const INHERITED_LABEL: Record<SettingsSource, string> = {
  user: 'Your overrides',
  tenant: 'Inherited from tenant',
  profile: 'Inherited from admin profile',
  default: 'System defaults',
};

function equalSettings(a: AgentSettings, b: AgentSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const WorkspaceAgentSettingsModal: React.FC<Props> = ({ open, onClose, onSettingsApplied }) => {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [baseline, setBaseline] = useState<AgentSettings | null>(null);
  const [inheritedFrom, setInheritedFrom] = useState<SettingsSource>('default');
  const [canModifyTenant, setCanModifyTenant] = useState(false);
  const [scope, setScope] = useState<'user' | 'tenant'>('user');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Load effective settings whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    agentSettingsApi
      .get()
      .then((res) => {
        if (cancelled) return;
        setSettings(res.settings);
        setBaseline(res.settings);
        setInheritedFrom(res.inherited_from);
        setCanModifyTenant(res.can_modify_tenant);
        setScope('user');
      })
      .catch((err) => {
        console.error('Failed to load agent settings:', err);
        toast.error('Failed to load settings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasChanges = !!settings && !!baseline && !equalSettings(settings, baseline);

  const updateGeneral = <K extends keyof AgentSettingsGeneral>(key: K, value: AgentSettingsGeneral[K]) => {
    setSettings((prev) => (prev ? { ...prev, general: { ...prev.general, [key]: value } } : prev));
  };

  const updateSystem = <K extends keyof AgentSettingsSystem>(key: K, value: AgentSettingsSystem[K]) => {
    setSettings((prev) => (prev ? { ...prev, system: { ...prev.system, [key]: value } } : prev));
  };

  const handleSave = async () => {
    if (!settings) return;
    // Client-side guard mirrors the server rule: enabled ⇒ non-empty prompt.
    if (settings.system.enabled && !(settings.system.custom_prompt || '').trim()) {
      toast.error('A custom prompt is required when the system prompt is enabled.');
      setActiveTab('system');
      return;
    }
    setSaving(true);
    try {
      await agentSettingsApi.update({ ...settings, scope });
      toast.success(scope === 'tenant' ? 'Tenant defaults saved' : 'Settings saved');
      setBaseline(settings);
      onSettingsApplied?.();
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const message = typeof detail === 'string' ? detail : 'Failed to save settings';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const target = scope === 'tenant' ? 'tenant-wide defaults' : 'your overrides';
    if (!window.confirm(`Reset ${target} to the lower layer? This cannot be undone.`)) return;
    try {
      await agentSettingsApi.reset(scope);
      toast.success('Reset to defaults');
      const res = await agentSettingsApi.get();
      setSettings(res.settings);
      setBaseline(res.settings);
      setInheritedFrom(res.inherited_from);
      onSettingsApplied?.();
    } catch (err) {
      console.error('Failed to reset settings:', err);
      toast.error('Failed to reset settings');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Agent settings"
      onClick={onClose}
    >
      <div
        className="bg-background flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Settings className="text-primary h-5 w-5" />
            <div>
              <h2 className="text-base font-semibold leading-tight">Agent Settings</h2>
              <p className="text-muted-foreground text-xs">{INHERITED_LABEL[inheritedFrom]}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scope toggle (admins only) */}
        {canModifyTenant && (
          <div className="bg-muted/40 flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
            <Info className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-muted-foreground">Apply to:</span>
            <div className="bg-background flex items-center gap-0.5 rounded-md p-0.5">
              {(['user', 'tenant'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={cn(
                    'rounded px-2 py-0.5 transition-colors',
                    scope === s
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s === 'user' ? 'Just me' : 'Entire tenant'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        {loading || !settings ? (
          <div className="flex flex-1 items-center justify-center p-12">
            <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-4 grid w-auto grid-cols-2">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="system">System Prompt</TabsTrigger>
            </TabsList>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 pb-4">
                {/* General */}
                <TabsContent value="general" className="mt-0 space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="temperature">Temperature</Label>
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {settings.general.temperature.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      id="temperature"
                      value={[settings.general.temperature]}
                      onValueChange={([v]) => updateGeneral('temperature', v)}
                      min={0}
                      max={2}
                      step={0.05}
                    />
                    <p className="text-muted-foreground text-xs">
                      Lower is focused and deterministic; higher is more creative.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max_tokens">Max tokens</Label>
                    <Input
                      id="max_tokens"
                      type="number"
                      value={settings.general.max_tokens ?? ''}
                      onChange={(e) =>
                        updateGeneral('max_tokens', e.target.value ? parseInt(e.target.value, 10) : null)
                      }
                      min={1}
                      max={200000}
                      placeholder="Auto (model default)"
                    />
                    <p className="text-muted-foreground text-xs">
                      Maximum response length. Leave empty to use the model default.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="top_p">Top P</Label>
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {settings.general.top_p.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      id="top_p"
                      value={[settings.general.top_p]}
                      onValueChange={([v]) => updateGeneral('top_p', v)}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-muted-foreground text-xs">
                      Nucleus sampling — controls diversity via probability mass.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeout">Response timeout (seconds)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      value={settings.general.timeout_seconds}
                      onChange={(e) =>
                        updateGeneral('timeout_seconds', parseInt(e.target.value, 10) || 60)
                      }
                      min={10}
                      max={600}
                    />
                  </div>
                </TabsContent>

                {/* System Prompt */}
                <TabsContent value="system" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="sys-enabled">Custom system prompt</Label>
                      <p className="text-muted-foreground text-xs">
                        Override the default agent instructions for this scope.
                      </p>
                    </div>
                    <Switch
                      id="sys-enabled"
                      checked={settings.system.enabled}
                      onCheckedChange={(v) => updateSystem('enabled', v)}
                    />
                  </div>

                  {settings.system.enabled ? (
                    <div className="space-y-2">
                      <Textarea
                        value={settings.system.custom_prompt ?? ''}
                        onChange={(e) => updateSystem('custom_prompt', e.target.value)}
                        placeholder="You are a helpful assistant specializing in…"
                        rows={10}
                        maxLength={10000}
                        className="font-mono text-sm"
                      />
                      <div className="text-muted-foreground flex justify-between text-xs">
                        <span>{(settings.system.custom_prompt ?? '').length.toLocaleString()} / 10,000</span>
                        <span>Markdown supported</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted/50 text-muted-foreground rounded-lg p-4 text-sm">
                      Custom prompt disabled — the agent uses the profile’s default instructions.
                    </div>
                  )}
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}

        {/* Footer */}
        <div className="bg-muted/30 flex items-center justify-between gap-2 border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={loading || saving}
            className="text-muted-foreground"
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || saving || loading}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default WorkspaceAgentSettingsModal;
