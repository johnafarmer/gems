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
    const response = await this.aiService.generate({ prompt, model: options.model as any });
    
    // Parse the response and extract component code
    const componentCode = this.parseComponentCode(response);
    
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
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      position: relative;
    }
    
    .gems-toolbar {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px;
      border-radius: 8px;
      display: flex;
      gap: 10px;
      z-index: 9999;
    }
    
    .gems-toolbar button {
      background: #667eea;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    
    .gems-toolbar button:hover {
      background: #764ba2;
    }
    
    .gems-toolbar .success {
      background: #10b981;
    }
  </style>
</head>
<body>
  <!-- GEMS Toolbar -->
  <div class="gems-toolbar">
    <button onclick="copyForElementor()">Copy for Elementor</button>
    <button onclick="copyComponent()">Copy Component Code</button>
  </div>

  <!-- Load the web component -->
  <script src="./${componentName}.js"></script>
  
  <!-- Use the component -->
  <${elementName}></${elementName}>
  
  <script>
    // Store the component code for copying
    const componentCode = ${JSON.stringify(jsCode)};
    const elementName = ${JSON.stringify(elementName)};
    
    function copyForElementor() {
      const elementorCode = \`<!-- GEMS Component: \${elementName} -->
<script>
(function() {
  if (customElements.get('\${elementName}')) return;
  ${JSON.stringify(minifiedJs).slice(1, -1)}
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
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('success');
        }, 2000);
      });
    }
    
    function copyComponent() {
      navigator.clipboard.writeText(componentCode).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.textContent = originalText;
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