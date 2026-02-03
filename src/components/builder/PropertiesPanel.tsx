import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
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
import { VariableInput } from './VariableInput';

// Basic Components
import {
  HeadingProperties,
  TextProperties,
  ButtonProperties,
  IconProperties,
  LinkProperties,
  ImageProperties,
  InputProperties,
  TextareaProperties,
  SelectProperties,
  ToggleProperties,
  BadgeProperties,
  AvatarProperties,
  ProgressProperties,
  AlertProperties,
  ChartProperties,
  GridProperties,
} from './properties/basic';

// Landing Components
import { NavbarProperties, FooterProperties } from './properties/landing';

// Section Components
import { LogoCloudProperties } from './properties/LogoCloudProperties';
import { FeatureSectionProperties } from './properties/FeatureSectionProperties';
import { DisplayProperties } from './properties/DisplayProperties';

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
    removeComponent,
    project
  } = useBuilderStore();

  const { setComponentBinding, initialize } = useDataBindingStore();

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

  const updateComponentStyle = (key: string, value: any) => {
    const currentStyles = selectedComponent.styles || {};
    updateComponent(selectedComponentId, {
      styles: { ...currentStyles, [key]: value }
    });
  };

  const deleteComponent = () => {
    removeComponent(selectedComponentId);
    setShowDeleteDialog(false);
  };

  const handleDataBindingSave = (binding: any) => {
    setComponentBinding(selectedComponentId, binding);
    updateComponentProp('binding', binding);
  };

  const onDataBindingClick = () => setShowDataBinding(true);

  const renderPropertyFields = () => {
    const { type, props, styles = {} } = selectedComponent;

    switch (type) {
      // === CONTAINER ===
      case 'Container':
        return (
          <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-md">
            Use the Styling Panel (palette icon) to customize layout, spacing, and background.
          </div>
        );

      // === LANDING SECTIONS ===
      case 'LogoCloud':
        return <LogoCloudProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} />;

      case 'FeatureSection':
        return <FeatureSectionProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} />;

      case 'Navbar':
        return <NavbarProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} project={project} />;

      case 'Footer':
        return <FooterProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} project={project} />;

      // === TYPOGRAPHY ===
      case 'Heading':
        return <HeadingProperties props={props} updateComponentProp={updateComponentProp} />;

      case 'Text':
        return <TextProperties props={props} updateComponentProp={updateComponentProp} />;

      // === ACTIONS ===
      case 'Button':
        return <ButtonProperties componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} onDataBindingClick={onDataBindingClick} hasBinding={!!props.binding} />;

      case 'Link':
        return <LinkProperties props={props} updateComponentProp={updateComponentProp} onDataBindingClick={onDataBindingClick} />;

      // === MEDIA ===
      case 'Icon':
        return <IconProperties props={props} styles={styles} updateComponentProp={updateComponentProp} updateComponentStyle={updateComponentStyle} />;

      case 'Image':
        return <ImageProperties props={props} updateComponentProp={updateComponentProp} />;

      case 'Avatar':
        return <AvatarProperties props={props} updateComponentProp={updateComponentProp} />;

      // === FORM INPUTS ===
      case 'Input':
        return <InputProperties props={props} updateComponentProp={updateComponentProp} />;

      case 'Textarea':
        return <TextareaProperties props={props} updateComponentProp={updateComponentProp} />;

      case 'Select':
        return <SelectProperties props={props} updateComponentProp={updateComponentProp} />;

      case 'Checkbox':
      case 'Switch':
        return <ToggleProperties props={props} updateComponentProp={updateComponentProp} />;

      // === DISPLAY ===
      case 'Badge':
        return <BadgeProperties props={props} updateComponentProp={updateComponentProp} />;

      case 'Alert':
        return <AlertProperties props={props} updateComponentProp={updateComponentProp} />;

      case 'Progress':
        return <ProgressProperties props={props} updateComponentProp={updateComponentProp} />;

      // === DATA ===
      case 'Chart':
        return <ChartProperties props={props} updateComponentProp={updateComponentProp} onDataBindingClick={onDataBindingClick} />;

      case 'Grid':
        return <GridProperties props={props} updateComponentProp={updateComponentProp} onDataBindingClick={onDataBindingClick} />;

      case 'DataTable':
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
        return <FormPropertiesPanel componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} type="Form" />;

      case 'InfoList':
        return <FormPropertiesPanel componentId={selectedComponentId} props={props} updateComponentProp={updateComponentProp} type="InfoList" />;

      // === DISPLAY PROPERTIES (fallback for some types) ===
      case 'Card':
      case 'Embed':
        return <DisplayProperties type={type} props={props} updateComponentProp={updateComponentProp} onDataBindingClick={onDataBindingClick} hasBinding={!!props.binding} />;

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
            <Label htmlFor="component-title" className="text-sm font-medium">Component Title <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
            <VariableInput
              value={selectedComponent.props.title || ''}
              onChange={(value) => updateComponentProp('title', value)}
              placeholder="Enter component title"
            />
          </div>

          {/* Section Anchor for landing components */}
          {['Hero', 'Features', 'FeatureSection', 'Pricing', 'FAQ', 'CTA', 'LogoCloud'].includes(selectedComponent.type) && (
            <div className="space-y-2">
              <Label htmlFor="section-anchor" className="text-sm font-medium">
                Section Anchor <span className="text-muted-foreground text-xs">(URL slug)</span>
              </Label>
              <input
                id="section-anchor"
                type="text"
                value={selectedComponent.props.anchor || ''}
                onChange={(e) => updateComponentProp('anchor', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g., pricing, features, faq"
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Creates URL like #pricing when scrolling to this section
              </p>
            </div>
          )}

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
