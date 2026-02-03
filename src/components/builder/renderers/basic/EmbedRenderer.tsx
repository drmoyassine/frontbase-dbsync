import React from 'react';
import { RendererProps } from '../types';
import { Code, ExternalLink, AlertTriangle } from 'lucide-react';

export const EmbedRenderer: React.FC<RendererProps> = ({ effectiveProps, combinedClassName }) => {
    const embedType = effectiveProps.embedType || 'iframe';
    const width = effectiveProps.width || '100%';
    const height = effectiveProps.height || '400px';
    const src = effectiveProps.src || '';
    const title = effectiveProps.title || 'Embedded content';
    const html = effectiveProps.html || '';

    const containerStyle: React.CSSProperties = {
        width,
        height,
        minHeight: '100px',
    };

    // Iframe embed - show actual iframe or placeholder
    if (embedType === 'iframe') {
        if (src) {
            return (
                <div className={combinedClassName} style={containerStyle}>
                    <iframe
                        src={src}
                        title={title}
                        width="100%"
                        height="100%"
                        style={{ border: 'none', borderRadius: '8px' }}
                        loading="lazy"
                        sandbox={effectiveProps.sandbox || 'allow-scripts allow-same-origin allow-forms'}
                    />
                </div>
            );
        }

        // No URL - show placeholder
        return (
            <div
                className={`${combinedClassName} flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg bg-muted/20`}
                style={containerStyle}
            >
                <ExternalLink className="w-8 h-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Iframe Embed</span>
                <span className="text-xs text-muted-foreground/70 mt-1">Set URL in properties</span>
            </div>
        );
    }

    // Script embed - show code preview placeholder (can't execute in builder safely)
    return (
        <div
            className={`${combinedClassName} flex flex-col items-center justify-center border-2 border-dashed border-amber-500/30 rounded-lg bg-amber-50/10`}
            style={containerStyle}
        >
            <div className="flex items-center gap-2 mb-2">
                <Code className="w-6 h-6 text-amber-600" />
                <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <span className="text-sm text-muted-foreground">Script Embed</span>
            {html ? (
                <span className="text-xs text-muted-foreground/70 mt-1 max-w-[200px] truncate">
                    {html.substring(0, 50)}...
                </span>
            ) : (
                <span className="text-xs text-muted-foreground/70 mt-1">Add code in properties</span>
            )}
            <span className="text-xs text-amber-600 mt-2">Renders in preview only</span>
        </div>
    );
};
