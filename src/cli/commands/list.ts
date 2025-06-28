import { Command } from 'commander';
import chalk from 'chalk';
import { ComponentLibrary } from '../../services/ComponentLibrary.js';

export const listCommand = new Command('list')
  .description('List saved components')
  .option('-t, --type <type>', 'Filter by component type')
  .option('-s, --search <query>', 'Search components')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const library = new ComponentLibrary();
      const components = await library.list({
        type: options.type,
        search: options.search
      });
      
      if (options.json) {
        console.log(JSON.stringify(components, null, 2));
        return;
      }
      
      if (components.length === 0) {
        console.log(chalk.yellow('No components found in library.'));
        console.log(chalk.gray('\\nCreate components with `gems create` and save them with --save flag'));
        return;
      }
      
      console.log(chalk.cyan(`\\n📚 Component Library (${components.length} components)\\n`));
      
      components.forEach(component => {
        console.log(chalk.white(`${component.name}`) + chalk.gray(` (${component.type})`));
        if (component.description) {
          console.log(chalk.gray(`   ${component.description}`));
        }
        console.log(chalk.gray(`   Created: ${new Date(component.created).toLocaleDateString()}`));
        if (component.tags && component.tags.length > 0) {
          console.log(chalk.gray(`   Tags: ${component.tags.join(', ')}`));
        }
        console.log();
      });
      
      console.log(chalk.gray('Use `gems preview --component <name>` to preview a component'));
      
    } catch (error) {
      console.error(chalk.red(`Failed to list components: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });