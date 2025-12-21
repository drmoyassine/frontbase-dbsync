import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTailwindSuggestions } from '@/lib/styleUtils';

interface ColorPickerProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  property: 'textColor' | 'backgroundColor' | 'borderColor';
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange, property }) => {
  const [customColor, setCustomColor] = useState('');
  const tailwindColors = getTailwindSuggestions(property);
  
  const getColorPreview = (color: string) => {
    switch (color) {
      case 'primary': return 'hsl(var(--primary))';
      case 'secondary': return 'hsl(var(--secondary))';
      case 'muted': return 'hsl(var(--muted))';
      case 'accent': return 'hsl(var(--accent))';
      case 'destructive': return 'hsl(var(--destructive))';
      case 'background': return 'hsl(var(--background))';
      case 'foreground': return 'hsl(var(--foreground))';
      case 'card': return 'hsl(var(--card))';
      case 'popover': return 'hsl(var(--popover))';
      case 'border': return 'hsl(var(--border))';
      default: return color;
    }
  };
  
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            className="w-full justify-start h-9"
          >
            <div 
              className="w-4 h-4 rounded border mr-2"
              style={{ backgroundColor: value ? getColorPreview(value) : 'transparent' }}
            />
            {value || 'Select color'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Design System Colors</Label>
              <div className="grid grid-cols-5 gap-1 mt-1">
                {tailwindColors.map((color) => (
                  <button
                    key={color}
                    className="w-8 h-8 rounded border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: getColorPreview(color) }}
                    onClick={() => onChange(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground">Custom Color</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-12 h-8 p-0 border-0"
                />
                <Input
                  placeholder="#ffffff"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="flex-1 h-8 text-xs"
                />
                <Button 
                  size="sm" 
                  onClick={() => customColor && onChange(customColor)}
                  className="h-8 px-2 text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>
            
            {value && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => onChange('')}
                className="w-full h-8 text-xs"
              >
                Clear
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};