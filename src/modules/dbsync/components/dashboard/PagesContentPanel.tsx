import { useQuery } from '@tanstack/react-query';
import { getPages } from '@/services/pages-api';
import { formatDistanceToNow } from 'date-fns';
import { FileText, Eye, Edit, Globe, FileEdit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

export function PagesContentPanel() {
    const navigate = useNavigate();

    const { data: pages, isLoading } = useQuery({
        queryKey: ['pages'],
        queryFn: () => getPages(false),
    });

    const publishedPages = pages?.filter(p => p.isPublic) || [];
    const draftPages = pages?.filter(p => !p.isPublic) || [];

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
                            <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{publishedPages.length}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Published</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                            <FileEdit className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{draftPages.length}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Drafts</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{pages?.length || 0}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Pages</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pages Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-semibold">All Pages</h3>
                    <Button size="sm" onClick={() => navigate('/pages')}>
                        Manage Pages
                    </Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Modified</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {pages?.slice(0, 10).map((page) => (
                                <tr key={page.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-gray-400" />
                                            <span className="font-medium">{page.title || 'Untitled'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                        /{page.slug || ''}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {page.isPublic ? (
                                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                <Globe className="w-3 h-3 mr-1" />
                                                Live
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary">
                                                <FileEdit className="w-3 h-3 mr-1" />
                                                Draft
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                        {page.updatedAt
                                            ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                                            : '-'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => window.open(`/${page.slug}`, '_blank')}
                                                title="Preview"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => navigate(`/builder/${page.id}`)}
                                                title="Edit"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {(!pages || pages.length === 0) && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                        No pages yet. Create your first page to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {pages && pages.length > 10 && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
                        <Button variant="link" onClick={() => navigate('/pages')}>
                            View all {pages.length} pages →
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
