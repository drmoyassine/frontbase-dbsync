import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTailwindSuggestions } from '@/lib/styleUtils';

interface SpacingControlProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  property: 'padding' | 'margin';
  showIndividualSides?: boolean;
  individualValues?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  onIndividualChange?: (side: string, value: string) => void;
}

export const SpacingControl: React.FC<SpacingControlProps> = ({
  label,
  value,
  onChange,
  property,
  showIndividualSides = true,
  individualValues = {},
  onIndividualChange
}) => {
  const spacingValues = getTailwindSuggestions(property);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange('')}
          className="h-6 px-2 text-xs"
        >
          Clear
        </Button>
      </div>
      
      {/* Quick values */}
      <div className="grid grid-cols-4 gap-1">
        {spacingValues.slice(0, 8).map((spacing) => (
          <Button
            key={spacing}
            variant={value === spacing ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(spacing)}
            className="h-8 text-xs"
          >
            {spacing}
          </Button>
        ))}
      </div>
      
      {/* Custom value input */}
      <div className="flex gap-2">
        <Input
          placeholder="Custom (e.g., 1.5rem)"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      
      {/* Individual sides */}
      {showIndividualSides && onIndividualChange && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Individual Sides</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'top', label: 'Top' },
              { key: 'right', label: 'Right' },
              { key: 'bottom', label: 'Bottom' },
              { key: 'left', label: 'Left' }
            ].map(({ key, label: sideLabel }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{sideLabel}</Label>
                <Input
                  placeholder="auto"
                  value={individualValues[key as keyof typeof individualValues] || ''}
                  onChange={(e) => onIndividualChange(key, e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};