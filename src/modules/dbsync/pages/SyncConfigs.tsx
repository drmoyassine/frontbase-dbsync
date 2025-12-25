import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Play, Trash2, Loader2 } from 'lucide-react'
import { syncConfigsApi, syncApi, datasourcesApi } from '../api'
import { AddSyncConfigModal } from '../components/sync-configs/AddSyncConfigModal'
import { formatDistanceToNow } from 'date-fns'

const STRATEGY_LABELS: Record<string, string> = {
    source_wins: 'Source Wins',
    target_wins: 'Target Wins',
    manual: 'Manual',
    merge: 'Merge',
    webhook: 'Webhook',
}

export function SyncConfigs() {
    const [showModal, setShowModal] = useState(false)
    const queryClient = useQueryClient()

    const { data: configs, isLoading } = useQuery({
        queryKey: ['sync-configs'],
        queryFn: () => syncConfigsApi.list().then(r => r.data),
    })

    const { data: datasources } = useQuery({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => syncConfigsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sync-configs'] })
        },
    })

    const executeMutation = useMutation({
        mutationFn: (configId: string) => syncApi.execute(configId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
        },
    })

    const getDatasourceName = (id: string) => {
        return datasources?.find(d => d.id === id)?.name || 'Unknown'
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Sync Configurations</h1>
                    <p className="text-gray-500 dark:text-gray-400">Define how data syncs between databases</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Sync Config
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : configs?.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <RefreshCw className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No sync configurations</h3>
                    <p className="text-gray-500 mb-4">Create a sync configuration to start syncing data.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {configs?.map((config) => (
                        <div
                            key={config.id}
                            className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="font-semibold text-lg">{config.name}</h3>
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${config.is_active ? 'status-success' : 'status-warning'}`}>
                                            {config.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    {config.description && (
                                        <p className="text-sm text-gray-500 mb-3">{config.description}</p>
                                    )}
                                    <div className="flex items-center gap-6 text-sm">
                                        <div>
                                            <span className="text-gray-500">Master:</span>
                                            <span className="ml-1 font-medium">{getDatasourceName(config.master_datasource_id)}</span>
                                            <span className="text-gray-400 ml-1">({config.master_table})</span>
                                        </div>
                                        <span className="text-gray-400">→</span>
                                        <div>
                                            <span className="text-gray-500">Slave:</span>
                                            <span className="ml-1 font-medium">{getDatasourceName(config.slave_datasource_id)}</span>
                                            <span className="text-gray-400 ml-1">({config.slave_table})</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                        <span>Strategy: {STRATEGY_LABELS[config.conflict_strategy]}</span>
                                        <span>{config.field_mappings.length} field mappings</span>
                                        {config.last_sync_at && (
                                            <span>Last sync: {formatDistanceToNow(new Date(config.last_sync_at), { addSuffix: true })}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => executeMutation.mutate(config.id)}
                                        disabled={executeMutation.isPending}
                                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                    >
                                        {executeMutation.isPending && executeMutation.variables === config.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Play className="w-4 h-4" />
                                        )}
                                        Sync Now
                                    </button>
                                    <button
                                        onClick={() => deleteMutation.mutate(config.id)}
                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <AddSyncConfigModal
                    onClose={() => setShowModal(false)}
                    datasources={datasources || []}
                />
            )}
        </div>
    )
}


