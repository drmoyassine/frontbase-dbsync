import React from 'react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { RendererProps } from '../types';

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
