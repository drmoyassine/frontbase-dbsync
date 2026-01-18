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
}

// Group icons and labels
const GROUP_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    page: { icon: <FileText className="h-4 w-4" />, label: 'Page', color: 'text-blue-500' },
    user: { icon: <User className="h-4 w-4" />, label: 'User', color: 'text-green-500' },
    visitor: { icon: <Globe className="h-4 w-4" />, label: 'Visitor', color: 'text-purple-500' },
    url: { icon: <Link className="h-4 w-4" />, label: 'URL Params', color: 'text-orange-500' },
    system: { icon: <Clock className="h-4 w-4" />, label: 'System', color: 'text-cyan-500' },
    record: { icon: <Database className="h-4 w-4" />, label: 'Record', color: 'text-pink-500' },
    local: { icon: <Box className="h-4 w-4" />, label: 'Local', color: 'text-yellow-600' },
    session: { icon: <Layers className="h-4 w-4" />, label: 'Session', color: 'text-indigo-500' },
    cookies: { icon: <Cookie className="h-4 w-4" />, label: 'Cookies', color: 'text-amber-600' },
};

export function VariablePicker({
    onSelect,
    onClose,
    searchTerm,
    position,
    showFilters = false,
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

    // Get available groups
    const availableGroups = useMemo(() => {
        return Object.keys(groupedVariables).filter(g => groupedVariables[g].length > 0);
    }, [groupedVariables]);

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
                className="variable-picker"
                style={{
                    position: 'fixed',
                    top: position.top,
                    left: position.left,
                    zIndex: 9999,
                }}
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
            className="variable-picker"
            onMouseDown={(e) => e.preventDefault()}
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                zIndex: 9999,
            }}
        >
            {isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">Loading...</div>
            ) : (
                <>
                    {/* Header with back button when in a group */}
                    {activeGroup && (
                        <div
                            className="header-back"
                            onClick={() => setActiveGroup(null)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            <span className={GROUP_CONFIG[activeGroup]?.color}>
                                {GROUP_CONFIG[activeGroup]?.icon}
                            </span>
                            <span className="font-medium">{GROUP_CONFIG[activeGroup]?.label || activeGroup}</span>
                        </div>
                    )}

                    {/* Groups view */}
                    {!activeGroup && filteredGroups.length > 0 && (
                        <div className="section">
                            <div className="section-header">
                                <span className="icon">📁</span> Variable Groups
                            </div>
                            {filteredGroups.map((group, i) => {
                                const config = GROUP_CONFIG[group] || { icon: <Box className="h-4 w-4" />, label: group, color: 'text-gray-500' };
                                const count = groupedVariables[group]?.length || 0;
                                return (
                                    <div
                                        key={group}
                                        ref={i === selectedIndex ? selectedRef : null}
                                        className={cn(
                                            'group-item',
                                            i === selectedIndex && 'selected'
                                        )}
                                        onClick={() => handleSelect(i)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        <span className={cn('icon', config.color)}>{config.icon}</span>
                                        <span className="label">{config.label}</span>
                                        <span className="count">{count}</span>
                                        <ChevronRight className="h-4 w-4 chevron" />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Variables in active group */}
                    {activeGroup && filteredVariables.length > 0 && (
                        <div className="section">
                            {filteredVariables.map((v, i) => {
                                // Get the property name (after the dot)
                                const propName = v.path.split('.').pop() || v.path;
                                return (
                                    <div
                                        key={v.path}
                                        ref={i === selectedIndex ? selectedRef : null}
                                        className={cn(
                                            'item',
                                            i === selectedIndex && 'selected'
                                        )}
                                        onClick={() => handleSelect(i)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        <span className="path">{propName}</span>
                                        <span className="type">{v.type}</span>
                                        {v.description && (
                                            <span className="description">{v.description}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Filters (only in root view) */}
                    {!activeGroup && showFilters && filteredFilters.length > 0 && (
                        <div className="section">
                            <div className="section-header">
                                <span className="icon">🔧</span> Filters
                            </div>
                            {filteredFilters.map((f, i) => {
                                const actualIndex = i + filteredGroups.length;
                                return (
                                    <div
                                        key={f.name}
                                        ref={actualIndex === selectedIndex ? selectedRef : null}
                                        className={cn(
                                            'item',
                                            actualIndex === selectedIndex && 'selected'
                                        )}
                                        onClick={() => handleSelect(actualIndex)}
                                        onMouseEnter={() => setSelectedIndex(actualIndex)}
                                    >
                                        <span className="name">{f.name}</span>
                                        {f.args && f.args.length > 0 && (
                                            <span className="args">({f.args.join(', ')})</span>
                                        )}
                                        <span className="description">{f.description}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <style>{`
                .variable-picker {
                    background: hsl(var(--popover));
                    border: 1px solid hsl(var(--border));
                    border-radius: 0.5rem;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                    max-height: 320px;
                    min-width: 260px;
                    max-width: 360px;
                    overflow-y: auto;
                }
                .variable-picker .header-back {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 0.75rem;
                    background: hsl(var(--muted));
                    border-bottom: 1px solid hsl(var(--border));
                    cursor: pointer;
                    font-size: 0.875rem;
                }
                .variable-picker .header-back:hover {
                    background: hsl(var(--accent));
                }
                .variable-picker .section {
                    padding: 0.25rem 0;
                }
                .variable-picker .section-header {
                    padding: 0.5rem 0.75rem;
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: hsl(var(--muted-foreground));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .variable-picker .group-item {
                    padding: 0.625rem 0.75rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    font-size: 0.875rem;
                    transition: background 0.1s;
                }
                .variable-picker .group-item:hover,
                .variable-picker .group-item.selected {
                    background: hsl(var(--accent));
                }
                .variable-picker .group-item .icon {
                    flex-shrink: 0;
                }
                .variable-picker .group-item .label {
                    font-weight: 500;
                    color: hsl(var(--foreground));
                }
                .variable-picker .group-item .count {
                    margin-left: auto;
                    font-size: 0.75rem;
                    color: hsl(var(--muted-foreground));
                    background: hsl(var(--muted));
                    padding: 0.125rem 0.375rem;
                    border-radius: 9999px;
                }
                .variable-picker .group-item .chevron {
                    color: hsl(var(--muted-foreground));
                    flex-shrink: 0;
                }
                .variable-picker .item {
                    padding: 0.5rem 0.75rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.875rem;
                    transition: background 0.1s;
                }
                .variable-picker .item:hover,
                .variable-picker .item.selected {
                    background: hsl(var(--accent));
                }
                .variable-picker .item .path,
                .variable-picker .item .name {
                    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
                    font-weight: 500;
                    color: hsl(var(--foreground));
                }
                .variable-picker .item .type,
                .variable-picker .item .args {
                    font-size: 0.7rem;
                    color: hsl(var(--muted-foreground));
                    background: hsl(var(--muted));
                    padding: 0.0625rem 0.25rem;
                    border-radius: 0.25rem;
                }
                .variable-picker .item .description {
                    font-size: 0.75rem;
                    color: hsl(var(--muted-foreground));
                    margin-left: auto;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 120px;
                }
            `}</style>
        </div>
    );
}
