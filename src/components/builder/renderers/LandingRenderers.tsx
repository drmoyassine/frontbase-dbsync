import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RendererProps } from './types';
import { useBuilderStore } from '@/stores/builder';

interface NavbarProps {
    logo?: {
        type?: 'text' | 'image';
        text?: string;
        imageUrl?: string;
        link?: string;
        useProjectLogo?: boolean;
        showIcon?: boolean; // Show icon alongside brand name text
    };
    menuItems?: Array<{
        id: string;
        label: string;
        navType: 'scroll' | 'link';
        target: string;
        subItems?: Array<{
            id: string;
            label: string;
            navType: 'scroll' | 'link';
            target: string;
        }>;
    }>;
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
    showDarkModeToggle?: boolean;
}

export const NavbarRenderer: React.FC<RendererProps> = ({
    effectiveProps,
    combinedClassName,
    inlineStyles,
    styles
}) => {
    // Mobile menu state
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

    // Access project for favicon URL
    const { project } = useBuilderStore();

    // Safely access props with fallbacks
    const props = (effectiveProps || {}) as NavbarProps;

    // Default values with null safety
    const logo = props.logo || { type: 'text', text: 'YourBrand', link: '/' };
    const menuItems = Array.isArray(props.menuItems) ? props.menuItems : [];
    const primaryButton = props.primaryButton || { enabled: true, text: 'Get Started' };
    const secondaryButton = props.secondaryButton;

    // Determine logo image URL: use project favicon if enabled and available
    const logoImageUrl = (logo.useProjectLogo && project?.faviconUrl)
        ? project.faviconUrl
        : logo.imageUrl;

    const navClassName = cn(
        combinedClassName,
        'fb-navbar w-full transition-all duration-200'
    );

    const navStyles: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--background)',
        width: '100%',
        flexWrap: 'wrap',
        ...(inlineStyles || {})
    };

    const handleNavClick = (navType: string, target: string) => {
        if (navType === 'scroll' && target.startsWith('#')) {
            // In builder preview, just show an alert or do nothing
            console.log(`Would scroll to: ${target}`);
        } else {
            console.log(`Would navigate to: ${target}`);
        }
        // Close mobile menu on navigation
        setMobileMenuOpen(false);
    };

    return (
        <nav className={navClassName} style={navStyles}>
            {/* Logo */}
            <a
                href={logo.link || '/'}
                onClick={(e) => e.preventDefault()}
                className="flex items-center shrink-0 gap-2"
            >
                {logo.type === 'image' && logoImageUrl ? (
                    <img
                        src={logoImageUrl}
                        alt="Logo"
                        className="h-8 w-auto"
                    />
                ) : (
                    <>
                        {/* Show icon alongside text if enabled */}
                        {logo.showIcon && project?.faviconUrl && (
                            <img
                                src={project.faviconUrl}
                                alt="Logo"
                                className="h-6 w-6 object-contain"
                            />
                        )}
                        <span className="text-xl font-bold">
                            {logo.text || 'YourBrand'}
                        </span>
                    </>
                )}
            </a>

            {/* Desktop: Menu Items + Buttons Container (uses container query CSS) */}
            <div className="fb-nav-desktop items-center gap-8">
                {/* Menu Items */}
                {menuItems.length > 0 && (
                    <div className="flex items-center gap-6">
                        {menuItems.map((item) => (
                            <a
                                key={item.id}
                                href={item.target || '#'}
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleNavClick(item.navType, item.target);
                                }}
                                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {item.label}
                            </a>
                        ))}
                    </div>
                )}

                {/* CTA Buttons */}
                <div className="flex items-center gap-3">
                    {/* Dark Mode Toggle (preview only) */}
                    {props.showDarkModeToggle && (
                        <button
                            type="button"
                            className="p-2 rounded-lg hover:bg-accent transition-colors"
                            title="Dark mode toggle (preview)"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                        </button>
                    )}
                    {secondaryButton?.enabled && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleNavClick(
                                secondaryButton.navType || 'link',
                                secondaryButton.target || '#'
                            )}
                        >
                            {secondaryButton.text || 'Learn More'}
                        </Button>
                    )}
                    {primaryButton?.enabled !== false && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleNavClick(
                                primaryButton?.navType || 'link',
                                primaryButton?.target || '#'
                            )}
                        >
                            {primaryButton?.text || 'Get Started'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Mobile: Hamburger Menu Button (uses container query CSS) */}
            <button
                type="button"
                className="fb-nav-mobile-btn p-2 rounded-lg hover:bg-accent items-center justify-center"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
                {mobileMenuOpen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                )}
            </button>

            {/* Mobile Menu Panel */}
            {mobileMenuOpen && (
                <div className="w-full py-4 border-t border-border">
                    <div className="flex flex-col gap-3">
                        {menuItems.map((item) => (
                            <a
                                key={item.id}
                                href={item.target || '#'}
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleNavClick(item.navType, item.target);
                                }}
                                className="py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {item.label}
                            </a>
                        ))}
                        <div className="flex flex-col gap-2 pt-2 border-t border-border">
                            {secondaryButton?.enabled && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleNavClick(
                                        secondaryButton.navType || 'link',
                                        secondaryButton.target || '#'
                                    )}
                                >
                                    {secondaryButton.text || 'Learn More'}
                                </Button>
                            )}
                            {primaryButton?.enabled !== false && (
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleNavClick(
                                        primaryButton?.navType || 'link',
                                        primaryButton?.target || '#'
                                    )}
                                >
                                    {primaryButton?.text || 'Get Started'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};
