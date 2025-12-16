import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabase';
import { AuthForm, AUTH_PROVIDERS } from '@/types/auth-form';
import { Loader2 } from 'lucide-react';
import { useUserContactConfig } from '@/hooks/useUserContactConfig';

export default function EmbedAuthPage() {
    const { formId } = useParams<{ formId: string }>();
    const [form, setForm] = useState<AuthForm | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use config to determine redirection logic
    const { config: userConfig } = useUserContactConfig();

    useEffect(() => {
        async function fetchForm() {
            try {
                const res = await fetch(`/api/auth-forms/${formId}`);
                const json = await res.json();
                if (json.success) {
                    setForm(json.data);
                } else {
                    setError(json.error || 'Form not found');
                }
            } catch (err) {
                setError('Failed to load form');
            } finally {
                setLoading(false);
            }
        }

        if (formId) {
            fetchForm();
        }
    }, [formId]);

    // Resize Observer for Smart Embed
    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.contentRect.height;
                // Post message to parent
                window.parent.postMessage({
                    type: 'frontbase-resize',
                    formId,
                    height: height + 20 // Add a little padding
                }, '*');
            }
        });

        const container = document.getElementById('auth-container');
        if (container) {
            observer.observe(container);
        }

        return () => observer.disconnect();
    }, [formId, form]);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session && form) {
                // Handle Redirection logic
                if (form.redirectUrl) {
                    window.top!.location.href = form.redirectUrl;
                    return;
                }

                // Default logic: Redirect to home page based on contact type
                // For now, we redirect to the dashboard root, which should handle routing or show the main app
                // Ideally we would look up the contact type mapping here.
                // Since we are in an iframe, we need to break out.

                const builderUrl = window.location.origin; // App base URL
                window.top!.location.href = `${builderUrl}/dashboard`;
            }
        });

        return () => subscription.unsubscribe();
    }, [form]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !form) {
        return (
            <div className="flex items-center justify-center min-h-[300px] text-destructive">
                <p>{error || 'Form not found'}</p>
            </div>
        );
    }

    // Filter providers based on config
    const enabledProviders = form.config.providers || [];

    // Only show social layout if there are providers
    const showSocial = enabledProviders.length > 0;

    return (
        <div id="auth-container" className="w-full max-w-md mx-auto p-4 bg-background">
            {form.config.logoUrl && (
                <div className="flex justify-center mb-6">
                    <img src={form.config.logoUrl} alt="Logo" className="h-12 object-contain" />
                </div>
            )}

            {form.config.title && (
                <h1 className="text-xl font-semibold text-center mb-6">{form.config.title}</h1>
            )}

            <Auth
                supabaseClient={supabase}
                view={form.type === 'login' ? 'sign_in' : 'sign_up'}
                appearance={{
                    theme: ThemeSupa,
                    variables: {
                        default: {
                            colors: {
                                brand: form.config.primaryColor || '#000000',
                                brandAccent: form.config.primaryColor || '#000000',
                            },
                        },
                    },
                    className: {
                        container: 'w-full',
                        button: 'w-full',
                        input: 'w-full',
                    }
                }}
                providers={enabledProviders as any}
                socialLayout={form.config.socialLayout || 'horizontal'}
                showLinks={form.config.showLinks !== false}
                onlyThirdPartyProviders={false}
                redirectTo={window.location.origin + '/auth/callback'} // Needed for OAuth
            />
        </div>
    );
}
