import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasourcesApi, viewsApi } from '../api';
import { useLayoutStore } from '../store/useLayoutStore';
import { DataPreviewModalProps, SearchResult } from '../types/data-preview';

export const useDataPreview = ({
    isOpen,
    datasourceId,
    table,
    datasourceName,
    onViewSaved,
    initialFilters,
    viewId,
    initialViewName,
    initialVisibleColumns,
    initialPinnedColumns,
    initialColumnOrder,
    initialFieldMappings,
    initialLinkedViews,
    initialWebhooks
}: DataPreviewModalProps) => {
    const queryClient = useQueryClient();

    // State
    const [filters, setFilters] = useState<{ field: string; operator: string; value: string }[]>([]);
    const [appliedFilters, setAppliedFilters] = useState<{ field: string; operator: string; value: string }[]>([]);
    const [viewName, setViewName] = useState(initialViewName || '');
    const [currentViewId, setCurrentViewId] = useState<string | undefined>(viewId);
    const [isSaving, setIsSaving] = useState(false);
    const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
    const [columnSearch, setColumnSearch] = useState('');
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [showSyncConfirm, setShowSyncConfirm] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [activeTab, setActiveTab] = useState<'table' | 'record' | 'linked' | 'api' | 'webhooks'>('table');
    const [globalSearch, setGlobalSearch] = useState('');
    const [dataSearchQuery, setDataSearchQuery] = useState('');
    const [showDataSearchResults, setShowDataSearchResults] = useState(false);
    const [isRenamingView, setIsRenamingView] = useState(false);
    const [globalSearchStatus, setGlobalSearchStatus] = useState<'idle' | 'searching_datasource' | 'searching_all'>('idle');
    const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
    const [isSessionLoading, setIsSessionLoading] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [selectedTable, setSelectedTable] = useState(table);
    const [tableSearch, setTableSearch] = useState('');
    const [editingRecord, setEditingRecord] = useState<any | null>(null);
    const [fieldMappings, setFieldMappings] = useState<Record<string, string>>(initialFieldMappings || {});
    const [linkedViews, setLinkedViews] = useState<Record<string, any>>(initialLinkedViews || {});
    const [webhooks, setWebhooks] = useState<any[]>([]);
    const [currentStep, setCurrentStep] = useState<'tables' | 'records'>('tables');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isWebhookModalOpen, setIsWebhookModalOpen] = useState(false);
    const [editingWebhookIndex, setEditingWebhookIndex] = useState<number | null>(null);
    const [webhookForm, setWebhookForm] = useState({
        name: '',
        url: '',
        events: ['insert', 'update', 'delete'] as string[],
        enabled: true,
        method: 'POST' as 'POST' | 'PUT' | 'PATCH'
    });

    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [allMatches, setAllMatches] = useState<{ colKey: string; rowIndex: number }[]>([]);

    const layoutStore = useLayoutStore();
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
    } = layoutStore;

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

    const { data: searchResults, isFetching: isSearchingByQuery } = useQuery({
        queryKey: ['datasourceSearch', datasourceId, dataSearchQuery],
        queryFn: () => datasourcesApi.searchDatasource(datasourceId, dataSearchQuery).then(r => r.data),
        enabled: isOpen && !!datasourceId && showDataSearchResults && !!dataSearchQuery.trim(),
        staleTime: 1000 * 60 * 5, // Cache search results for 5 minutes
    });

    // Memos
    const availableFields = useMemo(() => {
        const fieldsSet = new Set<string>();
        filters.forEach(f => { if (f.field) fieldsSet.add(f.field); });
        if (schemaData?.columns) schemaData.columns.forEach(col => fieldsSet.add(col.name));
        if (data?.records?.[0]) Object.keys(data.records[0]).forEach(key => fieldsSet.add(key));
        return Array.from(fieldsSet).sort();
    }, [schemaData, data, filters]);

    const tableColumns = useMemo(() => {
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
                    return data.records.some((record: any) => {
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

    const groupedMatches = useMemo(() => {
        if (!showDataSearchResults || !searchResults?.length) return {};
        const counts = searchResults.reduce((acc: any, m: any) => {
            acc[m.table] = (acc[m.table] || 0) + (m.count || 1);
            return acc;
        }, {});
        return counts;
    }, [showDataSearchResults, searchResults]);

    const filteredTables = useMemo(() => {
        let results = (tables || []);

        // 1. Initial table name filtering
        if (tableSearch.trim()) {
            results = results.filter((t: string) => t.toLowerCase().includes(tableSearch.toLowerCase()));
        }

        // 2. If global data search is active, show only tables with matches
        if (showDataSearchResults && searchResults && searchResults.length > 0) {
            const tableWithMatches = new Set(searchResults.map(d => d.table));
            results = results.filter((t: string) => tableWithMatches.has(t));
        }

        return results;
    }, [tables, tableSearch, showDataSearchResults, searchResults]);

    const filteredRecords = useMemo(() => {
        if (!data?.records) return [];

        // 1. Apply column filters
        let results = data.records;
        if (filters.length > 0) {
            results = results.filter((record: any) => {
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
            results = results.filter((record: any) => {
                return Object.values(record).some(val => {
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
    useEffect(() => {
        if (!globalSearch || !data?.records) {
            setAllMatches([]);
            setCurrentMatchIndex(0);
            return;
        }

        const matches: { colKey: string; rowIndex: number }[] = [];
        const searchLower = globalSearch.toLowerCase();

        filteredRecords.forEach((record: any, rowIndex: number) => {
            availableFields.forEach(colKey => {
                const val = record[colKey];
                const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                if (strVal.toLowerCase().includes(searchLower)) {
                    matches.push({ colKey, rowIndex });
                }
            });
        });
        setAllMatches(matches);
        setCurrentMatchIndex(0);
    }, [globalSearch, filteredRecords, availableFields]);

    // Set Active Context for Layout Store
    useEffect(() => {
        if (isOpen && datasourceId && selectedTable) {
            setActiveContext(String(datasourceId), selectedTable);
        }
    }, [isOpen, datasourceId, selectedTable, setActiveContext]);

    const handleNextMatch = (scrollToColumn: (col: string) => void) => {
        if (allMatches.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % allMatches.length;
        setCurrentMatchIndex(nextIndex);
        const match = allMatches[nextIndex];

        if (activeTab === 'record') {
            const recordAtMatch = filteredRecords[match.rowIndex];
            if (recordAtMatch) setEditingRecord(recordAtMatch);
        }

        scrollToColumn(match.colKey);
    };

    const handlePrevMatch = (scrollToColumn: (col: string) => void) => {
        if (allMatches.length === 0) return;
        const prevIndex = (currentMatchIndex - 1 + allMatches.length) % allMatches.length;
        setCurrentMatchIndex(prevIndex);
        const match = allMatches[prevIndex];

        if (activeTab === 'record') {
            const recordAtMatch = filteredRecords[match.rowIndex];
            if (recordAtMatch) setEditingRecord(recordAtMatch);
        }

        scrollToColumn(match.colKey);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
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
            const counts = response.data.reduce((acc: any, m: any) => {
                acc[m.table] = (acc[m.table] || 0) + 1;
                return acc;
            }, {});
            const summary = Object.entries(counts).map(([table, count]) => ({
                table,
                count: count as number,
                datasource_name: datasourceName,
                datasource_id: String(datasourceId)
            }));
            setGlobalResults(summary as any);
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
            const groups = response.data.reduce((acc: any, m: any) => {
                const key = `${m.datasource_name}:${m.table}`;
                if (!acc[key]) acc[key] = { datasource_name: m.datasource_name, table: m.table, count: 0 };
                acc[key].count++;
                return acc;
            }, {});
            setGlobalResults(Object.values(groups) as any);
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
            setAppliedFilters([...filters]);

            if (response.data.id) {
                setCurrentViewId(response.data.id);
            }
            setSaveSuccess(true);
            onViewSaved?.(response.data);
            setTimeout(() => setSaveSuccess(false), 5000);

            if (selectedTable) {
                await datasourcesApi.clearSession(datasourceId, selectedTable);
            }
        } catch (err) {
            console.error('Error saving view:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualUpdate = async () => {
        if (!datasourceId || !selectedTable) return;

        try {
            setIsSessionLoading(true);

            if (selectedTable) {
                await datasourcesApi.clearSession(datasourceId, selectedTable);
            }
            clearTableCache(String(datasourceId), selectedTable);

            queryClient.removeQueries({ queryKey: ['tableData', datasourceId, selectedTable] });
            queryClient.removeQueries({ queryKey: ['tableSchema', datasourceId, selectedTable] });

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
            setActiveTab('table');
            setIsSessionLoading(false);
        } catch (err) {
            console.error("Manual update failed:", err);
            setIsSessionLoading(false);
        }
    };

    const handleDataSearch = () => {
        if (!dataSearchQuery.trim()) return;
        setShowDataSearchResults(true);
    };

    const refreshSchemaMutation = useMutation({
        mutationFn: () => datasourcesApi.refreshTableSchema(datasourceId, selectedTable),
        onSuccess: (data) => {
            queryClient.setQueryData(['tableSchema', datasourceId, selectedTable], data.data);
        },
    });

    const lastProcessedConfig = useRef<string>("");

    useEffect(() => {
        if (!isOpen) {
            lastProcessedConfig.current = "";
            return;
        }

        const currentPropsKey = JSON.stringify({ datasourceId, table, viewId, initialFilters });
        if (currentPropsKey === lastProcessedConfig.current) return;

        const loadInitialData = async () => {
            setWebhooks(initialWebhooks || []);
            setActiveTab('table');
            setSelectedTable(table);
            if (initialViewName) setViewName(initialViewName);

            setIsSessionLoading(true);
            try {
                if (table) {
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
                        return;
                    }
                }
            } catch (err) {
                console.warn("Failed to load Redis session:", err);
            }

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

    useEffect(() => {
        if (!isOpen || !datasourceId || !selectedTable || isSessionLoading) return;

        const syncToRedis = async () => {
            if (!selectedTable) return;
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

        const timer = setTimeout(syncToRedis, 2000);
        return () => clearTimeout(timer);
    }, [pinnedColumns, columnOrder, visibleColumns, filters, fieldMappings, isOpen, datasourceId, selectedTable, isSessionLoading]);

    useEffect(() => {
        if (!isColumnsDropdownOpen) return;
        const handleClickOutside = () => setIsColumnsDropdownOpen(false);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isColumnsDropdownOpen]);

    const triggerWebhookTest = async (viewId: string) => {
        return viewsApi.trigger(viewId, { test: true, timestamp: new Date().toISOString() });
    };

    return {
        state: {
            filters, appliedFilters, viewName, currentViewId, isSaving, isColumnsDropdownOpen, columnSearch,
            showSaveForm, showSyncConfirm, saveSuccess, activeTab, globalSearch, dataSearchQuery,
            showDataSearchResults, isRenamingView, globalSearchStatus, globalResults,
            isSessionLoading, copySuccess, selectedTable, tableSearch, editingRecord, fieldMappings, linkedViews,
            webhooks, currentStep, isSidebarCollapsed, isWebhookModalOpen, editingWebhookIndex, webhookForm,
            currentMatchIndex, allMatches, pinnedColumns, columnOrder, visibleColumns
        },
        data: {
            tables, schemaData, tableData: data, isLoading, error, isFetchingData, availableFields, tableColumns,
            groupedMatches, filteredTables, filteredRecords, isDataSearching: isSearchingByQuery, searchResults
        },
        actions: {
            setFilters, setAppliedFilters, setViewName, setCurrentViewId, setIsSaving, setIsColumnsDropdownOpen,
            setColumnSearch, setShowSaveForm, setShowSyncConfirm, setSaveSuccess, setActiveTab, setGlobalSearch,
            setDataSearchQuery, setShowDataSearchResults, setIsRenamingView,
            setGlobalSearchStatus, setGlobalResults, setIsSessionLoading, setCopySuccess, setSelectedTable,
            setTableSearch, setEditingRecord, setFieldMappings, setLinkedViews, setWebhooks, setCurrentStep,
            setIsSidebarCollapsed, setIsWebhookModalOpen, setEditingWebhookIndex, setWebhookForm, setCurrentMatchIndex,
            setAllMatches, setColumnOrder, setVisibleColumns, togglePin, toggleVisibility,
            handleNextMatch, handlePrevMatch, copyToClipboard, addFilter, removeFilter, updateFilter,
            runRemoteSearch, searchOtherCollections, searchAllDatasources, handleSaveView, handleManualUpdate,
            handleDataSearch, refreshSchemaMutation, triggerWebhookTest
        }
    };
};
