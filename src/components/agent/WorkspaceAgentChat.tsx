import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Bot, X, Maximize2, Minimize2, Send, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

// =============================================================================
// SSE Chat Hook — parses plain SSE events from the PydanticAI backend
// =============================================================================

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface SSEEvent {
    type: 'text' | 'tool_call' | 'tool_result' | 'done';
    content?: string;
    name?: string;
    args?: Record<string, unknown>;
    result?: string;
}

function useSSEChat(apiUrl: string, bodyPayload: Record<string, unknown>) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const append = useCallback(async (message: { role: string; content: string }) => {
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: message.content,
        };

        const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setIsLoading(true);

        // Abort any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const allMessages = [...messages, userMsg].map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...bodyPayload, messages: allMessages }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => `Status ${response.status}`);
                throw new Error(errorText || `API responded with status: ${response.status}`);
            }

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let accumulatedContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE lines: "data: {...}\n\n"
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const jsonStr = trimmed.slice(6); // Remove "data: " prefix
                    if (jsonStr === '[DONE]') continue;

                    try {
                        const event: SSEEvent = JSON.parse(jsonStr);

                        if (event.type === 'text' && event.content) {
                            accumulatedContent += event.content;
                            setMessages(prev => {
                                const next = [...prev];
                                const lastIdx = next.length - 1;
                                next[lastIdx] = { ...next[lastIdx], content: accumulatedContent };
                                return next;
                            });
                        } else if (event.type === 'tool_call') {
                            // Show tool usage inline
                            accumulatedContent += `\n🔧 Using tool: ${event.name}...\n`;
                            setMessages(prev => {
                                const next = [...prev];
                                const lastIdx = next.length - 1;
                                next[lastIdx] = { ...next[lastIdx], content: accumulatedContent };
                                return next;
                            });
                        } else if (event.type === 'done') {
                            break;
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') return;

            console.error('[SSEChat Error]', error);

            // Show error in the assistant message
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            setMessages(prev => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                if (next[lastIdx]?.role === 'assistant' && !next[lastIdx].content) {
                    next[lastIdx] = { ...next[lastIdx], content: `⚠️ Error: ${errMsg}` };
                }
                return next;
            });
        } finally {
            setIsLoading(false);
        }
    }, [apiUrl, bodyPayload, messages]);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        setMessages([]);
        setIsLoading(false);
    }, []);

    return { messages, append, isLoading, reset };
}

// =============================================================================
// Available Models (static list for UI selectors)
// =============================================================================

const AVAILABLE_MODELS: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3-mini', 'gpt-3.5-turbo'],
    anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
    ollama: ['llama3', 'mistral', 'qwen2.5-coder'],
    workers_ai: ['@cf/meta/llama-3.1-8b-instruct']
};

// =============================================================================
// WorkspaceAgentChat Component
// =============================================================================

