export interface AuthFormConfig {
    title?: string;
    description?: string;
    logoUrl?: string;
    primaryColor?: string;
    providers?: string[]; // 'google', 'github', etc.
    socialLayout?: 'horizontal' | 'vertical';
    showLinks?: boolean; // Show "Don't have an account?" etc.
    defaultView?: 'sign_in' | 'sign_up'; // For 'both' type
    magicLink?: boolean; // Enable passwordless magic link
}

export interface AuthForm {
    id: string;
    name: string;
    type: 'login' | 'signup' | 'both';
    config: AuthFormConfig;
    allowedContactTypes?: string[]; // Multiple types allowed
    targetContactType?: string; // Legacy/Single (deprecated mostly, but good for fallback)
    redirectUrl?: string;
    isActive: boolean;
    createdAt?: string;
}

// Maps provider IDs to friendly names and icons (conceptually)
export const AUTH_PROVIDERS = [
    { id: 'google', name: 'Google' },
    { id: 'github', name: 'GitHub' },
    { id: 'discord', name: 'Discord' },
    { id: 'twitter', name: 'Twitter' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'apple', name: 'Apple' },
];
