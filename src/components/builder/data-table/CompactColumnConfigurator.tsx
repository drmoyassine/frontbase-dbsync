import React, { useState, useEffect } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GripVertical, Eye, EyeOff, Pencil, ChevronRight, ChevronDown } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';

interface Column {
    name: string;
    type: string;
    isPrimaryKey?: boolean;
    foreignKey?: {
        table: string;
        column: string;
    };
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
    isExpanded?: boolean;
    onToggleExpand?: (columnName: string) => void;
}

const DraggableColumnItem: React.FC<DraggableColumnItemProps> = ({
    column,
    index,
    override,
    moveColumn,
    updateColumnOverride,
    isExpanded = false,
    onToggleExpand
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
            className={`flex items-center gap-2 p-1.5 border-b last:border-0 bg-background hover:bg-muted/30 transition-colors ${isDragging ? 'opacity-50' : ''
                }`}
        >
            {/* Expand/Collapse Button for FK columns */}
            {column.foreignKey ? (
                <button
                    onClick={() => onToggleExpand?.(column.name)}
                    className="p-1 hover:bg-muted rounded transition-colors"
                    title={isExpanded ? `Collapse ${column.foreignKey.table}` : `Expand ${column.foreignKey.table}`}
                >
                    {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                </button>
            ) : (
                <div className="w-5" /> {/* Spacer for non-FK columns */}
            )}

            {/* Drag Handle */}
            <div ref={drag} className="cursor-move text-muted-foreground hover:text-foreground p-1">
                <GripVertical className="w-3.5 h-3.5" />
            </div>

            {/* Column Name & Edit Trigger */}
            <Popover>
                <PopoverTrigger asChild>
                    <div className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer group">
                        <span className="font-medium text-sm truncate select-none">
                            {override.displayName || column.name}
                        </span>
                        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        {column.isPrimaryKey && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">PK</Badge>
                        )}
                        {column.foreignKey && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">FK</Badge>
                        )}
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">Column Settings</h4>
                            <p className="text-sm text-muted-foreground">
                                Configure how {column.name} appears in the table.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor="display-name">Label</Label>
                                <Input
                                    id="display-name"
                                    value={override.displayName || ''}
                                    onChange={(e) => updateColumnOverride(column.name, { displayName: e.target.value })}
                                    placeholder={column.name}
                                    className="col-span-2 h-8"
                                />
                            </div>
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor="display-type">Type</Label>
                                <Select
                                    value={override.displayType || 'text'}
                                    onValueChange={(displayType) => updateColumnOverride(column.name, { displayType })}
                                >
                                    <SelectTrigger id="display-type" className="col-span-2 h-8">
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
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label>Original Type</Label>
                                <div className="col-span-2">
                                    <Badge variant="secondary" className="text-xs font-normal">
                                        {column.type}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Visibility Toggle */}
            <Switch
                checked={override.visible !== false}
                onCheckedChange={(visible) => updateColumnOverride(column.name, { visible })}
                className="scale-75 origin-right"
            />
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
    const [expandedFKs, setExpandedFKs] = useState<Set<string>>(new Set());
    const [relatedSchemas, setRelatedSchemas] = useState<Map<string, any>>(new Map());

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

    const toggleFKExpansion = async (columnName: string) => {
        const newExpanded = new Set(expandedFKs);

        if (newExpanded.has(columnName)) {
            newExpanded.delete(columnName);
        } else {
            newExpanded.add(columnName);

            // Fetch related table schema if not already loaded
            const column = orderedColumns.find(c => c.name === columnName);
            if (column?.foreignKey && !relatedSchemas.has(column.foreignKey.table)) {
                try {
                    const relatedSchema = await loadTableSchema(column.foreignKey.table);
                    if (relatedSchema) {
                        setRelatedSchemas(prev => new Map(prev).set(column.foreignKey!.table, relatedSchema));
                    }
                } catch (error) {
                    console.error('Failed to load related schema:', error);
                }
            }
        }

        setExpandedFKs(newExpanded);
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
            <div className="space-y-2">
                {/* Quick Actions */}
                <div className="flex justify-between items-center px-1">
                    <Label className="text-xs font-medium text-muted-foreground">
                        {orderedColumns.length} Columns
                    </Label>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleAllVisible(true)}
                            className="h-6 w-6"
                            title="Show All"
                        >
                            <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleAllVisible(false)}
                            className="h-6 w-6"
                            title="Hide All"
                        >
                            <EyeOff className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Column List */}
                <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto bg-card">
                    {orderedColumns.map((column, index) => {
                        const override = columnOverrides[column.name] || {};
                        const isExpanded = expandedFKs.has(column.name);
                        const relatedSchema = column.foreignKey ? relatedSchemas.get(column.foreignKey.table) : null;

                        return (
                            <React.Fragment key={column.name}>
                                <DraggableColumnItem
                                    column={column}
                                    index={index}
                                    override={override}
                                    moveColumn={moveColumn}
                                    updateColumnOverride={updateColumnOverride}
                                    isExpanded={isExpanded}
                                    onToggleExpand={toggleFKExpansion}
                                />

                                {/* Render related columns when expanded */}
                                {isExpanded && relatedSchema && column.foreignKey && (
                                    <div className="bg-muted/30 pl-12">
                                        {relatedSchema.columns.map((relatedCol: any) => {
                                            const relatedKey = `${column.foreignKey!.table}.${relatedCol.name}`;
                                            const relatedOverride = columnOverrides[relatedKey] || {};

                                            return (
                                                <div
                                                    key={relatedKey}
                                                    className="flex items-center gap-2 p-1.5 border-b last:border-0 hover:bg-muted/50 transition-colors"
                                                >
                                                    <div className="w-5" /> {/* Spacer */}
                                                    <span className="flex-1 text-sm text-muted-foreground">
                                                        {relatedCol.name}
                                                    </span>
                                                    <Switch
                                                        checked={relatedOverride.visible !== false}
                                                        onCheckedChange={(visible) => updateColumnOverride(relatedKey, { visible })}
                                                        className="scale-75 origin-right"
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </React.Fragment>
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

