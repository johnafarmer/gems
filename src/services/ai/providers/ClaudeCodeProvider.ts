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
      const output = await this.executeClaudeCode(prompt, options.model);
      const componentCode = this.parseClaudeOutput(output);
      
      return {
        content: componentCode,
        source: {
          type: 'claude-code' as const,
          model: `claude-${options.model}`,
          endpoint: 'local'
        }
      };
    } catch (error) {
      throw new Error(`Claude Code generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildClaudePrompt(options: Omit<GenerateOptions, 'model'>): string {
    // Add specific instructions for Claude Code to ensure clean output
    return `${options.prompt}

CRITICAL: Your response must follow these exact rules:
1. Output ONLY the JavaScript code for the web component
2. Do NOT include ANY explanations, descriptions, or commentary
3. Start your response with exactly: \`\`\`javascript
4. End your response with exactly: \`\`\`
5. The code must be a complete, working web component
6. Include customElements.define() at the end
7. No text before the opening code block
8. No text after the closing code block`;
  }

  private async executeClaudeCode(prompt: string, model: 'sonnet-4' | 'opus-4'): Promise<string> {
    return new Promise((resolve, reject) => {
      const modelFlag = model === 'opus-4' ? '--model opus-4' : ''; // Sonnet is default
      const args = ['-p', prompt, '--dangerously-skip-permissions'];
      
      if (modelFlag) {
        args.push('--model', 'opus-4');
      }

      const claude = spawn('claude', args, {
        shell: true,
        timeout: this.timeout
      });

      let output = '';
      let error = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        error += data.toString();
      });

      claude.on('error', (err) => {
        if (err.message.includes('ENOENT')) {
          reject(new Error('Claude Code CLI not found. Please ensure Claude Code is installed and available in your PATH.'));
        } else {
          reject(err);
        }
      });

      claude.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          // Check for common error patterns
          if (error.includes('authentication') || error.includes('unauthorized')) {
            reject(new Error('Claude Code authentication failed. Please ensure you are logged in to Claude Code.'));
          } else if (error.includes('rate limit')) {
            reject(new Error('Claude Code rate limit exceeded. Please try again later.'));
          } else {
            reject(new Error(`Claude Code exited with code ${code}: ${error || output}`));
          }
        }
      });

      // Handle timeout
      setTimeout(() => {
        claude.kill();
        reject(new Error(`Claude Code execution timed out after ${this.timeout}ms`));
      }, this.timeout);
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
      const claude = spawn('claude', ['--version'], {
        shell: true,
        timeout: 5000
      });

      return new Promise((resolve) => {
        claude.on('error', () => resolve(false));
        claude.on('close', (code) => resolve(code === 0));
        
        // Timeout fallback
        setTimeout(() => {
          claude.kill();
          resolve(false);
        }, 5000);
      });
    } catch {
      return false;
    }
  }
}