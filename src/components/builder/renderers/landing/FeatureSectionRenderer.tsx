/**
 * Feature Section Renderer
 * 
 * Edge-sufficient component for displaying feature cards in a configurable grid.
 * Uses the Card component for each feature item (proper composition).
 * Pure CSS styling - no JavaScript computations or API calls at runtime.
 */

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { CardRenderer } from '../basic/CardRenderer';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';

interface FeatureItem {
    id: string;
    icon: string;           // Lucide icon name
    title: string;
    description: string;
    cardBackground?: string; // Override section-level
}

export const FeatureSectionRenderer: React.FC<RendererProps> = ({
    effectiveProps,
    combinedClassName,
    inlineStyles,
    createEditableText,
    componentId
}) => {
    const {
        title = 'Features',
        subtitle = '',
        headerAlignment = 'center',
        columns = 3,
        iconAlignment = 'center',
        textAlignment = 'center',
        iconSize = 'md',
        iconColor = 'hsl(var(--primary))',
        textColor = 'hsl(var(--muted-foreground))',
        cardBackground = 'hsl(var(--card))',
        sectionBackground = 'hsl(var(--background))',
        enableSwipeOnMobile = false,
        features = [],
    } = effectiveProps;

    const scrollRef = useRef<HTMLDivElement>(null);

    // Get store state for card selection
    const {
        selectedComponentId,
        selectedCardIndex,
        setSelectedCardIndex,
        setSelectedComponentId,
        copyCard,
    } = useBuilderStore();

    // Check if this section is selected and which card
    const isThisSectionSelected = selectedComponentId === componentId;

    // Calculate grid gap based on columns
    const gridGap = columns >= 5 ? '16px' : columns >= 4 ? '24px' : '32px';

    const textAlignMap = {
        left: 'left' as const,
        center: 'center' as const,
        right: 'right' as const,
    };

    // Carousel navigation
    const scrollPrev = () => {
        if (scrollRef.current) {
            const cardWidth = scrollRef.current.querySelector('div')?.offsetWidth || 300;
            scrollRef.current.scrollBy({ left: -cardWidth - 16, behavior: 'smooth' });
        }
    };

    const scrollNext = () => {
        if (scrollRef.current) {
            const cardWidth = scrollRef.current.querySelector('div')?.offsetWidth || 300;
            scrollRef.current.scrollBy({ left: cardWidth + 16, behavior: 'smooth' });
        }
    };

    // Handle card click - select this card
    const handleCardClick = (e: React.MouseEvent, index: number, feature: FeatureItem) => {
        e.stopPropagation();
        // Select the section if not already selected
        if (selectedComponentId !== componentId) {
            setSelectedComponentId(componentId || null);
        }
        // Toggle card selection
        if (isThisSectionSelected && selectedCardIndex === index) {
            setSelectedCardIndex(null);  // Deselect if clicking same card
        } else {
            setSelectedCardIndex(index);
        }
    };

    // Render a single feature card using Card component
    const renderFeatureCard = (feature: FeatureItem, index: number) => {
        const bgColor = feature.cardBackground || cardBackground;
        const isCardSelected = isThisSectionSelected && selectedCardIndex === index;

        // Build props for Card component
        const cardProps = {
            icon: feature.icon,
            title: feature.title,
            description: feature.description,
            iconSize,
            iconColor,
            iconAlignment,
            textAlignment,
        };

        return (
            <div
                key={feature.id || index}
                className={cn(
                    "relative cursor-pointer rounded-lg transition-all duration-200",
                    isCardSelected && "ring-2 ring-blue-500 ring-offset-2"
                )}
                onClick={(e) => handleCardClick(e, index, feature)}
            >
                <CardRenderer
                    effectiveProps={cardProps}
                    combinedClassName="transition-all duration-300 hover:shadow-lg h-full w-full"
                    inlineStyles={{ backgroundColor: bgColor }}
                    children={null}
                    createEditableText={() => null}
                />
                {isCardSelected && (
                    <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
                        {index + 1}
                    </div>
                )}
            </div>
        );
    };

    return (
        <section
            className={cn('py-16 px-6 md:px-12', combinedClassName)}
            style={{
                ...inlineStyles,
                backgroundColor: sectionBackground,
            }}
        >
            {/* Header */}
            {(title || subtitle) && (
                <div
                    className="mb-12"
                    style={{
                        textAlign: textAlignMap[headerAlignment as keyof typeof textAlignMap] || 'center',
                    }}
                >
                    {title && (
                        <h2 className="text-3xl md:text-4xl font-bold mb-3">
                            {createEditableText(title, 'title', '')}
                        </h2>
                    )}
                    {subtitle && (
                        <p className="text-lg text-muted-foreground">
                            {createEditableText(subtitle, 'subtitle', '')}
                        </p>
                    )}
                </div>
            )}

            {/* Features Grid - using Card components */}
            <div className="fb-container">
                <div
                    ref={scrollRef}
                    className={cn(
                        "fb-grid grid",
                        enableSwipeOnMobile && "swipe-mode"
                    )}
                    data-cols={columns}
                    style={{
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        gap: gridGap,
                    }}
                >
                    {(features as FeatureItem[]).map(renderFeatureCard)}
                </div>

                {/* Carousel Navigation Arrows */}
                {enableSwipeOnMobile && features.length > 1 && (
                    <div className="fb-carousel-nav">
                        <button
                            type="button"
                            onClick={scrollPrev}
                            aria-label="Previous card"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={scrollNext}
                            aria-label="Next card"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Empty state for builder */}
            {(!features || features.length === 0) && (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>Add features using the properties panel</p>
                </div>
            )}
        </section>
    );
};
