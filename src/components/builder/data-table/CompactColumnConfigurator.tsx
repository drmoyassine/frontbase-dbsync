import React, { useState, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';

interface Column {
    name: string;
    type: string;
    isPrimaryKey?: boolean;
}

interface ColumnConfiguratorProps {
    tableName: string;
    dataSourceId?: string;
    columnOverrides?: { [columnName: string]: any };
    columnOrder?: string[];
    onColumnOverridesChange: (overrides: { [columnName: string]: any }) => void;
    onColumnOrderChange: (order: string[]) => void;
}

interface DraggableColumnItemProps {
    column: Column;
    index: number;
    override: any;
    moveColumn: (dragIndex: number, hoverIndex: number) => void;
    updateColumnOverride: (columnName: string, updates: any) => void;
}

const DraggableColumnItem: React.FC<DraggableColumnItemProps> = ({
    column,
    index,
    override,
    moveColumn,
    updateColumnOverride
}) => {
    const [{ isDragging }, drag, preview] = useDrag({
        type: 'COLUMN',
        item: { index },
        collect: (monitor) => ({
            isDragging: monitor.isDragging()
        })
    });

    const [, drop] = useDrop({
        accept: 'COLUMN',
        hover: (item: { index: number }) => {
            if (item.index !== index) {
                moveColumn(item.index, index);
                item.index = index;
            }
        }
    });

    return (
        <div
            ref={(node) => preview(drop(node))}
            className={`flex items-center gap-2 p-2 border rounded bg-background ${isDragging ? 'opacity-50' : ''
                }`}
        >
            {/* Drag Handle */}
            <div ref={drag} className="cursor-move text-muted-foreground hover:text-foreground">
                <GripVertical className="w-4 h-4" />
            </div>

            {/* Visibility Toggle */}
            <Switch
                checked={override.visible !== false}
                onCheckedChange={(visible) => updateColumnOverride(column.name, { visible })}
                className="flex-shrink-0"
            />

            {/* Column Info */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{column.name}</span>
                    {column.isPrimaryKey && (
                        <Badge variant="outline" className="text-xs px-1 py-0">PK</Badge>
                    )}
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                        {column.type}
                    </Badge>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                    {/* Display Name */}
                    <Input
                        value={override.displayName || ''}
                        onChange={(e) => updateColumnOverride(column.name, { displayName: e.target.value })}
                        placeholder={column.name}
                        className="h-7 text-xs"
                    />

                    {/* Display Type */}
                    <Select
                        value={override.displayType || 'text'}
                        onValueChange={(displayType) => updateColumnOverride(column.name, { displayType })}
                    >
                        <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="badge">Badge</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="currency">Currency</SelectItem>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="image">Image</SelectItem>
                            <SelectItem value="link">Link</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
};

export const CompactColumnConfigurator: React.FC<ColumnConfiguratorProps> = ({
    tableName,
    dataSourceId,
    columnOverrides = {},
    columnOrder,
    onColumnOverridesChange,
    onColumnOrderChange
}) => {
    const { loadTableSchema } = useDataBindingStore();
    const [schema, setSchema] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [orderedColumns, setOrderedColumns] = useState<Column[]>([]);

    // Load schema
    useEffect(() => {
        if (tableName) {
            setLoading(true);
            loadTableSchema(tableName)
                .then((result) => {
                    setSchema(result);
                    setLoading(false);
                })
                .catch(() => {
                    setSchema(null);
                    setLoading(false);
                });
        }
    }, [tableName, loadTableSchema]);

    // Order columns based on columnOrder
    useEffect(() => {
        if (!schema?.columns) {
            setOrderedColumns([]);
            return;
        }

        const columns = schema.columns as Column[];

        if (columnOrder && columnOrder.length > 0) {
            // Order according to columnOrder
            const ordered: Column[] = [];
            const columnMap = new Map(columns.map(c => [c.name, c]));

            // Add columns in the specified order
            columnOrder.forEach(name => {
                const col = columnMap.get(name);
                if (col) {
                    ordered.push(col);
                    columnMap.delete(name);
                }
            });

            // Add any new columns that weren't in the order (at the end, hidden by default)
            columnMap.forEach((col) => {
                ordered.push(col);
                // Mark new columns as hidden by default
                if (columnOverrides[col.name]?.visible === undefined) {
                    updateColumnOverride(col.name, { visible: false });
                }
            });

            setOrderedColumns(ordered);
        } else {
            // No order specified, use schema order and mark all as visible
            setOrderedColumns(columns);
        }
    }, [schema, columnOrder]);

    const updateColumnOverride = (columnName: string, updates: any) => {
        const newOverrides = {
            ...columnOverrides,
            [columnName]: {
                ...columnOverrides[columnName],
                ...updates
            }
        };
        onColumnOverridesChange(newOverrides);
    };

    const moveColumn = (dragIndex: number, hoverIndex: number) => {
        const newOrder = [...orderedColumns];
        const [removed] = newOrder.splice(dragIndex, 1);
        newOrder.splice(hoverIndex, 0, removed);

        setOrderedColumns(newOrder);
        onColumnOrderChange(newOrder.map(c => c.name));
    };

    const toggleAllVisible = (visible: boolean) => {
        if (!schema) return;

        const newOverrides = { ...columnOverrides };
        schema.columns.forEach((column: Column) => {
            newOverrides[column.name] = {
                ...newOverrides[column.name],
                visible
            };
        });
        onColumnOverridesChange(newOverrides);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-4">
                <div className="text-sm text-muted-foreground">Loading columns...</div>
            </div>
        );
    }

    if (!schema) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                Select a table to configure columns
            </div>
        );
    }

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="space-y-3">
                {/* Quick Actions */}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAllVisible(true)}
                        className="h-7 text-xs"
                    >
                        <Eye className="w-3 h-3 mr-1" />
                        Show All
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAllVisible(false)}
                        className="h-7 text-xs"
                    >
                        <EyeOff className="w-3 h-3 mr-1" />
                        Hide All
                    </Button>
                </div>

                {/* Column List */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {orderedColumns.map((column, index) => {
                        const override = columnOverrides[column.name] || {};

                        return (
                            <DraggableColumnItem
                                key={column.name}
                                column={column}
                                index={index}
                                override={override}
                                moveColumn={moveColumn}
                                updateColumnOverride={updateColumnOverride}
                            />
                        );
                    })}
                </div>

                {orderedColumns.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        No columns found in the selected table
                    </div>
                )}
            </div>
        </DndProvider>
    );
};
