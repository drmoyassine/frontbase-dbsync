/**
 * Footer Component
 * 
 * Page footer with links, social icons, and copyright.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface FooterLink {
    text: string;
    href: string;
}

export interface FooterColumn {
    title: string;
    links: FooterLink[];
}

export interface SocialLink {
    icon: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'github';
    href: string;
}

export interface FooterProps {
    logo?: string;
    logoText?: string;
    description?: string;
    columns?: FooterColumn[];
    socials?: SocialLink[];
    copyright?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

const socialIcons: Record<string, string> = {
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    twitter: '<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>',
    instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
    linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
    youtube: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>',
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
};

export function renderFooter(
    id: string,
    props: FooterProps,
    stylesData?: StylesData
): string {
    const footerClasses = [
        'fb-footer',
        'border-t',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    // Logo
    const logoHtml = props.logo
        ? `<img src="${escapeHtml(props.logo)}" alt="${escapeHtml(props.logoText || 'Logo')}" class="h-8" />`
        : (props.logoText ? `<span class="text-xl font-bold">${escapeHtml(props.logoText)}</span>` : '');

    // Description
    const descriptionHtml = props.description
        ? `<p class="text-muted-foreground mt-4 max-w-xs">${escapeHtml(props.description)}</p>`
        : '';

    // Social links
    const socialsHtml = (props.socials || []).map(social => `
        <a href="${escapeHtml(social.href)}" class="text-muted-foreground hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                ${socialIcons[social.icon] || ''}
            </svg>
        </a>
    `).join('');

    // Columns
    const columnsHtml = (props.columns || []).map(column => `
        <div>
            <h4 class="font-semibold mb-4">${escapeHtml(column.title)}</h4>
            <ul class="space-y-2">
                ${column.links.map(link => `
                    <li><a href="${escapeHtml(link.href)}" class="text-muted-foreground hover:text-foreground transition-colors">${escapeHtml(link.text)}</a></li>
                `).join('')}
            </ul>
        </div>
    `).join('');

    // Copyright
    const year = new Date().getFullYear();
    const copyrightText = props.copyright || `© ${year} All rights reserved.`;

    return `
        <footer id="${id}" class="${footerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
                <div class="grid gap-8 lg:grid-cols-5">
                    <!-- Brand -->
                    <div class="lg:col-span-2">
                        <a href="/" class="inline-flex items-center">${logoHtml}</a>
                        ${descriptionHtml}
                        ${socialsHtml ? `<div class="flex gap-4 mt-6">${socialsHtml}</div>` : ''}
                    </div>
                    
                    <!-- Link Columns -->
                    <div class="lg:col-span-3 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                        ${columnsHtml}
                    </div>
                </div>
                
                <!-- Copyright -->
                <div class="border-t mt-12 pt-8 text-center text-muted-foreground text-sm">
                    ${escapeHtml(copyrightText)}
                </div>
            </div>
        </footer>
    `.trim();
}
