"""
CSS Registry - Shared Component CSS Definitions

This registry defines CSS for each component type and variant.
It serves as the single source of truth for both:
- FastAPI: Bundling CSS during publish
- Edge: Fallback if cssBundle is missing

Component CSS is organized by: {ComponentType}:{variant}
Global CSS is always included in bundles.
"""

from typing import Dict, Set

# =============================================================================
# Global CSS (Always Included)
# =============================================================================

GLOBAL_CSS = """
/* Reset & Base Styles */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; }
img, video { max-width: 100%; height: auto; }

/* CSS Variables */
:root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 215 20.2% 65.1%;
    --radius: 0.5rem;
}

/* Dark Mode Support */
.dark {
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
    --muted: 223 47% 11%;
    --muted-foreground: 215.4 16.3% 56.9%;
    --border: 216 34% 17%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 1.2%;
    --secondary: 222.2 47.4% 11.2%;
    --secondary-foreground: 210 40% 98%;
    --accent: 216 34% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
}

/* Utility Classes */
.fb-loading { opacity: 0.7; pointer-events: none; }
.fb-skeleton { 
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); 
    background-size: 200% 100%; 
    animation: skeleton 1.5s infinite; 
}
@keyframes skeleton { 
    0% { background-position: 200% 0; } 
    100% { background-position: -200% 0; } 
}

/* Container utilities */
.container { width: 100%; margin-left: auto; margin-right: auto; padding-left: 1rem; padding-right: 1rem; }
@media (min-width: 640px) { .container { max-width: 640px; } }
@media (min-width: 768px) { .container { max-width: 768px; } }
@media (min-width: 1024px) { .container { max-width: 1024px; } }
@media (min-width: 1280px) { .container { max-width: 1280px; } }

/* Flex utilities */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 0.5rem; }
.gap-4 { gap: 1rem; }
.gap-6 { gap: 1.5rem; }
.gap-8 { gap: 2rem; }

/* Grid utilities */
.grid { display: grid; }
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (min-width: 640px) {
    .sm\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sm\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 768px) {
    .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .md\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .md\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
    .lg\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .lg\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

/* Spacing utilities */
.p-4 { padding: 1rem; }
.p-6 { padding: 1.5rem; }
.p-8 { padding: 2rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
.py-8 { padding-top: 2rem; padding-bottom: 2rem; }
.py-12 { padding-top: 3rem; padding-bottom: 3rem; }
.py-16 { padding-top: 4rem; padding-bottom: 4rem; }
.py-24 { padding-top: 6rem; padding-bottom: 6rem; }
.mt-4 { margin-top: 1rem; }
.mt-8 { margin-top: 2rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-8 { margin-bottom: 2rem; }
.mx-auto { margin-left: auto; margin-right: auto; }

/* Text utilities */
.text-center { text-align: center; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }
.text-2xl { font-size: 1.5rem; line-height: 2rem; }
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
.text-4xl { font-size: 2.25rem; line-height: 2.5rem; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }

/* Color utilities */
.text-muted-foreground { color: hsl(var(--muted-foreground)); }
.bg-muted { background-color: hsl(var(--muted)); }
.bg-background { background-color: hsl(var(--background)); }
"""

# =============================================================================
# Component CSS Registry
# =============================================================================

