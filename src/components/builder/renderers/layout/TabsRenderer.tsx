import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RendererProps } from '../types';

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
