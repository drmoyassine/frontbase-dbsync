/**
 * FilePickerDialog - Dialog wrapper for FileBrowser in select mode
 * 
 * Opens a dialog to browse and select files from storage buckets.
 * Used by AssetUploader and other components that need file selection.
 */

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { FileBrowser } from './index';
import { StorageFile } from './types';

export interface FilePickerDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void;
    /** Callback when a file is selected - receives the public URL */
    onSelect: (url: string, file: StorageFile) => void;
    /** Optional: Initial bucket to navigate to */
    initialBucket?: string;
    /** Optional: File type filter (e.g., 'image' to only allow images) */
    fileFilter?: 'image' | 'all';
    /** Dialog title */
    title?: string;
    /** Dialog description */
    description?: string;
}

export function FilePickerDialog({
    open,
    onOpenChange,
    onSelect,
    initialBucket,
    fileFilter = 'all',
    title = 'Select File',
    description = 'Browse your storage buckets to select a file.',
}: FilePickerDialogProps) {
    const handleFileSelect = (url: string, file: StorageFile) => {
        // If filtering for images, validate
        if (fileFilter === 'image') {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];
            const ext = file.name.toLowerCase().split('.').pop() || '';
            if (!imageExtensions.includes(`.${ext}`)) {
                return; // Ignore non-image files
            }
        }

        onSelect(url, file);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-auto -mx-6 px-6">
                    <FileBrowser
                        selectMode={true}
                        onFileSelect={handleFileSelect}
                        initialBucket={initialBucket}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default FilePickerDialog;
