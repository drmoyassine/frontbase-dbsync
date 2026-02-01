/**
 * Feature Section Renderer
 * 
 * Edge-sufficient component for displaying feature cards in a configurable grid.
 * Uses the Card component for each feature item (proper composition).
 * Supports drag-and-drop reordering of cards within and across sections.
 */

import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { CardRenderer } from '../basic/CardRenderer';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import * as LucideIcons from 'lucide-react';

interface FeatureItem {
    id: string;
    icon: string;           // Lucide icon name
    title: string;
    description: string;
    cardBackground?: string; // Override section-level
}

// Dropzone component - absolute positioned on left edge of card
const CardDropzone: React.FC<{
    sectionId: string;
    position: number;
    side: 'left' | 'right';
}> = ({ sectionId, position, side }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: `dropzone-${sectionId}-${position}-${side}`,
        data: {
            type: 'card-dropzone',
            sectionId,
            position,
        }
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "absolute top-0 bottom-0 w-3 z-20 transition-all duration-200",
                side === 'left' ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
                isOver
                    ? "bg-blue-500 opacity-100"
                    : "bg-blue-400/30 opacity-0 hover:opacity-100"
            )}
            style={{ borderRadius: '4px' }}
        />
    );
};

// Draggable card wrapper with integrated dropzones
const DraggableCard: React.FC<{
    feature: FeatureItem;
    index: number;
    sectionId: string;
    cardProps: any;
    bgColor: string;
    isSelected: boolean;
    isFirst: boolean;
    isLast: boolean;
    onClick: (e: React.MouseEvent) => void;
}> = ({ feature, index, sectionId, cardProps, bgColor, isSelected, isFirst, isLast, onClick }) => {
    const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
        id: `card-${sectionId}-${feature.id}`,
        data: {
            type: 'feature-card',
            sectionId,
            cardIndex: index,
            card: feature,
        }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "relative cursor-pointer rounded-lg transition-all duration-200 group",
                isSelected && "ring-2 ring-blue-500 ring-offset-2",
                isDragging && "opacity-50 scale-95"
            )}
            onClick={onClick}
        >
            {/* Left dropzone */}
            <CardDropzone sectionId={sectionId} position={index} side="left" />

            {/* Right dropzone (only on last card) */}
            {isLast && (
                <CardDropzone sectionId={sectionId} position={index + 1} side="right" />
            )}

            {/* Drag handle */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-2 left-2 z-30 p-1 rounded bg-white/80 dark:bg-gray-800/80 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shadow-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <GripVertical className="w-4 h-4 text-gray-500" />
            </div>

            <CardRenderer
                effectiveProps={cardProps}
                combinedClassName="transition-all duration-300 hover:shadow-lg h-full w-full"
                inlineStyles={{ backgroundColor: bgColor }}
                children={null}
                createEditableText={() => null}
            />

            {isSelected && (
                <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded z-10">
                    {index + 1}
                </div>
            )}
        </div>
    );
};

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
    const handleCardClick = (e: React.MouseEvent, index: number) => {
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

    // Render cards with dropzones
    const renderCardsWithDropzones = () => {
        const items: React.ReactNode[] = [];
        const featureList = features as FeatureItem[];

        featureList.forEach((feature, index) => {
            const bgColor = feature.cardBackground || cardBackground;
            const isCardSelected = isThisSectionSelected && selectedCardIndex === index;

            const cardProps = {
                icon: feature.icon,
                title: feature.title,
                description: feature.description,
                iconSize,
                iconColor,
                iconAlignment,
                textAlignment,
            };

            items.push(
                <DraggableCard
                    key={feature.id || `card-${index}`}
                    feature={feature}
                    index={index}
                    sectionId={componentId || ''}
                    cardProps={cardProps}
                    bgColor={bgColor}
                    isSelected={isCardSelected}
                    isFirst={index === 0}
                    isLast={index === featureList.length - 1}
                    onClick={(e) => handleCardClick(e, index)}
                />
            );
        });

        return items;
    };

    // Droppable area for the entire section
    const { setNodeRef: setSectionDropRef, isOver: isSectionOver } = useDroppable({
        id: `section-drop-${componentId}`,
        data: {
            type: 'feature-section',
            sectionId: componentId,
        }
    });

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
                    ref={(el) => {
                        scrollRef.current = el;
                        setSectionDropRef(el);
                    }}
                    className={cn(
                        "fb-grid grid transition-all",
                        enableSwipeOnMobile && "swipe-mode",
                        isSectionOver && "ring-2 ring-blue-400 ring-dashed rounded-lg"
                    )}
                    data-cols={columns}
                    style={{
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        gap: gridGap,
                    }}
                >
                    {renderCardsWithDropzones()}
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
                <div
                    ref={setSectionDropRef}
                    className={cn(
                        "text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg transition-colors",
                        isSectionOver && "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    )}
                >
                    <p>Add features using the properties panel or drag a card here</p>
                </div>
            )}
        </section>
    );
};
