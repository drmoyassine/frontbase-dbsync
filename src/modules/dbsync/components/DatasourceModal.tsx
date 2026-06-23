import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { datasourcesApi } from '../api';
import { Datasource } from '../types';
import { track } from '@/lib/analytics';
import { AccountResourcePicker, DiscoveredResource } from '@/components/dashboard/settings/shared/AccountResourcePicker';
import { PROVIDER_CONFIGS } from '@/components/dashboard/settings/shared/edgeConstants';
import { Database, TestTube, CheckCircle, XCircle, Loader2, Table, Copy, Zap } from 'lucide-react';

/** Providers with 'database' or 'cms' capability — drives the Database Type selector. */
const DATABASE_PROVIDERS = Object.entries(PROVIDER_CONFIGS)
    .filter(([, c]) => c.capabilities?.includes('database') || c.capabilities?.includes('cms'))
    .map(([key, c]) => ({ key, label: c.label }));

/** Maps datasource types to their compatible connected account provider types. */
const DATASOURCE_PROVIDER_MAP: Record<string, string[]> = Object.fromEntries(
    DATABASE_PROVIDERS.map(p => [p.key, [p.key]])
);

interface DatasourceModalProps {
    datasource?: Datasource | null;
    onClose: () => void;
    /** Called with the newly created datasource ID after successful creation */
    onCreated?: (datasourceId: string) => void;
}

