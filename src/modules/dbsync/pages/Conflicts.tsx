import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { syncApi, syncConfigsApi, Conflict } from '../api'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'

export function Conflicts() {
    const [selectedConfig, setSelectedConfig] = useState<string>('')
    const queryClient = useQueryClient()

    const { data: configs } = useQuery({
        queryKey: ['sync-configs'],
        queryFn: () => syncConfigsApi.list().then(r => r.data),
    })

    const { data: conflicts, isLoading } = useQuery({
        queryKey: ['conflicts', selectedConfig],
        queryFn: () => selectedConfig
            ? syncApi.getConflicts(selectedConfig, 'pending').then(r => r.data)
            : Promise.resolve([]),
        enabled: !!selectedConfig,
    })

    const resolveMutation = useMutation({
        mutationFn: ({ configId, conflictId, resolution }: { configId: string; conflictId: string; resolution: string }) =>
            syncApi.resolveConflict(configId, conflictId, { resolution }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['conflicts'] })
        },
    })

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Conflicts</h1>
                <p className="text-gray-500 dark:text-gray-400">Review and resolve data conflicts</p>
            </div>

            {/* Config selector */}
            <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Sync Configuration:</label>
                <select
                    value={selectedConfig}
                    onChange={(e) => setSelectedConfig(e.target.value)}
                    className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                >
                    <option value="">Select a config...</option>
                    {configs?.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {!selectedConfig ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <AlertTriangle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Select a sync configuration</h3>
                    <p className="text-gray-500">Choose a configuration to view its pending conflicts.</p>
                </div>
            ) : isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : conflicts?.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <Check className="w-12 h-12 mx-auto text-green-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No conflicts!</h3>
                    <p className="text-gray-500">All data is synchronized.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {conflicts?.map((conflict) => (
                        <ConflictCard
                            key={conflict.id}
                            conflict={conflict}
                            onResolve={(resolution) =>
                                resolveMutation.mutate({
                                    configId: selectedConfig,
                                    conflictId: conflict.id,
                                    resolution
                                })
                            }
                            isResolving={resolveMutation.isPending && resolveMutation.variables?.conflictId === conflict.id}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function ConflictCard({
    conflict,
    onResolve,
    isResolving,
}: {
    conflict: Conflict
    onResolve: (resolution: string) => void
    isResolving: boolean
}) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-100 dark:border-yellow-900/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <span className="font-medium">Record: {conflict.record_key}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(conflict.created_at), { addSuffix: true })}
                    </span>
                </div>
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                    Conflicting fields: {conflict.conflicting_fields.join(', ')}
                </p>
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-700">
                {/* Master data */}
                <div className="p-4">
                    <h4 className="text-sm font-medium text-blue-600 mb-2">Master Data</h4>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(conflict.master_data, null, 2)}
                    </pre>
                </div>

                {/* Slave data */}
                <div className="p-4">
                    <h4 className="text-sm font-medium text-purple-600 mb-2">Slave Data</h4>
                    <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(conflict.slave_data, null, 2)}
                    </pre>
                </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-2">
                <button
                    onClick={() => onResolve('slave')}
                    disabled={isResolving}
                    className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                    Keep Slave
                </button>
                <button
                    onClick={() => onResolve('skip')}
                    disabled={isResolving}
                    className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                    Skip
                </button>
                <button
                    onClick={() => onResolve('master')}
                    disabled={isResolving}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {isResolving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Use Master
                </button>
            </div>
        </div>
    )
}
