export interface AuthFormConfig {
    title?: string;
    description?: string;
    logoUrl?: string;
    primaryColor?: string;
    providers?: string[]; // 'google', 'github', etc.
    socialLayout?: 'horizontal' | 'vertical';
    showLinks?: boolean; // Show "Don't have an account?" etc.
}

export interface AuthForm {
    id: string;
    name: string;
    type: 'login' | 'signup';
    config: AuthFormConfig;
    targetContactType?: string; // For signup
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
