/**
 * Features Section Component
 * 
 * Grid of feature cards with icons, titles, and descriptions.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface FeatureItem {
    icon: string;       // Emoji, lucide icon name, or image URL
    title: string;
    description: string;
    link?: string;
}

export interface FeaturesProps {
    title?: string;
    subtitle?: string;
    features: FeatureItem[];
    columns?: 2 | 3 | 4;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderFeatures(
    id: string,
    props: FeaturesProps,
    stylesData?: StylesData
): string {
    const columns = props.columns || 3;

    // Build classes
    const sectionClasses = [
        'fb-features',
        'py-12',
        'sm:py-16',
        'lg:py-24',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const gridClasses = [
        'grid',
        'gap-6',
        'sm:gap-8',
        columns === 2 ? 'sm:grid-cols-2' : '',
        columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : '',
        columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    // Build header
    const headerHtml = (props.title || props.subtitle) ? `
        <div class="mb-12 sm:mb-16 lg:mb-24 space-y-4">
            ${props.title ? `<h2 class="text-2xl sm:text-3xl lg:text-4xl font-semibold">${escapeHtml(props.title)}</h2>` : ''}
            ${props.subtitle ? `<p class="text-lg sm:text-xl text-muted-foreground">${escapeHtml(props.subtitle)}</p>` : ''}
        </div>
    ` : '';

    // Build feature cards
    const featuresHtml = (props.features || []).map(feature => {
        const isEmoji = feature.icon?.length <= 4 && !/^[a-zA-Z0-9\/]/.test(feature.icon);
        const isUrl = feature.icon?.startsWith('http') || feature.icon?.startsWith('/');

        let iconHtml = '';
        if (isEmoji) {
            iconHtml = `<span class="text-3xl mb-4 block">${feature.icon}</span>`;
        } else if (isUrl) {
            iconHtml = `<img src="${escapeHtml(feature.icon)}" alt="" class="w-10 h-10 mb-4" />`;
        } else {
            // Assume lucide icon name - render placeholder
            iconHtml = `<div class="w-10 h-10 mb-4 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <span class="text-xl">✦</span>
            </div>`;
        }

        const cardContent = `
            ${iconHtml}
            <h3 class="text-lg font-semibold mb-2">${escapeHtml(feature.title)}</h3>
            <p class="text-muted-foreground">${escapeHtml(feature.description)}</p>
        `;

        if (feature.link) {
            return `
                <a href="${escapeHtml(feature.link)}" class="block p-6 rounded-xl border bg-card hover:border-primary transition-colors">
                    ${cardContent}
                </a>
            `;
        }

        return `
            <div class="p-6 rounded-xl border bg-card">
                ${cardContent}
            </div>
        `;
    }).join('');

    return `
        <section id="${id}" class="${sectionClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${headerHtml}
                <div class="${gridClasses}">
                    ${featuresHtml}
                </div>
            </div>
        </section>
    `.trim();
}
