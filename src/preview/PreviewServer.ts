import { createServer, IncomingMessage, ServerResponse } from 'http';
import { join, extname } from 'path';
import { readFileSync, existsSync, readdirSync, statSync, unlinkSync, renameSync, writeFileSync, mkdirSync } from 'fs';

export interface PreviewServerOptions {
  port?: number;
  component?: string;
}

export class PreviewServer {
  private server?: ReturnType<typeof createServer>;
  
  // Helper to parse gem filename into parts
  private parseGemFilename(filename: string): { type: string; timestamp: string; version: number; gemId: string } {
    // Remove .html extension
    const name = filename.replace('.html', '');
    
    // Match pattern: type-timestamp or type-timestamp-v2
    const match = name.match(/^(.+?)-(\d+)(?:-v(\d+))?$/);
    if (!match) {
      return { type: 'unknown', timestamp: '0', version: 1, gemId: name };
    }
    
    const [, type, timestamp, versionStr] = match;
    const version = versionStr ? parseInt(versionStr) : 1;
    const gemId = `${type}-${timestamp}`;
    
    return { type, timestamp, version, gemId };
  }
  
  // Get all versions of a specific gem
  private getGemVersions(gemId: string, allFiles: string[]): string[] {
    return allFiles
      .filter(f => {
        const parsed = this.parseGemFilename(f);
        return parsed.gemId === gemId;
      })
      .sort((a, b) => {
        const versionA = this.parseGemFilename(a).version;
        const versionB = this.parseGemFilename(b).version;
        return versionA - versionB;
      });
  }
  
