/**
 * Navbar Component
 * 
 * Navigation bar with logo, links, and mobile menu.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface NavLink {
    text: string;
    href: string;
}

export interface NavbarProps {
    logo?: string;           // Image URL or text
    logoText?: string;       // Text fallback for logo
    links: NavLink[];
    ctaText?: string;
    ctaLink?: string;
    sticky?: boolean;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderNavbar(
    id: string,
    props: NavbarProps,
    stylesData?: StylesData
): string {
    const headerClasses = [
        'fb-navbar',
        'bg-background',
        'border-b',
        props.sticky ? 'sticky top-0 z-50' : '',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    // Logo
    const logoHtml = props.logo
        ? `<img src="${escapeHtml(props.logo)}" alt="${escapeHtml(props.logoText || 'Logo')}" class="h-8" />`
        : `<span class="text-xl font-bold">${escapeHtml(props.logoText || 'Logo')}</span>`;

    // Desktop links
    const desktopLinksHtml = (props.links || []).map(link => `
        <a href="${escapeHtml(link.href)}" class="text-muted-foreground hover:text-foreground transition-colors">
            ${escapeHtml(link.text)}
        </a>
    `).join('');

    // Mobile menu links
    const mobileLinksHtml = (props.links || []).map(link => `
        <a href="${escapeHtml(link.href)}" class="block py-2 text-muted-foreground hover:text-foreground transition-colors">
            ${escapeHtml(link.text)}
        </a>
    `).join('');

    // CTA button
    const ctaHtml = props.ctaText
        ? `<a href="${escapeHtml(props.ctaLink || '#')}" 
             class="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
             ${escapeHtml(props.ctaText)}
           </a>`
        : '';

    return `
        <header id="${id}" class="${headerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between py-4">
                    <!-- Logo -->
                    <a href="/" class="flex items-center">
                        ${logoHtml}
                    </a>
                    
                    <!-- Desktop Navigation -->
                    <nav class="hidden md:flex items-center gap-8">
                        ${desktopLinksHtml}
                    </nav>
                    
                    <!-- CTA + Mobile Menu -->
                    <div class="flex items-center gap-4">
                        ${ctaHtml}
                        
                        <!-- Mobile Menu Button -->
                        <button type="button" class="md:hidden p-2 rounded-lg hover:bg-accent" data-fb-mobile-menu-toggle>
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Mobile Menu (hidden by default) -->
                <div class="md:hidden hidden pb-4" data-fb-mobile-menu>
                    <nav class="flex flex-col gap-1">
                        ${mobileLinksHtml}
                    </nav>
                </div>
            </div>
        </header>
    `.trim();
}
