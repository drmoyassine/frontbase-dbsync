import React from 'react';
import { Cloud, Server, Globe, Rocket, Database, Workflow, Triangle, Hexagon, Zap } from 'lucide-react';

export const API_BASE = '';

export const PROVIDER_ICONS: Record<string, React.FC<any>> = {
    cloudflare: Cloud,
    docker: Server,
    flyio: Rocket,
    supabase: Database,
    upstash: Workflow,
    vercel: Triangle,
    netlify: Hexagon,
    deno: Zap,
};
