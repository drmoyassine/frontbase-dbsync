import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasourcesApi, viewsApi } from '../api';
import { X, Loader2, AlertCircle, Filter, Plus, Trash2, CheckCircle, Table, Copy, RefreshCw, Database, Link as LinkIcon, Save, EyeOff, ChevronDown, Columns, Search, Activity, Zap, Settings, ChevronRight, Globe, Info, Pin, GripHorizontal, RotateCcw, Pencil } from 'lucide-react';
import { RecordEditor } from './RecordEditor';
import { useLayoutStore } from '../store/useLayoutStore';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DataPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    datasourceId: string | number;
    table: string;
    datasourceName: string;
    onViewSaved?: (view: any) => void;
    initialFilters?: { field: string; operator: string; value: string }[];
    viewId?: string;
    initialViewName?: string;
    initialVisibleColumns?: string[];
    initialPinnedColumns?: string[];
    initialColumnOrder?: string[];
    initialFieldMappings?: Record<string, string>;
    initialLinkedViews?: Record<string, any>;
    initialWebhooks?: any[];
}

const SortableTableHeader = ({
    columnKey,
    columnMatches,
    isPinned,
    isActiveMatch,
    leftOffset,
    onHide,
    onPinToggle
}: {
    columnKey: string;
    columnMatches: boolean;
    isPinned: boolean;
    isActiveMatch: boolean;
    leftOffset?: number;
    onHide: (e: React.MouseEvent) => void;
    onPinToggle: (e: React.MouseEvent) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: columnKey });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 50 : (isPinned ? 30 : 'auto'),
        opacity: isDragging ? 0.8 : 1,
        ...(isPinned ? { left: leftOffset, minWidth: '150px', maxWidth: '150px' } : {})
    };

    return (
        <th
            ref={setNodeRef}
            data-column-key={columnKey}
            className={`group/th px-4 py-3 text-[10px] font-bold uppercase border-b border-gray-100 whitespace-nowrap transition-all ${isActiveMatch ? 'bg-yellow-100 dark:bg-yellow-900/30' : columnMatches ? 'text-primary-600 bg-primary-50/30' : 'text-gray-400'} ${isPinned ? 'sticky z-30 bg-gray-50 dark:bg-gray-900 border-r border-gray-100/50 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]' : ''}`}
            style={style}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 truncate">
                    <button
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                        <GripHorizontal size={10} className="text-gray-400" />
                    </button>
                    <button
                        onClick={onPinToggle}
                        className={`p-0.5 rounded transition-colors ${isPinned ? 'text-orange-500 hover:bg-orange-100' : 'text-gray-300 hover:bg-gray-200 opacity-0 group-hover/th:opacity-100'}`}
                        title={isPinned ? "Unpin Column" : "Pin Column"}
                    >
                        <Pin size={10} className={isPinned ? 'fill-current' : ''} />
                    </button>
                    <span className="truncate">{columnKey}</span>
                </div>
                <button
                    onClick={onHide}
                    className="opacity-0 group-hover/th:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all transition-opacity"
                    title="Hide Column"
                >
                    <EyeOff size={10} />
                </button>
            </div>
        </th>
    );
};

const HighlightMatches: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    if (!query.trim()) return <>{text}</>;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark key={i} className="bg-yellow-200 dark:bg-yellow-600/30 dark:text-yellow-200 rounded-sm px-0.5 font-bold">
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    );
};

