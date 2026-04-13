import React, { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { AppRenderer } from '@mcp-ui/client';
import { Bot, X, Maximize2, Minimize2 } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

// Helper to determine the Edge Engine URL
const getEdgeChatUrl = (profileSlug: string) => {
    // In production, this would resolve to the deployed engine's URL
    // For local dev, assuming edge is running on 8787
    return `http://localhost:8787/api/agent/chat/${profileSlug}`; 
};

export const WorkspaceAgentChat: React.FC<{ isOpen: boolean, onClose: () => void, profileSlug?: string }> = ({ isOpen, onClose, profileSlug = 'builder-agent' }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Connect to the Edge Engine chat directly (Zero Control Plane liability)
    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: getEdgeChatUrl(profileSlug),
    });

    if (!isOpen) return null;

    return (
        <div className={`fixed bottom-4 right-4 z-50 flex flex-col bg-background shadow-2xl border border-border rounded-lg transition-all overflow-hidden ${isExpanded ? 'w-[600px] h-[800px]' : 'w-[400px] h-[600px]'}`}>
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                    <div className="bg-primary/20 text-primary p-1.5 rounded-md">
                        <Bot className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-sm">Frontbase Edge Agent</span>
                </div>
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
                <div className="space-y-4">
                    {messages.length === 0 && (
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
                                
                                {m.toolInvocations?.map((toolInvocation) => {
                                    if (toolInvocation.state !== 'result') return null;

                                    let resourceUri = null;
                                    
                                    // Our custom Edge engine returns MCP tool results containing resourceUri
                                    try {
                                        if (toolInvocation.result && toolInvocation.result._meta?.ui?.resourceUri) {
                                            resourceUri = toolInvocation.result._meta.ui.resourceUri;
                                        } else if (typeof toolInvocation.result === 'string') {
                                           const parsed = JSON.parse(toolInvocation.result);
                                           if (parsed._meta?.ui?.resourceUri) {
                                               resourceUri = parsed._meta.ui.resourceUri;
                                           }
                                        }
                                    } catch(e) {}

                                    // Render MCP-UI Component if resourceUri exists
                                    if (resourceUri) {
                                        return (
                                            <div key={toolInvocation.toolCallId} className="mt-2 min-h-[200px] border border-border rounded-md bg-background overflow-hidden relative">
                                                <AppRenderer
                                                    client={undefined as any} // Will require MCP client initialization
                                                    toolName={toolInvocation.toolName}
                                                    sandbox={{ url: '/sandbox.html' }} // Base local sandbox path
                                                    toolInput={toolInvocation.args}
                                                    toolResult={toolInvocation.result}
                                                    onMessage={async (params) => console.log('MCP APP Message:', params)}
                                                    onOpenLink={async ({ url }) => {
                                                        if (url.startsWith('http')) window.open(url);
                                                    }}
                                                />
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={toolInvocation.toolCallId} className="mt-2 p-2 bg-background/50 border border-border rounded text-xs font-mono opacity-60">
                                            [Tool Executed: {toolInvocation.toolName}]
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm text-muted-foreground">
                                <span className="animate-pulse">Thinking...</span>
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="p-3 border-t border-border bg-muted/10">
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <Input
                        value={input}
                        onChange={handleInputChange}
                        placeholder="Ask the agent..."
                        className="flex-1 bg-background"
                        disabled={isLoading}
                    />
                    <Button type="submit" disabled={isLoading || !input.trim()} size="sm">
                        Send
                    </Button>
                </form>
            </div>
        </div>
    );
};
