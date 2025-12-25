import { useQuery } from '@tanstack/react-query'
import { History, CheckCircle, XCircle, RefreshCw, Clock, Loader2 } from 'lucide-react'
import { syncApi, syncConfigsApi, SyncJob } from '../api'
import { formatDistanceToNow, format } from 'date-fns'

export function Jobs() {
    const { data: jobs, isLoading } = useQuery({
        queryKey: ['jobs'],
        queryFn: () => syncApi.listJobs(undefined, 50).then(r => r.data),
        refetchInterval: 5000, // Auto-refresh for running jobs
    })

    const { data: configs } = useQuery({
        queryKey: ['sync-configs'],
        queryFn: () => syncConfigsApi.list().then(r => r.data),
    })

    const getConfigName = (id: string) => {
        return configs?.find(c => c.id === id)?.name || 'Unknown'
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Sync Jobs</h1>
                <p className="text-gray-500 dark:text-gray-400">View sync job history and status</p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : jobs?.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <History className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No jobs yet</h3>
                    <p className="text-gray-500">Run a sync to see job history here.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Config</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Records</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {jobs?.map((job) => (
                                <JobRow key={job.id} job={job} configName={getConfigName(job.sync_config_id)} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function JobRow({ job, configName }: { job: SyncJob; configName: string }) {
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                    <StatusIcon status={job.status} />
                    <span className="capitalize text-sm">{job.status}</span>
                </div>
            </td>
            <td className="px-4 py-4">
                <span className="font-medium">{configName}</span>
                <span className="text-xs text-gray-400 ml-2">via {job.triggered_by}</span>
            </td>
            <td className="px-4 py-4">
                <div className="w-32">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>{job.processed_records}/{job.total_records}</span>
                        <span>{Math.round(job.progress_percent)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${job.status === 'completed' ? 'bg-green-500' :
                                    job.status === 'failed' ? 'bg-red-500' :
                                        'bg-blue-500'
                                }`}
                            style={{ width: `${job.progress_percent}%` }}
                        />
                    </div>
                </div>
            </td>
            <td className="px-4 py-4 text-sm">
                <span className="text-green-600">+{job.inserted_records}</span>
                <span className="text-gray-400 mx-1">/</span>
                <span className="text-blue-600">~{job.updated_records}</span>
                {job.deleted_records > 0 && (
                    <>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-red-600">-{job.deleted_records}</span>
                    </>
                )}
                {job.conflict_count > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded">
                        {job.conflict_count} conflicts
                    </span>
                )}
            </td>
            <td className="px-4 py-4 text-sm text-gray-500">
                {job.duration_seconds
                    ? `${job.duration_seconds.toFixed(1)}s`
                    : job.status === 'running'
                        ? 'Running...'
                        : '-'
                }
            </td>
            <td className="px-4 py-4 text-sm text-gray-500">
                {job.started_at
                    ? formatDistanceToNow(new Date(job.started_at), { addSuffix: true })
                    : format(new Date(job.created_at), 'MMM d, HH:mm')
                }
            </td>
        </tr>
    )
}

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'completed':
            return <CheckCircle className="w-5 h-5 text-green-500" />
        case 'failed':
            return <XCircle className="w-5 h-5 text-red-500" />
        case 'running':
            return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
        case 'pending':
            return <Clock className="w-5 h-5 text-yellow-500" />
        default:
            return <Clock className="w-5 h-5 text-gray-400" />
    }
}
