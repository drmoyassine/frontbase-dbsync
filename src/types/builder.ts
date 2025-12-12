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
    };
    contactTypes: Record<string, string>; // key -> label (e.g. 'admin' -> 'Administrator')
    permissionLevels: Record<string, string>; // key -> label
    enabled: boolean;
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
