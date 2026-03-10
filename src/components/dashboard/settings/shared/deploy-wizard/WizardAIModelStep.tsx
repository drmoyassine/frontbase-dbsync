/**
 * WizardAIModelStep — Step 4: GPU model catalog browser.
 *
 * Searchable + filterable model list from the Workers AI catalog.
 */

import { Loader2, Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GPU_TYPE_COLORS, GPU_TYPE_LABELS } from '../edgeConstants';
import type { DeployWizardState } from './useDeployWizard';

export function WizardAIModelStep({
    catalogLoading, catalog,
    catalogFilter, setCatalogFilter,
    catalogTypeFilter, setCatalogTypeFilter,
    catalogTypes, filteredCatalog,
    selectedModel, setSelectedModel,
}: DeployWizardState) {
    return (
        <div className="space-y-3">
            {catalogLoading ? (
                <div className="flex items-center gap-2 py-6 text-muted-foreground justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading model catalog...
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search models..."
                                value={catalogFilter}
                                onChange={(e) => setCatalogFilter(e.target.value)}
                                className="pl-9 h-8"
                            />
                        </div>
                        <Select value={catalogTypeFilter} onValueChange={setCatalogTypeFilter}>
                            <SelectTrigger className="w-[160px] h-8 text-xs">
                                <SelectValue placeholder="All Types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {catalogTypes.map((t) => (
                                    <SelectItem key={t} value={t}>{GPU_TYPE_LABELS[t] || t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {catalog && (
                        <p className="text-xs text-muted-foreground">
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            {catalog.total} models available
                            {selectedModel && (
                                <span className="ml-2 text-primary font-medium">
                                    • Selected: {selectedModel.name.split('/').pop()}
                                </span>
                            )}
                        </p>
                    )}

                    <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto pr-1">
                        {filteredCatalog.slice(0, 40).map((model) => {
                            const isSelected = selectedModel?.model_id === model.model_id;
                            return (
                                <button
                                    key={model.model_id}
                                    type="button"
                                    onClick={() => setSelectedModel(isSelected ? null : model)}
                                    className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${isSelected
                                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                        : 'border-border hover:bg-muted/50'
                                        }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium text-sm truncate">{model.name.split('/').pop()}</div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Badge className={`${GPU_TYPE_COLORS[model.model_type] || 'bg-gray-100 text-gray-700'} text-[10px] h-4 py-0`} variant="secondary">
                                                {GPU_TYPE_LABELS[model.model_type] || model.model_type}
                                            </Badge>
                                        </div>
                                        {model.description && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <Badge className="bg-primary text-primary-foreground text-[10px] ml-2">Selected</Badge>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {filteredCatalog.length > 40 && (
                        <p className="text-xs text-muted-foreground">
                            Showing 40 of {filteredCatalog.length}. Use search to narrow results.
                        </p>
                    )}

                    {!selectedModel && (
                        <p className="text-xs text-muted-foreground italic">
                            You can skip model selection and add one later from the engine card.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
