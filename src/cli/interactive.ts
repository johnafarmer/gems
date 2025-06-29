import chalk from 'chalk';
import prompts from 'prompts';
import gradient from 'gradient-string';
import { createCommand } from './commands/create.js';
import { previewCommand } from './commands/preview.js';
import { configCommand } from './commands/config.js';
import { listCommand } from './commands/list.js';
import { aiCommand } from './commands/ai.js';

export async function interactiveMode(): Promise<void> {
  console.log(chalk.gray('\n✨ Welcome to GEMS Interactive Mode ✨\n'));
  
  let shouldExit = false;
  let previewServerRunning = false;
  let previewServerUrl = '';
  
  while (!shouldExit) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          title: gradient.rainbow('🎨 Create Component'),
          value: 'create',
          description: 'Generate a new AI-powered component'
        },
        {
          title: previewServerRunning ? '🌐 Open GEMS Browser' : '🌐 Start GEMS Browser',
          value: 'preview',
          description: previewServerRunning ? 'Open the GEMS browser in your default browser' : 'Start the GEMS browser and open the interface'
        },
        {
          title: '⚙️  Configuration',
          value: 'config',
          description: 'Manage all GEMS settings'
        },
        {
          title: '📚 Component Library',
          value: 'list',
          description: 'Browse saved components'
        },
        {
          title: '🤖 AI Settings',
          value: 'ai',
          description: 'Configure AI models and test connections'
        },
        {
          title: '❓ Help',
          value: 'help',
          description: 'Learn how to use GEMS'
        },
        {
          title: chalk.gray('🚪 Exit'),
          value: 'exit',
          description: 'Return to command line'
        }
      ],
      hint: '- Use arrow keys to navigate -'
    });
    
    if (!action || action === 'exit') {
      shouldExit = true;
      console.log(gradient.rainbow('\n✨ Thanks for using GEMS! ✨\n'));
      break;
    }
    
    console.log(''); // Add spacing
    
    switch (action) {
      case 'create':
        await guidedComponentCreation();
        break;
        
      case 'preview':
        if (previewServerRunning && previewServerUrl) {
          // Server already running, just open the browser
          const open = (await import('open')).default;
          await open(previewServerUrl);
          console.log(chalk.green(`\n✅ Opened GEMS Browser at ${previewServerUrl}`));
        } else {
          // Start the preview server
          try {
            // Import PreviewServer directly to track state
            const { PreviewServer } = await import('../preview/PreviewServer.js');
            const ora = (await import('ora')).default;
            const open = (await import('open')).default;
            
            const spinner = ora(chalk.cyan('Starting preview server...')).start();
            
            const server = new PreviewServer();
            const url = await server.start({
              port: 3000,
              component: undefined
            });
            
            spinner.succeed(chalk.green('Preview server running!'));
            
            previewServerRunning = true;
            previewServerUrl = url;
            
            console.log(chalk.cyan(`\n🌐 Preview available at: ${chalk.white(url)}`));
            console.log(chalk.gray('\nThe server will continue running in the background'));
            
            await open(url);
          } catch (error) {
            console.error(chalk.red('\n✖ Failed to start preview server'));
            console.error(chalk.red(error instanceof Error ? error.message : String(error)));
          }
        }
        break;
        
      case 'config':
        await configurationMenu();
        break;
        
      case 'list':
        // Run list command
        await listCommand.parseAsync(['', '', '']);
        console.log(''); // Add spacing after list
        
        // Ask if they want to preview a component
        const { wantPreview } = await prompts({
          type: 'confirm',
          name: 'wantPreview',
          message: 'Would you like to preview a component?',
          initial: false
        });
        
        if (wantPreview) {
          await previewCommand.parseAsync(['', '', '']);
        }
        break;
        
      case 'ai':
        // Run AI command which already has interactive menu
        await aiCommand.parseAsync(['', '']);
        break;
        
      case 'help':
        showHelp();
        
        // Wait for user to read
        await prompts({
          type: 'text',
          name: 'continue',
          message: 'Press Enter to continue...'
        });
        break;
    }
    
    // Add spacing between menu iterations
    console.log('');
  }
}

