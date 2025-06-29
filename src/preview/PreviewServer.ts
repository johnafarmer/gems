import { createServer, IncomingMessage, ServerResponse } from 'http';
import { join, extname } from 'path';
import { readFileSync, existsSync, readdirSync, statSync, unlinkSync, renameSync, writeFileSync } from 'fs';

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
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.getIndexHtml(component));
        } else if (pathname === '/api/rename' && req.method === 'POST') {
          // Handle rename
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { oldName, newName } = JSON.parse(body);
              const oldHtml = join(process.cwd(), 'generated', oldName);
              const oldJs = oldHtml.replace('.html', '.js');
              const newHtml = join(process.cwd(), 'generated', newName);
              const newJs = newHtml.replace('.html', '.js');
              
              if (existsSync(oldHtml)) renameSync(oldHtml, newHtml);
              if (existsSync(oldJs)) renameSync(oldJs, newJs);
              
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
              
              // Create AI prompt for modification
              const modificationPrompt = `Given this existing web component code, modify it according to this request: "${prompt}"
              
              Original component code:
              ${originalJs}
              
              Important: 
              - Maintain the same component structure and element name
              - Apply the requested modifications
              - Keep all existing functionality unless specifically asked to change
              
              CRITICAL: Return ONLY the modified JavaScript code. Do not include any explanations, descriptions, or text before or after the code. The response should start with "class" and end with "customElements.define". Output the code in a JavaScript code block using \`\`\`javascript\`\`\`.`;
              
              // Use AI service to generate modified version
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const { AIService } = await import('../services/ai/AIService.js');
              const config = new ConfigManager();
              const aiService = new AIService(config);
              
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
              
              // Validate the modified code
              const { ComponentValidator } = await import('../validators/ComponentValidator.js');
              const validator = new ComponentValidator();
              const validation = validator.validate(cleanCode);
              
              if (!validation.isValid) {
                console.log('🔧 Shard validation failed, attempting auto-fix...');
                
                // Try to auto-fix
                const fixResult = validator.attemptAutoFix(cleanCode);
                if (fixResult.fixed) {
                  console.log('✨ Applied fixes:', fixResult.changes.join(', '));
                  cleanCode = fixResult.code;
                  
                  // Re-validate
                  const revalidation = validator.validate(cleanCode);
                  if (!revalidation.isValid) {
                    throw new Error(`Shard generation failed: ${revalidation.errors.join('; ')}`);
                  }
                } else {
                  throw new Error(`Shard generation failed: ${validation.errors.join('; ')}`);
                }
              }
              
              // Create new filenames with version
              const newHtmlName = `${parsed.gemId}-v${nextVersion}.html`;
              const newJsName = `${parsed.gemId}-v${nextVersion}.js`;
              
              // Read original HTML and update script src
              const originalHtml = readFileSync(originalHtmlPath, 'utf-8');
              const newHtml = originalHtml.replace(
                /src="[^"]+\.js"/,
                `src="${newJsName}"`
              );
              
              // Write new files
              writeFileSync(join(generatedDir, newHtmlName), newHtml);
              writeFileSync(join(generatedDir, newJsName), cleanCode);
              
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
              localEndpoint: config.get('ai.local.endpoint')
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
              
              const config = new ConfigManager();
              const aiService = new AIService(config);
              const generator = new ComponentGenerator(aiService);
              
              const result = await generator.generate({
                type: type === 'custom' ? 'component' : type,
                description
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
          (async () => {
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
              const config = new ConfigManager();
              const openRouterAvailable = !!config.get('ai.openrouter.key');
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                localAvailable: localAvailable || networkAvailable,
                networkAvailable,
                openRouterAvailable
              }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          })();
        } else if (pathname === '/api/get-models' && req.method === 'GET') {
          // Get available OpenRouter models
          (async () => {
            try {
              const { ConfigManager } = await import('../config/ConfigManager.js');
              const config = new ConfigManager();
              const apiKey = config.get('ai.openrouter.key');
              
              if (!apiKey) {
                throw new Error('OpenRouter API key not configured');
              }
              
              // Return a curated list of popular models
              const models = [
                { id: 'anthropic/claude-sonnet-4', name: '🚀 Claude Sonnet 4' },
                { id: 'openai/gpt-4o', name: '⚡ GPT-4o' },
                { id: 'openai/o3-mini', name: '✨ o3-mini' },
                { id: 'google/gemini-2.5-flash', name: '🏃 Gemini 2.5 Flash' },
                { id: 'google/gemini-2.5-pro', name: '🧠 Gemini 2.5 Pro' },
                { id: 'anthropic/claude-3.5-sonnet', name: '💬 Claude 3.5 Sonnet' },
                { id: 'anthropic/claude-3.7-sonnet', name: '🎯 Claude 3.7 Sonnet' },
                { id: 'meta-llama/llama-3-70b-instruct', name: '🦙 Llama 3 70B' }
              ];
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(models));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
          })();
        } else if (pathname === '/api/update-config' && req.method === 'POST') {
          // Update configuration
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { defaultModel, localEndpoint, cloudModel } = JSON.parse(body);
              
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
        } else if (pathname.startsWith('/generated/')) {
          // Serve files from generated directory
          const filePath = join(process.cwd(), pathname.slice(1));
          if (existsSync(filePath)) {
            const ext = extname(filePath);
            
            // For HTML files in preview mode, serve a cleaned version
            if (ext === '.html' && req.headers.referer) {
              const htmlContent = readFileSync(filePath, 'utf-8');
              const cleanedHtml = this.cleanHtmlForPreview(htmlContent);
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(cleanedHtml);
            } else {
              const contentType = ext === '.js' ? 'application/javascript' : 
                                 ext === '.html' ? 'text/html' : 
                                 'text/plain';
              res.writeHead(200, { 'Content-Type': contentType });
              res.end(readFileSync(filePath));
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
    const gemGroups = new Map<string, Array<{name: string, path: string, time: string, type: string, version: number}>>();
    
    componentFiles.forEach(f => {
      const parsed = this.parseGemFilename(f.name);
      const gemId = parsed.gemId;
      
      if (!gemGroups.has(gemId)) {
        gemGroups.set(gemId, []);
      }
      
      gemGroups.get(gemId)!.push({
        name: f.name.replace('.html', ''),
        path: f.name,
        time: f.time.toLocaleString(),
        type: parsed.type,
        version: parsed.version
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
      border-right: 2px solid transparent;
      animation: rainbow-border 3s linear infinite;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .sidebar::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      animation: rainbow-glow 3s linear infinite;
      pointer-events: none;
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
    }
    
    .create-gem-btn {
      flex: 1;
      padding: 0.75rem 1rem;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.8), rgba(103, 126, 234, 0.8));
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;
      font-weight: 700;
      transition: all 0.3s ease;
      font-size: 0.875rem;
    }
    
    .create-gem-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(147, 51, 234, 0.4);
    }
    
    .settings-btn {
      width: 40px;
      height: 40px;
      padding: 0;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }
    
    .settings-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: rotate(45deg);
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
    
    .file-item.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: linear-gradient(to bottom, var(--rainbow-1), var(--rainbow-7));
      animation: rainbow-gradient 3s linear infinite;
    }
    
    @keyframes rainbow-gradient {
      0% { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    }
    
    .file-item.newest {
      position: relative;
    }
    
    .file-item.newest::after {
      content: '✨ NEW';
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      font-size: 0.75rem;
      background: linear-gradient(45deg, var(--rainbow-1), var(--rainbow-7));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 700;
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
    
    /* New SHARD button */
    .new-shard-btn {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      padding: 1rem 1.5rem;
      background: linear-gradient(135deg, rgba(103, 126, 234, 0.8), rgba(147, 51, 234, 0.8));
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 12px;
      cursor: pointer;
      font-family: 'OpenDyslexic Nerd Font', 'OpenDyslexicNerdFont', 'OpenDyslexic', system-ui, -apple-system, sans-serif;
      font-weight: 700;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      z-index: 100;
      display: none;
    }
    
    .new-shard-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    }
    
    .new-shard-btn.visible {
      display: block;
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
            ✨ Create New GEM
          </button>
          <button class="settings-btn" onclick="showSettingsModal()" title="Settings">
            ⚙️
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
                ${file.hasVersions ? `<span style="float: right; color: #9333ea;">💎 ${file.versionCount} shards</span>` : ''}
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
  
  <!-- New SHARD button (shows when component is selected) -->
  <button class="new-shard-btn ${selectedComponent ? 'visible' : ''}" onclick="showShardModal()">
    💎 New SHARD
  </button>
  
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
        buttons.forEach(btn => {
          btn.dataset.path = path;
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
      
      // Show/hide New SHARD button
      const shardBtn = document.querySelector('.new-shard-btn');
      if (shardBtn) {
        shardBtn.classList.add('visible');
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
      const activeVersionLink = document.querySelector(\`.version-link[onclick="loadComponent('\${path}')"]\`);
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
    
    async function renameComponent(path) {
      const newName = prompt('Enter new name for the component:', path.replace('.html', ''));
      if (!newName || newName === path.replace('.html', '')) return;
      
      const newFilename = newName.endsWith('.html') ? newName : newName + '.html';
      
      try {
        const response = await fetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldName: path, newName: newFilename })
        });
        
        if (response.ok) {
          // Reload to show updated list
          window.location.reload();
        } else {
          alert('Failed to rename component');
        }
      } catch (error) {
        console.error('Failed to rename:', error);
        alert('Failed to rename component');
      }
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
          if (config.defaultModel === 'cloud') {
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
        
        // Hide processing modal
        document.getElementById('processingModal').classList.remove('show');
        
        // Reset form
        cancelCreateGem();
        
        // Reload to show new component
        window.location.href = '/?component=' + encodeURIComponent(data.filename);
      } catch (error) {
        document.getElementById('processingModal').classList.remove('show');
        console.error('Failed to create GEM:', error);
        alert('Failed to create new GEM: ' + error.message);
      }
    }
    
    // Settings functions
    async function showSettingsModal() {
      document.getElementById('settingsModal').classList.add('show');
      
      // Load current settings
      try {
        const [configRes, statusRes] = await Promise.all([
          fetch('/api/current-config'),
          fetch('/api/check-endpoints')
        ]);
        
        const config = await configRes.json();
        const status = await statusRes.json();
        
        // Populate settings content
        const settingsContent = document.getElementById('settingsContent');
        settingsContent.innerHTML = \`
          <div class="settings-tabs">
            <div class="settings-section">
              <h4 style="margin-top: 0; margin-bottom: 1rem;">AI Model Configuration</h4>
              
              <div style="margin-bottom: 1.5rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; opacity: 0.8;">Model Type:</label>
                <div style="display: flex; gap: 1rem;">
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="modelType" value="local" \${config.defaultModel === 'local' ? 'checked' : ''}>
                    <span>🖥️ Local/Network LM Studio \${status.localAvailable ? '<span style="color: #10b981;">(Online)</span>' : '<span style="color: #ef4444;">(Offline)</span>'}</span>
                  </label>
                  <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="radio" name="modelType" value="cloud" \${config.defaultModel === 'cloud' ? 'checked' : ''}>
                    <span>☁️ OpenRouter \${status.openRouterAvailable ? '<span style="color: #10b981;">(Available)</span>' : '<span style="color: #ef4444;">(No API Key)</span>'}</span>
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
                         background: rgba(255, 255, 255, 0.1); color: white; font-family: inherit;">
                  <option value="">Loading models...</option>
                </select>
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
          </style>
        \`;
        
        // Add event listener for model type change
        document.querySelectorAll('input[name="modelType"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            document.getElementById('localSettings').style.display = e.target.value === 'local' ? 'block' : 'none';
            document.getElementById('cloudSettings').style.display = e.target.value === 'cloud' ? 'block' : 'none';
          });
        });
        
        // Load OpenRouter models if cloud is selected
        if (config.defaultModel === 'cloud' || status.openRouterAvailable) {
          loadOpenRouterModels(config.cloudModel);
        }
        
      } catch (error) {
        console.error('Failed to load settings:', error);
        document.getElementById('settingsContent').innerHTML = '<p style="color: #ef4444;">Failed to load settings</p>';
      }
    }
    
    async function loadOpenRouterModels(currentModel) {
      try {
        const response = await fetch('/api/get-models');
        const models = await response.json();
        
        const select = document.getElementById('cloudModel');
        select.innerHTML = models.map(model => 
          \`<option value="\${model.id}" \${model.id === currentModel ? 'selected' : ''}>\${model.name}</option>\`
        ).join('');
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
      
      try {
        const response = await fetch('/api/update-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defaultModel: modelType,
            localEndpoint,
            cloudModel
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to save settings');
        }
        
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