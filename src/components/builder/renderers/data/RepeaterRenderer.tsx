import React from 'react';
import { useGridQuery } from '@frontbase/grid';
import { cn } from '@/lib/utils';
import { RendererProps } from '../types';
import { useResolvedBinding } from './useResolvedBinding';
import { RecordContextProvider } from '../../context/RecordContext';
import { ComponentRenderer } from '../../ComponentRenderer';
import { useBuilderStore } from '@/stores/builder';

/**
 * Read-only recursive render of a component subtree. Used to repeat the
 * Repeater template per row in preview WITHOUT duplicating dnd-kit sortable ids
 * (the editable template is rendered once via DraggableComponent in edit mode;
 * preview repetitions use this path, which goes straight through ComponentRenderer).
 */
function renderReadonlySubtree(node: any, key?: React.Key): React.ReactNode {
    if (!node) return null;
    const childNodes = (node.children ?? []).map((c: any, i: number) =>
        renderReadonlySubtree(c, c.id || `${String(key)}-${i}`),
    );
    return (
        <ComponentRenderer key={key} component={node} isSelected={false}>
            {childNodes}
        </ComponentRenderer>
    );
}

function gridLayoutClass(columns: number): string {
    const cols = Math.min(Math.max(columns || 3, 1), 4);
    if (cols === 1) return 'grid grid-cols-1 gap-4';
    if (cols === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-4';
    if (cols === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
}

/**
 * Repeater — renders a user-designed child template once per data row.
 *
 * Edit mode: renders the editable template ONCE (the design surface) inside a
 * RecordContext carrying the first row, so `{{record.*}}` resolves while
 * designing. Preview mode: repeats the template per row (read-only).
 */
export const RepeaterRenderer: React.FC<RendererProps> = ({
    effectiveProps,
    combinedClassName,
    inlineStyles,
    children,
    componentId,
    onConfigureBinding,
    rawChildren,
}) => {
    const binding: any = useResolvedBinding(componentId, effectiveProps.binding);
    const { isPreviewMode } = useBuilderStore();
    const layout: 'grid' | 'list' = effectiveProps.layout === 'list' ? 'list' : 'grid';
    const columns = effectiveProps.columns || 3;

    const fallbackBinding = {
        componentId: componentId || '',
        dataSourceId: '',
        tableName: '',
        pagination: { enabled: false, pageSize: 6, page: 0 },
        sorting: { enabled: false },
        filtering: { searchEnabled: false, filters: {} },
        columnOverrides: {},
    };

    const { data, isLoading } = useGridQuery({
        mode: 'builder',
        binding: binding || fallbackBinding,
        enabled: !!binding?.tableName,
    });

    const rows: any[] = data || [];
    const containerClass = cn(
        layout === 'list' ? 'flex flex-col' : gridLayoutClass(columns),
        combinedClassName,
    );
    const containerStyle: React.CSSProperties = {
        ...inlineStyles,
        ...(effectiveProps.gap != null ? { gap: `${effectiveProps.gap}px` } : { gap: 16 }),
    };

    // Unconfigured: render the editable template once + a configure affordance.
    if (!binding?.tableName) {
        return (
            <div className={containerClass} style={containerStyle}>
                {children}
                <div className="col-span-full text-center py-3 text-xs text-muted-foreground bg-muted/30 rounded-md border border-dashed">
                    Repeater — pick a data source to repeat this template per row.
                    {onConfigureBinding && (
                        <button onClick={onConfigureBinding} className="ml-2 underline font-medium">
                            Configure data
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Edit mode: design surface — render the editable template once, using the
    // first row as the record sample so {{record.*}} resolves while designing.
    if (!isPreviewMode) {
        const sampleRow = rows[0] || {};
        const hintText = isLoading
            ? 'Loading rows…'
            : rows.length === 0
                ? 'No rows yet — design your template here; it repeats per row.'
                : `Repeater — this template repeats for each of ${rows.length} row${rows.length === 1 ? '' : 's'}. Switch to Preview to see all.`;
        return (
            <div className={containerClass} style={containerStyle}>
                <RecordContextProvider value={sampleRow}>{children}</RecordContextProvider>
                <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md border border-dashed px-3 py-2">
                    <span>🔁</span>
                    <span>{hintText}</span>
                </div>
            </div>
        );
    }

    // Preview mode: repeat the template per row (read-only, capped).
    const capped = rows.slice(0, 12);
    if (capped.length === 0) {
        return (
            <div className={cn('text-center text-sm text-muted-foreground py-6', combinedClassName)} style={inlineStyles}>
                No data available
            </div>
        );
    }
    return (
        <div className={containerClass} style={inlineStyles}>
            {capped.map((row: any, i: number) => (
                <RecordContextProvider key={i} value={row}>
                    {rawChildren && rawChildren.length > 0
                        ? rawChildren.map((node: any, j: number) =>
                              renderReadonlySubtree(node, `${i}-${node.id || j}`),
                          )
                        : children}
                </RecordContextProvider>
            ))}
        </div>
    );
};
