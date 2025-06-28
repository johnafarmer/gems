import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import prompts from 'prompts';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PreviewServer } from '../../preview/PreviewServer.js';

export const previewCommand = new Command('preview')
  .description('Preview generated components in browser')
  .option('-p, --port <port>', 'Port to run preview server', '3000')
  .option('-c, --component <name>', 'Specific component to preview')
  .option('--no-open', 'Don\'t open browser automatically')
  .action(async (options) => {
    const spinner = ora();
    
    try {
      // If no component specified, show file browser
      if (!options.component) {
        const generatedDir = join(process.cwd(), 'generated');
        
        try {
          const files = readdirSync(generatedDir)
            .filter(f => f.endsWith('.html'))
            .map(f => {
              const stats = statSync(join(generatedDir, f));
              return { name: f, time: stats.mtime };
            })
            .sort((a, b) => b.time.getTime() - a.time.getTime()); // Newest first
          
          if (files.length === 0) {
            console.log(chalk.yellow('No components found. Create one with `gems create`'));
            return;
          }
          
          console.log(chalk.cyan('\n📁 Available Components (newest first):\n'));
          
          const response = await prompts({
            type: 'select',
            name: 'component',
            message: 'Select a component to preview',
            choices: files.map((f, i) => ({
              title: `${i === 0 ? '✨ ' : ''}${f.name.replace('.html', '')} ${chalk.dim(`(${f.time.toLocaleString()})`)}`,
              value: f.name
            }))
          });
          
          if (!response.component) {
            console.log(chalk.yellow('Preview cancelled.'));
            return;
          }
          
          options.component = response.component;
        } catch (err) {
          console.log(chalk.yellow('No generated directory found. Create a component first.'));
          return;
        }
      }
      
      spinner.start(chalk.cyan('Starting preview server...'));
      
      const server = new PreviewServer();
      const url = await server.start({
        port: parseInt(options.port),
        component: options.component
      });
      
      spinner.succeed(chalk.green('Preview server running!'));
      
      console.log(chalk.cyan(`\\n🌐 Preview available at: ${chalk.white(url)}`));
      console.log(chalk.gray('\\nPress Ctrl+C to stop the server'));
      
      if (options.open !== false) {
        await open(url);
      }
      
      // Keep process running
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\\n\\nShutting down preview server...'));
        server.stop();
        process.exit(0);
      });
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to start preview server'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });