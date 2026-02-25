import React from 'react';
import { Cloud, Server, Globe, Rocket } from 'lucide-react';

export const API_BASE = '';

export const PROVIDER_ICONS: Record<string, React.FC<any>> = {
    cloudflare: Cloud,
    docker: Server,
    vercel: Globe,
    flyio: Rocket,
};
