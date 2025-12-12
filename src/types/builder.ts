export interface ComponentData {
    id: string;
    type: string;
    props: Record<string, any>;
    styles?: Record<string, any>;
    children?: ComponentData[];
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
    layoutData?: {
        content: ComponentData[];
        root: Record<string, any>;
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
