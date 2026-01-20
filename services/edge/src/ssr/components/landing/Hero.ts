/**
 * Hero Section Component
 * 
 * Landing page hero with headline, subtitle, and CTAs.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface HeroProps {
    title: string;
    subtitle?: string;
    badge?: string;
    ctaText?: string;
    ctaLink?: string;
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    backgroundImage?: string;
    backgroundGradient?: string;
    alignment?: 'left' | 'center' | 'right';
    minHeight?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderHero(
    id: string,
    props: HeroProps,
    stylesData?: StylesData
): string {
    const alignment = props.alignment || 'center';
    const minHeight = props.minHeight || '60vh';

    // Build classes
    const sectionClasses = [
        'fb-hero',
        'relative',
        'flex',
        'items-center',
        'overflow-hidden',
        props.hideOnMobile ? 'hidden md:flex' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const contentClasses = [
        'container',
        'mx-auto',
        'px-4',
        'sm:px-6',
        'lg:px-8',
        'py-12',
        'sm:py-16',
        'lg:py-24',
        alignment === 'center' ? 'text-center' : '',
        alignment === 'right' ? 'text-right' : '',
    ].filter(Boolean).join(' ');

    const ctaContainerClasses = [
        'flex',
        'gap-4',
        'mt-8',
        alignment === 'center' ? 'justify-center' : '',
        alignment === 'right' ? 'justify-end' : '',
    ].filter(Boolean).join(' ');

    // Build styles
    const baseStyles: string[] = [`min-height: ${minHeight}`];

    if (props.backgroundImage) {
        baseStyles.push(`background-image: url('${props.backgroundImage}')`);
        baseStyles.push('background-size: cover');
        baseStyles.push('background-position: center');
    }

    if (props.backgroundGradient) {
        baseStyles.push(`background: ${props.backgroundGradient}`);
    }

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';
    const combinedStyles = [...baseStyles, inlineStyles].filter(Boolean).join('; ');

    // Build HTML
    const badgeHtml = props.badge
        ? `<div class="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-muted border text-sm font-medium">
             ${escapeHtml(props.badge)}
           </div>`
        : '';

    const titleHtml = `
        <h1 class="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-foreground mb-4 sm:mb-6">
            ${escapeHtml(props.title)}
        </h1>
    `;

    const subtitleHtml = props.subtitle
        ? `<p class="text-lg sm:text-xl text-muted-foreground max-w-2xl ${alignment === 'center' ? 'mx-auto' : ''} mb-6 sm:mb-8">
             ${escapeHtml(props.subtitle)}
           </p>`
        : '';

    const primaryCtaHtml = props.ctaText
        ? `<a href="${escapeHtml(props.ctaLink || '#')}" 
             class="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
             ${escapeHtml(props.ctaText)}
           </a>`
        : '';

    const secondaryCtaHtml = props.secondaryCtaText
        ? `<a href="${escapeHtml(props.secondaryCtaLink || '#')}" 
             class="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground font-medium transition-colors">
             ${escapeHtml(props.secondaryCtaText)}
           </a>`
        : '';

    const ctaContainerHtml = (props.ctaText || props.secondaryCtaText)
        ? `<div class="${ctaContainerClasses}">${primaryCtaHtml}${secondaryCtaHtml}</div>`
        : '';

    return `
        <section id="${id}" class="${sectionClasses}" style="${combinedStyles}">
            <div class="${contentClasses}">
                ${badgeHtml}
                ${titleHtml}
                ${subtitleHtml}
                ${ctaContainerHtml}
            </div>
        </section>
    `.trim();
}
