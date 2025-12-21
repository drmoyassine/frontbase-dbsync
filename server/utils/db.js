const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
  constructor() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/frontbase.db');
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');

    // Create RLS policy metadata table if it doesn't exist
    // Moved to schema.sql, but we can keep this check for existing deployments just in case init.js didn't run it
    // (Actually, init.js runs before this, so we can verify or just trust it. Let's trust init.js for the CREATE TABLE)

    // Check if we need to migrate auth_forms (add allowed_contact_types or fix check constraint)
    const tableInfo = this.db.pragma('table_info(auth_forms)');
    const hasAllowedContactTypes = tableInfo.some(col => col.name === 'allowed_contact_types');

    // If table exists but missing column, we need to migrate to fix schema and constraints
    if (tableInfo.length > 0 && !hasAllowedContactTypes) {
      console.log('🔄 Migrating auth_forms table schema...');
      this.db.transaction(() => {
        // 1. Rename existing table
        this.db.exec('ALTER TABLE auth_forms RENAME TO auth_forms_old');

        // 2. Create new table with updated schema
        this.db.exec(`
          CREATE TABLE auth_forms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('login', 'signup', 'both')),
            config TEXT DEFAULT '{}',
            target_contact_type TEXT,
            allowed_contact_types TEXT DEFAULT '[]',
            redirect_url TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )
        `);

        // 3. Copy data
        this.db.exec(`
          INSERT INTO auth_forms (id, name, type, config, target_contact_type, redirect_url, is_active, created_at, updated_at)
          SELECT id, name, type, config, target_contact_type, redirect_url, is_active, created_at, updated_at
          FROM auth_forms_old
        `);

        // 4. Drop old table
        this.db.exec('DROP TABLE auth_forms_old');
      })();
      console.log('✅ auth_forms table migration complete.');
    }

    // Prepare statements for better performance
    this.prepareStatements();
  }

  prepareStatements() {
    // Project statements
    this.getProjectStmt = this.db.prepare('SELECT * FROM project WHERE id = ?');
    this.updateProjectStmt = this.db.prepare(`
      UPDATE project 
      SET name = ?, description = ?, supabase_url = ?, supabase_anon_key = ?, supabase_service_key_encrypted = ?, users_config = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    // Service key specific statements
    this.updateProjectServiceKeyStmt = this.db.prepare(`
      UPDATE project 
      SET supabase_service_key_encrypted = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    this.getProjectServiceKeyStmt = this.db.prepare(`
      SELECT supabase_service_key_encrypted FROM project WHERE id = ?
    `);

    // Pages statements
    this.getAllPagesStmt = this.db.prepare('SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY created_at DESC');
    this.getAllPagesWithDeletedStmt = this.db.prepare('SELECT * FROM pages ORDER BY created_at DESC');
    this.getPageStmt = this.db.prepare('SELECT * FROM pages WHERE id = ?');
    this.getPageBySlugStmt = this.db.prepare('SELECT * FROM pages WHERE slug = ?');
    this.getPublicPagesStmt = this.db.prepare('SELECT * FROM pages WHERE is_public = true ORDER BY created_at DESC');
    this.createPageStmt = this.db.prepare(`
      INSERT INTO pages (id, name, slug, title, description, keywords, is_public, is_homepage, layout_data, seo_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    this.updatePageStmt = this.db.prepare(`
      UPDATE pages 
      SET name = ?, slug = ?, title = ?, description = ?, keywords = ?, is_public = ?, is_homepage = ?, layout_data = ?, seo_data = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    this.deletePageStmt = this.db.prepare('DELETE FROM pages WHERE id = ?');

    // Variables statements
    this.getAllVariablesStmt = this.db.prepare('SELECT * FROM app_variables ORDER BY created_at DESC');
    this.getVariableStmt = this.db.prepare('SELECT * FROM app_variables WHERE id = ?');
    this.createVariableStmt = this.db.prepare(`
      INSERT INTO app_variables (id, name, type, value, formula, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    this.updateVariableStmt = this.db.prepare(`
      UPDATE app_variables 
      SET name = ?, type = ?, value = ?, formula = ?, description = ?
      WHERE id = ?
    `);
    this.deleteVariableStmt = this.db.prepare('DELETE FROM app_variables WHERE id = ?');

    // Assets statements
    this.getAllAssetsStmt = this.db.prepare('SELECT * FROM assets ORDER BY created_at DESC');
    this.getAssetStmt = this.db.prepare('SELECT * FROM assets WHERE id = ?');
    this.createAssetStmt = this.db.prepare(`
      INSERT INTO assets (id, filename, original_name, mime_type, size, file_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    this.deleteAssetStmt = this.db.prepare('DELETE FROM assets WHERE id = ?');

    // User settings statements
    this.getUserSettingsStmt = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
    this.createUserSettingsStmt = this.db.prepare(`
      INSERT INTO user_settings (id, user_id, supabase_url, supabase_anon_key, settings_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    this.updateUserSettingsStmt = this.db.prepare(`
      UPDATE user_settings 
      SET supabase_url = ?, supabase_anon_key = ?, settings_data = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `);

    // RLS policy metadata statements
    this.getRLSMetadataStmt = this.db.prepare(
      'SELECT * FROM rls_policy_metadata WHERE table_name = ? AND policy_name = ?'
    );
    this.getAllRLSMetadataStmt = this.db.prepare(
      'SELECT * FROM rls_policy_metadata ORDER BY created_at DESC'
    );
    this.createRLSMetadataStmt = this.db.prepare(`
      INSERT INTO rls_policy_metadata (id, table_name, policy_name, form_data, generated_using, generated_check, sql_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    this.updateRLSMetadataStmt = this.db.prepare(`
      UPDATE rls_policy_metadata 
      SET policy_name = ?, form_data = ?, generated_using = ?, generated_check = ?, sql_hash = ?, updated_at = datetime('now')
      WHERE table_name = ? AND policy_name = ?
    `);
    this.deleteRLSMetadataStmt = this.db.prepare(
      'DELETE FROM rls_policy_metadata WHERE table_name = ? AND policy_name = ?'
    );

    // Auth Forms statements
    this.getAllAuthFormsStmt = this.db.prepare('SELECT * FROM auth_forms ORDER BY created_at DESC');
    this.getAuthFormStmt = this.db.prepare('SELECT * FROM auth_forms WHERE id = ?');
    this.createAuthFormStmt = this.db.prepare(`
      INSERT INTO auth_forms (id, name, type, config, target_contact_type, allowed_contact_types, redirect_url, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    this.updateAuthFormStmt = this.db.prepare(`
      UPDATE auth_forms 
      SET name = ?, type = ?, config = ?, target_contact_type = ?, allowed_contact_types = ?, redirect_url = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    this.deleteAuthFormStmt = this.db.prepare('DELETE FROM auth_forms WHERE id = ?');
  }

  // Project methods
  getProject() {
    const project = this.getProjectStmt.get('default');
    if (project) {
      // Parse users_config JSON string to object
      if (project.users_config) {
        try {
          project.usersConfig = JSON.parse(project.users_config);
        } catch (e) {
          console.error('Failed to parse users_config:', e);
          project.usersConfig = null;
        }
      } else {
        project.usersConfig = null;
      }
    }
    return project;
  }

  updateProject(updates) {
    const current = this.getProject();
    const { name, description, supabase_url, supabase_anon_key, supabase_service_key_encrypted, users_config } = { ...current, ...updates };
    this.updateProjectStmt.run(name, description, supabase_url, supabase_anon_key, supabase_service_key_encrypted, users_config, 'default');
    return this.getProject();
  }

  // Project-level service key methods
  updateProjectServiceKey(encryptedServiceKey) {
    console.log('🔐 DatabaseManager: Storing service key at PROJECT level');
    this.updateProjectServiceKeyStmt.run(encryptedServiceKey, 'default');

    // Verify storage immediately
    const stored = this.getProjectServiceKey();
    console.log('🔐 DatabaseManager: Service key storage verification:', !!stored);
    return stored;
  }

  getProjectServiceKey() {
    const result = this.getProjectServiceKeyStmt.get('default');
    return result?.supabase_service_key_encrypted || null;
  }

  // Pages methods
  getAllPages(includeDeleted = false) {
    const stmt = includeDeleted ? this.getAllPagesWithDeletedStmt : this.getAllPagesStmt;
    return stmt.all().map(page => ({
      ...page,
      layoutData: page.layout_data ? JSON.parse(page.layout_data) : { content: [], root: {} },
      seoData: page.seo_data ? JSON.parse(page.seo_data) : {},
      isPublic: Boolean(page.is_public),
      isHomepage: Boolean(page.is_homepage),
      deletedAt: page.deleted_at || null
    }));
  }

  getPage(id) {
    const page = this.getPageStmt.get(id);
    if (!page) return null;
    return {
      ...page,
      layoutData: page.layout_data ? JSON.parse(page.layout_data) : { content: [], root: {} },
      seoData: page.seo_data ? JSON.parse(page.seo_data) : {},
      isPublic: Boolean(page.is_public),
      isHomepage: Boolean(page.is_homepage)
    };
  }

  getPageBySlug(slug) {
    const page = this.getPageBySlugStmt.get(slug);
    if (!page) return null;
    return {
      ...page,
      layoutData: page.layout_data ? JSON.parse(page.layout_data) : { content: [], root: {} },
      seoData: page.seo_data ? JSON.parse(page.seo_data) : {},
      isPublic: Boolean(page.is_public),
      isHomepage: Boolean(page.is_homepage)
    };
  }

  getPublicPages() {
    return this.getPublicPagesStmt.all().map(page => ({
      ...page,
      layoutData: page.layout_data ? JSON.parse(page.layout_data) : { content: [], root: {} },
      seoData: page.seo_data ? JSON.parse(page.seo_data) : {},
      isPublic: Boolean(page.is_public),
      isHomepage: Boolean(page.is_homepage)
    }));
  }

  createPage(pageData) {
    const {
      id, name, slug, title, description, keywords,
      isPublic = true, isHomepage = false,
      layoutData = { content: [], root: {} },
      seoData = {}
    } = pageData;

    this.createPageStmt.run(
      id, name, slug, title, description, keywords,
      isPublic ? 1 : 0, isHomepage ? 1 : 0,
      JSON.stringify(layoutData),
      JSON.stringify(seoData)
    );

    return this.getPage(id);
  }

  updatePage(id, updates) {
    const current = this.getPage(id);
    if (!current) return null;
    // Handle soft delete via deletedAt
    // Ensure we don't accidentally trigger a soft delete or restore via update
    // All delete/restore operations should go through their dedicated API endpoints
    if ('deletedAt' in updates) {
      delete updates.deletedAt;
    }
    // Handle potential snake_case from client
    if (updates.layout_data && !updates.layoutData) {
      console.log('⚠️ Normalizing layout_data (snake_case) to layoutData (camelCase)');
      updates.layoutData = updates.layout_data;
    }

    const {
      name, slug, title, description, keywords,
      isPublic, isHomepage, layoutData, seoData
    } = { ...current, ...updates };

    // Log what we are about to save for layoutData
    if (layoutData) {
      const contentSize = layoutData.content ? layoutData.content.length : 0;
      console.log(`💾 Saving page ${id} with ${contentSize} components`);
    } else {
      console.log(`⚠️ Saving page ${id} WITHOUT layoutData update (preserving existing)`);
    }

    this.updatePageStmt.run(
      name, slug, title, description, keywords,
      isPublic ? 1 : 0, isHomepage ? 1 : 0,
      JSON.stringify(layoutData),
      JSON.stringify(seoData),
      id
    );

    return this.getPage(id);
  }

  deletePage(id) {
    const result = this.deletePageStmt.run(id);
    return result.changes > 0;
  }

  // Variables methods
  getAllVariables() {
    return this.getAllVariablesStmt.all();
  }

  getVariable(id) {
    return this.getVariableStmt.get(id);
  }

  createVariable(variableData) {
    const { id, name, type, value, formula, description } = variableData;
    this.createVariableStmt.run(id, name, type, value, formula, description);
    return this.getVariable(id);
  }

  updateVariable(id, updates) {
    const current = this.getVariable(id);
    if (!current) return null;

    const { name, type, value, formula, description } = { ...current, ...updates };
    this.updateVariableStmt.run(name, type, value, formula, description, id);
    return this.getVariable(id);
  }

  deleteVariable(id) {
    const result = this.deleteVariableStmt.run(id);
    return result.changes > 0;
  }

  // Assets methods
  getAllAssets() {
    return this.getAllAssetsStmt.all();
  }

  getAsset(id) {
    return this.getAssetStmt.get(id);
  }

  createAsset(assetData) {
    const { id, filename, original_name, mime_type, size, file_path } = assetData;
    this.createAssetStmt.run(id, filename, original_name, mime_type, size, file_path);
    return this.getAsset(id);
  }

  deleteAsset(id) {
    const result = this.deleteAssetStmt.run(id);
    return result.changes > 0;
  }

  // User settings methods
  getUserSettings(userId) {
    const userSettings = this.getUserSettingsStmt.get(userId);
    if (!userSettings) return {};

    const result = {
      supabase_url: userSettings.supabase_url,
      supabase_anon_key: userSettings.supabase_anon_key,
    };

    // Parse additional settings from JSON
    if (userSettings.settings_data) {
      try {
        const additionalSettings = JSON.parse(userSettings.settings_data);
        Object.assign(result, additionalSettings);
      } catch (error) {
        console.error('Error parsing settings_data:', error);
      }
    }

    return result;
  }

  updateUserSettings(userId, settings) {
    const { supabase_url, supabase_anon_key, ...otherSettings } = settings;
    const settingsData = Object.keys(otherSettings).length > 0 ? JSON.stringify(otherSettings) : null;

    const current = this.getUserSettingsStmt.get(userId);
    if (current) {
      this.updateUserSettingsStmt.run(supabase_url, supabase_anon_key, settingsData, userId);
    } else {
      const { v4: uuidv4 } = require('uuid');
      this.createUserSettingsStmt.run(uuidv4(), userId, supabase_url, supabase_anon_key, settingsData);
    }
  }

  updateUserSetting(userId, key, value) {
    const current = this.getUserSettings(userId);
    const updated = { ...current, [key]: value };
    this.updateUserSettings(userId, updated);
  }

  // RLS Policy Metadata methods
  getRLSMetadata(tableName, policyName) {
    const metadata = this.getRLSMetadataStmt.get(tableName, policyName);
    if (!metadata) return null;
    return {
      ...metadata,
      formData: metadata.form_data ? JSON.parse(metadata.form_data) : null
    };
  }

  getAllRLSMetadata() {
    return this.getAllRLSMetadataStmt.all().map(m => ({
      ...m,
      formData: m.form_data ? JSON.parse(m.form_data) : null
    }));
  }

  createRLSMetadata(tableName, policyName, formData, generatedUsing, generatedCheck, sqlHash) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    this.createRLSMetadataStmt.run(
      id,
      tableName,
      policyName,
      JSON.stringify(formData),
      generatedUsing,
      generatedCheck,
      sqlHash
    );
    return this.getRLSMetadata(tableName, policyName);
  }

  updateRLSMetadata(tableName, oldPolicyName, newPolicyName, formData, generatedUsing, generatedCheck, sqlHash) {
    this.updateRLSMetadataStmt.run(
      newPolicyName,
      JSON.stringify(formData),
      generatedUsing,
      generatedCheck,
      sqlHash,
      tableName,
      oldPolicyName
    );
    return this.getRLSMetadata(tableName, newPolicyName);
  }

  deleteRLSMetadata(tableName, policyName) {
    const result = this.deleteRLSMetadataStmt.run(tableName, policyName);
    return result.changes > 0;
  }

  // Auth Forms methods
  getAllAuthForms() {
    return this.getAllAuthFormsStmt.all().map(f => ({
      ...f,
      config: JSON.parse(f.config),
      allowedContactTypes: f.allowed_contact_types ? JSON.parse(f.allowed_contact_types) : [],
      isActive: Boolean(f.is_active)
    }));
  }

  getAuthForm(id) {
    const form = this.getAuthFormStmt.get(id);
    if (!form) return null;
    return {
      ...form,
      config: JSON.parse(form.config),
      allowedContactTypes: form.allowed_contact_types ? JSON.parse(form.allowed_contact_types) : [],
      isActive: Boolean(form.is_active)
    };
  }

  createAuthForm(formData) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const { name, type, config = {}, targetContactType, allowedContactTypes = [], redirectUrl, isActive = true } = formData;

    this.createAuthFormStmt.run(
      id,
      name,
      type,
      JSON.stringify(config),
      targetContactType,
      JSON.stringify(allowedContactTypes),
      redirectUrl,
      isActive ? 1 : 0
    );

    return this.getAuthForm(id);
  }

  updateAuthForm(id, updates) {
    const current = this.getAuthForm(id);
    if (!current) return null;

    // Merge updates
    const {
      name, type, config, target_contact_type, allowed_contact_types, redirect_url, is_active
    } = {
      ...current, ...updates,
      // Handle mixed camelCase/snake_case inputs by preferring updates
      target_contact_type: updates.targetContactType !== undefined ? updates.targetContactType : current.target_contact_type,
      allowed_contact_types: updates.allowedContactTypes !== undefined ? JSON.stringify(updates.allowedContactTypes) : (current.allowedContactTypes ? JSON.stringify(current.allowedContactTypes) : '[]'),
      redirect_url: updates.redirectUrl !== undefined ? updates.redirectUrl : current.redirect_url,
      is_active: updates.isActive !== undefined ? updates.isActive : current.is_active
    };

    // If config is object, stringify it
    const configStr = typeof config === 'object' ? JSON.stringify(config) : config;

    this.updateAuthFormStmt.run(
      name,
      type,
      configStr,
      target_contact_type,
      allowed_contact_types,
      redirect_url,
      is_active ? 1 : 0,
      id
    );

    return this.getAuthForm(id);
  }

  deleteAuthForm(id) {
    const result = this.deleteAuthFormStmt.run(id);
    return result.changes > 0;
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
