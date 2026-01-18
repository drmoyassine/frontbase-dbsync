import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, RedisSettings, PrivacySettings } from '../api';
import { Database, RefreshCw, Check, X, Save, Loader2, Shield, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
    const [activeTab, setActiveTab] = React.useState<'general' | 'privacy'>('general');

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <h1 className="page-title">Settings</h1>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Configure your project settings and integrations
                </p>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: '1.5rem' }}>
                <button
                    className={`tab ${activeTab === 'general' ? 'active' : ''}`}
                    onClick={() => setActiveTab('general')}
                >
                    <SettingsIcon size={16} />
                    General
                </button>
                <button
                    className={`tab ${activeTab === 'privacy' ? 'active' : ''}`}
                    onClick={() => setActiveTab('privacy')}
                >
                    <Shield size={16} />
                    Privacy & Tracking
                </button>
            </div>

            {activeTab === 'general' ? <CacheSettings /> : <PrivacyTrackingSettings />}

            <style>{`
                .tabs {
                    display: flex;
                    gap: 0.5rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .tab {
                    padding: 0.75rem 1.5rem;
                    background: none;
                    border: none;
                    border-bottom: 2px solid transparent;
                    cursor: pointer;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--text-muted);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: all 0.2s;
                }
                .tab:hover {
                    color: var(--text-primary);
                }
                .tab.active {
                    color: var(--primary);
                    border-bottom-color: var(--primary);
                }
            `}</style>
        </div>
    );
}

