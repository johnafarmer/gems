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
              - Return only the modified JavaScript code`;
              
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
              
              // Extract just the JavaScript code from the response
              const codeMatch = modifiedCode.match(/```(?:javascript|js)?\n([\s\S]*?)\n```/);
              const cleanCode = codeMatch ? codeMatch[1] : modifiedCode;
              
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
      font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;
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
      font-family: 'OpenDyslexic Mono', monospace;
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
      font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;
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
      font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;
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
      font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;
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
        <h1 class="logo">GEMS</h1>
        <p class="tagline">Generative Element Management System</p>
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
                ${file.allVersions.slice(0, file.versionCount).map((version, vIndex) => `
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
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.5;">
          <p>Select a component to preview</p>
        </div>
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
               font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;"
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