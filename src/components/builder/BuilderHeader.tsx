import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { showApiErrorToast } from '@/components/dashboard/settings/shared/edgeTestToast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Eye,
  Save,
  Layers,
  ArrowLeft,
  Smartphone,
  Tablet,
  Monitor,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Menu,
  Wrench,
  FileEdit,
  Trash2,
  Grid3x3,
  Settings,
  History,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useBuilderStore } from '@/stores/builder';
import { PageSelector } from './PageSelector';
import { PageSettingsDrawer } from './PageSettingsDrawer';
import { VersionHistoryDialog } from './settings/VersionHistoryDialog';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { resolveEngineOrigin, resolvePreviewUrl } from '@/lib/edgeUtils';

interface EdgeTarget {
  id: string;
  name: string;
  url: string;
  adapter_type: string;
  is_active: boolean;
  edge_db_id: string | null;
}

export const BuilderHeader: React.FC<{
  isMobile?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
}> = ({
  isMobile = false,
  onToggleLeftSidebar,
  onToggleRightSidebar
}) => {
    const navigate = useNavigate();
    const {
      project,
      currentPageId,
      pages,
      isPreviewMode,
      setPreviewMode,
      isSupabaseConnected,
      selectedComponentId,
      isSaving,
      hasUnsavedChanges,
      currentViewport,
      zoomLevel,
      setCurrentViewport,
      setZoomLevel,
      showGrid,
      setShowGrid,
      savePageToDatabase,
      publishPageToTarget,
      publishPageToTargets,
      loadPagesFromDatabase,
      togglePageVisibility,
      deleteSelectedComponent
    } = useBuilderStore();

    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [showPageSettings, setShowPageSettings] = useState(false);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [targets, setTargets] = useState<EdgeTarget[]>([]);
    const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
    const [isPublishing, setIsPublishing] = useState(false);
    const [loadingTargets, setLoadingTargets] = useState(false);

    const currentPage = pages.find(page => page.id === currentPageId);

    // Get unified page status
    const getPageStatus = () => {
      if (!currentPage) return null;

      if (currentPage.deletedAt) {
        return {
          label: 'Deleted',
          icon: Trash2,
          className: 'text-red-600 border-red-500 bg-red-50'
        };
      }

      if (currentPage.isPublic) {
        return {
          label: 'Published',
          icon: CheckCircle2,
          className: 'text-green-600 border-green-500 bg-green-50'
        };
      }

      return {
        label: 'Draft',
        icon: FileEdit,
        className: 'text-muted-foreground border-border'
      };
    };

    const pageStatus = getPageStatus();

    const handleSave = async () => {
      if (currentPageId) {
        await savePageToDatabase(currentPageId);
      }
    };

    const handleSingleTargetPublish = async (target: EdgeTarget) => {
      if (!currentPageId || !currentPage) return;
      setIsPublishing(true);
      try {
        const returnedPreviewUrl = await publishPageToTarget(currentPageId, target.id);
        // Reload once for single target
        await loadPagesFromDatabase(false, true);
        
        if (returnedPreviewUrl) {
          window.open(returnedPreviewUrl, '_blank');
        } else {
          toast.success(`Published to ${target.name}`);
        }
      } finally {
        setIsPublishing(false);
        setPublishOpen(false);
      }
    };

    // Multi-target: publish to all selected
    const handleMultiTargetPublish = async () => {
      if (!currentPageId || !currentPage || selectedTargets.size === 0) return;
      setIsPublishing(true);
      try {
        const selected = targets.filter(t => selectedTargets.has(t.id) && !isTargetSynced(t.id));
        if (selected.length === 0) {
          toast.info('All selected targets are already up to date');
          return;
        }
        // Single batch request — one save, one serialize, one reload
        const result = await publishPageToTargets(currentPageId, selected.map(t => t.id));
        if (result) {
          const succeeded = result.results?.filter((r: any) => r.success) || [];
          const failed = result.results?.filter((r: any) => !r.success) || [];
          if (succeeded.length > 0) {
            const names = succeeded.map((r: any) => r.name).join(', ');
            toast.success(`Published to ${names}`);
          }
          if (failed.length > 0) {
            const names = failed.map((r: any) => r.name).join(', ');
            toast.error(`Failed to publish to: ${names}`);
          }
        }
      } catch (err: any) {
        showApiErrorToast(err, 'Publish Failed');
      } finally {
        setIsPublishing(false);
        setPublishOpen(false);
      }
    };

    // Main publish handler: single-target fallback vs dropdown
    const handlePublishClick = async () => {
      if (!currentPageId || !currentPage) return;

      setLoadingTargets(true);
      try {
        const response = await fetch('/api/edge-engines/active/by-scope/full');
        const data = await response.json();
        const eligible = (data as EdgeTarget[]).filter(e => e.edge_db_id);

        if (eligible.length === 1) {
          // Single target → direct publish + auto-preview (no dropdown)
          await handleSingleTargetPublish(eligible[0]);
        } else if (eligible.length > 1) {
          // Multiple targets → show dropdown, only pre-select unsynced
          setTargets(eligible);
          setSelectedTargets(new Set(
            eligible.filter(e => !isTargetSynced(e.id)).map(e => e.id)
          ));
          setPublishOpen(true);
        } else {
          // No targets → show empty state
          setTargets([]);
          setPublishOpen(true);
        }
      } catch (err) {
        showApiErrorToast(err, 'Failed to load targets');
      } finally {
        setLoadingTargets(false);
      }
    };

    const toggleTarget = (id: string) => {
      setSelectedTargets(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    // Check if target is already synced with current page
    const isTargetSynced = (targetId: string) => {
      // If there are unsaved changes, nothing is synced
      if (hasUnsavedChanges) return false;
      if (!currentPage?.deployments) return false;
      return currentPage.deployments.some(
        (d: any) => d.engineId === targetId && d.status === 'published' && d.contentHash === currentPage.contentHash
      );
    };

    const handleToggleVisibility = async () => {
      if (currentPageId) {
        await togglePageVisibility(currentPageId);
      }
    };

    const handleDeleteComponent = () => {
      deleteSelectedComponent();
    };

    const handleNavigateToDatabase = () => {
      navigate('/data-studio');
    };

    const handleBackToDashboard = () => {
      if (hasUnsavedChanges) {
        setShowUnsavedDialog(true);
      } else {
        navigate('/pages');
      }
    };

    const handleSaveAndNavigate = async () => {
      if (currentPageId) {
        await handleSave();
      }
      navigate('/pages');
      setShowUnsavedDialog(false);
    };

    const handleDiscardAndNavigate = () => {
      navigate('/pages');
      setShowUnsavedDialog(false);
    };

    return (
      <header className="relative h-16 bg-card border-b border-border flex items-center px-6">
        {/* Left Section */}
        <div className="flex items-center gap-4">

          <Button variant="ghost" size="sm" onClick={handleBackToDashboard}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border hidden sm:block" />

          <div className="hidden sm:flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Frontbase</span>
          </div>

          <div className="h-6 w-px bg-border" />

          <PageSelector />
        </div>

        {/* Center Section - Responsive Controls (Hidden on mobile) */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 items-center gap-3">
          {/* Viewport Selection */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            <Button
              variant={currentViewport === 'mobile' ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentViewport('mobile')}
              className="h-8 w-8 p-0"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
            <Button
              variant={currentViewport === 'tablet' ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentViewport('tablet')}
              className="h-8 w-8 p-0"
            >
              <Tablet className="h-4 w-4" />
            </Button>
            <Button
              variant={currentViewport === 'desktop' ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentViewport('desktop')}
              className="h-8 w-8 p-0"
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
              disabled={zoomLevel <= 25}
              className="h-8 w-8 p-0"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>

            <Badge variant="outline" className="min-w-16 justify-center">
              {zoomLevel}%
            </Badge>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
              disabled={zoomLevel >= 200}
              className="h-8 w-8 p-0"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Grid Controls */}
          <div className="flex items-center gap-1 border-l pl-4">
            <Button
              variant={showGrid ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowGrid(!showGrid)}
              className="h-8 w-8 p-0"
              title="Toggle Grid (G)"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-4 ml-auto">
          {/* Status Badge */}
          {pageStatus && (
            <Badge
              variant="outline"
              className={cn("gap-1.5 px-2.5 py-0.5", pageStatus.className)}
            >
              <pageStatus.icon className="h-3 w-3" />
              <span className="text-xs font-medium hidden sm:inline">{pageStatus.label}</span>
            </Badge>
          )}

          {/* Save Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              hasUnsavedChanges && "border-amber-500 text-amber-600"
            )}
          >
            {isSaving && <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />}
            {!isSaving && <Save className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">
              {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save*' : 'Save'}
            </span>
          </Button>

          {/* Publish Split Button: primary + chevron popover */}
          <div className="flex items-center">
            <Button
              size="sm"
              disabled={isSaving || isPublishing || loadingTargets}
              onClick={handlePublishClick}
              className="rounded-r-none"
            >
              {(isPublishing || loadingTargets) ? (
                <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">
                {isPublishing ? 'Publishing...' : 'Publish'}
              </span>
            </Button>
            <Popover open={publishOpen} onOpenChange={setPublishOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  disabled={isSaving || isPublishing || loadingTargets}
                  className="rounded-l-none border-l px-1.5"
                  onClick={async (e) => {
                    e.preventDefault();
                    // Load targets for dropdown on chevron click
                    setLoadingTargets(true);
                    try {
                      const response = await fetch('/api/edge-engines/active/by-scope/full');
                      const data = await response.json();
                      const eligible = (data as EdgeTarget[]).filter(e => e.edge_db_id);
                      setTargets(eligible);
                      setSelectedTargets(new Set(
                        eligible.filter(e => !isTargetSynced(e.id)).map(e => e.id)
                      ));
                      setPublishOpen(true);
                    } catch (err) {
                      showApiErrorToast(err, 'Failed to load targets');
                    } finally {
                      setLoadingTargets(false);
                    }
                  }}
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <div className="p-3 border-b">
                <p className="text-sm font-semibold">Publish to Edge</p>
                {hasUnsavedChanges && (
                  <p className="text-xs text-muted-foreground mt-1">Changes will be saved first.</p>
                )}
              </div>

              {targets.length === 0 ? (
                <div className="p-4 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No publish targets available.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add a Full-Bundle Edge Engine with a database to get started.
                  </p>
                </div>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto">
                    {targets.map(target => {
                      const synced = isTargetSynced(target.id);
                      const pagePath = currentPage?.isHomepage ? '' : currentPage?.slug || '';
                      // Prefer the stored previewUrl from the deployment record (tenant-aware)
                      // rather than computing from target.url which may be an internal worker URL.
                      const storedDep = currentPage?.deployments?.find((d: any) => d.engineId === target.id && d.status === 'published');
                      const previewUrl = storedDep?.previewUrl || resolvePreviewUrl(target.url, pagePath);
                      return (
                        <div
                          key={target.id}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0",
                            synced ? "opacity-60" : "hover:bg-muted/50"
                          )}
                        >
                          <Checkbox
                            checked={synced || selectedTargets.has(target.id)}
                            onCheckedChange={() => !synced && toggleTarget(target.id)}
                            disabled={synced}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{target.name}</span>
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full flex-shrink-0",
                                  synced ? "bg-emerald-500" : "bg-amber-500"
                                )}
                                title={synced ? "Up to date" : "Needs sync"}
                              />
                            </div>
                          </div>
                          <button
                            className="flex-shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(previewUrl, '_blank');
                            }}
                            title={`Preview on ${target.name}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-2 border-t">
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={selectedTargets.size === 0 || isPublishing}
                      onClick={handleMultiTargetPublish}
                    >
                      {isPublishing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {isPublishing
                        ? 'Publishing...'
                        : `Publish to ${selectedTargets.size} target${selectedTargets.size !== 1 ? 's' : ''}`}
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
          </div>

          {/* Version History */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersionHistory(true)}
            title="Version History"
          >
            <History className="h-4 w-4" />
          </Button>

          {/* Page Settings */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPageSettings(true)}
            title="Page Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={setShowUnsavedDialog}
          onSaveAndContinue={handleSaveAndNavigate}
          onDiscardAndContinue={handleDiscardAndNavigate}
        />

        <PageSettingsDrawer
          open={showPageSettings}
          onOpenChange={setShowPageSettings}
        />

        <VersionHistoryDialog
          open={showVersionHistory}
          onOpenChange={setShowVersionHistory}
        />
      </header>
    );
  };