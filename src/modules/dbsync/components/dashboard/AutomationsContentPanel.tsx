import { useWorkflowDrafts } from '@/stores/actions';
import { formatDistanceToNow } from 'date-fns';
import { Workflow, Play, GitBranch, Edit, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

export function AutomationsContentPanel() {
    const navigate = useNavigate();

    const { data, isLoading } = useWorkflowDrafts();
    const drafts = data?.drafts || [];

    const publishedCount = drafts.filter(d => d.is_published).length;
    const draftCount = drafts.filter(d => !d.is_published).length;

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
                            <p className="text-2xl font-bold">{publishedCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Published</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                            <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{draftCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Drafts</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <Workflow className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{drafts.length}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Workflows</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Automations Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-semibold">Automations</h3>
                    <Button size="sm" onClick={() => navigate('/actions')}>
                        Manage Automations
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trigger</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nodes</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {drafts.slice(0, 10).map((draft) => (
                                <tr key={draft.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Workflow className="w-4 h-4 text-gray-400" />
                                            <span className="font-medium">{draft.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                                        <Badge variant="outline" className="capitalize">
                                            <GitBranch className="w-3 h-3 mr-1" />
                                            {draft.trigger_type.replace('_', ' ')}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {draft.is_published ? (
                                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                v{draft.published_version}
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">
                                                <Clock className="w-3 h-3 mr-1" />
                                                Draft
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Play className="w-3 h-3" />
                                            {draft.nodes.length} nodes
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                        {formatDistanceToNow(new Date(draft.updated_at), { addSuffix: true })}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => navigate(`/actions?edit=${draft.id}`)}
                                                title="Edit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {drafts.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        No automations yet. Create your first workflow to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {drafts.length > 10 && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
                        <Button variant="link" onClick={() => navigate('/actions')}>
                            View all {drafts.length} automations →
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
