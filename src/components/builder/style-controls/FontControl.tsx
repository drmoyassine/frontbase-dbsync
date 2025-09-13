import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getTailwindSuggestions } from '@/lib/styleUtils';

interface FontControlProps {
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  textAlign?: string;
  onFontSizeChange: (value: string) => void;
  onFontWeightChange: (value: string) => void;
  onFontFamilyChange: (value: string) => void;
  onTextAlignChange: (value: string) => void;
}

export const FontControl: React.FC<FontControlProps> = ({
  fontSize,
  fontWeight,
  fontFamily,
  textAlign,
  onFontSizeChange,
  onFontWeightChange,
  onFontFamilyChange,
  onTextAlignChange
}) => {
  const fontSizes = getTailwindSuggestions('fontSize');
  const fontWeights = getTailwindSuggestions('fontWeight');
  const textAligns = getTailwindSuggestions('textAlign');
  
  const fontFamilies = [
    { value: 'font-sans', label: 'Sans Serif' },
    { value: 'font-serif', label: 'Serif' },
    { value: 'font-mono', label: 'Monospace' }
  ];
  
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm font-medium">Size</Label>
          <Select value={fontSize} onValueChange={onFontSizeChange}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              {fontSizes.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-sm font-medium">Weight</Label>
          <Select value={fontWeight} onValueChange={onFontWeightChange}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Weight" />
            </SelectTrigger>
            <SelectContent>
              {fontWeights.map((weight) => (
                <SelectItem key={weight} value={weight}>
                  {weight}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div>
        <Label className="text-sm font-medium">Family</Label>
        <Select value={fontFamily} onValueChange={onFontFamilyChange}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Font family" />
          </SelectTrigger>
          <SelectContent>
            {fontFamilies.map((family) => (
              <SelectItem key={family.value} value={family.value}>
                {family.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label className="text-sm font-medium">Alignment</Label>
        <Select value={textAlign} onValueChange={onTextAlignChange}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Alignment" />
          </SelectTrigger>
          <SelectContent>
            {textAligns.map((align) => (
              <SelectItem key={align} value={align}>
                {align}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};