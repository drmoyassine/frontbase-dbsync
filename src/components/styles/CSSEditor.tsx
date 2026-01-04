import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface CSSEditorProps {
    css: string;
    readOnly?: boolean;
    onChange?: (css: string) => void;
}

export const CSSEditor: React.FC<CSSEditorProps> = ({
    css,
    readOnly = false,
    onChange
}) => {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">CSS Styling</Label>
                {readOnly && (
                    <span className="text-xs text-muted-foreground">
                        Switch to Visual mode to edit
                    </span>
                )}
            </div>

            <Textarea
                value={css}
                onChange={(e) => onChange?.(e.target.value)}
                readOnly={readOnly}
                className="font-mono text-sm min-h-[200px] resize-none"
                placeholder="No styles defined yet"
            />

            {readOnly && (
                <p className="text-xs text-muted-foreground">
                    These styles are generated from your visual property controls
                </p>
            )}
        </div>
    );
};
