import React from 'react';
import { Loader2, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { ExpressionEditor } from '../ExpressionEditor';

interface StepMappingsProps {
    fieldMappings: { master_column: string; slave_column: string; transform?: string, is_key_field: boolean }[];
    masterSchema: any;
    slaveSchema: any;
    isLoadingMasterSchema: boolean;
    isLoadingSlaveSchema: boolean;
    onAddMapping: () => void;
    onUpdateMapping: (index: number, field: string, value: any) => void;
    onRemoveMapping: (index: number) => void;
    onAutoMap: () => void;
}

export const StepMappings: React.FC<StepMappingsProps> = ({
    fieldMappings,
    masterSchema,
    slaveSchema,
    isLoadingMasterSchema,
    isLoadingSlaveSchema,
    onAddMapping,
    onUpdateMapping,
    onRemoveMapping,
    onAutoMap
}) => {
    return (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between bg-gray-50/80 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-700">
                <div>
                    <h5 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">Define Field Relations</h5>
                    <p className="text-[10px] text-gray-500 mt-0.5">Map master columns to slave counterparts and apply transformations.</p>
                </div>
                <div className="flex items-center gap-3">
                    {(isLoadingMasterSchema || isLoadingSlaveSchema) ? (
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-[10px] font-bold text-gray-400">
                            <Loader2 size={12} className="animate-spin" /> Fetching Schema...
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={onAutoMap}
                            className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-primary-600 text-primary-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-primary-50 transition-all"
                        >
                            Auto-Map Fields
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onAddMapping}
                        className="px-4 py-2 bg-primary-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20"
                    >
                        + Manual Relation
                    </button>
                </div>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 pb-4">
                {(fieldMappings || []).map((mapping, index) => (
                    <div key={index} className="flex gap-4 items-center bg-white dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm group hover:border-primary-200 transition-all">
                        <div className="flex-1">
                            <select
                                value={mapping.master_column || ''}
                                onChange={(e) => onUpdateMapping(index, 'master_column', e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold text-xs"
                            >
                                <option value="">Master field...</option>
                                {(masterSchema?.columns || []).map((c: any) => (
                                    <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                                ))}
                            </select>
                        </div>
                        <div className="text-primary-600">
                            <ChevronRight size={16} strokeWidth={3} />
                        </div>
                        <div className="flex-1">
                            <select
                                value={mapping.slave_column || ''}
                                onChange={(e) => onUpdateMapping(index, 'slave_column', e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900/80 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all font-bold text-xs"
                            >
                                <option value="">Slave field...</option>
                                {(slaveSchema?.columns || []).map((c: any) => (
                                    <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-[1.5]">
                            <ExpressionEditor
                                value={mapping.transform || ''}
                                onChange={(val: string) => onUpdateMapping(index, 'transform', val)}
                                variables={masterSchema?.columns.map((c: any) => ({ name: c.name, type: c.type })) || []}
                                placeholder="Template or calculation..."
                                className="min-w-[200px]"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase bg-gray-50 dark:bg-gray-900/80 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-white transition-all">
                            <input
                                type="checkbox"
                                checked={mapping.is_key_field}
                                onChange={(e) => onUpdateMapping(index, 'is_key_field', e.target.checked)}
                                className="w-4 h-4 rounded-lg accent-primary-600 border-gray-300"
                            />
                            PK
                        </label>
                        <button
                            type="button"
                            onClick={() => onRemoveMapping(index)}
                            className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}

                {fieldMappings.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 bg-gray-50/30 dark:bg-gray-900/10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-[2rem]">
                        <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-xl mb-4 text-gray-300">
                            <RefreshCw size={32} />
                        </div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No mappings defined yet</p>
                        <p className="text-[10px] text-gray-500 mt-2">Use auto-map or add fields manually to continue.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
