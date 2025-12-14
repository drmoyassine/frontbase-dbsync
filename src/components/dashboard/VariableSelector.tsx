import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Plus, User, Database, Clock, Key } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface VariableOption {
    value: string;
    label: string;
    description?: string;
    category: 'user' | 'system' | 'target' | 'other';
}

interface VariableSelectorProps {
    onSelect: (value: string, category: VariableOption['category']) => void;
    userColumns?: Array<{ name: string; type: string }>; // For 'user' category
    targetColumns?: Array<{ name: string; type: string }>; // For 'target' category (comparing row cols)
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function VariableSelector({
    onSelect,
    userColumns = [],
    targetColumns = [],
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange
}: VariableSelectorProps) {
    const [internalOpen, setInternalOpen] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? controlledOnOpenChange : setInternalOpen;

    const handleSelect = (value: string, category: VariableOption['category']) => {
        onSelect(value, category);
        setOpen?.(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-muted ml-1 shrink-0"
                    title="Insert Variable"
                >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[280px]" align="start">
                <Command>
                    <CommandInput placeholder="Search variables..." />
                    <CommandList>
                        <CommandEmpty>No variables found.</CommandEmpty>

                        {/* System Variables */}
                        <CommandGroup heading="System">
                            <CommandItem onSelect={() => handleSelect('auth.uid()', 'system')} className="gap-2">
                                <Key className="h-3 w-3 text-muted-foreground" />
                                <div className="flex flex-col">
                                    <span>User ID</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">auth.uid()</span>
                                </div>
                            </CommandItem>
                            <CommandItem onSelect={() => handleSelect('auth.email()', 'system')} className="gap-2">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <div className="flex flex-col">
                                    <span>User Email</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">auth.email()</span>
                                </div>
                            </CommandItem>
                            <CommandItem onSelect={() => handleSelect('now()', 'system')} className="gap-2">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <div className="flex flex-col">
                                    <span>Current Time</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">now()</span>
                                </div>
                            </CommandItem>
                        </CommandGroup>

                        <CommandSeparator />

                        {/* User Attributes (from contacts) */}
                        {userColumns.length > 0 && (
                            <CommandGroup heading="User Attributes (contacts)">
                                <ScrollArea className="max-h-[140px]">
                                    {userColumns.map(col => (
                                        <CommandItem
                                            key={`user-${col.name}`}
                                            onSelect={() => handleSelect(col.name, 'user')}
                                            className="gap-2"
                                        >
                                            <User className="h-3 w-3 text-muted-foreground" />
                                            <div className="flex flex-col">
                                                <span>{col.name}</span>
                                                <span className="text-[10px] text-muted-foreground font-mono">{col.type}</span>
                                            </div>
                                        </CommandItem>
                                    ))}
                                </ScrollArea>
                            </CommandGroup>
                        )}

                        {userColumns.length > 0 && <CommandSeparator />}

                        {/* Target Table Columns */}
                        {targetColumns.length > 0 && (
                            <CommandGroup heading="Target Table Columns">
                                <ScrollArea className="max-h-[140px]">
                                    {targetColumns.map(col => (
                                        <CommandItem
                                            key={`target-${col.name}`}
                                            onSelect={() => handleSelect(col.name, 'target')}
                                            className="gap-2"
                                        >
                                            <Database className="h-3 w-3 text-muted-foreground" />
                                            <div className="flex flex-col">
                                                <span>{col.name}</span>
                                                <span className="text-[10px] text-muted-foreground font-mono">{col.type}</span>
                                            </div>
                                        </CommandItem>
                                    ))}
                                </ScrollArea>
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
