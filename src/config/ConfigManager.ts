import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

interface Config {
  ai: {
    defaultModel: 'local' | 'cloud';
    local: {
      endpoint: string;
      model?: string;
      contextWindow?: number;
    };
    openrouter: {
      key?: string;
      model?: string;
    };
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
}

export class ConfigManager {
  private configPath: string;
  private config: Config;
  private defaultConfig: Config = {
    ai: {
      defaultModel: 'local',
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
    templates: {}
  };

  constructor() {
    const configDir = join(homedir(), '.gems');
    this.configPath = join(configDir, 'config.json');
    
    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
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