COMPONENT_CSS: Dict[str, str] = {
    # -------------------------------------------------------------------------
    # LogoCloud Component
    # -------------------------------------------------------------------------
    "LogoCloud:marquee": """
/* LogoCloud Marquee Animation */
@keyframes marquee-scroll { 
    0% { transform: translateX(0); } 
    100% { transform: translateX(-50%); } 
}
.logo-marquee-container { 
    overflow: hidden; 
    width: 100%; 
    mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); 
    -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); 
}
.logo-marquee-track { 
    display: flex; 
    width: max-content; 
    animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; 
}
.logo-marquee-pause-on-hover:hover .logo-marquee-track { 
    animation-play-state: paused; 
}
.logo-marquee-item { 
    flex-shrink: 0; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
}
""",
    
    "LogoCloud:marqueeOnMobile": """
/* LogoCloud - Marquee on Mobile Only */
.logo-marquee-mobile-only .logo-marquee-track { 
    animation: none; 
    flex-wrap: wrap; 
    justify-content: center; 
    gap: 2rem; 
    width: 100%; 
}
.logo-marquee-mobile-only .logo-marquee-container { 
    mask-image: none; 
    -webkit-mask-image: none; 
}
@media (max-width: 640px) {
    .logo-marquee-mobile-only .logo-marquee-track { 
        animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; 
        flex-wrap: nowrap; 
        justify-content: flex-start; 
        gap: 0; 
        width: max-content; 
    }
    .logo-marquee-mobile-only .logo-marquee-container { 
        mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); 
        -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); 
    }
}
""",

    # -------------------------------------------------------------------------
    # Button Component
    # -------------------------------------------------------------------------
    "Button:base": """
/* Button Base Styles */
.fb-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    border-radius: var(--radius);
    font-size: 0.875rem;
    font-weight: 500;
    transition: background-color 0.15s, color 0.15s, border-color 0.15s;
    cursor: pointer;
    border: none;
    text-decoration: none;
}
.fb-button:focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
}
.fb-button:disabled {
    pointer-events: none;
    opacity: 0.5;
}
.fb-button-default {
    background-color: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
}
.fb-button-default:hover {
    background-color: hsl(var(--primary) / 0.9);
}
.fb-button-secondary {
    background-color: hsl(var(--secondary));
    color: hsl(var(--secondary-foreground));
}
.fb-button-secondary:hover {
    background-color: hsl(var(--secondary) / 0.8);
}
.fb-button-outline {
    border: 1px solid hsl(var(--border));
    background-color: transparent;
}
.fb-button-outline:hover {
    background-color: hsl(var(--accent));
    color: hsl(var(--accent-foreground));
}
.fb-button-ghost {
    background-color: transparent;
}
.fb-button-ghost:hover {
    background-color: hsl(var(--accent));
    color: hsl(var(--accent-foreground));
}
.fb-button-sm { height: 2.25rem; padding: 0 0.75rem; }
.fb-button-md { height: 2.5rem; padding: 0 1rem; }
.fb-button-lg { height: 2.75rem; padding: 0 2rem; }
""",

    # -------------------------------------------------------------------------
    # Card Component
    # -------------------------------------------------------------------------
    "Card:base": """
/* Card Base Styles */
.fb-card {
    border-radius: var(--radius);
    border: 1px solid hsl(var(--border));
    background-color: hsl(var(--background));
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
}
.fb-card-header {
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
}
.fb-card-title {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1;
}
.fb-card-description {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    margin-top: 0.375rem;
}
.fb-card-content {
    padding: 1.5rem;
    padding-top: 0;
}
.fb-card-footer {
    display: flex;
    align-items: center;
    padding: 1.5rem;
    padding-top: 0;
}
""",

    # -------------------------------------------------------------------------
    # Accordion Component  
    # -------------------------------------------------------------------------
    "Accordion:base": """
/* Accordion Base Styles */
.fb-accordion-item {
    border-bottom: 1px solid hsl(var(--border));
}
.fb-accordion-trigger {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 0;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}
.fb-accordion-trigger:hover {
    text-decoration: underline;
}
.fb-accordion-trigger[data-state="open"] .fb-accordion-chevron {
    transform: rotate(180deg);
}
.fb-accordion-chevron {
    transition: transform 0.2s;
}
.fb-accordion-content {
    overflow: hidden;
    font-size: 0.875rem;
}
.fb-accordion-content[data-state="closed"] {
    display: none;
}
.fb-accordion-content[data-state="open"] {
    padding-bottom: 1rem;
}
""",

    # -------------------------------------------------------------------------
    # DataTable Component
    # -------------------------------------------------------------------------
    "DataTable:base": """
/* DataTable Base Styles */
.fb-table {
    width: 100%;
    caption-side: bottom;
    font-size: 0.875rem;
    border-collapse: collapse;
}
.fb-table-header {
    border-bottom: 1px solid hsl(var(--border));
}
.fb-table-header th {
    height: 3rem;
    padding: 0 1rem;
    text-align: left;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
}
.fb-table-body tr {
    border-bottom: 1px solid hsl(var(--border));
    transition: background-color 0.15s;
}
.fb-table-body tr:hover {
    background-color: hsl(var(--muted) / 0.5);
}
.fb-table-body td {
    padding: 1rem;
    vertical-align: middle;
}
.fb-table-footer {
    border-top: 1px solid hsl(var(--border));
    background-color: hsl(var(--muted) / 0.5);
    font-weight: 500;
}
""",

    # -------------------------------------------------------------------------
    # Pricing Component
    # -------------------------------------------------------------------------
    "Pricing:base": """
/* Pricing Card Styles */
.fb-pricing-card {
    display: flex;
    flex-direction: column;
    padding: 2rem;
    border-radius: var(--radius);
    border: 1px solid hsl(var(--border));
    background-color: hsl(var(--background));
}
.fb-pricing-card.featured {
    border-color: hsl(var(--primary));
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
.fb-pricing-header {
    text-align: center;
    margin-bottom: 1.5rem;
}
.fb-pricing-name {
    font-size: 1.25rem;
    font-weight: 600;
}
.fb-pricing-description {
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
    margin-top: 0.5rem;
}
.fb-pricing-price {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1;
}
.fb-pricing-period {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
}
.fb-pricing-features {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0;
    flex: 1;
}
.fb-pricing-feature {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
}
.fb-pricing-feature-icon {
    color: hsl(142 76% 36%);
}
""",

    # -------------------------------------------------------------------------
    # Hero Component
    # -------------------------------------------------------------------------
    "Hero:base": """
/* Hero Section Styles */
.fb-hero {
    position: relative;
    overflow: hidden;
}
.fb-hero-content {
    position: relative;
    z-index: 10;
}
.fb-hero-title {
    font-size: 2.5rem;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.1;
}
@media (min-width: 640px) {
    .fb-hero-title { font-size: 3rem; }
}
@media (min-width: 1024px) {
    .fb-hero-title { font-size: 4rem; }
}
.fb-hero-subtitle {
    font-size: 1.125rem;
    color: hsl(var(--muted-foreground));
    max-width: 42rem;
}
.fb-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 2rem;
}
""",

    # -------------------------------------------------------------------------
    # Features Component
    # -------------------------------------------------------------------------
    "Features:base": """
/* Features Section Styles */
.fb-features-grid {
    display: grid;
    gap: 2rem;
}
@media (min-width: 768px) {
    .fb-features-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
    .fb-features-grid { grid-template-columns: repeat(3, 1fr); }
}
.fb-feature-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.fb-feature-icon {
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius);
    background-color: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
}
.fb-feature-title {
    font-size: 1.125rem;
    font-weight: 600;
}
.fb-feature-description {
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
}
""",

    # -------------------------------------------------------------------------
    # Testimonials Component
    # -------------------------------------------------------------------------
    "Testimonials:base": """
/* Testimonial Styles */
.fb-testimonial {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    border-radius: var(--radius);
    background-color: hsl(var(--muted));
}
.fb-testimonial-quote {
    font-size: 1rem;
    font-style: italic;
    color: hsl(var(--foreground) / 0.9);
}
.fb-testimonial-author {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.fb-testimonial-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 9999px;
    object-fit: cover;
}
.fb-testimonial-name {
    font-weight: 600;
    font-size: 0.875rem;
}
.fb-testimonial-role {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
}
""",

    # -------------------------------------------------------------------------
    # FAQ Component
    # -------------------------------------------------------------------------
    "FAQ:base": """
/* FAQ Section Styles */
.fb-faq-item {
    border-bottom: 1px solid hsl(var(--border));
    padding: 1.5rem 0;
}
.fb-faq-question {
    font-weight: 600;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.fb-faq-answer {
    margin-top: 0.75rem;
    color: hsl(var(--muted-foreground));
}
""",

    # -------------------------------------------------------------------------
    # CTA Component
    # -------------------------------------------------------------------------
    "CTA:base": """
/* CTA Section Styles */
.fb-cta {
    padding: 4rem 2rem;
    text-align: center;
    border-radius: var(--radius);
    background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%);
    color: hsl(var(--primary-foreground));
}
.fb-cta-title {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1rem;
}
.fb-cta-description {
    font-size: 1.125rem;
    opacity: 0.9;
    max-width: 36rem;
    margin: 0 auto 2rem;
}
""",

    # -------------------------------------------------------------------------
    # Footer Component
    # -------------------------------------------------------------------------
    "Footer:base": """
/* Footer Styles */
.fb-footer {
    border-top: 1px solid hsl(var(--border));
    padding: 3rem 0;
}
.fb-footer-grid {
    display: grid;
    gap: 2rem;
}
@media (min-width: 768px) {
    .fb-footer-grid { grid-template-columns: repeat(4, 1fr); }
}
.fb-footer-brand {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.fb-footer-links {
    list-style: none;
    padding: 0;
    margin: 0;
}
.fb-footer-link {
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    font-size: 0.875rem;
    display: block;
    padding: 0.25rem 0;
    transition: color 0.15s;
}
.fb-footer-link:hover {
    color: hsl(var(--foreground));
}
.fb-footer-bottom {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid hsl(var(--border));
    text-align: center;
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
}
""",

    # -------------------------------------------------------------------------
    # Navbar Component
    # -------------------------------------------------------------------------
    "Navbar:base": """
/* Navbar Styles */
.fb-navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 0;
    border-bottom: 1px solid hsl(var(--border));
}
.fb-navbar-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 1.25rem;
    text-decoration: none;
    color: inherit;
}
.fb-navbar-nav {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    list-style: none;
    margin: 0;
    padding: 0;
}
.fb-navbar-link {
    color: hsl(var(--muted-foreground));
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
    transition: color 0.15s;
}
.fb-navbar-link:hover {
    color: hsl(var(--foreground));
}
.fb-navbar-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
@media (max-width: 768px) {
    .fb-navbar-nav { display: none; }
}
""",
}


