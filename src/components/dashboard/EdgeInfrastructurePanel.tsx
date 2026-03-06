/**
 * EdgeInfrastructurePanel
 * 
 * Dedicated page for Edge Infrastructure management.
 * Contains 4 tabs: Edge Compute, Edge Database, Edge Caching, Edge Queues.
 * GPU/AI model management is integrated into Edge Compute via the deploy wizard.
 * 
 * Supports deep linking via URL search params:
 *   /edge?tab=compute
 *   /edge?tab=database
 *   /edge?tab=caching
 *   /edge?tab=queues
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EdgeCachesForm } from './settings/shared/EdgeCachesForm';
import { EdgeDatabasesForm } from './settings/shared/EdgeDatabasesForm';
import { EdgeQueuesForm } from './settings/shared/EdgeQueuesForm';
import { EdgeEnginesPanel } from './settings/shared/EdgeEnginesPanel';

const VALID_TABS = ['compute', 'database', 'caching', 'queues'] as const;
type EdgeTab = typeof VALID_TABS[number];

export const EdgeInfrastructurePanel: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab');
    const activeTab: EdgeTab = VALID_TABS.includes(rawTab as EdgeTab)
        ? (rawTab as EdgeTab)
        : 'compute';

    const handleTabChange = (value: string) => {
        setSearchParams({ tab: value }, { replace: true });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Edge Infrastructure</h1>
                <p className="text-muted-foreground">
                    Manage your edge compute engines, databases, caches, and queues
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:w-[700px]">
                    <TabsTrigger value="compute">Edge Compute</TabsTrigger>
                    <TabsTrigger value="database">Edge Database</TabsTrigger>
                    <TabsTrigger value="caching">Edge Caching</TabsTrigger>
                    <TabsTrigger value="queues">Edge Queues</TabsTrigger>
                </TabsList>

                {/* Edge Compute (Engines + AI) Tab */}
                <TabsContent value="compute" className="space-y-6 mt-6">
                    <EdgeEnginesPanel withCard />
                </TabsContent>

                {/* Edge Database Tab */}
                <TabsContent value="database" className="space-y-6 mt-6">
                    <EdgeDatabasesForm withCard />
                </TabsContent>

                {/* Edge Caching Tab */}
                <TabsContent value="caching" className="space-y-6 mt-6">
                    <EdgeCachesForm withCard />
                </TabsContent>

                {/* Edge Queues Tab */}
                <TabsContent value="queues" className="space-y-6 mt-6">
                    <EdgeQueuesForm withCard />
                </TabsContent>
            </Tabs>
        </div>
    );
};
