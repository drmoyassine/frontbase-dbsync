const Database = require('better-sqlite3');
const path = require('path');

class DatabaseManager {
  constructor() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/frontbase.db');
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    
    // Prepare statements for better performance
    this.prepareStatements();
  }
  
  prepareStatements() {
    // Project statements
    this.getProjectStmt = this.db.prepare('SELECT * FROM project WHERE id = ?');
    this.updateProjectStmt = this.db.prepare(`
      UPDATE project 
      SET name = ?, description = ?, supabase_url = ?, supabase_anon_key = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    
    // Pages statements
    this.getAllPagesStmt = this.db.prepare('SELECT * FROM pages ORDER BY created_at DESC');
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
  }
  
  // Project methods
  getProject() {
    return this.getProjectStmt.get('default');
  }
  
  updateProject(updates) {
    const current = this.getProject();
    const { name, description, supabase_url, supabase_anon_key } = { ...current, ...updates };
    this.updateProjectStmt.run(name, description, supabase_url, supabase_anon_key, 'default');
    return this.getProject();
  }
  
  // Pages methods
  getAllPages() {
    return this.getAllPagesStmt.all().map(page => ({
      ...page,
      layoutData: page.layout_data ? JSON.parse(page.layout_data) : { content: [], root: {} },
      seoData: page.seo_data ? JSON.parse(page.seo_data) : {},
      isPublic: Boolean(page.is_public),
      isHomepage: Boolean(page.is_homepage)
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
    
    const {
      name, slug, title, description, keywords,
      isPublic, isHomepage, layoutData, seoData
    } = { ...current, ...updates };
    
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
  
  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;