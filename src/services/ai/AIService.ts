import { ConfigManager } from '../../config/ConfigManager.js';
import OpenAI from 'openai';
import { ClaudeCodeProvider } from './providers/ClaudeCodeProvider.js';

export interface GenerateOptions {
  prompt: string;
  model?: 'claude-code' | 'local' | 'cloud';
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResult {
  content: string;
  source: {
    type: 'claude-code' | 'local' | 'network' | 'cloud' | 'template';
    endpoint?: string;
    model?: string;
  };
}

export class AIService {
  private config: ConfigManager;
  private openai?: OpenAI;
  private claudeCodeProvider?: ClaudeCodeProvider;

  constructor(config: ConfigManager) {
    this.config = config;
    this.initializeClients();
    this.claudeCodeProvider = new ClaudeCodeProvider(this.config.get('ai.claudeCode.timeout'));
  }

  private initializeClients(): void {
    const openRouterKey = this.config.get('ai.openrouter.key');
    console.log('AIService initialization:', {
      hasKey: !!openRouterKey,
      keyLength: openRouterKey ? openRouterKey.length : 0,
      defaultModel: this.config.get('ai.defaultModel')
    });
    
    if (openRouterKey) {
      this.openai = new OpenAI({
        apiKey: openRouterKey,
        baseURL: 'https://openrouter.ai/api/v1'
      });
      console.log('OpenAI client initialized for OpenRouter');
    } else {
      console.log('No OpenRouter key found, OpenAI client not initialized');
    }
  }

  async generate(options: GenerateOptions): Promise<string> {
    const result = await this.generateWithSource(options);
    return result.content;
  }

  async generateWithSource(options: GenerateOptions): Promise<GenerateResult> {
    const model = options.model || this.config.get('ai.defaultModel');
    
    if (model === 'claude-code') {
      return this.generateClaudeCode(options);
    } else if (model === 'local') {
      return this.generateLocal(options);
    } else {
      return this.generateCloud(options);
    }
  }

  private async generateClaudeCode(options: GenerateOptions): Promise<GenerateResult> {
    if (!this.claudeCodeProvider) {
      console.warn('Claude Code provider not initialized, falling back to local');
      return this.generateLocal(options);
    }

    const claudeModel = this.config.get('ai.claudeCode.model') || 'sonnet-4';
    
    try {
      // Check if Claude Code is available
      const isAvailable = await this.claudeCodeProvider.isAvailable();
      if (!isAvailable) {
        console.warn('Claude Code CLI not available, falling back to local model');
        return this.generateLocal(options);
      }

      return await this.claudeCodeProvider.generate({
        ...options,
        model: claudeModel
      });
    } catch (error) {
      console.warn('Claude Code generation failed:', error instanceof Error ? error.message : String(error));
      
      // If it's an auth error, fall back to cloud instead of local
      if (error instanceof Error && error.message.includes('authentication')) {
        console.log('Falling back to cloud model due to authentication issue');
        return this.generateCloud(options);
      }
      
      // For other errors, fall back to local
      return this.generateLocal(options);
    }
  }

