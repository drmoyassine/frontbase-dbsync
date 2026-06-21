import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { datasourcesApi } from '../api';
import { TableSchema } from '../types';
import { RelationshipDefinition, RelationshipType } from '../types/relationship';
import { Link2, Plus, Trash2, XCircle, Loader2, CheckCircle, ArrowRight } from 'lucide-react';

interface RelationshipModalProps {
    datasourceId: string;
    datasourceName: string;
    onClose: () => void;
}

const RELATIONSHIP_TYPES: { value: RelationshipType; label: string }[] = [
    { value: 'many_to_one', label: 'Many → One' },
    { value: 'one_to_one', label: 'One → One' },
    { value: 'one_to_many', label: 'One → Many' },
    { value: 'many_to_many', label: 'Many → Many' },
];

const EMPTY_REL: RelationshipDefinition = {
    from_table: '',
    from_column: '',
    to_table: '',
    to_column: '',
    relationship_type: 'many_to_one',
    label: '',
    cascade_delete: false,
};

export function RelationshipModal({ datasourceId, datasourceName, onClose }: RelationshipModalProps) {
    const queryClient = useQueryClient();
    const [newRel, setNewRel] = useState<RelationshipDefinition>({ ...EMPTY_REL });

    // Tables for this datasource
    const { data: tables = [], isLoading: tablesLoading } = useQuery({
        queryKey: ['datasource-tables', datasourceId],
        queryFn: () => datasourcesApi.getTables(datasourceId).then(r => r.data),
    });

    // Existing user-defined relationships
    const { data: userRelsData, isLoading: relsLoading } = useQuery({
        queryKey: ['datasource-user-relationships', datasourceId],
        queryFn: () => datasourcesApi.listUserRelationships(datasourceId).then(r => r.data),
    });
    const userRels = userRelsData?.relationships || [];

    // Schema cache: fetch column lists for tables referenced in the form.
    // We fetch both the from_table and to_table schemas so the column
    // dropdowns are populated.
    const { data: fromSchema } = useTableSchema(datasourceId, newRel.from_table);
    const { data: toSchema } = useTableSchema(datasourceId, newRel.to_table);

    const fromColumns = useMemo(() => (fromSchema?.columns || []).map(c => c.name), [fromSchema]);
    const toColumns = useMemo(() => (toSchema?.columns || []).map(c => c.name), [toSchema]);

    const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: ['datasource-user-relationships', datasourceId] });
        queryClient.invalidateQueries({ queryKey: ['datasource-relationships', datasourceId] });
        queryClient.invalidateQueries({ queryKey: ['datasources'] });
    };

    const createMutation = useMutation({
        mutationFn: (data: RelationshipDefinition) => datasourcesApi.createUserRelationship(datasourceId, data),
        onSuccess: () => {
            invalidateAll();
            setNewRel({ ...EMPTY_REL });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (index: number) => datasourcesApi.deleteUserRelationship(datasourceId, index),
        onSuccess: () => invalidateAll(),
    });

    const canCreate = newRel.from_table && newRel.from_column && newRel.to_table && newRel.to_column;

    const handleCreate = () => {
        if (!canCreate) return;
        createMutation.mutate(newRel);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:white flex items-center gap-2">
                            <Link2 className="w-5 h-5 text-primary-600" />
                            Define Relationships
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {datasourceName} — link tables with foreign keys (used like native SQL FKs)
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Existing relationships */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                            Defined Relationships ({userRels.length})
                        </h3>
                        {relsLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                            </div>
                        ) : userRels.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 italic">
                                No relationships defined yet. Add one below.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {userRels.map((rel) => (
                                    <div
                                        key={rel.index}
                                        className="group flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-100 dark:border-gray-700"
                                    >
                                        <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
                                            <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                                                {rel.from_table}.{rel.from_column}
                                            </span>
                                            <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                            <span className="font-medium text-gray-700 dark:text-gray-200 truncate">
                                                {rel.to_table}.{rel.to_column}
                                            </span>
                                            <span className="text-[10px] px-1.5 py-0.5 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 rounded-full flex-shrink-0">
                                                {rel.relationship_type || 'many_to_one'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => deleteMutation.mutate(rel.index)}
                                            disabled={deleteMutation.isPending}
                                            className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                                            title="Delete relationship"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Add new relationship */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/30 space-y-4">
                        <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Add Relationship
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            {/* From */}
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600 dark:text-gray-400">From Table</label>
                                    <ColumnSelect
                                        value={newRel.from_table}
                                        onChange={(v) => setNewRel({ ...newRel, from_table: v, from_column: '' })}
                                        options={tables}
                                        placeholder="Select table"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600 dark:text-gray-400">From Column (FK)</label>
                                    <ColumnSelect
                                        value={newRel.from_column}
                                        onChange={(v) => setNewRel({ ...newRel, from_column: v })}
                                        options={fromColumns}
                                        placeholder="Select column"
                                        disabled={!newRel.from_table}
                                    />
                                </div>
                            </div>

                            {/* To */}
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600 dark:text-gray-400">To Table</label>
                                    <ColumnSelect
                                        value={newRel.to_table}
                                        onChange={(v) => setNewRel({ ...newRel, to_table: v, to_column: '' })}
                                        options={tables}
                                        placeholder="Select table"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1 text-gray-600 dark:text-gray-400">To Column (PK)</label>
                                    <ColumnSelect
                                        value={newRel.to_column}
                                        onChange={(v) => setNewRel({ ...newRel, to_column: v })}
                                        options={toColumns}
                                        placeholder="Select column"
                                        disabled={!newRel.to_table}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600 dark:text-gray-400">Relationship Type</label>
                                <select
                                    value={newRel.relationship_type}
                                    onChange={(e) => setNewRel({ ...newRel, relationship_type: e.target.value as RelationshipType })}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                                >
                                    {RELATIONSHIP_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-gray-600 dark:text-gray-400">Label (optional)</label>
                                <input
                                    type="text"
                                    value={newRel.label || ''}
                                    onChange={(e) => setNewRel({ ...newRel, label: e.target.value })}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                                    placeholder="e.g. User Department"
                                />
                            </div>
                        </div>

                        {createMutation.isError && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                                {(createMutation.error as any)?.response?.data?.detail || (createMutation.error as Error).message}
                            </p>
                        )}
                        {createMutation.isSuccess && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> Relationship added
                            </p>
                        )}

                        <button
                            onClick={handleCreate}
                            disabled={!canCreate || createMutation.isPending}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {createMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Plus className="w-4 h-4" />
                            )}
                            Add Relationship
                        </button>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2.5 text-sm font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Small reusable select for table/column dropdowns. */
function ColumnSelect({
    value, onChange, options, placeholder, disabled,
}: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
    placeholder?: string;
    disabled?: boolean;
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <option value="">{placeholder || 'Select...'}</option>
            {options.map(o => (
                <option key={o} value={o}>{o}</option>
            ))}
        </select>
    );
}

/** Fetch a table's schema (columns) — used to populate column dropdowns. */
function useTableSchema(datasourceId: string, table: string) {
    return useQuery({
        queryKey: ['datasource-table-schema', datasourceId, table],
        queryFn: () => datasourcesApi.getTableSchema(datasourceId, table).then(r => r.data),
        enabled: !!table,
        staleTime: 5 * 60 * 1000,
    });
}
