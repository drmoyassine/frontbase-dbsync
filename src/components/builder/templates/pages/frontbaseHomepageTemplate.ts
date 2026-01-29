/**
 * Frontbase Homepage Template
 * Complete marketing homepage for Frontbase platform
 * 
 * Now uses unified FeatureSection templates for consistent section rendering.
 */

import { ComponentTemplate } from '../types';
import { createComparisonCard } from '../builders/homepageBuilders';
import { createFooterColumn2 } from '../builders/sectionBuilders';
import { heroTemplate } from '../sections/heroTemplate';
import { logoCloudTemplate } from '../sections/logoCloudTemplate';
import { navbarTemplate } from '../sections/navbarTemplate';
import {
    valuePropsSectionTemplate,
    byoeSectionTemplate,
    featuresGridTemplate,
    techStackSectionTemplate
} from '../sections/featuresTemplate';

export const frontbaseHomepageTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        padding: '0',
        minHeight: '100vh'
    },
    children: [
        // === NAVBAR === (using navbarTemplate with Frontbase config)
        navbarTemplate({
            logoText: 'Frontbase',
            logoLink: '/',
            menuItems: [
                { id: 'menu-features', label: 'Features', navType: 'scroll', target: '#features' },
                { id: 'menu-integrations', label: 'Integrations', navType: 'scroll', target: '#integrations' },
                { id: 'menu-architecture', label: 'Architecture', navType: 'scroll', target: '#architecture' }
            ],
            primaryButton: {
                enabled: true,
                text: 'Join Private Alpha',
                navType: 'link',
                target: '/alpha'
            }
        }),
        // === HERO SECTION ===
        heroTemplate(),
        // === TRUST BAR (Powered By) ===
        logoCloudTemplate(),
        // === VALUE PROPS (4 Pillars) - Using FeatureSection ===
        valuePropsSectionTemplate(),
        // === BYOE SECTION - Using FeatureSection ===
        byoeSectionTemplate(),
        // === FEATURES GRID - Using FeatureSection ===
        featuresGridTemplate(),
        // === TECH STACK - Using FeatureSection ===
        techStackSectionTemplate(),
        // === COMPARISON ===
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'flex',
                flexDirection: 'column',
                padding: '80px 48px',
                gap: '48px',
                backgroundColor: 'var(--background)'
            },
            children: [
                {
                    type: 'Container',
                    props: {},
                    styles: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' },
                    children: [
                        { type: 'Heading', props: { text: 'WordPress was built for 2005', level: 'h2' }, styles: { fontSize: '40px', fontWeight: '700' } },
                        { type: 'Text', props: { text: 'Frontbase is built for 2025' }, styles: { fontSize: '24px', fontWeight: '600', color: 'var(--primary)' } }
                    ]
                },
                {
                    type: 'Container',
                    props: {},
                    styles: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '48px', maxWidth: '900px', margin: '0 auto' },
                    children: [
                        createComparisonCard('WordPress', ['PHP Monolith', 'Slow, requires hosting', 'MySQL only', 'Plugin-dependent AI', 'Theme lock-in', 'jQuery, legacy'], false),
                        createComparisonCard('Frontbase', ['Edge-native serverless', 'Sub-50ms global', 'Any SQL database', 'Native Python AI', 'Clean React/TypeScript', 'React 19, Hono, Tailwind 4'], true)
                    ]
                }
            ]
        },
        // === CTA SECTION ===
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '80px 48px',
                gap: '24px',
                backgroundColor: 'var(--primary)',
                textAlign: 'center'
            },
            children: [
                { type: 'Heading', props: { text: 'Ready to build on the edge?', level: 'h2' }, styles: { fontSize: '40px', fontWeight: '700', color: 'var(--primary-foreground)' } },
                { type: 'Text', props: { text: 'Join the Private Alpha and start building today.' }, styles: { color: 'var(--primary-foreground)', opacity: '0.9', fontSize: '18px' } },
                {
                    type: 'Row',
                    props: {},
                    styles: {
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '16px',
                        marginTop: '16px',
                        padding: '0',
                        borderWidth: '0',
                        minHeight: 'auto'
                    },
                    children: [
                        { type: 'Button', props: { text: 'Join Private Alpha', variant: 'secondary' }, styles: { padding: '12px 32px', fontSize: '16px' } },
                        { type: 'Button', props: { text: 'Star on GitHub', variant: 'outline' }, styles: { padding: '12px 32px', fontSize: '16px', borderColor: 'var(--primary-foreground)', color: 'var(--primary-foreground)' } }
                    ]
                }
            ]
        },
        // === FOOTER ===
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'flex',
                flexDirection: 'column',
                padding: '48px',
                gap: '32px',
                backgroundColor: 'var(--background)',
                borderTop: '1px solid var(--border)'
            },
            children: [
                {
                    type: 'Container',
                    props: {},
                    styles: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '48px' },
                    children: [
                        createFooterColumn2('Frontbase', ['Open Source', 'MIT License']),
                        createFooterColumn2('Product', ['Features', 'Pricing', 'Changelog']),
                        createFooterColumn2('Resources', ['Documentation', 'GitHub', 'Discord']),
                        createFooterColumn2('Legal', ['Privacy Policy', 'Terms of Service'])
                    ]
                },
                { type: 'Separator', props: {} },
                { type: 'Text', props: { text: '© 2025 Frontbase. Built with ❤️ for the edge.' }, styles: { textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '14px' } }
            ]
        }
    ]
});