const DataPreviewModal: React.FC<DataPreviewModalProps> = ({
    isOpen,
    onClose,
    datasourceId,
    table,
    datasourceName,
    onViewSaved,
    initialFilters,
    viewId,
    initialFieldMappings,
    initialLinkedViews,
    initialViewName,
    initialVisibleColumns,
    initialPinnedColumns,
    initialColumnOrder,
    initialWebhooks
}) => {
    const queryClient = useQueryClient();

    // State
    const [filters, setFilters] = React.useState<{ field: string; operator: string; value: string }[]>([]);
    const [appliedFilters, setAppliedFilters] = React.useState<{ field: string; operator: string; value: string }[]>([]);
    const [viewName, setViewName] = React.useState(initialViewName || '');
    const [currentViewId, setCurrentViewId] = React.useState<string | undefined>(viewId);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = React.useState(false);
    const [columnSearch, setColumnSearch] = React.useState('');
    const [showSaveForm, setShowSaveForm] = React.useState(false);
    const [showSyncConfirm, setShowSyncConfirm] = React.useState(false);
    const [saveSuccess, setSaveSuccess] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'table' | 'record' | 'linked' | 'api' | 'webhooks'>('table');
    const [globalSearch, setGlobalSearch] = React.useState('');
    const [isRenamingView, setIsRenamingView] = React.useState(false);
    const [globalSearchStatus, setGlobalSearchStatus] = React.useState<'idle' | 'searching_datasource' | 'searching_all'>('idle');
    const [globalResults, setGlobalResults] = React.useState<{ datasource_name: string; table: string; count: number }[]>([]);
    const [isSessionLoading, setIsSessionLoading] = React.useState(false);
    const [copySuccess, setCopySuccess] = React.useState(false);
    const [selectedTable, setSelectedTable] = React.useState(table);
    const [tableSearch, setTableSearch] = React.useState('');
    const [editingRecord, setEditingRecord] = React.useState<any | null>(null);
    const [fieldMappings, setFieldMappings] = React.useState<Record<string, string>>(initialFieldMappings || {});
    const [linkedViews, setLinkedViews] = React.useState<Record<string, any>>(initialLinkedViews || {});
    const [webhooks, setWebhooks] = React.useState<any[]>([]);
    const [currentStep, setCurrentStep] = React.useState<'tables' | 'records'>('tables');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
    const [isWebhookModalOpen, setIsWebhookModalOpen] = React.useState(false);
    const [editingWebhookIndex, setEditingWebhookIndex] = React.useState<number | null>(null);
    const [webhookForm, setWebhookForm] = React.useState({
        name: '',
        url: '',
        events: ['insert', 'update', 'delete'] as string[],
        enabled: true,
        method: 'POST' as 'POST' | 'PUT' | 'PATCH'
    });

    const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
    const [allMatches, setAllMatches] = React.useState<{ colKey: string; rowIndex: number }[]>([]);

    const {
        pinnedColumns,
        columnOrder,
        visibleColumns,
        setColumnOrder,
        setVisibleColumns,
        togglePin,
        toggleVisibility,
        initialize: initializeLayout,
        setActiveContext,
        clearTableCache
    } = useLayoutStore();

    // Force re-render periodically to update relative timestamps
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 30000); // 30s
        return () => clearInterval(interval);
    }, []);

    // Queries
    const { data: tables } = useQuery({
        queryKey: ['datasourceTables', datasourceId],
        queryFn: () => datasourcesApi.getTables(datasourceId).then(r => r.data),
        enabled: isOpen && !!datasourceId,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const { data: schemaData } = useQuery({
        queryKey: ['tableSchema', datasourceId, selectedTable],
        queryFn: () => datasourcesApi.getTableSchema(datasourceId, selectedTable).then(r => r.data),
        enabled: isOpen && !!datasourceId && !!selectedTable,
        staleTime: 1000 * 60 * 60, // 1 hour for schema
    });

    const { data, isLoading, error, refetch: refetchData, isFetching: isFetchingData } = useQuery({
        queryKey: ['tableData', datasourceId, selectedTable, appliedFilters],
        queryFn: () => datasourcesApi.getTablesData(datasourceId, selectedTable, 100, appliedFilters).then(r => r.data),
        enabled: isOpen && !!datasourceId && !!selectedTable,
        staleTime: 1000 * 60 * 10, // 10 minutes cache for data by default
    });

    // Memos
    const availableFields = React.useMemo(() => {
        const fieldsSet = new Set<string>();
        filters.forEach(f => { if (f.field) fieldsSet.add(f.field); });
        if (schemaData?.columns) schemaData.columns.forEach(col => fieldsSet.add(col.name));
        if (data?.records?.[0]) Object.keys(data.records[0]).forEach(key => fieldsSet.add(key));
        return Array.from(fieldsSet).sort();
    }, [schemaData, data, filters]);

    const tableColumns = React.useMemo(() => {
        let fields = [...availableFields];

        // 1. Order by columnOrder
        if (columnOrder && columnOrder.length > 0) {
            const ordered = columnOrder.filter(f => fields.includes(f));
            const remaining = fields.filter(f => !columnOrder.includes(f));
            fields = [...ordered, ...remaining];
        }

        // 2. Move pinnedColumns to front (Stack at the left/top)
        if (pinnedColumns && pinnedColumns.length > 0) {
            const pinned = fields.filter(f => pinnedColumns.includes(f));
            const unpinned = fields.filter(f => !pinnedColumns.includes(f));
            fields = [...pinned, ...unpinned];
        }

        // 3. Filter by visibility (BUT reveal hidden matches if searching)
        if (visibleColumns.length > 0) {
            fields = fields.filter(f => {
                const isVisible = visibleColumns.includes(f);
                if (isVisible) return true;

                // If hidden, only reveal if it contains a search match
                if (globalSearch.trim() && data?.records) {
                    const searchLower = globalSearch.toLowerCase();
                    return data.records.some(record => {
                        const val = record[f];
                        const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                        return strVal.toLowerCase().includes(searchLower);
                    });
                }
                return false;
            });
        }

        return fields;
    }, [availableFields, columnOrder, pinnedColumns, visibleColumns, globalSearch, data]);



    const filteredRecords = React.useMemo(() => {
        if (!data?.records) return [];

        // 1. Apply column filters
        let results = data.records;
        if (filters.length > 0) {
            results = results.filter(record => {
                return filters.every(f => {
                    if (!f.field || f.value === '') return true;
                    const val = record[f.field];
                    const recordVal = String(val ?? '').toLowerCase();
                    const filterVal = f.value.toLowerCase();
                    switch (f.operator) {
                        case '==': return recordVal === filterVal;
                        case '!=': return recordVal !== filterVal;
                        case '>': return Number(val) > Number(f.value);
                        case '<': return Number(val) < Number(f.value);
                        case 'contains': return recordVal.includes(filterVal);
                        default: return true;
                    }
                });
            });
        }

        // 2. Apply global full-text search
        if (globalSearch.trim()) {
            const searchLower = globalSearch.toLowerCase();
            results = results.filter(record => {
                return Object.values(record).some(val => {
                    // Handle nested objects by stringifying them
                    const stringVal = typeof val === 'object' && val !== null
                        ? JSON.stringify(val)
                        : String(val ?? '');
                    return stringVal.toLowerCase().includes(searchLower);
                });
            });
        }

        return results;
    }, [data, filters, globalSearch]);

    // Calculate all matches for navigation
    React.useEffect(() => {
        if (!globalSearch || !data?.records) {
            setAllMatches([]);
            setCurrentMatchIndex(0);
            return;
        }

        const matches: { colKey: string; rowIndex: number }[] = [];
        const searchLower = globalSearch.toLowerCase();

        filteredRecords.forEach((record, rowIndex) => {
            // Check all available fields to ensure we don't miss anything that was hidden but matches
            availableFields.forEach(colKey => {
                const val = record[colKey];
                const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                if (strVal.toLowerCase().includes(searchLower)) {
                    matches.push({ colKey, rowIndex });
                }
            });
        });
        setAllMatches(matches);
        setCurrentMatchIndex(0); // Reset index on new search
    }, [globalSearch, filteredRecords, availableFields]);


    // Set Active Context for Layout Store
    React.useEffect(() => {
        if (isOpen && datasourceId && selectedTable) {
            setActiveContext(datasourceId, selectedTable);
        }
    }, [isOpen, datasourceId, selectedTable, setActiveContext]);

    const handleNextMatch = () => {
        if (allMatches.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % allMatches.length;
        setCurrentMatchIndex(nextIndex);
        const match = allMatches[nextIndex];

        // Synchronize Record View if active
        if (activeTab === 'record') {
            const recordAtMatch = filteredRecords[match.rowIndex];
            if (recordAtMatch) setEditingRecord(recordAtMatch);
        }

        scrollToColumn(match.colKey);
    };

    const handlePrevMatch = () => {
        if (allMatches.length === 0) return;
        const prevIndex = (currentMatchIndex-1 + allMatches.length) % allMatches.length;
        setCurrentMatchIndex(prevIndex);
        const match = allMatches[prevIndex];

        // Synchronize Record View if active
        if (activeTab === 'record') {
            const recordAtMatch = filteredRecords[match.rowIndex];
            if (recordAtMatch) setEditingRecord(recordAtMatch);
        }

        scrollToColumn(match.colKey);
    };

    // Dnd sensors
    const headerSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Handlers
    const handleTableHeaderDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = tableColumns.indexOf(active.id as string);
            const newIndex = tableColumns.indexOf(over.id as string);
            const newOrder = arrayMove(tableColumns, oldIndex, newIndex) as string[];
            setColumnOrder(newOrder);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const scrollToColumn = (columnKey: string) => {
        const tableContainer = document.querySelector('.table-container');
        const th = document.querySelector(`th[data-column-key= "${columnKey}"]`);
        if (tableContainer && th) {
            const thRect = th.getBoundingClientRect();
            const containerRect = tableContainer.getBoundingClientRect();

            // Calculate scroll position, accounting for the Action column which is sticky (w-16 = 64px)
            // and any pinned columns.
            const isPinned = pinnedColumns.includes(columnKey);
            if (!isPinned) {
                const scrollLeft = tableContainer.scrollLeft + (thRect.left-containerRect.left)-64-(pinnedColumns.length * 150);
                tableContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    };

    const addFilter = () => setFilters([...filters, { field: '', operator: '==', value: '' }]);
    const removeFilter = (index: number) => setFilters(filters.filter((_, i) => i !== index));
    const updateFilter = (index: number, f_key: 'field' | 'operator' | 'value', value: string) => {
        const newFilters = [...filters];
        newFilters[index] = { ...newFilters[index], [f_key]: value };
        setFilters(newFilters);
    };

    const runRemoteSearch = () => {
        const finalFilters = [...filters];
        if (globalSearch.trim()) {
            finalFilters.push({ field: 'search', operator: 'contains', value: globalSearch });
            setGlobalSearch('');
            setFilters(finalFilters);
        }
        setAppliedFilters(finalFilters);
    };

    const searchOtherCollections = async () => {
        if (!globalSearch.trim()) return;
        setGlobalSearchStatus('searching_datasource');
        try {
            const response = await datasourcesApi.searchDatasource(datasourceId, globalSearch);
            setGlobalResults(response.data);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setGlobalSearchStatus('idle');
        }
    };

    const searchAllDatasources = async () => {
        if (!globalSearch.trim()) return;
        setGlobalSearchStatus('searching_all');
        try {
            const response = await datasourcesApi.searchAll(globalSearch);
            setGlobalResults(response.data);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setGlobalSearchStatus('idle');
        }
    };

    const handleSaveView = async () => {
        if (!viewName || !selectedTable) return;
        setIsSaving(true);
        try {
            const payload = {
                name: viewName,
                target_table: selectedTable,
                filters: filters,
                field_mappings: fieldMappings,
                linked_views: linkedViews,
                visible_columns: visibleColumns,
                pinned_columns: pinnedColumns,
                column_order: columnOrder,
                webhooks: webhooks
            };

            let response;
            if (currentViewId) {
                response = await viewsApi.update(currentViewId, payload);
            } else {
                response = await viewsApi.create(datasourceId, payload);
            }

            setShowSaveForm(false);
            setIsRenamingView(false);
            setCurrentStep('records');
            setAppliedFilters([...filters]); // Sync server-side query state with saved filters

            if (response.data.id) {
                setCurrentViewId(response.data.id);
            }
            setSaveSuccess(true);
            onViewSaved?.(response.data);
            setTimeout(() => setSaveSuccess(false), 5000);

            // Clear session after saving
            await datasourcesApi.clearSession(datasourceId, selectedTable);
        } catch (err) {
            console.error('Error saving view:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualUpdate = async () => {
        if (!datasourceId || !selectedTable) return;

        try {
            setIsSessionLoading(true); // Indicate loading while resetting

            // 1. Clear Server Session & Cache
            await datasourcesApi.clearSession(datasourceId, selectedTable);
            clearTableCache(datasourceId, selectedTable);

            // 2. Clear current query data to force absolute fresh state
            queryClient.removeQueries({ queryKey: ['tableData', datasourceId, selectedTable] });
            queryClient.removeQueries({ queryKey: ['tableSchema', datasourceId, selectedTable] });

            // 3. Re-run initialization logic manually to load initial props
            setFilters(initialFilters || []);
            setAppliedFilters(initialFilters || []);
            setFieldMappings(initialFieldMappings || {});
            setLinkedViews(initialLinkedViews || {});
            setWebhooks(initialWebhooks || []);

            initializeLayout({
                pinnedColumns: (initialPinnedColumns as string[]) || [],
                columnOrder: (initialColumnOrder as string[]) || [],
                visibleColumns: initialVisibleColumns || [],
            });

            // 4. Perform refetch immediately
            await Promise.all([
                refetchData(),
                queryClient.invalidateQueries({ queryKey: ['tableSchema', datasourceId, selectedTable] })
            ]);

            setViewName(initialViewName || '');
            if (viewId) {
                setCurrentViewId(viewId);
                setCurrentStep('records');
                setIsSidebarCollapsed(true);
            } else if (table) {
                setCurrentViewId(undefined);
                setCurrentStep('records');
                setIsSidebarCollapsed(false);
            } else {
                setCurrentViewId(undefined);
                setCurrentStep('tables');
                setIsSidebarCollapsed(false);
            }
            setActiveTab('table'); // Reset to table view
            setIsSessionLoading(false);
        } catch (err) {
            console.error("Manual update failed:", err);
            setIsSessionLoading(false);
        }
    };

    // Mutations
    const refreshSchemaMutation = useMutation({
        mutationFn: () => datasourcesApi.refreshTableSchema(datasourceId, selectedTable),
        onSuccess: (data) => {
            queryClient.setQueryData(['tableSchema', datasourceId, selectedTable], data.data);
        },
    });

    // Effects
    const lastProcessedConfig = React.useRef<string>("");

    React.useEffect(() => {
        if (!isOpen) {
            lastProcessedConfig.current = "";
            return;
        }

        // Deep equality check for core configuration to prevent redundant state resets & query invalidations
        const currentPropsKey = JSON.stringify({ datasourceId, table, viewId, initialFilters });
        if (currentPropsKey === lastProcessedConfig.current) return;

        const loadInitialData = async () => {
            // 1. Set basic state
            setWebhooks(initialWebhooks || []);
            setActiveTab('table');
            setSelectedTable(table);
            if (initialViewName) setViewName(initialViewName);

            // 2. Check for Redis Session first
            setIsSessionLoading(true);
            try {
                const { data: sessionData } = await datasourcesApi.getSession(datasourceId, table);
                if (sessionData && Object.keys(sessionData).length > 0) {
                    const nextFilters = sessionData.filters || [];
                    if (JSON.stringify(appliedFilters) !== JSON.stringify(nextFilters)) {
                        setFilters(nextFilters);
                        setAppliedFilters(nextFilters);
                    }

                    setFieldMappings(sessionData.fieldMappings || {});

                    initializeLayout({
                        pinnedColumns: sessionData.pinnedColumns,
                        columnOrder: sessionData.columnOrder,
                        visibleColumns: sessionData.visibleColumns,
                    });

                    // Determine initial step based on session data or initial props
                    if (viewId) {
                        setCurrentViewId(viewId);
                        setCurrentStep('records');
                        setIsSidebarCollapsed(true);
                    } else if (table) {
                        setCurrentViewId(undefined);
                        setCurrentStep('records');
                        setIsSidebarCollapsed(false);
                    } else {
                        setCurrentViewId(undefined);
                        setCurrentStep('tables');
                        setIsSidebarCollapsed(false);
                    }

                    setIsSessionLoading(false);
                    lastProcessedConfig.current = currentPropsKey;
                    return; // Done
                }
            } catch (err) {
                console.warn("Failed to load Redis session:", err);
            }

            // 3. Fallback to initial props (the "saved" state)
            const nextFilters = initialFilters || [];
            if (JSON.stringify(appliedFilters) !== JSON.stringify(nextFilters)) {
                setFilters(nextFilters);
                setAppliedFilters(nextFilters);
            }

            setFieldMappings(initialFieldMappings || {});
            setLinkedViews(initialLinkedViews || {});

            initializeLayout({
                pinnedColumns: (initialPinnedColumns as string[]) || [],
                columnOrder: (initialColumnOrder as string[]) || [],
                visibleColumns: initialVisibleColumns || [],
            });

            if (initialViewName) setViewName(initialViewName);

            if (viewId) {
                setCurrentViewId(viewId);
                setCurrentStep('records');
                setIsSidebarCollapsed(true);
            } else if (table) {
                setCurrentViewId(undefined);
                setCurrentStep('records');
                setIsSidebarCollapsed(false);
            } else {
                setCurrentViewId(undefined);
                setCurrentStep('tables');
                setIsSidebarCollapsed(false);
            }
            setIsSessionLoading(false);
            lastProcessedConfig.current = currentPropsKey;
        };

        loadInitialData();
    }, [isOpen, table, datasourceId, viewId, initialFilters, initialFieldMappings, initialLinkedViews, initialPinnedColumns, initialColumnOrder, initialVisibleColumns, initialViewName, initialWebhooks]);

    // Session Sync Effect-Debounced save to Redis
    React.useEffect(() => {
        if (!isOpen || !datasourceId || !selectedTable || isSessionLoading) return;

        const syncToRedis = async () => {
            try {
                await datasourcesApi.saveSession(datasourceId, selectedTable, {
                    pinnedColumns,
                    columnOrder,
                    visibleColumns,
                    filters,
                    fieldMappings,
                    timestamp: new Date().toISOString()
                });
            } catch (err) {
                console.error("Failed to sync session to Redis:", err);
            }
        };

        const timer = setTimeout(syncToRedis, 2000); // 2s debounce
        return () => clearTimeout(timer);
    }, [pinnedColumns, columnOrder, visibleColumns, filters, fieldMappings, isOpen, datasourceId, selectedTable, isSessionLoading]);

    // Close columns dropdown on click outside
    React.useEffect(() => {
        if (!isColumnsDropdownOpen) return;
        const handleClickOutside = () => setIsColumnsDropdownOpen(false);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isColumnsDropdownOpen]);

    // API Base URL for Swagger Docs
    // @ts-ignore
    const API_DOCS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace('/api', '') + '/docs/views';
    const SWAGGER_ANCHOR = currentViewId
        ? `#/Views/create_view_record_api_views__view_id__records_post`
        : `#/Views`;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header with Breadcrumbs */}
                <div className="flex flex-col border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center text-sm font-bold text-gray-400">
                                {currentViewId ? (
                                    <div className="flex items-center gap-2 px-3 py-1 bg-primary-600 rounded-lg shadow-sm">
                                        <span
                                            className="text-xs font-bold text-white/70 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                                            onClick={() => setCurrentStep('tables')}
                                        >
                                            {datasourceName}
                                        </span>
                                        <span className="text-white/30 text-[10px]">/</span>
                                        <span
                                            className="text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:text-white/80 transition-colors"
                                            onClick={() => {
                                                setCurrentStep('records');
                                                setActiveTab('table');
                                            }}
                                        >
                                            {viewName || initialViewName || 'Untitled View'}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsRenamingView(true);
                                                setShowSaveForm(true);
                                            }}
                                            className="p-1 hover:bg-white/20 rounded transition-colors text-white/50 hover:text-white"
                                            title="Rename View"
                                        >
                                            <Pencil size={10} />
                                        </button>
                                        <div className="w-px h-3 bg-white/20 mx-1" />
                                        <button
                                            onClick={() => copyToClipboard(currentViewId)}
                                            className="group relative flex items-center gap-1.5 text-[10px] font-bold text-primary-100 hover:text-white transition-all active:scale-95"
                                            title="Click to copy View ID"
                                        >
                                            <Copy size={10} />
                                            <span>{currentViewId.split('-')[0]}...</span>
                                            {copySuccess && (
                                                <CheckCircle size={10} className="text-green-300 animate-in fade-in" />
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <span
                                            className="hover:text-primary-600 cursor-pointer transition-colors"
                                            onClick={() => setCurrentStep('tables')}
                                        >
                                            {datasourceName}
                                        </span>
                                        {selectedTable && (
                                            <>
                                                <span className="mx-2 opacity-30">/</span>
                                                <span
                                                    className={`transition-colors cursor-pointer ${currentStep === 'records' ? 'text-gray-900 dark:text-white' : 'hover:text-primary-600'} `}
                                                    onClick={() => {
                                                        setCurrentStep('records');
                                                        setActiveTab('table');
                                                    }}
                                                >
                                                    {selectedTable}
                                                </span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        {saveSuccess && (
                            <div className="flex-1 max-w-sm mx-4 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <span className="text-xs font-medium text-green-700 dark:text-green-300">View saved! Webhooks & API configured.</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            {currentStep !== 'tables' && (
                                <div className="flex items-center gap-2">
                                    {currentStep === 'records' && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-xl mr-2 h-9">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[8px] font-bold text-gray-400 uppercase leading-none">Last Updated</span>
                                                <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 leading-tight">
                                                    {(data as any)?.timestamp_utc ? formatDistanceToNow(new Date((data as any).timestamp_utc), { addSuffix: true }) : 'Never'}
                                                </span>
                                            </div>
                                            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />
                                            <button
                                                onClick={() => setShowSyncConfirm(true)}
                                                className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-all"
                                                title="Full Refresh: Clear session, cache and reload from datasource"
                                            >
                                                <RefreshCw size={16} className={(isLoading || isFetchingData || isSessionLoading) ? 'animate-spin' : ''} />
                                            </button>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => {
                                            if (currentViewId) {
                                                handleSaveView();
                                            } else {
                                                setShowSaveForm(!showSaveForm);
                                            }
                                        }}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all h-9 ${selectedTable
                                            ? 'bg-primary-50 border-primary-200 text-primary-600 hover:bg-primary-100 shadow-sm'
                                            : 'bg-gray-50 border-gray-200 text-gray-500 opacity-50 cursor-not-allowed'
                                            } `}
                                        disabled={!selectedTable || (!!currentViewId && isSaving)}
                                    >
                                        {isSaving && currentViewId ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Save className="w-3.5 h-3.5" />
                                        )}
                                        {currentViewId ? 'Save View' : 'Save as View'}
                                    </button>
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Global Save Form Banner */}
                {showSaveForm && (
                    <div className="bg-primary-600 p-4 animate-in slide-in-from-top duration-300">
                        <div className="max-w-4xl mx-auto flex items-center gap-4">
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-primary-100 uppercase tracking-wider mb-1">
                                    {isRenamingView ? 'Rename View' : 'New View Name'}
                                </label>
                                <input
                                    type="text"
                                    value={viewName}
                                    onChange={(e) => setViewName(e.target.value)}
                                    placeholder="e.g., Active Institutions, Marketing Feed..."
                                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/40 focus:ring-2 focus:ring-white/30 outline-none text-sm font-medium transition-all"
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-end gap-2 pt-5">
                                <button
                                    onClick={handleSaveView}
                                    disabled={isSaving || !viewName}
                                    className="px-6 py-2 bg-white text-primary-600 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold rounded-lg shadow-lg transition-all"
                                >
                                    {isSaving ? 'Saving...' : 'Confirm Save'}
                                </button>
                                <button
                                    onClick={() => setShowSaveForm(false)}
                                    className="px-4 py-2 bg-primary-700 text-white hover:bg-primary-800 text-xs font-bold rounded-lg transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {currentStep === 'tables' ? (
                        <div className="flex-1 p-6 space-y-4 overflow-y-auto font-sans">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Select Table/Collection</h4>
                                <div className="relative">
                                    <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search tables..."
                                        value={tableSearch}
                                        onChange={(e) => setTableSearch(e.target.value)}
                                        className="pl-9 pr-4 py-1.5 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs focus:ring-2 focus:ring-primary-500 transition-all w-64"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {tables?.filter((t: string) => t.toLowerCase().includes(tableSearch.toLowerCase())).map((t: string) => (
                                    <button
                                        key={t}
                                        onClick={() => {
                                            setSelectedTable(t);
                                            setCurrentStep('records');
                                            setFilters([]);
                                        }}
                                        className="group flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-primary-500 hover:shadow-lg transition-all text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center text-gray-400 group-hover:text-primary-500 group-hover:bg-primary-50 transition-colors">
                                                <Table size={20} />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-gray-900 dark:text-white">{t}</div>
                                                <div className="text-[10px] text-gray-500">Table/Collection</div>
                                            </div>
                                        </div>
                                        <RefreshCw className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:rotate-180 transition-all duration-500" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex min-w-0 overflow-hidden">
                            {/* Sidebar */}
                            <div className={`${isSidebarCollapsed ? 'w-10' : 'w-64'} transition-all duration-300 border-r border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10 flex flex-col overflow-hidden relative group/sidebar`}>
                                <button
                                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                                    className="absolute right-2 top-2 z-10 p-1 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 text-gray-400 hover:text-primary-600 transition-all opacity-50 hover:opacity-100"
                                >
                                    <ChevronDown className={`w-3 h-3 transition-transform ${isSidebarCollapsed ? '-rotate-90' : 'rotate-90'} `} />
                                </button>

                                {!isSidebarCollapsed && (
                                    <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                                        <div className="relative font-sans">
                                            <Table className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="Filter tables..."
                                                value={tableSearch}
                                                onChange={(e) => setTableSearch(e.target.value)}
                                                className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500"
                                            />
                                            <button
                                                onClick={() => refreshSchemaMutation.mutate()}
                                                disabled={!selectedTable || refreshSchemaMutation.isPending}
                                                className="absolute right-2 top-2.5 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-primary-500 transition-colors disabled:opacity-50"
                                                title="Refresh current table schema"
                                            >
                                                <RefreshCw className={`w-3 h-3 ${refreshSchemaMutation.isPending ? 'animate-spin' : ''} `} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                    {tables?.filter((t: string) => !isSidebarCollapsed && t.toLowerCase().includes(tableSearch.toLowerCase())).map((t: string) => (
                                        <button
                                            key={t}
                                            onClick={() => {
                                                setSelectedTable(t);
                                                setFilters([]);
                                                setActiveTab('table');
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all truncate hover:bg-gray-100 dark:hover:bg-gray-800 ${selectedTable === t
                                                ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                                                : 'text-gray-500 dark:text-gray-400'
                                                } ${isSidebarCollapsed ? 'justify-center px-2' : ''} `}
                                            title={isSidebarCollapsed ? t : undefined}
                                        >
                                            {isSidebarCollapsed ? t.slice(0, 2).toUpperCase() : t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Main Records Panel */}
                            <div className="flex-1 flex flex-col min-w-0 overflow-hidden font-sans">
                                <div className="flex items-center px-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/10 dark:bg-gray-900/10">
                                    <button onClick={() => setActiveTab('table')} className={`px-4 py-2 text-xs font-bold border-b-2 ${activeTab === 'table' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent hover:text-gray-600'} `}>Table View</button>
                                    <button onClick={() => setActiveTab('record')} className={`px-4 py-2 text-xs font-bold border-b-2 ${activeTab === 'record' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent hover:text-gray-600'} `}>Record View</button>
                                    <button onClick={() => setActiveTab('linked')} className={`px-4 py-2 text-xs font-bold border-b-2 ${activeTab === 'linked' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent hover:text-gray-600'} `}>Linked Views</button>
                                    <button onClick={() => setActiveTab('api')} className={`px-4 py-2 text-xs font-bold border-b-2 ${activeTab === 'api' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent hover:text-gray-600'} `}>API</button>
                                    <button onClick={() => setActiveTab('webhooks')} className={`px-4 py-2 text-xs font-bold border-b-2 ${activeTab === 'webhooks' ? 'text-primary-600 border-primary-600' : 'text-gray-400 border-transparent hover:text-gray-600'} `}>Webhooks</button>
                                </div>

                                <div className="flex-1 overflow-auto">
                                    {(activeTab === 'table' || activeTab === 'record') ? (
                                        <div className="flex flex-col h-full overflow-hidden">
                                            <div className="p-4 bg-gray-50/50 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-700/50">
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-tight"><Filter className="w-3.5 h-3.5" /> Filters</div>
                                                    <button onClick={addFilter} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50 rounded-lg whitespace-nowrap"><Plus size={14} /> Add Filter</button>

                                                    {filters.map((filter, index) => (
                                                        <div key={index} className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-sm">
                                                            <div className="relative group/search">
                                                                <input
                                                                    type="text"
                                                                    value={filter.field}
                                                                    onChange={(e) => updateFilter(index, 'field', e.target.value)}
                                                                    placeholder="Field..."
                                                                    className="w-32 px-2 py-1 text-xs bg-transparent outline-none font-medium"
                                                                />
                                                                <div className="absolute left-0 top-full mt-1 w-48 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-xl z-50 hidden group-focus-within/search:block">
                                                                    {availableFields
                                                                        .filter(f => f.toLowerCase().includes(filter.field.toLowerCase()))
                                                                        .map(f => (
                                                                            <button
                                                                                key={f}
                                                                                onClick={(e) => {
                                                                                    updateFilter(index, 'field', f);
                                                                                    // Blur the input to close the CSS group-focus-within dropdown
                                                                                    (e.currentTarget.closest('.group\\/search')?.querySelector('input') as HTMLInputElement)?.blur();
                                                                                }}
                                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                                                                            >
                                                                                {f}
                                                                            </button>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                            <select value={filter.operator} onChange={(e) => updateFilter(index, 'operator', e.target.value)} className="px-1 py-1 text-[10px] font-mono text-primary-600">
                                                                <option value="==">==</option>
                                                                <option value="!=">!=</option>
                                                                <option value=">">&gt;</option>
                                                                <option value="<">&lt;</option>
                                                                <option value="contains">contains</option>
                                                            </select>
                                                            <input type="text" placeholder="value" value={filter.value} onChange={(e) => updateFilter(index, 'value', e.target.value)} className="w-32 px-2 py-1 text-xs bg-transparent outline-none border-l border-gray-100 ml-1" />
                                                            <button onClick={() => removeFilter(index)} className="ml-1 p-1 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                                                        </div>
                                                    ))}

                                                    <div className="flex-1 flex items-center gap-2">
                                                        {data && (
                                                            <div className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-bold text-gray-500 flex items-center gap-1.5 shadow-sm">
                                                                <Table size={12} className="text-gray-400" />
                                                                <span>{filteredRecords.length.toLocaleString()}</span>
                                                                <span className="text-gray-300">/</span>
                                                                <span className="text-gray-400">{data.total?.toLocaleString() || '0'}</span>
                                                                <span className="ml-1 text-[8px] uppercase tracking-wider opacity-50">Records</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Global Search and Navigation */}
                                                    <div className="flex-1 flex items-center gap-2">
                                                        <div className="relative flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition-all w-64 md:w-80">
                                                            <Search size={14} className="text-gray-400" />
                                                            <input
                                                                type="text"
                                                                placeholder="Global search..."
                                                                className="bg-transparent border-none outline-none text-xs w-full font-medium placeholder:text-gray-400"
                                                                value={globalSearch}
                                                                onChange={(e) => setGlobalSearch(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        if (e.shiftKey) {
                                                                            handlePrevMatch();
                                                                        } else {
                                                                            handleNextMatch();
                                                                        }
                                                                    }
                                                                }}
                                                            />
                                                            {globalSearch && (
                                                                <div className="flex items-center gap-1">
                                                                    {allMatches.length > 0 && (
                                                                        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 rounded-md px-1 mr-1">
                                                                            <span className="text-[9px] font-mono font-bold text-gray-500 dark:text-gray-400">
                                                                                {currentMatchIndex + 1}/{allMatches.length}
                                                                            </span>
                                                                            <div className="flex flex-col gap-0 border-l border-gray-200 dark:border-gray-600 pl-0.5 ml-1">
                                                                                <button onClick={handlePrevMatch} className="hover:text-primary-600 p-0.5"><ChevronDown size={8} className="rotate-180" /></button>
                                                                                <button onClick={handleNextMatch} className="hover:text-primary-600 p-0.5"><ChevronDown size={8} /></button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <button
                                                                        onClick={() => {
                                                                            setGlobalSearch('');
                                                                            setAllMatches([]);
                                                                        }}
                                                                        className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 transition-colors"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setIsColumnsDropdownOpen(!isColumnsDropdownOpen);
                                                            }}
                                                            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${isColumnsDropdownOpen ? 'bg-primary-600 border-primary-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-400'} `}
                                                        >
                                                            <Columns size={14} />
                                                            <span>Columns</span>
                                                            <span className="flex items-center justify-center min-w-[20px] h-5 px-1 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded text-[10px] ml-1">
                                                                {visibleColumns.length === 0 ? availableFields.length : visibleColumns.length}/{availableFields.length}
                                                            </span>
                                                            <ChevronDown size={14} className={`transition-transform ${isColumnsDropdownOpen ? 'rotate-180' : ''} `} />
                                                        </button>

                                                        {isColumnsDropdownOpen && (
                                                            <div
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2"
                                                            >
                                                                <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                                                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-lg px-2 py-1.5">
                                                                        <Table size={12} className="text-gray-400" />
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Search columns..."
                                                                            className="bg-transparent border-none outline-none text-xs w-full font-medium"
                                                                            value={columnSearch}
                                                                            onChange={(e) => setColumnSearch(e.target.value)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="max-h-64 overflow-y-auto p-1">
                                                                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50 dark:border-gray-700/50 mb-1">
                                                                        <button
                                                                            onClick={() => setVisibleColumns([])}
                                                                            className="text-[10px] font-bold text-primary-600 hover:underline"
                                                                        >
                                                                            Show All
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                const fields = (availableFields.length > 0 ? availableFields : Object.keys(data?.records?.[0] || {}));
                                                                                setVisibleColumns([fields[0] || 'id']); // Keep at least one or none? Let's say none.
                                                                            }}
                                                                            className="text-[10px] font-bold text-gray-400 hover:underline"
                                                                        >
                                                                            Hide All
                                                                        </button>
                                                                    </div>
                                                                    {(availableFields.length > 0 ? availableFields : Object.keys(data?.records?.[0] || {}))
                                                                        .filter(col => col.toLowerCase().includes(columnSearch.toLowerCase()))
                                                                        .map(col => (
                                                                            <div
                                                                                key={col}
                                                                                onClick={() => {
                                                                                    const fields = (availableFields.length > 0 ? availableFields : Object.keys(data?.records?.[0] || {}));
                                                                                    toggleVisibility(col, fields);
                                                                                }}
                                                                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg cursor-pointer transition-colors"
                                                                            >
                                                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${(visibleColumns.length === 0 || visibleColumns.includes(col)) ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'} `}>
                                                                                    {(visibleColumns.length === 0 || visibleColumns.includes(col)) && <CheckCircle size={10} className="text-white" />}
                                                                                </div>
                                                                                <span className={`text-[11px] font-semibold ${(visibleColumns.length === 0 || visibleColumns.includes(col)) ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'} `}>{col}</span>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Content area: Table or Record Editor */}
                                            {activeTab === 'table' ? (
                                                <div className="flex-1 overflow-auto p-4 relative">
                                                    {/* No local results banner */}
                                                    {/* Tiered Search Banners */}
                                                    {globalSearch && filteredRecords.length === 0 && !isLoading && (
                                                        <div className="space-y-3 mb-6 animate-in fade-in slide-in-from-top-2">
                                                            {/* Tier 1: Local Table Search (Already no results) */}
                                                            <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-xl flex items-center justify-between shadow-sm">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-2 bg-primary-100 dark:bg-primary-900/40 rounded-lg text-primary-600">
                                                                        <Search className="w-5 h-5" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-bold text-primary-900 dark:text-primary-100 leading-none">No matches in <u>{selectedTable}</u></p>
                                                                        <p className="text-[10px] text-primary-600 mt-1">Shall we query the datasource for "{globalSearch}"?</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={runRemoteSearch}
                                                                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-bold rounded-lg shadow-lg shadow-primary-500/20 transition-all flex items-center gap-2"
                                                                >
                                                                    <RefreshCw size={14} /> Run <u>{selectedTable}</u> Search
                                                                </button>
                                                            </div>

                                                            {/* Tier 2: Search Other Collections in this Datasource */}
                                                            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-xl flex items-center justify-between shadow-sm">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg text-orange-600">
                                                                        <Database className="w-5 h-5" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-bold text-orange-900 dark:text-orange-100 leading-none">Search all collections in <u>{datasourceName}</u></p>
                                                                        <p className="text-[10px] text-orange-600 mt-1">Look for "{globalSearch}" across all tables in this datasource.</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={searchOtherCollections}
                                                                    disabled={globalSearchStatus !== 'idle'}
                                                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold rounded-lg shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 group"
                                                                >
                                                                    {globalSearchStatus === 'searching_datasource' ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />}
                                                                    Search Datasource
                                                                </button>
                                                            </div>

                                                            {/* Tier 3: Search All Datasources */}
                                                            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl flex items-center justify-between shadow-sm">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg text-purple-600">
                                                                        <Globe className="w-5 h-5" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-bold text-purple-900 dark:text-purple-100 leading-none">Search all datasources</p>
                                                                        <p className="text-[10px] text-purple-600 mt-1">Experimental: Scan every connected source for "{globalSearch}".</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={searchAllDatasources}
                                                                    disabled={globalSearchStatus !== 'idle'}
                                                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold rounded-lg shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2 group"
                                                                >
                                                                    {globalSearchStatus === 'searching_all' ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                                                                    Global Search
                                                                </button>
                                                            </div>

                                                            {/* Global Results Display */}
                                                            {globalResults.length > 0 && (
                                                                <div className="mt-4 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm">
                                                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                                                                        <CheckCircle size={12} className="text-green-500" />
                                                                        Matches found in other locations:
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                        {globalResults.map((res, idx) => (
                                                                            <button
                                                                                key={idx}
                                                                                onClick={() => {
                                                                                    // If it's another table in the same datasource, we can just switch
                                                                                    // If it's a different datasource, we might need more logic or just stay here
                                                                                    setSelectedTable(res.table);
                                                                                    setGlobalResults([]);
                                                                                    setFilters([]);
                                                                                    // Trigger actual search on new table
                                                                                    setAppliedFilters([{ field: 'search', operator: 'contains', value: globalSearch }]);
                                                                                }}
                                                                                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/30 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg text-left transition-all border border-transparent hover:border-primary-200"
                                                                            >
                                                                                <div className="truncate">
                                                                                    <div className="text-[10px] font-bold text-gray-700 dark:text-gray-200 truncate">{res.table}</div>
                                                                                    <div className="text-[8px] text-gray-400 capitalize">{res.datasource_name}</div>
                                                                                </div>
                                                                                <span className="text-[10px] font-bold text-primary-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded shadow-sm">
                                                                                    {res.count}
                                                                                </span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {(!data && (isLoading || isSessionLoading)) ? (
                                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                                            <Loader2 className="animate-spin" />
                                                            <p className="text-xs font-bold uppercase tracking-wider opacity-50">{isSessionLoading ? 'Restoring Session...' : 'Refetching Data...'}</p>
                                                        </div>
                                                    ) : error ? (
                                                        <div className="h-full flex flex-col items-center justify-center text-red-500 gap-2"><AlertCircle /><p className="text-xs">Error loading data.</p></div>
                                                    ) : (
                                                        <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-x-auto bg-white dark:bg-gray-800 table-container">
                                                            <table className="w-full text-left border-collapse min-w-max">
                                                                <thead className="bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-30">
                                                                    <tr>
                                                                        <DndContext
                                                                            sensors={headerSensors}
                                                                            collisionDetection={closestCenter}
                                                                            onDragEnd={handleTableHeaderDragEnd}
                                                                        >
                                                                            <SortableContext
                                                                                items={tableColumns}
                                                                                strategy={horizontalListSortingStrategy}
                                                                            >
                                                                                {tableColumns.map((key, j) => {
                                                                                    // Check if any record's value for this key matches search (handle nested objects)
                                                                                    const columnMatches = globalSearch && data?.records?.some(r => {
                                                                                        const val = r[key];
                                                                                        const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                                                                                        return strVal.toLowerCase().includes(globalSearch.toLowerCase());
                                                                                    });
                                                                                    const isPinned = pinnedColumns.includes(key);
                                                                                    // Since pinned columns are now moved to the front, we calculate offset by its index
                                                                                    const leftOffset = isPinned ? (j * 150) : undefined;

                                                                                    return (
                                                                                        <SortableTableHeader
                                                                                            key={key}
                                                                                            columnKey={key}
                                                                                            columnMatches={!!columnMatches}
                                                                                            isPinned={isPinned}
                                                                                            leftOffset={leftOffset}
                                                                                            isActiveMatch={!!(globalSearch && allMatches[currentMatchIndex]?.colKey === key)}
                                                                                            onHide={(e) => {
                                                                                                e.stopPropagation();
                                                                                                const fields = (availableFields.length > 0 ? availableFields : Object.keys(data?.records?.[0] || {}));
                                                                                                toggleVisibility(key, fields);
                                                                                            }}
                                                                                            onPinToggle={(e) => {
                                                                                                e.stopPropagation();
                                                                                                togglePin(key);
                                                                                            }}
                                                                                        />
                                                                                    );
                                                                                })}
                                                                            </SortableContext>
                                                                        </DndContext>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {filteredRecords.map((record, i) => (
                                                                        <tr key={i} className="group hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors relative">
                                                                            {tableColumns.map((key, j) => {
                                                                                const value = record[key];
                                                                                // Handle nested objects for search matching
                                                                                const strVal = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
                                                                                const cellMatches = globalSearch && strVal.toLowerCase().includes(globalSearch.toLowerCase());

                                                                                const isPinned = pinnedColumns.includes(key);
                                                                                // Since pinned columns are now moved to the front, we calculate offset by its index
                                                                                const leftOffset = isPinned ? (j * 150) : undefined;

                                                                                return (
                                                                                    <td
                                                                                        key={j}
                                                                                        className={`px-4 py-3 text-xs border-b border-gray-50 truncate transition-all ${cellMatches ? 'bg-yellow-50/50 dark:bg-yellow-900/10 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'} ${isPinned ? 'sticky z-10 bg-white dark:bg-gray-800 border-r border-gray-100/50 group-hover:bg-primary-50/50 dark:group-hover:bg-primary-900/10' : 'max-w-xs'} `}
                                                                                        style={isPinned ? { left: leftOffset, minWidth: '150px', maxWidth: '150px' } : {}}
                                                                                    >
                                                                                        {typeof value === 'object' ? (
                                                                                            <HighlightMatches text={JSON.stringify(value)} query={globalSearch} />
                                                                                        ) : (
                                                                                            <HighlightMatches text={String(value ?? '')} query={globalSearch} />
                                                                                        )}
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                            {/* Floating Action Button at the end of the row */}
                                                                            <td className="sticky right-0 w-0 p-0 border-none overflow-visible z-20">
                                                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setEditingRecord(record);
                                                                                            setActiveTab('record');
                                                                                        }}
                                                                                        className="p-2 bg-white dark:bg-gray-700 border border-primary-200 dark:border-primary-800 shadow-lg rounded-full text-primary-600 dark:text-primary-400 hover:scale-110 hover:bg-primary-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                                                                        title="Edit Record"
                                                                                    >
                                                                                        <Pencil size={14} />
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : activeTab === 'record' && (
                                                <div className="flex-1 overflow-hidden">
                                                    {(!data?.records?.[0] && (isLoading || isSessionLoading)) ? (
                                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                                            <Loader2 className="animate-spin" />
                                                            <p className="text-xs">Loading records...</p>
                                                        </div>
                                                    ) : (
                                                        <RecordEditor
                                                            record={editingRecord || (data?.records?.[0]) || {}}
                                                            schema={schemaData}
                                                            onSave={(mappings) => setFieldMappings(mappings)}
                                                            onCancel={() => {
                                                                setEditingRecord(null);
                                                                setActiveTab('table');
                                                            }}
                                                            currentMappings={fieldMappings}
                                                            datasourceName={datasourceName}
                                                            tableName={selectedTable}
                                                            columnSearch={columnSearch}
                                                            globalSearch={globalSearch}
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ) : activeTab === 'linked' ? (
                                        <div className="p-6">
                                            <h4 className="text-sm font-bold mb-2 uppercase">Linked Views</h4>
                                            <div className="grid gap-3">
                                                {Object.entries(linkedViews).map(([key, config]) => (
                                                    <div key={key} className="p-3 border border-gray-100 rounded-xl flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <LinkIcon size={16} />
                                                            <div>
                                                                <div className="text-[10px] font-bold">{key}</div>
                                                                <div className="text-[9px] text-gray-400">{config.view_id}</div>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                const { [key]: _, ...rest } = linkedViews;
                                                                setLinkedViews(rest);
                                                            }}
                                                            className="text-gray-300 hover:text-red-500"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => {
                                                        const k = prompt("Field (e.g. acf):"); if (!k) return;
                                                        const v = prompt("View UUID:"); if (!v) return;
                                                        setLinkedViews(p => ({ ...p, [k]: { view_id: v, join_on: 'id', target_key: 'id' } }));
                                                    }}
                                                    className="p-4 border-2 border-dashed border-gray-100 rounded-xl text-gray-400 text-xs hover:border-primary-500 hover:text-primary-600 transition-all font-sans"
                                                >
                                                    + Add Linked Data View
                                                </button>
                                            </div>
                                        </div>
                                    ) : activeTab === 'webhooks' ? (
                                        <div className="p-6 h-full flex flex-col bg-gray-50/10">
                                            <div className="flex items-center justify-between mb-6">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">External Webhooks</h4>
                                                    <p className="text-[10px] text-gray-400">Trigger external systems when data changes or via manual trigger logic.</p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setEditingWebhookIndex(null);
                                                        setWebhookForm({ name: '', url: '', events: ['insert', 'update', 'delete'], enabled: true, method: 'POST' });
                                                        setIsWebhookModalOpen(true);
                                                    }}
                                                    className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl text-xs font-bold hover:bg-primary-700 transition-all shadow-sm active:scale-95"
                                                >
                                                    <Plus size={14} /> Register Webhook
                                                </button>
                                            </div>

                                            {webhooks.length > 0 ? (
                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 overflow-y-auto pr-2 pb-6">
                                                    {webhooks.map((webhook, idx) => (
                                                        <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-2xl flex flex-col shadow-sm group hover:border-primary-500/30 transition-all overflow-hidden">
                                                            <div className="p-4 flex items-start justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${webhook.enabled ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30' : 'bg-gray-100 text-gray-400 dark:bg-gray-700/50'} `}>
                                                                        <Zap size={20} className={webhook.enabled ? 'animate-pulse' : ''} />
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                            {webhook.name || 'Untitled Webhook'}
                                                                            {!webhook.enabled && <span className="text-[9px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full text-gray-400 font-bold uppercase ring-1 ring-inset ring-gray-200 dark:ring-gray-600">Off</span>}
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5 truncate max-w-[200px]">
                                                                            <Globe size={10} /> {webhook.url}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingWebhookIndex(idx);
                                                                            setWebhookForm({ ...webhook });
                                                                            setIsWebhookModalOpen(true);
                                                                        }}
                                                                        className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-900 transition-colors"
                                                                    >
                                                                        <Settings size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            const newWebhooks = [...webhooks];
                                                                            newWebhooks[idx].enabled = !newWebhooks[idx].enabled;
                                                                            setWebhooks(newWebhooks);
                                                                        }}
                                                                        className={`p-2 rounded-lg transition-colors ${webhook.enabled ? 'text-primary-600 hover:bg-primary-50' : 'text-gray-300 hover:bg-gray-50'} `}
                                                                    >
                                                                        <Activity size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-900/30 border-y border-gray-100 dark:border-gray-700/50 flex flex-wrap gap-1.5">
                                                                {webhook.events.map((e: string) => (
                                                                    <span key={e} className="text-[9px] font-bold px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-md text-gray-500 uppercase tracking-tighter ring-1 ring-inset ring-gray-200">
                                                                        {e}
                                                                    </span>
                                                                ))}
                                                            </div>

                                                            <div className="p-4 space-y-3">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Trigger Reference</span>
                                                                        <div className="flex gap-1">
                                                                            <span className="text-[9px] font-mono bg-blue-50 text-blue-600 px-1 rounded uppercase font-bold">{webhook.method}</span>
                                                                            <span className="text-[9px] font-mono bg-green-50 text-green-600 px-1 rounded font-bold uppercase">JSON</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-2 bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 rounded-lg font-mono text-[9px] text-gray-500 overflow-x-auto whitespace-nowrap">
                                                                        <code>POST /api/views/{currentViewId || '{id}'}/trigger</code>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Expected Response Schema</span>
                                                                    <div className="p-2 bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 rounded-lg font-mono text-[9px] text-gray-500 overflow-x-auto">
                                                                        <pre>{JSON.stringify({
                                                                            "event": "insert",
                                                                            "timestamp": new Date().toISOString(),
                                                                            "data": Object.fromEntries(Object.keys(fieldMappings || {}).map(k => [k, "value"]))
                                                                        }, null, 2)}</pre>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="px-4 py-3 bg-gray-50/30 dark:bg-gray-900/10 flex justify-end gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm('Delete this webhook configuration?')) {
                                                                            setWebhooks(prev => prev.filter((_, i) => i !== idx));
                                                                        }
                                                                    }}
                                                                    className="text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors"
                                                                >
                                                                    Delete Configuration
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        viewsApi.trigger(currentViewId!, { test: true, timestamp: new Date().toISOString() })
                                                                            .then(() => alert('Webhook triggered! Check your endpoint.'))
                                                                            .catch(e => alert('Failed to trigger: ' + e.message));
                                                                    }}
                                                                    className="flex items-center gap-1 text-[10px] font-bold text-primary-600 hover:text-primary-700 transition-colors"
                                                                >
                                                                    Test Execution <ChevronRight size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex-1 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-gray-800/20">
                                                    <div className="w-20 h-20 bg-primary-50 dark:bg-primary-900/20 rounded-[2.5rem] flex items-center justify-center text-primary-600 dark:text-primary-400 mb-6 shadow-xl shadow-primary-500/10">
                                                        <Zap size={40} />
                                                    </div>
                                                    <h5 className="text-base font-bold text-gray-900 dark:text-white mb-2">Build Event-Driven Workflows</h5>
                                                    <p className="text-[12px] text-gray-500 max-w-sm mb-8 leading-relaxed">Connect your favorite tools (n8n, Zapier, Make) to your database. Register a webhook and we'll forward transformed data every time something happens.</p>
                                                    <button
                                                        onClick={() => {
                                                            setEditingWebhookIndex(null);
                                                            setWebhookForm({ name: '', url: '', events: ['insert', 'update', 'delete'], enabled: true, method: 'POST' });
                                                            setIsWebhookModalOpen(true);
                                                        }}
                                                        className="px-8 py-3 bg-primary-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-primary-500/20 hover:bg-primary-700 transition-all active:scale-95"
                                                    >
                                                        Create Your First Webhook
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col">
                                            <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">REST API Documentation</span>
                                                <code className="text-[10px] text-primary-600 font-mono italic">endpoint: /api/views/{currentViewId || '{id}'}/records</code>
                                            </div>
                                            <iframe
                                                src={`${API_DOCS_URL}${currentViewId ? `?id=${currentViewId}` : ''}${SWAGGER_ANCHOR} `}
                                                className="flex-1 w-full border-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex justify-end items-center gap-4">
                    <p className="text-[10px] text-gray-400 italic">Advanced sync engine processes mappings securely on the server.</p>
                    <button onClick={onClose} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-bold transition-colors">Close</button>
                </div>

                {/* Webhook Management Modal */}
                {isWebhookModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700 relative">
                            <div className="p-8 border-b border-gray-100 dark:border-gray-700">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                                            {editingWebhookIndex !== null ? 'Configure Webhook' : 'New Webhook'}
                                        </h3>
                                        <p className="text-[10px] text-primary-600 font-bold uppercase tracking-widest mt-1">External Data Forwarding</p>
                                    </div>
                                    <button onClick={() => setIsWebhookModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-all">
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Friendly Name</label>
                                    <div className="relative">
                                        <Info className="absolute left-4 top-3.5 size-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={webhookForm.name}
                                            onChange={(e) => setWebhookForm(curr => ({ ...curr, name: e.target.value }))}
                                            placeholder="e.g. Production n8n Hook"
                                            className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all text-sm font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Callback URL</label>
                                    <div className="relative">
                                        <Globe className="absolute left-4 top-3.5 size-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={webhookForm.url}
                                            onChange={(e) => setWebhookForm(curr => ({ ...curr, url: e.target.value }))}
                                            placeholder="https://your-app.com/api/webhook"
                                            className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all text-sm font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Subscribe to Events</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {['insert', 'update', 'delete'].map(event => {
                                            const isActive = webhookForm.events.includes(event);
                                            return (
                                                <button
                                                    key={event}
                                                    onClick={() => {
                                                        const newEvents = isActive
                                                            ? webhookForm.events.filter(e => e !== event)
                                                            : [...webhookForm.events, event];
                                                        setWebhookForm(curr => ({ ...curr, events: newEvents }));
                                                    }}
                                                    className={`py-3 px-2 rounded-2xl text-[10px] font-bold uppercase transition-all flex flex-col items-center gap-1.5 ring-1 ring-inset ${isActive
                                                        ? 'bg-primary-600 text-white ring-primary-600 shadow-lg shadow-primary-500/20'
                                                        : 'bg-white text-gray-400 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700 hover:ring-gray-200'
                                                        } `}
                                                >
                                                    <div className={`p-1 rounded-md ${isActive ? 'bg-white/20' : 'bg-gray-50 dark:bg-gray-700'} `}>
                                                        {event === 'insert' ? <Plus size={12} /> : event === 'update' ? <RefreshCw size={12} /> : <Trash2 size={12} />}
                                                    </div>
                                                    {event}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-gray-50/50 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700 flex gap-4">
                                <button
                                    onClick={() => setIsWebhookModalOpen(false)}
                                    className="flex-1 py-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-2xl text-xs font-bold hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (editingWebhookIndex !== null) {
                                            const newWebhooks = [...webhooks];
                                            newWebhooks[editingWebhookIndex] = { ...webhookForm };
                                            setWebhooks(newWebhooks);
                                        } else {
                                            setWebhooks(curr => [...curr, { ...webhookForm }]);
                                        }
                                        setIsWebhookModalOpen(false);
                                    }}
                                    disabled={!webhookForm.url || !webhookForm.name}
                                    className="flex-1 py-4 bg-primary-600 text-white rounded-2xl text-xs font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:shadow-none active:scale-95"
                                >
                                    {editingWebhookIndex !== null ? 'Update Settings' : 'Create Webhook'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Custom Confirmation Modal */}
                {showSyncConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-in zoom-in duration-200 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600">
                                    <RotateCcw size={24} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Confirm Hard Refresh</h3>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                                        This will wipe your current session, local layout cache, and reload all data fresh from the source. Any unsaved changes will be lost.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowSyncConfirm(false)}
                                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-xl text-[10px] font-bold transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setShowSyncConfirm(false);
                                        handleManualUpdate();
                                    }}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold shadow-lg shadow-red-500/20 transition-all active:scale-95"
                                >
                                    Confirm Reset
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DataPreviewModal;