export const WorkspaceAgentChat: React.FC<{ 
    isOpen: boolean, 
    onClose: () => void, 
    profileSlug?: string,
}> = ({ isOpen, onClose, profileSlug = 'workspace-agent' }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [localInput, setLocalInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const [providerStatus, setProviderStatus] = useState<'checking' | 'ok' | 'missing'>('checking');
    
    // Custom selection state
    const [providers, setProviders] = useState<Array<{ id: string; name: string; provider: string }>>([]);
    const [selectedProviderId, setSelectedProviderId] = useState<string>('');
    const [selectedModelId, setSelectedModelId] = useState<string>('');

    // Update available models when provider changes
    const activeProvider = providers.find(p => p.id === selectedProviderId);
    const providerType = activeProvider?.provider || 'openai';
    const availableModels = AVAILABLE_MODELS[providerType] || ['default'];

    useEffect(() => {
        if (!isOpen) return;

        setProviderStatus('checking');

        fetch('/api/edge-providers/')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const llmProviders = data.filter(
                        (p: { provider: string; is_active: boolean }) => 
                            ['openai', 'anthropic', 'workers_ai', 'ollama', 'google'].includes(p.provider) && p.is_active
                    );
                    
                    if (llmProviders.length > 0) {
                        setProviders(llmProviders);
                        setProviderStatus('ok');
                        
                        // Select first by default
                        const first = llmProviders[0];
                        setSelectedProviderId(first.id);
                        
                        // Pick default model for this provider type
                        const pt = first.provider;
                        const models = AVAILABLE_MODELS[pt] || ['default'];
                        setSelectedModelId(models[0]);
                    } else {
                        setProviderStatus('missing');
                    }
                } else {
                    setProviderStatus('missing');
                }
            })
            .catch(() => setProviderStatus('ok')); 
    }, [isOpen]);

    // Handle provider selection change
    const onProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = e.target.value;
        setSelectedProviderId(newId);
        
        const newProv = providers.find(p => p.id === newId);
        if (newProv) {
            const models = AVAILABLE_MODELS[newProv.provider] || ['default'];
            setSelectedModelId(models[0]);
        }
    };
    
    const agentUrl = '/api/agent/chat';
    const chatBody = useMemo(() => ({
        provider_id: selectedProviderId,
        model_id: selectedModelId
    }), [selectedProviderId, selectedModelId]);

    const { messages, append, isLoading } = useSSEChat(agentUrl, chatBody);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = localInput.trim();
        if (isLoading || providerStatus === 'missing' || !trimmed) {
            return;
        }
        
        append({ role: 'user', content: trimmed });
        setLocalInput('');
    };

    if (!isOpen) return null;

    return (
        <div className={`fixed bottom-4 right-4 z-50 flex flex-col bg-background shadow-2xl border border-border rounded-lg transition-all overflow-hidden ${isExpanded ? 'w-[600px] h-[800px]' : 'w-[400px] h-[600px]'}`}>
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    <div className="bg-primary/20 text-primary p-1.5 rounded-md">
                        <Bot className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-sm">Workspace Agent</span>
                </div>
                
                {/* Provider & Model Selection */}
                {providerStatus === 'ok' && (
                    <div className="flex items-center gap-2 text-xs">
                        <select 
                            value={selectedProviderId} 
                            onChange={onProviderChange}
                            className="bg-background border border-border rounded px-1.5 py-1 outline-none text-muted-foreground w-24 overflow-hidden text-ellipsis whitespace-nowrap"
                            disabled={isLoading}
                        >
                            {providers.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <select 
                            value={selectedModelId} 
                            onChange={(e) => setSelectedModelId(e.target.value)}
                            className="bg-background border border-border rounded px-1.5 py-1 outline-none text-muted-foreground w-28 overflow-hidden text-ellipsis whitespace-nowrap"
                            disabled={isLoading}
                        >
                            {availableModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                )}
                
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4" ref={scrollRef}>
                    {providerStatus === 'checking' && (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {providerStatus === 'missing' && (
                        <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-lg p-3 text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-medium text-amber-700 dark:text-amber-300">No LLM Provider Connected</p>
                                        <p className="text-amber-600 dark:text-amber-400 mt-1">
                                            Add an OpenAI, Anthropic, or Ollama provider in <strong>Edge Providers</strong> to use the workspace agent.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {providerStatus === 'ok' && messages.length === 0 && (
                        <div className="text-center text-muted-foreground py-10">
                            <Bot className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">How can I help you build today?</p>
                        </div>
                    )}
                    
                    {messages.map((m) => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                                m.role === 'user' 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted/50 border border-border'
                            }`}>
                                <div className="whitespace-pre-wrap">{m.content}</div>
                            </div>
                        </div>
                    ))}
                    {isLoading && messages.length > 0 && !messages[messages.length - 1]?.content && (
                        <div className="flex justify-start">
                            <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                <span>Thinking...</span>
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="p-3 border-t border-border bg-muted/10">
                <form onSubmit={onSubmit} className="flex items-center gap-2">
                    <Input
                        value={localInput}
                        onChange={(e) => setLocalInput(e.target.value)}
                        placeholder={providerStatus === 'missing' ? 'Connect a provider first...' : `Ask ${selectedModelId || 'the agent'}...`}
                        className="flex-1 bg-background"
                        disabled={isLoading || providerStatus === 'missing'}
                    />
                    <Button type="submit" disabled={isLoading || !localInput.trim() || providerStatus === 'missing'} size="sm">
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </div>
    );
};
