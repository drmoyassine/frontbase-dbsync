import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { datasourcesApi, Datasource, viewsApi } from '../api'
import DataPreviewModal from '../components/DataPreviewModal'
import { Plus, Database, Trash2, TestTube, CheckCircle, XCircle, Loader2, Edit2, Filter } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { AccountResourcePicker, DiscoveredResource } from '@/components/dashboard/settings/shared/AccountResourcePicker'

const TYPE_LABELS: Record<string, string> = {
    supabase: 'Supabase',
    postgres: 'PostgreSQL',
    wordpress: 'WordPress (Direct DB)',
    wordpress_rest: 'WordPress (REST API)',
    wordpress_graphql: 'WordPress (GraphQL)',
    neon: 'Neon',
    mysql: 'MySQL',
}

const TYPE_COLORS: Record<string, string> = {
    supabase: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    postgres: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    wordpress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    wordpress_rest: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    wordpress_graphql: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    neon: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    mysql: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

/** Maps datasource types to their compatible connected account provider types. */
const DATASOURCE_PROVIDER_MAP: Record<string, string[]> = {
    supabase: ['supabase'],
    neon: ['neon'],
    postgres: ['postgres'],
    mysql: ['mysql'],
    wordpress_rest: ['wordpress', 'wordpress_rest'],
    wordpress_graphql: ['wordpress', 'wordpress_rest'],
    wordpress: ['mysql'],
}

export function Datasources() {
    const [showModal, setShowModal] = useState(false)
    const [editingDatasource, setEditingDatasource] = useState<Datasource | null>(null)
    const [inspectorData, setInspectorData] = useState<{
        isOpen: boolean;
        datasourceId: string | number;
        table: string;
        name: string;
        filters?: any[];
        viewId?: string;
        viewName?: string;
        webhooks?: any[];
        pinnedColumns?: string[];
        columnOrder?: string[];
    }>({
        isOpen: false,
        datasourceId: '',
        table: '',
        name: '',
        viewName: '',
        pinnedColumns: [],
        columnOrder: []
    });
    const queryClient = useQueryClient()

    // Listen for open modal event from parent (DataStudio)
    useEffect(() => {
        const handleOpenModal = () => setShowModal(true);
        window.addEventListener('open-datasource-modal', handleOpenModal);
        return () => window.removeEventListener('open-datasource-modal', handleOpenModal);
    }, []);

    const { data: datasources, isLoading } = useQuery({
        queryKey: ['datasources'],
        queryFn: () => datasourcesApi.list().then(r => r.data),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => datasourcesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] })
        },
    })

    const testMutation = useMutation({
        mutationFn: (id: string) => datasourcesApi.test(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] })
        },
    })

    return (
        <div className="space-y-6">
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
            ) : datasources?.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <Database className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No datasources yet</h3>
                    <p className="text-gray-500 mb-4">Add your first database connection to get started.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Data Source
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {datasources?.map((ds) => (
                        <DatasourceCard
                            key={ds.id}
                            datasource={ds}
                            onTest={() => testMutation.mutate(ds.id)}
                            onEdit={() => {
                                setEditingDatasource(ds)
                                setShowModal(true)
                            }}
                            onDelete={() => {
                                if (window.confirm('Are you sure you want to delete this datasource?')) {
                                    deleteMutation.mutate(ds.id)
                                }
                            }}
                            isTesting={testMutation.isPending && testMutation.variables === ds.id}
                            onInspect={(table, filters, viewId, viewName, webhooks, pinned, order) => {
                                setInspectorData({
                                    isOpen: true,
                                    datasourceId: ds.id,
                                    table,
                                    name: ds.name,
                                    filters,
                                    viewId,
                                    viewName,
                                    webhooks,
                                    pinnedColumns: pinned,
                                    columnOrder: order
                                })
                            }}
                        />
                    ))}
                </div>
            )}

            <DataPreviewModal
                isOpen={inspectorData.isOpen}
                onClose={() => setInspectorData({ ...inspectorData, isOpen: false })}
                datasourceId={inspectorData.datasourceId}
                table={inspectorData.table}
                datasourceName={inspectorData.name}
                initialFilters={inspectorData.filters}
                viewId={inspectorData.viewId}
                initialViewName={inspectorData.viewName}
                initialWebhooks={inspectorData.webhooks}
                initialPinnedColumns={inspectorData.pinnedColumns}
                initialColumnOrder={inspectorData.columnOrder}
                onViewSaved={() => {
                    queryClient.invalidateQueries({ queryKey: ['datasources'] })
                }}
            />

            {showModal && (
                <DatasourceModal
                    datasource={editingDatasource}
                    onClose={() => {
                        setShowModal(false)
                        setEditingDatasource(null)
                    }}
                />
            )}
        </div>
    )
}

