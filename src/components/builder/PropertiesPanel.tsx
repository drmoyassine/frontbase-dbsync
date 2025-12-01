import React, { useState, useEffect } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Trash2, Database } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { DataBindingModal } from '@/components/builder/data-binding/DataBindingModal';
import { DataTablePropertiesPanel } from '@/components/builder/data-table/DataTablePropertiesPanel';

export const PropertiesPanel = () => {
  const {
    currentPageId,
    selectedComponentId,
    pages,
    updatePage,
    setSelectedComponentId,
    editingComponentId,
    setEditingComponentId
  } = useBuilderStore();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDataBinding, setShowDataBinding] = useState(false);
  const [lastSelectedComponent, setLastSelectedComponent] = useState<string | null>(null);
  const { getComponentBinding, setComponentBinding, initialize } = useDataBindingStore();

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

  // Remove duplicate initialize call - it's already called in App.tsx

  // Auto-open data binding modal for new data components
  useEffect(() => {
    if (selectedComponent && selectedComponentId && selectedComponentId !== lastSelectedComponent) {
      setLastSelectedComponent(selectedComponentId);

      // Check if this is a new data component without binding
      const isDataComponent = ['DataTable', 'KPICard', 'Chart', 'Grid'].includes(selectedComponent.type);
      const hasBinding = getComponentBinding(selectedComponentId);

      // Check if component was just dropped by looking at props timestamp
      const isNewComponent = selectedComponent.props?.createdAt &&
        (Date.now() - new Date(selectedComponent.props.createdAt).getTime()) < 5000; // 5 seconds

      if (isDataComponent && !hasBinding && isNewComponent) {
        // Small delay to ensure component is properly selected
        setTimeout(() => {
          setShowDataBinding(true);
        }, 100);
      }
    }
  }, [selectedComponent, selectedComponentId, lastSelectedComponent, getComponentBinding]);

  if (!selectedComponent) {
    return (
      <div className="p-4">
        <div className="border-b border-border pb-4 mb-4">
          <h2 className="font-semibold text-foreground">Properties</h2>
        </div>
        <p className="text-muted-foreground text-center py-8">
          Select a component to edit its properties
        </p>
      </div>
    );
  }

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

  const updateComponentProp = (key: string, value: any) => {
    if (!currentPage) return;

    const updatedContent = updateComponentInContent(
      currentPage.layoutData.content,
      selectedComponentId!,
      {
        props: {
          ...selectedComponent.props,
          [key]: value
        }
      }
    );

    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });

    // If we're editing this component inline, exit edit mode to show updated text
    if (editingComponentId === selectedComponentId) {
      setEditingComponentId(null);
    }
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

    const updatedContent = removeComponentFromContent(currentPage.layoutData.content, selectedComponentId!);

    updatePage(currentPage.id, {
      layoutData: {
        ...currentPage.layoutData,
        content: updatedContent
      }
    });

    setSelectedComponentId(null);
    setShowDeleteDialog(false);
  };

  const handleDataBindingSave = (binding: any) => {
    if (selectedComponentId) {
      setComponentBinding(selectedComponentId, binding);

      // Update component props with binding
      updateComponentProp('binding', binding);
      updateComponentProp('onConfigureBinding', () => setShowDataBinding(true));
    }
    setShowDataBinding(false);
  };

  const isDataComponent = selectedComponent?.type &&
    ['DataTable', 'KPICard', 'Chart', 'Grid'].includes(selectedComponent.type);

  const renderPropertyFields = () => {
    const { type, props } = selectedComponent;

    const renderDataBindingButton = () => (
      <div className="space-y-2 mt-4 border-t pt-4">
        <Label>Data Binding</Label>
        <Button
          variant="outline"
          onClick={() => setShowDataBinding(true)}
          className="w-full justify-start"
        >
          <Database className="mr-2 h-4 w-4" />
          {props.binding ? 'Edit Data Binding' : 'Configure Data Binding'}
        </Button>
      </div>
    );

    switch (type) {
      case 'Button':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="button-text">Text</Label>
              <Input
                id="button-text"
                value={props.text || ''}
                onChange={(e) => updateComponentProp('text', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="button-variant">Variant</Label>
              <Select value={props.variant || 'default'} onValueChange={(value) => updateComponentProp('variant', value)}>
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label htmlFor="button-size">Size</Label>
              <Select value={props.size || 'default'} onValueChange={(value) => updateComponentProp('size', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                  <SelectItem value="icon">Icon</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );

      case 'Text':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="text-content">Content</Label>
              <Textarea
                id="text-content"
                value={props.text || ''}
                onChange={(e) => updateComponentProp('text', e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="text-size">Size</Label>
              <Select value={props.size || 'base'} onValueChange={(value) => updateComponentProp('size', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="base">Base</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Heading':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="heading-text">Text</Label>
              <Input
                id="heading-text"
                value={props.text || ''}
                onChange={(e) => updateComponentProp('text', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heading-level">Level</Label>
              <Select value={props.level || '2'} onValueChange={(value) => updateComponentProp('level', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">H1</SelectItem>
                  <SelectItem value="2">H2</SelectItem>
                  <SelectItem value="3">H3</SelectItem>
                  <SelectItem value="4">H4</SelectItem>
                  <SelectItem value="5">H5</SelectItem>
                  <SelectItem value="6">H6</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Card':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="card-title">Title</Label>
              <Input
                id="card-title"
                value={props.title || ''}
                onChange={(e) => updateComponentProp('title', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-description">Description</Label>
              <Input
                id="card-description"
                value={props.description || ''}
                onChange={(e) => updateComponentProp('description', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-content">Content</Label>
              <Textarea
                id="card-content"
                value={props.content || ''}
                onChange={(e) => updateComponentProp('content', e.target.value)}
                rows={3}
              />
            </div>
          </>
        );

      case 'Input':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="input-placeholder">Placeholder</Label>
              <Input
                id="input-placeholder"
                value={props.placeholder || ''}
                onChange={(e) => updateComponentProp('placeholder', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="input-type">Type</Label>
              <Select value={props.type || 'text'} onValueChange={(value) => updateComponentProp('type', value)}>
                <SelectTrigger>
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
            {renderDataBindingButton()}
          </>
        );

      case 'Textarea':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="textarea-placeholder">Placeholder</Label>
              <Input
                id="textarea-placeholder"
                value={props.placeholder || ''}
                onChange={(e) => updateComponentProp('placeholder', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="textarea-rows">Rows</Label>
              <Input
                id="textarea-rows"
                type="number"
                value={props.rows || 3}
                onChange={(e) => updateComponentProp('rows', parseInt(e.target.value))}
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Select':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="select-placeholder">Placeholder</Label>
              <Input
                id="select-placeholder"
                value={props.placeholder || ''}
                onChange={(e) => updateComponentProp('placeholder', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="select-options">Options (one per line)</Label>
              <Textarea
                id="select-options"
                value={(props.options || []).join('\\n')}
                onChange={(e) => updateComponentProp('options', e.target.value.split('\\n').filter(Boolean))}
                rows={4}
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Checkbox':
      case 'Switch':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="label-text">Label</Label>
              <Input
                id="label-text"
                value={props.label || ''}
                onChange={(e) => updateComponentProp('label', e.target.value)}
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Alert':
        return (
          <div className="space-y-2">
            <Label htmlFor="alert-message">Message</Label>
            <Textarea
              id="alert-message"
              value={props.message || ''}
              onChange={(e) => updateComponentProp('message', e.target.value)}
              rows={3}
            />
          </div>
        );

      case 'Badge':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="badge-text">Text</Label>
              <Input
                id="badge-text"
                value={props.text || ''}
                onChange={(e) => updateComponentProp('text', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge-variant">Variant</Label>
              <Select value={props.variant || 'default'} onValueChange={(value) => updateComponentProp('variant', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                  <SelectItem value="destructive">Destructive</SelectItem>
                  <SelectItem value="outline">Outline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Avatar':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="avatar-src">Image URL</Label>
              <Input
                id="avatar-src"
                value={props.src || ''}
                onChange={(e) => updateComponentProp('src', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar-fallback">Fallback Text</Label>
              <Input
                id="avatar-fallback"
                value={props.fallback || ''}
                onChange={(e) => updateComponentProp('fallback', e.target.value)}
                maxLength={2}
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Progress':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="progress-value">Value (0-100)</Label>
              <Input
                id="progress-value"
                type="number"
                min="0"
                max="100"
                value={props.value || 50}
                onChange={(e) => updateComponentProp('value', parseInt(e.target.value))}
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Image':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="image-src">Image URL</Label>
              <Input
                id="image-src"
                value={props.src || ''}
                onChange={(e) => updateComponentProp('src', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-alt">Alt Text</Label>
              <Input
                id="image-alt"
                value={props.alt || ''}
                onChange={(e) => updateComponentProp('alt', e.target.value)}
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Link':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="link-text">Text</Label>
              <Input
                id="link-text"
                value={props.text || ''}
                onChange={(e) => updateComponentProp('text', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-href">URL</Label>
              <Input
                id="link-href"
                value={props.href || ''}
                onChange={(e) => updateComponentProp('href', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-target">Target</Label>
              <Select value={props.target || '_self'} onValueChange={(value) => updateComponentProp('target', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_self">Same Tab</SelectItem>
                  <SelectItem value="_blank">New Tab</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setShowDataBinding(true)}
                className="w-full justify-start"
              >
                <Database className="mr-2 h-4 w-4" />
                {props.binding ? 'Edit Data Binding' : 'Configure Data Binding'}
              </Button>
            </div>
          </div >
        );

      case 'Chart':
return (
  <div className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="chart-type">Chart Type</Label>
      <Select value={props.chartType || 'bar'} onValueChange={(value) => updateComponentProp('chartType', value)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bar">Bar Chart</SelectItem>
          <SelectItem value="line">Line Chart</SelectItem>
          <SelectItem value="pie">Pie Chart</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label>Data Binding</Label>
      <Button
        variant="outline"
        onClick={() => setShowDataBinding(true)}
        className="w-full justify-start"
      >
        <Database className="mr-2 h-4 w-4" />
        {props.binding ? 'Edit Data Binding' : 'Configure Data Binding'}
      </Button>
    </div>
  </div>
);

      case 'Grid':
return (
  <div className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="grid-columns">Columns</Label>
      <Select value={(props.columns || 3).toString()} onValueChange={(value) => updateComponentProp('columns', parseInt(value))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">1 Column</SelectItem>
          <SelectItem value="2">2 Columns</SelectItem>
          <SelectItem value="3">3 Columns</SelectItem>
          <SelectItem value="4">4 Columns</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <Label>Data Binding</Label>
      <Button
        variant="outline"
        onClick={() => setShowDataBinding(true)}
        className="w-full justify-start"
      >
        <Database className="mr-2 h-4 w-4" />
        {props.binding ? 'Edit Data Binding' : 'Configure Data Binding'}
      </Button>
    </div>
  </div>
);

      case 'DataTable':
const dataTableBinding = getComponentBinding(selectedComponentId!);
return (
  <DataTablePropertiesPanel
    componentId={selectedComponentId!}
    binding={dataTableBinding}
    onBindingUpdate={(binding) => {
      setComponentBinding(selectedComponentId!, binding);
      updateComponentProp('binding', binding);
    }}
  />
);

      default:
return (
  <p className="text-muted-foreground text-sm">
    No properties available for {type} component.
  </p>
);
    }
  };

const DeleteConfirmationDialog = ({ open, onOpenChange, onConfirm }: any) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete the selected component.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

return (
  <div className="p-4 h-full flex flex-col">
    <div className="border-b border-border pb-4 mb-4 flex justify-between items-center">
      <h2 className="font-semibold text-foreground">Properties</h2>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowDeleteDialog(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>

    <div className="flex-1 overflow-y-auto">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Component Type</Label>
          <div className="px-3 py-2 bg-muted rounded-md text-sm">
            {selectedComponent.type}
          </div>
        </div>

        {renderPropertyFields()}
      </div>
    </div>

    <DeleteConfirmationDialog
      open={showDeleteDialog}
      onOpenChange={setShowDeleteDialog}
      onConfirm={deleteComponent}
    />

    <DataBindingModal
      open={showDataBinding}
      onOpenChange={setShowDataBinding}
      componentId={selectedComponentId || ''}
      componentType={selectedComponent?.type || ''}
      onSave={handleDataBindingSave}
    />
  </div>
);
};