import { homedir } from 'os';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

interface Config {
  ai: {
    defaultModel: 'claude-code' | 'local' | 'cloud';
    claudeCode: {
      model: 'sonnet-4' | 'opus-4';
      timeout?: number;
    };
    local: {
      endpoint: string;
      model?: string;
      contextWindow?: number;
    };
    openrouter: {
      key?: string;
      model?: string;
    };
    customModels?: Array<{ id: string; name: string }>;
  };
  output: {
    format: 'webcomponent' | 'react' | 'vue' | 'vanilla';
    directory: string;
  };
  preview: {
    port: number;
    autoOpen: boolean;
  };
  templates: {
    customPath?: string;
  };
  styles: {
    enabled: boolean;
    activePreset?: string;
  };
}

export class ConfigManager {
  private configPath: string;
  private config: Config;
  private defaultConfig: Config = {
    ai: {
      defaultModel: 'claude-code',
      claudeCode: {
        model: 'sonnet-4',
        timeout: 300000  // 5 minutes default
      },
      local: {
        endpoint: 'http://10.0.0.237:1234',
        model: 'mistralai/devstral-small-2505',
        contextWindow: 56000
      },
      openrouter: {}
    },
    output: {
      format: 'webcomponent',
      directory: './generated'
    },
    preview: {
      port: 3000,
      autoOpen: true
    },
    templates: {},
    styles: {
      enabled: false,
      activePreset: undefined
    }
  };

  constructor() {
    // Get the project root directory (where package.json is)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectRoot = resolve(__dirname, '../..');
    
    // Load environment variables from project root (only if not already loaded)
    if (!process.env.GEMS_ENV_LOADED) {
      // Suppress dotenv logging
      const originalLog = console.log;
      console.log = () => {};
      
      dotenvConfig({ path: join(projectRoot, '.env') });
      dotenvConfig({ path: join(projectRoot, '.env.local'), override: true });
      
      // Restore console.log
      console.log = originalLog;
      
      // Mark as loaded to prevent multiple loads
      process.env.GEMS_ENV_LOADED = 'true';
    }
    
    const configDir = join(homedir(), '.gems');
    this.configPath = join(configDir, 'config.json');
    
    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    // Initialize with default config
    this.config = this.defaultConfig;
    
    // Load config
    this.load();
  }

  private load(): void {
    if (existsSync(this.configPath)) {
      try {
        const data = readFileSync(this.configPath, 'utf-8');
        this.config = { ...this.defaultConfig, ...JSON.parse(data) };
      } catch (error) {
        console.warn('Failed to load config, using defaults');
        this.config = this.defaultConfig;
      }
    } else {
      this.config = this.defaultConfig;
      this.save();
    }
    
    // Override with environment variables
    if (process.env.OPENROUTER_API_KEY) {
      this.config.ai.openrouter.key = process.env.OPENROUTER_API_KEY;
      
      // If OpenRouter is available and no model is set, default to Claude Sonnet 4
      if (!this.config.ai.openrouter.model) {
        this.config.ai.openrouter.model = 'anthropic/claude-sonnet-4';
      }
      
      // Don't override user's explicit model choice
      // Since we now default to cloud, only override if there's no saved config
    }
    
    if (process.env.LM_STUDIO_ENDPOINT) {
      this.config.ai.local.endpoint = process.env.LM_STUDIO_ENDPOINT;
    }
    
    if (process.env.LM_STUDIO_NETWORK_ENDPOINT) {
      // Add network endpoint as a fallback option
      this.config.ai.local.endpoint = process.env.LM_STUDIO_NETWORK_ENDPOINT;
    }
  }

  private save(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  get(key: string): any {
    const keys = key.split('.');
    let value: any = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set(key: string, value: any): void {
    const keys = key.split('.');
    let obj: any = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj) || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  getAll(): Config {
    return this.config;
  }

  reset(): void {
    this.config = this.defaultConfig;
    this.save();
  }
}