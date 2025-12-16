import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AuthForm, AUTH_PROVIDERS } from '@/types/auth-form';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';
import { ExternalLink, HelpCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AuthFormBuilderProps {
    form: AuthForm | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (form: Partial<AuthForm>) => Promise<void>;
    params?: {
        contactTypes?: Record<string, string>;
    }
}

export function AuthFormBuilder({ form, open, onOpenChange, onSave }: AuthFormBuilderProps) {
    const { config } = useUserContactConfig();
    const contactTypes = config?.contactTypes || {};

    const [formData, setFormData] = useState<Partial<AuthForm>>({
        name: '',
        type: 'login',
        config: {
            title: 'Welcome Back',
            providers: [],
            socialLayout: 'horizontal',
            showLinks: true
        },
        targetContactType: '',
        isActive: true
    });

    useEffect(() => {
        if (form) {
            setFormData(form);
        } else {
            setFormData({
                name: '',
                type: 'login', // Reset to default for new form
                config: { title: 'Welcome Back', providers: [], socialLayout: 'horizontal', showLinks: true },
                targetContactType: Object.keys(contactTypes)[0] || '',
                isActive: true
            });
        }
    }, [form, open, contactTypes]);

    const updateConfig = (key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            config: { ...prev.config, [key]: value }
        }));
    };

    const toggleProvider = (providerId: string) => {
        const current = formData.config?.providers || [];
        const newProviders = current.includes(providerId)
            ? current.filter(p => p !== providerId)
            : [...current, providerId];
        updateConfig('providers', newProviders);
    };

    const handleSave = async () => {
        await onSave(formData);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle>{form ? 'Edit Form' : 'Create Authentication Form'}</DialogTitle>
                    <DialogDescription>
                        Configure your {formData.type} form appearance and behavior.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 px-6 py-4">
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Form Name</Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Customer Login"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Form Type</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(val: 'login' | 'signup') => setFormData(prev => ({
                                        ...prev,
                                        type: val,
                                        config: { ...prev.config, title: val === 'login' ? 'Welcome Back' : 'Create an Account' }
                                    }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="login">Login</SelectItem>
                                        <SelectItem value="signup">Sign Up</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {formData.type === 'signup' && (
                            <div className="space-y-2 p-4 bg-slate-50 border rounded-md">
                                <Label>Assign Contact Type</Label>
                                <DialogDescription className="text-xs mb-2">
                                    Users signing up through this form will be assigned this type.
                                </DialogDescription>
                                <Select
                                    value={formData.targetContactType}
                                    onValueChange={val => setFormData(prev => ({ ...prev, targetContactType: val }))}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(contactTypes).map(([key, label]) => (
                                            <SelectItem key={key} value={key}>{label} ({key})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {Object.keys(contactTypes).length === 0 && (
                                    <div className="text-amber-600 text-xs">No contact types defined. Go to User Configuration to add them.</div>
                                )}
                            </div>
                        )}

                        <Tabs defaultValue="appearance">
                            <TabsList className="w-full">
                                <TabsTrigger value="appearance" className="flex-1">Appearance</TabsTrigger>
                                <TabsTrigger value="social" className="flex-1">Social Providers</TabsTrigger>
                                <TabsTrigger value="advanced" className="flex-1">Advanced</TabsTrigger>
                            </TabsList>

                            <TabsContent value="appearance" className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Form Title</Label>
                                    <Input
                                        value={formData.config?.title}
                                        onChange={e => updateConfig('title', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Logo URL (Optional)</Label>
                                    <Input
                                        value={formData.config?.logoUrl || ''}
                                        onChange={e => updateConfig('logoUrl', e.target.value)}
                                        placeholder="https://..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Primary Color</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="color"
                                            className="w-12 p-1 h-9"
                                            value={formData.config?.primaryColor || '#000000'}
                                            onChange={e => updateConfig('primaryColor', e.target.value)}
                                        />
                                        <Input
                                            value={formData.config?.primaryColor || '#000000'}
                                            onChange={e => updateConfig('primaryColor', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="social" className="space-y-4 pt-4">
                                <div className="rounded-md border p-4">
                                    <h4 className="font-medium mb-4 flex items-center gap-2">
                                        Enable Providers
                                        <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-slate-100">
                                            UI Only
                                        </span>
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        {AUTH_PROVIDERS.map(provider => (
                                            <div key={provider.id} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`p-${provider.id}`}
                                                    checked={formData.config?.providers?.includes(provider.id)}
                                                    onCheckedChange={() => toggleProvider(provider.id)}
                                                />
                                                <Label htmlFor={`p-${provider.id}`} className="cursor-pointer">{provider.name}</Label>
                                            </div>
                                        ))}
                                    </div>

                                    <Separator className="my-4" />

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                                            <HelpCircle className="h-4 w-4" />
                                            Configuration Required
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            To make these buttons work, you must configure the Client ID and Secret in your Supabase Auth settings.
                                        </p>
                                        <div className="flex gap-2 flex-wrap">
                                            <Button variant="outline" size="sm" asChild>
                                                <a href="https://supabase.com/dashboard/project/_/auth/providers" target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                                    Open Supabase Auth Settings
                                                </a>
                                            </Button>
                                            {formData.config?.providers?.includes('google') && (
                                                <Button variant="ghost" size="sm" className="text-xs h-8" asChild>
                                                    <a href="https://supabase.com/docs/guides/auth/social-login/auth-google" target="_blank" rel="noopener noreferrer">Google Setup Docs</a>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="advanced" className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Redirect URL (Override)</Label>
                                    <Input
                                        value={formData.redirectUrl || ''}
                                        onChange={e => setFormData(prev => ({ ...prev, redirectUrl: e.target.value }))}
                                        placeholder="Optimization: leave empty to use 'Home Page' settings"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        By default, users are redirected based on their Contact Type configuration. Set this to override that behavior.
                                    </p>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                </ScrollArea>

                <DialogFooter className="px-6 py-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>
                        {form ? 'Save Changes' : 'Create Form'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
