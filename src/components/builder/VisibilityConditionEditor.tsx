import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, AlertCircle, Code, Eye } from 'lucide-react';
import { VariableInput } from './VariableInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const OPERATORS = [
    { value: '==', label: 'equals' },
    { value: '!=', label: 'does not equal' },
    { value: '>=', label: 'greater than or equal to' },
    { value: '<=', label: 'less than or equal to' },
    { value: '>', label: 'greater than' },
    { value: '<', label: 'less than' },
    { value: 'contains', label: 'contains' },
];

interface ConditionRow {
    id: string;
    lhs: string;
    operator: string;
    rhs: string;
}

// Parses a string like "local.modalOpen == true and session.user.id != null"
function parseConditionString(condStr: string): ConditionRow[] | null {
    if (!condStr.trim()) return [];
    
    // If it has complex constructs like OR, parentheses, or Liquid tags, we can't parse it visually
    if (/\bor\b/i.test(condStr) || condStr.includes('(') || condStr.includes(')') || condStr.includes('{%')) {
        return null;
    }

    const parts = condStr.split(/\s+and\s+/i);
    const rows: ConditionRow[] = [];

    for (const part of parts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;

        let matchedOp: string | null = null;
        let lhs = '';
        let rhs = '';

        // Find the operator
        for (const op of OPERATORS) {
            // Find operator with word boundaries if it's alphanumeric (like "contains")
            const opRegex = op.value === 'contains' 
                ? new RegExp(`\\s+contains\\s+`, 'i') 
                : new RegExp(`\\s*${op.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*`);
                
            const match = trimmedPart.match(opRegex);
            if (match && match.index !== undefined) {
                matchedOp = op.value;
                lhs = trimmedPart.substring(0, match.index).trim();
                rhs = trimmedPart.substring(match.index + match[0].length).trim();
                break;
            }
        }

        if (matchedOp) {
            rows.push({
                id: crypto.randomUUID(),
                lhs,
                operator: matchedOp,
                rhs,
            });
        } else {
            // If no operator found, maybe it's just a single truthy variable check (e.g. "local.modalOpen")
            if (/^[a-zA-Z0-9_\.@\s{}'"]+$/.test(trimmedPart)) {
                rows.push({
                    id: crypto.randomUUID(),
                    lhs: trimmedPart,
                    operator: '==',
                    rhs: 'true',
                });
            } else {
                return null; // Can't parse complex syntax
            }
        }
    }

    return rows;
}

function serializeConditionRows(rows: ConditionRow[]): string {
    if (rows.length === 0) return '';
    return rows
        .map(row => {
            const lhs = row.lhs.trim() || 'true';
            const rhs = row.rhs.trim() || 'true';
            const op = row.operator;
            const opStr = op === 'contains' ? ` contains ` : ` ${op} `;
            return `${lhs}${opStr}${rhs}`;
        })
        .join(' and ');
}

interface VisibilityConditionEditorProps {
    value: string;
    onChange: (value: string) => void;
}

export function VisibilityConditionEditor({ value, onChange }: VisibilityConditionEditorProps) {
    const [mode, setMode] = useState<'visual' | 'code'>('visual');
    const [canParse, setCanParse] = useState(true);
    const [rows, setRows] = useState<ConditionRow[]>([]);

    // Sync state from value when value changes externally
    useEffect(() => {
        const parsed = parseConditionString(value);
        if (parsed !== null) {
            setRows(parsed);
            setCanParse(true);
        } else {
            setCanParse(false);
            setMode('code'); // Default to code mode if it's unparseable
        }
    }, [value]);

    const handleRowChange = (index: number, updates: Partial<ConditionRow>) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], ...updates };
        setRows(newRows);
        onChange(serializeConditionRows(newRows));
    };

    const handleAddRow = () => {
        const newRows = [...rows, { id: crypto.randomUUID(), lhs: '', operator: '==', rhs: '' }];
        setRows(newRows);
        onChange(serializeConditionRows(newRows));
    };

    const handleRemoveRow = (index: number) => {
        const newRows = rows.filter((_, i) => i !== index);
        setRows(newRows);
        onChange(serializeConditionRows(newRows));
    };

    const handleResetToVisual = () => {
        setRows([]);
        onChange('');
        setCanParse(true);
        setMode('visual');
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Visibility Condition</Label>
                <div className="flex bg-muted rounded-md p-0.5 border">
                    <Button
                        type="button"
                        variant={mode === 'visual' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={!canParse}
                        onClick={() => setMode('visual')}
                    >
                        <Eye className="h-3 w-3 mr-1" />
                        Visual
                    </Button>
                    <Button
                        type="button"
                        variant={mode === 'code' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => setMode('code')}
                    >
                        <Code className="h-3 w-3 mr-1" />
                        Code
                    </Button>
                </div>
            </div>

            {mode === 'visual' && canParse ? (
                <div className="space-y-2">
                    {rows.map((row, idx) => (
                        <div key={row.id} className="flex gap-2 items-start bg-muted/20 p-2 border rounded-md relative group">
                            <div className="flex-1 space-y-2">
                                <VariableInput
                                    value={row.lhs}
                                    onChange={(val) => handleRowChange(idx, { lhs: val })}
                                    placeholder="Variable (e.g. local.modalOpen)"
                                    className="h-8 text-xs bg-background"
                                    allowedGroups={['page', 'user', 'visitor', 'system', 'url', 'local', 'session', 'cookies']}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <Select
                                        value={row.operator}
                                        onValueChange={(val) => handleRowChange(idx, { operator: val })}
                                    >
                                        <SelectTrigger className="h-8 text-xs bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OPERATORS.map((op) => (
                                                <SelectItem key={op.value} value={op.value} className="text-xs">
                                                    {op.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <VariableInput
                                        value={row.rhs}
                                        onChange={(val) => handleRowChange(idx, { rhs: val })}
                                        placeholder="Value or @variable"
                                        className="h-8 text-xs bg-background"
                                        allowedGroups={['page', 'user', 'visitor', 'system', 'url', 'local', 'session', 'cookies']}
                                    />
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => handleRemoveRow(idx)}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddRow}
                        className="w-full h-8 text-xs border-dashed"
                    >
                        <Plus className="h-3 w-3 mr-1" /> Add condition row
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {!canParse && (
                        <div className="flex items-start gap-2 p-2 bg-yellow-50 text-yellow-800 text-xs rounded-md border border-yellow-200">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-semibold">Complex expression detected</p>
                                <p>This condition contains complex logic (such as parentheses, OR operators, or Liquid loops) and can only be edited in Code mode.</p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] px-2 bg-white text-yellow-800 border-yellow-300 hover:bg-yellow-100"
                                    onClick={handleResetToVisual}
                                >
                                    Reset to Visual Builder
                                </Button>
                            </div>
                        </div>
                    )}
                    <VariableInput
                        value={value}
                        onChange={onChange}
                        placeholder="e.g. local.modalOpen == true"
                        className="font-mono text-xs"
                        allowedGroups={['page', 'user', 'visitor', 'system', 'url', 'local', 'session', 'cookies']}
                    />
                </div>
            )}
        </div>
    );
}
