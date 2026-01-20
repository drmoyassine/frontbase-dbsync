/**
 * Logo Cloud Component
 * 
 * Display partner/client logos in a row.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface LogoItem {
    src: string;
    alt: string;
    href?: string;
}

export interface LogoCloudProps {
    title?: string;
    subtitle?: string;
    logos: LogoItem[];
    grayscale?: boolean;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderLogoCloud(
    id: string,
    props: LogoCloudProps,
    stylesData?: StylesData
): string {
    const sectionClasses = [
        'fb-logo-cloud',
        'py-12',
        'sm:py-16',
        'lg:py-24',
        'bg-muted/50',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const imageClasses = [
        'h-8',
        'sm:h-10',
        'object-contain',
        props.grayscale ? 'grayscale hover:grayscale-0 transition-all' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    // Build header
    const headerHtml = (props.title || props.subtitle) ? `
        <div class="text-center mb-12 sm:mb-16">
            ${props.title ? `<h2 class="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-4">${escapeHtml(props.title)}</h2>` : ''}
            ${props.subtitle ? `<p class="text-lg sm:text-xl text-muted-foreground">${escapeHtml(props.subtitle)}</p>` : ''}
        </div>
    ` : '';

    // Build logos
    const logosHtml = (props.logos || []).map(logo => {
        const imgHtml = `<img src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.alt)}" class="${imageClasses}" />`;

        if (logo.href) {
            return `<a href="${escapeHtml(logo.href)}" class="flex items-center justify-center">${imgHtml}</a>`;
        }

        return `<div class="flex items-center justify-center">${imgHtml}</div>`;
    }).join('');

    return `
        <section id="${id}" class="${sectionClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${headerHtml}
                <div class="rounded-xl bg-card border p-8 sm:p-12 shadow-sm">
                    <div class="flex flex-wrap items-center justify-center gap-8 sm:gap-12 lg:gap-16">
                        ${logosHtml}
                    </div>
                </div>
            </div>
        </section>
    `.trim();
}
