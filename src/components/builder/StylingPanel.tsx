import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Copy, Wand2, Palette, Code } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { ColorPicker } from './style-controls/ColorPicker';
import { SpacingControl } from './style-controls/SpacingControl';
import { FontControl } from './style-controls/FontControl';
import { ComponentStyles, StyleMode } from '@/types/styles';
import { generateStyles, getStylePresets } from '@/lib/styleUtils';
import { cn } from '@/lib/utils';

export const StylingPanel: React.FC = () => {
  const { 
    selectedComponentId, 
    currentPageId, 
    pages, 
    updatePage, 
    setSelectedComponentId 
  } = useBuilderStore();
  
  const [styleMode, setStyleMode] = useState<StyleMode>('visual');
  const [cssText, setCssText] = useState('');
  
  const currentPage = pages.find(page => page.id === currentPageId);
  
  // Recursive function to find component by ID
  const findComponentById = (components: any[], id: string): any => {
    for (const comp of components) {
      if (comp.id === id) return comp;
      if (comp.children) {
        const found = findComponentById(comp.children, id);
        if (found) return found;
      }
    }
    return null;
  };
  
  const selectedComponent = currentPage?.layout_data ? 
    findComponentById(currentPage.layout_data, selectedComponentId || '') : null;
  
  useEffect(() => {
    if (selectedComponent?.styles) {
      // Convert component styles to CSS text for the CSS tab
      const cssString = Object.entries(selectedComponent.styles)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([property, value]) => {
          // Convert camelCase to kebab-case
          const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
          return `  ${cssProperty}: ${value};`;
        })
        .join('\n');
      
      setCssText(cssString ? `{\n${cssString}\n}` : '');
    } else {
      setCssText('');
    }
  }, [selectedComponent?.styles]);
  
  if (!selectedComponent) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-muted-foreground text-sm">No component selected</div>
          <div className="text-xs text-muted-foreground mt-1">
            Select a component to edit its styles
          </div>
        </div>
      </div>
    );
  }
  
  const styles: ComponentStyles = selectedComponent.styles || {};
  
  // Recursive function to update component in nested structure
  const updateComponentInContent = (components: any[], componentId: string, updates: any): any[] => {
    return components.map(comp => {
      if (comp.id === componentId) {
        return { ...comp, ...updates };
      }
      if (comp.children) {
        return {
          ...comp,
          children: updateComponentInContent(comp.children, componentId, updates)
        };
      }
      return comp;
    });
  };
  
  const updateComponentStyle = (property: string, value: string) => {
    if (!currentPage) return;
    
    // Handle default values - convert them to undefined to remove the style
    const defaultValues = ['default', 'auto', 'none'];
    const processedValue = defaultValues.includes(value) ? undefined : value;
    
    const updatedContent = updateComponentInContent(
      currentPage.layout_data,
      selectedComponentId!,
      {
        styles: {
          ...selectedComponent.styles,
          [property]: processedValue
        }
      }
    );
    
    updatePage(currentPage.id, {
      layout_data: updatedContent
    });
  };
  
  const deleteComponent = () => {
    if (!currentPage) return;
    
    // Recursive function to remove component from nested structure
    const removeComponentFromContent = (components: any[], componentId: string): any[] => {
      return components.filter(comp => {
        if (comp.id === componentId) return false;
        if (comp.children) {
          comp.children = removeComponentFromContent(comp.children, componentId);
        }
        return true;
      });
    };
    
    const updatedContent = removeComponentFromContent(currentPage.layout_data, selectedComponentId!);
    
    updatePage(currentPage.id, {
      layout_data: updatedContent
    });
    
    setSelectedComponentId(null);
  };
  
  const applyPreset = (presetStyles: ComponentStyles) => {
    if (!currentPage) return;
    
    const updatedContent = updateComponentInContent(
      currentPage.layout_data,
      selectedComponentId!,
      {
        styles: {
          ...selectedComponent.styles,
          ...presetStyles
        }
      }
    );
    
    updatePage(currentPage.id, {
      layout_data: updatedContent
    });
  };
  
  const applyCssStyles = () => {
    if (!currentPage || !cssText) return;
    
    try {
      // Parse CSS text and convert to component styles object
      const cssRules = cssText
        .replace(/[{}]/g, '')
        .split(';')
        .filter(rule => rule.trim())
        .map(rule => rule.split(':').map(part => part.trim()));
      
      const parsedStyles: ComponentStyles = {};
      
      cssRules.forEach(([property, value]) => {
        if (property && value) {
          // Convert kebab-case to camelCase
          const camelProperty = property.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
          parsedStyles[camelProperty as keyof ComponentStyles] = value;
        }
      });
      
      const updatedContent = updateComponentInContent(
        currentPage.layout_data,
        selectedComponentId!,
        {
          styles: {
            ...selectedComponent.styles,
            ...parsedStyles
          }
        }
      );
      
      updatePage(currentPage.id, {
        layout_data: updatedContent
      });
    } catch (error) {
      console.error('Failed to parse CSS:', error);
    }
  };
  
  const presets = getStylePresets().filter(preset => 
    !preset.applicableTypes || preset.applicableTypes.includes(selectedComponent.type)
  );
  
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">{selectedComponent.type}</h3>
            <p className="text-xs text-muted-foreground">Component Styling</p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {/* TODO: Copy styles */}}
              className="h-8 w-8 p-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteComponent}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Tabs value={styleMode} onValueChange={(v) => setStyleMode(v as StyleMode)} className="h-full">
          <TabsList className="w-full m-4 mb-0">
            <TabsTrigger value="visual" className="flex-1 flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Visual
            </TabsTrigger>
            <TabsTrigger value="css" className="flex-1 flex items-center gap-2">
              <Code className="h-4 w-4" />
              Advanced
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="visual" className="space-y-4 p-4 pt-2">
            {/* Style Presets */}
            {presets.length > 0 && (
              <Card className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 className="h-4 w-4" />
                  <Label className="text-sm font-medium">Quick Styles</Label>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {presets.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset.styles)}
                      className="justify-start h-auto p-2"
                    >
                      <div className="text-left">
                        <div className="text-xs font-medium">{preset.name}</div>
                        {preset.description && (
                          <div className="text-xs text-muted-foreground">{preset.description}</div>
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              </Card>
            )}
            
            {/* Typography */}
            <Card className="p-3">
              <Label className="text-sm font-medium mb-3 block">Typography</Label>
              <div className="space-y-3">
                <FontControl
                  fontSize={styles.fontSize}
                  fontWeight={styles.fontWeight}
                  fontFamily={styles.fontFamily}
                  textAlign={styles.textAlign}
                  onFontSizeChange={(value) => updateComponentStyle('fontSize', value)}
                  onFontWeightChange={(value) => updateComponentStyle('fontWeight', value)}
                  onFontFamilyChange={(value) => updateComponentStyle('fontFamily', value)}
                  onTextAlignChange={(value) => updateComponentStyle('textAlign', value)}
                />
                <ColorPicker
                  label="Text Color"
                  value={styles.textColor}
                  onChange={(value) => updateComponentStyle('textColor', value)}
                  property="textColor"
                />
              </div>
            </Card>
            
            {/* Layout Controls */}
            <Card className="p-3">
              <Label className="text-sm font-medium mb-3 block">Layout Controls</Label>
              <div className="space-y-3">
                 <div>
                   <Label className="text-sm">Display</Label>
                   <Select 
                     value={styles.display || 'auto'} 
                     onValueChange={(value) => updateComponentStyle('display', value)}
                   >
                     <SelectTrigger className="h-8">
                       <SelectValue placeholder="Display" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="auto">Default</SelectItem>
                       <SelectItem value="block">Block</SelectItem>
                       <SelectItem value="flex">Flex</SelectItem>
                       <SelectItem value="grid">Grid</SelectItem>
                       <SelectItem value="none">None</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>

                {styles.display === 'flex' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                       <div>
                         <Label className="text-sm">Direction</Label>
                         <Select 
                           value={styles.flexDirection || 'default'} 
                           onValueChange={(value) => updateComponentStyle('flexDirection', value)}
                         >
                           <SelectTrigger className="h-8">
                             <SelectValue placeholder="Direction" />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="default">Default</SelectItem>
                             <SelectItem value="row">Row</SelectItem>
                             <SelectItem value="column">Column</SelectItem>
                             <SelectItem value="row-reverse">Row Reverse</SelectItem>
                             <SelectItem value="column-reverse">Column Reverse</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                      
                       <div>
                         <Label className="text-sm">Gap</Label>
                         <Select 
                           value={styles.gap || 'none'} 
                           onValueChange={(value) => updateComponentStyle('gap', value)}
                         >
                           <SelectTrigger className="h-8">
                             <SelectValue placeholder="Gap" />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="none">None</SelectItem>
                             <SelectItem value="1">1</SelectItem>
                             <SelectItem value="2">2</SelectItem>
                             <SelectItem value="3">3</SelectItem>
                             <SelectItem value="4">4</SelectItem>
                             <SelectItem value="6">6</SelectItem>
                             <SelectItem value="8">8</SelectItem>
                           </SelectContent>
                         </Select>
                       </div>
                    </div>

                     <div>
                       <Label className="text-sm">Justify Content (Horizontal)</Label>
                       <Select 
                         value={styles.justifyContent || 'default'} 
                         onValueChange={(value) => updateComponentStyle('justifyContent', value)}
                       >
                         <SelectTrigger className="h-8">
                           <SelectValue placeholder="Justify" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="default">Default</SelectItem>
                           <SelectItem value="flex-start">Start</SelectItem>
                           <SelectItem value="center">Center</SelectItem>
                           <SelectItem value="flex-end">End</SelectItem>
                           <SelectItem value="space-between">Space Between</SelectItem>
                           <SelectItem value="space-around">Space Around</SelectItem>
                           <SelectItem value="space-evenly">Space Evenly</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>

                     <div>
                       <Label className="text-sm">Align Items (Vertical)</Label>
                       <Select 
                         value={styles.alignItems || 'default'} 
                         onValueChange={(value) => updateComponentStyle('alignItems', value)}
                       >
                         <SelectTrigger className="h-8">
                           <SelectValue placeholder="Align" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="default">Default</SelectItem>
                           <SelectItem value="flex-start">Start</SelectItem>
                           <SelectItem value="center">Center</SelectItem>
                           <SelectItem value="flex-end">End</SelectItem>
                           <SelectItem value="stretch">Stretch</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                  </>
                )}
              </div>
            </Card>

            {/* Layout & Spacing */}
            <Card className="p-3">
              <Label className="text-sm font-medium mb-3 block">Size & Spacing</Label>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Width</Label>
                    <Input
                      placeholder="auto"
                      value={styles.width || ''}
                      onChange={(e) => updateComponentStyle('width', e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Height</Label>
                    <Input
                      placeholder="auto"
                      value={styles.height || ''}
                      onChange={(e) => updateComponentStyle('height', e.target.value)}
                      className="h-8"
                    />
                  </div>
                </div>
                
                <SpacingControl
                  label="Padding"
                  value={styles.padding}
                  onChange={(value) => updateComponentStyle('padding', value)}
                  property="padding"
                  individualValues={{
                    top: styles.paddingTop,
                    right: styles.paddingRight,
                    bottom: styles.paddingBottom,
                    left: styles.paddingLeft
                  }}
                  onIndividualChange={(side, value) => 
                    updateComponentStyle(`padding${side.charAt(0).toUpperCase() + side.slice(1)}`, value)
                  }
                />
                
                <SpacingControl
                  label="Margin"
                  value={styles.margin}
                  onChange={(value) => updateComponentStyle('margin', value)}
                  property="margin"
                  individualValues={{
                    top: styles.marginTop,
                    right: styles.marginRight,
                    bottom: styles.marginBottom,
                    left: styles.marginLeft
                  }}
                  onIndividualChange={(side, value) => 
                    updateComponentStyle(`margin${side.charAt(0).toUpperCase() + side.slice(1)}`, value)
                  }
                />
              </div>
            </Card>
            
            {/* Background & Border */}
            <Card className="p-3">
              <Label className="text-sm font-medium mb-3 block">Background & Border</Label>
              <div className="space-y-3">
                <ColorPicker
                  label="Background Color"
                  value={styles.backgroundColor}
                  onChange={(value) => updateComponentStyle('backgroundColor', value)}
                  property="backgroundColor"
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Border Width</Label>
                    <Select 
                      value={styles.borderWidth || ''} 
                      onValueChange={(value) => updateComponentStyle('borderWidth', value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Width" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">None</SelectItem>
                        <SelectItem value="1">1px</SelectItem>
                        <SelectItem value="2">2px</SelectItem>
                        <SelectItem value="4">4px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm">Border Radius</Label>
                    <Select 
                      value={styles.borderRadius || ''} 
                      onValueChange={(value) => updateComponentStyle('borderRadius', value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Radius" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">None</SelectItem>
                        <SelectItem value="4">4px</SelectItem>
                        <SelectItem value="8">8px</SelectItem>
                        <SelectItem value="12">12px</SelectItem>
                        <SelectItem value="16">16px</SelectItem>
                        <SelectItem value="50%">50%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <ColorPicker
                  label="Border Color"
                  value={styles.borderColor}
                  onChange={(value) => updateComponentStyle('borderColor', value)}
                  property="borderColor"
                />
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="css" className="space-y-4 p-4 pt-2">
            <Card className="p-3">
              <Label className="text-sm font-medium mb-3 block">Custom CSS</Label>
              <div className="space-y-3">
                <Textarea
                  placeholder="Enter CSS styles here..."
                  value={cssText}
                  onChange={(e) => setCssText(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
                <Button 
                  onClick={applyCssStyles}
                  className="w-full"
                  disabled={!cssText.trim()}
                >
                  Apply CSS Styles
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};