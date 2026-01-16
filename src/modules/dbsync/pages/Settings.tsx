import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, RedisSettings } from '../api';
import { Database, RefreshCw, Check, X, Save, Loader2 } from 'lucide-react';

export default function Settings() {
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

    // Update local state when settings load
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
        onSuccess: (result) => {
            setTestResult(result);
        },
        onError: () => {
            setTestResult({ success: false, message: 'Connection test failed' });
        },
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

    const handleTest = () => {
        testMutation.mutate({ redis_url: redisUrl });
    };

    if (isLoading) {
        return (
            <div className="page-container">
                <div className="card">
                    <div className="flex-center" style={{ padding: '3rem' }}>
                        <Loader2 className="spin" size={24} />
                        <span style={{ marginLeft: '0.5rem' }}>Loading settings...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
                <h1 className="page-title">Settings</h1>
            </div>

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
                            onClick={handleTest}
                            disabled={!redisUrl || testMutation.isPending}
                        >
                            {testMutation.isPending ? (
                                <Loader2 className="spin" size={14} />
                            ) : (
                                <RefreshCw size={14} />
                            )}
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
                        {saveMutation.isPending ? (
                            <Loader2 className="spin" size={14} />
                        ) : (
                            <Save size={14} />
                        )}
                        Save Settings
                    </button>
                    {saveMutation.isSuccess && !hasChanges && (
                        <span style={{ marginLeft: '1rem', color: 'var(--success-color)' }}>
                            <Check size={14} style={{ verticalAlign: 'middle' }} /> Settings saved
                        </span>
                    )}
                </div>
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
