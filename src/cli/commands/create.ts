import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { ComponentGenerator } from '../../generators/ComponentGenerator.js';
import { AIService } from '../../services/ai/AIService.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { TerminalEffects } from '../../utils/terminalEffects.js';

export const createCommand = new Command('create')
  .description('Create a new component')
  .argument('[type]', 'Component type (hero, nav, cta, etc.)')
  .argument('[description]', 'Natural language description')
  .addHelpText('after', `
  
Examples:
  $ gems create hero "Modern hero section with animated gradient background"
  $ gems create nav "Responsive navigation bar with dropdown menus"
  $ gems create cta "Call-to-action section with large button and testimonial"
  
Note: Put your description in quotes to ensure it's captured correctly.`)
  .option('-b, --brand <brand>', 'Brand/company name')
  .option('-s, --style <style>', 'Visual style (modern, minimal, bold, etc.)')
  .option('-o, --output <format>', 'Output format (webcomponent, react, vue)', 'webcomponent')
  .option('-v, --variations <number>', 'Number of variations to generate', '1')
  .option('--voice', 'Use voice input')
  .option('--from-screenshot <path>', 'Generate from screenshot')
  .option('--model <model>', 'AI model to use (claude-code, claude-code-sonnet, claude-code-opus, local, cloud)')
  .option('--save <name>', 'Save to component library')
  .option('--no-preview', 'Skip auto-preview after generation')
  .action(async (type, description, options) => {
    try {
      // Get component type and description
      let componentType = type;
      let componentDescription = description;
      
      // If type looks like a description (long text), treat it as custom with description
      if (componentType && componentType.split(' ').length > 3) {
        componentDescription = componentType;
        componentType = 'custom';
      }
      
      if (!componentType) {
        const response = await prompts({
          type: 'select',
          name: 'type',
          message: 'What type of component would you like to create?',
          choices: [
            { title: '🏔️  Hero Section', value: 'hero' },
            { title: '🎯  Call-to-Action', value: 'cta' },
            { title: '✨  Features Grid', value: 'features' },
            { title: '💬  Testimonial', value: 'testimonial' },
            { title: '💳  Pricing Table', value: 'pricing' },
            { title: '❓  FAQ Section', value: 'faq' },
            { title: '✏️  Custom Component', value: 'custom' }
          ]
        });
        
        componentType = response.type;
        
        if (!componentType) {
          console.log(chalk.yellow('Component creation cancelled.'));
          return;
        }
      }
      
      // Get description if not provided or if custom type
      if (!componentDescription) {
        const message = componentType === 'custom' 
          ? 'Describe the component you want to create:'
          : `Describe the ${componentType} component you want to create:`;
          
        const response = await prompts({
          type: 'text',
          name: 'description',
          message,
          validate: (value: string) => value.length > 0 || 'Please provide a description'
        });
        
        componentDescription = response.description;
        
        if (!componentDescription) {
          console.log(chalk.yellow('Component creation cancelled.'));
          return;
        }
      }
      
      // Get brand/style if not provided
      if (!options.brand) {
        // Check available styles
        const stylesDir = join(process.cwd(), 'styles');
        let styleChoices: Array<{ title: string; value: string | null }> = [];
        
        if (existsSync(stylesDir)) {
          const files = readdirSync(stylesDir)
            .filter(f => f.endsWith('.md') && f !== 'STYLE_TEMPLATE.md' && f !== '.gitkeep');
          
          if (files.length > 0) {
            styleChoices = files.map(f => ({
              title: f.replace('.md', '').replace(/-/g, ' '),
              value: f
            }));
            
            styleChoices.push({
              title: 'No brand style (generic)',
              value: null
            });
          }
        }
        
        if (styleChoices.length > 0) {
          const response = await prompts({
            type: 'select',
            name: 'styleFile',
            message: 'Select brand style:',
            choices: styleChoices
          });
          
          if (response.styleFile) {
            // Read the style file content
            const styleContent = readFileSync(join(stylesDir, response.styleFile), 'utf-8');
            options.brand = response.styleFile.replace('.md', '');
            (options as any).styleContent = styleContent;
          }
        }
      }
      
      // Initialize services
      const config = new ConfigManager();
      const aiService = new AIService(config);
      const generator = new ComponentGenerator(aiService);
      
      // Parse model type from options
      let modelType = options.model || config.get('ai.defaultModel');
      let claudeCodeModel = undefined;
      
      // Handle claude-code model variations
      if (modelType === 'claude-code-sonnet') {
        modelType = 'claude-code';
        claudeCodeModel = 'sonnet-4';
      } else if (modelType === 'claude-code-opus') {
        modelType = 'claude-code';
        claudeCodeModel = 'opus-4';
      }
      
      // If claude-code model is specified, update config temporarily
      if (claudeCodeModel) {
        config.set('ai.claudeCode.model', claudeCodeModel);
      }
      
      // Use terminal effects for generation with source info
      const sourceInfo: any = { type: modelType };
      
      // Add model details
      if (modelType === 'claude-code') {
        sourceInfo.model = `Claude ${claudeCodeModel || config.get('ai.claudeCode.model') || 'sonnet-4'}`;
        sourceInfo.endpoint = 'Local CLI';
      } else if (modelType === 'cloud') {
        sourceInfo.model = config.get('ai.openrouter.model') || 'OpenRouter';
      } else {
        sourceInfo.model = config.get('ai.local.model') || 'Local Model';
        sourceInfo.endpoint = config.get('ai.local.endpoint');
      }
      
      const stopAnimation = await TerminalEffects.showGeneratingAnimation(
        componentType, 
        componentDescription || '',
        sourceInfo
      );
      
      // Generate component
      const component = await generator.generate({
        type: componentType,
        description: componentDescription,
        brand: options.brand,
        style: options.style,
        styleContent: (options as any).styleContent,
        outputFormat: options.output,
        variations: parseInt(options.variations),
        model: modelType,
        screenshot: options.fromScreenshot
      });
      
      // Get the actual source used
      const actualSource = (generator as any).lastSource;
      
      // Stop animation and show success
      stopAnimation();
      TerminalEffects.showSuccess(component, actualSource);
      
      if (options.save) {
        // Save to component library
        console.log(chalk.green(`💾 Saved to library as: ${options.save}`));
      }
      
      // Auto-preview if enabled
      if (options.preview !== false && component.files.length > 0) {
        // Find the HTML file
        const htmlFile = component.files.find(f => f.path.endsWith('.html'));
        if (htmlFile) {
          // Start the preview server instead of opening the file directly
          const PreviewServer = (await import('../../preview/PreviewServer.js')).PreviewServer;
          const server = new PreviewServer();
          
          try {
            const fileName = htmlFile.path.split('/').pop() || '';
            const url = await server.start({
              port: 3000,
              component: fileName
            });
            
            console.log(chalk.cyan(`\n🌐 Preview server running at: ${chalk.white(url)}`));
            console.log(chalk.gray('Press Ctrl+C to stop the server\n'));
            
            // Open browser
            const open = (await import('open')).default;
            await open(url);
            
            // Keep process running
            process.on('SIGINT', () => {
              console.log(chalk.yellow('\n\nShutting down preview server...'));
              server.stop();
              process.exit(0);
            });
          } catch (error) {
            console.log(chalk.yellow('Could not start preview server. You can manually run:'));
            console.log(chalk.gray(`   gems preview --component ${htmlFile.path.split('/').pop()}`));
          }
        }
      }
      
    } catch (error) {
      // Clear any animation if running
      process.stdout.write('\x1B[?25h'); // Show cursor
      console.error(chalk.red('\n❌ Failed to generate component'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });