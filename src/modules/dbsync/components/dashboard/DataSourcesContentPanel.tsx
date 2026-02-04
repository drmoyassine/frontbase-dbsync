import { useQuery } from '@tanstack/react-query';
import { datasourcesApi } from '../../api';
import { formatDistanceToNow } from 'date-fns';
import { Database, CheckCircle, XCircle, RefreshCw, Settings, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

export function DataSourcesContentPanel() {
    const navigate = useNavigate();

    const { data: datasources, isLoading } = useQuery({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    });

    const connectedCount = datasources?.filter(d => d.status === 'connected').length || 0;
    const errorCount = datasources?.filter(d => d.status === 'error').length || 0;

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-20 bg-muted/50 rounded-lg animate-pulse" />
                <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Analytics Row */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{connectedCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Connected</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{errorCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Errors</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{datasources?.length || 0}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Sources</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Sources Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-semibold">Data Sources</h3>
                    <Button size="sm" onClick={() => navigate('/data-studio')}>
                        Manage Sources
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {datasources?.slice(0, 10).map((ds) => (
                                <tr key={ds.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Database className="w-4 h-4 text-gray-400" />
                                            <span className="font-medium">{ds.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                                        <Badge variant="outline" className="capitalize">
                                            {ds.db_type || 'postgres'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {ds.status === 'connected' ? (
                                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                Connected
                                            </Badge>
                                        ) : ds.status === 'error' ? (
                                            <Badge variant="destructive">
                                                <XCircle className="w-3 h-3 mr-1" />
                                                Error
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">
                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                Pending
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                        {ds.created_at
                                            ? formatDistanceToNow(new Date(ds.created_at), { addSuffix: true })
                                            : '-'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => navigate(`/data-studio?ds=${ds.id}`)}
                                                title="View Tables"
                                            >
                                                <Table2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => navigate(`/data-studio?ds=${ds.id}&settings=true`)}
                                                title="Settings"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {(!datasources || datasources.length === 0) && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                        No data sources yet. Connect your first database to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {datasources && datasources.length > 10 && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
                        <Button variant="link" onClick={() => navigate('/data-studio')}>
                            View all {datasources.length} data sources →
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
