import { createServer, IncomingMessage, ServerResponse } from 'http';
import { join, extname } from 'path';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { createElementorComponent } from '../utils/componentMinifier.js';

export interface PreviewServerOptions {
  port?: number;
  component?: string;
}

export class PreviewServer {
  private server?: ReturnType<typeof createServer>;
  
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
    const fileList = componentFiles.map(f => ({
      name: f.name.replace('.html', ''),
      path: f.name,
      time: f.time.toLocaleString()
    }));
    
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
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    
    .file-item:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateX(5px);
      border-color: rgba(255, 255, 255, 0.2);
    }
    
    .file-item.active {
      background: rgba(103, 126, 234, 0.2);
      border: 1px solid transparent;
      animation: rainbow-border 3s linear infinite;
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
               onclick="loadComponent('${file.path}')">
            <div class="file-name">${file.name}</div>
            <div class="file-time">${file.time}</div>
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
        <iframe class="preview-frame" src="/generated/${selectedComponent}"></iframe>
      ` : `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; opacity: 0.5;">
          <p>Select a component to preview</p>
        </div>
      `}
    </main>
  </div>
  
  <script>
    function loadComponent(path) {
      window.location.href = '/?component=' + encodeURIComponent(path);
    }
    
    // Get current component from URL
    const urlParams = new URLSearchParams(window.location.search);
    const currentComponent = urlParams.get('component');
    if (currentComponent) {
      // Update active state
      document.querySelectorAll('.file-item').forEach(item => {
        if (item.onclick.toString().includes(currentComponent)) {
          item.classList.add('active');
        }
      });
    }
  </script>
</body>
</html>
    `.trim();
  }
  
  private cleanHtmlForPreview(html: string): string {
    // Extract the custom element name from the stored elementName variable
    const elementNameMatch = html.match(/const elementName = ["']([^"']+)["']/);
    const elementName = elementNameMatch ? elementNameMatch[1] : null;
    
    // Find the component tag - look for custom element pattern
    let componentTag = '';
    if (elementName) {
      const componentRegex = new RegExp(`<${elementName}[^>]*>(?:.*?)<\/${elementName}>`, 's');
      const match = html.match(componentRegex);
      componentTag = match ? match[0] : `<${elementName}></${elementName}>`;
    } else {
      // Fallback: try to find any custom element
      const customElementMatch = html.match(/<([a-z]+-[a-z-]+)(?:[^>]*)>(?:.*?)<\/\1>/);
      componentTag = customElementMatch ? customElementMatch[0] : '';
    }
    
    // Extract the JS file path
    const scriptMatch = html.match(/<script src="([^"]+\.js)"><\/script>/);
    const scriptSrc = scriptMatch ? scriptMatch[1] : '';
    
    // Create a minimal preview HTML
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Preview</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
    }
    
    /* Ensure component is visible and centered */
    body > * {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  ${scriptSrc ? `<script src="${scriptSrc}"></script>` : ''}
  ${componentTag || '<p>Component could not be loaded</p>'}
</body>
</html>`;
  }
}