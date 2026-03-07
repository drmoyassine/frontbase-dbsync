/**
 * EndpointsPanel — Provider-agnostic endpoint catalog with OpenAPI enrichment.
 *
 * Renders static endpoint definitions per adapter type (lite vs full),
 * enriched with live OpenAPI spec data from the engine.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import { Zap, ExternalLink } from 'lucide-react';
import type { EdgeEngine } from '@/hooks/useEdgeInfrastructure';
import { getEndpointsForAdapter, getWorkerBaseUrl, getOpenApiInfo } from './types';

interface EndpointsPanelProps {
    engine: EdgeEngine;
    openApiSpec: any;
}

const METHOD_COLORS: Record<string, string> = {
    GET: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    POST: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    PUT: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    DELETE: 'text-red-500 bg-red-500/10 border-red-500/20',
};

export const EndpointsPanel: React.FC<EndpointsPanelProps> = ({ engine, openApiSpec }) => {
    const endpoints = getEndpointsForAdapter(engine.adapter_type || 'automations');
    const workerBaseUrl = getWorkerBaseUrl(engine);

    return (
        <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Endpoints ({endpoints.length})</span>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{engine.adapter_type || 'automations'}</Badge>
                    {workerBaseUrl && (
                        <a
                            href={`${workerBaseUrl}/api/docs`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                            Swagger UI <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                    )}
                </div>
            </div>
            <ScrollArea className="flex-1">
                <Accordion type="multiple" className="px-4 py-2">
                    {endpoints.map((ep, i) => {
                        const oaInfo = openApiSpec ? getOpenApiInfo(openApiSpec, ep.path, ep.method) : null;
                        const fullUrl = workerBaseUrl ? `${workerBaseUrl}${ep.path}` : null;
                        const isClickable = ep.method === 'GET' && fullUrl && !ep.path.includes(':');
                        return (
                            <AccordionItem key={i} value={`ep-${i}`} className="border-b-0 mb-1">
                                <AccordionTrigger className="py-2 px-2.5 rounded-lg border bg-card hover:bg-accent/50 hover:no-underline [&[data-state=open]]:rounded-b-none">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${METHOD_COLORS[ep.method] || ''}`}>
                                            {ep.method}
                                        </span>
                                        {isClickable ? (
                                            <a
                                                href={fullUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-mono font-medium text-primary hover:underline flex items-center gap-1"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {ep.path}
                                                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                                            </a>
                                        ) : (
                                            <span className="text-sm font-mono font-medium">{ep.path}</span>
                                        )}
                                        {ep.dynamic && <Badge variant="secondary" className="text-[10px] h-4">dynamic</Badge>}
                                        <span className="text-[10px] text-muted-foreground ml-auto mr-2 hidden sm:inline">{ep.description}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-2.5 pb-2.5 border border-t-0 rounded-b-lg bg-card">
                                    <div className="space-y-3 pt-2">
                                        <p className="text-xs text-muted-foreground">{oaInfo?.summary || ep.description}</p>
                                        {fullUrl && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground">URL:</span>
                                                <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded break-all">{fullUrl}</code>
                                            </div>
                                        )}
                                        {oaInfo?.requestBody && (
                                            <div>
                                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Request Body</div>
                                                <pre className="text-[10px] font-mono bg-muted p-2 rounded overflow-x-auto max-h-32">
                                                    {JSON.stringify(
                                                        oaInfo.requestBody?.content?.['application/json']?.schema || oaInfo.requestBody,
                                                        null, 2
                                                    )}
                                                </pre>
                                            </div>
                                        )}
                                        {oaInfo?.parameters && oaInfo.parameters.length > 0 && (
                                            <div>
                                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Parameters</div>
                                                <div className="space-y-1">
                                                    {oaInfo.parameters.map((p: any, j: number) => (
                                                        <div key={j} className="flex items-center gap-2 text-[10px]">
                                                            <Badge variant="outline" className="text-[9px] h-4">{p.in}</Badge>
                                                            <code className="font-mono">{p.name}</code>
                                                            {p.required && <span className="text-red-400">*</span>}
                                                            <span className="text-muted-foreground">{p.schema?.type || ''}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {oaInfo?.responses && (
                                            <div>
                                                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Responses</div>
                                                <div className="space-y-1">
                                                    {Object.entries(oaInfo.responses).map(([code, resp]: [string, any]) => (
                                                        <div key={code} className="flex items-start gap-2 text-[10px]">
                                                            <Badge variant={code.startsWith('2') ? 'default' : 'destructive'} className="text-[9px] h-4 shrink-0">{code}</Badge>
                                                            <span className="text-muted-foreground">{resp.description || ''}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {!oaInfo && (
                                            <p className="text-[10px] text-muted-foreground italic">No OpenAPI documentation available for this endpoint.</p>
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
                <div className="px-4 pb-4">
                    <p className="text-[10px] text-muted-foreground italic">
                        Endpoints are baked into the bundle at build time. Publishing pages or automations
                        uses existing endpoints — no new routes are created.
                    </p>
                </div>
            </ScrollArea>
        </div>
    );
};
