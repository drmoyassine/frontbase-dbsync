import React from 'react';
import { Database } from 'lucide-react';
import { DatasourceView } from '../../api';

interface StepDatasourcesProps {
    formData: {
        master_datasource_id: string;
        slave_datasource_id: string;
        master_table: string;
        slave_table: string;
        master_view_id: string | null;
        slave_view_id: string | null;
    };
    datasources: { id: string; name: string }[];
    masterTables: string[] | undefined;
    slaveTables: string[] | undefined;
    masterViews: DatasourceView[] | undefined;
    slaveViews: DatasourceView[] | undefined;
    isLoadingMasterTables: boolean;
    isLoadingSlaveTables: boolean;
    onChange: (updates: Partial<StepDatasourcesProps['formData']>) => void;
    openInspector: (datasourceId: string | number, table: string, filters?: any[], viewId?: string, viewName?: string, visibleColumns?: string[], pinnedColumns?: string[], columnOrder?: string[]) => void;
}

export const StepDatasources: React.FC<StepDatasourcesProps> = ({
    formData,
    datasources,
    masterTables,
    slaveTables,
    masterViews,
    slaveViews,
    isLoadingMasterTables,
    isLoadingSlaveTables,
    onChange,
    openInspector
}) => {
    return (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-2 gap-8">
                {/* Master Selection */}
                <div className="space-y-4">
                    <div className="p-4 bg-primary-50/50 dark:bg-primary-900/10 rounded-2xl border border-primary-100 dark:border-primary-800/50">
                        <h4 className="flex items-center gap-2 text-xs font-black text-primary-900 dark:text-primary-100 uppercase tracking-wider mb-4">
                            <Database className="w-4 h-4" /> Master / Source
                        </h4>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Datasource</label>
                                <select
                                    value={formData.master_datasource_id || ''}
                                    onChange={(e) => onChange({ master_datasource_id: e.target.value, master_table: '', master_view_id: null })}
                                    className="w-full px-4 py-3 bg-white dark:bg-gray-900/80 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold text-sm"
                                    required
                                >
                                    <option value="">Select source...</option>
                                    {datasources.map(ds => (
                                        <option key={ds.id} value={String(ds.id)}>{ds.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5 ml-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Table / View</label>
                                    {formData.master_table && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const view = masterViews?.find(v => v.id === formData.master_view_id);
                                                openInspector(formData.master_datasource_id, formData.master_table, view?.filters, view?.id, view?.name, view?.visible_columns, view?.pinned_columns, view?.column_order);
                                            }}
                                            className="text-[9px] font-bold text-primary-600 hover:underline uppercase"
                                        >
                                            Inspect Data
                                        </button>
                                    )}
                                </div>
                                <select
                                    value={formData.master_view_id || formData.master_table || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const view = masterViews?.find(v => v.id === val);
                                        if (view) {
                                            onChange({ master_view_id: view.id, master_table: view.target_table });
                                        } else {
                                            onChange({ master_view_id: null, master_table: val });
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-white dark:bg-gray-900/80 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold text-sm"
                                    disabled={!formData.master_datasource_id || isLoadingMasterTables}
                                >
                                    <option value="">{isLoadingMasterTables ? 'Loading...' : 'Select resource...'}</option>
                                    {masterViews && masterViews.length > 0 && (
                                        <optgroup label="Saved Views">
                                            {masterViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </optgroup>
                                    )}
                                    <optgroup label="Tables / Resources">
                                        {masterTables && masterTables.length > 0 ? (
                                            masterTables.map(t => <option key={t} value={t}>{t}</option>)
                                        ) : (
                                            <option disabled>No tables found</option>
                                        )}
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Slave Selection */}
                <div className="space-y-4">
                    <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-800/50">
                        <h4 className="flex items-center gap-2 text-xs font-black text-orange-900 dark:text-orange-100 uppercase tracking-wider mb-4">
                            <Database className="w-4 h-4" /> Slave / Target
                        </h4>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Datasource</label>
                                <select
                                    value={formData.slave_datasource_id || ''}
                                    onChange={(e) => onChange({ slave_datasource_id: e.target.value, slave_table: '', slave_view_id: null })}
                                    className="w-full px-4 py-3 bg-white dark:bg-gray-900/80 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all font-bold text-sm"
                                    required
                                >
                                    <option value="">Select target...</option>
                                    {datasources.map(ds => (
                                        <option key={ds.id} value={String(ds.id)}>{ds.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5 ml-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Table / View</label>
                                    {formData.slave_table && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const view = slaveViews?.find(v => v.id === formData.slave_view_id);
                                                openInspector(formData.slave_datasource_id, formData.slave_table, view?.filters, view?.id, view?.name, view?.visible_columns, view?.pinned_columns, view?.column_order);
                                            }}
                                            className="text-[9px] font-bold text-orange-600 hover:underline uppercase"
                                        >
                                            Inspect Data
                                        </button>
                                    )}
                                </div>
                                <select
                                    value={formData.slave_view_id || formData.slave_table || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const view = slaveViews?.find(v => v.id === val);
                                        if (view) {
                                            onChange({ slave_view_id: view.id, slave_table: view.target_table });
                                        } else {
                                            onChange({ slave_view_id: null, slave_table: val });
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-white dark:bg-gray-900/80 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all font-bold text-sm"
                                    disabled={!formData.slave_datasource_id || isLoadingSlaveTables}
                                >
                                    <option value="">{isLoadingSlaveTables ? 'Loading...' : 'Select destination...'}</option>
                                    {slaveViews && slaveViews.length > 0 && (
                                        <optgroup label="Saved Views">
                                            {slaveViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </optgroup>
                                    )}
                                    <optgroup label="Tables / Resources">
                                        {slaveTables && slaveTables.length > 0 ? (
                                            slaveTables.map(t => <option key={t} value={t}>{t}</option>)
                                        ) : (
                                            <option disabled>No tables found</option>
                                        )}
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
