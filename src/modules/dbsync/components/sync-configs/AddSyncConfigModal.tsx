import React, { useState } from 'react';
import { XCircle, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasourcesApi, viewsApi, syncConfigsApi, DatasourceView } from '../../api';
import DataPreviewModal from '../DataPreviewModal';
import { StepBasics } from './StepBasics';
import { StepDatasources } from './StepDatasources';
import { StepMappings } from './StepMappings';

interface AddSyncConfigModalProps {
    onClose: () => void;
    datasources: { id: string; name: string }[];
}

export type WizardStep = 'basics' | 'datasources' | 'mappings';

export const AddSyncConfigModal: React.FC<AddSyncConfigModalProps> = ({ onClose, datasources }) => {
    const queryClient = useQueryClient();
    const [step, setStep] = useState<WizardStep>('basics');

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        master_datasource_id: '',
        slave_datasource_id: '',
        master_table: '',
        slave_table: '',
        master_view_id: '' as string | null,
        slave_view_id: '' as string | null,
        master_pk_column: 'id',
        slave_pk_column: 'id',
        conflict_strategy: 'source_wins' as 'source_wins' | 'target_wins' | 'manual' | 'merge' | 'webhook',
        webhook_url: '',
        batch_size: 100,
        sync_deletes: false,
        field_mappings: [] as { master_column: string; slave_column: string; transform?: string, is_key_field: boolean }[],
    });

    const [inspectorData, setInspectorData] = useState<{
        isOpen: boolean;
        datasourceId: string | number;
        table: string;
        name: string;
        filters?: any[];
        viewId?: string;
        viewName?: string;
        visibleColumns?: string[];
        pinnedColumns?: string[];
        columnOrder?: string[];
    }>({
        isOpen: false,
        datasourceId: '',
        table: '',
        name: '',
        viewName: '',
        visibleColumns: [],
        pinnedColumns: [],
        columnOrder: []
    });

    // Queries (Keeping them here for now, might move to sub-components if needed)
    const { data: masterTables, isLoading: isLoadingMasterTables } = useQuery({
        queryKey: ['tables', formData.master_datasource_id],
        queryFn: () => datasourcesApi.getTables(formData.master_datasource_id).then(r => r.data),
        enabled: !!formData.master_datasource_id && step === 'datasources',
    });

    const { data: slaveTables, isLoading: isLoadingSlaveTables } = useQuery({
        queryKey: ['tables', formData.slave_datasource_id],
        queryFn: () => datasourcesApi.getTables(formData.slave_datasource_id).then(r => r.data),
        enabled: !!formData.slave_datasource_id && step === 'datasources',
    });

    const { data: masterViews } = useQuery({
        queryKey: ['views', formData.master_datasource_id],
        queryFn: () => viewsApi.list(formData.master_datasource_id).then(r => r.data as DatasourceView[]),
        enabled: !!formData.master_datasource_id && step === 'datasources',
    });

    const { data: slaveViews } = useQuery({
        queryKey: ['views', formData.slave_datasource_id],
        queryFn: () => viewsApi.list(formData.slave_datasource_id).then(r => r.data as DatasourceView[]),
        enabled: !!formData.slave_datasource_id && step === 'datasources',
    });

    const { data: masterSchema, isLoading: isLoadingMasterSchema } = useQuery({
        queryKey: ['schema', formData.master_datasource_id, formData.master_table],
        queryFn: () => datasourcesApi.getTableSchema(formData.master_datasource_id, formData.master_table).then(r => r.data),
        enabled: !!formData.master_datasource_id && !!formData.master_table && step === 'mappings',
    });

    const { data: slaveSchema, isLoading: isLoadingSlaveSchema } = useQuery({
        queryKey: ['schema', formData.slave_datasource_id, formData.slave_table],
        queryFn: () => datasourcesApi.getTableSchema(formData.slave_datasource_id, formData.slave_table).then(r => r.data),
        enabled: !!formData.slave_datasource_id && !!formData.slave_table && step === 'mappings',
    });

    const createMutation = useMutation({
        mutationFn: (data: typeof formData) => syncConfigsApi.create(data as any),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
            onClose();
        },
    });

    const openInspector = (datasourceId: string | number, table: string, filters?: any[], viewId?: string, viewName?: string, visibleColumns?: string[], pinnedColumns?: string[], columnOrder?: string[]) => {
        const ds = datasources.find(d => String(d.id) === String(datasourceId));
        setInspectorData({
            isOpen: true,
            datasourceId,
            table,
            name: ds?.name || 'Datasource',
            filters,
            viewId,
            viewName,
            visibleColumns,
            pinnedColumns,
            columnOrder
        });
    };

    const handleAutoMap = () => {
        if (!masterSchema || !slaveSchema) return;

        const newMappings = masterSchema.columns.map(mCol => {
            const sCol = slaveSchema.columns.find(sc => sc.name.toLowerCase() === mCol.name.toLowerCase());
            if (sCol) {
                return {
                    master_column: mCol.name,
                    slave_column: sCol.name,
                    is_key_field: mCol.primary_key || sCol.primary_key
                };
            }
            return null;
        }).filter(m => m !== null) as any[];

        setFormData({ ...formData, field_mappings: newMappings });
    };

    const updateMapping = (index: number, field: string, value: string | boolean) => {
        const mappings = [...formData.field_mappings];
        mappings[index] = { ...mappings[index], [field]: value };
        setFormData({ ...formData, field_mappings: mappings });
    };

    const addMapping = () => {
        setFormData({
            ...formData,
            field_mappings: [
                ...formData.field_mappings,
                { master_column: '', slave_column: '', transform: '', is_key_field: false },
            ],
        });
    };

    const removeMapping = (index: number) => {
        setFormData({
            ...formData,
            field_mappings: formData.field_mappings.filter((_, i) => i !== index),
        });
    };

    const renderStepIndicator = () => (
        <div className="flex items-center justify-between px-8 py-4 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
            {[
                { id: 'basics', label: 'Basics' },
                { id: 'datasources', label: 'Sources' },
                { id: 'mappings', label: 'Mappings' }
            ].map((s, idx) => (
                <React.Fragment key={s.id}>
                    <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step === s.id ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' :
                            (idx < ['basics', 'datasources', 'mappings'].indexOf(step)) ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                            }`}>
                            {idx < ['basics', 'datasources', 'mappings'].indexOf(step) ? <CheckCircle size={12} /> : idx + 1}
                        </div>
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${step === s.id ? 'text-primary-600' : 'text-gray-400'}`}>
                            {s.label}
                        </span>
                    </div>
                    {idx < 2 && <div className="flex-1 mx-4 h-px bg-gray-100 dark:bg-gray-700" />}
                </React.Fragment>
            ))}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">

                {/* Header */}
                <div className="p-8 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Sync Configuration Wizard</h2>
                        <p className="text-[10px] text-primary-600 font-bold uppercase tracking-widest mt-1">Configure automated data synchronization</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl transition-all">
                        <XCircle size={24} className="text-gray-400" />
                    </button>
                </div>

                {renderStepIndicator()}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8">
                    {step === 'basics' && (
                        <StepBasics
                            formData={formData}
                            onChange={(field, value) => setFormData({ ...formData, [field]: value })}
                        />
                    )}

                    {step === 'datasources' && (
                        <StepDatasources
                            formData={formData}
                            datasources={datasources}
                            masterTables={masterTables}
                            slaveTables={slaveTables}
                            masterViews={masterViews}
                            slaveViews={slaveViews}
                            isLoadingMasterTables={isLoadingMasterTables}
                            isLoadingSlaveTables={isLoadingSlaveTables}
                            onChange={(updates) => setFormData({ ...formData, ...updates })}
                            openInspector={openInspector}
                        />
                    )}

                    {step === 'mappings' && (
                        <StepMappings
                            fieldMappings={formData.field_mappings}
                            masterSchema={masterSchema}
                            slaveSchema={slaveSchema}
                            isLoadingMasterSchema={isLoadingMasterSchema}
                            isLoadingSlaveSchema={isLoadingSlaveSchema}
                            onAddMapping={addMapping}
                            onUpdateMapping={updateMapping}
                            onRemoveMapping={removeMapping}
                            onAutoMap={handleAutoMap}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10 flex justify-between items-center">
                    <button
                        type="button"
                        onClick={step === 'basics' ? onClose : () => setStep(step === 'mappings' ? 'datasources' : 'basics')}
                        className="px-8 py-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-2xl text-xs font-bold hover:bg-gray-50 transition-all flex items-center gap-2 active:scale-95"
                    >
                        {step === 'basics' ? 'Cancel Wizard' : <><ChevronLeft size={16} /> Back</>}
                    </button>

                    <div className="flex gap-4">
                        {step !== 'mappings' ? (
                            <button
                                type="button"
                                onClick={() => setStep(step === 'basics' ? 'datasources' : 'mappings')}
                                disabled={(step === 'basics' && !formData.name) || (step === 'datasources' && (!formData.master_table || !formData.slave_table))}
                                className="px-10 py-4 bg-primary-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary-500/20 hover:bg-primary-700 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
                            >
                                Continue <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => createMutation.mutate(formData)}
                                disabled={createMutation.isPending || formData.field_mappings.length === 0}
                                className="px-10 py-4 bg-green-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-green-500/20 hover:bg-green-700 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
                            >
                                {createMutation.isPending ? 'Deploying...' : 'Deploy Configuration'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Data Inspector Integration */}
                <DataPreviewModal
                    isOpen={inspectorData.isOpen}
                    onClose={() => setInspectorData({ ...inspectorData, isOpen: false })}
                    datasourceId={inspectorData.datasourceId}
                    table={inspectorData.table}
                    datasourceName={inspectorData.name}
                    initialFilters={inspectorData.filters}
                    viewId={inspectorData.viewId}
                    initialViewName={inspectorData.viewName}
                    initialVisibleColumns={inspectorData.visibleColumns}
                    initialPinnedColumns={inspectorData.pinnedColumns}
                    initialColumnOrder={inspectorData.columnOrder}
                    onViewSaved={(view) => {
                        queryClient.invalidateQueries({ queryKey: ['views'] });
                        queryClient.invalidateQueries({ queryKey: ['datasources'] });
                        setInspectorData(curr => ({
                            ...curr,
                            viewId: view.id,
                            viewName: view.name,
                            filters: view.filters,
                            visibleColumns: view.visible_columns,
                            pinnedColumns: view.pinned_columns,
                            columnOrder: view.column_order
                        }));
                    }}
                />
            </div>
        </div>
    );
};
