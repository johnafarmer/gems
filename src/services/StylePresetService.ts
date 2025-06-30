import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { ConfigManager } from '../config/ConfigManager.js';

export interface StylePreset {
  filename: string;
  name: string;
  description?: string;
  created: Date;
  modified: Date;
}

export class StylePresetService {
  private stylesDir: string;
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.stylesDir = join(process.cwd(), 'styles');
  }

  /**
   * List all available style presets
   */
  async listStyles(): Promise<StylePreset[]> {
    if (!existsSync(this.stylesDir)) {
      return [];
    }

    const files = readdirSync(this.stylesDir)
      .filter(f => f.endsWith('.md') && f !== 'STYLE_TEMPLATE.md');

    return files.map(filename => {
      const filepath = join(this.stylesDir, filename);
      const stats = statSync(filepath);
      const content = readFileSync(filepath, 'utf-8');
      
      // Extract name from first heading
      const nameMatch = content.match(/^#\s+(.+)$/m);
      const name = nameMatch ? nameMatch[1].trim() : filename.replace('.md', '');
      
      // Extract description from first paragraph after heading
      const descMatch = content.match(/^#\s+.+\n\n(.+)$/m);
      const description = descMatch ? descMatch[1].trim() : undefined;

      return {
        filename,
        name,
        description,
        created: stats.birthtime,
        modified: stats.mtime
      };
    }).sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  /**
   * Get content of a specific style preset
   */
  async getStyleContent(filename: string): Promise<string | null> {
    const filepath = join(this.stylesDir, filename);
    
    if (!existsSync(filepath)) {
      return null;
    }

    return readFileSync(filepath, 'utf-8');
  }

  /**
   * Get the currently active style content
   */
  async getActiveStyleContent(): Promise<string | null> {
    const stylesConfig = this.configManager.get('styles');
    
    if (!stylesConfig?.enabled || !stylesConfig?.activePreset) {
      return null;
    }

    return this.getStyleContent(stylesConfig.activePreset);
  }

  /**
   * Create a new style preset
   */
  async createStyle(name: string, content: string): Promise<string> {
    // Sanitize filename
    const filename = this.sanitizeFilename(name) + '.md';
    const filepath = join(this.stylesDir, filename);

    // Ensure the content has a proper heading
    let finalContent = content.trim();
    if (!finalContent.startsWith('#')) {
      finalContent = `# ${name}\n\n${finalContent}`;
    }

    writeFileSync(filepath, finalContent, 'utf-8');
    
    return filename;
  }

  /**
   * Delete a style preset
   */
  async deleteStyle(filename: string): Promise<boolean> {
    const filepath = join(this.stylesDir, filename);
    
    if (!existsSync(filepath)) {
      return false;
    }

    // Don't delete the template
    if (filename === 'STYLE_TEMPLATE.md') {
      return false;
    }

    // If this was the active style, clear it from config
    const activePreset = this.configManager.get('styles.activePreset');
    if (activePreset === filename) {
      this.configManager.set('styles.activePreset', undefined);
    }

    unlinkSync(filepath);
    return true;
  }

  /**
   * Set the active style preset
   */
  async setActiveStyle(filename: string | null): Promise<void> {
    if (filename) {
      // Verify the file exists
      const filepath = join(this.stylesDir, filename);
      if (!existsSync(filepath)) {
        throw new Error(`Style preset ${filename} not found`);
      }
    }

    this.configManager.set('styles.activePreset', filename);
  }

  /**
   * Enable or disable styles
   */
  async setStylesEnabled(enabled: boolean): Promise<void> {
    this.configManager.set('styles.enabled', enabled);
  }

  /**
   * Check if styles are enabled
   */
  isStylesEnabled(): boolean {
    return this.configManager.get('styles.enabled') || false;
  }

  /**
   * Sanitize filename to prevent directory traversal and invalid characters
   */
  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }
}