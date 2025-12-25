import { useQuery } from '@tanstack/react-query'
import { Database, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { datasourcesApi, syncConfigsApi, syncApi } from '../api'
import { formatDistanceToNow } from 'date-fns'

export function Dashboard() {
    const { data: datasources } = useQuery({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    })

    const { data: configs } = useQuery({
        queryKey: ['sync-configs'],
        queryFn: () => syncConfigsApi.list().then(r => r.data),
    })

    const { data: jobs } = useQuery({
        queryKey: ['jobs'],
        queryFn: () => syncApi.listJobs(undefined, 5).then(r => r.data),
    })

    const stats = [
        {
            label: 'Datasources',
            value: datasources?.length || 0,
            icon: Database,
            color: 'bg-blue-500',
        },
        {
            label: 'Sync Configs',
            value: configs?.length || 0,
            icon: RefreshCw,
            color: 'bg-green-500',
        },
        {
            label: 'Active Syncs',
            value: configs?.filter(c => c.is_active).length || 0,
            icon: CheckCircle,
            color: 'bg-emerald-500',
        },
        {
            label: 'Pending Conflicts',
            value: 0, // Would need separate API call
            icon: AlertTriangle,
            color: 'bg-yellow-500',
        },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-gray-500 dark:text-gray-400">Overview of your database synchronization</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover-lift"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`${stat.color} p-3 rounded-lg`}>
                                <stat.icon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stat.value}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Jobs */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold">Recent Sync Jobs</h2>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {jobs?.length === 0 && (
                        <div className="p-6 text-center text-gray-500">
                            No sync jobs yet. Create a sync configuration to get started.
                        </div>
                    )}
                    {jobs?.map((job) => (
                        <div key={job.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <StatusIcon status={job.status} />
                                <div>
                                    <p className="font-medium">Job {job.id.slice(0, 8)}</p>
                                    <p className="text-sm text-gray-500">
                                        {job.processed_records}/{job.total_records} records
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500">
                                    {job.created_at && formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                </p>
                                <p className="text-sm">
                                    <span className="text-green-600">+{job.inserted_records}</span>
                                    {' / '}
                                    <span className="text-blue-600">~{job.updated_records}</span>
                                    {job.conflict_count > 0 && (
                                        <>
                                            {' / '}
                                            <span className="text-yellow-600">⚠{job.conflict_count}</span>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
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
        default:
            return <Clock className="w-5 h-5 text-gray-400" />
    }
}
