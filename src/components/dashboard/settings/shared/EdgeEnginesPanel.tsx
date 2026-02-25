/**
 * EdgeEnginesPanel — Barrel file
 *
 * Composes the Edge Providers and Edge Engines sections.
 * Individual sections are split into their own files for maintainability:
 *  - EdgeProvidersSection.tsx   (Connect Provider + list)
 *  - ImportCloudflareWorkers.tsx (Fetch & import remote workers)
 *  - EdgeEnginesSection.tsx     (Deploy Engine + engine list)
 *  - DeleteEngineDialog.tsx     (Remote teardown + confirmation)
 *  - edgeConstants.ts           (Shared constants)
 */

import React from 'react';
import { EdgeProvidersSection } from './EdgeProvidersSection';
import { EdgeEnginesSection } from './EdgeEnginesSection';

export const EdgeEnginesPanel: React.FC<{ withCard?: boolean }> = () => {
    return (
        <div className="space-y-6">
            <EdgeProvidersSection />
            <EdgeEnginesSection />
        </div>
    );
};
