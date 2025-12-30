import React from 'react';

interface ApiDocsProps {
    currentViewId?: string;
}

export const ApiDocs = ({ currentViewId }: ApiDocsProps) => {
    // @ts-ignore
    const API_DOCS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace('/api', '') + '/docs/views';
    const SWAGGER_ANCHOR = currentViewId
        ? `#/Views/create_view_record_api_views__view_id__records_post`
        : `#/Views`;

    return (
        <div className="h-full flex flex-col">
            <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">REST API Documentation</span>
                <code className="text-[10px] text-primary-600 font-mono italic">endpoint: /api/views/{currentViewId || '{id}'}/records</code>
            </div>
            <iframe
                src={`${API_DOCS_URL}${currentViewId ? `?id=${currentViewId}` : ''}${SWAGGER_ANCHOR}`}
                className="flex-1 w-full border-none"
            />
        </div>
    );
};
