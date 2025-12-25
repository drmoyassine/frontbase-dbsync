import React from 'react';
import { Info } from 'lucide-react';

interface StepBasicsProps {
    formData: {
        name: string;
        description: string;
        conflict_strategy: string;
        batch_size: number;
    };
    onChange: (field: string, value: any) => void;
}

export const StepBasics: React.FC<StepBasicsProps> = ({ formData, onChange }) => {
    return (
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Configuration Name</label>
                    <div className="relative mt-2">
                        <Info className="absolute left-4 top-3.5 size-4 text-gray-400" />
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => onChange('name', e.target.value)}
                            className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-medium"
                            placeholder="e.g. Daily Orders Sync"
                            required
                        />
                    </div>
                </div>

                <div className="col-span-2">
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Description (Optional)</label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => onChange('description', e.target.value)}
                        className="w-full mt-2 px-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-medium h-24 resize-none"
                        placeholder="Brief purpose of this synchronization..."
                    />
                </div>

                <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Conflict Strategy</label>
                    <select
                        value={formData.conflict_strategy}
                        onChange={(e) => onChange('conflict_strategy', e.target.value)}
                        className="w-full mt-2 px-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold"
                    >
                        <option value="source_wins">Source Wins</option>
                        <option value="target_wins">Target Wins</option>
                        <option value="manual">Manual Review</option>
                        <option value="merge">Merge</option>
                        <option value="webhook">Webhook Trigger</option>
                    </select>
                </div>

                <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Batch Size</label>
                    <input
                        type="number"
                        value={formData.batch_size}
                        onChange={(e) => onChange('batch_size', parseInt(e.target.value))}
                        className="w-full mt-2 px-4 py-3.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all font-bold"
                    />
                </div>
            </div>
        </div>
    );
};
