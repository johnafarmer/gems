import { spawn } from 'child_process';
import type { GenerateOptions, GenerateResult } from '../AIService.js';

export class ClaudeCodeProvider {
  private timeout: number;

  constructor(timeout: number = 60000) {
    this.timeout = timeout;
  }

  async generate(options: Omit<GenerateOptions, 'model'> & { model: 'sonnet-4' | 'opus-4' }): Promise<GenerateResult> {
    const prompt = this.buildClaudePrompt(options);
    
    try {
      console.log('🤖 Calling Claude Code with model:', options.model);
      const output = await this.executeClaudeCode(prompt, options.model);
      console.log('✅ Claude Code response received, length:', output.length);
      
      const componentCode = this.parseClaudeOutput(output);
      console.log('🎯 Parsed component code, length:', componentCode.length);
      
      return {
        content: componentCode,
        source: {
          type: 'claude-code' as const,
          model: `claude-${options.model}`,
          endpoint: 'local'
        }
      };
    } catch (error) {
      console.error('❌ Claude Code error:', error);
      throw new Error(`Claude Code generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildClaudePrompt(options: Omit<GenerateOptions, 'model'>): string {
    // Give Claude Code the full GEMS context
    return `You are helping generate web components for GEMS (Generative Element Management System).

CONTEXT: GEMS is a tool for creating web components for WordPress sites. Components should:
- Use Shadow DOM for encapsulation
- Be self-contained with all styles included
- Be accessible and responsive
- Work well in WordPress environments

USER REQUEST: ${options.prompt}

RESPONSE FORMAT: You must output ONLY a code block containing the complete web component JavaScript code.

Example structure:
\`\`\`javascript
class ComponentName extends HTMLElement {
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
        /* All styles here */
      </style>
      <div class="container">
        <!-- HTML structure -->
      </div>
    \`;
  }
}

customElements.define('component-name', ComponentName);
\`\`\`

Remember: Output ONLY the code block, no explanations.`;
  }

  private async executeClaudeCode(prompt: string, model: 'sonnet-4' | 'opus-4'): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = ['--dangerously-skip-permissions', '--print'];
      
      if (model === 'opus-4') {
        args.push('--model', 'opus');
      } else if (model === 'sonnet-4') {
        args.push('--model', 'sonnet');
      }

      console.log('📝 Executing Claude Code command...');
      console.log('Model:', model);
      console.log('Working directory:', process.cwd());
      
      const claude = spawn('claude', args, {
        shell: false, // Don't use shell to avoid escaping issues
        cwd: process.cwd() // Ensure we're in the GEMS directory
      });

      // Write the prompt to stdin
      claude.stdin.write(prompt);
      claude.stdin.end();

      let output = '';
      let error = '';
      let completed = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          claude.kill();
          reject(new Error(`Claude Code execution timed out after ${this.timeout}ms`));
        }
      }, this.timeout);

      claude.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        console.log('📤 Claude output chunk:', chunk.substring(0, 100) + (chunk.length > 100 ? '...' : ''));
      });

      claude.stderr.on('data', (data) => {
        const chunk = data.toString();
        error += chunk;
        console.log('⚠️ Claude error chunk:', chunk);
      });

      claude.on('error', (err) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          if (err.message.includes('ENOENT')) {
            reject(new Error('Claude Code CLI not found. Please ensure Claude Code is installed and available in your PATH.'));
          } else {
            reject(err);
          }
        }
      });

      claude.on('close', (code) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          if (code === 0) {
            console.log('✅ Claude Code completed successfully');
            resolve(output);
          } else {
            console.error('❌ Claude Code failed with exit code:', code);
            console.error('Error output:', error);
            console.error('Standard output:', output);
            
            // Check for common error patterns
            if (error.includes('authentication') || error.includes('unauthorized')) {
              reject(new Error('Claude Code authentication failed. Please ensure you are logged in to Claude Code.'));
            } else if (error.includes('rate limit')) {
              reject(new Error('Claude Code rate limit exceeded. Please try again later.'));
            } else {
              reject(new Error(`Claude Code exited with code ${code}: ${error || output}`));
            }
          }
        }
      });
    });
  }

  private parseClaudeOutput(output: string): string {
    // First try to extract code from markdown code blocks
    const codeBlockRegex = /```(?:javascript|js|jsx|typescript|ts)?\s*([\s\S]*?)```/g;
    const matches = [...output.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      // Get the first JavaScript code block
      return matches[0][1].trim();
    }
    
    // If no code blocks found, check if the output is already clean code
    const cleanedOutput = output.trim();
    
    // Check if it looks like a web component
    if (cleanedOutput.includes('class') && 
        cleanedOutput.includes('extends HTMLElement') && 
        cleanedOutput.includes('customElements.define')) {
      return cleanedOutput;
    }
    
    // Last resort - try to extract component pattern
    const classMatch = output.match(/class\s+\w+\s+extends\s+HTMLElement[\s\S]*?customElements\.define\([^)]+\);?/);
    if (classMatch) {
      return classMatch[0];
    }
    
    throw new Error('Could not parse valid web component code from Claude Code output');
  }

  async isAvailable(): Promise<boolean> {
    try {
      console.log('🔍 Checking Claude Code availability...');
      const claude = spawn('claude', ['--version'], {
        shell: true
      });

      return new Promise((resolve) => {
        let resolved = false;
        
        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            claude.kill();
          }
        };

        const timeoutId = setTimeout(() => {
          console.log('⏱️ Claude Code availability check timed out');
          cleanup();
          resolve(false);
        }, 3000);

        claude.on('error', (err) => {
          console.log('❌ Claude Code not found:', err.message);
          clearTimeout(timeoutId);
          cleanup();
          resolve(false);
        });
        
        claude.on('close', (code) => {
          clearTimeout(timeoutId);
          cleanup();
          const available = code === 0;
          console.log(available ? '✅ Claude Code is available' : '❌ Claude Code check failed with code:', code);
          resolve(available);
        });
      });
    } catch (err) {
      console.error('❌ Error checking Claude Code:', err);
      return false;
    }
  }
}