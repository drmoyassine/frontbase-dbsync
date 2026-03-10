/**
 * DeployEngineWizard — Unified deploy wizard with CPU / GPU flow.
 *
 * Steps:
 *   1. Provider  — select CF provider account
 *   2. Compute   — CPU vs GPU toggle cards
 *   3. Config    — Lite/Full, worker name, DB, cache, queue
 *   4. AI Model  — GPU only: search + select from Workers AI catalog
 *   5. Deploying — spinner while deploy is in progress
 *
 * Architecture:
 *   - useDeployWizard.ts   — All state, navigation, and deploy logic
 *   - WizardProviderStep   — Step 1 UI
 *   - WizardComputeStep    — Step 2 UI
 *   - WizardConfigStep     — Step 3 UI (main per-provider customization point)
 *   - WizardAIModelStep    — Step 4 UI
 */

import { useState, useCallback } from 'react';
import { Rocket, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { useDeployWizard } from './deploy-wizard/useDeployWizard';
import { WizardProviderStep } from './deploy-wizard/WizardProviderStep';
import { WizardComputeStep } from './deploy-wizard/WizardComputeStep';
import { WizardConfigStep } from './deploy-wizard/WizardConfigStep';
import { WizardAIModelStep } from './deploy-wizard/WizardAIModelStep';
import { ConnectProviderDialog } from './ConnectProviderDialog';
import { KNOWN_EDGE_PROVIDERS } from './edgeConstants';

// ============================================================================
// Component
// ============================================================================

export function DeployEngineWizard() {
    const wizard = useDeployWizard();
    const [connectOpen, setConnectOpen] = useState(false);

    const {
        open, handleOpenChange,
        step, error, isDeploying,
        goNext, goBack, canNext, stepTitle, stepNumber,
        validProviders, computeType, selectedModel,
        selectedProvider, selectedProviderType,
    } = wizard;

    // When user clicks "Deploy Engine", check if providers exist first
    const handleDeployClick = useCallback(() => {
        if (validProviders.length === 0) {
            // No edge providers connected — prompt to connect one first
            setConnectOpen(true);
        } else {
            handleOpenChange(true);
        }
    }, [validProviders, handleOpenChange]);

    // After connecting a provider, auto-open the deploy wizard
    const handleProviderConnected = useCallback((_accountId: string) => {
        setConnectOpen(false);
        // Small delay to let react-query refetch providers before opening wizard
        setTimeout(() => handleOpenChange(true), 300);
    }, [handleOpenChange]);

    return (
        <>
            {/* Deploy Engine trigger button — always active */}
            <Button size="sm" onClick={handleDeployClick}>
                <Rocket className="w-4 h-4 mr-2" /> Deploy Engine
            </Button>

            {/* Connect Provider fallback dialog (DRY — reuses existing component) */}
            <ConnectProviderDialog
                open={connectOpen}
                onOpenChange={setConnectOpen}
                allowedProviders={[...KNOWN_EDGE_PROVIDERS]}
                onConnected={handleProviderConnected}
            />

            {/* Main deploy wizard dialog */}
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{stepTitle()}</DialogTitle>
                        <DialogDescription>
                            {step === 'deploying'
                                ? 'Please wait while your engine is being deployed...'
                                : stepNumber()
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-4 min-h-[200px]">
                        {error && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {step === 'provider' && <WizardProviderStep {...wizard} />}
                        {step === 'compute-type' && <WizardComputeStep {...wizard} />}
                        {step === 'engine-config' && <WizardConfigStep {...wizard} />}
                        {step === 'ai-model' && <WizardAIModelStep {...wizard} />}

                        {step === 'deploying' && (
                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">
                                    {computeType === 'gpu' && wizard.gpuMode === 'existing'
                                        ? 'Attaching AI model & redeploying engine...'
                                        : `Deploying engine to ${selectedProvider?.name || selectedProviderType}...`}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ─── Footer: Back / Next / Deploy ───────── */}
                    {step !== 'deploying' && (
                        <DialogFooter className="flex justify-between sm:justify-between">
                            <div>
                                {step !== 'provider' && (
                                    <Button variant="outline" onClick={goBack} size="sm">
                                        <ChevronLeft className="w-4 h-4 mr-1" /> Back
                                    </Button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={() => handleOpenChange(false)} size="sm">Cancel</Button>
                                <Button
                                    onClick={goNext}
                                    disabled={!canNext() || isDeploying}
                                    size="sm"
                                >
                                    {step === 'engine-config' && computeType === 'cpu' ? (
                                        <><Rocket className="w-4 h-4 mr-1" /> Deploy</>
                                    ) : step === 'ai-model' ? (
                                        <><Rocket className="w-4 h-4 mr-1" /> {selectedModel ? 'Deploy with Model' : 'Deploy without Model'}</>
                                    ) : (
                                        <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
                                    )}
                                </Button>
                            </div>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

