import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { RendererProps } from '../types';

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
