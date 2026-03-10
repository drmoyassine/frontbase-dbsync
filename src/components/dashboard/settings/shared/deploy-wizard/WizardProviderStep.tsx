/**
 * WizardProviderStep — Step 1: Select provider account.
 */

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DeployWizardState } from './useDeployWizard';

export function WizardProviderStep({ validProviders, selectedProviderId, setSelectedProviderId }: DeployWizardState) {
    return (
        <div className="space-y-2">
            <Label>Provider Account</Label>
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                    {validProviders.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                            {p.name} <span className="text-xs text-muted-foreground ml-1">({p.provider})</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
