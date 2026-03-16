// FileBrowser — Thin orchestrator
// Owns shared state (hooks) and delegates rendering to BucketListView / FileListView

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { StorageFile } from './types';
import { useFileBrowserState } from './hooks/useFileBrowserState';
import { useStorageMutations } from './hooks/useStorageMutations';
import { BucketListView } from './BucketListView';
import { FileListView } from './FileListView';

// Types
interface FileBrowserProps {
    /** Required — the StorageProvider ID to scope all operations */
    storageProviderId: string;
    onNavigationChange?: (isBrowsing: boolean) => void;
    /** When true, clicking a file calls onFileSelect instead of opening */
    selectMode?: boolean;
    /** Callback when a file is selected (selectMode must be true) */
    onFileSelect?: (url: string, file: StorageFile) => void;
    /** Auto-navigate to this bucket on mount */
    initialBucket?: string;
    /** Hide bucket list and only show files */
    hideBucketList?: boolean;
}

export function FileBrowser({
    storageProviderId,
    onNavigationChange,
    selectMode = false,
    onFileSelect,
    initialBucket,
    hideBucketList = false,
}: FileBrowserProps) {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    // ── Shared state hook ──
    const state = useFileBrowserState();
    const {
        currentBucket, setCurrentBucket, currentPath, setCurrentPath, page, setPage,
        sortConfig, handleSort, getSortedFiles,
        isBucketDialogOpen, setIsBucketDialogOpen, bucketDialogMode, editingBucketId, bucketForm, setBucketForm,
        handleOpenCreateBucket, handleOpenEditBucket,
        confirmDialog, setConfirmDialog,
        isFolderDialogOpen, setIsFolderDialogOpen, newFolderName, setNewFolderName,
        isRenameDialogOpen, setIsRenameDialogOpen, renameTarget, newName, setNewName, handleRename,
        bucketSearch, setBucketSearch, fileSearch, setFileSearch,
        selectedFiles, setSelectedFiles, handleSelectAll, handleSelectFile,
        selectedProviders, setSelectedProviders, bucketSortConfig, setBucketSortConfig, bucketPage, setBucketPage,
        getFilteredAndSortedBuckets, getPaginatedBuckets, getTotalBucketPages,
        isMoveDialogOpen, setIsMoveDialogOpen, moveTargets, setMoveTargets, moveDestBucket, setMoveDestBucket, moveDestPath, setMoveDestPath, handleMove,
        handleBucketClick, handleBack,
    } = state;

    // ── Shared mutations hook ──
    const mutations = useStorageMutations({
        storageProviderId,
        currentBucket,
        currentPath,
        editingBucketId,
        setIsBucketDialogOpen,
        setIsFolderDialogOpen,
        setNewFolderName,
        setIsRenameDialogOpen,
        setRenameTarget: state.setRenameTarget,
        setNewName,
        setIsMoveDialogOpen,
        setMoveTargets,
        setSelectedFiles,
        setConfirmDialog,
        setCurrentBucket,
    });
    const {
        createBucketMutation, updateBucketMutation, deleteBucketMutation, emptyBucketMutation,
        deleteMutation, uploadMutation, createFolderMutation, renameMutation, moveMutation,
    } = mutations;

    // ── Effects ──
    React.useEffect(() => {
        onNavigationChange?.(!!currentBucket);
    }, [currentBucket, onNavigationChange]);

    React.useEffect(() => {
        if (initialBucket && !currentBucket) {
            setCurrentBucket(initialBucket);
        }
    }, [initialBucket]);

    // ── Shared handlers ──
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['storage-buckets', storageProviderId] }),
                currentBucket
                    ? queryClient.invalidateQueries({ queryKey: ['storage-files', storageProviderId] })
                    : Promise.resolve(),
                new Promise(resolve => setTimeout(resolve, 500)),
            ]);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleConfirmAction = () => {
        if (!confirmDialog.actionType) return;
        if (confirmDialog.actionType === 'delete') {
            if (selectedFiles.size > 0 && !confirmDialog.targetId) {
                const paths = Array.from(selectedFiles).map((name) => (currentPath ? `${currentPath}/${name}` : name));
                deleteMutation.mutate(paths);
                setSelectedFiles(new Set());
            } else if (confirmDialog.targetId) {
                deleteMutation.mutate([confirmDialog.targetId]);
            }
        } else if (confirmDialog.actionType === 'empty' && confirmDialog.targetId) {
            emptyBucketMutation.mutate(confirmDialog.targetId);
        } else if (confirmDialog.actionType === 'deleteBucket' && confirmDialog.targetId) {
            deleteBucketMutation.mutate(confirmDialog.targetId);
        }
    };

    const handleBucketSubmit = () => {
        const fileSize = bucketForm.fileSizeLimit ? parseFloat(bucketForm.fileSizeLimit) * 1024 * 1024 : undefined;
        const mimeTypes = bucketForm.allowedMimeTypes ? bucketForm.allowedMimeTypes.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
        if (bucketDialogMode === 'create') {
            createBucketMutation.mutate({ name: bucketForm.name, public: bucketForm.public, fileSizeLimit: fileSize, allowedMimeTypes: mimeTypes });
        } else {
            updateBucketMutation.mutate({ id: editingBucketId, public: bucketForm.public, fileSizeLimit: fileSize, allowedMimeTypes: mimeTypes });
        }
    };

    const handleCreateFolder = () => {
        if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim());
    };

    const handleRenameSubmit = () => {
        if (renameTarget && newName.trim() && newName !== renameTarget.name) {
            renameMutation.mutate({ oldName: renameTarget.name, newName: newName.trim() });
        }
    };

    const handleMoveSubmit = () => {
        if (moveDestBucket && moveTargets.length > 0) {
            moveMutation.mutate({ targets: moveTargets, destBucket: moveDestBucket, destPath: moveDestPath, sourceBucket: currentBucket! });
        }
    };

    const bucketMutationPending = createBucketMutation.isPending || updateBucketMutation.isPending;

    // =========================================================================
    // RENDER
    // =========================================================================
    if (!currentBucket) {
        return (
            <BucketListView
                storageProviderId={storageProviderId}
                bucketSearch={bucketSearch}
                setBucketSearch={setBucketSearch}
                selectedProviders={selectedProviders}
                setSelectedProviders={setSelectedProviders}
                bucketSortConfig={bucketSortConfig}
                setBucketSortConfig={setBucketSortConfig}
                bucketPage={bucketPage}
                setBucketPage={setBucketPage}
                getFilteredAndSortedBuckets={getFilteredAndSortedBuckets}
                getPaginatedBuckets={getPaginatedBuckets}
                getTotalBucketPages={getTotalBucketPages}
                isBucketDialogOpen={isBucketDialogOpen}
                setIsBucketDialogOpen={setIsBucketDialogOpen}
                bucketDialogMode={bucketDialogMode}
                bucketForm={bucketForm}
                setBucketForm={setBucketForm}
                handleOpenCreateBucket={handleOpenCreateBucket}
                handleOpenEditBucket={handleOpenEditBucket}
                confirmDialog={confirmDialog}
                setConfirmDialog={setConfirmDialog}
                onBucketClick={handleBucketClick}
                onBucketSubmit={handleBucketSubmit}
                onConfirmAction={handleConfirmAction}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                isMutationPending={bucketMutationPending}
            />
        );
    }

    return (
        <FileListView
            storageProviderId={storageProviderId}
            currentBucket={currentBucket}
            currentPath={currentPath}
            setCurrentPath={setCurrentPath}
            page={page}
            setPage={setPage}
            sortConfig={sortConfig}
            handleSort={handleSort}
            getSortedFiles={getSortedFiles}
            fileSearch={fileSearch}
            setFileSearch={setFileSearch}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            handleSelectAll={handleSelectAll}
            handleSelectFile={handleSelectFile}
            selectMode={selectMode}
            onFileSelect={onFileSelect}
            isBucketDialogOpen={isBucketDialogOpen}
            setIsBucketDialogOpen={setIsBucketDialogOpen}
            bucketDialogMode={bucketDialogMode}
            bucketForm={bucketForm}
            setBucketForm={setBucketForm}
            handleOpenEditBucket={handleOpenEditBucket}
            confirmDialog={confirmDialog}
            setConfirmDialog={setConfirmDialog}
            isFolderDialogOpen={isFolderDialogOpen}
            setIsFolderDialogOpen={setIsFolderDialogOpen}
            newFolderName={newFolderName}
            setNewFolderName={setNewFolderName}
            isRenameDialogOpen={isRenameDialogOpen}
            setIsRenameDialogOpen={setIsRenameDialogOpen}
            renameTarget={renameTarget}
            newName={newName}
            setNewName={setNewName}
            handleRename={handleRename}
            isMoveDialogOpen={isMoveDialogOpen}
            setIsMoveDialogOpen={setIsMoveDialogOpen}
            moveTargets={moveTargets}
            moveDestBucket={moveDestBucket}
            moveDestPath={moveDestPath}
            setMoveDestBucket={setMoveDestBucket}
            setMoveDestPath={setMoveDestPath}
            handleMove={handleMove}
            handleBack={handleBack}
            setCurrentBucket={setCurrentBucket}
            onBucketSubmit={handleBucketSubmit}
            onConfirmAction={handleConfirmAction}
            onCreateFolder={handleCreateFolder}
            onRenameSubmit={handleRenameSubmit}
            onMoveSubmit={handleMoveSubmit}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            uploadMutation={uploadMutation}
            deleteMutation={deleteMutation}
            createFolderMutation={createFolderMutation}
            renameMutation={renameMutation}
            moveMutation={moveMutation}
            bucketMutationPending={bucketMutationPending}
        />
    );
}

export default FileBrowser;