export function DatasourceModal({ datasource, onClose, onCreated }: DatasourceModalProps) {
    const queryClient = useQueryClient();
    const isEditing = !!datasource;

    const [formData, setFormData] = useState({
        name: datasource?.name || '',
        type: datasource?.type || 'wordpress_rest',
        host: datasource?.host || '',
        port: datasource?.port || (datasource?.type === 'mysql' ? 3306 : 5432),
        database: datasource?.database || '',
        username: datasource?.username || '',
        password: '',
        connection_uri: '',
        api_url: datasource?.api_url || '',
        anon_key: '',
        api_key: '',
        provider_account_id: (datasource as any)?.provider_account_id || '',
        // WordPress Plugin specific fields (mapped to api_url/password by backend)
        base_url: datasource?.api_url || '',  // api_url from datasource is base_url for WP Plugin
        app_password: '',
        // Google Sheets specific config in extra_config
        extra_config: (() => {
            const cfg = (datasource as any)?.extra_config;
            if (typeof cfg === 'string') {
                try {
                    return JSON.parse(cfg);
                } catch {
                    return {};
                }
            }
            return cfg || { spreadsheetId: '', webAppUrl: '', webAppSecret: '' };
        })(),
    });

    const mutation = useMutation({
        mutationFn: (data: typeof formData) =>
            isEditing
                ? datasourcesApi.update(datasource.id, data)
                : datasourcesApi.create(data),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['datasources'] });
            if (!isEditing) {
                track('datasource_connected', { datasource_id: result?.data?.id });
                if (onCreated && result?.data?.id) {
                    onCreated(result.data.id);
                }
            }
            onClose();
        },
    });

    const testRawMutation = useMutation({
        mutationFn: (data: typeof formData) =>
            isEditing
                ? datasourcesApi.testUpdate(datasource.id, data)
                : datasourcesApi.testRaw(data),
    });

    // ── Google Sheets add-on connect flow ──────────────────────────────────
    const [sheetsConnect, setSheetsConnect] = useState<{
        loading: boolean;
        token?: string;
        installUrl?: string;
        polling?: boolean;
        error?: string;
    }>({ loading: false });
    const sheetsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopSheetsPoll = () => {
        if (sheetsPollRef.current) {
            clearInterval(sheetsPollRef.current);
            sheetsPollRef.current = null;
        }
    };
    // Stop polling if the modal unmounts (e.g. closed) mid-handshake.
    useEffect(() => () => stopSheetsPoll(), []);

    const startSheetsConnect = async () => {
        setSheetsConnect({ loading: true, error: undefined });
        stopSheetsPoll();
        try {
            const res = await datasourcesApi.issueSheetsConnect(datasource?.id);
            const { token, addonInstallUrl } = res.data;
            setSheetsConnect({ loading: false, token, installUrl: addonInstallUrl, polling: true });

            // Poll until the add-on callback completes (token TTL ~15 min).
            let attempts = 0;
            const maxAttempts = Math.floor((13 * 60 * 1000) / 2500);
            sheetsPollRef.current = setInterval(async () => {
                attempts += 1;
                if (attempts > maxAttempts) {
                    stopSheetsPoll();
                    setSheetsConnect((s) => ({ ...s, polling: false, error: 'Timed out waiting for the add-on. Retry with a new code.' }));
                    return;
                }
                try {
                    const s = await datasourcesApi.sheetsConnectStatus(token);
                    if (s.data?.connected && s.data.datasourceId) {
                        stopSheetsPoll();
                        queryClient.invalidateQueries({ queryKey: ['datasources'] });
                        track('datasource_connected', { datasource_id: s.data.datasourceId, via: 'sheets_addon' });
                        if (onCreated) onCreated(s.data.datasourceId);
                        onClose();
                    }
                } catch {
                    /* transient — keep polling */
                }
            }, 2500);
        } catch (e: any) {
            setSheetsConnect({ loading: false, error: e?.response?.data?.detail || e.message || 'Failed to issue connect code' });
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate(formData);
    };

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
                                {DATABASE_PROVIDERS.map(p => (
                                    <option key={p.key} value={p.key}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Google Sheets Configuration */}
                        {formData.type === 'google_sheets' ? (
                            <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/30">
                                <div className="flex items-center gap-2 mb-3">
                                    <Table className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <h3 className="font-semibold text-blue-900 dark:text-blue-100">Google Sheets Configuration</h3>
                                </div>

                                {/* Connect via add-on (recommended) */}
                                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10 p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">Connect with the add-on (recommended)</h4>
                                    </div>
                                    {!sheetsConnect.token ? (
                                        <>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                                                Install the Frontbase add-on, paste a one-time code, click Configure — no copy-pasting Apps Script or secrets.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={startSheetsConnect}
                                                disabled={sheetsConnect.loading}
                                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                            >
                                                {sheetsConnect.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                                Get connect code
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <ol className="text-xs text-gray-700 dark:text-gray-300 space-y-1.5 mb-3 list-decimal list-inside">
                                                <li>
                                                    Open the add-on in your Google Sheet
                                                    {sheetsConnect.installUrl && (
                                                        <a href={sheetsConnect.installUrl} target="_blank" rel="noreferrer" className="text-emerald-700 dark:text-emerald-300 underline ml-1">install link</a>
                                                    )}
                                                </li>
                                                <li>In the add-on, paste this code and click <span className="font-semibold">Configure</span>:</li>
                                            </ol>
                                            <div className="flex gap-2 mb-2">
                                                <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg font-mono text-sm break-all border border-gray-200 dark:border-gray-700 select-all">
                                                    {sheetsConnect.token}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={() => navigator.clipboard.writeText(sheetsConnect.token!)}
                                                    className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                                    title="Copy code"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {sheetsConnect.polling ? (
                                                <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for the add-on…
                                                </p>
                                            ) : (
                                                <button type="button" onClick={startSheetsConnect} className="text-xs text-emerald-700 dark:text-emerald-300 underline">Get a new code</button>
                                            )}
                                            {sheetsConnect.error && <p className="text-xs text-red-600 mt-2">{sheetsConnect.error}</p>}
                                        </>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 py-1">
                                    <div className="flex-1 h-px bg-blue-200 dark:bg-blue-800/40" />
                                    <span className="text-[10px] uppercase tracking-wide text-blue-400 dark:text-blue-500">or configure manually</span>
                                    <div className="flex-1 h-px bg-blue-200 dark:bg-blue-800/40" />
                                </div>

                                {/* Spreadsheet ID */}
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                        Spreadsheet ID
                                        <span className="text-xs text-gray-500 ml-2">
                                            From URL: docs.google.com/spreadsheets/d/<span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">SPREADSHEET_ID</span>/edit
                                        </span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.extra_config?.spreadsheetId || ''}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            extra_config: { ...formData.extra_config, spreadsheetId: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                        placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz"
                                    />
                                </div>

                                {/* Web App URL */}
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                        Web App URL
                                    </label>
                                    <p className="text-xs text-gray-500 mb-2">
                                        Deploy the Apps Script Web App and paste the exec URL. See <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">docs/google-sheets-setup.md</code> in the repo.
                                    </p>
                                    <input
                                        type="url"
                                        value={formData.extra_config?.webAppUrl || ''}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            extra_config: { ...formData.extra_config, webAppUrl: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                        placeholder="https://script.google.com/macros/s/.../exec"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Deploy the Apps Script Web App and paste the exec URL here.
                                    </p>
                                </div>

                                {/* Shared Secret */}
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                        Shared Secret
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const secret = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
                                                setFormData({
                                                    ...formData,
                                                    extra_config: { ...formData.extra_config, webAppSecret: secret }
                                                });
                                            }}
                                            className="text-primary ml-2 text-xs underline hover:no-underline"
                                        >
                                            Generate New
                                        </button>
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={formData.extra_config?.webAppSecret || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                extra_config: { ...formData.extra_config, webAppSecret: e.target.value }
                                            })}
                                            className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all font-mono text-sm"
                                            placeholder="Enter or generate a secret"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (formData.extra_config?.webAppSecret) {
                                                    navigator.clipboard.writeText(formData.extra_config.webAppSecret);
                                                }
                                            }}
                                            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                            title="Copy to clipboard"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Use this secret in your Apps Script Web App code for authentication.
                                    </p>
                                </div>
                            </div>
                        ) : formData.type === 'wordpress_plugin' || formData.type === 'wordpress_rest' || formData.type === 'wordpress' ? (
                            /* WordPress Configuration (inline credentials) */
                            <div className="space-y-4 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-800/30">
                                <div className="flex items-center gap-2 mb-3">
                                    <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                                        WordPress Configuration
                                    </h3>
                                </div>

                                {formData.type === 'wordpress_plugin' && (
                                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 p-3 mb-4">
                                        <p className="text-xs text-emerald-800 dark:text-emerald-200">
                                            <strong>Plugin Mode:</strong> Requires the Frontbase Connector WordPress plugin to be installed and activated on your site.
                                        </p>
                                    </div>
                                )}

                                {/* Base URL / Site URL */}
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                        Site URL
                                    </label>
                                    <input
                                        type="url"
                                        value={formData.base_url}
                                        onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                        placeholder="https://mysite.com"
                                        required={formData.type === 'wordpress_plugin' || formData.type === 'wordpress_rest' || formData.type === 'wordpress'}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Your WordPress site URL (without trailing slash)
                                    </p>
                                </div>

                                {/* Username */}
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                        Username
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                        placeholder="admin"
                                        required={formData.type === 'wordpress_plugin' || formData.type === 'wordpress_rest' || formData.type === 'wordpress'}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        WordPress username (must have permission to manage posts)
                                    </p>
                                </div>

                                {/* Application Password */}
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">
                                        Application Password
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.app_password}
                                        onChange={(e) => setFormData({ ...formData, app_password: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                        placeholder="xxxx xxxx xxxx xxxx"
                                        required={formData.type === 'wordpress_plugin' || formData.type === 'wordpress_rest' || formData.type === 'wordpress'}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Generate in WordPress → Users → Profile → Application Passwords
                                    </p>
                                </div>
                            </div>
                        ) : (
                            /* Connected Account Picker — replaces all inline credential fields */
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
                                });
                            }}
                            onClear={() => {
                                setFormData({ ...formData, provider_account_id: '' });
                            }}
                        />
                        )}

                        {formData.provider_account_id && (
                            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Credentials will be resolved from this Connected Account
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
    );
}
