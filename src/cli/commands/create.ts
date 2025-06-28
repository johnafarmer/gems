import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { join } from 'path';
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
  .option('--model <model>', 'AI model to use (local, cloud)', 'local')
  .option('--save <name>', 'Save to component library')
  .option('--no-preview', 'Skip auto-preview after generation')
  .action(async (type, description, options) => {
    try {
      // Get component type and description
      let componentType = type;
      let componentDescription = description;
      
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
      
      // Get description if custom or not provided
      if (componentType === 'custom' || !componentDescription) {
        const response = await prompts({
          type: 'text',
          name: 'description',
          message: 'Describe the component you want to create:',
          validate: value => value.length > 0 || 'Please provide a description'
        });
        
        componentDescription = response.description;
        
        if (!componentDescription) {
          console.log(chalk.yellow('Component creation cancelled.'));
          return;
        }
      }
      
      // Get brand if not provided
      if (!options.brand) {
        const response = await prompts({
          type: 'text',
          name: 'brand',
          message: 'Brand/company name (optional):',
        });
        
        options.brand = response.brand;
      }
      
      // Initialize services
      const config = new ConfigManager();
      const aiService = new AIService(config);
      const generator = new ComponentGenerator(aiService);
      
      const modelType = options.model || config.get('ai.defaultModel');
      const isLocal = modelType === 'local';
      
      // Use terminal effects for generation
      const stopAnimation = await TerminalEffects.showGeneratingAnimation(
        componentType, 
        componentDescription || ''
      );
      
      // Generate component
      const component = await generator.generate({
        type: componentType,
        description: componentDescription,
        brand: options.brand,
        style: options.style,
        outputFormat: options.output,
        variations: parseInt(options.variations),
        model: options.model,
        screenshot: options.fromScreenshot
      });
      
      // Stop animation and show success
      stopAnimation();
      TerminalEffects.showSuccess(component);
      
      if (options.save) {
        // Save to component library
        console.log(chalk.green(`💾 Saved to library as: ${options.save}`));
      }
      
      // Auto-preview if enabled
      if (options.preview !== false && component.files.length > 0) {
        
        // Find the HTML file
        const htmlFile = component.files.find(f => f.path.endsWith('.html'));
        if (htmlFile) {
          const { exec } = await import('child_process');
          exec(`open "${htmlFile.path}"`, (error) => {
            if (error) {
              console.log(chalk.yellow('Could not auto-open preview. You can manually open:'));
              console.log(chalk.gray(`   ${htmlFile.path}`));
            }
          });
        }
      }
      
    } catch (error) {
      // Clear any animation if running
      process.stdout.write('\x1B[?25h'); // Show cursor
      console.error(chalk.red('\n❌ Failed to generate component'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });