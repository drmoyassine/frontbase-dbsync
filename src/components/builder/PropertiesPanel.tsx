import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Trash2, Database } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataBindingModal } from './data-binding/DataBindingModal';
import { DataTablePropertiesPanel } from '@/components/builder/data-table/DataTablePropertiesPanel';
import { FormPropertiesPanel } from './form/FormPropertiesPanel';
import { ActionProperties } from '@/components/builder/properties/ActionProperties';

// Helper to find component recursively
const findComponent = (components: any[], id: string): any => {
  for (const component of components) {
    if (component.id === id) return component;
    if (component.children) {
      const found = findComponent(component.children, id);
      if (found) return found;
    }
  }
  return null;
};



export const PropertiesPanel = () => {
  const {
    selectedComponentId,
    pages,
    currentPageId,
    updateComponent,
    removeComponent
  } = useBuilderStore();

  const { getComponentBinding, setComponentBinding, initialize } = useDataBindingStore();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDataBinding, setShowDataBinding] = useState(false);

  // Initialize data binding store when panel opens
  React.useEffect(() => {
    initialize();
  }, [initialize]);

  if (!selectedComponentId || !currentPageId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Select a component to view its properties.
      </div>
    );
  }

  const currentPage = pages.find(p => p.id === currentPageId);
  const selectedComponent = currentPage?.layoutData?.content
    ? findComponent(currentPage.layoutData.content, selectedComponentId)
    : null;

  if (!selectedComponent) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Component not found.
      </div>
    );
  }

  const updateComponentProp = (key: string, value: any) => {
    updateComponent(selectedComponentId, { [key]: value });
  };

  const deleteComponent = () => {
    removeComponent(selectedComponentId);
    setShowDeleteDialog(false);
  };

  const handleDataBindingSave = (binding: any) => {
    setComponentBinding(selectedComponentId, binding);
    updateComponentProp('binding', binding);
  };

  const renderDataBindingButton = () => {
    const binding = getComponentBinding(selectedComponentId);
    return (
      <div className="space-y-2 pt-2 border-t">
        <Label>Data Binding</Label>
        <Button
          variant="outline"
          onClick={() => setShowDataBinding(true)}
          className="w-full justify-start"
        >
          <Database className="mr-2 h-4 w-4" />
          {binding ? 'Edit Data Binding' : 'Configure Data Binding'}
        </Button>
      </div>
    );
  };

  const renderPropertyFields = () => {
    const { type, props } = selectedComponent;

    switch (type) {
      case 'Container':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="container-padding">Padding</Label>
              <Select value={props.padding || 'p-4'} onValueChange={(value) => updateComponentProp('padding', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="p-0">None</SelectItem>
                  <SelectItem value="p-2">Small</SelectItem>
                  <SelectItem value="p-4">Medium</SelectItem>
                  <SelectItem value="p-8">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="container-layout">Layout</Label>
              <Select value={props.layout || 'flex-col'} onValueChange={(value) => updateComponentProp('layout', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flex-col">Vertical</SelectItem>
                  <SelectItem value="flex-row">Horizontal</SelectItem>
                  <SelectItem value="grid">Grid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="container-gap">Gap</Label>
              <Select value={props.gap || 'gap-4'} onValueChange={(value) => updateComponentProp('gap', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gap-0">None</SelectItem>
                  <SelectItem value="gap-2">Small</SelectItem>
                  <SelectItem value="gap-4">Medium</SelectItem>
                  <SelectItem value="gap-8">Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              <Select value={props.level || 'h1'} onValueChange={(value) => updateComponentProp('level', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h1">H1</SelectItem>
                  <SelectItem value="h2">H2</SelectItem>
                  <SelectItem value="h3">H3</SelectItem>
                  <SelectItem value="h4">H4</SelectItem>
                  <SelectItem value="h5">H5</SelectItem>
                  <SelectItem value="h6">H6</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renderDataBindingButton()}
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
                rows={4}
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Button':
        return (
          <ActionProperties
            componentId={selectedComponentId}
            props={props}
            updateComponentProp={updateComponentProp}
            onDataBindingClick={() => setShowDataBinding(true)}
            hasBinding={!!props.binding}
          />
        );

      case 'Input':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="input-label">Label</Label>
              <Input
                id="input-label"
                value={props.label || ''}
                onChange={(e) => updateComponentProp('label', e.target.value)}
              />
            </div>
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
              <Select value={props.inputType || 'text'} onValueChange={(value) => updateComponentProp('inputType', value)}>
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
              <Label htmlFor="textarea-label">Label</Label>
              <Input
                id="textarea-label"
                value={props.label || ''}
                onChange={(e) => updateComponentProp('label', e.target.value)}
              />
            </div>
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
                value={(props.options || []).join('\n')}
                onChange={(e) => updateComponentProp('options', e.target.value.split('\n').filter(Boolean))}
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
          </>
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
        // Fix: Source binding directly from BuilderStore (authoritative) instead of auxiliary store
        // This prevents stale/empty binding from overwriting the correct configuration
        const dataTableBinding = selectedComponent?.props?.binding;
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

      case 'Form':
        return (
          <FormPropertiesPanel
            componentId={selectedComponentId}
            props={props}
            updateComponentProp={updateComponentProp}
            type="Form"
          />
        );

      case 'InfoList':
        return (
          <FormPropertiesPanel
            componentId={selectedComponentId}
            props={props}
            updateComponentProp={updateComponentProp}
            type="InfoList"
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
        <h2 className="font-semibold text-foreground">Properties <span className="text-muted-foreground font-normal">{selectedComponent.type}</span></h2>
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
            <Label htmlFor="component-title" className="text-sm font-medium">Component Title</Label>
            <Input
              id="component-title"
              value={selectedComponent.props.title || ''}
              onChange={(e) => updateComponentProp('title', e.target.value)}
              placeholder="Enter component title"
            />
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