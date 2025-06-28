import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import ora from 'ora';
import { ConfigManager } from '../../config/ConfigManager.js';
import { AIService } from '../../services/ai/AIService.js';
import gradient from 'gradient-string';

export const aiCommand = new Command('ai')
  .description('Configure AI model settings')
  .action(async () => {
    console.log(gradient.rainbow('\n🤖 GEMS AI Configuration\n'));
    
    // Main menu
    let { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: '🎯 Select AI Model', value: 'select', description: 'Choose which AI to use' },
        { title: '📋 View Current Settings', value: 'list', description: 'See current AI configuration' },
        { title: '🧪 Test Connection', value: 'test', description: 'Test AI connectivity' },
        { title: '❌ Exit', value: 'exit', description: 'Return to command line' }
      ]
    });
    
    if (action === 'exit' || !action) {
      console.log(chalk.gray('Goodbye! 👋'));
      return;
    }
    
    const config = new ConfigManager();
    const aiService = new AIService(config);
    
    if (action === 'list') {
      console.log(chalk.cyan('\n📋 Current AI Configuration:\n'));
      
      const currentModel = config.get('ai.defaultModel');
      const localEndpoint = config.get('ai.local.endpoint');
      const openRouterKey = config.get('ai.openrouter.key');
      const openRouterModel = config.get('ai.openrouter.model');
      
      console.log(chalk.white('Default Model: ') + chalk.yellow(currentModel === 'local' ? '🖥️  Local/Network' : '☁️  Cloud'));
      
      if (currentModel === 'local') {
        console.log(chalk.white('Endpoint: ') + chalk.dim(localEndpoint));
      } else {
        console.log(chalk.white('OpenRouter API Key: ') + chalk.dim(openRouterKey ? '✅ Configured' : '❌ Not set'));
        if (openRouterModel) {
          console.log(chalk.white('Cloud Model: ') + chalk.dim(openRouterModel));
        }
      }
      
      console.log('');
      
      // Ask if they want to do something else
      const { next } = await prompts({
        type: 'confirm',
        name: 'next',
        message: 'Would you like to do something else?',
        initial: true
      });
      
      if (next) {
        // Recursively call the command
        await aiCommand.parseAsync(['', '']);
      }
      return;
    }
    
    if (action === 'select') {
      console.log(chalk.cyan('\n🎯 Select AI Model\n'));
      
      // Check local availability
      const localEndpoint = config.get('ai.local.endpoint');
      const networkEndpoint = process.env.LM_STUDIO_NETWORK_ENDPOINT || localEndpoint;
      
      const checkingSpinner = ora('Checking AI endpoints...').start();
      
      // Check local LM Studio
      const localAvailable = await checkLocalEndpoint('http://localhost:1234');
      
      // Check network LM Studio
      const networkAvailable = networkEndpoint !== 'http://localhost:1234' 
        ? await checkLocalEndpoint(networkEndpoint)
        : false;
      
      // Check OpenRouter
      const openRouterAvailable = !!config.get('ai.openrouter.key');
      
      checkingSpinner.stop();
      
      const choices = [];
      
      if (localAvailable) {
        choices.push({
          title: `${chalk.cyan('🖥️  Local LM Studio')} ${chalk.green('● Online')}`,
          description: 'Fast, private, runs on your machine',
          value: { type: 'local', endpoint: 'http://localhost:1234' }
        });
      }
      
      if (networkAvailable) {
        const host = networkEndpoint.split('//')[1]?.split(':')[0] || 'Network';
        choices.push({
          title: `${chalk.magenta('🌐 Network LM Studio')} ${chalk.green('● Online')} - ${chalk.dim(host)}`,
          description: 'Fast, runs on your local network',
          value: { type: 'network', endpoint: networkEndpoint }
        });
      }
      
      if (!localAvailable && !networkAvailable) {
        choices.push({
          title: `${chalk.gray('💻 Local/Network LM Studio')} ${chalk.red('● Offline')}`,
          description: 'Install from lmstudio.ai',
          value: null,
          disabled: true
        });
      }
      
      if (openRouterAvailable) {
        choices.push({
          title: `${chalk.yellow('☁️  OpenRouter')} ${chalk.green('● Available')}`,
          description: 'Access to Claude, GPT-4, and more',
          value: { type: 'cloud', endpoint: 'openrouter' }
        });
      } else {
        choices.push({
          title: `${chalk.gray('☁️  OpenRouter')} ${chalk.red('● No API Key')}`,
          description: 'Set OPENROUTER_API_KEY in .env.local',
          value: null,
          disabled: true
        });
      }
      
      if (choices.every(c => c.disabled)) {
        console.log(chalk.red('\n❌ No AI models available!'));
        console.log(chalk.yellow('\nTo get started:'));
        console.log('1. Install LM Studio from https://lmstudio.ai');
        console.log('2. Or add your OpenRouter API key to .env.local');
        return;
      }
      
      const selection = await prompts({
        type: 'select',
        name: 'model',
        message: 'Select AI model to use',
        choices: choices.filter(c => !c.disabled)
      });
      
      if (!selection.model) {
        console.log(chalk.yellow('Selection cancelled'));
        return;
      }
      
      // If cloud selected, show model options
      if (selection.model.type === 'cloud') {
        console.log(chalk.cyan('\n☁️  Select OpenRouter Model\n'));
        
        // Try to fetch user's available models
        const fetchingSpinner = ora('Fetching your available models...').start();
        let userModels: any[] = [];
        
        try {
          const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: {
              'Authorization': `Bearer ${config.get('ai.openrouter.key')}`,
              'HTTP-Referer': 'https://github.com/gems-cli',
              'X-Title': 'GEMS CLI'
            }
          });
          
          if (response.ok) {
            const data = await response.json() as any;
            // Filter to models the user likely has access to and sort by popularity/relevance
            userModels = data.data
              .filter((m: any) => {
                // Include popular models and free models
                const isPopular = m.id.includes('claude') || m.id.includes('gpt-4') || 
                                 m.id.includes('gemini') || m.id.includes('o3') || 
                                 m.id.includes('o1') || m.pricing?.prompt === 0;
                return isPopular;
              })
              .sort((a: any, b: any) => {
                // Sort by: Claude first, then OpenAI, then Google, then free models
                const getPriority = (id: string) => {
                  if (id.includes('claude')) return 0;
                  if (id.includes('gpt-4') || id.includes('o3')) return 1;
                  if (id.includes('gemini')) return 2;
                  return 3;
                };
                return getPriority(a.id) - getPriority(b.id);
              })
              .slice(0, 15); // Show top 15 models
            
            fetchingSpinner.succeed('Found your available models!');
          } else {
            fetchingSpinner.fail('Could not fetch models from OpenRouter');
          }
        } catch (error) {
          fetchingSpinner.fail('Could not fetch models from OpenRouter');
        }
        
        let cloudModels = [];
        
        // If we successfully fetched models, use those
        if (userModels.length > 0) {
          cloudModels = userModels.map((model: any) => {
            // Create nice titles for known models
            let title = model.id;
            let icon = '🤖';
            
            if (model.id.includes('claude')) {
              icon = '🚀';
              if (model.id.includes('sonnet-4')) title = 'Claude Sonnet 4';
              else if (model.id.includes('3.5-sonnet')) title = 'Claude 3.5 Sonnet';
              else if (model.id.includes('3.7-sonnet')) title = 'Claude 3.7 Sonnet';
            } else if (model.id.includes('gpt-4o')) {
              icon = '⚡';
              title = 'GPT-4o';
            } else if (model.id.includes('o3')) {
              icon = '✨';
              if (model.id === 'openai/o3') title = 'o3';
              else if (model.id === 'openai/o3-mini') title = 'o3-mini';
              else if (model.id === 'openai/o3-pro') title = 'o3-pro';
            } else if (model.id.includes('gemini')) {
              icon = '🏃';
              if (model.id.includes('2.5-flash')) title = 'Gemini 2.5 Flash';
              else if (model.id.includes('2.5-pro')) title = 'Gemini 2.5 Pro';
              else if (model.id.includes('2.0-flash')) title = 'Gemini 2.0 Flash';
            }
            
            // Add pricing info
            const isFree = model.pricing?.prompt === 0;
            if (isFree) {
              title += chalk.green(' (Free)');
            }
            
            return {
              title: `${icon} ${title}`,
              value: model.id,
              description: `Context: ${(model.context_length / 1000).toFixed(0)}k${isFree ? ' • Free tier' : ''}`
            };
          });
          
          // Add browse all models option
          cloudModels.push({
            title: '🔍 Browse All Models',
            value: 'browse',
            description: 'See all available models on OpenRouter'
          });
        } else {
          // Fallback to predefined models if fetch failed
          cloudModels = [
            {
              title: '🚀 Claude Sonnet 4',
              value: 'anthropic/claude-sonnet-4',
              description: 'Best for complex components'
            },
            {
              title: '⚡ GPT-4o',
              value: 'openai/gpt-4o',
              description: 'Fast and capable'
            },
            {
              title: '✨ o3-mini',
              value: 'openai/o3-mini',
              description: 'Advanced reasoning, more accessible'
            },
            {
              title: '🏃 Gemini 2.5 Flash',
              value: 'google/gemini-2.5-flash',
              description: 'Lightning fast responses'
            },
            {
              title: '🧠 Gemini 2.5 Pro',
              value: 'google/gemini-2.5-pro',
              description: 'Powerful and versatile'
            }
          ];
        }
        
        // Always add custom model option
        cloudModels.push({
          title: '➕ Add Custom Model',
          value: 'custom',
          description: 'Enter any OpenRouter model ID'
        });
        
        const modelSelection = await prompts({
          type: 'select',
          name: 'cloudModel',
          message: 'Select OpenRouter model',
          choices: cloudModels
        });
        
        if (modelSelection.cloudModel === 'browse') {
          // Show all available models
          console.log(chalk.cyan('\n📋 All Available Models\n'));
          
          try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
              headers: {
                'Authorization': `Bearer ${config.get('ai.openrouter.key')}`,
                'HTTP-Referer': 'https://github.com/gems-cli',
                'X-Title': 'GEMS CLI'
              }
            });
            
            if (response.ok) {
              const data = await response.json() as any;
              const allModels = data.data
                .sort((a: any, b: any) => a.id.localeCompare(b.id))
                .map((m: any) => ({
                  title: `${m.id} ${m.pricing?.prompt === 0 ? chalk.green('(Free)') : ''}`,
                  value: m.id,
                  description: `Context: ${(m.context_length / 1000).toFixed(0)}k`
                }));
              
              const browseSelection = await prompts({
                type: 'autocomplete',
                name: 'model',
                message: 'Search and select a model',
                choices: allModels,
                limit: 20
              });
              
              if (browseSelection.model) {
                config.set('ai.openrouter.model', browseSelection.model);
                config.set('ai.defaultModel', 'cloud');
                console.log(chalk.green(`\n✅ Set to use ${browseSelection.model} via OpenRouter`));
              }
            }
          } catch (error) {
            console.log(chalk.red('Failed to fetch all models'));
          }
          
        } else if (modelSelection.cloudModel === 'custom') {
          const customModel = await prompts({
            type: 'text',
            name: 'model',
            message: 'Enter OpenRouter model ID',
            validate: (value: string) => value.length > 0 || 'Please enter a model ID'
          });
          
          if (customModel.model) {
            config.set('ai.openrouter.model', customModel.model);
            config.set('ai.defaultModel', 'cloud');
            console.log(chalk.green(`\n✅ Set to use ${customModel.model} via OpenRouter`));
          }
        } else if (modelSelection.cloudModel) {
          config.set('ai.openrouter.model', modelSelection.cloudModel);
          config.set('ai.defaultModel', 'cloud');
          const modelName = cloudModels.find(m => m.value === modelSelection.cloudModel)?.title || modelSelection.cloudModel;
          console.log(chalk.green(`\n✅ Set to use ${modelName} via OpenRouter`));
        }
      } else {
        // Local or network selected
        config.set('ai.local.endpoint', selection.model.endpoint);
        config.set('ai.defaultModel', 'local');
        console.log(chalk.green(`\n✅ Set to use ${selection.model.type === 'network' ? 'Network' : 'Local'} LM Studio`));
      }
      
      // Ask if they want to test
      const { testNow } = await prompts({
        type: 'confirm',
        name: 'testNow',
        message: 'Would you like to test the connection now?',
        initial: true
      });
      
      if (testNow) {
        action = 'test'; // Fall through to test
      } else {
        return;
      }
    }
    
    if (action === 'test') {
      console.log(chalk.cyan('\n🧪 Testing AI Connection\n'));
      
      const testSpinner = ora('Sending test prompt...').start();
      
      try {
        const result = await aiService.generateWithSource({
          prompt: 'Say "Hello from GEMS!" and nothing else.',
          model: config.get('ai.defaultModel')
        });
        
        testSpinner.succeed('AI connection successful!');
        
        console.log(chalk.green('\n✅ Response received:'));
        console.log(chalk.dim(result.content.substring(0, 100) + '...'));
        
        console.log(chalk.cyan('\n📍 Source:'));
        if (result.source.type === 'local') {
          console.log('   Local LM Studio');
        } else if (result.source.type === 'network') {
          console.log(`   Network: ${result.source.endpoint}`);
        } else if (result.source.type === 'cloud') {
          console.log(`   OpenRouter: ${result.source.model}`);
        }
      } catch (error) {
        testSpinner.fail('AI connection failed');
        console.log(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));
        
        console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
        const currentModel = config.get('ai.defaultModel');
        if (currentModel === 'local') {
          console.log('- Make sure LM Studio is running');
          console.log('- Check that a model is loaded in LM Studio');
          console.log('- Verify the server is started (green button)');
        } else {
          console.log('- Check your internet connection');
          console.log('- Verify your OpenRouter API key is valid');
          console.log('- Check your OpenRouter credit balance');
        }
      }
      
      console.log('');
    }
  });

async function checkLocalEndpoint(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/v1/models`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}