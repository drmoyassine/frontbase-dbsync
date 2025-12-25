import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Datasources } from './pages/Datasources'
import { SyncConfigs } from './pages/SyncConfigs'
import { Conflicts } from './pages/Conflicts'
import { Jobs } from './pages/Jobs'
import Settings from './pages/Settings'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="datasources" element={<Datasources />} />
                    <Route path="sync-configs" element={<SyncConfigs />} />
                    <Route path="conflicts" element={<Conflicts />} />
                    <Route path="jobs" element={<Jobs />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
