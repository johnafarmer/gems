import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { ConfigManager } from '../../config/ConfigManager.js';

export const configCommand = new Command('config')
  .description('Manage GEMS configuration')
  .addCommand(
    new Command('set')
      .description('Set a configuration value')
      .argument('<key>', 'Configuration key (e.g., ai.local.endpoint)')
      .argument('<value>', 'Configuration value')
      .action(async (key, value) => {
        try {
          const config = new ConfigManager();
          config.set(key, value);
          console.log(chalk.green(`✅ Set ${chalk.white(key)} = ${chalk.white(value)}`));
        } catch (error) {
          console.error(chalk.red(`Failed to set configuration: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('<key>', 'Configuration key')
      .action(async (key) => {
        try {
          const config = new ConfigManager();
          const value = config.get(key);
          if (value !== undefined) {
            console.log(chalk.cyan(`${key} = ${chalk.white(JSON.stringify(value, null, 2))}`));
          } else {
            console.log(chalk.yellow(`Configuration key '${key}' not found`));
          }
        } catch (error) {
          console.error(chalk.red(`Failed to get configuration: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all configuration values')
      .action(async () => {
        try {
          const config = new ConfigManager();
          const allConfig = config.getAll();
          console.log(chalk.cyan('Current Configuration:\\n'));
          console.log(JSON.stringify(allConfig, null, 2));
        } catch (error) {
          console.error(chalk.red(`Failed to list configuration: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('ai')
      .description('Configure AI settings interactively')
      .action(async () => {
        try {
          const config = new ConfigManager();
          
          console.log(chalk.cyan('🤖 AI Configuration\\n'));
          
          const responses = await prompts([
            {
              type: 'select',
              name: 'defaultModel',
              message: 'Default AI model:',
              choices: [
                { title: 'Local (LM Studio)', value: 'local' },
                { title: 'Cloud (OpenRouter)', value: 'cloud' }
              ],
              initial: config.get('ai.defaultModel') === 'cloud' ? 1 : 0
            },
            {
              type: (prev: any) => prev === 'local' ? 'text' : null,
              name: 'localEndpoint',
              message: 'LM Studio endpoint:',
              initial: config.get('ai.local.endpoint') || 'http://10.0.0.237:1234'
            },
            {
              type: (prev: any) => prev === 'cloud' ? 'password' : null,
              name: 'openRouterKey',
              message: 'OpenRouter API key:',
              initial: config.get('ai.openrouter.key') || ''
            }
          ]);
          
          if (responses.defaultModel) {
            config.set('ai.defaultModel', responses.defaultModel);
            
            if (responses.localEndpoint) {
              config.set('ai.local.endpoint', responses.localEndpoint);
            }
            
            if (responses.openRouterKey) {
              config.set('ai.openrouter.key', responses.openRouterKey);
            }
            
            console.log(chalk.green('\\n✅ AI configuration updated successfully!'));
          }
          
        } catch (error) {
          console.error(chalk.red(`Failed to configure AI: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  );