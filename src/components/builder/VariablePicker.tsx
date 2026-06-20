/**
 * Variable Picker - Autocomplete dropdown for template variables
 * 
 * Shows variable groups first (page, user, visitor, etc.)
 * Drill down into specific variables when a group is clicked.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useVariables, Variable, Filter } from '../../hooks/useVariables';
import { cn } from '@/lib/utils';
import {
    SyntaxContext,
    DEFAULT_SYNTAX_CONTEXT,
    filtersAllowedForContext,
    logicAllowedForContext,
} from '@/lib/liquid/syntaxContext';
import { ChevronRight, ChevronLeft, FileText, User, Globe, Link, Clock, Database, Box, Cookie, Layers, Code2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LOGIC_SNIPPETS, LogicSnippet } from '@/lib/liquid/logicSnippets';
import { LogicSnippetWizard } from './LogicSnippetWizard';

interface VariablePickerProps {
    onSelect: (value: string, caretOffset?: number) => void;
    onClose: () => void;
    searchTerm: string;
    position: { top: number; left: number };
    showFilters?: boolean;
    /** Syntax context — gates which categories are offered (filters, logic snippets). */
    syntaxContext?: SyntaxContext;
    /** Optional list of allowed variable groups (e.g., ['visitor', 'system', 'user', 'record']) */
    allowedGroups?: string[];
    /**
     * Real columns to offer as `{{ record.<col> }}` tokens inside a Repeater.
     * When provided, the Record group lists these instead of a placeholder.
     */
    recordColumns?: string[];
}

// Group icons and labels
const GROUP_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; description: string }> = {
    page: { icon: <FileText className="h-4 w-4" />, label: 'Page', color: 'text-blue-500', description: 'Current page details' },
    visitor: { icon: <Globe className="h-4 w-4" />, label: 'Visitor', color: 'text-purple-500', description: 'Visitor info & location' },
    user: { icon: <User className="h-4 w-4" />, label: 'User', color: 'text-green-500', description: 'Authenticated user data' },
    url: { icon: <Link className="h-4 w-4" />, label: 'URL Params', color: 'text-orange-500', description: 'Query string parameters' },
    system: { icon: <Clock className="h-4 w-4" />, label: 'System', color: 'text-cyan-500', description: 'Date and time info' },
    record: { icon: <Database className="h-4 w-4" />, label: 'Record', color: 'text-pink-500', description: 'Current record data' },
    local: { icon: <Box className="h-4 w-4" />, label: 'Local', color: 'text-yellow-600', description: 'Page-level variables' },
    session: { icon: <Layers className="h-4 w-4" />, label: 'Session', color: 'text-indigo-500', description: 'Session storage values' },
    cookies: { icon: <Cookie className="h-4 w-4" />, label: 'Cookies', color: 'text-amber-600', description: 'Browser cookie values' },
    __logic: { icon: <Code2 className="h-4 w-4" />, label: 'Logic & Loops', color: 'text-rose-500', description: 'Conditionals, loops & variables' },
};

