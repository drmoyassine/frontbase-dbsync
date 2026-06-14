import { useDataBindingStore } from '@/stores/data-binding-simple';

/**
 * Resolve a data component's binding using a single, shared strategy:
 * prefer the binding already on the component's props, and fall back to the
 * data-binding store (where the Builder persists bindings) when absent.
 *
 * Centralizing this keeps every data renderer (DataTable, Chart, Grid,
 * KPICard) consistent instead of each re-implementing the fallback.
 */
export function useResolvedBinding<T = any>(
    componentId: string | undefined,
    propBinding: T | undefined | null,
): T | null {
    const { getComponentBinding } = useDataBindingStore();
    if (propBinding) return propBinding;
    if (!componentId) return null;
    return (getComponentBinding(componentId) as T | null) ?? null;
}
