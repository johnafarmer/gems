#!/usr/bin/env bun

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import { createCommand } from './cli/commands/create.js';
import { previewCommand } from './cli/commands/preview.js';
import { configCommand } from './cli/commands/config.js';
import { listCommand } from './cli/commands/list.js';
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
  .option('-v, --verbose', 'verbose output')
  .option('--no-color', 'disable colored output');

// Add commands
program.addCommand(createCommand);
program.addCommand(previewCommand);
program.addCommand(configCommand);
program.addCommand(listCommand);

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s'), program.args.join(' '));
  console.log('See --help for a list of available commands.');
  process.exit(1);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}