async function guidedComponentCreation(): Promise<void> {
  console.log(gradient.rainbow('🎨 Component Creation Wizard\n'));
  
  // Step 1: Component type
  const { componentType } = await prompts({
    type: 'select',
    name: 'componentType',
    message: 'What type of component would you like to create?',
    choices: [
      { title: '🏔️  Hero Section', value: 'hero', description: 'Eye-catching header with CTA' },
      { title: '🎯  Call-to-Action', value: 'cta', description: 'Conversion-focused section' },
      { title: '✨  Features Grid', value: 'features', description: 'Showcase product features' },
      { title: '💬  Testimonial', value: 'testimonial', description: 'Customer reviews & quotes' },
      { title: '💳  Pricing Table', value: 'pricing', description: 'Product/service pricing' },
      { title: '❓  FAQ Section', value: 'faq', description: 'Frequently asked questions' },
      { title: '✏️  Custom Component', value: 'custom', description: 'Describe your own' }
    ]
  });
  
  if (!componentType) {
    console.log(chalk.yellow('Component creation cancelled.'));
    return;
  }
  
  // Step 2: Always get description
  const response = await prompts({
    type: 'text',
    name: 'description',
    message: 'Describe the component you want:',
    initial: componentType === 'custom' ? '' : `A ${componentType} component`,
    validate: (value: string) => value.length > 0 || 'Please provide a description'
  });
  
  if (!response.description) {
    console.log(chalk.yellow('Component creation cancelled.'));
    return;
  }
  
  const description = response.description;
  
  // Build args for create command
  const args = ['', ''];
  if (componentType !== 'custom') {
    args.push(componentType);
  }
  if (description) {
    args.push(description);
  }
  
  // Let the create command handle brand selection and generation
  await createCommand.parseAsync(args);
}


async function configurationMenu(): Promise<void> {
  console.log(chalk.cyan('⚙️  Configuration Menu\n'));
  
  const { configAction } = await prompts({
    type: 'select',
    name: 'configAction',
    message: 'What would you like to configure?',
    choices: [
      {
        title: '🤖 AI Settings',
        value: 'ai',
        description: 'Model selection and endpoints'
      },
      {
        title: '📁 Output Settings',
        value: 'output',
        description: 'Component format and directory'
      },
      {
        title: '👁️  Preview Settings',
        value: 'preview',
        description: 'Port and auto-open preferences'
      },
      {
        title: '📋 View All Settings',
        value: 'list',
        description: 'See current configuration'
      },
      {
        title: '🔄 Reset to Defaults',
        value: 'reset',
        description: 'Restore default settings'
      },
      {
        title: chalk.gray('← Back'),
        value: 'back',
        description: 'Return to main menu'
      }
    ]
  });
  
  if (!configAction || configAction === 'back') {
    return;
  }
  
  switch (configAction) {
    case 'ai':
      // Run AI configuration
      await aiCommand.parseAsync(['', '']);
      break;
      
    case 'output':
      await configureOutput();
      break;
      
    case 'preview':
      await configurePreview();
      break;
      
    case 'list':
      await configCommand.parseAsync(['', '', 'list']);
      await prompts({
        type: 'text',
        name: 'continue',
        message: 'Press Enter to continue...'
      });
      break;
      
    case 'reset':
      const { confirmReset } = await prompts({
        type: 'confirm',
        name: 'confirmReset',
        message: 'Are you sure you want to reset all settings to defaults?',
        initial: false
      });
      
      if (confirmReset) {
        // Create a temporary config command handler
        const { ConfigManager } = await import('../config/ConfigManager.js');
        const config = new ConfigManager();
        config.reset();
        console.log(chalk.green('\n✅ Settings reset to defaults!'));
      }
      break;
  }
  
  // Ask if they want to configure something else
  const { continueConfig } = await prompts({
    type: 'confirm',
    name: 'continueConfig',
    message: 'Would you like to configure something else?',
    initial: true
  });
  
  if (continueConfig) {
    await configurationMenu();
  }
}

