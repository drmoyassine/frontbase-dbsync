export interface ComponentData {
    id: string;
    type: string;
    props: Record<string, any>;
    styles?: Record<string, any>;
    children?: ComponentData[];
}

// Legacy type for backward compatibility
export interface ContainerStyles {
    orientation?: 'row' | 'column';
    gap?: number;
    flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
    alignItems?: 'start' | 'center' | 'end' | 'stretch';
    justifyContent?: 'start' | 'center' | 'end' | 'between' | 'around';
    backgroundColor?: string;
    padding?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    stylingMode?: 'visual' | 'css';
}

// New styles system
export interface StylesData {
    activeProperties: string[];
    values: Record<string, any>;
    stylingMode: 'visual' | 'css';
    rawCSS?: string;
}

export interface Page {
    id: string;
    name: string;
    slug: string;
    title?: string;
    description?: string;
    keywords?: string;
    isPublic: boolean;
    isHomepage: boolean;

    // containerStyles NOW lives in layoutData.root.containerStyles
    // but we keep this for in-memory representation
    containerStyles?: ContainerStyles | StylesData;

    layoutData?: {
        content: ComponentData[];
        root: {
            containerStyles?: ContainerStyles | StylesData; // Actually stored here in DB
            [key: string]: any;
        };
    };
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
}

export interface UserContactConfig {
    contactsTable: string;
    columnMapping: {
        authUserIdColumn: string;
        contactIdColumn: string;
        contactTypeColumn: string;
        permissionLevelColumn: string;
        nameColumn?: string;
        emailColumn?: string;
        phoneColumn?: string;
        avatarColumn?: string;
        createdAtColumn?: string; // For tracking new users/growth
    };
    contactTypes: Record<string, string>; // key -> label (e.g. 'admin' -> 'Administrator')
    contactTypeHomePages?: Record<string, string>; // key (contact type value) -> pageId
    permissionLevels: Record<string, string>; // key -> label
    enabled: boolean;

    // Table Configuration Persistence
    columnOverrides?: Record<string, any>;
    columnOrder?: string[];
    frontendFilters?: any[]; // Using any[] to avoid circular dependency with FilterConfig, or simple array of objects
}

export interface ProjectConfig {
    id: string;
    name: string;
    description?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    usersConfig?: UserContactConfig;
    createdAt: string;
    updatedAt: string;
}

export interface AppVariable {
    id: string;
    name: string;
    type: 'variable' | 'calculated';
    value?: string;
    formula?: string;
    description?: string;
    createdAt: string;
}