  async start(options: PreviewServerOptions = {}): Promise<string> {
    const port = options.port || 3000;
    
    return new Promise((resolve, reject) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const parsedUrl = new URL(req.url || '/', `http://localhost:${port}`);
        const pathname = parsedUrl.pathname;
        const component = parsedUrl.searchParams.get('component') || options.component;
        
        if (pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.getIndexHtml(component));
        } else if (pathname === '/api/rename' && req.method === 'POST') {
          // Handle rename
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              let { oldName, newName } = JSON.parse(body);
              
              // Sanitize the new name on server side as well
              const nameWithoutExt = newName.replace('.html', '');
              const parts = nameWithoutExt.split('-');
              const timestamp = parts[parts.length - 1];
              let baseName = parts.slice(0, -1).join('-');
              
              // Apply same sanitization rules
              baseName = baseName
                .toLowerCase()
                .replace(/[^a-z0-9\s-]+/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 50);
              
              // Reconstruct the filename with sanitized base and timestamp
              newName = baseName ? `${baseName}-${timestamp}.html` : `component-${timestamp}.html`;
              
              const oldHtml = join(process.cwd(), 'generated', oldName);
              const oldJs = oldHtml.replace('.html', '.js');
              const newHtml = join(process.cwd(), 'generated', newName);
              const newJs = newHtml.replace('.html', '.js');
              
              // Rename JS file first
              if (existsSync(oldJs)) renameSync(oldJs, newJs);
              
              // Update HTML file content to reference new JS file
              if (existsSync(oldHtml)) {
                let htmlContent = readFileSync(oldHtml, 'utf-8');
                const oldJsName = oldName.replace('.html', '.js');
                const newJsName = newName.replace('.html', '.js');
                htmlContent = htmlContent.replace(`src="./${oldJsName}"`, `src="./${newJsName}"`);
                writeFileSync(newHtml, htmlContent, 'utf-8');
                
                // Delete old HTML file after writing new one
                unlinkSync(oldHtml);
              }
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname === '/api/delete' && req.method === 'POST') {
          // Handle delete
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { filename } = JSON.parse(body);
              const htmlPath = join(process.cwd(), 'generated', filename);
              const jsPath = htmlPath.replace('.html', '.js');
              
              if (existsSync(htmlPath)) unlinkSync(htmlPath);
              if (existsSync(jsPath)) unlinkSync(jsPath);
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname === '/api/component-code' && req.method === 'GET') {
          // Get component code for copying
          const filename = parsedUrl.searchParams.get('file');
          if (filename) {
            try {
              const jsPath = join(process.cwd(), 'generated', filename.replace('.html', '.js'));
              
              // Check if the file exists
              if (!existsSync(jsPath)) {
                throw new Error(`JavaScript file not found: ${filename.replace('.html', '.js')}`);
              }
              
              const jsContent = readFileSync(jsPath, 'utf-8');
              
              // Extract element name from the customElements.define call
              const elementNameMatch = jsContent.match(/customElements\.define\(['"]([^'"]+)['"]/);
              const elementName = elementNameMatch ? elementNameMatch[1] : 'unknown-element';
              
              // Minify the JS code (improved minification)
              const minified = jsContent
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
                .replace(/\/\/.*$/gm, '') // Remove line comments
                .replace(/\n\s*/g, ' ') // Replace newlines and indentation with single space
                .replace(/\s+/g, ' ') // Collapse multiple spaces
                .replace(/\s*([{}:;,=<>+\-*\/!])\s*/g, '$1') // Remove spaces around operators
                .replace(/;\s*}/g, '}') // Remove unnecessary semicolons before closing braces
                .trim();
              
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                elementName,
                code: jsContent,
                minified
              }));
            } catch (error) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Component not found' }));
            }
          }
        } else if (pathname === '/api/create-shard' && req.method === 'POST') {
          // Create a new version of a component
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { gemId, prompt } = JSON.parse(body);
              
              // Parse the gem ID to get type and timestamp
              const parsed = this.parseGemFilename(gemId + '.html');
              
              // Find all versions of this gem
              const generatedDir = join(process.cwd(), 'generated');
              const allFiles = readdirSync(generatedDir).filter(f => f.endsWith('.html'));
              const versions = this.getGemVersions(parsed.gemId, allFiles);
              
              // Determine the source file and next version number
              let sourceFile: string;
              let nextVersion: number;
              
              if (versions.length === 0) {
                // No versions exist yet, use the original file
                sourceFile = `${parsed.gemId}.html`;
                nextVersion = 2; // First shard is v2
              } else {
                // Use the most recent version
                sourceFile = versions[versions.length - 1];
                const lastVersion = this.parseGemFilename(sourceFile).version;
                nextVersion = lastVersion + 1;
              }
              
              // Read the original component code
              const originalHtmlPath = join(generatedDir, sourceFile);
              const originalJsPath = originalHtmlPath.replace('.html', '.js');
              
              // Check if files exist
              if (!existsSync(originalHtmlPath) || !existsSync(originalJsPath)) {
                throw new Error(`Source files not found for ${parsed.gemId}`);
              }
              
              const originalJs = readFileSync(originalJsPath, 'utf-8');
              
              // Use AI service to generate modified version
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { AIService } = await import('../services/ai/AIService.js');
              const { StylePresetService } = await import('../services/StylePresetService.js');
              const config = new ConfigManager();
              const aiService = new AIService(config);
              const styleService = new StylePresetService(config);
              
              // Get active style content if styles are enabled
              const styleContent = await styleService.getActiveStyleContent();
              
              // Create AI prompt for modification
              let modificationPrompt = `Given this existing web component code, modify it according to this request: "${prompt}"
              
              Original component code:
              ${originalJs}`;
              
              // Include style guidelines if available
              if (styleContent) {
                modificationPrompt += `
              
              Style Guidelines to follow:
              \`\`\`
              ${styleContent}
              \`\`\`
              
              Apply these style guidelines to the modified component.`;
              }
              
              modificationPrompt += `
              
              Important: 
              - Maintain the same component structure and element name
              - Apply the requested modifications
              - Keep all existing functionality unless specifically asked to change
              
              CRITICAL: Return ONLY the modified JavaScript code. Do not include any explanations, descriptions, or text before or after the code. The response should start with "class" and end with "customElements.define". Output the code in a JavaScript code block using \`\`\`javascript\`\`\`.`;
              
              const result = await aiService.generateWithSource({
                prompt: modificationPrompt,
                temperature: 0.7,
                maxTokens: 4000
              });
              
              const modifiedCode = result.content;
              
              // Extract and clean the JavaScript code
              let cleanCode: string;
              const codeMatch = modifiedCode.match(/```(?:javascript|js)?\n([\s\S]*?)\n```/);
              
              if (codeMatch) {
                cleanCode = codeMatch[1];
              } else {
                // Try to extract component pattern directly
                const classMatch = modifiedCode.match(/class\s+\w+\s+extends\s+HTMLElement[\s\S]*?customElements\.define\([^)]+\);?/);
                cleanCode = classMatch ? classMatch[0] : modifiedCode;
              }
              
              // Clean up AI response artifacts
              cleanCode = cleanCode
                .replace(/^```[\w]*\n?/, '')
                .replace(/\n?```$/, '')
                .replace(/^(?:Here'?s?\s+(?:the|your)\s+(?:code|component|modified version)|The\s+(?:code|component|modified version)\s+is)[:\s]*/i, '')
                .trim();
              
              // Quick sanity check - just make sure it looks like a web component
              if (!cleanCode.includes('customElements.define') || !cleanCode.includes('extends HTMLElement')) {
                console.error('⚠️  Modified code missing web component structure');
                console.error('Raw AI response:', modifiedCode);
                console.error('Cleaned code:', cleanCode);
                
                // Save failed generation for debugging
                const failedDir = join(process.cwd(), 'failed-generations');
                if (!existsSync(failedDir)) {
                  mkdirSync(failedDir, { recursive: true });
                }
                
                const failedFile = join(failedDir, `shard-${Date.now()}.json`);
                writeFileSync(failedFile, JSON.stringify({
                  timestamp: new Date().toISOString(),
                  prompt: modificationPrompt,
                  aiResponse: modifiedCode,
                  cleanedCode: cleanCode,
                  originalComponent: originalJsPath,
                  model: result.source
                }, null, 2), 'utf-8');
                
                console.error(`Failed generation saved to: ${failedFile}`);
                throw new Error('Generated code does not appear to be a valid web component');
              }
              
              // Create new filenames with version
              const newHtmlName = `${parsed.gemId}-v${nextVersion}.html`;
              const newJsName = `${parsed.gemId}-v${nextVersion}.js`;
              
              // Extract the original element name from the code
              const elementNameMatch = cleanCode.match(/customElements\.define\(['"]([^'"]+)['"]/);
              const originalElementName = elementNameMatch ? elementNameMatch[1] : 'unknown-element';
              
              // Create a versioned element name
              const versionedElementName = `${originalElementName}-v${nextVersion}`;
              
              // Update the element name in the JavaScript code
              cleanCode = cleanCode.replace(
                /customElements\.define\(['"][^'"]+['"]/,
                `customElements.define('${versionedElementName}'`
              );
              
              // Read original HTML and update both script src and element usage
              const originalHtml = readFileSync(originalHtmlPath, 'utf-8');
              let newHtml = originalHtml.replace(
                /src="[^"]+\.js"/,
                `src="${newJsName}"`
              );
              
              // Also update the element tag in the HTML
              const elementTagRegex = new RegExp(`<${originalElementName}([^>]*)>`, 'g');
              const elementCloseTagRegex = new RegExp(`</${originalElementName}>`, 'g');
              newHtml = newHtml
                .replace(elementTagRegex, `<${versionedElementName}$1>`)
                .replace(elementCloseTagRegex, `</${versionedElementName}>`);
              
              // Write new files
              writeFileSync(join(generatedDir, newHtmlName), newHtml, 'utf-8');
              writeFileSync(join(generatedDir, newJsName), cleanCode, 'utf-8');
              
              // Save metadata for the shard
              const metadataPath = join(generatedDir, `${parsed.gemId}-v${nextVersion}.meta.json`);
              const metadata = {
                type: parsed.type,
                created: new Date(),
                prompt: modificationPrompt,
                aiSource: result.source,
                version: nextVersion,
                baseGem: parsed.gemId
              };
              writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                success: true,
                newFile: newHtmlName,
                version: nextVersion,
                modelInfo: result.source
              }));
            } catch (error) {
              console.error('Create shard error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname === '/api/current-config' && req.method === 'GET') {
          // Return current AI configuration
          import('../config/ConfigManager.js').then(({ ConfigManager }) => {
            const config = new ConfigManager();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              defaultModel: config.get('ai.defaultModel'),
              cloudModel: config.get('ai.openrouter.model'),
              localEndpoint: config.get('ai.local.endpoint'),
              claudeCodeModel: config.get('ai.claudeCode.model'),
              openRouterKey: config.get('ai.openrouter.key')
            }));
          }).catch(() => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load config' }));
          });
        } else if (pathname === '/api/create-gem' && req.method === 'POST') {
          // Handle creating a new GEM
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { type, description } = JSON.parse(body);
              
              // Use the component generator to create a new component
              const { ComponentGenerator } = await import('../generators/ComponentGenerator.js');
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { AIService } = await import('../services/ai/AIService.js');
              const { StylePresetService } = await import('../services/StylePresetService.js');
              
              const config = new ConfigManager();
              const aiService = new AIService(config);
              const generator = new ComponentGenerator(aiService);
              const styleService = new StylePresetService(config);
              
              // Get active style content if styles are enabled
              const styleContent = await styleService.getActiveStyleContent();
              
              const result = await generator.generate({
                type: type === 'custom' ? 'custom' : type,
                description,
                styleContent: styleContent || undefined
              });
              
              // Get the HTML filename from the generated files
              const htmlFile = result.files.find(f => f.path.endsWith('.html'));
              const filename = htmlFile ? htmlFile.path.split('/').pop() : null;
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                success: true,
                filename: filename || 'unknown.html',
                message: 'Component created successfully'
              }));
            } catch (error) {
              console.error('Create GEM error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname === '/api/check-endpoints' && req.method === 'GET') {
          // Check availability of AI endpoints
          const checkEndpoints = async () => {
            try {
              const localEndpoint = 'http://localhost:1234';
              const networkEndpoint = process.env.LM_STUDIO_NETWORK_ENDPOINT || 'http://10.0.0.237:1234';
              
              const checkEndpoint = async (url: string): Promise<boolean> => {
                try {
                  const response = await fetch(`${url}/v1/models`, {
                    signal: AbortSignal.timeout(2000)
                  });
                  return response.ok;
                } catch {
                  return false;
                }
              };
              
              const [localAvailable, networkAvailable] = await Promise.all([
                checkEndpoint(localEndpoint),
                checkEndpoint(networkEndpoint)
              ]);
              
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { AIService } = await import('../services/ai/AIService.js');
              const config = new ConfigManager();
              const aiService = new AIService(config);
              
              const apiKey = config.get('ai.openrouter.key');
              const openRouterAvailable = !!apiKey;
              
              // Check Claude Code availability
              const claudeCodeAvailable = await aiService.isClaudeCodeAvailable();
              
              // Debug logging
              console.log('OpenRouter API Key check:', {
                hasKey: openRouterAvailable,
                keyLength: apiKey ? apiKey.length : 0,
                envKey: !!process.env.OPENROUTER_API_KEY,
                envKeyLength: process.env.OPENROUTER_API_KEY ? process.env.OPENROUTER_API_KEY.length : 0
              });
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                localAvailable: localAvailable || networkAvailable,
                networkAvailable,
                openRouterAvailable,
                claudeCodeAvailable
              }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          };
          
          checkEndpoints().catch(() => {
            // Ensure response is sent even if promise is rejected
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal server error' }));
            }
          });
        } else if (pathname === '/api/get-models' && req.method === 'GET') {
          // Get available OpenRouter models
          const getModels = async () => {
            try {
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const config = new ConfigManager();
              const apiKey = config.get('ai.openrouter.key');
              
              // Debug logging
              console.log('Get models API Key check:', {
                hasKey: !!apiKey,
                keyLength: apiKey ? apiKey.length : 0,
                configAi: config.get('ai')
              });
              
              // Check if user has custom model list
              let models = [
                { id: 'x-ai/grok-4', name: '🌟 Grok-4' },
                { id: 'anthropic/claude-sonnet-4', name: '🚀 Claude Sonnet 4' },
                { id: 'openai/gpt-4o', name: '⚡ GPT-4o' },
                { id: 'openai/o3-mini', name: '✨ o3-mini' },
                { id: 'google/gemini-2.5-flash', name: '🏃 Gemini 2.5 Flash' },
                { id: 'google/gemini-2.5-pro', name: '🧠 Gemini 2.5 Pro' },
                { id: 'anthropic/claude-3.5-sonnet', name: '💬 Claude 3.5 Sonnet' },
                { id: 'anthropic/claude-3.7-sonnet', name: '🎯 Claude 3.7 Sonnet' },
                { id: 'meta-llama/llama-3-70b-instruct', name: '🦙 Llama 3 70B' }
              ];
              
              // Try to load custom models
              const customModels = config.get('ai.customModels');
              if (customModels && Array.isArray(customModels) && customModels.length > 0) {
                models = customModels;
              }
              
              res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
              });
              res.end(JSON.stringify({ models, hasApiKey: !!apiKey }));
            } catch (error) {
              console.error('Error in /api/get-models:', error);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              // Return empty models array on error to prevent client-side issues
              res.end(JSON.stringify({ models: [], hasApiKey: false, error: error instanceof Error ? error.message : String(error) }));
            }
          };
          
          getModels().catch(() => {
            // Ensure response is sent even if promise is rejected
            if (!res.headersSent) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ models: [], hasApiKey: false, error: 'Internal server error' }));
            }
          });
        } else if (pathname === '/api/update-config' && req.method === 'POST') {
          // Update configuration
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { defaultModel, localEndpoint, cloudModel, claudeCodeModel } = JSON.parse(body);
              
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const config = new ConfigManager();
              
              // Update settings
              if (defaultModel) {
                config.set('ai.defaultModel', defaultModel);
              }
              
              if (localEndpoint) {
                config.set('ai.local.endpoint', localEndpoint);
              }
              
              if (cloudModel) {
                config.set('ai.openrouter.model', cloudModel);
              }
              
              if (claudeCodeModel) {
                config.set('ai.claudeCode.model', claudeCodeModel);
              }
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname === '/api/custom-models' && req.method === 'GET') {
          // Get custom model list
          (async () => {
            try {
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const config = new ConfigManager();
              const models = config.get('ai.customModels') || null;
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ models }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          })();
        } else if (pathname === '/api/custom-models' && req.method === 'POST') {
          // Save custom model list
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { models } = JSON.parse(body);
              
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const config = new ConfigManager();
              
              // Save custom models
              config.set('ai.customModels', models);
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname === '/api/gem-versions' && req.method === 'GET') {
          // Get all versions of a gem
          const gemId = parsedUrl.searchParams.get('gemId');
          if (gemId) {
            const generatedDir = join(process.cwd(), 'generated');
            const allFiles = readdirSync(generatedDir).filter(f => f.endsWith('.html'));
            const versions = this.getGemVersions(gemId, allFiles);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ versions }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing gemId parameter' }));
          }
        } else if (pathname === '/api/styles' && req.method === 'GET') {
          // Get all style presets
          (async () => {
            try {
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { StylePresetService } = await import('../services/StylePresetService.js');
              
              const config = new ConfigManager();
              const styleService = new StylePresetService(config);
              
              const styles = await styleService.listStyles();
              const enabled = styleService.isStylesEnabled();
              const activePreset = config.get('styles.activePreset');
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ styles, enabled, activePreset }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          })();
        } else if (pathname === '/api/styles' && req.method === 'POST') {
          // Create new style preset
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { name, content } = JSON.parse(body);
              
              if (!name || !content) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Name and content are required' }));
                return;
              }
              
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { StylePresetService } = await import('../services/StylePresetService.js');
              
              const config = new ConfigManager();
              const styleService = new StylePresetService(config);
              
              const filename = await styleService.createStyle(name, content);
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, filename }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname.startsWith('/api/styles/') && req.method === 'GET') {
          // Get specific style content
          const filename = pathname.substring('/api/styles/'.length);
          
          (async () => {
            try {
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { StylePresetService } = await import('../services/StylePresetService.js');
              
              const config = new ConfigManager();
              const styleService = new StylePresetService(config);
              
              const content = await styleService.getStyleContent(filename);
              
              if (!content) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Style not found' }));
                return;
              }
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ content }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          })();
        } else if (pathname.startsWith('/api/styles/') && req.method === 'DELETE') {
          // Delete style preset
          const filename = pathname.substring('/api/styles/'.length);
          
          (async () => {
            try {
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { StylePresetService } = await import('../services/StylePresetService.js');
              
              const config = new ConfigManager();
              const styleService = new StylePresetService(config);
              
              const success = await styleService.deleteStyle(filename);
              
              if (!success) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Style not found or cannot be deleted' }));
                return;
              }
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          })();
        } else if (pathname === '/api/styles/active' && req.method === 'POST') {
          // Set active style or toggle styles
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { filename, enabled } = JSON.parse(body);
              
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { StylePresetService } = await import('../services/StylePresetService.js');
              
              const config = new ConfigManager();
              const styleService = new StylePresetService(config);
              
              if (enabled !== undefined) {
                await styleService.setStylesEnabled(enabled);
              }
              
              if (filename !== undefined) {
                await styleService.setActiveStyle(filename);
              }
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          });
        } else if (pathname.startsWith('/generated/')) {
          // Serve files from generated directory
          const filePath = join(process.cwd(), pathname.slice(1));
          if (existsSync(filePath)) {
            const ext = extname(filePath);
            
            // For HTML files in preview mode, serve a cleaned version
            if (ext === '.html' && req.headers.referer) {
              const htmlContent = readFileSync(filePath, 'utf-8');
              const cleanedHtml = this.cleanHtmlForPreview(htmlContent);
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(cleanedHtml);
            } else {
              const contentType = ext === '.js' ? 'application/javascript; charset=utf-8' : 
                                 ext === '.html' ? 'text/html; charset=utf-8' : 
                                 'text/plain; charset=utf-8';
              res.writeHead(200, { 'Content-Type': contentType });
              res.end(readFileSync(filePath, 'utf-8'));
            }
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      
      this.server.listen(port, () => {
        resolve(`http://localhost:${port}`);
      });
      
      this.server.on('error', reject);
    });
  }
  
  stop(): void {
    if (this.server) {
      this.server.close();
    }
  }
  
  private getIndexHtml(component?: string): string {
    // Get list of generated components
    const generatedDir = join(process.cwd(), 'generated');
    let componentFiles: Array<{name: string, time: Date}> = [];
    
    if (existsSync(generatedDir)) {
      const files = readdirSync(generatedDir);
      componentFiles = files
        .filter(f => f.endsWith('.html'))
        .map(f => {
          const stats = statSync(join(generatedDir, f));
          return { name: f, time: stats.mtime };
        })
        .sort((a, b) => b.time.getTime() - a.time.getTime());
    }
    
    const selectedComponent = component || (componentFiles[0]?.name);
    
    // Group files by GEM ID
    const gemGroups = new Map<string, Array<{name: string, path: string, time: string, type: string, version: number, metadata?: any}>>();
    
    componentFiles.forEach(f => {
      const parsed = this.parseGemFilename(f.name);
      const gemId = parsed.gemId;
      
      if (!gemGroups.has(gemId)) {
        gemGroups.set(gemId, []);
      }
      
      // Try to read metadata file
      let metadata: any = null;
      const metadataPath = join(generatedDir, f.name.replace('.html', '.meta.json'));
      if (existsSync(metadataPath)) {
        try {
          metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        } catch (e) {
          // Ignore metadata read errors
        }
      }
      
      gemGroups.get(gemId)!.push({
        name: f.name.replace('.html', ''),
        path: f.name,
        time: f.time.toLocaleString(),
        type: parsed.type,
        version: parsed.version,
        metadata
      });
    });
    
    // Sort versions within each group
    gemGroups.forEach(versions => {
      versions.sort((a, b) => b.version - a.version);
    });
    
    // Create flat list showing only the latest version of each GEM
    const fileList: Array<any> = [];
    gemGroups.forEach((versions) => {
      const latest = versions[0];
      fileList.push({
        ...latest,
        hasVersions: versions.length > 1,
        versionCount: versions.length,
        allVersions: versions
      });
    });
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GEMS Preview ✨</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💎</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=OpenDyslexic:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
    }
    
    :root {
      --rainbow-1: #ff0000;
      --rainbow-2: #ff7f00;
      --rainbow-3: #ffff00;
      --rainbow-4: #00ff00;
      --rainbow-5: #0000ff;
      --rainbow-6: #4b0082;
      --rainbow-7: #9400d3;
    }
    
    @keyframes rainbow-border {
      0% { border-color: var(--rainbow-1); }
      14% { border-color: var(--rainbow-2); }
      28% { border-color: var(--rainbow-3); }
      42% { border-color: var(--rainbow-4); }
      57% { border-color: var(--rainbow-5); }
      71% { border-color: var(--rainbow-6); }
      85% { border-color: var(--rainbow-7); }
      100% { border-color: var(--rainbow-1); }
    }
    
    @keyframes rainbow-glow {
      0% { 
        box-shadow: 
          0 0 20px var(--rainbow-1),
          inset 0 0 20px rgba(255, 0, 0, 0.1);
      }
      14% { 
        box-shadow: 
          0 0 20px var(--rainbow-2),
          inset 0 0 20px rgba(255, 127, 0, 0.1);
      }
      28% { 
        box-shadow: 
          0 0 20px var(--rainbow-3),
          inset 0 0 20px rgba(255, 255, 0, 0.1);
      }
      42% { 
        box-shadow: 
          0 0 20px var(--rainbow-4),
          inset 0 0 20px rgba(0, 255, 0, 0.1);
      }
      57% { 
        box-shadow: 
          0 0 20px var(--rainbow-5),
          inset 0 0 20px rgba(0, 0, 255, 0.1);
      }
      71% { 
        box-shadow: 
          0 0 20px var(--rainbow-6),
          inset 0 0 20px rgba(75, 0, 130, 0.1);
      }
      85% { 
        box-shadow: 
          0 0 20px var(--rainbow-7),
          inset 0 0 20px rgba(148, 0, 211, 0.1);
      }
      100% { 
        box-shadow: 
          0 0 20px var(--rainbow-1),
          inset 0 0 20px rgba(255, 0, 0, 0.1);
      }
    }
    
    @keyframes rainbow-text {
      0% { color: var(--rainbow-1); }
      14% { color: var(--rainbow-2); }
      28% { color: var(--rainbow-3); }
      42% { color: var(--rainbow-4); }
      57% { color: var(--rainbow-5); }
      71% { color: var(--rainbow-6); }
      85% { color: var(--rainbow-7); }
      100% { color: var(--rainbow-1); }
    }
    
    body {
      font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
      background: #000;
      color: #fff;
      overflow: hidden;
      height: 100vh;
      position: relative;
    }
    
    /* Animated background */
    body::before {
      content: '';
      position: fixed;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle at 20% 80%, rgba(103, 126, 234, 0.1) 0%, transparent 50%),
                  radial-gradient(circle at 80% 20%, rgba(118, 75, 162, 0.1) 0%, transparent 50%),
                  radial-gradient(circle at 40% 40%, rgba(255, 0, 255, 0.05) 0%, transparent 50%);
      animation: rotate 30s linear infinite;
    }
    
    @keyframes rotate {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .layout {
      display: flex;
      height: 100vh;
      position: relative;
      z-index: 1;
    }
    
    /* Glassmorphism sidebar */
    .sidebar {
      width: 320px;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-right: 2px solid rgba(255, 255, 255, 0.1);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    
    .sidebar-header {
      padding: 2rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      text-align: center;
      position: relative;
      z-index: 1;
    }
    
    .logo {
      font-size: 2.5rem;
      font-weight: 700;
      animation: rainbow-text 3s linear infinite;
      text-shadow: 0 0 30px currentColor;
      margin: 0;
    }
    
    .tagline {
      font-size: 0.875rem;
      opacity: 0.8;
      margin-top: 0.5rem;
    }
    
    .header-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
      width: 100%;
    }
    
    .create-gem-btn, .create-shard-btn {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;
      font-weight: 700;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .create-gem-btn {
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.8), rgba(103, 126, 234, 0.8));
    }
    
    .create-shard-btn {
      background: linear-gradient(135deg, rgba(103, 126, 234, 0.8), rgba(147, 51, 234, 0.8));
    }
    
    .btn-emoji {
      font-size: 1.5rem;
      line-height: 1;
    }
    
    .btn-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1;
    }
    
    .btn-text span {
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }
    
    .create-gem-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(147, 51, 234, 0.4);
    }
    
    .create-shard-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(103, 126, 234, 0.4);
    }
    
    .create-shard-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .settings-btn {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      width: 50px;
      height: 50px;
      padding: 0;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 12px;
      cursor: pointer;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      z-index: 100;
    }
    
    .settings-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: rotate(45deg);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    }
    
    .file-list {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      position: relative;
      z-index: 1;
    }
    
    .file-item {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1rem;
      margin-bottom: 0.75rem;
      transition: all 0.3s ease;
      position: relative;
      overflow: visible;
    }
    
    .file-content {
      cursor: pointer;
      position: relative;
      z-index: 5;
      pointer-events: auto;
    }
    
    .file-item:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
    
    .file-item.active {
      background: rgba(103, 126, 234, 0.2);
      border: 1px solid transparent;
      animation: rainbow-border 3s linear infinite;
      transform: translateX(10px);
    }
    
    
    
    .file-item.newest {
      position: relative;
    }
    
    .file-item.newest::after {
      content: '✨';
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      font-size: 1rem;
    }
    
    .file-name {
      font-weight: 700;
      margin-bottom: 0.25rem;
      word-break: break-all;
    }
    
    .file-time {
      font-size: 0.75rem;
      opacity: 0.6;
    }
    
    .main-content {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    
    .preview-frame {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    }
    
    /* Scrollbar styling */
    .file-list::-webkit-scrollbar {
      width: 8px;
    }
    
    .file-list::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    }
    
    .file-list::-webkit-scrollbar-thumb {
      background: rgba(103, 126, 234, 0.5);
      border-radius: 4px;
    }
    
    .file-list::-webkit-scrollbar-thumb:hover {
      background: rgba(103, 126, 234, 0.8);
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      opacity: 0.6;
    }
    
    .empty-state code {
      background: rgba(255, 255, 255, 0.1);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: 'OpenDyslexic Nerd Font Mono', 'OpenDyslexicNerdFontMono', 'OpenDyslexic Mono', monospace;
    }
    
    /* Action buttons */
    .file-actions {
      margin-top: 0.75rem;
      display: none;
      gap: 0.5rem;
      transition: opacity 0.2s ease;
    }
    
    .file-item.active .file-actions {
      display: flex;
    }
    
    .file-actions button {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;
      position: relative;
      z-index: 10;
      pointer-events: auto;
    }
    
    .file-actions button:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }
    
    .file-actions button.copy {
      background: rgba(103, 126, 234, 0.3);
      border-color: rgba(103, 126, 234, 0.5);
      flex: 1;
    }
    
    .file-actions button.copy:hover {
      background: rgba(103, 126, 234, 0.5);
    }
    
    .file-actions button.delete {
      background: rgba(239, 68, 68, 0.3);
      border-color: rgba(239, 68, 68, 0.5);
    }
    
    .file-actions button.delete:hover {
      background: rgba(239, 68, 68, 0.5);
    }
    
    /* Modal styles */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      z-index: 2000;
      align-items: center;
      justify-content: center;
    }
    
    .modal.show {
      display: flex;
    }
    
    .modal-content {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      padding: 2rem;
      max-width: 400px;
      text-align: center;
      position: relative;
      animation: modalSlideIn 0.3s ease;
    }
    
    @keyframes modalSlideIn {
      from {
        transform: translateY(-20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    
    .modal-buttons {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
      justify-content: center;
    }
    
    .modal-buttons button {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: white;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;
    }
    
    .modal-buttons button:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }
    
    .modal-buttons button.confirm {
      background: rgba(239, 68, 68, 0.5);
      border-color: rgba(239, 68, 68, 0.6);
    }
    
    .modal-buttons button.confirm:hover {
      background: rgba(239, 68, 68, 0.7);
    }
    
    /* Success state for copy button */
    .file-actions button.success {
      background: rgba(16, 185, 129, 0.5) !important;
      border-color: rgba(16, 185, 129, 0.6) !important;
    }
    
    /* Spin animation for processing */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    
    /* Version links styles */
    .version-links {
      margin-top: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    
    .version-link {
      font-size: 0.75rem;
      color: rgba(147, 51, 234, 0.9);
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      background: rgba(147, 51, 234, 0.1);
      transition: all 0.2s ease;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .version-link:hover {
      background: rgba(147, 51, 234, 0.2);
      color: #a855f7;
      transform: translateX(4px);
    }
    
    .version-link.active {
      background: rgba(147, 51, 234, 0.3);
      color: #c084fc;
      font-weight: 700;
    }
    
    .version-expand-toggle {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      margin-top: 0.5rem;
      display: inline-block;
      transition: all 0.2s ease;
    }
    
    .version-expand-toggle:hover {
      color: rgba(255, 255, 255, 0.8);
    }
    
    .version-links.collapsed .version-link:nth-child(n+4) {
      display: none;
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1 class="logo">💎 GEMS</h1>
        <p class="tagline">Generative Element Management System</p>
        <div class="header-actions">
          <button class="create-gem-btn" onclick="showCreateGemModal()">
            <span class="btn-emoji">✨</span>
            <span class="btn-text">
              <span>NEW</span>
              <span>GEM</span>
            </span>
          </button>
          <button class="create-shard-btn ${selectedComponent ? '' : 'disabled'}" onclick="showShardModal()" ${selectedComponent ? '' : 'disabled'}>
            <span class="btn-emoji">💎</span>
            <span class="btn-text">
              <span>NEW</span>
              <span>SHARD</span>
            </span>
          </button>
        </div>
      </div>
      <div class="file-list">
        ${componentFiles.length > 0 ? fileList.map((file, index) => `
          <div class="file-item ${file.path === selectedComponent ? 'active' : ''} ${index === 0 ? 'newest' : ''}" 
               data-component="${file.path}">
            <div class="file-content" data-path="${file.path}">
              <div class="file-type" style="font-size: 0.75rem; opacity: 0.7; text-transform: uppercase; margin-bottom: 0.25rem;">
                ${file.type}
                ${file.hasVersions ? `<span style="float: right; color: #9333ea; padding-right: 1.5rem;">💎 ${file.versionCount} shards</span>` : ''}
              </div>
              <div class="file-name">${file.name}</div>
              <div class="file-time">${file.time}</div>
            </div>
            <div class="file-actions">
              <button class="copy" data-path="${file.path}">📋 Copy Code</button>
              <button class="rename" data-path="${file.path}">✏️</button>
              <button class="delete" data-path="${file.path}">🗑️</button>
            </div>
            ${file.hasVersions ? `
              <div class="version-links ${file.versionCount > 4 ? 'collapsed' : ''}" id="versions-${file.name}">
                ${file.allVersions.slice(0, file.versionCount).map((version: any) => `
                  <div class="version-link ${version.path === selectedComponent ? 'active' : ''}" 
                       data-path="${version.path}"
                       ${version.metadata ? `data-metadata='${JSON.stringify(version.metadata).replace(/'/g, '&#39;')}'` : ''}
                       onclick="selectVersion('${version.path}')">
                    <span>SHARD ${version.version}</span>
                    <span style="opacity: 0.6; font-size: 0.65rem;">${new Date(parseInt(version.path.match(/-(\d+)/)[1])).toLocaleTimeString()}</span>
                  </div>
                `).join('')}
                ${file.versionCount > 4 ? `
                  <span class="version-expand-toggle" onclick="toggleVersions('${file.name}')">
                    ${file.versionCount > 4 ? `Show ${file.versionCount - 3} more...` : ''}
                  </span>
                ` : ''}
              </div>
            ` : ''}
          </div>
        `).join('') : `
          <div class="empty-state">
            <p>No components yet!</p>
            <p>Run <code>gems create</code> to get started</p>
          </div>
        `}
      </div>
    </aside>
    <main class="main-content">
      ${selectedComponent ? `
        <div class="version-indicator" id="versionIndicator" style="position: absolute; top: 1rem; right: 1rem; z-index: 10; 
             background: rgba(0, 0, 0, 0.8); padding: 0.5rem 1rem; border-radius: 8px; 
             border: 1px solid rgba(255, 255, 255, 0.2); display: none;">
          <span style="color: white; font-size: 0.875rem; font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;">
            Version: <span id="currentVersion">v1</span>
          </span>
        </div>
        <iframe class="preview-frame" src="/generated/${selectedComponent}"></iframe>
      ` : `
        <div class="splash-screen" style="display: flex; align-items: center; justify-content: center; height: 100%; 
             background: radial-gradient(circle at center, rgba(147, 51, 234, 0.1) 0%, transparent 50%);">
          <div style="text-align: center; max-width: 600px; padding: 2rem;">
            <div style="font-size: 6rem; margin-bottom: 2rem; animation: pulse 2s ease-in-out infinite;">💎</div>
            <h1 style="font-size: 3rem; margin: 0 0 1rem 0; background: linear-gradient(135deg, #9333ea, #667eea, #9333ea);
                       background-size: 200% 200%; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                       animation: gradient 3s ease infinite;">Welcome to GEMS</h1>
            <p style="font-size: 1.25rem; opacity: 0.8; margin-bottom: 3rem;">
              Create beautiful, AI-powered web components for WordPress
            </p>
            
            <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
              <button onclick="showCreateGemModal()" 
                style="padding: 1rem 2rem; background: linear-gradient(135deg, rgba(147, 51, 234, 0.8), rgba(103, 126, 234, 0.8));
                       border: 1px solid rgba(255, 255, 255, 0.2); color: white; border-radius: 12px;
                       cursor: pointer; font-size: 1.125rem; font-weight: 600; transition: all 0.3s ease;
                       font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;">
                ✨ Create New GEM
              </button>
              
              <button onclick="document.querySelector('.component-item')?.click()" 
                style="padding: 1rem 2rem; background: rgba(255, 255, 255, 0.1);
                       border: 1px solid rgba(255, 255, 255, 0.2); color: white; border-radius: 12px;
                       cursor: pointer; font-size: 1.125rem; font-weight: 600; transition: all 0.3s ease;
                       font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;">
                📁 Browse Components
              </button>
            </div>
            
            <div style="margin-top: 4rem; padding: 2rem; background: rgba(255, 255, 255, 0.05); 
                        border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1);">
              <h3 style="margin: 0 0 1rem 0; opacity: 0.9;">✨ Quick Tips</h3>
              <ul style="text-align: left; list-style: none; padding: 0; margin: 0; opacity: 0.8;">
                <li style="margin-bottom: 0.75rem;">
                  <span style="margin-right: 0.5rem;">💎</span>
                  Click on any component in the sidebar to preview it
                </li>
                <li style="margin-bottom: 0.75rem;">
                  <span style="margin-right: 0.5rem;">🔮</span>
                  Create SHARDs to modify existing components with AI
                </li>
                <li style="margin-bottom: 0.75rem;">
                  <span style="margin-right: 0.5rem;">📋</span>
                  Copy components directly to Elementor or WordPress
                </li>
                <li>
                  <span style="margin-right: 0.5rem;">⚙️</span>
                  Configure AI models and preferences in Settings
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <style>
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.1); opacity: 1; }
          }
          
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          
          .splash-screen button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(147, 51, 234, 0.3);
          }
        </style>
      `}
    </main>
  </div>
  
  <!-- Settings button (bottom-right) -->
  <button class="settings-btn" onclick="showSettingsModal()" title="Settings">
    ⚙️
  </button>
  
  <!-- Delete confirmation modal -->
  <div class="modal" id="deleteModal">
    <div class="modal-content" style="max-width: 500px;">
      <h3 style="margin-top: 0;">⚠️ Delete Component?</h3>
      <p>Are you sure you want to delete <strong id="deleteComponentName"></strong>?</p>
      <div id="deleteOptions" style="display: none; margin: 1rem 0;">
        <p style="font-size: 0.875rem; opacity: 0.8;">This component has multiple versions. What would you like to delete?</p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="radio" name="deleteOption" value="shard" checked>
            <span>Delete only this version</span>
          </label>
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="radio" name="deleteOption" value="all">
            <span>Delete entire component (all versions)</span>
          </label>
        </div>
      </div>
      <p style="font-size: 0.875rem; opacity: 0.7;">This action cannot be undone!</p>
      <div class="modal-buttons">
        <button onclick="cancelDelete()">Cancel</button>
        <button class="confirm" onclick="confirmDelete()">Delete</button>
      </div>
    </div>
  </div>
  
  <!-- New SHARD modal -->
  <div class="modal" id="shardModal">
    <div class="modal-content">
      <h3 style="margin-top: 0;">💎 Create New SHARD</h3>
      <p>Describe how you want to modify this component:</p>
      <textarea id="shardPrompt" 
        style="width: 100%; min-height: 100px; margin-top: 1rem; padding: 0.75rem; 
               border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
               background: rgba(255, 255, 255, 0.1); color: white; resize: vertical;
               font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;"
        placeholder="e.g., Make it more colorful, Add animations, Change the layout..."></textarea>
      <div class="modal-buttons">
        <button onclick="cancelShard()">Cancel</button>
        <button class="confirm" onclick="createShard()" style="background: rgba(103, 126, 234, 0.5); border-color: rgba(103, 126, 234, 0.6);">Create SHARD</button>
      </div>
    </div>
  </div>
  
  <!-- Processing modal -->
  <div class="modal" id="processingModal">
    <div class="modal-content" style="text-align: center;">
      <div class="processing-animation" style="margin: 2rem 0;">
        <div style="font-size: 3rem; animation: spin 2s linear infinite;">💎</div>
      </div>
      <h3>Creating New SHARD...</h3>
      <p id="processingStatus" style="opacity: 0.7;">Analyzing component structure...</p>
      <p id="modelInfo" style="opacity: 0.5; font-size: 0.875rem; margin-top: 0.5rem;"></p>
      <div style="margin-top: 1.5rem; width: 100%; max-width: 300px;">
        <div style="height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;">
          <div id="progressBar" style="height: 100%; background: linear-gradient(90deg, #9333ea, #667eea); 
                                       width: 0%; transition: width 0.3s ease; border-radius: 2px;"></div>
        </div>
      </div>
    </div>
  </div>
  
  
  <!-- Create GEM modal -->
  <div class="modal" id="createGemModal">
    <div class="modal-content" style="max-width: 600px;">
      <h3 style="margin-top: 0;">✨ Create New GEM</h3>
      
      <div style="margin: 1.5rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Component Type:</label>
        <select id="componentType" 
          style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                 background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit;">
          <option value="hero">🏔️ Hero Section</option>
          <option value="cta">🎯 Call-to-Action</option>
          <option value="features">✨ Features Grid</option>
          <option value="testimonial">💬 Testimonial</option>
          <option value="pricing">💳 Pricing Table</option>
          <option value="faq">❓ FAQ Section</option>
          <option value="custom" selected>✏️ Custom Component</option>
        </select>
      </div>
      
      <div style="margin: 1.5rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Description:</label>
        <textarea id="gemDescription" 
          style="width: 100%; min-height: 120px; padding: 0.75rem; 
                 border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                 background: rgba(255, 255, 255, 0.1); color: white; resize: vertical;
                 font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;"
          placeholder="Describe the component you want to create..."></textarea>
      </div>
      
      <div class="modal-buttons">
        <button onclick="cancelCreateGem()">Cancel</button>
        <button class="confirm" onclick="createGem()" style="background: rgba(147, 51, 234, 0.5); border-color: rgba(147, 51, 234, 0.6);">Create GEM</button>
      </div>
    </div>
  </div>
  
  <!-- Settings modal -->
  <div class="modal" id="settingsModal">
    <div class="modal-content" style="max-width: 700px;">
      <h3 style="margin-top: 0;">⚙️ Settings</h3>
      
      <div id="settingsContent" style="margin: 1.5rem 0;">
        <!-- Settings content will be populated dynamically -->
        <div style="text-align: center; padding: 2rem;">
          <div style="animation: spin 1s linear infinite; display: inline-block;">⚙️</div>
          <p style="margin-top: 1rem; opacity: 0.7;">Loading settings...</p>
        </div>
      </div>
      
      <div class="modal-buttons">
        <button onclick="cancelSettings()">Cancel</button>
        <button class="confirm" onclick="saveSettings()" style="background: rgba(103, 126, 234, 0.5); border-color: rgba(103, 126, 234, 0.6);">Save Settings</button>
      </div>
    </div>
  </div>
  
  <!-- Manage Models modal -->
  <div class="modal" id="manageModelsModal">
    <div class="modal-content" style="max-width: 800px;">
      <h3 style="margin-top: 0;">⚙️ Manage OpenRouter Models</h3>
      
      <div style="margin: 1rem 0;">
        <p style="opacity: 0.8; font-size: 0.875rem;">
          Customize your model quick list. Add models you use frequently and remove ones you don't need.
        </p>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 1.5rem 0;">
        <!-- Available Models -->
        <div>
          <h4 style="margin-bottom: 0.5rem;">Available Models</h4>
          <div style="margin-bottom: 1rem;">
            <input type="text" id="modelSearch" placeholder="Search models..." 
              style="width: 100%; padding: 0.5rem; border-radius: 6px; 
                     border: 1px solid rgba(255, 255, 255, 0.2); 
                     background: rgba(255, 255, 255, 0.1); color: white;">
          </div>
          <div id="availableModelsList" 
            style="height: 400px; overflow-y: auto; border: 1px solid rgba(255, 255, 255, 0.2); 
                   border-radius: 8px; padding: 0.5rem; background: rgba(255, 255, 255, 0.05);">
            <div style="text-align: center; padding: 2rem;">
              <div style="animation: spin 1s linear infinite;">🔄</div>
              <p style="margin-top: 1rem; opacity: 0.7;">Loading models...</p>
            </div>
          </div>
        </div>
        
        <!-- Your Quick List -->
        <div>
          <h4 style="margin-bottom: 0.5rem;">Your Quick List</h4>
          <p style="font-size: 0.75rem; opacity: 0.7; margin-bottom: 1rem;">
            Drag to reorder • Click × to remove
          </p>
          <div id="quickModelsList" 
            style="height: 400px; overflow-y: auto; border: 1px solid rgba(255, 255, 255, 0.2); 
                   border-radius: 8px; padding: 0.5rem; background: rgba(255, 255, 255, 0.05);">
            <!-- Quick list will be populated here -->
          </div>
        </div>
      </div>
      
      <div class="modal-buttons">
        <button onclick="cancelManageModels()">Cancel</button>
        <button class="confirm" onclick="saveModelList()" 
          style="background: rgba(103, 126, 234, 0.5); border-color: rgba(103, 126, 234, 0.6);">
          Save Changes
        </button>
      </div>
    </div>
  </div>
  
  <!-- Edit/Rename GEM modal -->
  <div class="modal" id="editModal">
    <div class="modal-content" style="max-width: 600px;">
      <h3 style="margin-top: 0;">✏️ Edit GEM/SHARD</h3>
      
      <div style="margin: 1.5rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Component Name:</label>
        <input type="text" id="editComponentName" 
          style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                 background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit;"
          placeholder="Enter new component name...">
        <p style="font-size: 0.75rem; opacity: 0.6; margin-top: 0.5rem;">
          Note: The timestamp will be preserved automatically
        </p>
      </div>
      
      <div id="metadataInfo" style="margin: 1.5rem 0; display: none;">
        <div style="padding: 1rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
          <h4 style="margin: 0 0 0.75rem 0; font-size: 0.875rem; opacity: 0.8;">Generation Details</h4>
          
          <div id="promptInfo" style="margin-bottom: 1rem; display: none;">
            <label style="display: block; margin-bottom: 0.25rem; font-size: 0.75rem; opacity: 0.6;">Prompt:</label>
            <div id="promptText" style="padding: 0.5rem; background: rgba(0, 0, 0, 0.2); border-radius: 4px; 
                                        font-size: 0.875rem; line-height: 1.4; max-height: 100px; overflow-y: auto;"></div>
          </div>
          
          <div id="modelInfo" style="display: none;">
            <label style="display: block; margin-bottom: 0.25rem; font-size: 0.75rem; opacity: 0.6;">Model:</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span id="modelType" style="padding: 0.25rem 0.5rem; background: rgba(103, 126, 234, 0.3); 
                                          border-radius: 4px; font-size: 0.75rem;"></span>
              <span id="modelName" style="font-size: 0.875rem; opacity: 0.8;"></span>
            </div>
          </div>
          
          <div id="noMetadata" style="display: none;">
            <p style="margin: 0; opacity: 0.6; font-size: 0.875rem; font-style: italic;">
              No generation details available for this component
            </p>
          </div>
        </div>
      </div>
      
      <div class="modal-buttons">
        <button onclick="cancelEdit()">Cancel</button>
        <button class="confirm" onclick="confirmEdit()" style="background: rgba(103, 126, 234, 0.5); border-color: rgba(103, 126, 234, 0.6);">Save Changes</button>
      </div>
    </div>
  </div>
  
  <!-- Create Style modal -->
  <div class="modal" id="createStyleModal">
    <div class="modal-content" style="max-width: 600px;">
      <h3 style="margin-top: 0;">✨ Create Style Preset</h3>
      
      <div style="margin: 1.5rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Style Name:</label>
        <input type="text" id="styleName" 
          style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                 background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit;"
          placeholder="e.g., Modern Minimalist, Vibrant Playful">
      </div>
      
      <div style="margin: 1.5rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Style Guidelines:</label>
        <textarea id="styleContent" 
          style="width: 100%; min-height: 300px; padding: 0.75rem; 
                 border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                 background: rgba(255, 255, 255, 0.1); color: white; resize: vertical;
                 font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;"
          placeholder="Define your style guidelines here. Include:&#10;&#10;• Color palette (primary, secondary, accent colors)&#10;• Typography (fonts, sizes, weights)&#10;• Visual style (modern, classic, playful, professional)&#10;• Layout preferences (spacing, borders, shadows)&#10;• Any specific design patterns or components&#10;&#10;The more detail you provide, the better the generated components will match your style!"></textarea>
      </div>
      
      <div class="modal-buttons">
        <button onclick="cancelCreateStyle()">Cancel</button>
        <button class="confirm" onclick="createStyle()" style="background: rgba(147, 51, 234, 0.5); border-color: rgba(147, 51, 234, 0.6);">Create Style</button>
      </div>
    </div>
  </div>
  
  <!-- Edit Style modal -->
  <div class="modal" id="editStyleModal">
    <div class="modal-content" style="max-width: 600px;">
      <h3 style="margin-top: 0;">✏️ Edit Style Preset</h3>
      
      <div style="margin: 1.5rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Style Name:</label>
        <input type="text" id="editStyleName" 
          style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                 background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit;" disabled>
        <p style="font-size: 0.75rem; opacity: 0.6; margin-top: 0.5rem;">
          Note: Style name cannot be changed. Create a new style to use a different name.
        </p>
      </div>
      
      <div style="margin: 1.5rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Style Guidelines:</label>
        <textarea id="editStyleContent" 
          style="width: 100%; min-height: 300px; padding: 0.75rem; 
                 border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                 background: rgba(255, 255, 255, 0.1); color: white; resize: vertical;
                 font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;"></textarea>
      </div>
      
      <div class="modal-buttons">
        <button onclick="cancelEditStyle()">Cancel</button>
        <button class="confirm" onclick="saveEditedStyle()" style="background: rgba(103, 126, 234, 0.5); border-color: rgba(103, 126, 234, 0.6);">Save Changes</button>
      </div>
    </div>
  </div>
  
  
  <script>
    // Define functions in global scope first
    let currentlyLoading = false;
    let componentToDelete = null;
    
    function toggleVersions(gemId) {
      const versionContainer = document.getElementById('versions-' + gemId);
      const toggle = versionContainer.querySelector('.version-expand-toggle');
      
      if (versionContainer.classList.contains('collapsed')) {
        versionContainer.classList.remove('collapsed');
        toggle.textContent = 'Show less...';
      } else {
        versionContainer.classList.add('collapsed');
        const totalVersions = versionContainer.querySelectorAll('.version-link').length;
        toggle.textContent = \`Show \${totalVersions - 3} more...\`;
      }
    }
    
    function selectVersion(path) {
      console.log('selectVersion called with path:', path);
      
      // First, find which file-item contains this version
      let targetFileItem = null;
      document.querySelectorAll('.file-item').forEach(item => {
        const versionLink = item.querySelector(\`.version-link[data-path="\${path}"]\`);
        if (versionLink) {
          targetFileItem = item;
        }
      });
      
      if (targetFileItem) {
        // Remove active from all items
        document.querySelectorAll('.file-item').forEach(item => {
          item.classList.remove('active');
        });
        
        // Make this item active
        targetFileItem.classList.add('active');
        
        // Update all buttons in this item to use the selected version path
        const buttons = targetFileItem.querySelectorAll('.file-actions button');
        console.log('Updating buttons for version:', path, 'Found buttons:', buttons.length);
        buttons.forEach(btn => {
          const oldPath = btn.dataset.path;
          btn.dataset.path = path;
          console.log('Updated button', btn.className, 'from', oldPath, 'to', path);
        });
      }
      
      // Now load the component
      loadComponent(path);
    }
    
    function loadComponent(path) {
      console.log('loadComponent called with path:', path);
      if (currentlyLoading) {
        console.log('Already loading, skipping');
        return;
      }
      
      // Update active state - look for file item by data-component or containing version link
      let clickedItem = document.querySelector(\`[data-component="\${path}"]\`);
      
      // If no exact match, look for item containing this version
      if (!clickedItem) {
        document.querySelectorAll('.file-item').forEach(item => {
          const versionLink = item.querySelector(\`.version-link[data-path="\${path}"]\`);
          if (versionLink) {
            clickedItem = item;
          }
        });
      }
      
      // Only update active state if not already handled by selectVersion
      if (clickedItem && !clickedItem.classList.contains('active')) {
        document.querySelectorAll('.file-item').forEach(item => {
          item.classList.remove('active');
        });
        clickedItem.classList.add('active');
        
        // Also update button paths when setting active
        const buttons = clickedItem.querySelectorAll('.file-actions button');
        buttons.forEach(btn => {
          btn.dataset.path = path;
        });
      }
      
      // Enable/disable New SHARD button in header
      const shardBtn = document.querySelector('.create-shard-btn');
      if (shardBtn) {
        shardBtn.disabled = false;
        shardBtn.classList.remove('disabled');
      }
      
      // Parse and show version
      const versionMatch = path.match(/-v(\d+)\.html$/);
      const version = versionMatch ? parseInt(versionMatch[1]) : 1;
      const versionIndicator = document.getElementById('versionIndicator');
      const currentVersionSpan = document.getElementById('currentVersion');
      
      if (versionIndicator && currentVersionSpan) {
        currentVersionSpan.textContent = 'v' + version;
        if (version > 1) {
          versionIndicator.style.display = 'block';
        } else {
          versionIndicator.style.display = 'none';
        }
      }
      
      // Update active version link in sidebar
      document.querySelectorAll('.version-link').forEach(link => {
        link.classList.remove('active');
      });
      const activeVersionLink = document.querySelector(\`.version-link[data-path="\${path}"]\`);
      if (activeVersionLink) {
        activeVersionLink.classList.add('active');
      }
      
      
      // Update URL without reload
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('component', path);
      window.history.pushState({}, '', newUrl);
      
      // Update iframe
      const iframe = document.querySelector('.preview-frame');
      console.log('iframe found:', !!iframe);
      if (iframe) {
        currentlyLoading = true;
        
        // Add loading indicator
        const mainContent = document.querySelector('.main-content');
        mainContent.style.opacity = '0.5';
        mainContent.style.transition = 'opacity 0.2s';
        
        // Load new component
        iframe.src = '/generated/' + path;
        console.log('Set iframe src to:', iframe.src);
        
        iframe.onload = () => {
          console.log('iframe loaded');
          mainContent.style.opacity = '1';
          currentlyLoading = false;
        };
      } else {
        // No iframe yet, reload page
        console.log('No iframe, reloading page');
        window.location.href = '/?component=' + encodeURIComponent(path);
      }
    }
    
    async function copyComponent(path) {
      console.log('copyComponent called with path:', path);
      
      // Debug: Check what the active component actually is
      const activeItem = document.querySelector('.file-item.active');
      if (activeItem) {
        const copyBtn = activeItem.querySelector('.file-actions button.copy');
        console.log('Active item copy button path:', copyBtn?.dataset.path);
        
        // Also check if we have an active version link
        const activeVersionLink = activeItem.querySelector('.version-link.active');
        if (activeVersionLink) {
          console.log('Active version link path:', activeVersionLink.dataset.path);
          // Use the active version's path instead if it exists
          if (activeVersionLink.dataset.path && activeVersionLink.dataset.path !== path) {
            console.log('OVERRIDING path with active version:', activeVersionLink.dataset.path);
            path = activeVersionLink.dataset.path;
          }
        }
      }
      
      try {
        // Fetch component code
        const response = await fetch('/api/component-code?file=' + encodeURIComponent(path));
        
        if (!response.ok) {
          throw new Error('Failed to fetch component code');
        }
        
        const data = await response.json();
        
        // Ensure we have the required data
        if (!data.elementName || !data.minified) {
          throw new Error('Invalid component data received');
        }
        
        // Create WordPress-ready code
        const wordpressCode = \`<!-- GEMS Component: \${data.elementName} -->
<scr\` + \`ipt>
(function() {
  if (customElements.get('\${data.elementName}')) return;
  \${data.minified}
})();
</scr\` + \`ipt>
<\${data.elementName}></\${data.elementName}>
<style>
\${data.elementName} {
  display: block;
  width: 100%;
}
</style>\`;
        
        // Copy to clipboard
        await navigator.clipboard.writeText(wordpressCode);
        
        // Show success state on the correct button
        const activeItem = document.querySelector('.file-item.active');
        if (activeItem) {
          const btn = activeItem.querySelector('button.copy');
          if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            btn.classList.add('success');
            setTimeout(() => {
              btn.innerHTML = originalText;
              btn.classList.remove('success');
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Failed to copy:', error);
        alert('Failed to copy component code: ' + error.message);
      }
    }
    
    let editingComponent = null;
    let editingMetadata = null;
    
    async function renameComponent(path) {
      editingComponent = path;
      
      // Extract the type and timestamp from current filename
      const currentName = path.replace('.html', '');
      const parts = currentName.split('-');
      const timestamp = parts[parts.length - 1];
      const currentType = parts.slice(0, -1).join('-');
      
      // Set the current name in the input
      document.getElementById('editComponentName').value = currentType;
      
      // Try to load metadata
      const metadataPath = path.replace('.html', '.meta.json');
      try {
        // Get the metadata for this file from the active file item
        const activeItem = document.querySelector('.file-item.active');
        if (activeItem) {
          // Find the version that's currently selected
          const versionData = Array.from(activeItem.querySelectorAll('.version-link'))
            .find(link => link.dataset.path === path);
          
          if (versionData && versionData.dataset.metadata) {
            editingMetadata = JSON.parse(versionData.dataset.metadata);
          }
        }
        
        // If no metadata in DOM, try to fetch it
        if (!editingMetadata) {
          const response = await fetch('/generated/' + metadataPath);
          if (response.ok) {
            editingMetadata = await response.json();
          }
        }
      } catch (e) {
        console.log('No metadata available for', path);
      }
      
      // Show/hide metadata info
      const metadataInfoDiv = document.getElementById('metadataInfo');
      const promptInfoDiv = document.getElementById('promptInfo');
      const modelInfoDiv = document.getElementById('modelInfo');
      const noMetadataDiv = document.getElementById('noMetadata');
      
      if (editingMetadata) {
        metadataInfoDiv.style.display = 'block';
        
        // Show prompt if available
        if (editingMetadata.prompt) {
          promptInfoDiv.style.display = 'block';
          document.getElementById('promptText').textContent = editingMetadata.prompt;
        } else {
          promptInfoDiv.style.display = 'none';
        }
        
        // Show model info if available
        if (editingMetadata.aiSource) {
          modelInfoDiv.style.display = 'block';
          const modelType = document.getElementById('modelType');
          const modelName = document.getElementById('modelName');
          
          modelType.textContent = editingMetadata.aiSource.type === 'local' ? '🏠 Local' : 
                                  editingMetadata.aiSource.type === 'cloud' ? '☁️ Cloud' : 
                                  editingMetadata.aiSource.type === 'network' ? '🌐 Network' : 
                                  '📝 Template';
          
          modelName.textContent = editingMetadata.aiSource.model || 'Unknown Model';
        } else {
          modelInfoDiv.style.display = 'none';
        }
        
        noMetadataDiv.style.display = 'none';
      } else {
        metadataInfoDiv.style.display = 'block';
        promptInfoDiv.style.display = 'none';
        modelInfoDiv.style.display = 'none';
        noMetadataDiv.style.display = 'block';
      }
      
      // Show the modal
      document.getElementById('editModal').classList.add('show');
      document.getElementById('editComponentName').focus();
    }
    
    function cancelEdit() {
      document.getElementById('editModal').classList.remove('show');
      editingComponent = null;
      editingMetadata = null;
    }
    
    async function confirmEdit() {
      if (!editingComponent) return;
      
      let newType = document.getElementById('editComponentName').value.trim();
      if (!newType) {
        // Add error feedback
        const input = document.getElementById('editComponentName');
        input.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        input.style.animation = 'shake 0.3s ease';
        setTimeout(() => {
          input.style.borderColor = '';
          input.style.animation = '';
        }, 300);
        return;
      }
      
      // Sanitize the name: convert spaces to dashes and remove invalid characters
      newType = newType
        .toLowerCase()
        .replace(/[^a-z0-9\s-]+/g, '')  // Remove special chars except spaces and dashes
        .replace(/\s+/g, '-')           // Convert spaces to dashes
        .replace(/-+/g, '-')            // Collapse multiple dashes
        .replace(/^-+|-+$/g, '')        // Remove leading/trailing dashes
        .slice(0, 50);                  // Limit to 50 chars
      
      // Extract timestamp from current name
      const currentName = editingComponent.replace('.html', '');
      const parts = currentName.split('-');
      const timestamp = parts[parts.length - 1];
      const currentType = parts.slice(0, -1).join('-');
      
      // Skip if name hasn't changed
      if (newType === currentType) {
        cancelEdit();
        return;
      }
      
      // Auto-append the timestamp if user didn't include it
      let newName = newType;
      if (!newName.includes(timestamp)) {
        newName = newType + '-' + timestamp;
      }
      
      const newFilename = newName.endsWith('.html') ? newName : newName + '.html';
      
      try {
        const response = await fetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldName: editingComponent, newName: newFilename })
        });
        
        if (response.ok) {
          // Reload to show updated list
          window.location.reload();
        } else {
          const error = await response.json();
          alert('Failed to rename component: ' + (error.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Failed to rename:', error);
        alert('Failed to rename component: ' + error.message);
      }
      
      cancelEdit();
    }
    
    function deleteComponent(path) {
      console.log('deleteComponent called with path:', path);
      componentToDelete = path;
      const componentName = path.replace('.html', '');
      document.getElementById('deleteComponentName').textContent = componentName;
      
      // Check if this component has multiple versions
      const deleteOptions = document.getElementById('deleteOptions');
      
      // Extract gem ID from the path
      const match = path.match(/^(.+?-\d+)(?:-v\d+)?\.html$/);
      if (match) {
        const gemId = match[1];
        console.log('Checking versions for gemId:', gemId);
        
        // Always check for versions to show options
        fetch('/api/gem-versions?gemId=' + encodeURIComponent(gemId))
          .then(res => res.json())
          .then(data => {
            console.log('Versions found:', data.versions);
            if (data.versions && data.versions.length > 1) {
              // Show delete options
              deleteOptions.style.display = 'block';
              
              // Set appropriate default based on what's selected
              if (path.includes('-v')) {
                // Selecting a specific version, default to deleting just this shard
                document.querySelector('input[value="shard"]').checked = true;
              } else {
                // Selecting the base version, default to deleting all
                document.querySelector('input[value="all"]').checked = true;
              }
            } else {
              // Only one version exists
              deleteOptions.style.display = 'none';
            }
          })
          .catch(err => {
            console.error('Failed to check versions:', err);
            deleteOptions.style.display = 'none';
          });
      } else {
        // Couldn't parse gem ID
        deleteOptions.style.display = 'none';
      }
      document.getElementById('deleteModal').classList.add('show');
    }
    
    function cancelDelete() {
      document.getElementById('deleteModal').classList.remove('show');
      componentToDelete = null;
    }
    
    async function confirmDelete() {
      if (!componentToDelete) return;
      
      const deleteOption = document.querySelector('input[name="deleteOption"]:checked')?.value || 'single';
      
      try {
        if (deleteOption === 'all') {
          // Delete all versions of the gem
          const match = componentToDelete.match(/^(.+?-\d+)(?:-v\d+)?\.html$/);
          if (match) {
            const gemId = match[1];
            // Get all versions
            const versionsRes = await fetch('/api/gem-versions?gemId=' + encodeURIComponent(gemId));
            const versionsData = await versionsRes.json();
            
            // Delete each version
            for (const versionFile of versionsData.versions) {
              await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: versionFile })
              });
            }
          }
        } else {
          // Delete single file
          const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: componentToDelete })
          });
          
          if (!response.ok) {
            throw new Error('Failed to delete');
          }
        }
        
        // Reload to show updated list
        window.location.href = '/';
      } catch (error) {
        console.error('Failed to delete:', error);
        alert('Failed to delete component');
      }
      
      cancelDelete();
    }
    
    let currentGemId = null;
    
    function showShardModal() {
      const activeItem = document.querySelector('.file-item.active');
      if (!activeItem) return;
      
      const path = activeItem.querySelector('.file-content').dataset.path;
      currentGemId = path.replace('.html', '');
      
      document.getElementById('shardModal').classList.add('show');
      document.getElementById('shardPrompt').focus();
    }
    
    function cancelShard() {
      document.getElementById('shardModal').classList.remove('show');
      document.getElementById('shardPrompt').value = '';
      currentGemId = null;
    }
    
    async function createShard() {
      const prompt = document.getElementById('shardPrompt').value.trim();
      if (!prompt || !currentGemId) return;
      
      // Hide shard modal and show processing modal
      document.getElementById('shardModal').classList.remove('show');
      document.getElementById('processingModal').classList.add('show');
      
      // Get current model info
      try {
        const configRes = await fetch('/api/current-config');
        const config = await configRes.json();
        const modelInfo = document.getElementById('modelInfo');
        if (modelInfo) {
          if (config.defaultModel === 'claude-code') {
            const modelName = config.claudeCodeModel === 'opus-4' ? 'Claude Opus 4' : 'Claude Sonnet 4';
            modelInfo.textContent = 'Using: ' + modelName;
          } else if (config.defaultModel === 'cloud') {
            modelInfo.textContent = 'Using: ' + (config.cloudModel || 'OpenRouter');
          } else {
            modelInfo.textContent = 'Using: Local LM Studio';
          }
        }
      } catch (err) {
        console.log('Could not fetch config');
      }
      
      // Update status messages and progress bar
      const statusMessages = [
        'Analyzing component structure...',
        'Understanding your requirements...',
        'Applying modifications...',
        'Generating new SHARD...',
        'Finalizing component...'
      ];
      
      let messageIndex = 0;
      const totalDuration = 30000; // Expected 30 seconds max
      const startTime = Date.now();
      const progressBar = document.getElementById('progressBar');
      
      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / totalDuration) * 100, 95); // Cap at 95% until done
        
        if (progressBar) {
          progressBar.style.width = progress + '%';
        }
        
        // Update message based on progress
        const newMessageIndex = Math.min(Math.floor((progress / 100) * statusMessages.length), statusMessages.length - 1);
        if (newMessageIndex !== messageIndex) {
          messageIndex = newMessageIndex;
          const statusEl = document.getElementById('processingStatus');
          if (statusEl) {
            statusEl.textContent = statusMessages[messageIndex];
          }
        }
      };
      
      const progressInterval = setInterval(updateProgress, 100);
      
      try {
        const response = await fetch('/api/create-shard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gemId: currentGemId, prompt })
        });
        
        if (!response.ok) {
          throw new Error('Failed to create SHARD');
        }
        
        const data = await response.json();
        
        // Clear interval and complete progress
        clearInterval(progressInterval);
        if (progressBar) {
          progressBar.style.width = '100%';
        }
        
        // Short delay to show completion
        setTimeout(() => {
          document.getElementById('processingModal').classList.remove('show');
          
          // Reset form
          document.getElementById('shardPrompt').value = '';
          currentGemId = null;
          
          // Reload to show new version
          window.location.href = '/?component=' + encodeURIComponent(data.newFile);
        }, 500);
      } catch (error) {
        clearInterval(progressInterval);
        document.getElementById('processingModal').classList.remove('show');
        console.error('Failed to create SHARD:', error);
        alert('Failed to create new SHARD: ' + error.message);
      }
    }
    
    // Create GEM functions
    function showCreateGemModal() {
      document.getElementById('createGemModal').classList.add('show');
      document.getElementById('gemDescription').focus();
    }
    
    function cancelCreateGem() {
      document.getElementById('createGemModal').classList.remove('show');
      document.getElementById('componentType').value = 'custom';
      document.getElementById('gemDescription').value = '';
    }
    
    async function createGem() {
      const type = document.getElementById('componentType').value;
      const description = document.getElementById('gemDescription').value.trim();
      
      if (!description) {
        alert('Please provide a description for the component');
        return;
      }
      
      // Hide create modal and show processing modal
      document.getElementById('createGemModal').classList.remove('show');
      document.getElementById('processingModal').classList.add('show');
      document.getElementById('processingStatus').textContent = 'Creating your new GEM...';
      
      // Get current model info
      try {
        const configRes = await fetch('/api/current-config');
        const config = await configRes.json();
        const modelInfo = document.getElementById('modelInfo');
        if (modelInfo) {
          if (config.defaultModel === 'claude-code') {
            const modelName = config.claudeCodeModel === 'opus-4' ? 'Claude Opus 4' : 'Claude Sonnet 4';
            modelInfo.textContent = 'Using: ' + modelName;
          } else if (config.defaultModel === 'cloud') {
            modelInfo.textContent = 'Using: ' + (config.cloudModel || 'OpenRouter');
          } else {
            modelInfo.textContent = 'Using: Local LM Studio';
          }
        }
      } catch (err) {
        console.log('Could not fetch config');
      }
      
      // Update status messages and progress bar
      const statusMessages = [
        'Creating your new GEM...',
        'Analyzing requirements...',
        'Generating component structure...',
        'Building web component...',
        'Finalizing your GEM...'
      ];
      
      let messageIndex = 0;
      const totalDuration = 30000; // Expected 30 seconds max
      const startTime = Date.now();
      const progressBar = document.getElementById('progressBar');
      
      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min((elapsed / totalDuration) * 100, 95); // Cap at 95% until done
        
        if (progressBar) {
          progressBar.style.width = progress + '%';
        }
        
        // Update message based on progress
        const newMessageIndex = Math.min(Math.floor((progress / 100) * statusMessages.length), statusMessages.length - 1);
        if (newMessageIndex !== messageIndex) {
          messageIndex = newMessageIndex;
          const statusEl = document.getElementById('processingStatus');
          if (statusEl) {
            statusEl.textContent = statusMessages[messageIndex];
          }
        }
      };
      
      const progressInterval = setInterval(updateProgress, 100);
      
      try {
        const response = await fetch('/api/create-gem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, description })
        });
        
        if (!response.ok) {
          throw new Error('Failed to create GEM');
        }
        
        const data = await response.json();
        
        // Clear interval and complete progress
        clearInterval(progressInterval);
        if (progressBar) {
          progressBar.style.width = '100%';
        }
        
        // Short delay to show completion
        setTimeout(() => {
          document.getElementById('processingModal').classList.remove('show');
          
          // Reset form
          cancelCreateGem();
          
          // Reload to show new component
          window.location.href = '/?component=' + encodeURIComponent(data.filename);
        }, 500);
      } catch (error) {
        clearInterval(progressInterval);
        document.getElementById('processingModal').classList.remove('show');
        console.error('Failed to create GEM:', error);
        alert('Failed to create new GEM: ' + error.message);
      }
    }
    
    // Settings functions
    async function showSettingsModal() {
      // Show modal immediately - no blocking!
      document.getElementById('settingsModal').classList.add('show');
      
      // Show loading state first
      const settingsContent = document.getElementById('settingsContent');
      settingsContent.innerHTML = \`
        <div style="text-align: center; padding: 2rem;">
          <div style="font-size: 2rem; animation: spin 1s linear infinite;">⚙️</div>
          <p style="margin-top: 1rem; opacity: 0.7;">Loading settings...</p>
        </div>
      \`;
      
      try {
        // Load config first (this should be fast)
        const configRes = await fetch('/api/current-config');
        const config = await configRes.json();
        
        // Initialize with unknown status - we'll check async
        const status = { 
          localAvailable: null, 
          networkAvailable: null, 
          openRouterAvailable: null 
        };
        
        // Populate settings content
        const settingsContent = document.getElementById('settingsContent');
        settingsContent.innerHTML = \`
          <div class="settings-tabs">
            <div class="settings-section">
              <h4 style="margin-top: 0; margin-bottom: 1rem;">AI Model Configuration</h4>
              
              <div style="margin-bottom: 1.5rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Model Type:</label>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="modelType" value="claude-code" \${config.defaultModel === 'claude-code' ? 'checked' : ''}>
                    <span>🤖 Claude Code <span id="claudeCodeStatus" style="color: #fbbf24;">(Checking...)</span></span>
                  </label>
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="modelType" value="local" \${config.defaultModel === 'local' ? 'checked' : ''}>
                    <span>🖥️ Local/Network LM Studio <span id="localStatus" style="color: #fbbf24;">(Checking...)</span></span>
                  </label>
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="modelType" value="cloud" \${config.defaultModel === 'cloud' ? 'checked' : ''}>
                    <span>☁️ OpenRouter <span id="cloudStatus" style="color: #fbbf24;">(Checking...)</span></span>
                  </label>
                </div>
              </div>
              
              <div id="localSettings" style="\${config.defaultModel === 'local' ? '' : 'display: none;'}">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Local Endpoint:</label>
                <input type="text" id="localEndpoint" value="\${config.localEndpoint || 'http://10.0.0.237:1234'}"
                  style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                         background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit;">
              </div>
              
              <div id="cloudSettings" style="\${config.defaultModel === 'cloud' ? '' : 'display: none;'}">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">OpenRouter Model:</label>
                <select id="cloudModel" 
                  style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                         background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit; margin-bottom: 1rem;">
                  <option value="">Loading models...</option>
                </select>
                
                <button onclick="showManageModelsModal()" 
                  style="padding: 0.5rem 1rem; background: rgba(103, 126, 234, 0.5); 
                         border: 1px solid rgba(103, 126, 234, 0.6); color: white; 
                         border-radius: 6px; cursor: pointer; transition: all 0.3s;
                         font-size: 0.875rem;">
                  ⚙️ Manage Model List
                </button>
              </div>
              
              <div id="claudeCodeSettings" style="\${config.defaultModel === 'claude-code' ? '' : 'display: none;'}">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Claude Model:</label>
                <select id="claudeCodeModel" 
                  style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); 
                         background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit; margin-bottom: 1rem;">
                  <option value="sonnet-4" \${config.claudeCodeModel === 'sonnet-4' ? 'selected' : ''}>🚀 Claude Sonnet 4 - Fast and capable</option>
                  <option value="opus-4" \${config.claudeCodeModel === 'opus-4' ? 'selected' : ''}>🧠 Claude Opus 4 - Most powerful</option>
                </select>
                
                <div style="padding: 0.75rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); 
                            border-radius: 8px; font-size: 0.875rem; color: #93bbfc;">
                  💡 <strong>No API costs!</strong> Uses your existing Claude subscription through Claude Code CLI.
                </div>
              </div>
            </div>
            
            <div class="settings-section" style="margin-top: 1.5rem;">
              <h4 style="margin-top: 0; margin-bottom: 1rem;">Style Presets</h4>
              
              <div style="margin-bottom: 1.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                  <input type="checkbox" id="stylesEnabled" style="width: 18px; height: 18px;">
                  <span>Enable style presets for component generation</span>
                </label>
              </div>
              
              <div id="stylesContent" style="display: none;">
                <div id="stylesList" style="margin-bottom: 1rem;">
                  <!-- Styles will be populated here -->
                </div>
                
                <button onclick="showCreateStyleModal()" 
                  style="padding: 0.75rem 1.5rem; background: rgba(147, 51, 234, 0.5); 
                         border: 1px solid rgba(147, 51, 234, 0.6); color: white; 
                         border-radius: 8px; cursor: pointer; transition: all 0.3s;">
                  ✨ Create New Style
                </button>
              </div>
              
              <div id="stylesPlaceholder" style="display: none; text-align: center; padding: 2rem;">
                <p style="opacity: 0.7; margin-bottom: 1rem;">No style presets created yet</p>
                <button onclick="showCreateStyleModal()" 
                  style="padding: 0.75rem 1.5rem; background: rgba(147, 51, 234, 0.5); 
                         border: 1px solid rgba(147, 51, 234, 0.6); color: white; 
                         border-radius: 8px; cursor: pointer; transition: all 0.3s;">
                  ✨ Create Your First Style
                </button>
              </div>
            </div>
          </div>
          
          <style>
            .settings-section {
              background: rgba(255, 255, 255, 0.05);
              padding: 1.5rem;
              border-radius: 12px;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .style-item {
              padding: 1rem;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 8px;
              margin-bottom: 0.75rem;
              display: flex;
              align-items: center;
              gap: 1rem;
              transition: all 0.3s;
            }
            
            .style-item:hover {
              background: rgba(255, 255, 255, 0.08);
              border-color: rgba(255, 255, 255, 0.2);
            }
            
            .style-item.active {
              border-color: rgba(147, 51, 234, 0.6);
              background: rgba(147, 51, 234, 0.1);
            }
            
            .style-item input[type="radio"] {
              width: 18px;
              height: 18px;
            }
            
            .style-info {
              flex: 1;
            }
            
            .style-name {
              font-weight: 600;
              margin-bottom: 0.25rem;
            }
            
            .style-description {
              font-size: 0.875rem;
              opacity: 0.7;
            }
            
            .style-actions {
              display: flex;
              gap: 0.5rem;
            }
            
            .style-actions button {
              padding: 0.25rem 0.5rem;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: white;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.75rem;
              transition: all 0.3s;
            }
            
            .style-actions button:hover {
              background: rgba(255, 255, 255, 0.2);
            }
            
            .style-actions button.delete {
              border-color: rgba(239, 68, 68, 0.5);
            }
            
            .style-actions button.delete:hover {
              background: rgba(239, 68, 68, 0.3);
              border-color: rgba(239, 68, 68, 0.7);
            }
          </style>
        \`;
        
        // Add event listener for model type change
        document.querySelectorAll('input[name="modelType"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            document.getElementById('localSettings').style.display = e.target.value === 'local' ? 'block' : 'none';
            document.getElementById('cloudSettings').style.display = e.target.value === 'cloud' ? 'block' : 'none';
            document.getElementById('claudeCodeSettings').style.display = e.target.value === 'claude-code' ? 'block' : 'none';
          });
        });
        
        // Load OpenRouter models immediately if cloud is selected
        if (config.defaultModel === 'cloud') {
          loadOpenRouterModels(config.cloudModel);
        }
        
        // Load style presets
        loadStylePresets();
        
        // Now check endpoints asynchronously (non-blocking)
        checkEndpointsAsync();
        
      } catch (error) {
        console.error('Failed to load settings:', error);
        
        // Show a more helpful error message with retry option
        document.getElementById('settingsContent').innerHTML = \`
          <div style="text-align: center; padding: 2rem;">
            <p style="color: #ef4444; margin-bottom: 1rem;">
              \${error.message === 'Request timeout' 
                ? '⏱️ Settings loading timed out (LM Studio may be offline)'
                : '❌ Failed to load settings'}
            </p>
            <p style="opacity: 0.8; margin-bottom: 1.5rem; font-size: 0.875rem;">
              This usually happens when LM Studio is not responding. 
              You can still use OpenRouter or update your settings.
            </p>
            <button onclick="showSettingsModal()" 
              style="padding: 0.5rem 1rem; background: rgba(103, 126, 234, 0.8); 
                     border: none; color: white; border-radius: 6px; cursor: pointer;
                     transition: all 0.3s;">
              🔄 Retry Loading Settings
            </button>
          </div>
        \`;
        
        // Try to load style presets anyway (they don't depend on LM Studio)
        loadStylePresets();
      }
    }
    
    async function checkEndpointsAsync() {
      try {
        const response = await fetch('/api/check-endpoints');
        const status = await response.json();
        
        // Update Claude Code status
        const claudeCodeStatus = document.getElementById('claudeCodeStatus');
        if (claudeCodeStatus) {
          claudeCodeStatus.innerHTML = status.claudeCodeAvailable 
            ? '<span style="color: #10b981;">(Available)</span>' 
            : '<span style="color: #ef4444;">(Not Available)</span>';
        }
        
        // Update local status
        const localStatus = document.getElementById('localStatus');
        if (localStatus) {
          localStatus.innerHTML = status.localAvailable 
            ? '<span style="color: #10b981;">(Online)</span>' 
            : '<span style="color: #ef4444;">(Offline)</span>';
        }
        
        // Update cloud status
        const cloudStatus = document.getElementById('cloudStatus');
        if (cloudStatus) {
          cloudStatus.innerHTML = status.openRouterAvailable 
            ? '<span style="color: #10b981;">(Available)</span>' 
            : '<span style="color: #ef4444;">(No API Key)</span>';
        }
        
        // If we just discovered OpenRouter is available and cloud is selected, load models
        if (status.openRouterAvailable && document.querySelector('input[name="modelType"]:checked')?.value === 'cloud') {
          const currentModel = document.getElementById('cloudModel')?.getAttribute('data-current-model');
          if (document.getElementById('cloudModel')?.innerHTML === '<option value="">Loading models...</option>') {
            loadOpenRouterModels(currentModel);
          }
        }
      } catch (error) {
        console.error('Failed to check endpoints:', error);
        
        // Update status to show error
        const localStatus = document.getElementById('localStatus');
        if (localStatus) {
          localStatus.innerHTML = '<span style="color: #ef4444;">(Check failed)</span>';
        }
        
        const cloudStatus = document.getElementById('cloudStatus');
        if (cloudStatus) {
          cloudStatus.innerHTML = '<span style="color: #ef4444;">(Check failed)</span>';
        }
      }
    }
    
    async function loadOpenRouterModels(currentModel) {
      try {
        const response = await fetch('/api/get-models');
        const data = await response.json();
        
        const select = document.getElementById('cloudModel');
        
        // Check if we have models array in the response
        if (data.models && Array.isArray(data.models)) {
          if (data.models.length > 0) {
            select.innerHTML = data.models.map(model => 
              \`<option value="\${model.id}" \${model.id === currentModel ? 'selected' : ''}>\${model.name}</option>\`
            ).join('');
          } else {
            select.innerHTML = '<option value="">No models available</option>';
          }
          
          // Update the API key status if provided
          if (data.hasApiKey === false) {
            const radioLabel = document.querySelector('label[for="modelTypeCloud"]');
            if (radioLabel && !radioLabel.textContent.includes('No API Key')) {
              radioLabel.innerHTML = '☁️ OpenRouter <span style="color: #ef4444;">(No API Key)</span>';
            }
          }
        } else {
          // Fallback for old response format
          select.innerHTML = '<option value="">Failed to load models</option>';
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        document.getElementById('cloudModel').innerHTML = '<option value="">Failed to load models</option>';
      }
    }
    
    function cancelSettings() {
      document.getElementById('settingsModal').classList.remove('show');
    }
    
    async function saveSettings() {
      const modelType = document.querySelector('input[name="modelType"]:checked')?.value;
      const localEndpoint = document.getElementById('localEndpoint')?.value;
      const cloudModel = document.getElementById('cloudModel')?.value;
      const claudeCodeModel = document.getElementById('claudeCodeModel')?.value;
      const stylesEnabled = document.getElementById('stylesEnabled')?.checked;
      const activeStyle = document.querySelector('input[name="activeStyle"]:checked')?.value;
      
      try {
        // Save AI model settings
        const response = await fetch('/api/update-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defaultModel: modelType,
            localEndpoint,
            cloudModel,
            claudeCodeModel
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to save settings');
        }
        
        // Save style settings
        await fetch('/api/styles/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: stylesEnabled,
            filename: stylesEnabled ? activeStyle : null
          })
        });
        
        // Close modal
        cancelSettings();
        
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.style.cssText = 'position: fixed; top: 2rem; right: 2rem; background: rgba(16, 185, 129, 0.9); color: white; padding: 1rem 1.5rem; border-radius: 8px; z-index: 3000;';
        successDiv.textContent = '✅ Settings saved successfully!';
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
          successDiv.remove();
        }, 3000);
        
      } catch (error) {
        console.error('Failed to save settings:', error);
        alert('Failed to save settings: ' + error.message);
      }
    }
    
    // Model management functions
    let customModelList = null;
    let allOpenRouterModels = [];
    
    async function showManageModelsModal() {
      document.getElementById('manageModelsModal').classList.add('show');
      
      // Load current custom model list
      try {
        const response = await fetch('/api/custom-models');
        const data = await response.json();
        customModelList = data.models || null;
      } catch {
        customModelList = null;
      }
      
      // Load all available models from OpenRouter
      const availableModelsList = document.getElementById('availableModelsList');
      availableModelsList.innerHTML = \`
        <div style="text-align: center; padding: 2rem;">
          <div style="animation: spin 1s linear infinite;">🔄</div>
          <p style="margin-top: 1rem; opacity: 0.7;">Fetching models from OpenRouter...</p>
        </div>
      \`;
      
      try {
        const apiKey = await fetch('/api/current-config').then(r => r.json()).then(d => d.openRouterKey);
        if (!apiKey) {
          throw new Error('No OpenRouter API key configured');
        }
        
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': \`Bearer \${apiKey}\`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'GEMS'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch models');
        }
        
        const data = await response.json();
        allOpenRouterModels = data.data || [];
        
        renderModelLists();
        
      } catch (error) {
        availableModelsList.innerHTML = \`
          <div style="text-align: center; padding: 2rem; color: #ef4444;">
            <p>❌ Failed to load models</p>
            <p style="font-size: 0.875rem; opacity: 0.7; margin-top: 0.5rem;">\${error.message}</p>
          </div>
        \`;
      }
    }
    
    function renderModelLists() {
      const searchTerm = document.getElementById('modelSearch').value.toLowerCase();
      const availableModelsList = document.getElementById('availableModelsList');
      const quickModelsList = document.getElementById('quickModelsList');
      
      // Get current quick list (either custom or default)
      const quickList = customModelList || [
        { id: 'x-ai/grok-4', name: '🌟 Grok-4' },
        { id: 'anthropic/claude-sonnet-4', name: '🚀 Claude Sonnet 4' },
        { id: 'openai/gpt-4o', name: '⚡ GPT-4o' },
        { id: 'openai/o3-mini', name: '✨ o3-mini' },
        { id: 'google/gemini-2.5-flash', name: '🏃 Gemini 2.5 Flash' },
        { id: 'google/gemini-2.5-pro', name: '🧠 Gemini 2.5 Pro' },
        { id: 'anthropic/claude-3.5-sonnet', name: '💬 Claude 3.5 Sonnet' },
        { id: 'anthropic/claude-3.7-sonnet', name: '🎯 Claude 3.7 Sonnet' },
        { id: 'meta-llama/llama-3-70b-instruct', name: '🦙 Llama 3 70B' }
      ];
      
      // Filter out models already in quick list
      const quickListIds = quickList.map(m => m.id);
      const availableModels = allOpenRouterModels
        .filter(m => !quickListIds.includes(m.id))
        .filter(m => searchTerm === '' || m.id.toLowerCase().includes(searchTerm));
      
      // Render available models
      availableModelsList.innerHTML = availableModels.length === 0 
        ? '<div style="text-align: center; padding: 2rem; opacity: 0.5;">No models found</div>'
        : availableModels.map(model => \`
            <div style="padding: 0.75rem; margin-bottom: 0.5rem; background: rgba(255, 255, 255, 0.05); 
                        border-radius: 6px; cursor: pointer; transition: all 0.3s;
                        display: flex; justify-content: space-between; align-items: center;"
                 onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'"
                 onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
              <div>
                <div style="font-weight: 500;">\${model.id}</div>
                <div style="font-size: 0.75rem; opacity: 0.7;">
                  Context: \${(model.context_length / 1000).toFixed(0)}k
                  \${model.pricing?.prompt === 0 ? ' • Free' : ''}
                </div>
              </div>
              <button onclick="addToQuickList('\${model.id}')" 
                style="padding: 0.25rem 0.75rem; background: rgba(103, 126, 234, 0.5); 
                       border: none; color: white; border-radius: 4px; cursor: pointer;
                       font-size: 0.75rem;">
                + Add
              </button>
            </div>
          \`).join('');
      
      // Render quick list
      quickModelsList.innerHTML = quickList.length === 0
        ? '<div style="text-align: center; padding: 2rem; opacity: 0.5;">No models in quick list</div>'
        : quickList.map((model, index) => \`
            <div style="padding: 0.75rem; margin-bottom: 0.5rem; background: rgba(255, 255, 255, 0.05); 
                        border-radius: 6px; cursor: move; transition: all 0.3s;
                        display: flex; justify-content: space-between; align-items: center;"
                 draggable="true" data-index="\${index}">
              <div>
                <div style="font-weight: 500;">\${model.name || model.id}</div>
                <div style="font-size: 0.75rem; opacity: 0.7;">\${model.id}</div>
              </div>
              <button onclick="removeFromQuickList(\${index})" 
                style="padding: 0.25rem 0.5rem; background: rgba(239, 68, 68, 0.5); 
                       border: none; color: white; border-radius: 4px; cursor: pointer;
                       font-size: 0.875rem;">
                ×
              </button>
            </div>
          \`).join('');
      
      // Set up drag and drop for reordering
      setupDragAndDrop();
    }
    
    function addToQuickList(modelId) {
      const model = allOpenRouterModels.find(m => m.id === modelId);
      if (!model) return;
      
      // Create a nice name for the model
      let name = modelId;
      let icon = '🤖';
      
      if (modelId.includes('grok')) {
        icon = '🌟';
        name = modelId.replace('x-ai/', '').replace(/-/g, ' ');
      } else if (modelId.includes('claude')) {
        icon = '🚀';
        name = modelId.replace('anthropic/', '').replace(/-/g, ' ');
      } else if (modelId.includes('gpt')) {
        icon = '⚡';
        name = modelId.replace('openai/', '').replace(/-/g, ' ');
      } else if (modelId.includes('gemini')) {
        icon = '🏃';
        name = modelId.replace('google/', '').replace(/-/g, ' ');
      }
      
      name = icon + ' ' + name.charAt(0).toUpperCase() + name.slice(1);
      
      if (!customModelList) {
        // Initialize with current defaults
        customModelList = [
          { id: 'x-ai/grok-4', name: '🌟 Grok-4' },
          { id: 'anthropic/claude-sonnet-4', name: '🚀 Claude Sonnet 4' },
          { id: 'openai/gpt-4o', name: '⚡ GPT-4o' },
          { id: 'openai/o3-mini', name: '✨ o3-mini' },
          { id: 'google/gemini-2.5-flash', name: '🏃 Gemini 2.5 Flash' },
          { id: 'google/gemini-2.5-pro', name: '🧠 Gemini 2.5 Pro' },
          { id: 'anthropic/claude-3.5-sonnet', name: '💬 Claude 3.5 Sonnet' },
          { id: 'anthropic/claude-3.7-sonnet', name: '🎯 Claude 3.7 Sonnet' },
          { id: 'meta-llama/llama-3-70b-instruct', name: '🦙 Llama 3 70B' }
        ];
      }
      
      customModelList.push({ id: modelId, name });
      renderModelLists();
    }
    
    function removeFromQuickList(index) {
      if (!customModelList) {
        customModelList = [
          { id: 'x-ai/grok-4', name: '🌟 Grok-4' },
          { id: 'anthropic/claude-sonnet-4', name: '🚀 Claude Sonnet 4' },
          { id: 'openai/gpt-4o', name: '⚡ GPT-4o' },
          { id: 'openai/o3-mini', name: '✨ o3-mini' },
          { id: 'google/gemini-2.5-flash', name: '🏃 Gemini 2.5 Flash' },
          { id: 'google/gemini-2.5-pro', name: '🧠 Gemini 2.5 Pro' },
          { id: 'anthropic/claude-3.5-sonnet', name: '💬 Claude 3.5 Sonnet' },
          { id: 'anthropic/claude-3.7-sonnet', name: '🎯 Claude 3.7 Sonnet' },
          { id: 'meta-llama/llama-3-70b-instruct', name: '🦙 Llama 3 70B' }
        ];
      }
      
      customModelList.splice(index, 1);
      renderModelLists();
    }
    
    function setupDragAndDrop() {
      const items = document.querySelectorAll('#quickModelsList > div[draggable="true"]');
      let draggedElement = null;
      
      items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
          draggedElement = e.target;
          e.target.style.opacity = '0.5';
        });
        
        item.addEventListener('dragend', (e) => {
          e.target.style.opacity = '';
        });
        
        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          const afterElement = getDragAfterElement(document.getElementById('quickModelsList'), e.clientY);
          if (afterElement == null) {
            document.getElementById('quickModelsList').appendChild(draggedElement);
          } else {
            document.getElementById('quickModelsList').insertBefore(draggedElement, afterElement);
          }
        });
      });
    }
    
    function getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('div[draggable="true"]:not(.dragging)')];
      
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    function cancelManageModels() {
      document.getElementById('manageModelsModal').classList.remove('show');
      customModelList = null;
    }
    
    async function saveModelList() {
      try {
        // Save the custom model list
        await fetch('/api/custom-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ models: customModelList })
        });
        
        // Update the model dropdown in settings
        await loadOpenRouterModels(document.getElementById('cloudModel')?.value);
        
        // Close modal
        cancelManageModels();
        
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.style.cssText = 'position: fixed; top: 2rem; right: 2rem; background: rgba(16, 185, 129, 0.9); color: white; padding: 1rem 1.5rem; border-radius: 8px; z-index: 3000;';
        successDiv.textContent = '✅ Model list updated successfully!';
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
          successDiv.remove();
        }, 3000);
        
      } catch (error) {
        console.error('Failed to save model list:', error);
        alert('Failed to save model list: ' + error.message);
      }
    }
    
    // Add search functionality
    document.addEventListener('DOMContentLoaded', () => {
      const modelSearch = document.getElementById('modelSearch');
      if (modelSearch) {
        modelSearch.addEventListener('input', renderModelLists);
      }
    });
    
    // Style preset functions
    async function loadStylePresets() {
      try {
        const response = await fetch('/api/styles');
        const data = await response.json();
        
        const stylesEnabled = document.getElementById('stylesEnabled');
        const stylesContent = document.getElementById('stylesContent');
        const stylesPlaceholder = document.getElementById('stylesPlaceholder');
        const stylesList = document.getElementById('stylesList');
        
        // Set enabled state
        stylesEnabled.checked = data.enabled;
        
        // Show/hide content based on enabled state
        if (data.enabled) {
          if (data.styles.length > 0) {
            stylesContent.style.display = 'block';
            stylesPlaceholder.style.display = 'none';
          } else {
            stylesContent.style.display = 'none';
            stylesPlaceholder.style.display = 'block';
          }
        } else {
          stylesContent.style.display = 'none';
          stylesPlaceholder.style.display = 'none';
        }
        
        // Populate styles list
        if (data.styles.length > 0) {
          stylesList.innerHTML = data.styles.map(style => \`
            <div class="style-item \${style.filename === data.activePreset ? 'active' : ''}">
              <input type="radio" name="activeStyle" value="\${style.filename}" 
                \${style.filename === data.activePreset ? 'checked' : ''}>
              <div class="style-info">
                <div class="style-name">\${style.name}</div>
                \${style.description ? \`<div class="style-description">\${style.description}</div>\` : ''}
              </div>
              <div class="style-actions">
                <button onclick="editStyle('\${style.filename}')">Edit</button>
                <button onclick="deleteStyle('\${style.filename}')" class="delete">Delete</button>
              </div>
            </div>
          \`).join('');
        }
        
        // Add event listener for enabling/disabling styles
        stylesEnabled.addEventListener('change', (e) => {
          if (e.target.checked) {
            if (data.styles.length > 0) {
              stylesContent.style.display = 'block';
              stylesPlaceholder.style.display = 'none';
            } else {
              stylesContent.style.display = 'none';
              stylesPlaceholder.style.display = 'block';
            }
          } else {
            stylesContent.style.display = 'none';
            stylesPlaceholder.style.display = 'none';
          }
        });
        
      } catch (error) {
        console.error('Failed to load style presets:', error);
      }
    }
    
    async function deleteStyle(filename) {
      if (!confirm('Are you sure you want to delete this style preset?')) {
        return;
      }
      
      try {
        const response = await fetch('/api/styles/' + encodeURIComponent(filename), {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete style');
        }
        
        // Reload styles
        loadStylePresets();
      } catch (error) {
        console.error('Failed to delete style:', error);
        alert('Failed to delete style: ' + error.message);
      }
    }
    
    function showCreateStyleModal() {
      document.getElementById('createStyleModal').classList.add('show');
      document.getElementById('styleName').focus();
    }
    
    function cancelCreateStyle() {
      document.getElementById('createStyleModal').classList.remove('show');
      document.getElementById('styleName').value = '';
      document.getElementById('styleContent').value = '';
    }
    
    async function createStyle() {
      const name = document.getElementById('styleName').value.trim();
      const content = document.getElementById('styleContent').value.trim();
      
      if (!name) {
        alert('Please provide a name for the style preset');
        return;
      }
      
      if (!content) {
        alert('Please provide style guidelines');
        return;
      }
      
      try {
        const response = await fetch('/api/styles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content })
        });
        
        if (!response.ok) {
          throw new Error('Failed to create style');
        }
        
        // Close modal and reload styles
        cancelCreateStyle();
        loadStylePresets();
        
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.style.cssText = 'position: fixed; top: 2rem; right: 2rem; background: rgba(16, 185, 129, 0.9); color: white; padding: 1rem 1.5rem; border-radius: 8px; z-index: 3000;';
        successDiv.textContent = '✅ Style preset created successfully!';
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
          successDiv.remove();
        }, 3000);
        
      } catch (error) {
        console.error('Failed to create style:', error);
        alert('Failed to create style: ' + error.message);
      }
    }
    
    let currentEditingStyle = null;
    
    async function editStyle(filename) {
      try {
        // Fetch the style content
        const response = await fetch('/api/styles/' + encodeURIComponent(filename));
        if (!response.ok) {
          throw new Error('Failed to load style');
        }
        
        const data = await response.json();
        const content = data.content;
        
        // Extract name from content
        const nameMatch = content.match(/^#\s+(.+)$/m);
        const name = nameMatch ? nameMatch[1].trim() : filename.replace('.md', '');
        
        // Set modal values
        document.getElementById('editStyleName').value = name;
        document.getElementById('editStyleContent').value = content;
        
        // Store current editing filename
        currentEditingStyle = filename;
        
        // Show modal
        document.getElementById('editStyleModal').classList.add('show');
        document.getElementById('editStyleContent').focus();
        
      } catch (error) {
        console.error('Failed to load style for editing:', error);
        alert('Failed to load style: ' + error.message);
      }
    }
    
    function cancelEditStyle() {
      document.getElementById('editStyleModal').classList.remove('show');
      document.getElementById('editStyleName').value = '';
      document.getElementById('editStyleContent').value = '';
      currentEditingStyle = null;
    }
    
    async function saveEditedStyle() {
      if (!currentEditingStyle) {
        alert('No style selected for editing');
        return;
      }
      
      const content = document.getElementById('editStyleContent').value.trim();
      
      if (!content) {
        alert('Please provide style guidelines');
        return;
      }
      
      try {
        // First delete the old file
        await fetch('/api/styles/' + encodeURIComponent(currentEditingStyle), {
          method: 'DELETE'
        });
        
        // Extract name from content or use filename
        const nameMatch = content.match(/^#\s+(.+)$/m);
        const name = nameMatch ? nameMatch[1].trim() : currentEditingStyle.replace('.md', '');
        
        // Create new file with same name
        const response = await fetch('/api/styles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content })
        });
        
        if (!response.ok) {
          throw new Error('Failed to save style');
        }
        
        // Close modal and reload styles
        cancelEditStyle();
        loadStylePresets();
        
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.style.cssText = 'position: fixed; top: 2rem; right: 2rem; background: rgba(16, 185, 129, 0.9); color: white; padding: 1rem 1.5rem; border-radius: 8px; z-index: 3000;';
        successDiv.textContent = '✅ Style updated successfully!';
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
          successDiv.remove();
        }, 3000);
        
      } catch (error) {
        console.error('Failed to save edited style:', error);
        alert('Failed to save style: ' + error.message);
      }
    }
    
    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const component = urlParams.get('component');
      if (component) {
        loadComponent(component);
      }
    });
    
    // Close modal on outside click
    document.getElementById('deleteModal').addEventListener('click', (e) => {
      if (e.target.id === 'deleteModal') {
        cancelDelete();
      }
    });
    
    document.getElementById('shardModal').addEventListener('click', (e) => {
      if (e.target.id === 'shardModal') {
        cancelShard();
      }
    });
    
    document.getElementById('createGemModal').addEventListener('click', (e) => {
      if (e.target.id === 'createGemModal') {
        cancelCreateGem();
      }
    });
    
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') {
        cancelSettings();
      }
    });
    
    document.getElementById('createStyleModal').addEventListener('click', (e) => {
      if (e.target.id === 'createStyleModal') {
        cancelCreateStyle();
      }
    });
    
    document.getElementById('editStyleModal').addEventListener('click', (e) => {
      if (e.target.id === 'editStyleModal') {
        cancelEditStyle();
      }
    });
    
    // Set up event delegation for file list clicks
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      const fileList = document.querySelector('.file-list');
      console.log('Setting up file list event handlers, fileList found:', !!fileList);
      
      if (fileList) {
        fileList.addEventListener('click', (e) => {
          console.log('File list clicked, target:', e.target);
          
          // Handle file content clicks (for switching components)
          const fileContent = e.target.closest('.file-content');
          if (fileContent) {
            e.preventDefault();
            e.stopPropagation();
            const path = fileContent.dataset.path;
            console.log('File content clicked, path:', path);
            if (path) {
              loadComponent(path);
            }
            return;
          }
          
          // Handle action button clicks
          const button = e.target.closest('button');
          if (button && button.dataset.path) {
            e.preventDefault();
            e.stopPropagation();
            const path = button.dataset.path;
            console.log('Button clicked:', button.className, 'for path:', path);
            
            if (button.classList.contains('copy')) {
              copyComponent(path);
            } else if (button.classList.contains('rename')) {
              renameComponent(path);
            } else if (button.classList.contains('delete')) {
              deleteComponent(path);
            }
          }
        });
        
        // Also add direct click handlers to buttons as a fallback
        document.querySelectorAll('.file-actions button').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const button = e.target;
            const path = button.dataset.path;
            console.log('Direct button click:', button.className, 'for path:', path);
            
            if (path) {
              if (button.classList.contains('copy')) {
                copyComponent(path);
              } else if (button.classList.contains('rename')) {
                renameComponent(path);
              } else if (button.classList.contains('delete')) {
                deleteComponent(path);
              }
            }
          });
        });
      } else {
        console.error('File list not found!');
      }
    }, 100);
    
    // Attach handlers at the very end, after all functions are defined
    document.querySelectorAll('.file-content').forEach(el => {
      el.onclick = function(e) {
        e.preventDefault();
        const path = this.dataset.path;
        if (path) {
          loadComponent(path);
        }
      };
    });
    
    document.querySelectorAll('.file-actions button').forEach(btn => {
      btn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        const path = this.dataset.path;
        
        if (path) {
          if (this.classList.contains('copy')) {
            copyComponent(path);
          } else if (this.classList.contains('rename')) {
            renameComponent(path);
          } else if (this.classList.contains('delete')) {
            deleteComponent(path);
          }
        }
      };
    });
  </script>
</body>
</html>
    `.trim();
  }
  
  private cleanHtmlForPreview(html: string): string {
    // For the preview iframe, we want to show the full generated HTML
    // but remove the GEMS header and toolbar to avoid duplication
    // since those are already in the preview server's main interface
    
    // Remove the GEMS header
    html = html.replace(/<header class="gems-header">[\s\S]*?<\/header>/g, '');
    
    // Remove the GEMS toolbar and ALL scripts that follow it (including copy functions)
    const toolbarIndex = html.indexOf('<div class="gems-toolbar">');
    if (toolbarIndex !== -1) {
      // Find the closing body tag
      const bodyCloseIndex = html.indexOf('</body>', toolbarIndex);
      if (bodyCloseIndex !== -1) {
        // Remove everything from toolbar to just before </body>
        html = html.substring(0, toolbarIndex) + html.substring(bodyCloseIndex);
      }
    }
    
    // Adjust padding since we removed header/toolbar
    html = html.replace('padding-top: 80px;', 'padding-top: 20px;');
    html = html.replace('padding-bottom: 100px;', 'padding-bottom: 20px;');
    
    return html;
  }
}