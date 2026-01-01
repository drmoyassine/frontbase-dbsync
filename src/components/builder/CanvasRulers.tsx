import React from 'react';
import { useBuilderStore } from '@/stores/builder';

interface CanvasRulersProps {
    visible?: boolean;
}

export const CanvasRulers: React.FC<CanvasRulersProps> = ({ visible = true }) => {
    const { zoomLevel } = useBuilderStore();

    if (!visible) return null;

    const RULER_SIZE = 20; // pixels
    const MAJOR_TICK = 100; // every 100px
    const MINOR_TICK = 20; // every 20px
    const scaleFactor = zoomLevel / 100;

    // Generate tick marks
    const generateTicks = (length: number, isHorizontal: boolean) => {
        const ticks = [];
        for (let i = 0; i <= length; i += MINOR_TICK) {
            const isMajor = i % MAJOR_TICK === 0;
            const position = i * scaleFactor;

            ticks.push(
                <div
                    key={i}
                    className="absolute"
                    style={
                        isHorizontal
                            ? {
                                left: `${position}px`,
                                top: isMajor ? '0' : '10px',
                                width: '1px',
                                height: isMajor ? '20px' : '10px',
                                backgroundColor: 'currentColor'
                            }
                            : {
                                top: `${position}px`,
                                left: isMajor ? '0' : '10px',
                                width: isMajor ? '20px' : '10px',
                                height: '1px',
                                backgroundColor: 'currentColor'
                            }
                    }
                />
            );

            // Add labels for major ticks
            if (isMajor && i > 0) {
                ticks.push(
                    <div
                        key={`label-${i}`}
                        className="absolute text-xs text-muted-foreground"
                        style={
                            isHorizontal
                                ? {
                                    left: `${position + 2}px`,
                                    top: '2px'
                                }
                                : {
                                    top: `${position + 2}px`,
                                    left: '2px',
                                    writingMode: 'vertical-lr',
                                    textOrientation: 'mixed'
                                }
                        }
                    >
                        {i}
                    </div>
                );
            }
        }
        return ticks;
    };

    return (
        <>
            {/* Horizontal Ruler (Top) */}
            <div
                className="absolute top-0 left-0 right-0 bg-muted border-b border-border text-muted-foreground overflow-hidden"
                style={{ height: `${RULER_SIZE}px`, paddingLeft: `${RULER_SIZE}px` }}
            >
                <div className="relative h-full">
                    {generateTicks(2000, true)}
                </div>
            </div>

            {/* Vertical Ruler (Left) */}
            <div
                className="absolute top-0 left-0 bottom-0 bg-muted border-r border-border text-muted-foreground overflow-hidden"
                style={{ width: `${RULER_SIZE}px`, paddingTop: `${RULER_SIZE}px` }}
            >
                <div className="relative w-full">
                    {generateTicks(2000, false)}
                </div>
            </div>

            {/* Corner Square */}
            <div
                className="absolute top-0 left-0 bg-muted border-r border-b border-border"
                style={{ width: `${RULER_SIZE}px`, height: `${RULER_SIZE}px` }}
            />
        </>
    );
};
