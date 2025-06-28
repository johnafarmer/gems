import { createServer, IncomingMessage, ServerResponse } from 'http';
import { join, extname } from 'path';
import { readFileSync, existsSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
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
              res.end(JSON.stringify({ error: error.message }));
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
              res.end(JSON.stringify({ error: error.message }));
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
              
              // Minify the JS code (basic minification)
              const minified = jsContent
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
                .replace(/\/\/.*/g, '') // Remove line comments
                .replace(/\s+/g, ' ') // Collapse whitespace
                .replace(/\s*([{}:;,])\s*/g, '$1') // Remove spaces around punctuation
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
    const fileList = componentFiles.map(f => {
      // Extract component type from filename (e.g., hero-1234.html -> hero)
      const componentType = f.name.split('-')[0];
      return {
        name: f.name.replace('.html', ''),
        path: f.name,
        time: f.time.toLocaleString(),
        type: componentType
      };
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
      overflow: hidden;
    }
    
    .file-content {
      cursor: pointer;
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
              <div class="file-type" style="font-size: 0.75rem; opacity: 0.7; text-transform: uppercase; margin-bottom: 0.25rem;">${file.type}</div>
              <div class="file-name">${file.name}</div>
              <div class="file-time">${file.time}</div>
            </div>
            <div class="file-actions">
              <button class="copy" data-path="${file.path}">📋 Copy Code</button>
              <button class="rename" data-path="${file.path}">✏️</button>
              <button class="delete" data-path="${file.path}">🗑️</button>
            </div>
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
  
  <!-- Delete confirmation modal -->
  <div class="modal" id="deleteModal">
    <div class="modal-content">
      <h3 style="margin-top: 0;">⚠️ Delete Component?</h3>
      <p>Are you sure you want to delete <strong id="deleteComponentName"></strong>?</p>
      <p style="font-size: 0.875rem; opacity: 0.7;">This action cannot be undone!</p>
      <div class="modal-buttons">
        <button onclick="cancelDelete()">Cancel</button>
        <button class="confirm" onclick="confirmDelete()">Delete</button>
      </div>
    </div>
  </div>
  
  <script>
    let currentlyLoading = false;
    let componentToDelete = null;
    
    function loadComponent(path) {
      if (currentlyLoading) return;
      
      // Update active state
      document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('active');
      });
      
      const clickedItem = document.querySelector(\`[data-component="\${path}"]\`);
      if (clickedItem) {
        clickedItem.classList.add('active');
      }
      
      // Update URL without reload
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('component', path);
      window.history.pushState({}, '', newUrl);
      
      // Update iframe
      const iframe = document.querySelector('.preview-frame');
      if (iframe) {
        currentlyLoading = true;
        
        // Add loading indicator
        const mainContent = document.querySelector('.main-content');
        mainContent.style.opacity = '0.5';
        mainContent.style.transition = 'opacity 0.2s';
        
        // Load new component
        iframe.src = '/generated/' + path;
        
        iframe.onload = () => {
          mainContent.style.opacity = '1';
          currentlyLoading = false;
        };
      } else {
        // No iframe yet, reload page
        window.location.href = '/?component=' + encodeURIComponent(path);
      }
    }
    
    async function copyComponent(path) {
      try {
        // Fetch component code
        const response = await fetch('/api/component-code?file=' + encodeURIComponent(path));
        const data = await response.json();
        
        // Create WordPress-ready code
        const wordpressCode = \`<!-- GEMS Component: \${data.elementName} -->
<script>
(function() {
  if (customElements.get('\${data.elementName}')) return;
  \${data.minified}
})();
</script>
<\${data.elementName}></\${data.elementName}>
<style>
\${data.elementName} {
  display: block;
  width: 100%;
}
</style>\`;
        
        // Copy to clipboard
        await navigator.clipboard.writeText(wordpressCode);
        
        // Show success state
        const btn = document.querySelector(\`.file-item.active button.copy\`);
        if (btn) {
          const originalText = btn.innerHTML;
          btn.innerHTML = '✅ Copied!';
          btn.classList.add('success');
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('success');
          }, 2000);
        }
      } catch (error) {
        console.error('Failed to copy:', error);
        alert('Failed to copy component code');
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
      componentToDelete = path;
      document.getElementById('deleteComponentName').textContent = path.replace('.html', '');
      document.getElementById('deleteModal').classList.add('show');
    }
    
    function cancelDelete() {
      document.getElementById('deleteModal').classList.remove('show');
      componentToDelete = null;
    }
    
    async function confirmDelete() {
      if (!componentToDelete) return;
      
      try {
        const response = await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: componentToDelete })
        });
        
        if (response.ok) {
          // Reload to show updated list
          window.location.href = '/';
        } else {
          alert('Failed to delete component');
        }
      } catch (error) {
        console.error('Failed to delete:', error);
        alert('Failed to delete component');
      }
      
      cancelDelete();
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
    
    // Set up event delegation for file list clicks
    document.addEventListener('DOMContentLoaded', () => {
      const fileList = document.querySelector('.file-list');
      
      fileList.addEventListener('click', (e) => {
        // Handle file content clicks
        const fileContent = e.target.closest('.file-content');
        if (fileContent) {
          const path = fileContent.dataset.path;
          if (path) loadComponent(path);
          return;
        }
        
        // Handle action button clicks
        const button = e.target.closest('button');
        if (button && button.dataset.path) {
          const path = button.dataset.path;
          
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
    
    // Remove the GEMS toolbar
    html = html.replace(/<div class="gems-toolbar">[\s\S]*?<\/div>\s*<script>[\s\S]*?<\/script>/g, '');
    
    // Adjust padding since we removed header/toolbar
    html = html.replace('padding-top: 80px;', 'padding-top: 20px;');
    html = html.replace('padding-bottom: 100px;', 'padding-bottom: 20px;');
    
    return html;
  }
}