import { FilterConfig } from '@/hooks/data/useSimpleData';

export interface FilterInputProps {
    filter: FilterConfig;
    tableName: string;
    onValueChange: (value: any) => void;
}
