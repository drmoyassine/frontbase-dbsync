import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import { RendererProps } from './types';

export const ContainerRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children, styles }) => {
    // Check if this container uses grid layout
    const isGrid = inlineStyles?.display === 'grid' || styles?.display === 'grid';

    // Determine grid columns for responsive data attribute
    const gridCols = (() => {
        const colsStyle = styles?.gridTemplateColumns || inlineStyles?.gridTemplateColumns || '';
        if (typeof colsStyle === 'string') {
            const match = colsStyle.match(/repeat\((\d+)/);
            if (match) return match[1];
        }
        return '2'; // Default assumption
    })();

    // For containers, merge styling classes with default container styling
    const containerClassName = cn(
        'fb-container', // Enable container queries
        combinedClassName,
        'min-h-[100px] transition-all duration-200',
        isGrid ? 'fb-grid' : '', // Add responsive grid class
        // Only add default styling if no custom styling is applied
        !combinedClassName.includes('p-') && !styles?.padding ? 'p-6' : '',
        !combinedClassName.includes('border') && !styles?.borderWidth ? 'border border-border' : '',
        !combinedClassName.includes('rounded') && !styles?.borderRadius ? 'rounded-lg' : ''
    );

    // Apply margin:0 auto for centering the container itself
    // Note: text-align should be controlled by user via styles, not forced
    const mergedStyles: React.CSSProperties = {
        margin: '0 auto',
        ...inlineStyles
    };

    return (
        <div
            className={containerClassName}
            style={mergedStyles}
            data-cols={isGrid ? gridCols : undefined}
        >
            {children ? children : (
                <p className="text-muted-foreground text-center">Container - Drop components here</p>
            )}
        </div>
    );
};

export const RowRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children, styles }) => {
    // Row is a horizontal flex container
    const rowClassName = cn(
        combinedClassName,
        'min-h-[50px] transition-all duration-200',
        !combinedClassName.includes('border') && !styles?.borderWidth ? 'border border-dashed border-border/50' : '',
        !combinedClassName.includes('rounded') && !styles?.borderRadius ? 'rounded-md' : ''
    );

    // Merge default row styles with user styles
    const rowStyles: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'row',
        gap: '16px',
        alignItems: 'stretch',
        width: '100%',
        ...inlineStyles
    };

    return (
        <div className={rowClassName} style={rowStyles}>
            {children ? children : (
                <p className="text-muted-foreground text-center w-full">Row - Drop components here</p>
            )}
        </div>
    );
};

export const ColumnRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, children, styles }) => {
    // Column is a vertical flex container
    const columnClassName = cn(
        combinedClassName,
        'min-h-[100px] transition-all duration-200',
        !combinedClassName.includes('border') && !styles?.borderWidth ? 'border border-dashed border-border/50' : '',
        !combinedClassName.includes('rounded') && !styles?.borderRadius ? 'rounded-md' : ''
    );

    // Merge default column styles with user styles
    const columnStyles: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        ...inlineStyles
    };

    return (
        <div className={columnClassName} style={columnStyles}>
            {children ? children : (
                <p className="text-muted-foreground text-center">Column - Drop components here</p>
            )}
        </div>
    );
};


export const TabsRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => {
    const tabs = effectiveProps.tabs || [
        { label: 'Tab 1', content: 'Content for tab 1' },
        { label: 'Tab 2', content: 'Content for tab 2' }
    ];
    return (
        <Tabs defaultValue={tabs[0]?.label.toLowerCase().replace(/\s+/g, '-')} className={combinedClassName} style={inlineStyles}>
            <TabsList>
                {tabs.map((tab: any, index: number) => (
                    <TabsTrigger key={index} value={tab.label.toLowerCase().replace(/\s+/g, '-')}>
                        {tab.label}
                    </TabsTrigger>
                ))}
            </TabsList>
            {tabs.map((tab: any, index: number) => (
                <TabsContent key={index} value={tab.label.toLowerCase().replace(/\s+/g, '-')}>
                    {tab.content}
                </TabsContent>
            ))}
        </Tabs>
    );
};

export const AccordionRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => {
    const items = effectiveProps.items || [
        { title: 'Item 1', content: 'Content for item 1' },
        { title: 'Item 2', content: 'Content for item 2' }
    ];
    return (
        <Accordion type="single" collapsible className={combinedClassName} style={inlineStyles}>
            {items.map((item: any, index: number) => (
                <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger>{item.title}</AccordionTrigger>
                    <AccordionContent>{item.content}</AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
};

export const BreadcrumbRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles }) => {
    const crumbs = effectiveProps.items || [
        { label: 'Home', href: '/' },
        { label: 'Page', href: '/page' }
    ];
    return (
        <Breadcrumb className={combinedClassName} style={inlineStyles}>
            <BreadcrumbList>
                {crumbs.map((crumb: any, index: number) => (
                    <React.Fragment key={index}>
                        <BreadcrumbItem>
                            <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                        </BreadcrumbItem>
                        {index < crumbs.length - 1 && <BreadcrumbSeparator />}
                    </React.Fragment>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    );
};
