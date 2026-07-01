import {
  getAuthConfig,
  init_env
} from "./chunk-5YJ43IHE.js";

// src/ssr/lib/SupabaseAuthProvider.ts
init_env();
import { createServerClient } from "@supabase/ssr";
function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return [];
  return cookieHeader.split(";").map((c) => {
    const [name, ...rest] = c.trim().split("=");
    return { name: name || "", value: rest.join("=") };
  }).filter((c) => c.name);
}
function serializeSetCookie(name, value, options) {
  let header = `${name}=${value}`;
  if (options?.path) header += `; Path=${options.path}`;
  if (options?.maxAge !== void 0) header += `; Max-Age=${options.maxAge}`;
  if (options?.domain) header += `; Domain=${options.domain}`;
  if (options?.sameSite) header += `; SameSite=${options.sameSite}`;
  if (options?.secure) header += "; Secure";
  if (options?.httpOnly) header += "; HttpOnly";
  return header;
}
var SupabaseAuthProvider = class {
  config;
  constructor(configOrSlug) {
    const resolved = configOrSlug || "_default";
    if (typeof resolved === "string") {
      this.config = getAuthConfig(resolved);
    } else {
      this.config = resolved;
    }
  }
  /**
   * Create a server-side Supabase client that reads cookies from the request
   * and captures Set-Cookie headers for the response.
   */
  async createClient(request) {
    if (this.config.provider !== "supabase" || !this.config.url || !this.config.anonKey) {
      return null;
    }
    const cookies = parseCookieHeader(request.headers.get("Cookie") || "");
    const setCookieHeaders = [];
    const supabase = createServerClient(this.config.url, this.config.anonKey, {
      cookies: {
        getAll: () => cookies,
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            const sameSite = typeof options?.sameSite === "string" ? options.sameSite : void 0;
            setCookieHeaders.push(serializeSetCookie(name, value, { ...options, sameSite }));
          }
        }
      }
    });
    return { supabase, getCookieHeaders: () => setCookieHeaders };
  }
  async getUserFromRequest(request) {
    const client = await this.createClient(request);
    if (!client) {
      console.warn("[Auth] Supabase credentials not configured.");
      return null;
    }
    try {
      const { data: { user }, error } = await client.supabase.auth.getUser();
      if (error || !user) return null;
      const { data: sessionData } = await client.supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      return await this.enrichUserContext(user, accessToken);
    } catch (err) {
      console.error("[Auth] getUserFromRequest error:", err);
      return null;
    }
  }
  async refreshSession(request) {
    const client = await this.createClient(request);
    if (!client) {
      return { user: null, setCookieHeaders: [] };
    }
    try {
      const { data: { user }, error } = await client.supabase.auth.getUser();
      if (error || !user) {
        return { user: null, setCookieHeaders: client.getCookieHeaders() };
      }
      const { data: sessionData } = await client.supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      return {
        user: await this.enrichUserContext(user, accessToken),
        setCookieHeaders: client.getCookieHeaders(),
        accessToken
      };
    } catch (err) {
      console.error("[Auth] refreshSession error:", err);
      return { user: null, setCookieHeaders: [] };
    }
  }
  async enrichUserContext(user, accessToken) {
    const baseContext = {
      id: user.id,
      email: user.email || "",
      name: user.user_metadata?.full_name || user.user_metadata?.name || "",
      firstName: user.user_metadata?.first_name || "",
      lastName: user.user_metadata?.last_name || "",
      avatar: user.user_metadata?.avatar_url,
      role: user.role || "user"
    };
    try {
      const contacts = this.config.contacts;
      if (!contacts?.table || !contacts?.datasource || !contacts?.columnMapping) {
        return baseContext;
      }
      const authUserCol = contacts.columnMapping.authUserIdColumn || "auth_user_id";
      const { createDatasourceAdapter } = await import("./datasource-adapter-C3HMXMIS.js");
      const adapter = createDatasourceAdapter({
        ...contacts.datasource,
        id: "contacts",
        name: "Contacts Datasource"
      });
      const result = await adapter.query({
        table: contacts.table,
        filters: { [authUserCol]: user.id },
        limit: 1,
        accessToken
        // Pass user's JWT so RLS policies work
      });
      if (result.data && result.data.length > 0) {
        const record = result.data[0];
        const enrichedContext = { ...baseContext, ...record };
        enrichedContext.id = baseContext.id;
        enrichedContext.contactId = record[contacts.columnMapping.contactIdColumn] || "";
        if (contacts.columnMapping.emailColumn && record[contacts.columnMapping.emailColumn]) {
          enrichedContext.email = record[contacts.columnMapping.emailColumn];
        }
        if (contacts.columnMapping.nameColumn && record[contacts.columnMapping.nameColumn]) {
          enrichedContext.name = record[contacts.columnMapping.nameColumn];
        }
        console.log(`[Auth] Enriched user context with contact record for ${user.id}`);
        return enrichedContext;
      }
    } catch (err) {
      console.error("[Auth] Error enriching contact record:", err);
    }
    return baseContext;
  }
};

export {
  SupabaseAuthProvider
};
