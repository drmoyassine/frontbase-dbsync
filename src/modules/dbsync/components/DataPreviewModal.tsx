import React, { useEffect, useState } from 'react';
import { useDataPreview } from '../hooks/useDataPreview';
import { DataPreviewModalProps } from '../types/data-preview';
import { DataPreviewHeader } from './data-preview/DataPreviewHeader';
import { DataPreviewToolbar } from './data-preview/DataPreviewToolbar';
import { DataPreviewSidebar } from './data-preview/DataPreviewSidebar';
import { DataPreviewContent } from './data-preview/DataPreviewContent';
import { TableSelectionView } from './data-preview/TableSelectionView';

const DataPreviewModal = (props: DataPreviewModalProps) => {
    const { isOpen, onClose, viewId } = props;
    const {
        state,
        data,
        actions
    } = useDataPreview(props);

    const scrollToColumn = (colKey: string) => {
        const el = document.getElementById(`view-col-${colKey}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    };

    // Destructure state
    const {
        filters, appliedFilters, viewName, currentViewId, isSaving, isColumnsDropdownOpen, columnSearch,
        showSaveForm, showSyncConfirm, saveSuccess, activeTab, globalSearch, dataSearchQuery,
        showDataSearchResults, isRenamingView, globalSearchStatus, globalResults,
        isSessionLoading, copySuccess, selectedTable, tableSearch, editingRecord, fieldMappings, linkedViews,
        webhooks, currentStep, isSidebarCollapsed, isWebhookModalOpen, editingWebhookIndex, webhookForm,
        currentMatchIndex, allMatches, pinnedColumns, columnOrder, visibleColumns
    } = state;

    // Destructure data
    const {
        tables, schemaData, tableData, isLoading, error, isFetchingData, availableFields, tableColumns,
        groupedMatches, filteredTables, filteredRecords, isDataSearching, searchResults,
        hasNextPage, isFetchingNextPage, refreshSchemaMutation
    } = data;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <DataPreviewHeader
                    currentViewId={currentViewId}
                    viewName={viewName}
                    setViewName={actions.setViewName}
                    datasourceName={props.datasourceName}
                    initialViewName={props.initialViewName}
                    isRenamingView={isRenamingView}
                    setIsRenamingView={actions.setIsRenamingView}
                    showSaveForm={showSaveForm}
                    setShowSaveForm={actions.setShowSaveForm}
                    isSaving={isSaving}
                    copySuccess={copySuccess}
                    copyToClipboard={actions.copyToClipboard}
                    handleSaveView={actions.handleSaveView}
                    setCurrentStep={actions.setCurrentStep}
                    setActiveTab={actions.setActiveTab}
                    onClose={onClose}
                />

                <div className="flex-1 overflow-hidden flex flex-col">
                    {currentStep === 'tables' ? (
                        <TableSelectionView
                            tableSearch={tableSearch}
                            setTableSearch={actions.setTableSearch}
                            dataSearchQuery={dataSearchQuery}
                            setDataSearchQuery={actions.setDataSearchQuery}
                            handleDataSearch={actions.handleDataSearch}
                            isDataSearching={isDataSearching}
                            showDataSearchResults={showDataSearchResults}
                            setShowDataSearchResults={actions.setShowDataSearchResults}
                            filteredTables={filteredTables}
                            groupedMatches={groupedMatches}
                            setSelectedTable={actions.setSelectedTable}
                            setCurrentStep={actions.setCurrentStep}
                            setGlobalSearch={actions.setGlobalSearch}
                            setAppliedFilters={actions.setAppliedFilters}
                            setFilters={actions.setFilters}
                        />
                    ) : (
                        <div className="flex-1 flex min-w-0 overflow-hidden">
                            <DataPreviewSidebar
                                isSidebarCollapsed={isSidebarCollapsed}
                                setIsSidebarCollapsed={actions.setIsSidebarCollapsed}
                                tableSearch={tableSearch}
                                setTableSearch={actions.setTableSearch}
                                refreshSchemaMutation={refreshSchemaMutation}
                                selectedTable={selectedTable}
                                tables={tables}
                                setSelectedTable={actions.setSelectedTable}
                                handleManualUpdate={actions.handleManualUpdate}
                                groupedMatches={groupedMatches}
                            />

                            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                                {activeTab === 'table' && (
                                    <DataPreviewToolbar
                                        filters={filters}
                                        updateFilter={actions.updateFilter}
                                        removeFilter={actions.removeFilter}
                                        addFilter={actions.addFilter}
                                        setAppliedFilters={actions.setAppliedFilters}
                                        availableFields={availableFields}
                                        recordCount={tableData?.total || 0}
                                        totalRecords={tableData?.total || 0}
                                        globalSearch={globalSearch}
                                        setGlobalSearch={actions.setGlobalSearch}
                                        allMatches={allMatches}
                                        currentMatchIndex={currentMatchIndex}
                                        handlePrevMatch={actions.handlePrevMatch}
                                        handleNextMatch={(cb) => {
                                            actions.handleNextMatch(cb);
                                        }}
                                        scrollToColumn={scrollToColumn}
                                        isColumnsDropdownOpen={isColumnsDropdownOpen}
                                        setIsColumnsDropdownOpen={actions.setIsColumnsDropdownOpen}
                                        columnSearch={columnSearch}
                                        setColumnSearch={actions.setColumnSearch}
                                        availableTableFields={availableFields || []}
                                        visibleColumns={visibleColumns || []}
                                        toggleVisibility={(col) => actions.toggleVisibility(col, availableFields || [])}
                                        setVisibleColumns={actions.setVisibleColumns}
                                        pinnedColumns={pinnedColumns || []}
                                        columnOrder={columnOrder || []}
                                        togglePin={actions.togglePin}
                                        setColumnOrder={actions.setColumnOrder}
                                    />
                                )}

                                <DataPreviewContent
                                    activeTab={activeTab}
                                    setActiveTab={actions.setActiveTab}
                                    tableData={tableData}
                                    isLoading={isLoading}
                                    isSessionLoading={isSessionLoading}
                                    isFetchingData={isFetchingData}
                                    error={error}
                                    tableColumns={tableColumns}
                                    visibleColumns={visibleColumns}
                                    schemaData={schemaData}
                                    setEditingRecord={actions.setEditingRecord}

                                    globalSearch={globalSearch}
                                    editingRecord={editingRecord}
                                    fieldMappings={fieldMappings}
                                    setFieldMappings={actions.setFieldMappings}
                                    columnSearch={columnSearch}
                                    datasourceId={props.datasourceId}
                                    selectedTable={selectedTable || ''}
                                    linkedViews={linkedViews}
                                    setLinkedViews={actions.setLinkedViews}
                                    webhooks={webhooks}
                                    setWebhooks={actions.setWebhooks}
                                    isWebhookModalOpen={isWebhookModalOpen}
                                    setIsWebhookModalOpen={actions.setIsWebhookModalOpen}
                                    editingWebhookIndex={editingWebhookIndex}
                                    setEditingWebhookIndex={actions.setEditingWebhookIndex}
                                    webhookForm={webhookForm}
                                    setWebhookForm={actions.setWebhookForm}
                                    triggerWebhookTest={actions.triggerWebhookTest}
                                    currentViewId={currentViewId}
                                    allMatches={allMatches}
                                    currentMatchIndex={currentMatchIndex}
                                    recordCount={tableData?.total || 0}
                                    totalRecords={tableData?.total || 0}
                                    handleManualUpdate={actions.handleManualUpdate}
                                    // New props for table features
                                    setColumnOrder={actions.setColumnOrder}
                                    pinnedColumns={pinnedColumns || []}
                                    togglePin={actions.togglePin}
                                    toggleVisibility={actions.toggleVisibility}
                                    availableFields={availableFields || []}
                                    filteredRecords={filteredRecords}
                                    globalSearchStatus={globalSearchStatus}
                                    globalResults={globalResults}
                                    setGlobalResults={actions.setGlobalResults}
                                    setFilters={actions.setFilters}
                                    setAppliedFilters={actions.setAppliedFilters}
                                    setSelectedTable={actions.setSelectedTable}
                                    searchOtherCollections={actions.searchOtherCollections}
                                    searchAllDatasources={actions.searchAllDatasources}
                                    datasourceName={props.datasourceName}
                                    showDataSearchResults={showDataSearchResults}
                                    setShowDataSearchResults={actions.setShowDataSearchResults}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataPreviewModal;
