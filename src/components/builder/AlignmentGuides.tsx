import React, { useState, useEffect } from 'react';
import { useBuilderStore } from '@/stores/builder';
import type { ComponentRect } from '@/lib/builder/iframeTypes';

interface AlignmentGuide {
    type: 'vertical' | 'horizontal';
    position: number;
    color: 'primary' | 'secondary';
}

interface AlignmentGuidesProps {
    isDragging: boolean;
    draggedRect?: DOMRect | null;
    /**
     * Component rectangles measured from the iframe canvas (viewport-local).
     * When provided, alignment is computed against these — required for the
     * Phase D iframe canvas, whose component nodes live in the iframe document
     * and are unreachable via the parent document's querySelectorAll. When
     * omitted, falls back to querying the parent document (legacy behavior).
     */
    componentRects?: ComponentRect[];
}

export const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({
    isDragging,
    draggedRect,
    componentRects,
}) => {
    const [guides, setGuides] = useState<AlignmentGuide[]>([]);
    const { currentPageId, pages } = useBuilderStore();

    useEffect(() => {
        if (!isDragging || !draggedRect) {
            setGuides([]);
            return;
        }

        const currentPage = pages.find(p => p.id === currentPageId);
        if (!currentPage) return;

        const newGuides: AlignmentGuide[] = [];
        const SNAP_THRESHOLD = 5; // pixels

        // Build the candidate rect list: prefer the iframe component rects
        // (passed in), otherwise fall back to parent-document nodes.
        const candidates: Array<{ left: number; top: number; right: number; bottom: number; width: number; height: number }> = [];
        if (componentRects && componentRects.length > 0) {
            for (const r of componentRects) {
                candidates.push({
                    left: r.left,
                    top: r.top,
                    right: r.left + r.width,
                    bottom: r.top + r.height,
                    width: r.width,
                    height: r.height,
                });
            }
        } else {
            const canvasElements = document.querySelectorAll('[data-component-id]');
            canvasElements.forEach((el) => {
                if (el instanceof HTMLElement) {
                    const rect = el.getBoundingClientRect();
                    candidates.push({
                        left: rect.left,
                        top: rect.top,
                        right: rect.right,
                        bottom: rect.bottom,
                        width: rect.width,
                        height: rect.height,
                    });
                }
            });
        }

        for (const rect of candidates) {
            // Vertical alignment (left, center, right)
            const leftDiff = Math.abs(draggedRect.left - rect.left);
            const centerXDiff = Math.abs(
                draggedRect.left + draggedRect.width / 2 - (rect.left + rect.width / 2)
            );
            const rightDiff = Math.abs(draggedRect.right - rect.right);

            if (leftDiff < SNAP_THRESHOLD) {
                newGuides.push({ type: 'vertical', position: rect.left, color: 'primary' });
            }
            if (centerXDiff < SNAP_THRESHOLD) {
                newGuides.push({ type: 'vertical', position: rect.left + rect.width / 2, color: 'secondary' });
            }
            if (rightDiff < SNAP_THRESHOLD) {
                newGuides.push({ type: 'vertical', position: rect.right, color: 'primary' });
            }

            // Horizontal alignment (top, middle, bottom)
            const topDiff = Math.abs(draggedRect.top - rect.top);
            const centerYDiff = Math.abs(
                draggedRect.top + draggedRect.height / 2 - (rect.top + rect.height / 2)
            );
            const bottomDiff = Math.abs(draggedRect.bottom - rect.bottom);

            if (topDiff < SNAP_THRESHOLD) {
                newGuides.push({ type: 'horizontal', position: rect.top, color: 'primary' });
            }
            if (centerYDiff < SNAP_THRESHOLD) {
                newGuides.push({ type: 'horizontal', position: rect.top + rect.height / 2, color: 'secondary' });
            }
            if (bottomDiff < SNAP_THRESHOLD) {
                newGuides.push({ type: 'horizontal', position: rect.bottom, color: 'primary' });
            }
        }

        // Remove duplicates
        const uniqueGuides = newGuides.filter((guide, index, self) =>
            index === self.findIndex(g =>
                g.type === guide.type && Math.abs(g.position - guide.position) < 1
            )
        );

        setGuides(uniqueGuides);
    }, [isDragging, draggedRect, currentPageId, pages, componentRects]);

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
