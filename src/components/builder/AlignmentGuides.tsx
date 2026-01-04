import React, { useState, useEffect } from 'react';
import { useBuilderStore } from '@/stores/builder';

interface AlignmentGuide {
    type: 'vertical' | 'horizontal';
    position: number;
    color: 'primary' | 'secondary';
}

interface AlignmentGuidesProps {
    isDragging: boolean;
    draggedRect?: DOMRect | null;
}

export const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({ isDragging, draggedRect }) => {
    const [guides, setGuides] = useState<AlignmentGuide[]>([]);
    const { currentPageId, pages } = useBuilderStore();

    useEffect(() => {
        if (!isDragging || !draggedRect) {
            setGuides([]);
            return;
        }

        const currentPage = pages.find(p => p.id === currentPageId);
        if (!currentPage) return;

        // Get all component elements on canvas
        const canvasElements = document.querySelectorAll('[data-component-id]');
        const newGuides: AlignmentGuide[] = [];
        const SNAP_THRESHOLD = 5; // pixels

        canvasElements.forEach((el) => {
            const rect = el.getBoundingClientRect();

            // Skip if it's the dragged element
            if (el.getAttribute('data-dragging') === 'true') return;

            // Check vertical alignment (left, center, right)
            const leftDiff = Math.abs(draggedRect.left - rect.left);
            const centerXDiff = Math.abs(
                draggedRect.left + draggedRect.width / 2 - (rect.left + rect.width / 2)
            );
            const rightDiff = Math.abs(draggedRect.right - rect.right);

            if (leftDiff < SNAP_THRESHOLD) {
                newGuides.push({
                    type: 'vertical',
                    position: rect.left,
                    color: 'primary'
                });
            }
            if (centerXDiff < SNAP_THRESHOLD) {
                newGuides.push({
                    type: 'vertical',
                    position: rect.left + rect.width / 2,
                    color: 'secondary'
                });
            }
            if (rightDiff < SNAP_THRESHOLD) {
                newGuides.push({
                    type: 'vertical',
                    position: rect.right,
                    color: 'primary'
                });
            }

            // Check horizontal alignment (top, middle, bottom)
            const topDiff = Math.abs(draggedRect.top - rect.top);
            const centerYDiff = Math.abs(
                draggedRect.top + draggedRect.height / 2 - (rect.top + rect.height / 2)
            );
            const bottomDiff = Math.abs(draggedRect.bottom - rect.bottom);

            if (topDiff < SNAP_THRESHOLD) {
                newGuides.push({
                    type: 'horizontal',
                    position: rect.top,
                    color: 'primary'
                });
            }
            if (centerYDiff < SNAP_THRESHOLD) {
                newGuides.push({
                    type: 'horizontal',
                    position: rect.top + rect.height / 2,
                    color: 'secondary'
                });
            }
            if (bottomDiff < SNAP_THRESHOLD) {
                newGuides.push({
                    type: 'horizontal',
                    position: rect.bottom,
                    color: 'primary'
                });
            }
        });

        // Remove duplicates
        const uniqueGuides = newGuides.filter((guide, index, self) =>
            index === self.findIndex(g =>
                g.type === guide.type && Math.abs(g.position - guide.position) < 1
            )
        );

        setGuides(uniqueGuides);
    }, [isDragging, draggedRect, currentPageId, pages]);

    if (!isDragging || guides.length === 0) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-50">
            {guides.map((guide, index) => (
                <div
                    key={`${guide.type}-${guide.position}-${index}`}
                    className={`absolute ${guide.type === 'vertical' ? 'top-0 bottom-0 w-px' : 'left-0 right-0 h-px'
                        } ${guide.color === 'primary'
                            ? 'bg-primary border-primary'
                            : 'bg-blue-400 border-blue-400'
                        } border-dashed`}
                    style={
                        guide.type === 'vertical'
                            ? { left: `${guide.position}px` }
                            : { top: `${guide.position}px` }
                    }
                />
            ))}
        </div>
    );
};
