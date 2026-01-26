/**
 * Navbar Component
 * 
 * Navigation bar with configurable logo, menu items, and CTA buttons.
 * Supports scroll-to-section and link navigation types.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface NavMenuItem {
    id: string;
    label: string;
    navType: 'scroll' | 'link';
    target: string;
    subItems?: NavMenuItem[];
}

export interface NavLink {
    text: string;
    href: string;
}

export interface NavbarProps {
    // New structured format
    logo?: {
        type?: 'text' | 'image';
        text?: string;
        imageUrl?: string;
        link?: string;
        useProjectLogo?: boolean;
        showIcon?: boolean; // Show icon alongside brand name text
    };
    menuItems?: NavMenuItem[];
    primaryButton?: {
        enabled?: boolean;
        text?: string;
        navType?: 'scroll' | 'link';
        target?: string;
        variant?: string;
    };
    secondaryButton?: {
        enabled?: boolean;
        text?: string;
        navType?: 'scroll' | 'link';
        target?: string;
        variant?: string;
    };
    // Legacy format (backward compatible)
    logoText?: string;
    links?: NavLink[];
    ctaText?: string;
    ctaLink?: string;
    sticky?: boolean;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
    // Dark mode toggle
    showDarkModeToggle?: boolean;
}

export function renderNavbar(
    id: string,
    props: NavbarProps,
    stylesData?: StylesData
): string {
    // Determine if using new or legacy format
    const useNewFormat = !!props.logo || !!props.menuItems;

    const headerClasses = [
        'fb-navbar',
        'bg-background',
        'border-b',
        props.sticky ? 'sticky top-0 z-50' : '',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    if (useNewFormat) {
        return renderNewFormat(id, props, headerClasses, inlineStyles);
    } else {
        return renderLegacyFormat(id, props, headerClasses, inlineStyles);
    }
}

function renderNewFormat(
    id: string,
    props: NavbarProps,
    headerClasses: string,
    inlineStyles: string
): string {
    const logo = props.logo || { type: 'text', text: 'YourBrand', link: '/' };
    const menuItems = props.menuItems || [];
    const primaryButton = props.primaryButton;
    const secondaryButton = props.secondaryButton;

    // Logo HTML - support icon alongside text when showIcon is enabled
    const logoLink = logo.link || '/';
    let logoHtml: string;

    if (logo.type === 'image' && logo.imageUrl) {
        logoHtml = `<img src="${escapeHtml(logo.imageUrl)}" alt="Logo" class="h-8 w-auto" />`;
    } else if (logo.showIcon && logo.imageUrl) {
        // Show icon alongside brand name text
        logoHtml = `<img src="${escapeHtml(logo.imageUrl)}" alt="Logo" class="h-6 w-6 object-contain" /><span class="text-xl font-bold">${escapeHtml(logo.text || 'YourBrand')}</span>`;
    } else {
        logoHtml = `<span class="text-xl font-bold">${escapeHtml(logo.text || 'YourBrand')}</span>`;
    }

    // Menu items HTML with scroll support
    const menuItemsHtml = menuItems.map(item => {
        const href = item.navType === 'scroll' ? item.target : item.target;
        const scrollAttr = item.navType === 'scroll' ? `data-scroll-to="${escapeHtml(item.target)}"` : '';
        return `
            <a href="${escapeHtml(href)}" ${scrollAttr} 
               class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                ${escapeHtml(item.label)}
            </a>
        `;
    }).join('');

    // Mobile menu items
    const mobileMenuItemsHtml = menuItems.map(item => {
        const href = item.navType === 'scroll' ? item.target : item.target;
        const scrollAttr = item.navType === 'scroll' ? `data-scroll-to="${escapeHtml(item.target)}"` : '';
        return `
            <a href="${escapeHtml(href)}" ${scrollAttr}
               class="block py-2 text-muted-foreground hover:text-foreground transition-colors">
                ${escapeHtml(item.label)}
            </a>
        `;
    }).join('');

    // CTA Buttons HTML
    let buttonsHtml = '';

    // Dark Mode Toggle (if enabled)
    const darkModeToggleHtml = props.showDarkModeToggle ? `
        <button 
            type="button" 
            class="p-2 rounded-lg hover:bg-accent transition-colors" 
            data-fb-theme-toggle
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
        >
            <!-- Sun icon (shown in dark mode) -->
            <svg class="w-5 h-5 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
            </svg>
            <!-- Moon icon (shown in light mode) -->
            <svg class="w-5 h-5 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
            </svg>
        </button>
    ` : '';

    if (secondaryButton?.enabled) {
        const scrollAttr = secondaryButton.navType === 'scroll'
            ? `data-scroll-to="${escapeHtml(secondaryButton.target || '')}"`
            : '';
        buttonsHtml += `
            <a href="${escapeHtml(secondaryButton.target || '#')}" ${scrollAttr}
               class="inline-flex items-center justify-center px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition-colors">
                ${escapeHtml(secondaryButton.text || 'Learn More')}
            </a>
        `;
    }

    if (primaryButton?.enabled !== false) {
        const scrollAttr = primaryButton?.navType === 'scroll'
            ? `data-scroll-to="${escapeHtml(primaryButton.target || '')}"`
            : '';
        buttonsHtml += `
            <a href="${escapeHtml(primaryButton?.target || '#')}" ${scrollAttr}
               class="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                ${escapeHtml(primaryButton?.text || 'Get Started')}
            </a>
        `;
    }

    return `
        <header id="${id}" class="${headerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between py-4">
                    <!-- Logo -->
                    <a href="${escapeHtml(logoLink)}" class="flex items-center gap-2">
                        ${logoHtml}
                    </a>
                    
                    <!-- Desktop Navigation + CTA Buttons grouped together -->
                    <div class="hidden md:flex items-center gap-8">
                        <nav class="flex items-center gap-6">
                            ${menuItemsHtml}
                        </nav>
                        <div class="flex items-center gap-3">
                            ${darkModeToggleHtml}
                            ${buttonsHtml}
                        </div>
                    </div>
                    
                    <!-- Mobile: Dark Mode Toggle + Menu Button -->
                    <div class="md:hidden flex items-center gap-2">
                        ${darkModeToggleHtml}
                        <button type="button" class="p-2 rounded-lg hover:bg-accent" data-fb-mobile-menu-toggle>
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Mobile Menu (hidden by default) -->
                <div class="md:hidden hidden pb-4" data-fb-mobile-menu>
                    <nav class="flex flex-col gap-1">
                        ${mobileMenuItemsHtml}
                    </nav>
                    <div class="flex flex-col gap-2 mt-4 pt-4 border-t">
                        ${buttonsHtml}
                    </div>
                </div>
            </div>
        </header>
        ${props.showDarkModeToggle ? `
        <script>
            (function() {
                // Initialize theme from localStorage or system preference
                var savedTheme = localStorage.getItem('fb-theme');
                if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                }
                
                // Attach click handlers to all theme toggle buttons
                var toggles = document.querySelectorAll('[data-fb-theme-toggle]');
                for (var i = 0; i < toggles.length; i++) {
                    toggles[i].addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var isDark = document.documentElement.classList.toggle('dark');
                        localStorage.setItem('fb-theme', isDark ? 'dark' : 'light');
                    });
                }
            })();
        </script>
        ` : ''}
    `.trim();
}

function renderLegacyFormat(
    id: string,
    props: NavbarProps,
    headerClasses: string,
    inlineStyles: string
): string {
    // Logo
    const logoHtml = props.logoText
        ? `<span class="text-xl font-bold">${escapeHtml(props.logoText)}</span>`
        : `<span class="text-xl font-bold">Logo</span>`;

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
