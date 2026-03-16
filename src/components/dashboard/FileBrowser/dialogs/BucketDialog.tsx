// BucketDialog — Create/Edit bucket dialog

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MultiSelectCustom } from '@/components/ui/multi-select-custom';
import { MIME_TYPE_OPTIONS } from '../constants';
import { BucketFormState } from '../types';

interface BucketDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'edit';
    form: BucketFormState;
    onFormChange: (form: BucketFormState) => void;
    onSubmit: () => void;
    isPending?: boolean;
}

export function BucketDialog({ open, onOpenChange, mode, form, onFormChange, onSubmit, isPending }: BucketDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'Create Bucket' : 'Edit Bucket'}</DialogTitle>
                    <DialogDescription>Configure storage bucket settings.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {mode === 'create' && (
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={form.name}
                                onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                                placeholder="e.g., uploads"
                            />
                        </div>
                    )}
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="public"
                            checked={form.public}
                            onCheckedChange={(checked) => onFormChange({ ...form, public: checked })}
                        />
                        <Label htmlFor="public">Public Bucket</Label>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="size">Max File Size (MB)</Label>
                        <Input
                            id="size"
                            type="number"
                            value={form.fileSizeLimit}
                            onChange={(e) => onFormChange({ ...form, fileSizeLimit: e.target.value })}
                            placeholder="No limit"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>Allowed Mime Types</Label>
                        <MultiSelectCustom
                            selected={form.allowedMimeTypes ? form.allowedMimeTypes.split(',').map((s) => s.trim()).filter(Boolean) : []}
                            options={MIME_TYPE_OPTIONS}
                            onChange={(selected) => onFormChange({ ...form, allowedMimeTypes: selected.join(', ') })}
                            placeholder="Select MIME types"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={onSubmit} disabled={isPending}>
                        {mode === 'create' ? 'Create' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
