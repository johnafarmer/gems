import { AIService } from '../services/ai/AIService.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { heroTemplate } from '../templates/hero.template.js';
import { ctaTemplate } from '../templates/cta.template.js';
import { featuresTemplate } from '../templates/features.template.js';
import { testimonialTemplate } from '../templates/testimonial.template.js';
import { pricingTemplate } from '../templates/pricing.template.js';
import { faqTemplate } from '../templates/faq.template.js';

export interface GenerateComponentOptions {
  type: string;
  description?: string;
  brand?: string;
  style?: string;
  styleContent?: string;
  outputFormat?: string;
  variations?: number;
  model?: string;
  screenshot?: string;
}

export interface GeneratedComponent {
  files: Array<{
    path: string;
    content: string;
  }>;
  metadata: {
    type: string;
    brand?: string;
    style?: string;
    created: Date;
  };
}

const TEMPLATES: Record<string, any> = {
  hero: heroTemplate,
  cta: ctaTemplate,
  features: featuresTemplate,
  testimonial: testimonialTemplate,
  pricing: pricingTemplate,
  faq: faqTemplate
};

export class ComponentGenerator {
  constructor(private aiService: AIService) {}

  async generate(options: GenerateComponentOptions): Promise<GeneratedComponent> {
    const prompt = this.buildPrompt(options);
    const result = await this.aiService.generateWithSource({ prompt, model: options.model as any });
    
    // Parse the response and extract component code
    const componentCode = this.parseComponentCode(result.content);
    
    // Store the source info for later use
    (this as any).lastSource = result.source;
    
    // Ensure output directory exists in current working directory
    const outputDir = join(process.cwd(), 'generated');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate file paths and content
    const timestamp = Date.now();
    const componentName = `${options.type}-${timestamp}`;
    const files = [
      {
        path: join(outputDir, `${componentName}.js`),
        content: componentCode.javascript || this.getDefaultComponent(options)
      },
      {
        path: join(outputDir, `${componentName}.html`),
        content: componentCode.html || this.getUsageExample(componentName, componentCode.javascript || '', options)
      }
    ];
    
    // Write files to disk
    files.forEach(file => {
      writeFileSync(file.path, file.content);
    });
    
    return {
      files,
      metadata: {
        type: options.type,
        brand: options.brand,
        style: options.style,
        created: new Date()
      }
    };
  }

  private buildPrompt(options: GenerateComponentOptions): string {
    // If we have a custom description, use it as the primary driver
    if (options.description) {
      let prompt = `Generate a web component based on this exact description: "${options.description}".\n\n`;
      
      // Include brand style guidelines if available
      if (options.styleContent) {
        prompt += 'Brand Style Guidelines:\n';
        prompt += '```\n';
        prompt += options.styleContent;
        prompt += '\n```\n\n';
        prompt += 'Use the color palette, typography, and design principles from these brand guidelines.\n\n';
      }
      
      prompt += 'Requirements:\n';
      prompt += '- Use Shadow DOM for encapsulation\n';
      prompt += '- Make it a proper Web Component with customElements.define()\n';
      prompt += '- Include all necessary CSS within the component\n';
      prompt += '- Make it responsive and accessible\n';
      
      if (options.brand) {
        prompt += `- Include the brand name: ${options.brand}\n`;
      }
      
      if (options.style) {
        prompt += `- Visual style: ${options.style}\n`;
      }
      
      prompt += '\nReturn ONLY the JavaScript web component code in a code block.';
      
      return prompt;
    }
    
    // Fall back to template if no description
    const template = TEMPLATES[options.type];
    if (template && template.generatePrompt) {
      return template.generatePrompt(options);
    }
    
    // Default generic prompt
    return `Generate a ${options.type} web component. Create a complete, accessible, and responsive web component for WordPress using Shadow DOM and custom elements.`;
  }
  