# =============================================================================
# CSS Extraction Functions
# =============================================================================

def get_component_css_requirements(component: dict, requirements: Set[str]) -> None:
    """
    Recursively collect CSS requirements from a component tree.
    Modifies 'requirements' set in-place.
    
    Args:
        component: Component dict with type and props
        requirements: Set to add CSS requirement keys to
    """
    comp_type = component.get('type', '')
    props = component.get('props', {}) or {}
    
    # LogoCloud variants
    if comp_type == 'LogoCloud':
        display_mode = props.get('displayMode', 'static')
        if display_mode == 'marquee':
            requirements.add('LogoCloud:marquee')
        elif display_mode == 'marqueeOnMobile':
            requirements.add('LogoCloud:marquee')
            requirements.add('LogoCloud:marqueeOnMobile')
    
    # Button - always include base
    elif comp_type == 'Button':
        requirements.add('Button:base')
    
    # Card - always include base
    elif comp_type == 'Card':
        requirements.add('Card:base')
    
    # Accordion
    elif comp_type == 'Accordion':
        requirements.add('Accordion:base')
    
    # DataTable
    elif comp_type in ('DataTable', 'Table'):
        requirements.add('DataTable:base')
    
    # Landing page components
    elif comp_type == 'Hero':
        requirements.add('Hero:base')
    
    elif comp_type == 'Features':
        requirements.add('Features:base')
    
    elif comp_type == 'Pricing':
        requirements.add('Pricing:base')
    
    elif comp_type == 'Testimonials':
        requirements.add('Testimonials:base')
    
    elif comp_type == 'FAQ':
        requirements.add('FAQ:base')
        requirements.add('Accordion:base')  # FAQ uses accordion
    
    elif comp_type == 'CTA':
        requirements.add('CTA:base')
    
    elif comp_type == 'Footer':
        requirements.add('Footer:base')
    
    elif comp_type == 'Navbar':
        requirements.add('Navbar:base')
    
    # Recurse into children
    children = component.get('children', [])
    if children:
        for child in children:
            get_component_css_requirements(child, requirements)


def bundle_css_for_components(components: list) -> str:
    """
    Bundle all required CSS for a list of components with tree-shaking.
    
    Args:
        components: List of component dicts
        
    Returns:
        Complete CSS string including global CSS and component-specific CSS
    """
    # Collect requirements
    requirements: Set[str] = set()
    for component in components:
        get_component_css_requirements(component, requirements)
    
    # Build CSS bundle
    css_parts = [GLOBAL_CSS]
    
    for req in sorted(requirements):  # Sort for deterministic output
        if req in COMPONENT_CSS:
            css_parts.append(f"\n/* {req} */")
            css_parts.append(COMPONENT_CSS[req])
    
    # Minify (simple: remove extra whitespace)
    full_css = '\n'.join(css_parts)
    # Note: For production, use a proper minifier
    
    return full_css


def get_css_for_requirement(requirement: str) -> str:
    """Get CSS for a single requirement key."""
    return COMPONENT_CSS.get(requirement, '')
