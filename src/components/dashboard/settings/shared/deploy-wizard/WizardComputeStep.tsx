/**
 * WizardComputeStep — Step 2: Choose CPU vs GPU compute type.
 */

import { Cpu, Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DeployWizardState } from './useDeployWizard';

export function WizardComputeStep({ computeType, setComputeType }: DeployWizardState) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <button
                type="button"
                onClick={() => setComputeType('cpu')}
                className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${computeType === 'cpu'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                    }`}
            >
                <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-blue-500" />
                    <span className="font-semibold text-sm">CPU</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                    Deploy SSR pages, workflows, automations, and API gateway — no AI inference.
                </p>
            </button>
            <button
                type="button"
                onClick={() => setComputeType('gpu')}
                className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all ${computeType === 'gpu'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/50'
                    }`}
            >
                <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-500" />
                    <span className="font-semibold text-sm">GPU</span>
                    <Badge variant="secondary" className="text-[10px] h-4 py-0 bg-purple-500/10 text-purple-500">AI</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                    Everything in CPU + AI model inference via Workers AI (LLMs, embeddings, vision…).
                </p>
            </button>
        </div>
    );
}
