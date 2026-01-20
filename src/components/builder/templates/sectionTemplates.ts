/**
 * Section Templates
 * 
 * These templates define how landing page sections expand into
 * existing primitive components (Container, Heading, Text, Button, etc.)
 * 
 * When a template is dropped on the canvas, it expands into the defined
 * component tree. Each child uses its standard property panel.
 */

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export interface ComponentTemplate {
    type: string;
    props: Record<string, any>;
    styles?: Record<string, any>;
    children?: ComponentTemplate[];
}

/**
 * Hero Section Template
 * Expands to: Container with Badge, Heading, Text, and Button row
 */
export const heroTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        minHeight: '400px',
        gap: '24px'
    },
    children: [
        {
            type: 'Badge',
            props: {
                text: '🚀 New Release',
                variant: 'secondary'
            }
        },
        {
            type: 'Heading',
            props: {
                text: 'Build your next project faster',
                level: 'h1'
            },
            styles: {
                fontSize: '48px',
                fontWeight: '700'
            }
        },
        {
            type: 'Text',
            props: {
                text: 'A modern platform to create, deploy, and scale your web applications with ease.'
            },
            styles: {
                color: 'var(--muted-foreground)',
                maxWidth: '600px'
            }
        },
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'flex',
                flexDirection: 'row',
                gap: '16px',
                justifyContent: 'center'
            },
            children: [
                {
                    type: 'Button',
                    props: {
                        text: 'Get Started',
                        variant: 'default'
                    }
                },
                {
                    type: 'Button',
                    props: {
                        text: 'Learn More',
                        variant: 'outline'
                    }
                }
            ]
        }
    ]
});

/**
 * Features Section Template
 * Expands to: Container with Heading row and 3-column grid of feature cards
 */
export const featuresTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        padding: '48px 24px'
    },
    children: [
        // Header section
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            },
            children: [
                {
                    type: 'Heading',
                    props: {
                        text: 'Everything you need',
                        level: 'h2'
                    }
                },
                {
                    type: 'Text',
                    props: {
                        text: 'Powerful features to help you build faster'
                    },
                    styles: {
                        color: 'var(--muted-foreground)'
                    }
                }
            ]
        },
        // Features grid
        {
            type: 'Container',
            props: {},
            styles: {
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '24px'
            },
            children: [
                createFeatureCard('⚡', 'Lightning Fast', 'Optimized for speed and performance'),
                createFeatureCard('🔒', 'Secure by Default', 'Enterprise-grade security built-in'),
                createFeatureCard('📱', 'Mobile Ready', 'Responsive design that works everywhere')
            ]
        }
    ]
});

function createFeatureCard(icon: string, title: string, description: string): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: {
            padding: '24px'
        },
        children: [
            {
                type: 'Container',
                props: {},
                styles: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                },
                children: [
                    {
                        type: 'Text',
                        props: { text: icon },
                        styles: { fontSize: '32px' }
                    },
                    {
                        type: 'Heading',
                        props: { text: title, level: 'h3' }
                    },
                    {
                        type: 'Text',
                        props: { text: description },
                        styles: { color: 'var(--muted-foreground)', fontSize: '14px' }
                    }
                ]
            }
        ]
    };
}

/**
 * Pricing Section Template
 */
export const pricingTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '32px',
        padding: '48px 24px',
        backgroundColor: 'var(--muted)',
        textAlign: 'center'
    },
    children: [
        {
            type: 'Container',
            props: {},
            styles: { display: 'flex', flexDirection: 'column', gap: '8px' },
            children: [
                { type: 'Heading', props: { text: 'Simple, transparent pricing', level: 'h2' } },
                { type: 'Text', props: { text: 'No hidden fees. Cancel anytime.' }, styles: { color: 'var(--muted-foreground)' } }
            ]
        },
        {
            type: 'Container',
            props: {},
            styles: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', maxWidth: '900px', margin: '0 auto' },
            children: [
                createPricingCard('Starter', 'Free', '', 'Get Started', false),
                createPricingCard('Pro', '$29', '/month', 'Start Trial', true),
                createPricingCard('Enterprise', 'Custom', '', 'Contact Sales', false)
            ]
        }
    ]
});

function createPricingCard(name: string, price: string, period: string, cta: string, highlighted: boolean): ComponentTemplate {
    return {
        type: 'Card',
        props: {},
        styles: {
            padding: '32px',
            border: highlighted ? '2px solid var(--primary)' : undefined
        },
        children: [
            {
                type: 'Container',
                props: {},
                styles: { display: 'flex', flexDirection: 'column', gap: '16px' },
                children: [
                    { type: 'Heading', props: { text: name, level: 'h3' } },
                    {
                        type: 'Container',
                        props: {},
                        styles: { display: 'flex', flexDirection: 'row', gap: '0', justifyContent: 'center', alignItems: 'baseline' },
                        children: [
                            { type: 'Text', props: { text: price }, styles: { fontSize: '36px', fontWeight: '700' } },
                            { type: 'Text', props: { text: period }, styles: { color: 'var(--muted-foreground)' } }
                        ]
                    },
                    { type: 'Button', props: { text: cta, variant: highlighted ? 'default' : 'outline' }, styles: { width: '100%' } }
                ]
            }
        ]
    };
}

/**
 * CTA Section Template
 */
export const ctaTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: { padding: '48px 24px' },
    children: [
        {
            type: 'Card',
            props: {},
            styles: { padding: '48px', textAlign: 'center' },
            children: [
                {
                    type: 'Container',
                    props: {},
                    styles: { display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' },
                    children: [
                        { type: 'Heading', props: { text: 'Ready to get started?', level: 'h2' } },
                        { type: 'Text', props: { text: 'Join thousands of happy users building amazing products.' }, styles: { color: 'var(--muted-foreground)' } },
                        { type: 'Button', props: { text: 'Start Free Trial', variant: 'default' } }
                    ]
                }
            ]
        }
    ]
});

