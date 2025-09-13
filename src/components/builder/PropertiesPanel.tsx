import React from 'react';
import { useBuilderStore } from '@/stores/builder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';

export const PropertiesPanel: React.FC = () => {
  const { 
    selectedComponentId, 
    currentPageId, 
    pages, 
    updatePage,
    setSelectedComponentId 
  } = useBuilderStore();

  const currentPage = pages.find(page => page.id === currentPageId);
  const selectedComponent = currentPage?.layoutData?.content?.find(
    component => component.props.id === selectedComponentId
  );

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

  const updateComponentProp = (key: string, value: any) => {
    if (!currentPage) return;

    const updatedContent = currentPage.layoutData?.content?.map(component => 
      component.props.id === selectedComponentId
        ? { ...component, props: { ...component.props, [key]: value } }
        : component
    ) || [];

    updatePage(currentPage.id, {
      layoutData: {
        content: updatedContent,
        root: currentPage.layoutData?.root || {}
      }
    });
  };

  const deleteComponent = () => {
    if (!currentPage) return;

    const updatedContent = currentPage.layoutData?.content?.filter(
      component => component.props.id !== selectedComponentId
    ) || [];

    updatePage(currentPage.id, {
      layoutData: {
        content: updatedContent,
        root: currentPage.layoutData?.root || {}
      }
    });

    setSelectedComponentId(null);
  };

  const renderPropertyFields = () => {
    const { type, props } = selectedComponent;

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
          </>
        );

      case 'Checkbox':
      case 'Switch':
        return (
          <div className="space-y-2">
            <Label htmlFor="label-text">Label</Label>
            <Input
              id="label-text"
              value={props.label || ''}
              onChange={(e) => updateComponentProp('label', e.target.value)}
            />
          </div>
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
          </>
        );

      case 'Progress':
        return (
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
            </div>
          </>
        );

      default:
        return (
          <p className="text-muted-foreground text-sm">
            No properties available for {type} component.
          </p>
        );
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="border-b border-border pb-4 mb-4 flex justify-between items-center">
        <h2 className="font-semibold text-foreground">Properties</h2>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={deleteComponent}
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
    </div>
  );
};