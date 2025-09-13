import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Copy, Wand2 } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { ColorPicker } from './style-controls/ColorPicker';
import { SpacingControl } from './style-controls/SpacingControl';
import { FontControl } from './style-controls/FontControl';
import { ComponentStyles, StyleMode } from '@/types/styles';
import { generateStyles, getStylePresets } from '@/lib/styleUtils';
import { cn } from '@/lib/utils';

export const AdvancedPropertiesPanel: React.FC = () => {
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
  const selectedComponent = currentPage?.layoutData?.content?.find(
    (comp: any) => comp.id === selectedComponentId
  );
  
  if (!selectedComponent) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-muted-foreground text-sm">No component selected</div>
          <div className="text-xs text-muted-foreground mt-1">
            Select a component to edit its properties
          </div>
        </div>
      </div>
    );
  }
  
  const styles: ComponentStyles = selectedComponent.styles || {};
  
  const updateComponentStyle = (property: string, value: string) => {
    if (!currentPage) return;
    
    const updatedContent = currentPage.layoutData.content.map((comp: any) =>
      comp.id === selectedComponentId
        ? {
            ...comp,
            styles: {
              ...comp.styles,
              [property]: value || undefined
            }
          }
        : comp
    );
    
    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });
  };
  
  const updateComponentProp = (key: string, value: any) => {
    if (!currentPage) return;
    
    const updatedContent = currentPage.layoutData.content.map((comp: any) =>
      comp.id === selectedComponentId
        ? {
            ...comp,
            props: {
              ...comp.props,
              [key]: value
            }
          }
        : comp
    );
    
    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });
  };
  
  const deleteComponent = () => {
    if (!currentPage) return;
    
    const updatedContent = currentPage.layoutData.content.filter(
      (comp: any) => comp.id !== selectedComponentId
    );
    
    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });
    
    setSelectedComponentId(null);
  };
  
  const applyPreset = (presetStyles: ComponentStyles) => {
    if (!currentPage) return;
    
    const updatedContent = currentPage.layoutData.content.map((comp: any) =>
      comp.id === selectedComponentId
        ? {
            ...comp,
            styles: {
              ...comp.styles,
              ...presetStyles
            }
          }
        : comp
    );
    
    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });
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
            <p className="text-xs text-muted-foreground">Component Properties</p>
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
            <TabsTrigger value="visual" className="flex-1">Visual</TabsTrigger>
            <TabsTrigger value="css" className="flex-1">CSS</TabsTrigger>
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
                    value={styles.display || ''} 
                    onValueChange={(value) => updateComponentStyle('display', value)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Display" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Default</SelectItem>
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
                          value={styles.flexDirection || ''} 
                          onValueChange={(value) => updateComponentStyle('flexDirection', value)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Direction" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Default</SelectItem>
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
                          value={styles.gap || ''} 
                          onValueChange={(value) => updateComponentStyle('gap', value)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Gap" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
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
                        value={styles.justifyContent || ''} 
                        onValueChange={(value) => updateComponentStyle('justifyContent', value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Justify" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Default</SelectItem>
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
                        value={styles.alignItems || ''} 
                        onValueChange={(value) => updateComponentStyle('alignItems', value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Align" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Default</SelectItem>
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
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="sm">Small</SelectItem>
                        <SelectItem value="md">Medium</SelectItem>
                        <SelectItem value="lg">Large</SelectItem>
                        <SelectItem value="full">Full</SelectItem>
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
            
            {/* Component-specific properties */}
            <Card className="p-3">
              <Label className="text-sm font-medium mb-3 block">Component Properties</Label>
              <div className="space-y-3">
                {/* Render basic component properties based on type */}
                {selectedComponent.type === 'Button' && (
                  <>
                    <div>
                      <Label className="text-sm">Button Text</Label>
                      <Input
                        value={selectedComponent.props.text || ''}
                        onChange={(e) => updateComponentProp('text', e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Variant</Label>
                      <Select 
                        value={selectedComponent.props.variant || 'default'} 
                        onValueChange={(value) => updateComponentProp('variant', value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="destructive">Destructive</SelectItem>
                          <SelectItem value="outline">Outline</SelectItem>
                          <SelectItem value="secondary">Secondary</SelectItem>
                          <SelectItem value="ghost">Ghost</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                
                {(selectedComponent.type === 'Text' || selectedComponent.type === 'Heading') && (
                  <div>
                    <Label className="text-sm">Text Content</Label>
                    <Textarea
                      value={selectedComponent.props.text || ''}
                      onChange={(e) => updateComponentProp('text', e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>
                )}
                
                {selectedComponent.type === 'Input' && (
                  <>
                    <div>
                      <Label className="text-sm">Placeholder</Label>
                      <Input
                        value={selectedComponent.props.placeholder || ''}
                        onChange={(e) => updateComponentProp('placeholder', e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Type</Label>
                      <Select 
                        value={selectedComponent.props.type || 'text'} 
                        onValueChange={(value) => updateComponentProp('type', value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="password">Password</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="css" className="p-4 pt-2">
            <Card className="p-3">
              <Label className="text-sm font-medium mb-3 block">Custom CSS</Label>
              <Textarea
                placeholder="Enter custom CSS properties..."
                value={cssText}
                onChange={(e) => setCssText(e.target.value)}
                className="min-h-[200px] font-mono text-xs"
              />
              <Button 
                size="sm" 
                className="mt-2"
                onClick={() => {/* TODO: Parse and apply CSS */}}
              >
                Apply CSS
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};