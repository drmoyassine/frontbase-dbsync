/**
 * Variable Picker - Autocomplete dropdown for template variables
 * 
 * Shows variable groups first (page, user, visitor, etc.)
 * Drill down into specific variables when a group is clicked.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useVariables, Variable, Filter } from '../../hooks/useVariables';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, FileText, User, Globe, Link, Clock, Database, Box, Cookie, Layers } from 'lucide-react';

interface VariablePickerProps {
    onSelect: (value: string) => void;
    onClose: () => void;
    searchTerm: string;
    position: { top: number; left: number };
    showFilters?: boolean;
    /** Optional list of allowed variable groups (e.g., ['visitor', 'system', 'user', 'record']) */
    allowedGroups?: string[];
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
};

export function VariablePicker({
    onSelect,
    onClose,
    searchTerm,
    position,
    showFilters = false,
    allowedGroups,
}: VariablePickerProps) {
    const { variables, filters, isLoading } = useVariables();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
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

    // Get available groups (filtered by allowedGroups if provided)
    const availableGroups = useMemo(() => {
        const allGroups = Object.keys(groupedVariables).filter(g => groupedVariables[g].length > 0);
        if (allowedGroups && allowedGroups.length > 0) {
            return allGroups.filter(g => allowedGroups.includes(g));
        }
        return allGroups;
    }, [groupedVariables, allowedGroups]);

    // Filter based on search term
    const filteredGroups = useMemo(() => {
        if (!searchTerm) return availableGroups;
        return availableGroups.filter(g => {
            const config = GROUP_CONFIG[g];
            if (config?.label.toLowerCase().includes(searchTerm.toLowerCase())) return true;
            // Also include if any variable in group matches
            return groupedVariables[g].some(v =>
                v.path.toLowerCase().includes(searchTerm.toLowerCase())
            );
        });
    }, [availableGroups, groupedVariables, searchTerm]);

    const filteredVariables = useMemo(() => {
        if (!activeGroup) return [];
        const vars = groupedVariables[activeGroup] || [];
        if (!searchTerm) return vars;
        return vars.filter(v =>
            v.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.description?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [activeGroup, groupedVariables, searchTerm]);

    const filteredFilters = useMemo(() => {
        if (!showFilters) return [];
        if (!searchTerm) return filters;
        return filters.filter(f =>
            f.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [showFilters, filters, searchTerm]);

    // Current items to display
    const currentItems = activeGroup ? filteredVariables : filteredGroups;
    const totalItems = currentItems.length + (showFilters && !activeGroup ? filteredFilters.length : 0);

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
        if (!activeGroup) {
            // Selecting a group - drill down
            if (index < filteredGroups.length) {
                setActiveGroup(filteredGroups[index]);
            } else if (showFilters) {
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
    }, [activeGroup, filteredGroups, filteredVariables, filteredFilters, showFilters, onSelect, onClose]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (listRef.current && !listRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (totalItems === 0 && !isLoading) {
        return (
            <div
                ref={listRef}
                className="fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg max-h-80 min-w-[260px] max-w-[360px] overflow-y-auto"
                style={{ top: position.top, left: position.left }}
            >
                <div className="p-3 text-sm text-muted-foreground">
                    No variables found
                </div>
            </div>
        );
    }

    return (
        <div
            ref={listRef}
            className="fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg max-h-80 min-w-[260px] max-w-[360px] overflow-y-auto"
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
                                const count = groupedVariables[group]?.length || 0;
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

                    {/* Filters (only in root view) */}
                    {!activeGroup && showFilters && filteredFilters.length > 0 && (
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
    );
}
