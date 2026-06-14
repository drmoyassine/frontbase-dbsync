import type { ReactNode } from 'react';

export interface ColumnOverride {
    visible?: boolean;
    displayName?: string;
    displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
}

export interface ComponentDataBinding {
    componentId: string;
    dataSourceId: string;
    tableName: string;
    refreshInterval?: number;
    pagination: {
        enabled: boolean;
        pageSize: number;
        page: number;
    };
    sorting: {
        enabled: boolean;
        column?: string;
        direction?: 'asc' | 'desc';
    };
    filtering: {
        searchEnabled: boolean;
        filters: Record<string, any>;
    };
    columnOverrides: Record<string, ColumnOverride>;
    dataRequest?: any;
}

export interface GridProps {
    mode?: 'builder' | 'edge';
    componentId: string;
    binding?: ComponentDataBinding | null;
    className?: string;
    columns?: number;
    initialData?: any[];
    onConfigureBinding?: () => void;
    configureOverlay?: ReactNode;
    cardWrapper?: (item: any, content: ReactNode) => ReactNode;
}