/**
 * Navbar Template
 */
export const navbarTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)'
    },
    children: [
        { type: 'Heading', props: { text: 'YourBrand', level: 'h4' } },
        {
            type: 'Container',
            props: {},
            styles: { display: 'flex', flexDirection: 'row', gap: '24px' },
            children: [
                { type: 'Link', props: { text: 'Features', href: '#features' } },
                { type: 'Link', props: { text: 'Pricing', href: '#pricing' } },
                { type: 'Link', props: { text: 'About', href: '#about' } }
            ]
        },
        { type: 'Button', props: { text: 'Get Started', variant: 'default' } }
    ]
});

/**
 * FAQ Section Template
 */
export const faqTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: { display: 'flex', flexDirection: 'column', gap: '32px', padding: '48px 24px', maxWidth: '800px', margin: '0 auto' },
    children: [
        {
            type: 'Container',
            props: {},
            styles: { display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center' },
            children: [
                { type: 'Heading', props: { text: 'Frequently Asked Questions', level: 'h2' } },
                { type: 'Text', props: { text: 'Find answers to common questions' }, styles: { color: 'var(--muted-foreground)' } }
            ]
        },
        {
            type: 'Accordion',
            props: {
                items: [
                    { title: 'How do I get started?', content: 'Simply sign up for a free account and follow our quick start guide.' },
                    { title: 'What payment methods do you accept?', content: 'We accept all major credit cards, PayPal, and bank transfers.' },
                    { title: 'Can I cancel anytime?', content: 'Yes, you can cancel your subscription at any time with no cancellation fees.' }
                ]
            }
        }
    ]
});

/**
 * Logo Cloud Template
 */
export const logoCloudTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: { display: 'flex', flexDirection: 'column', gap: '24px', padding: '48px 24px', backgroundColor: 'var(--muted)', textAlign: 'center' },
    children: [
        { type: 'Text', props: { text: 'Trusted by leading companies' }, styles: { color: 'var(--muted-foreground)' } },
        {
            type: 'Container',
            props: {},
            styles: { display: 'flex', flexDirection: 'row', gap: '32px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
            children: [
                { type: 'Text', props: { text: 'Company 1' }, styles: { color: 'var(--muted-foreground)', fontSize: '14px' } },
                { type: 'Text', props: { text: 'Company 2' }, styles: { color: 'var(--muted-foreground)', fontSize: '14px' } },
                { type: 'Text', props: { text: 'Company 3' }, styles: { color: 'var(--muted-foreground)', fontSize: '14px' } },
                { type: 'Text', props: { text: 'Company 4' }, styles: { color: 'var(--muted-foreground)', fontSize: '14px' } }
            ]
        }
    ]
});

/**
 * Footer Template
 */
export const footerTemplate = (): ComponentTemplate => ({
    type: 'Container',
    props: {},
    styles: { display: 'flex', flexDirection: 'column', gap: '32px', padding: '48px 24px', borderTop: '1px solid var(--border)' },
    children: [
        {
            type: 'Container',
            props: {},
            styles: { display: 'flex', flexDirection: 'row', gap: '32px', justifyContent: 'space-between' },
            children: [
                {
                    type: 'Container',
                    props: {},
                    styles: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '250px' },
                    children: [
                        { type: 'Heading', props: { text: 'YourBrand', level: 'h4' } },
                        { type: 'Text', props: { text: 'Building the future of web development.' }, styles: { color: 'var(--muted-foreground)', fontSize: '14px' } }
                    ]
                },
                {
                    type: 'Container',
                    props: {},
                    styles: { display: 'flex', flexDirection: 'row', gap: '64px' },
                    children: [
                        createFooterColumn('Product', ['Features', 'Pricing', 'Docs']),
                        createFooterColumn('Company', ['About', 'Blog', 'Careers'])
                    ]
                }
            ]
        },
        { type: 'Separator', props: {} },
        { type: 'Text', props: { text: '© 2024 YourBrand. All rights reserved.' }, styles: { color: 'var(--muted-foreground)', fontSize: '14px', textAlign: 'center' } }
    ]
});

function createFooterColumn(title: string, links: string[]): ComponentTemplate {
    return {
        type: 'Container',
        props: {},
        styles: { display: 'flex', flexDirection: 'column', gap: '8px' },
        children: [
            { type: 'Text', props: { text: title }, styles: { fontWeight: '600' } },
            ...links.map(link => ({
                type: 'Link',
                props: { text: link, href: `#${link.toLowerCase()}` },
                styles: { color: 'var(--muted-foreground)', fontSize: '14px' }
            }))
        ]
    };
}

/**
 * Get template by name
 */
export function getSectionTemplate(name: string): ComponentTemplate | null {
    switch (name) {
        case 'Hero': return heroTemplate();
        case 'Features': return featuresTemplate();
        case 'Pricing': return pricingTemplate();
        case 'CTA': return ctaTemplate();
        case 'Navbar': return navbarTemplate();
        case 'FAQ': return faqTemplate();
        case 'LogoCloud': return logoCloudTemplate();
        case 'Footer': return footerTemplate();
        default: return null;
    }
}

/**
 * Expand a template into a real component with IDs
 */
export function expandTemplate(template: ComponentTemplate): any {
    const expanded: any = {
        id: generateId(),
        type: template.type,
        props: { ...template.props },
        styles: template.styles || {},
        children: []
    };

    if (template.children) {
        expanded.children = template.children.map(child => expandTemplate(child));
    }

    return expanded;
}
