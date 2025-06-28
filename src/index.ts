#!/usr/bin/env bun

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import { createCommand } from './cli/commands/create.js';
import { previewCommand } from './cli/commands/preview.js';
import { configCommand } from './cli/commands/config.js';
import { listCommand } from './cli/commands/list.js';
import { aiCommand } from './cli/commands/ai.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const version = packageJson.version;

const showBanner = () => {
  console.log(
    gradient.rainbow(
      figlet.textSync('GEMS', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
  console.log(
    chalk.cyan('✨ Generative Element Management System ✨\n')
  );
};

const program = new Command();

showBanner();

program
  .name('gems')
  .description('AI-powered WordPress component generator')
  .version(version)
  .option('-i, --interactive', 'enter interactive mode')
  .option('-v, --verbose', 'verbose output')
  .option('--no-color', 'disable colored output');

// Add commands
program.addCommand(createCommand);
program.addCommand(previewCommand);
program.addCommand(configCommand);
program.addCommand(listCommand);
program.addCommand(aiCommand);

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s'), program.args.join(' '));
  console.log('See --help for a list of available commands.');
  process.exit(1);
});

// Check if we should enter interactive mode
const args = process.argv.slice(2);
const isInteractive = args.length === 0 || (args.length === 1 && (args[0] === '-i' || args[0] === '--interactive'));

if (isInteractive) {
  // Enter interactive mode
  import('./cli/interactive.js').then(({ interactiveMode }) => {
    interactiveMode().catch(error => {
      console.error(chalk.red('Error in interactive mode:'), error);
      process.exit(1);
    });
  });
} else {
  // Parse command line arguments normally
  program.parse();
}