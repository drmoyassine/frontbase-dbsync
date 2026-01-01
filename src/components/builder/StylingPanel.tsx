import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Wand2 } from 'lucide-react';
import { useBuilderStore } from '@/stores/builder';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ColorPicker } from './style-controls/ColorPicker';
import { ComponentStyles } from '@/types/styles';
import { getStylePresets } from '@/lib/styleUtils';
import { cn } from '@/lib/utils';

export const StylingPanel: React.FC = () => {
  const {
    selectedComponentId,
    currentPageId,
    pages,
    updatePage,
    setSelectedComponentId
  } = useBuilderStore();

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

  const selectedComponent = currentPage?.layoutData?.content ?
    findComponentById(currentPage.layoutData.content, selectedComponentId || '') : null;

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

    const processedValue = ['default', 'auto', 'none', ''].includes(value) ? undefined : value;

    const updatedContent = updateComponentInContent(
      currentPage.layoutData.content,
      selectedComponentId!,
      {
        styles: {
          ...selectedComponent.styles,
          [property]: processedValue
        }
      }
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

    const removeComponentFromContent = (components: any[], componentId: string): any[] => {
      return components.filter(comp => {
        if (comp.id === componentId) return false;
        if (comp.children) {
          comp.children = removeComponentFromContent(comp.children, componentId);
        }
        return true;
      });
    };

    const updatedContent = removeComponentFromContent(currentPage.layoutData.content, selectedComponentId!);

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

    const updatedContent = updateComponentInContent(
      currentPage.layoutData.content,
      selectedComponentId!,
      {
        styles: {
          ...selectedComponent.styles,
          ...presetStyles
        }
      }
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
            <p className="text-xs text-muted-foreground">Component Styling</p>
          </div>
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

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-auto">
        {/* Quick Styles - Always visible at top */}
        {presets.length > 0 && (
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="h-4 w-4" />
              <Label className="text-sm font-medium">Quick Styles</Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset.styles)}
                  className="justify-start h-auto p-2 text-left"
                >
                  <div className="text-xs font-medium">{preset.name}</div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Sections */}
        <Accordion type="multiple" defaultValue={["layout", "colors"]} className="px-4">
          {/* Layout Section */}
          <AccordionItem value="layout">
            <AccordionTrigger className="text-sm font-medium">
              📐 Layout
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Width</Label>
                  <Input
                    placeholder="auto"
                    value={styles.width || ''}
                    onChange={(e) => updateComponentStyle('width', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Height</Label>
                  <Input
                    placeholder="auto"
                    value={styles.height || ''}
                    onChange={(e) => updateComponentStyle('height', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Padding</Label>
                <Input
                  placeholder="0"
                  value={styles.padding || ''}
                  onChange={(e) => updateComponentStyle('padding', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Margin</Label>
                <Input
                  placeholder="0"
                  value={styles.margin || ''}
                  onChange={(e) => updateComponentStyle('margin', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Colors Section */}
          <AccordionItem value="colors">
            <AccordionTrigger className="text-sm font-medium">
              🎨 Colors
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <ColorPicker
                label="Background"
                value={styles.backgroundColor}
                onChange={(value) => updateComponentStyle('backgroundColor', value)}
                property="backgroundColor"
              />
              <ColorPicker
                label="Text Color"
                value={styles.textColor}
                onChange={(value) => updateComponentStyle('textColor', value)}
                property="textColor"
              />
              <ColorPicker
                label="Border Color"
                value={styles.borderColor}
                onChange={(value) => updateComponentStyle('borderColor', value)}
                property="borderColor"
              />
            </AccordionContent>
          </AccordionItem>

          {/* Typography Section */}
          <AccordionItem value="typography">
            <AccordionTrigger className="text-sm font-medium">
              ✏️ Typography
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div>
                <Label className="text-xs">Font Size</Label>
                <Input
                  placeholder="16px"
                  value={styles.fontSize || ''}
                  onChange={(e) => updateComponentStyle('fontSize', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Font Weight</Label>
                <Input
                  placeholder="400"
                  value={styles.fontWeight || ''}
                  onChange={(e) => updateComponentStyle('fontWeight', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Advanced Section */}
          <AccordionItem value="advanced">
            <AccordionTrigger className="text-sm font-medium">
              ⚙️ Advanced (Custom CSS)
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div>
                <Label className="text-xs">Border Radius</Label>
                <Input
                  placeholder="0"
                  value={styles.borderRadius || ''}
                  onChange={(e) => updateComponentStyle('borderRadius', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Border Width</Label>
                <Input
                  placeholder="0"
                  value={styles.borderWidth || ''}
                  onChange={(e) => updateComponentStyle('borderWidth', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};