import React from 'react';
import { CheckCircle, ChevronDown, Columns, Table } from 'lucide-react';

interface ColumnsDropdownProps {
    isColumnsDropdownOpen: boolean;
    setIsColumnsDropdownOpen: (open: boolean) => void;
    visibleColumns: string[];
    availableFields: string[];
    columnSearch: string;
    setColumnSearch: (search: string) => void;
    setVisibleColumns: (cols: string[]) => void;
    tableData: any;
    toggleVisibility: (col: string, fields: string[]) => void;
}

export const ColumnsDropdown: React.FC<ColumnsDropdownProps> = ({
    isColumnsDropdownOpen,
    setIsColumnsDropdownOpen,
    visibleColumns,
    availableFields,
    columnSearch,
    setColumnSearch,
    setVisibleColumns,
    tableData,
    toggleVisibility
}) => {
    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsColumnsDropdownOpen(!isColumnsDropdownOpen);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${isColumnsDropdownOpen ? 'bg-primary-600 border-primary-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-400'} `}
            >
                <Columns size={14} />
                <span>Columns</span>
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded text-[10px] ml-1">
                    {visibleColumns.length === 0 ? availableFields.length : visibleColumns.length}/{availableFields.length}
                </span>
                <ChevronDown size={14} className={`transition-transform ${isColumnsDropdownOpen ? 'rotate-180' : ''} `} />
            </button>

            {isColumnsDropdownOpen && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2"
                >
                    <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-lg px-2 py-1.5">
                            <Table size={12} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search columns..."
                                className="bg-transparent border-none outline-none text-xs w-full font-medium"
                                value={columnSearch}
                                onChange={(e) => setColumnSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50 dark:border-gray-700/50 mb-1">
                            <button
                                onClick={() => setVisibleColumns([])}
                                className="text-[10px] font-bold text-primary-600 hover:underline"
                            >
                                Show All
                            </button>
                            <button
                                onClick={() => {
                                    const fields = (availableFields.length > 0 ? availableFields : Object.keys(tableData?.records?.[0] || {}));
                                    setVisibleColumns([fields[0] || 'id']); // Keep at least one or none? Let's say none.
                                }}
                                className="text-[10px] font-bold text-gray-400 hover:underline"
                            >
                                Hide All
                            </button>
                        </div>
                        {(availableFields.length > 0 ? availableFields : Object.keys(tableData?.records?.[0] || {}))
                            .filter(col => col.toLowerCase().includes(columnSearch.toLowerCase()))
                            .map(col => (
                                <div
                                    key={col}
                                    onClick={() => {
                                        const fields = (availableFields.length > 0 ? availableFields : Object.keys(tableData?.records?.[0] || {}));
                                        toggleVisibility(col, fields);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg cursor-pointer transition-colors"
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${(visibleColumns.length === 0 || visibleColumns.includes(col)) ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-300'} `}>
                                        {(visibleColumns.length === 0 || visibleColumns.includes(col)) && <CheckCircle size={10} className="text-white" />}
                                    </div>
                                    <span className={`text-[11px] font-semibold ${(visibleColumns.length === 0 || visibleColumns.includes(col)) ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'} `}>{col}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
};