  private parseComponentCode(response: string): { javascript?: string; html?: string } {
    // Try multiple code block formats
    const codeBlockRegex = /```(?:javascript|js|html)?\s*([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      // If we have code blocks, extract the first one as the main component
      const mainCode = matches[0][1].trim();
      
      // Check if it's HTML with embedded script
      if (mainCode.includes('<script>') && mainCode.includes('</script>')) {
        // Extract the script content
        const scriptMatch = mainCode.match(/<script>([\s\S]*?)<\/script>/);
        if (scriptMatch) {
          return {
            javascript: scriptMatch[1].trim(),
            html: this.extractUsageExample(mainCode)
          };
        }
      }
      
      return {
        javascript: mainCode,
        html: matches.length > 1 ? matches[1][1].trim() : undefined
      };
    }
    
    // If no code blocks, return the whole response
    return {
      javascript: response,
      html: undefined
    };
  }
  
  private extractUsageExample(htmlCode: string): string {
    // Extract usage example from the HTML
    const usageMatch = htmlCode.match(/<!-- Usage example -->[\s\S]*?(<[^>]+>[\s\S]*?<\/[^>]+>)/);
    if (usageMatch) {
      return usageMatch[1].trim();
    }
    
    // Try to find any custom element usage
    const customElementMatch = htmlCode.match(/<([\w-]+)[\s\S]*?><\/\1>/);
    if (customElementMatch) {
      return customElementMatch[0];
    }
    
    return '';
  }
  
  private getDefaultComponent(options: GenerateComponentOptions): string {
    return `
class ${this.toPascalCase(options.type)}Component extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  connectedCallback() {
    this.shadowRoot.innerHTML = \`
      <style>
        :host {
          display: block;
          padding: 2rem;
          background: #f5f5f5;
          border-radius: 8px;
        }
        h2 {
          color: #333;
          margin: 0 0 1rem 0;
        }
        p {
          color: #666;
          line-height: 1.6;
        }
      </style>
      <div class="component">
        <h2>${this.capitalizeFirst(options.type)} Component</h2>
        <p>Generated component for ${options.brand || 'your brand'}</p>
      </div>
    \`;
  }
}

customElements.define('${options.type}-component', ${this.toPascalCase(options.type)}Component);
`.trim();
  }
  
  private getUsageExample(componentName: string, jsCode: string, options: GenerateComponentOptions): string {
    // Try to extract the actual custom element name from the code
    const defineMatch = jsCode.match(/customElements\.define\(['"`]([\w-]+)['"`]/);
    const elementName = defineMatch ? defineMatch[1] : `${options.type}-component`;
    // Create minified version for Elementor
    const minifiedJs = jsCode
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,=<>+\-*\/!])\s*/g, '$1')
      .trim();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${elementName} - GEMS Component</title>
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
      0% { text-shadow: 0 0 20px var(--rainbow-1); }
      14% { text-shadow: 0 0 20px var(--rainbow-2); }
      28% { text-shadow: 0 0 20px var(--rainbow-3); }
      42% { text-shadow: 0 0 20px var(--rainbow-4); }
      57% { text-shadow: 0 0 20px var(--rainbow-5); }
      71% { text-shadow: 0 0 20px var(--rainbow-6); }
      85% { text-shadow: 0 0 20px var(--rainbow-7); }
      100% { text-shadow: 0 0 20px var(--rainbow-1); }
    }
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      background: #000;
      color: #fff;
      position: relative;
      overflow-x: hidden;
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
      z-index: -1;
    }
    
    @keyframes rotate {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* Component container */
    .component-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      position: relative;
      z-index: 1;
    }
    
    /* GEMS header */
    .gems-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 1.5rem 2rem;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 1000;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .gems-logo {
      font-size: 1.5rem;
      font-weight: 700;
      animation: rainbow-glow 3s linear infinite;
    }
    
    .component-info {
      font-size: 0.875rem;
      opacity: 0.8;
    }
    
    /* Glassmorphism toolbar */
    .gems-toolbar {
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 1rem;
      border-radius: 20px;
      display: flex;
      gap: 1rem;
      z-index: 1000;
      border: 2px solid transparent;
      animation: rainbow-border 3s linear infinite;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    
    .gems-toolbar button {
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      cursor: pointer;
      font-size: 0.875rem;
      font-family: 'OpenDyslexic', system-ui, -apple-system, sans-serif;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    
    .gems-toolbar button:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(103, 126, 234, 0.4);
    }
    
    .gems-toolbar button.success {
      background: rgba(16, 185, 129, 0.3);
      border-color: rgba(16, 185, 129, 0.5);
    }
    
    /* Component wrapper for spacing */
    .component-wrapper {
      width: 100%;
      max-width: 1400px;
      margin: 0 auto;
      padding-top: 80px; /* Space for header */
      padding-bottom: 100px; /* Space for toolbar */
    }
    
    /* Ensure component is visible */
    ${elementName} {
      display: block;
      width: 100%;
    }
  </style>
</head>
<body>
  <!-- GEMS Header -->
  <header class="gems-header">
    <div class="gems-logo">GEMS ✨</div>
    <div class="component-info">${elementName}</div>
  </header>

  <!-- Component Container -->
  <div class="component-container">
    <div class="component-wrapper">
      <!-- Load the web component -->
      <script src="./${componentName}.js"></script>
      
      <!-- Use the component -->
      <${elementName}></${elementName}>
    </div>
  </div>

  <!-- GEMS Toolbar -->
  <div class="gems-toolbar">
    <button onclick="copyForElementor()">✨ Copy for Elementor</button>
    <button onclick="copyComponent()">📄 Copy Component Code</button>
  </div>
  
  <script>
    // Minified component code for Elementor
    const minifiedJs = ${JSON.stringify(minifiedJs)};
    
    // Store the component code for copying
    const componentCode = ${JSON.stringify(jsCode)};
    const elementName = ${JSON.stringify(elementName)};
    
    function copyForElementor() {
      const elementorCode = \`<!-- GEMS Component: \${elementName} -->
<script>
(function() {
  if (customElements.get('\${elementName}')) return;
  \${minifiedJs}
})();
</script>
<\${elementName}></\${elementName}>
<style>
\${elementName} {
  display: block;
  width: 100%;
}
</style>\`;
      
      navigator.clipboard.writeText(elementorCode).then(() => {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('success');
        }, 2000);
      });
    }
    
    function copyComponent() {
      navigator.clipboard.writeText(componentCode).then(() => {
        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('success');
        }, 2000);
      });
    }
  </script>
</body>
</html>`;
  }
  
  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
  
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}