export function VariablePicker({
    onSelect,
    onClose,
    searchTerm,
    position,
    showFilters = false,
    syntaxContext = DEFAULT_SYNTAX_CONTEXT,
    allowedGroups,
    recordColumns,
}: VariablePickerProps) {
    const { variables, filters, isLoading } = useVariables();
    // Filters are offered only when triggered AND the syntax context allows them
    // (never in an 'expression' field like visibility/RLS).
    const allowFilters = showFilters && filtersAllowedForContext(syntaxContext);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    // Logic-snippet mini-wizard: when set, the wizard dialog is open for this snippet.
    const [wizardSnippet, setWizardSnippet] = useState<LogicSnippet | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef<HTMLDivElement>(null);

    // Group variables by source
    const groupedVariables = useMemo(() => {
        const groups: Record<string, Variable[]> = {};
        variables.forEach(v => {
            if (!groups[v.source]) {
                groups[v.source] = [];
            }
            groups[v.source].push(v);
        });
        return groups;
    }, [variables]);

    // Real record columns (when authoring inside a Repeater), else the API's
    // placeholder record variables.
    const recordVariables = useMemo<Variable[]>(() => {
        if (recordColumns && recordColumns.length > 0) {
            return recordColumns.map(col => ({
                path: `record.${col}`,
                type: 'any' as const,
                source: 'record' as const,
                description: col,
            }));
        }
        return groupedVariables['record'] || [];
    }, [recordColumns, groupedVariables]);

    // Get available groups (filtered by allowedGroups if provided)
    const availableGroups = useMemo(() => {
        let allGroups = Object.keys(groupedVariables).filter(g => groupedVariables[g].length > 0);
        // Ensure the Record group shows when real columns are available, even if
        // the variables API didn't enumerate record vars.
        if (recordColumns && recordColumns.length > 0 && !allGroups.includes('record')) {
            allGroups.push('record');
        }
        if (allowedGroups && allowedGroups.length > 0) {
            allGroups = allGroups.filter(g => allowedGroups.includes(g));
        }
        // Logic & Loops group — offered only in output contexts.
        if (logicAllowedForContext(syntaxContext) && !allGroups.includes('__logic')) {
            allGroups.push('__logic');
        }
        return allGroups;
    }, [groupedVariables, allowedGroups, recordColumns, syntaxContext]);

    // Filter based on search term
    const filteredGroups = useMemo(() => {
        if (!searchTerm) return availableGroups;
        return availableGroups.filter(g => {
            if (g === '__logic') {
                const label = GROUP_CONFIG['__logic']?.label.toLowerCase() ?? 'logic';
                return label.includes(searchTerm.toLowerCase()) ||
                    LOGIC_SNIPPETS.some(s => s.label.toLowerCase().includes(searchTerm.toLowerCase()));
            }
            const config = GROUP_CONFIG[g];
            if (config?.label.toLowerCase().includes(searchTerm.toLowerCase())) return true;
            // Also include if any variable in group matches
            const groupVars = g === 'record' ? recordVariables : groupedVariables[g];
            return groupVars?.some(v =>
                v.path.toLowerCase().includes(searchTerm.toLowerCase())
            );
        });
    }, [availableGroups, groupedVariables, searchTerm, recordVariables]);

    const filteredVariables = useMemo(() => {
        if (!activeGroup || activeGroup === '__logic') return [];
        const vars = activeGroup === 'record' ? recordVariables : (groupedVariables[activeGroup] || []);
        if (!searchTerm) return vars;
        return vars.filter(v =>
            v.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [activeGroup, groupedVariables, searchTerm, recordVariables]);

    // Logic snippets (filtered) — shown when the Logic & Loops group is open.
    const filteredSnippets = useMemo<LogicSnippet[]>(() => {
        if (!searchTerm) return LOGIC_SNIPPETS;
        return LOGIC_SNIPPETS.filter(s =>
            s.label.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm]);

    const filteredFilters = useMemo(() => {
        if (!allowFilters) return [];
        if (!searchTerm) return filters;
        return filters.filter(f =>
            f.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [allowFilters, filters, searchTerm]);

    // Total selectable items in the current view (groups, variables, snippets, filters).
    const inLogicGroup = activeGroup === '__logic';
    const totalItems = inLogicGroup
        ? filteredSnippets.length
        : activeGroup
            ? filteredVariables.length
            : filteredGroups.length + (allowFilters ? filteredFilters.length : 0);

    // Reset selection when view changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [activeGroup, searchTerm]);

    // Scroll selected item into view
    useEffect(() => {
        selectedRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex(i => Math.min(i + 1, totalItems - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex(i => Math.max(i - 1, 0));
                    break;
                case 'ArrowRight':
                case 'Enter':
                case 'Tab':
                    e.preventDefault();
                    handleSelect(selectedIndex);
                    break;
                case 'ArrowLeft':
                case 'Backspace':
                    if (activeGroup && (e.key === 'ArrowLeft' || (e.key === 'Backspace' && !searchTerm))) {
                        e.preventDefault();
                        setActiveGroup(null);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (activeGroup) {
                        setActiveGroup(null);
                    } else {
                        onClose();
                    }
                    break;
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, totalItems, activeGroup, searchTerm]);

    const handleSelect = useCallback((index: number) => {
        if (inLogicGroup) {
            // Selecting a logic snippet — open the mini-wizard to collect fields,
            // then insert complete Liquid (no empty `{%  %}` gaps).
            const snippet = filteredSnippets[index];
            if (snippet) setWizardSnippet(snippet);
            return;
        }
        if (!activeGroup) {
            // Selecting a group - drill down
            if (index < filteredGroups.length) {
                setActiveGroup(filteredGroups[index]);
            } else if (allowFilters) {
                // Filter selected
                const filterIndex = index - filteredGroups.length;
                onSelect(` | ${filteredFilters[filterIndex].name}`);
                onClose();
            }
        } else {
            // Selecting a variable
            if (index < filteredVariables.length) {
                onSelect(`{{ ${filteredVariables[index].path} }}`);
                onClose();
            }
        }
    }, [inLogicGroup, activeGroup, filteredGroups, filteredVariables, filteredFilters, filteredSnippets, allowFilters, onSelect, onClose]);

    // Close on click outside — but not while the snippet wizard dialog is open
    // (the dialog renders in its own portal, which counts as "outside").
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wizardSnippet) return;
            const target = e.target as HTMLElement;
            // Ignore clicks inside any Radix portal (dialog/select/tooltip content).
            if (target.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
            if (listRef.current && !listRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, wizardSnippet]);

    if (totalItems === 0 && !isLoading) {
        return ReactDOM.createPortal(
            <div
                ref={listRef}
                className="variable-picker fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg max-h-80 min-w-[260px] max-w-[360px] overflow-y-auto"
                style={{ top: position.top, left: position.left }}
            >
                <div className="p-3 text-sm text-muted-foreground">
                    No variables found
                </div>
            </div>,
            document.body
        );
    }

    return ReactDOM.createPortal(
        <>
        <div
            ref={listRef}
            className="variable-picker fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg max-h-80 min-w-[260px] max-w-[360px] overflow-y-auto"
            onMouseDown={(e) => e.preventDefault()}
            style={{ top: position.top, left: position.left }}
        >
            {isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">Loading...</div>
            ) : (
                <>
                    {/* Header with back button when in a group */}
                    {activeGroup && (
                        <div className="header-back-container">
                            <div
                                className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border cursor-pointer text-sm hover:bg-accent"
                                onClick={() => setActiveGroup(null)}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                <span className={GROUP_CONFIG[activeGroup]?.color}>
                                    {GROUP_CONFIG[activeGroup]?.icon}
                                </span>
                                <span className="font-medium">{GROUP_CONFIG[activeGroup]?.label || activeGroup}</span>
                            </div>
                            {GROUP_CONFIG[activeGroup]?.description && (
                                <div className="text-xs text-muted-foreground px-3 pb-2 pt-0.5 ml-6 border-b border-border/50 mb-1">
                                    {GROUP_CONFIG[activeGroup].description}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Groups view */}
                    {!activeGroup && filteredGroups.length > 0 && (
                        <div className="py-1">
                            <div className="px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                <span>📁</span> Variable Groups
                            </div>
                            {filteredGroups.map((group, i) => {
                                const config = GROUP_CONFIG[group] || { icon: <Box className="h-4 w-4" />, label: group, color: 'text-gray-500' };
                                const count = group === '__logic'
                                    ? LOGIC_SNIPPETS.length
                                    : (groupedVariables[group]?.length || 0);
                                return (
                                    <div
                                        key={group}
                                        ref={i === selectedIndex ? selectedRef : null}
                                        className={cn(
                                            'px-3 py-2.5 cursor-pointer flex items-center gap-2.5 text-sm transition-colors',
                                            i === selectedIndex && 'bg-accent'
                                        )}
                                        onClick={() => handleSelect(i)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        <span className={cn('flex-shrink-0', config.color)}>{config.icon}</span>
                                        <span className="font-medium text-foreground">{config.label}</span>
                                        <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Variables in active group */}
                    {activeGroup && filteredVariables.length > 0 && (
                        <div className="py-1">
                            {filteredVariables.map((v, i) => {
                                // Get the property name (after the dot)
                                const propName = v.path.split('.').pop() || v.path;
                                return (
                                    <div
                                        key={v.path}
                                        ref={i === selectedIndex ? selectedRef : null}
                                        className={cn(
                                            'px-3 py-2 cursor-pointer flex items-center gap-2 text-sm transition-colors',
                                            i === selectedIndex && 'bg-accent'
                                        )}
                                        onClick={() => handleSelect(i)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        <span className="font-mono font-medium text-foreground">{propName}</span>
                                        <span className="text-[0.7rem] text-muted-foreground bg-muted px-1 py-0.5 rounded">{v.type}</span>
                                        {v.description && (
                                            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">{v.description}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Logic snippets (when the Logic & Loops group is open) */}
                    {inLogicGroup && filteredSnippets.length > 0 && (
                        <TooltipProvider delayDuration={300}>
                            <div className="py-1">
                                {filteredSnippets.map((s, i) => (
                                    <Tooltip key={s.key}>
                                        <TooltipTrigger asChild>
                                            <div
                                                ref={i === selectedIndex ? selectedRef : null}
                                                className={cn(
                                                    'px-3 py-2 cursor-pointer flex items-center gap-2 text-sm transition-colors',
                                                    i === selectedIndex && 'bg-accent'
                                                )}
                                                onClick={() => handleSelect(i)}
                                                onMouseEnter={() => setSelectedIndex(i)}
                                            >
                                                <span className="font-mono text-xs bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900">{s.label}</span>
                                                {s.description && (
                                                    <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px]">{s.description}</span>
                                                )}
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="max-w-[240px]">
                                            <p className="font-medium">{s.tooltip}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">{s.example}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        </TooltipProvider>
                    )}

                    {/* Filters (only in root view) */}
                    {!activeGroup && allowFilters && filteredFilters.length > 0 && (
                        <div className="py-1">
                            <div className="px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                <span>🔧</span> Filters
                            </div>
                            {filteredFilters.map((f, i) => {
                                const actualIndex = i + filteredGroups.length;
                                return (
                                    <div
                                        key={f.name}
                                        ref={actualIndex === selectedIndex ? selectedRef : null}
                                        className={cn(
                                            'px-3 py-2 cursor-pointer flex items-center gap-2 text-sm transition-colors',
                                            actualIndex === selectedIndex && 'bg-accent'
                                        )}
                                        onClick={() => handleSelect(actualIndex)}
                                        onMouseEnter={() => setSelectedIndex(actualIndex)}
                                    >
                                        <span className="font-mono font-medium text-foreground">{f.name}</span>
                                        {f.args && f.args.length > 0 && (
                                            <span className="text-[0.7rem] text-muted-foreground bg-muted px-1 py-0.5 rounded">({f.args.join(', ')})</span>
                                        )}
                                        <span className="text-xs text-muted-foreground ml-auto">{f.description}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
        <LogicSnippetWizard
            snippet={wizardSnippet}
            open={!!wizardSnippet}
            onClose={() => setWizardSnippet(null)}
            onInsert={(text, caretOffset) => {
                onSelect(text, caretOffset);
                onClose();
            }}
        />
        </>,
        document.body
    );
}