// Cache & Performance Settings (existing Redis config)
function CacheSettings() {
    const queryClient = useQueryClient();
    const [redisUrl, setRedisUrl] = React.useState('');
    const [redisToken, setRedisToken] = React.useState('');
    const [redisEnabled, setRedisEnabled] = React.useState(false);
    const [cacheTtlData, setCacheTtlData] = React.useState(60);
    const [cacheTtlCount, setCacheTtlCount] = React.useState(300);
    const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null);
    const [hasChanges, setHasChanges] = React.useState(false);

    const { data: settings, isLoading } = useQuery({
        queryKey: ['redisSettings'],
        queryFn: () => settingsApi.getRedis().then(r => r.data),
    });

    React.useEffect(() => {
        if (settings) {
            setRedisUrl(settings.redis_url || '');
            setRedisToken(settings.redis_token || '');
            setRedisEnabled(settings.redis_enabled);
            setCacheTtlData(settings.cache_ttl_data);
            setCacheTtlCount(settings.cache_ttl_count);
        }
    }, [settings]);

    const saveMutation = useMutation({
        mutationFn: (data: Partial<RedisSettings>) => settingsApi.updateRedis(data).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['redisSettings'] });
            setHasChanges(false);
        },
    });

    const testMutation = useMutation({
        mutationFn: (data: Partial<RedisSettings>) => settingsApi.testRedis(data).then(r => r.data),
        onSuccess: (result) => setTestResult(result),
        onError: () => setTestResult({ success: false, message: 'Connection test failed' }),
    });

    const handleChange = (setter: React.Dispatch<React.SetStateAction<any>>) => (value: any) => {
        setter(value);
        setHasChanges(true);
        setTestResult(null);
    };

    const handleSave = () => {
        saveMutation.mutate({
            redis_url: redisUrl || null,
            redis_token: redisToken || null,
            redis_enabled: redisEnabled,
            cache_ttl_data: cacheTtlData,
            cache_ttl_count: cacheTtlCount,
        });
    };

    if (isLoading) {
        return (
            <div className="card">
                <div className="flex-center" style={{ padding: '3rem' }}>
                    <Loader2 className="spin" size={24} />
                    <span style={{ marginLeft: '0.5rem' }}>Loading settings...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="card-header">
                <Database size={20} />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Redis Cache Configuration</h2>
            </div>
            <div className="card-body">
                <p className="form-hint" style={{ marginBottom: '1.5rem' }}>
                    Configure Redis caching to improve data loading performance.
                    When enabled, API responses will be cached to reduce load times on subsequent requests.
                </p>

                <div className="form-group">
                    <label className="form-label">Upstash Redis REST URL</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="https://xxx.upstash.io"
                        value={redisUrl}
                        onChange={(e) => handleChange(setRedisUrl)(e.target.value)}
                    />
                    <span className="form-hint">Get this from your Upstash Redis dashboard</span>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label className="form-label">Upstash Redis REST Token</label>
                    <input
                        type="password"
                        className="form-input"
                        placeholder="AXXXaaaa..."
                        value={redisToken}
                        onChange={(e) => handleChange(setRedisToken)(e.target.value)}
                    />
                    <span className="form-hint">REST API token from Upstash dashboard (keep secret)</span>
                </div>

                <div className="form-row" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => testMutation.mutate({ redis_url: redisUrl })}
                        disabled={!redisUrl || testMutation.isPending}
                    >
                        {testMutation.isPending ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                        Test Connection
                    </button>
                    {testResult && (
                        <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                            {testResult.success ? <Check size={14} /> : <X size={14} />}
                            {testResult.message}
                        </div>
                    )}
                </div>

                <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }} />

                <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={redisEnabled}
                            onChange={(e) => handleChange(setRedisEnabled)(e.target.checked)}
                            disabled={!redisUrl}
                        />
                        Enable Redis Caching
                    </label>
                    <span className="form-hint">When disabled, all data is fetched directly from the source.</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div className="form-group">
                        <label className="form-label">Data Cache TTL (seconds)</label>
                        <input
                            type="number"
                            className="form-input"
                            value={cacheTtlData}
                            onChange={(e) => handleChange(setCacheTtlData)(parseInt(e.target.value))}
                            disabled={!redisEnabled}
                        />
                        <span className="form-hint">How long to cache record data</span>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Count Cache TTL (seconds)</label>
                        <input
                            type="number"
                            className="form-input"
                            value={cacheTtlCount}
                            onChange={(e) => handleChange(setCacheTtlCount)(parseInt(e.target.value))}
                            disabled={!redisEnabled}
                        />
                        <span className="form-hint">How long to cache record counts</span>
                    </div>
                </div>

                <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }} />

                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={!hasChanges || saveMutation.isPending}
                >
                    {saveMutation.isPending ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
                    Save Settings
                </button>
                {saveMutation.isSuccess && !hasChanges && (
                    <span style={{ marginLeft: '1rem', color: 'var(--success-color)' }}>
                        <Check size={14} style={{ verticalAlign: 'middle' }} /> Settings saved
                    </span>
                )}
            </div>

            <style>{`
                .test-result {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    border-radius: 6px;
                    font-size: 0.875rem;
                }
                .test-result.success {
                    background: rgba(34, 197, 94, 0.1);
                    color: var(--success-color);
                }
                .test-result.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: var(--error-color);
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

// Privacy & Tracking Settings
function PrivacyTrackingSettings() {
    const queryClient = useQueryClient();
    const [enableVisitorTracking, setEnableVisitorTracking] = React.useState(false);
    const [cookieExpiryDays, setCookieExpiryDays] = React.useState(365);
    const [requireCookieConsent, setRequireCookieConsent] = React.useState(true);
    const [advancedVariables, setAdvancedVariables] = React.useState<PrivacySettings['advancedVariables']>({
        ip: { collect: false, expose: false },
        browser: { collect: true, expose: true },
        os: { collect: true, expose: true },
        language: { collect: true, expose: true },
        viewport: { collect: true, expose: true },
        themePreference: { collect: true, expose: true },
        connectionType: { collect: true, expose: false },
        referrer: { collect: true, expose: true },
        isBot: { collect: true, expose: true },
    });
    const [cookieVariables, setCookieVariables] = React.useState<PrivacySettings['cookieVariables']>({
        isFirstVisit: { collect: true, expose: true },
        visitCount: { collect: true, expose: true },
        firstVisitAt: { collect: true, expose: true },
        landingPage: { collect: true, expose: true },
    });
    const [hasChanges, setHasChanges] = React.useState(false);

    const { data: settings, isLoading } = useQuery({
        queryKey: ['privacySettings'],
        queryFn: () => settingsApi.getPrivacy().then(r => r.data),
    });

    React.useEffect(() => {
        if (settings) {
            setEnableVisitorTracking(settings.enableVisitorTracking);
            setCookieExpiryDays(settings.cookieExpiryDays);
            setRequireCookieConsent(settings.requireCookieConsent);
            // Handle migration from old settings structure - merge with defaults
            const defaultAdvanced = {
                ip: { collect: false, expose: false },
                browser: { collect: true, expose: true },
                os: { collect: true, expose: true },
                language: { collect: true, expose: true },
                viewport: { collect: true, expose: true },
                themePreference: { collect: true, expose: true },
                connectionType: { collect: true, expose: false },
                referrer: { collect: true, expose: true },
                isBot: { collect: true, expose: true },
            };
            setAdvancedVariables({
                ip: settings.advancedVariables?.ip ?? defaultAdvanced.ip,
                browser: settings.advancedVariables?.browser ?? defaultAdvanced.browser,
                os: settings.advancedVariables?.os ?? defaultAdvanced.os,
                language: settings.advancedVariables?.language ?? defaultAdvanced.language,
                viewport: settings.advancedVariables?.viewport ?? defaultAdvanced.viewport,
                themePreference: settings.advancedVariables?.themePreference ?? defaultAdvanced.themePreference,
                connectionType: settings.advancedVariables?.connectionType ?? defaultAdvanced.connectionType,
                referrer: settings.advancedVariables?.referrer ?? defaultAdvanced.referrer,
                isBot: settings.advancedVariables?.isBot ?? defaultAdvanced.isBot,
            });
            const defaultCookieVars = {
                isFirstVisit: { collect: true, expose: true },
                visitCount: { collect: true, expose: true },
                firstVisitAt: { collect: true, expose: true },
                landingPage: { collect: true, expose: true },
            };
            if (settings.cookieVariables) {
                setCookieVariables({
                    isFirstVisit: settings.cookieVariables.isFirstVisit ?? defaultCookieVars.isFirstVisit,
                    visitCount: settings.cookieVariables.visitCount ?? defaultCookieVars.visitCount,
                    firstVisitAt: settings.cookieVariables.firstVisitAt ?? defaultCookieVars.firstVisitAt,
                    landingPage: settings.cookieVariables.landingPage ?? defaultCookieVars.landingPage,
                });
            }
        }
    }, [settings]);

    const saveMutation = useMutation({
        mutationFn: (data: PrivacySettings) => settingsApi.updatePrivacy(data).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['privacySettings'] });
            setHasChanges(false);
        },
    });

    const handleChange = (setter: React.Dispatch<React.SetStateAction<any>>) => (value: any) => {
        setter(value);
        setHasChanges(true);
    };

    const handleAdvancedChange = (key: keyof PrivacySettings['advancedVariables'], field: 'collect' | 'expose', value: boolean) => {
        setAdvancedVariables(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value }
        }));
        setHasChanges(true);
    };

    const handleSave = () => {
        saveMutation.mutate({
            enableVisitorTracking,
            cookieExpiryDays,
            requireCookieConsent,
            cookieVariables,
            advancedVariables,
        });
    };

    if (isLoading) {
        return (
            <div className="card">
                <div className="flex-center" style={{ padding: '3rem' }}>
                    <Loader2 className="spin" size={24} />
                    <span style={{ marginLeft: '0.5rem' }}>Loading settings...</span>
                </div>
            </div>
        );
    }

    // Configurable variables metadata
    const configurableVars = [
        { key: 'ip' as const, label: 'IP Address', description: 'Visitor IP (privacy sensitive)' },
        { key: 'browser' as const, label: 'Browser', description: 'Browser name (Chrome, Safari)' },
        { key: 'os' as const, label: 'Operating System', description: 'OS name (Windows, macOS)' },
        { key: 'language' as const, label: 'Language', description: 'Preferred language (en, ar)' },
    ];

    return (
        <div className="card">
            <div className="card-header">
                <Shield size={20} />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Privacy & Tracking</h2>
            </div>
            <div className="card-body">
                <p className="form-hint" style={{ marginBottom: '1.5rem' }}>
                    Configure visitor tracking to enable personalization features.
                    When enabled, tracking cookies will record first visit, visit count, and landing page.
                </p>

                <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="checkbox"
                            checked={enableVisitorTracking}
                            onChange={(e) => handleChange(setEnableVisitorTracking)(e.target.checked)}
                        />
                        Enable visitor tracking cookies
                    </label>
                    <span className="form-hint">
                        Track first visit, visit count, and landing page for personalization (e.g., first-time visitor banners, loyalty messages).
                    </span>
                </div>

                {enableVisitorTracking && (
                    <>
                        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }} />

                        <div className="form-group">
                            <label className="form-label">Cookie expiry (days)</label>
                            <input
                                type="number"
                                className="form-input"
                                value={cookieExpiryDays}
                                onChange={(e) => handleChange(setCookieExpiryDays)(parseInt(e.target.value))}
                                min={1}
                                max={730}
                                style={{ maxWidth: '200px' }}
                            />
                            <span className="form-hint">
                                How long to remember visitors (1-730 days). Default: 365 days (1 year).
                            </span>
                        </div>

                        <div className="form-group" style={{ marginTop: '1rem' }}>
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                    type="checkbox"
                                    checked={requireCookieConsent}
                                    onChange={(e) => handleChange(setRequireCookieConsent)(e.target.checked)}
                                />
                                Require cookie consent banner
                            </label>
                            <span className="form-hint">
                                Show a consent banner before setting tracking cookies (recommended for GDPR compliance).
                            </span>
                        </div>

                        <div className="info-box" style={{ marginTop: '1.5rem' }}>
                            <strong>📌 Basic Variables (Always Available):</strong>
                            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                                <li><code>visitor.country</code> - Country code</li>
                                <li><code>visitor.city</code> - City name</li>
                                <li><code>visitor.timezone</code> - Timezone offset</li>
                                <li><code>visitor.device</code> - Device type (mobile/tablet/desktop)</li>
                            </ul>
                        </div>

                        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }} />

                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            ⚙️ Configurable Variables
                        </h3>
                        <p className="form-hint" style={{ marginBottom: '1rem' }}>
                            Configure collection and exposure of extended visitor data.
                        </p>

                        <table className="config-table">
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Variable</th>
                                    <th style={{ textAlign: 'center', width: '80px' }}>Collect</th>
                                    <th style={{ textAlign: 'center', width: '80px' }}>Expose</th>
                                </tr>
                            </thead>
                            <tbody>
                                {configurableVars.map(({ key, label, description }) => (
                                    <tr key={key}>
                                        <td>
                                            <strong>{label}</strong>
                                            <div className="form-hint" style={{ marginTop: '0.25rem' }}>{description}</div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={advancedVariables[key].collect}
                                                onChange={(e) => handleAdvancedChange(key, 'collect', e.target.checked)}
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={advancedVariables[key].expose}
                                                onChange={(e) => handleAdvancedChange(key, 'expose', e.target.checked)}
                                                disabled={!advancedVariables[key].collect}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}

                <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)' }} />

                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={!hasChanges || saveMutation.isPending}
                >
                    {saveMutation.isPending ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
                    Save Settings
                </button>
                {saveMutation.isSuccess && !hasChanges && (
                    <span style={{ marginLeft: '1rem', color: 'var(--success-color)' }}>
                        <Check size={14} style={{ verticalAlign: 'middle' }} /> Settings saved
                    </span>
                )}
            </div>

            <style>{`
                .info-box {
                    background: var(--bg-secondary);
                    padding: 1rem;
                    border-radius: 6px;
                    border-left: 3px solid var(--primary);
                }
                .info-box code {
                    background: var(--bg-tertiary);
                    padding: 0.125rem 0.375rem;
                    border-radius: 3px;
                    font-size: 0.875em;
                    font-family: monospace;
                }
                .config-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .config-table th,
                .config-table td {
                    padding: 0.75rem 0.5rem;
                    border-bottom: 1px solid var(--border-color);
                }
                .config-table th {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: var(--text-muted);
                }
                .config-table input[type="checkbox"] {
                    width: 1.25rem;
                    height: 1.25rem;
                    cursor: pointer;
                }
                .config-table input[type="checkbox"]:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
