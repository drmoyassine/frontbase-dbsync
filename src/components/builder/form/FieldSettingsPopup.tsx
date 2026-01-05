import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

interface FieldSettingsPopupProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fieldName: string;
    settings: any;
    onSave: (settings: any) => void;
    componentType?: 'Form' | 'InfoList';
}

export const FieldSettingsPopup: React.FC<FieldSettingsPopupProps> = ({
    open,
    onOpenChange,
    fieldName,
    settings,
    onSave,
    componentType = 'Form'
}) => {
    // General settings
    const [label, setLabel] = useState(settings?.label || fieldName);
    const [type, setType] = useState(settings?.type || settings?.originalType || 'text');

    // Validation settings
    const [validationEnabled, setValidationEnabled] = useState(false);
    const [required, setRequired] = useState(false);
    const [validation, setValidation] = useState<any>({});

    useEffect(() => {
        if (open) {
            setLabel(settings?.label || fieldName);
            setType(settings?.type || settings?.originalType || 'text');

            // Validation state init
            const val = settings?.validation || {};
            setValidation(val);
            setRequired(val.required || false);
            setValidationEnabled(!!settings?.validation);
        }
    }, [open, fieldName, settings]);

    const handleSave = () => {
        const newSettings = {
            label,
            type,
            validation: {
                ...validation,
                required
            }
        };
        onSave(newSettings);
        onOpenChange(false);
    };

    const updateValidation = (key: string, value: any) => {
        setValidation((prev: any) => ({
            ...prev,
            [key]: value
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Field Settings: {fieldName}</DialogTitle>
                    <DialogDescription>
                        {componentType === 'InfoList'
                            ? 'Configure display options for this field.'
                            : 'Configure display and validation options for this field.'}
                    </DialogDescription>
                </DialogHeader>

                {componentType === 'InfoList' ? (
                    /* InfoList: No tabs, just General settings */
                    <div className="py-4 space-y-4">

                        <div className="space-y-2">
                            <Label htmlFor="field-label">Label</Label>
                            <Input
                                id="field-label"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="field-type">Display Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger id="field-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="datetime">Date Time</SelectItem>
                                    <SelectItem value="boolean">Yes/No</SelectItem>
                                    <SelectItem value="badge">Badge(s)</SelectItem>
                                    <SelectItem value="image">Image</SelectItem>
                                    <SelectItem value="link">Link</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Controls how the value is displayed. Badge(s) auto-detects single or multiple values.
                            </p>
                        </div>

                        {type === 'image' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="img-width">Width</Label>
                                    <Input
                                        id="img-width"
                                        value={settings?.width || ''}
                                        onChange={(e) => onSave({ ...settings, width: e.target.value, type })}
                                        placeholder="e.g. 100px"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="img-height">Height</Label>
                                    <Input
                                        id="img-height"
                                        value={settings?.height || ''}
                                        onChange={(e) => onSave({ ...settings, height: e.target.value, type })}
                                        placeholder="e.g. 100px"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Form: Tabs with General + Validation */
                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="general">General</TabsTrigger>
                            <TabsTrigger value="validation">Validation</TabsTrigger>
                        </TabsList>

                        <TabsContent value="general" className="py-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="field-label">Label</Label>
                                <Input
                                    id="field-label"
                                    value={label}
                                    onChange={(e) => setLabel(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="field-type">Input Type</Label>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger id="field-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text Input</SelectItem>
                                        <SelectItem value="textarea">Text Area</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="email">Email</SelectItem>
                                        <SelectItem value="date">Date Picker</SelectItem>
                                        <SelectItem value="datetime">Date Time</SelectItem>
                                        <SelectItem value="checkbox">Checkbox</SelectItem>
                                        <SelectItem value="select">Select / Dropdown</SelectItem>
                                        <SelectItem value="image">Image</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Controls which input component is rendered.
                                </p>
                            </div>

                            {type === 'image' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="img-width">Width</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="img-width"
                                                value={settings?.width || ''}
                                                onChange={(e) => onSave({ ...settings, width: e.target.value, type })}
                                                placeholder="e.g. 100px or 100%"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="img-height">Height</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="img-height"
                                                value={settings?.height || ''}
                                                onChange={(e) => onSave({ ...settings, height: e.target.value, type })}
                                                placeholder="e.g. 200px"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="validation" className="py-4 space-y-4">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="required">Required Field</Label>
                                    </div>
                                    <Switch
                                        id="required"
                                        checked={required}
                                        onCheckedChange={setRequired}
                                    />
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="v-email">Is Email</Label>
                                    </div>
                                    <Switch
                                        id="v-email"
                                        checked={validation?.isEmail || false}
                                        onCheckedChange={checked => updateValidation('isEmail', checked)}
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="v-number">Is Number</Label>
                                    </div>
                                    <Switch
                                        id="v-number"
                                        checked={validation?.isNumber || false}
                                        onCheckedChange={checked => updateValidation('isNumber', checked)}
                                    />
                                </div>
                            </div>

                            <Separator />

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">Min Length/Value</Label>
                                    <Input
                                        type="number"
                                        value={validation.min || ''}
                                        onChange={(e) => updateValidation('min', e.target.value ? parseInt(e.target.value) : undefined)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Max Length/Value</Label>
                                    <Input
                                        type="number"
                                        value={validation.max || ''}
                                        onChange={(e) => updateValidation('max', e.target.value ? parseInt(e.target.value) : undefined)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs">Custom Regex</Label>
                                <Input
                                    value={validation.pattern || ''}
                                    onChange={(e) => updateValidation('pattern', e.target.value)}
                                    placeholder="e.g. ^[A-Z]+$"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs">Error Message</Label>
                                <Input
                                    value={validation.message || ''}
                                    onChange={(e) => updateValidation('message', e.target.value)}
                                    placeholder="Custom error message..."
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
