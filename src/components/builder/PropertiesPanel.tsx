import React, { useState } from 'react';
import { useBuilderStore } from '@/stores/builder';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Trash2, Database, AlignLeft, AlignCenter, AlignRight, AlignJustify, Minus } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { VariableInput } from './VariableInput';
import { ArrayEditor } from './ArrayEditor';
import { IconPicker } from './properties/IconPicker';
import { ColorPicker } from '@/components/builder/style-controls/ColorPicker';

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

  const updateComponentStyle = (key: string, value: any) => {
    // Helper to update specific styles via properties panel (like icon color)
    const currentStyles = selectedComponent.styles || {};
    updateComponent(selectedComponentId, {
      styles: {
        ...currentStyles,
        [key]: value
      }
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
    const { type, props, styles = {} } = selectedComponent;

    switch (type) {
      case 'Container':
        return (
          <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-md">
            Use the Styling Panel (palette icon) to customize layout, spacing, and background.
          </div>
        );

      case 'Navbar':
        return (
          <>
            {/* Logo Section */}
            <div className="space-y-3 pb-4 border-b">
              <Label className="text-sm font-medium">Logo</Label>
              <div className="space-y-2">
                <Label htmlFor="logo-type" className="text-xs text-muted-foreground">Type</Label>
                <Select
                  value={props.logo?.type || 'text'}
                  onValueChange={(value) => updateComponentProp('logo', { ...props.logo, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text (Brand Name)</SelectItem>
                    <SelectItem value="image">Image (Logo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(props.logo?.type || 'text') === 'text' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="brand-name" className="text-xs text-muted-foreground">Brand Name</Label>
                    <Input
                      value={props.logo?.text || 'YourBrand'}
                      onChange={(e) => updateComponentProp('logo', { ...props.logo, text: e.target.value })}
                      placeholder="Enter brand name"
                    />
                  </div>

                  {/* Show Icon Toggle - for displaying logo next to text */}
                  <div className="flex items-center justify-between space-y-0 rounded-md border p-3 bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">Show Icon with Text</Label>
                      <p className="text-xs text-muted-foreground">
                        {project?.faviconUrl ? 'Display logo icon next to brand name' : 'Upload a logo in Settings first'}
                      </p>
                    </div>
                    <Switch
                      checked={props.logo?.showIcon === true}
                      onCheckedChange={(checked) => updateComponentProp('logo', {
                        ...props.logo,
                        showIcon: checked
                      })}
                      disabled={!project?.faviconUrl}
                    />
                  </div>

                  {/* Icon preview when enabled */}
                  {props.logo?.showIcon && project?.faviconUrl && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Preview</Label>
                      <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/20">
                        <img
                          src={project.faviconUrl}
                          alt="Logo icon"
                          className="h-6 w-6 object-contain"
                        />
                        <span className="font-bold">{props.logo?.text || 'YourBrand'}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Use Project Logo Toggle */}
                  <div className="flex items-center justify-between space-y-0 rounded-md border p-3 bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-medium">Use Project Logo</Label>
                      <p className="text-xs text-muted-foreground">
                        {project?.faviconUrl ? 'Use favicon from Settings' : 'No logo uploaded yet'}
                      </p>
                    </div>
                    <Switch
                      checked={props.logo?.useProjectLogo === true}
                      onCheckedChange={(checked) => updateComponentProp('logo', {
                        ...props.logo,
                        useProjectLogo: checked,
                        // Clear manual URL when enabling project logo
                        imageUrl: checked ? '' : props.logo?.imageUrl
                      })}
                      disabled={!project?.faviconUrl}
                    />
                  </div>

                  {/* Show project logo preview when enabled */}
                  {props.logo?.useProjectLogo && project?.faviconUrl ? (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Project Logo Preview</Label>
                      <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/20">
                        <img
                          src={project.faviconUrl}
                          alt="Project logo"
                          className="h-8 w-8 object-contain rounded"
                        />
                        <span className="text-xs text-muted-foreground truncate">
                          {project.faviconUrl}
                        </span>
                      </div>
                    </div>
                  ) : !props.logo?.useProjectLogo ? (
                    <div className="space-y-2">
                      <Label htmlFor="logo-url" className="text-xs text-muted-foreground">Logo Image URL</Label>
                      <Input
                        value={props.logo?.imageUrl || ''}
                        onChange={(e) => updateComponentProp('logo', { ...props.logo, imageUrl: e.target.value })}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                  ) : null}
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="logo-link" className="text-xs text-muted-foreground">Logo Link</Label>
                <Input
                  value={props.logo?.link || '/'}
                  onChange={(e) => updateComponentProp('logo', { ...props.logo, link: e.target.value })}
                  placeholder="/"
                />
              </div>
            </div>

            {/* Menu Items Section */}
            <div className="space-y-3 py-4 border-b">
              <Label className="text-sm font-medium">Menu Items</Label>
              <div className="space-y-2">
                {(props.menuItems || []).map((item: any, index: number) => (
                  <div key={item.id || index} className="space-y-2 p-2 border rounded-md bg-muted/30">
                    <div className="flex gap-2">
                      <Input
                        value={item.label || ''}
                        onChange={(e) => {
                          const newItems = [...(props.menuItems || [])];
                          newItems[index] = { ...item, label: e.target.value };
                          updateComponentProp('menuItems', newItems);
                        }}
                        placeholder="Menu label"
                        className="h-8 flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          const newItems = (props.menuItems || []).filter((_: any, i: number) => i !== index);
                          updateComponentProp('menuItems', newItems);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={item.navType || 'scroll'}
                        onValueChange={(value) => {
                          const newItems = [...(props.menuItems || [])];
                          newItems[index] = { ...item, navType: value };
                          updateComponentProp('menuItems', newItems);
                        }}
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scroll">Scroll</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={item.target || ''}
                        onChange={(e) => {
                          const newItems = [...(props.menuItems || [])];
                          newItems[index] = { ...item, target: e.target.value };
                          updateComponentProp('menuItems', newItems);
                        }}
                        placeholder={item.navType === 'scroll' ? '#section-id' : '/page-url'}
                        className="h-8 flex-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const newItem = { id: `menu-${Date.now()}`, label: 'New Item', navType: 'scroll', target: '#' };
                  updateComponentProp('menuItems', [...(props.menuItems || []), newItem]);
                }}
              >
                + Add Menu Item
              </Button>
            </div>

            {/* CTA Buttons Section */}
            <div className="space-y-3 pt-4">
              <Label className="text-sm font-medium">CTA Buttons</Label>

              {/* Primary Button */}
              <div className="space-y-2 p-2 border rounded-md">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Primary Button</Label>
                  <Switch
                    checked={props.primaryButton?.enabled !== false}
                    onCheckedChange={(checked) => updateComponentProp('primaryButton', {
                      ...props.primaryButton,
                      enabled: checked
                    })}
                  />
                </div>
                {props.primaryButton?.enabled !== false && (
                  <>
                    <Input
                      value={props.primaryButton?.text || 'Get Started'}
                      onChange={(e) => updateComponentProp('primaryButton', {
                        ...props.primaryButton,
                        text: e.target.value
                      })}
                      placeholder="Button text"
                      className="h-8"
                    />
                    <div className="flex gap-2">
                      <Select
                        value={props.primaryButton?.navType || 'link'}
                        onValueChange={(value) => updateComponentProp('primaryButton', {
                          ...props.primaryButton,
                          navType: value
                        })}
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scroll">Scroll</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={props.primaryButton?.target || ''}
                        onChange={(e) => updateComponentProp('primaryButton', {
                          ...props.primaryButton,
                          target: e.target.value
                        })}
                        placeholder={props.primaryButton?.navType === 'scroll' ? '#section-id' : '/page-url'}
                        className="h-8 flex-1"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Secondary Button */}
              <div className="space-y-2 p-2 border rounded-md">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Secondary Button</Label>
                  <Switch
                    checked={props.secondaryButton?.enabled === true}
                    onCheckedChange={(checked) => updateComponentProp('secondaryButton', {
                      ...props.secondaryButton,
                      enabled: checked
                    })}
                  />
                </div>
                {props.secondaryButton?.enabled === true && (
                  <>
                    <Input
                      value={props.secondaryButton?.text || 'Learn More'}
                      onChange={(e) => updateComponentProp('secondaryButton', {
                        ...props.secondaryButton,
                        text: e.target.value
                      })}
                      placeholder="Button text"
                      className="h-8"
                    />
                    <div className="flex gap-2">
                      <Select
                        value={props.secondaryButton?.navType || 'link'}
                        onValueChange={(value) => updateComponentProp('secondaryButton', {
                          ...props.secondaryButton,
                          navType: value
                        })}
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scroll">Scroll</SelectItem>
                          <SelectItem value="link">Link</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={props.secondaryButton?.target || ''}
                        onChange={(e) => updateComponentProp('secondaryButton', {
                          ...props.secondaryButton,
                          target: e.target.value
                        })}
                        placeholder={props.secondaryButton?.navType === 'scroll' ? '#section-id' : '/page-url'}
                        className="h-8 flex-1"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        );

      case 'Heading':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="heading-text">Text <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
              <VariableInput
                value={props.text || ''}
                onChange={(value) => updateComponentProp('text', value)}
                placeholder="Enter heading text or type @ for variables"
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
              <Label htmlFor="text-content">Content <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
              <VariableInput
                value={props.text || ''}
                onChange={(value) => updateComponentProp('text', value)}
                multiline
                placeholder="Enter text or type @ for variables"
              />
            </div>
            {renderDataBindingButton()}
          </>
        );

      case 'Button':
        return (
          <>
            <ActionProperties
              componentId={selectedComponentId}
              props={props}
              updateComponentProp={updateComponentProp}
              onDataBindingClick={() => setShowDataBinding(true)}
              hasBinding={!!props.binding}
            />
            {/* Button Icon */}
            <div className="space-y-3 pt-4 border-t">
              <Label className="uppercase text-xs font-semibold text-muted-foreground">Button Icon</Label>

              <div className="space-y-2">
                <Label className="text-xs">Icon</Label>
                <IconPicker
                  value={props.buttonIcon || props.leftIcon || props.rightIcon || ''}
                  onChange={(icon) => {
                    // Clear old props and set new unified icon
                    updateComponentProp('buttonIcon', icon);
                    updateComponentProp('leftIcon', props.iconPosition === 'right' ? '' : icon);
                    updateComponentProp('rightIcon', props.iconPosition === 'right' ? icon : '');
                  }}
                />
              </div>

              {(props.buttonIcon || props.leftIcon || props.rightIcon) && (
                <div className="space-y-2">
                  <Label className="text-xs">Icon Position</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={props.iconPosition !== 'right' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const icon = props.buttonIcon || props.leftIcon || props.rightIcon;
                        updateComponentProp('iconPosition', 'left');
                        updateComponentProp('leftIcon', icon);
                        updateComponentProp('rightIcon', '');
                      }}
                    >
                      Left
                    </Button>
                    <Button
                      variant={props.iconPosition === 'right' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const icon = props.buttonIcon || props.leftIcon || props.rightIcon;
                        updateComponentProp('iconPosition', 'right');
                        updateComponentProp('rightIcon', icon);
                        updateComponentProp('leftIcon', '');
                      }}
                    >
                      Right
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        );

      case 'Icon':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Icon</Label>
              <IconPicker
                value={props.icon || props.name || 'Star'}
                onChange={(icon) => updateComponentProp('icon', icon)}
              />
            </div>

            <div className="space-y-2">
              <Label>Size</Label>
              <Select value={props.size || 'md'} onValueChange={(value) => updateComponentProp('size', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xs">Extra Small (xs)</SelectItem>
                  <SelectItem value="sm">Small (sm)</SelectItem>
                  <SelectItem value="md">Medium (md)</SelectItem>
                  <SelectItem value="lg">Large (lg)</SelectItem>
                  <SelectItem value="xl">Extra Large (xl)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ColorPicker
              label="Icon Color"
              value={props.color || styles.color || '#000000'}
              onChange={(color) => {
                updateComponentProp('color', color);
                updateComponentStyle('color', color);
              }}
              property="textColor"
            />
          </div>
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
              <Label htmlFor="badge-text">Text <span className="text-muted-foreground text-xs">(@ for variables)</span></Label>
              <VariableInput
                value={props.text || ''}
                onChange={(value) => updateComponentProp('text', value)}
                placeholder="Badge text"
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

      // === LANDING PAGE COMPONENTS ===
      // These are now templates that expand into primitive components.
      // Each child component uses its own property panel (Container, Heading, Text, etc.)
      // No custom property panels needed here anymore.

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