function DatasourceCard({
    datasource,
    onTest,
    onEdit,
    onDelete,
    isTesting,
    onInspect,
}: {
    datasource: Datasource
    onTest: () => void
    onEdit: () => void
    onDelete: () => void
    isTesting: boolean
    onInspect: (table: string, filters?: any[], viewId?: string, viewName?: string, webhooks?: any[], pinned?: string[], order?: string[]) => void
}) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 hover-lift">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <Database className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{datasource.name}</h3>
                            <button
                                onClick={() => onInspect('')}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors text-primary-600 dark:text-primary-400"
                                title="Inspect Data"
                            >
                                <Database className="w-4 h-4" />
                            </button>
                        </div>
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${TYPE_COLORS[datasource.type]}`}>
                            {TYPE_LABELS[datasource.type]}
                        </span>
                    </div>
                </div>
                {datasource.last_test_success !== null && (
                    datasource.last_test_success ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                    )
                )}
            </div>

            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-4">
                <p><span className="font-medium">Host:</span> {datasource.host}:{datasource.port}</p>
                <p><span className="font-medium">Database:</span> {datasource.database}</p>
                {datasource.last_tested_at && (
                    <p className="text-xs">
                        Tested {formatDistanceToNow(new Date(datasource.last_tested_at), { addSuffix: true })}
                    </p>
                )}
            </div>

            {/* Views Section */}
            {datasource.views && datasource.views.length > 0 && (
                <div className="mb-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                        <Filter className="w-3 h-3" />
                        Saved Views ({datasource.views.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {datasource.views.map(view => (
                            <div
                                key={view.id}
                                className="group flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-md text-[10px] font-medium text-gray-500 transition-all hover:border-primary-200 hover:bg-white dark:hover:bg-gray-800"
                            >
                                <button
                                    onClick={() => onInspect(view.target_table, view.filters, view.id, view.name, view.webhooks, view.pinned_columns, view.column_order)}
                                    className="truncate max-w-[100px] hover:text-primary-600 transition-colors"
                                    title={`Inspect ${view.name} (${view.target_table})`}
                                >
                                    {view.name}
                                </button>
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`Delete view "${view.name}"?`)) {
                                            await viewsApi.delete(view.id);
                                            window.location.reload();
                                        }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                                >
                                    <XCircle className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex gap-2">
                <button
                    onClick={onTest}
                    disabled={isTesting}
                    className="flex-[2] flex items-center justify-center gap-2 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                    {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <TestTube className="w-4 h-4" />
                    )}
                    Test
                </button>
                <button
                    onClick={onEdit}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${datasource.last_test_success === false
                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    title="Edit Connection"
                >
                    <Edit2 className="w-4 h-4" />
                    {datasource.last_test_success === false ? 'Fix' : 'Edit'}
                </button>
                <button
                    onClick={onDelete}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                    title="Delete"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

function DatasourceModal({
    datasource,
    onClose
}: {
    datasource?: Datasource | null,
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const isEditing = !!datasource

    const [formData, setFormData] = useState({
        name: datasource?.name || '',
        type: datasource?.type || 'wordpress_rest',
        host: datasource?.host || '',
        port: datasource?.port || (datasource?.type === 'mysql' || datasource?.type === 'wordpress' ? 3306 : 5432),
        database: datasource?.database || '',
        username: datasource?.username || '',
        password: '',
        connection_uri: '',
        api_url: datasource?.api_url || '',
        anon_key: '',
        api_key: '',
        table_prefix: datasource?.table_prefix || 'wp_',
        provider_account_id: (datasource as any)?.provider_account_id || '',
    })

    const mutation = useMutation({
        mutationFn: (data: typeof formData) =>
            isEditing
                ? datasourcesApi.update(datasource.id, data)
                : datasourcesApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] })
            onClose()
        },
    })

    const testRawMutation = useMutation({
        mutationFn: (data: typeof formData) =>
            isEditing
                ? datasourcesApi.testUpdate(datasource.id, data)
                : datasourcesApi.testRaw(data),
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        mutation.mutate(formData)
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {isEditing ? `Edit ${datasource.name}` : 'Add Data Source'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">Configure your database connection credentials</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Display Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                placeholder="My Production DB"
                                required
                            />
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Database Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => {
                                    const newType = e.target.value as any;
                                    setFormData({
                                        ...formData,
                                        type: newType,
                                        port: newType === 'mysql' ? 3306 : 5432
                                    });
                                }}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                                disabled={isEditing}
                            >
                                <option value="supabase">Supabase</option>
                                <option value="postgres">PostgreSQL</option>

                                <option value="wordpress_rest">WordPress (REST API)</option>
                                <option value="wordpress_graphql">WordPress (GraphQL)</option>
                                <option value="neon">Neon</option>
                                <option value="mysql">MySQL</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Connected Account Picker — replaces all inline credential fields */}
                        <AccountResourcePicker
                            compatibleProviders={DATASOURCE_PROVIDER_MAP[formData.type] || [formData.type]}
                            label="Connected Account"
                            autoSelectSingle
                            selectedAccountId={formData.provider_account_id || undefined}
                            onResourceSelected={(resource: DiscoveredResource, accountId: string) => {
                                setFormData({
                                    ...formData,
                                    provider_account_id: accountId,
                                    name: formData.name || resource.name || '',
                                })
                            }}
                            onClear={() => {
                                setFormData({ ...formData, provider_account_id: '' })
                            }}
                        />

                        {formData.provider_account_id && (
                            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Credentials will be resolved from this Connected Account
                            </div>
                        )}

                        {/* WordPress table_prefix — only shown for WordPress types */}
                        {(formData.type === 'wordpress' || formData.type === 'wordpress_rest' || formData.type === 'wordpress_graphql') && (
                            <div>
                                <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">Table Prefix</label>
                                <input
                                    type="text"
                                    value={formData.table_prefix}
                                    onChange={(e) => setFormData({ ...formData, table_prefix: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none"
                                    placeholder="wp_"
                                />
                            </div>
                        )}
                    </div>

                    {testRawMutation.data && (
                        <div className={`p-4 rounded-2xl text-sm flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 border ${testRawMutation.data.data.success
                            ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/50'
                            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50'
                            }`}>
                            <div className={`mt-0.5 p-1 rounded-full ${testRawMutation.data.data.success ? 'bg-green-100 dark:bg-green-800/50' : 'bg-red-100 dark:bg-red-800/50'}`}>
                                {testRawMutation.data.data.success ? (
                                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                ) : (
                                    <XCircle className="w-4 h-4 flex-shrink-0" />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="font-bold mb-1">{testRawMutation.data.data.message}</p>
                                {testRawMutation.data.data.error && (
                                    <p className="opacity-90 font-mono text-[10px] break-all bg-black/5 dark:bg-white/5 p-2 rounded-lg mt-2 leading-relaxed">
                                        {testRawMutation.data.data.error}
                                    </p>
                                )}
                                {testRawMutation.data.data.suggestion && (
                                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-[11px] text-amber-900 dark:text-amber-200 leading-normal flex gap-2">
                                        <div className="mt-0.5">💡</div>
                                        <div>
                                            <span className="font-bold">Suggestion:</span> {testRawMutation.data.data.suggestion}
                                        </div>
                                    </div>
                                )}
                                {testRawMutation.data.data.tables && (
                                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                                        <Database className="w-3.5 h-3.5" />
                                        Successfully listed {testRawMutation.data.data.tables.length} tables.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {mutation.isError && (
                        <div className="p-4 rounded-2xl bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50 text-sm flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
                            <div className="mt-0.5 p-1 rounded-full bg-red-100 dark:bg-red-800/50">
                                <XCircle className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="font-bold">Failed to save data source</p>
                                <p className="opacity-90 mt-1">
                                    {(mutation.error as any)?.response?.data?.detail || mutation.error.message}
                                </p>
                            </div>
                        </div>
                    )}
                </form>

                <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={() => testRawMutation.mutate(formData)}
                        disabled={testRawMutation.isPending || mutation.isPending}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold border-2 border-primary-600 text-primary-600 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all disabled:opacity-50"
                    >
                        {testRawMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <TestTube className="w-4 h-4" />
                        )}
                        Test Connection
                    </button>
                    <div className="flex gap-3 flex-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 text-sm font-bold border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={mutation.isPending || testRawMutation.isPending}
                            className="flex-1 px-4 py-3 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 shadow-lg shadow-primary-500/20"
                        >
                            {mutation.isPending ? (isEditing ? 'Saving...' : 'Adding...') : (isEditing ? 'Save Changes' : 'Add Data Source')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
