import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Copy } from 'lucide-react';
import { AuthForm } from '@/types/auth-form';

interface EmbedCodeDialogProps {
    form: AuthForm | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EmbedCodeDialog({ form, open, onOpenChange }: EmbedCodeDialogProps) {
    const [copied, setCopied] = React.useState(false);

    if (!form) return null;

    const baseUrl = window.location.origin; // In dev this is localhost:5173, in prod it's the domain
    // Note: For production, this should ideally be the API server URL if different.
    // Assuming builder and API are same origin for now or proxied.

    // Actually, the embed.js should be served from the BACKEND port in dev (3000), not the frontend vite port (5173).
    // But we typically proxy /embed.js -> localhost:3000/embed.js via vite.config.ts?
    // Let's assume relative path works if proxy is set up, or absolute path if we know the server URL.
    // Since we are in the browser, let's try to construct it.

    const serverUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const scriptSrc = `${serverUrl}/embed.js`;

    const scriptCode = `<script src="${scriptSrc}" data-form-id="${form.id}" data-width="100%"></script>`;
    const directLink = `${serverUrl}/embed/auth/${form.id}`;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Embed {form.name}</DialogTitle>
                    <DialogDescription>
                        Use the code below to embed this form on any website.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="script">
                    <TabsList className="w-full">
                        <TabsTrigger value="script" className="flex-1">Smart Embed (Script)</TabsTrigger>
                        <TabsTrigger value="link" className="flex-1">Direct Link</TabsTrigger>
                    </TabsList>

                    <TabsContent value="script" className="space-y-4 pt-4">
                        <div className="relative">
                            <pre className="p-4 bg-slate-950 text-slate-50 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all max-w-full custom-scrollbar">
                                {scriptCode}
                            </pre>
                            <Button
                                size="icon"
                                variant="secondary"
                                className="absolute top-2 right-2 h-8 w-8"
                                onClick={() => copyToClipboard(scriptCode)}
                            >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            This script creates a responsive iframe that auto-resizes to fit the form content.
                        </p>
                    </TabsContent>

                    <TabsContent value="link" className="space-y-4 pt-4">
                        <div className="flex gap-2">
                            <Input value={directLink} readOnly />
                            <Button size="icon" variant="outline" onClick={() => copyToClipboard(directLink)}>
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Share this link to open the form in a full-page view.
                        </p>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
