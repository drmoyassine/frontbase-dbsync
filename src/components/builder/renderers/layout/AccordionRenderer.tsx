import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { RendererProps } from '../types';

export const AccordionRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName, inlineStyles, createEditableText }) => {
    const items = effectiveProps.items || [
        { title: 'Item 1', content: 'Content for item 1' },
        { title: 'Item 2', content: 'Content for item 2' }
    ];
    return (
        <Accordion type="single" collapsible className={combinedClassName} style={inlineStyles}>
            {items.map((item: any, index: number) => (
                <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="w-full text-left justify-start">
                        <div className="w-full flex-1">
                            {createEditableText(item.title || '', `items.${index}.title`, 'w-full block', { textAlign: 'left' })}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="w-full">
                        <div className="w-full pr-4 pb-4 pt-1">
                            {createEditableText(item.content || '', `items.${index}.content`, 'w-full block', { textAlign: 'left' })}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
};
