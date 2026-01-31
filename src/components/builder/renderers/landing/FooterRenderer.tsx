/**
 * Footer Renderer
 * 
 * Builder canvas renderer for the Footer component.
 * Mirrors the Edge SSR output for visual parity.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { Facebook, Twitter, Instagram, Linkedin, Youtube, Github, LucideIcon } from 'lucide-react';

interface FooterLink {
    id?: string;
    text: string;
    href: string;
}

interface FooterColumn {
    id?: string;
    title: string;
    links: FooterLink[];
}

interface SocialLink {
    id?: string;
    icon: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'github';
    href: string;
}

const socialIconMap: Record<string, LucideIcon> = {
    facebook: Facebook,
    twitter: Twitter,
    instagram: Instagram,
    linkedin: Linkedin,
    youtube: Youtube,
    github: Github,
};

export const FooterRenderer: React.FC<RendererProps> = ({
    effectiveProps,
    combinedClassName,
    inlineStyles,
    createEditableText,
}) => {
    const {
        logo,
        logoText = 'YourBrand',
        description,
        columns = [],
        socials = [],
        copyright,
    } = effectiveProps;

    // Generate copyright with year placeholder
    const year = new Date().getFullYear();
    const copyrightText = copyright
        ? copyright.replace(/\{\{year\}\}/g, String(year))
        : `© ${year} All rights reserved.`;

    return (
        <footer
            className={cn(
                'fb-footer border-t w-full max-w-full',
                combinedClassName
            )}
            style={inlineStyles}
        >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
                <div className="flex flex-col gap-8 md:flex-row md:flex-wrap md:justify-between">
                    {/* Brand Section */}
                    <div className="flex-shrink-0 max-w-sm">
                        <a href="/" className="inline-flex items-center">
                            {logo ? (
                                <img src={logo} alt={logoText || 'Logo'} className="h-8" />
                            ) : logoText ? (
                                <span className="text-xl font-bold">
                                    {createEditableText(logoText, 'logoText', '')}
                                </span>
                            ) : null}
                        </a>

                        {description && (
                            <p className="text-muted-foreground mt-4 max-w-xs">
                                {createEditableText(description, 'description', '')}
                            </p>
                        )}

                        {/* Social Links */}
                        {socials.length > 0 && (
                            <div className="flex gap-4 mt-6">
                                {socials.map((social: SocialLink, index: number) => {
                                    const IconComponent = socialIconMap[social.icon];
                                    return (
                                        <a
                                            key={social.id || index}
                                            href={social.href || '#'}
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {IconComponent && <IconComponent className="w-5 h-5" />}
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Link Columns */}
                    {columns.length > 0 && (
                        <div className={cn(
                            "grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:flex lg:gap-12",
                            {
                                "grid-cols-1": !effectiveProps.mobileColumns || effectiveProps.mobileColumns === 1,
                                "grid-cols-2": effectiveProps.mobileColumns === 2,
                                "grid-cols-3": effectiveProps.mobileColumns === 3,
                            }
                        )}>
                            {columns.map((column: FooterColumn, colIndex: number) => (
                                <div key={column.id || colIndex}>
                                    <h4 className="font-semibold mb-4">{column.title}</h4>
                                    <ul className="space-y-2">
                                        {(column.links || []).map((link: FooterLink, linkIndex: number) => (
                                            <li key={link.id || linkIndex}>
                                                <a
                                                    href={link.href || '#'}
                                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    {link.text}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Copyright */}
                <div className="border-t mt-12 pt-8 text-center text-muted-foreground text-sm">
                    {copyrightText}
                </div>
            </div>

            {/* Empty State for Builder */}
            {columns.length === 0 && !description && (
                <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg mx-4 mb-4">
                    <p className="text-sm">Configure footer using the Properties panel</p>
                    <p className="text-xs mt-1">Add columns, links, and social icons</p>
                </div>
            )}
        </footer>
    );
};