  private async generateLocal(options: GenerateOptions): Promise<GenerateResult> {
    const endpoint = this.config.get('ai.local.endpoint');
    const localModel = this.config.get('ai.local.model') || 'mistralai/devstral-small-2505';
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 minute timeout for network models
      
      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: localModel,
          messages: [
            {
              role: 'system',
              content: 'You are an expert web component developer specializing in creating accessible, performant WordPress components.'
            },
            {
              role: 'user',
              content: options.prompt
            }
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 4000
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Local AI request failed: ${response.statusText}`);
      }

      const data = await response.json() as any;
      
      // Determine if it's local or network based on endpoint
      const isNetwork = !endpoint.includes('localhost') && !endpoint.includes('127.0.0.1');
      
      return {
        content: data.choices[0].message.content,
        source: {
          type: isNetwork ? 'network' : 'local',
          endpoint: endpoint,
          model: localModel
        }
      };
      
    } catch (error) {
      console.warn('Local AI generation failed, falling back to cloud:', error instanceof Error ? error.message : String(error));
      return this.generateCloud(options);
    }
  }

  private async generateCloud(options: GenerateOptions): Promise<GenerateResult> {
    console.log('generateCloud called:', {
      hasOpenAI: !!this.openai,
      openRouterKey: !!this.config.get('ai.openrouter.key'),
      defaultModel: this.config.get('ai.defaultModel')
    });
    
    if (!this.openai) {
      // Fallback to template-based generation when no AI is available
      console.warn('No AI service configured. Using template-based generation.');
      return this.generateFromTemplate(options);
    }

    const cloudModel = this.config.get('ai.openrouter.model') || 'meta-llama/llama-3.2-3b-instruct:free';

    try {
      // Enhanced prompt for cloud models to ensure code-only output
      const enhancedPrompt = `${options.prompt}

CRITICAL INSTRUCTIONS:
1. Output ONLY the JavaScript code inside a code block
2. Do NOT include ANY explanatory text before or after the code
3. Start your response with \`\`\`javascript
4. End your response with \`\`\`
5. The code must be a complete, working web component
6. Include customElements.define() at the end`;

      const completion = await this.openai.chat.completions.create({
        model: cloudModel,
        messages: [
          {
            role: 'system',
            content: 'You are a code generation AI. You output ONLY code without any explanations, descriptions, or commentary. When asked to generate a web component, you respond with ONLY the JavaScript code inside a markdown code block. Never include text outside the code block.'
          },
          {
            role: 'user',
            content: enhancedPrompt
          }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4000
      });

      return {
        content: completion.choices[0].message.content || '',
        source: {
          type: 'cloud',
          endpoint: 'OpenRouter',
          model: cloudModel
        }
      };
    } catch (error) {
      console.warn('Cloud AI generation failed:', error instanceof Error ? error.message : String(error));
      return this.generateFromTemplate(options);
    }
  }
  
  private generateFromTemplate(options: GenerateOptions): GenerateResult {
    // Extract component type from prompt
    const typeMatch = options.prompt.match(/generate a (\w+)/i);
    const componentType = typeMatch ? typeMatch[1] : 'component';
    
    // Basic template-based response
    const content = `\`\`\`javascript
class ${this.toPascalCase(componentType)}Element extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  connectedCallback() {
    this.render();
  }
  
  render() {
    this.shadowRoot.innerHTML = \`
      <style>
        :host {
          display: block;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .container {
          padding: 3rem 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-align: center;
          border-radius: 8px;
        }
        h1 {
          font-size: 3rem;
          margin: 0 0 1rem 0;
          font-weight: 700;
        }
        p {
          font-size: 1.25rem;
          margin: 0 0 2rem 0;
          opacity: 0.9;
        }
        .cta {
          display: inline-block;
          padding: 1rem 2rem;
          background: white;
          color: #667eea;
          text-decoration: none;
          border-radius: 4px;
          font-weight: 600;
          transition: transform 0.2s;
        }
        .cta:hover {
          transform: translateY(-2px);
        }
      </style>
      <div class="container">
        <h1>Welcome to Your Site</h1>
        <p>This is a generated ${componentType} component</p>
        <a href="#" class="cta">Get Started</a>
      </div>
    \`;
  }
}

customElements.define('${componentType}-element', ${this.toPascalCase(componentType)}Element);
\`\`\``;
    
    return {
      content,
      source: {
        type: 'template',
        model: 'Built-in Template'
      }
    };
  }
  
  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  async isLocalAvailable(): Promise<boolean> {
    const endpoint = this.config.get('ai.local.endpoint');
    
    try {
      const response = await fetch(`${endpoint}/v1/models`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    if (!this.claudeCodeProvider) {
      return false;
    }
    return this.claudeCodeProvider.isAvailable();
  }
}