async function configureOutput(): Promise<void> {
  const { ConfigManager } = await import('../config/ConfigManager.js');
  const config = new ConfigManager();
  
  console.log(chalk.cyan('\n📁 Output Settings\n'));
  
  const responses = await prompts([
    {
      type: 'select',
      name: 'format',
      message: 'Default output format:',
      choices: [
        { title: 'Web Component', value: 'webcomponent' },
        { title: 'React', value: 'react' },
        { title: 'Vue', value: 'vue' },
        { title: 'Vanilla JS', value: 'vanilla' }
      ],
      initial: config.get('output.format') === 'react' ? 1 : 
               config.get('output.format') === 'vue' ? 2 :
               config.get('output.format') === 'vanilla' ? 3 : 0
    },
    {
      type: 'text',
      name: 'directory',
      message: 'Output directory:',
      initial: config.get('output.directory') || './generated'
    }
  ]);
  
  if (responses.format) {
    config.set('output.format', responses.format);
  }
  
  if (responses.directory) {
    config.set('output.directory', responses.directory);
  }
  
  console.log(chalk.green('\n✅ Output settings updated!'));
}

async function configurePreview(): Promise<void> {
  const { ConfigManager } = await import('../config/ConfigManager.js');
  const config = new ConfigManager();
  
  console.log(chalk.cyan('\n👁️  Preview Settings\n'));
  
  const responses = await prompts([
    {
      type: 'number',
      name: 'port',
      message: 'Preview server port:',
      initial: config.get('preview.port') || 3000,
      validate: (value: number) => value > 0 && value < 65536 || 'Please enter a valid port number'
    },
    {
      type: 'confirm',
      name: 'autoOpen',
      message: 'Automatically open browser after generation?',
      initial: config.get('preview.autoOpen') !== false
    }
  ]);
  
  if (responses.port) {
    config.set('preview.port', responses.port);
  }
  
  if (responses.autoOpen !== undefined) {
    config.set('preview.autoOpen', responses.autoOpen);
  }
  
  console.log(chalk.green('\n✅ Preview settings updated!'));
}

function showHelp(): void {
  console.log(chalk.cyan('\n❓ GEMS Help\n'));
  
  console.log(chalk.white('GEMS (Generative Element Management System)'));
  console.log('Create AI-powered web components for WordPress with ease!\n');
  
  console.log(chalk.yellow('Quick Start:'));
  console.log('1. Run ' + chalk.white('gems') + ' to enter interactive mode');
  console.log('2. Choose ' + chalk.white('Create Component') + ' to generate your first component');
  console.log('3. Select a brand style or go generic');
  console.log('4. Describe what you want and let AI do the rest!\n');
  
  console.log(chalk.yellow('Direct Commands:'));
  console.log(chalk.white('gems create [type] [description]') + ' - Create component directly');
  console.log(chalk.white('gems preview') + ' - Preview your components');
  console.log(chalk.white('gems ai') + ' - Configure AI settings');
  console.log(chalk.white('gems config') + ' - Manage settings');
  console.log(chalk.white('gems list') + ' - View component library\n');
  
  console.log(chalk.yellow('Examples:'));
  console.log('gems create hero "Modern hero with video background"');
  console.log('gems create cta "Newsletter signup with gradient"');
  console.log('gems preview --component hero-1234.html\n');
  
  console.log(chalk.yellow('Tips:'));
  console.log('• Add brand styles in the ' + chalk.white('styles/') + ' folder');
  console.log('• Use ' + chalk.white('.env.local') + ' for API keys');
  console.log('• Components are saved in ' + chalk.white('generated/') + ' folder');
  console.log('• Press Ctrl+C to stop preview server\n');
  
  console.log(chalk.dim('For more help: https://github.com/your-repo/gems'));
}