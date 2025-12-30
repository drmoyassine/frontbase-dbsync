import { formatDistanceToNow } from 'date-fns';
import React from 'react';
import { X, Loader2, AlertCircle, Filter, Plus, Trash2, CheckCircle, Copy, Link as LinkIcon, Save, EyeOff, ChevronDown, Search, Pin, GripHorizontal, RotateCcw, Pencil, RefreshCw, Table } from 'lucide-react';
import { RecordEditor } from './RecordEditor';
import { useDataPreview } from '../hooks/useDataPreview';
import { ColumnsDropdown } from './data-preview/ColumnsDropdown';
import { TableSelectionView } from './data-preview/TableSelectionView';
import { WebhookConfig } from './data-preview/WebhookConfig';
import { SearchBanners } from './data-preview/SearchBanners';
import { DataPreviewModalProps } from '../types/data-preview';
// Removed: useQuery, useMutation, useQueryClient, datasourcesApi, viewsApi, useLayoutStore
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

const DataPreviewModal: React.FC<DataPreviewModalProps> = (props) => {
    const {
        isOpen,
        onClose,
        datasourceId: _datasourceId,
        table: _table,
        datasourceName,
        onViewSaved: _onViewSaved,
        viewId: _viewId,
        initialFilters: _initialFilters,
        initialViewName,
    } = props; const { state, data, actions } = useDataPreview(props);
    const {
        filters, appliedFilters: _appliedFilters, viewName, currentViewId, isSaving, isColumnsDropdownOpen, columnSearch,
        showSaveForm, showSyncConfirm, saveSuccess, activeTab, globalSearch, dataSearchQuery,
        showDataSearchResults, isRenamingView, globalSearchStatus, globalResults,
        isSessionLoading, copySuccess, selectedTable, tableSearch, editingRecord, fieldMappings, linkedViews,
        webhooks, currentStep, isSidebarCollapsed, isWebhookModalOpen, editingWebhookIndex, webhookForm,
        allMatches, pinnedColumns, visibleColumns, currentMatchIndex
    } = state;

    const {
        tables, schemaData, tableData, isLoading, error, isFetchingData, availableFields, tableColumns,
        groupedMatches, filteredTables, filteredRecords, isDataSearching,
        // Infinite scroll support
        hasNextPage, isFetchingNextPage
    } = data;

    const {
        setFilters, setAppliedFilters, setViewName, setIsColumnsDropdownOpen,
        setColumnSearch, setShowSaveForm, setShowSyncConfirm, setActiveTab, setGlobalSearch,
        setDataSearchQuery, setShowDataSearchResults, setIsRenamingView,
        setGlobalResults, setSelectedTable,
        setTableSearch, setEditingRecord, setFieldMappings, setLinkedViews, setWebhooks, setCurrentStep,
        setIsSidebarCollapsed, setIsWebhookModalOpen, setEditingWebhookIndex, setWebhookForm,
        setAllMatches, setColumnOrder, setVisibleColumns, togglePin, toggleVisibility, setCurrentMatchIndex: _setCurrentMatchIndex,
        handleNextMatch, handlePrevMatch, copyToClipboard, addFilter, removeFilter, updateFilter,
        runRemoteSearch, searchOtherCollections, searchAllDatasources, handleSaveView, handleManualUpdate,
        handleDataSearch, refreshSchemaMutation, triggerWebhookTest,
        // Infinite scroll support
        fetchNextPage
    } = actions;

    // Intersection Observer for infinite scroll
    const loadMoreRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Actions Wrapper for UI events that need arguments
    const onNextMatch = () => handleNextMatch(scrollToColumn);
    const onPrevMatch = () => handlePrevMatch(scrollToColumn);

    const scrollToColumn = (columnKey: string) => {
        const tableContainer = document.querySelector('.table-container');
        const th = document.querySelector(`th[data-column-key= "${columnKey}"]`);
        if (tableContainer && th) {
            const thRect = th.getBoundingClientRect();
            const containerRect = tableContainer.getBoundingClientRect();

            const isPinned = pinnedColumns.includes(columnKey);
            if (!isPinned) {
                const scrollLeft = tableContainer.scrollLeft + (thRect.left - containerRect.left) - 64 - (pinnedColumns.length * 150);
                tableContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    };

    // Force re-render periodically to update relative timestamps
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 30000); // 30s
        return () => clearInterval(interval);
    }, []);

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

    // Close columns dropdown on click outside
    React.useEffect(() => {
        if (!isColumnsDropdownOpen) return;
        const handleClickOutside = () => setIsColumnsDropdownOpen(false);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isColumnsDropdownOpen]);

    // API Base URL for Swagger Docs
    // API Base URL for Swagger Docs
    // In production, we use relative paths. In dev, Vite proxies /api to localhost:8000.
    // So we can always resolve relative to window.location.origin if VITE_API_URL is missing/relative.
    const envApiUrl = import.meta.env.VITE_API_URL || '/api';
    const baseUrl = envApiUrl.startsWith('http')
        ? envApiUrl
        : `${window.location.origin}${envApiUrl.startsWith('/') ? envApiUrl : '/' + envApiUrl}`;

    // Remove trailing slash if present then append sync docs path
    const API_DOCS_URL = baseUrl.replace(/\/$/, '') + '/sync/docs/views';
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
                                            className="flex items-center gap-1.5 text-[10px] font-bold text-primary-100 hover:text-white transition-all active:scale-95"
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
                                                    {(tableData as any)?.timestamp_utc ? formatDistanceToNow(new Date((tableData as any).timestamp_utc), { addSuffix: true }) : 'Never'}
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
                        <TableSelectionView
                            tableSearch={tableSearch}
                            setTableSearch={setTableSearch}
                            dataSearchQuery={dataSearchQuery}
                            setDataSearchQuery={setDataSearchQuery}
                            handleDataSearch={handleDataSearch}
                            isDataSearching={isDataSearching}
                            showDataSearchResults={showDataSearchResults}
                            setShowDataSearchResults={setShowDataSearchResults}
                            filteredTables={filteredTables}
                            groupedMatches={groupedMatches}
                            setSelectedTable={setSelectedTable}
                            setCurrentStep={setCurrentStep}
                            setGlobalSearch={setGlobalSearch}
                            setAppliedFilters={setAppliedFilters}
                            setFilters={setFilters}
                        />
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
                                                                <option value=">">{'>'}</option>
                                                                <option value="<">{'<'}</option>
                                                                <option value="contains">contains</option>
                                                                <option value="not_contains">does not contain</option>
                                                                <option value="in">in list</option>
                                                                <option value="not_in">not in list</option>
                                                                <option value="is_empty">is empty</option>
                                                                <option value="is_not_empty">is not empty</option>
                                                            </select>
                                                            {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                                                                <input type="text" placeholder="value" value={filter.value} onChange={(e) => updateFilter(index, 'value', e.target.value)} className="w-32 px-2 py-1 text-xs bg-transparent outline-none border-l border-gray-100 ml-1" />
                                                            )}
                                                            <button onClick={() => removeFilter(index)} className="ml-1 p-1 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                                                        </div>
                                                    ))}

                                                    <div className="flex-1 flex items-center gap-2">
                                                        {tableData && (
                                                            <div className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-bold text-gray-500 flex items-center gap-1.5 shadow-sm">
                                                                <Table size={12} className="text-gray-400" />
                                                                <span>{tableData.total?.toLocaleString() || filteredRecords.length.toLocaleString()} total</span>
                                                                <span className="text-gray-300">/</span>
                                                                <span className="text-gray-400">{tableData.total?.toLocaleString() || '0'}</span>
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
                                                                            onPrevMatch();
                                                                        } else {
                                                                            onNextMatch();
                                                                        }
                                                                    }
                                                                }}
                                                            />
                                                            {globalSearch && (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={onPrevMatch}
                                                                        disabled={allMatches.length === 0}
                                                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-30"
                                                                    >
                                                                        <ChevronDown className="w-4 h-4 rotate-180" />
                                                                    </button>
                                                                    <span className="text-[10px] font-medium text-gray-500 min-w-[3rem] text-center">
                                                                        {allMatches.length > 0 ? `${currentMatchIndex + 1} / ${allMatches.length}` : '0 / 0'}
                                                                    </span>
                                                                    <button
                                                                        onClick={onNextMatch}
                                                                        disabled={allMatches.length === 0}
                                                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-30"
                                                                    >
                                                                        <ChevronDown className="w-4 h-4" />
                                                                    </button>
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
                                                    <ColumnsDropdown
                                                        isColumnsDropdownOpen={isColumnsDropdownOpen}
                                                        setIsColumnsDropdownOpen={setIsColumnsDropdownOpen}
                                                        visibleColumns={visibleColumns}
                                                        availableFields={availableFields}
                                                        columnSearch={columnSearch}
                                                        setColumnSearch={setColumnSearch}
                                                        setVisibleColumns={setVisibleColumns}
                                                        tableData={tableData}
                                                        toggleVisibility={toggleVisibility}
                                                        pinnedColumns={pinnedColumns}
                                                        togglePin={togglePin}
                                                        columnOrder={state.columnOrder}
                                                        setColumnOrder={setColumnOrder}
                                                    />

                                                </div>
                                            </div>
                                            {/* Content area: Table or Record Editor */}
                                            {activeTab === 'table' ? (
                                                <div className="flex-1 overflow-auto p-4 relative">
                                                    {/* No local results banner */}
                                                    {/* Tiered Search Banners */}
                                                    <SearchBanners
                                                        globalSearch={globalSearch}
                                                        filteredRecords={filteredRecords}
                                                        isLoading={isLoading}
                                                        selectedTable={selectedTable}
                                                        datasourceName={datasourceName}
                                                        globalSearchStatus={globalSearchStatus}
                                                        runRemoteSearch={runRemoteSearch}
                                                        searchOtherCollections={searchOtherCollections}
                                                        searchAllDatasources={searchAllDatasources}
                                                        globalResults={globalResults}
                                                        setSelectedTable={setSelectedTable}
                                                        setGlobalResults={setGlobalResults}
                                                        setFilters={setFilters}
                                                        setAppliedFilters={setAppliedFilters}
                                                        setGlobalSearch={setGlobalSearch}
                                                    />

                                                    {(!tableData && (isLoading || isSessionLoading)) ? (
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
                                                                                    const columnMatches = globalSearch && tableData?.records?.some(r => {
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
                                                                                                const fields = (availableFields.length > 0 ? availableFields : Object.keys(tableData?.records?.[0] || {}));
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
                                                            {/* Infinite scroll sentinel */}
                                                            <div
                                                                ref={loadMoreRef}
                                                                className="w-full py-4 flex items-center justify-center"
                                                            >
                                                                {isFetchingNextPage && (
                                                                    <div className="flex items-center gap-2 text-gray-400">
                                                                        <Loader2 className="animate-spin" size={16} />
                                                                        <span className="text-xs font-medium">Loading more records...</span>
                                                                    </div>
                                                                )}
                                                                {!hasNextPage && tableData?.records?.length > 0 && (
                                                                    <span className="text-xs text-gray-400">
                                                                        All {tableData?.total?.toLocaleString()} records loaded
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : activeTab === 'record' && (
                                                <div className="flex-1 overflow-hidden">
                                                    {(!tableData?.records?.[0] && (isLoading || isSessionLoading)) ? (
                                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                                            <Loader2 className="animate-spin" />
                                                            <p className="text-xs">Loading records...</p>
                                                        </div>
                                                    ) : (
                                                        <RecordEditor
                                                            record={editingRecord || (tableData?.records?.[0]) || {}}
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
                                        <WebhookConfig
                                            webhooks={webhooks}
                                            setWebhooks={setWebhooks}
                                            webhookForm={webhookForm}
                                            setWebhookForm={setWebhookForm}
                                            editingWebhookIndex={editingWebhookIndex}
                                            setEditingWebhookIndex={setEditingWebhookIndex}
                                            isWebhookModalOpen={isWebhookModalOpen}
                                            setIsWebhookModalOpen={setIsWebhookModalOpen}
                                            triggerWebhookTest={triggerWebhookTest}
                                            currentViewId={currentViewId}
                                        />
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


                {/* Custom Confirmation Modal */}
                {
                    showSyncConfirm && (
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
                    )
                }
            </div >
        </div >
    );
};

export default DataPreviewModal;
