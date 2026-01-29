/**
 * Logo Cloud Renderer
 * 
 * Edge-sufficient component for displaying partner/client logos.
 * Supports static grid and animated marquee modes.
 * Pure CSS animations - no JavaScript timers or API calls.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';

interface LogoItem {
    id: string;
    type: 'image' | 'text';
    value: string; // URL for image, text for brand name
    url?: string;  // Optional click target
}

// Size mappings
const SIZE_MAP = {
    sm: { height: '24px', fontSize: '14px' },
    md: { height: '32px', fontSize: '18px' },
    lg: { height: '48px', fontSize: '24px' },
};

export const LogoCloudRenderer: React.FC<RendererProps> = ({
    effectiveProps,
    combinedClassName,
    inlineStyles,
    createEditableText
}) => {
    const {
        title = 'Trusted by leading companies',
        logos = [],
        displayMode = 'static',
        logoSize = 'md',
        speed = 20,
        pauseOnHover = true,
        grayscale = true,
    } = effectiveProps;

    // Determine size values
    const sizeValues = typeof logoSize === 'string' && SIZE_MAP[logoSize as keyof typeof SIZE_MAP]
        ? SIZE_MAP[logoSize as keyof typeof SIZE_MAP]
        : { height: `${logoSize}px`, fontSize: `${Math.max(14, Number(logoSize) * 0.5)}px` };

    // Render a single logo item
    const renderLogoItem = (logo: LogoItem, index: number) => {
        const content = logo.type === 'image' ? (
            <img
                src={logo.value}
                alt={`Logo ${index + 1}`}
                className={cn(
                    'object-contain transition-all duration-300',
                    grayscale && 'grayscale hover:grayscale-0 opacity-60 hover:opacity-100'
                )}
                style={{ height: sizeValues.height, width: 'auto' }}
            />
        ) : (
            <span
                className={cn(
                    'font-semibold whitespace-nowrap transition-all duration-300',
                    grayscale && 'opacity-60 hover:opacity-100'
                )}
                style={{ fontSize: sizeValues.fontSize }}
            >
                {logo.value}
            </span>
        );

        if (logo.url) {
            return (
                <a
                    key={logo.id || index}
                    href={logo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center hover:scale-105 transition-transform"
                >
                    {content}
                </a>
            );
        }

        return (
            <div key={logo.id || index} className="flex items-center justify-center">
                {content}
            </div>
        );
    };

    // Static mode: simple flex grid
    if (displayMode === 'static') {
        return (
            <div className={cn('py-12 px-6', combinedClassName)} style={inlineStyles}>
                {title && (
                    <p className="text-center text-muted-foreground text-sm mb-8">
                        {createEditableText(title, 'title', '')}
                    </p>
                )}
                <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
                    {(logos as LogoItem[]).map(renderLogoItem)}
                </div>
            </div>
        );
    }

    // Marquee mode: CSS-only infinite scroll animation
    // Duplicate logos for seamless loop
    const duplicatedLogos = [...logos, ...logos] as LogoItem[];

    return (
        <div
            className={cn('py-12 px-6 overflow-hidden', combinedClassName)}
            style={inlineStyles}
        >
            {title && (
                <p className="text-center text-muted-foreground text-sm mb-8">
                    {createEditableText(title, 'title', '')}
                </p>
            )}
            <div
                className={cn(
                    'logo-marquee-container',
                    pauseOnHover && 'logo-marquee-pause-on-hover'
                )}
            >
                <div
                    className="logo-marquee-track"
                    style={{
                        '--marquee-speed': `${speed}s`,
                        '--logo-count': logos.length,
                    } as React.CSSProperties}
                >
                    {duplicatedLogos.map((logo, idx) => (
                        <div key={`${logo.id || idx}-${idx}`} className="logo-marquee-item px-6 md:px-8">
                            {renderLogoItem(logo, idx)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
