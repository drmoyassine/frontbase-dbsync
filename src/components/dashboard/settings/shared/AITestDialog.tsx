import React, { useState } from 'react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Brain, Copy, Check, Zap, Loader2 } from 'lucide-react';
import { API_BASE } from './edgeConstants';
import { toast } from 'sonner';
import { showTestToast } from './edgeTestToast';

interface AITestDialogProps {
    gpuModel: {
        id: string;
        name: string;
        model_type: string;
        endpoint_url?: string | null;
    };
    trigger?: React.ReactNode;
}

export const AITestDialog: React.FC<AITestDialogProps> = ({ gpuModel, trigger }) => {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [testing, setTesting] = useState(false);

    // Generate cURL based on model type
    const getCurlSnippet = () => {
        const url = gpuModel.endpoint_url || 'https://<engine-url>/api/ai/<slug>';

        let body = {};
        if (gpuModel.model_type === 'llm' || gpuModel.model_type === 'text-generation') {
            body = {
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: "Hello, world!" }
                ]
            };
        } else if (gpuModel.model_type === 'embedder' || gpuModel.model_type === 'text-embedding') {
            body = { text: "Hello, world!" };
        } else {
            body = { prompt: "Your prompt here" };
        }

        return `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(getCurlSnippet());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Copied to clipboard');
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await fetch(`${API_BASE}/api/edge-gpu/${gpuModel.id}/test`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Test failed');
            showTestToast(
                { success: true, message: `Inference completed in ${data.latency_ms ?? '?'}ms` },
                gpuModel.name
            );
        } catch (err: any) {
            showTestToast(
                { success: false, message: err.message || 'Inference failed' },
                gpuModel.name
            );
        } finally {
            setTesting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" title="AI Endpoint Details">
                        <Brain className="h-4 w-4 text-purple-400" />
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-purple-500" />
                        AI Endpoint Details
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-4 overflow-hidden">
                    {/* Model Info */}
                    <div className="flex items-center gap-6">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Model</p>
                            <p className="text-sm font-medium">{gpuModel.name}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Type</p>
                            <p className="text-sm font-medium capitalize">{gpuModel.model_type}</p>
                        </div>
                    </div>

                    {/* Request Schema */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Request Schema</p>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy schema">
                                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleTest} disabled={testing || !gpuModel.endpoint_url} title="Test inference">
                                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                        </div>
                        <pre className="bg-muted border p-3 rounded-md overflow-x-auto text-[11px] font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
                            <code>{getCurlSnippet()}</code>
                        </pre>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
