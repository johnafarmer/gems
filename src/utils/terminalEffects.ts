import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';

export class TerminalEffects {
  private static frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private static rainbowGradient = gradient(['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3']);
  
  static clearScreen() {
    process.stdout.write('\x1Bc');
  }
  
  static centerText(text: string, width: number = process.stdout.columns): string {
    const lines = text.split('\n');
    return lines.map(line => {
      const padding = Math.max(0, Math.floor((width - line.length) / 2));
      return ' '.repeat(padding) + line;
    }).join('\n');
  }
  
  static async showGeneratingAnimation(componentType: string, description: string) {
    const width = process.stdout.columns;
    const height = process.stdout.rows;
    
    // Clear screen and hide cursor
    this.clearScreen();
    process.stdout.write('\x1B[?25l');
    
    let frameIndex = 0;
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      // Clear screen for each frame
      process.stdout.write('\x1B[H\x1B[2J');
      
      // Calculate vertical centering
      const contentHeight = 12; // Approximate height of our content
      const topPadding = Math.max(0, Math.floor((height - contentHeight) / 2));
      
      // Add top padding
      process.stdout.write('\n'.repeat(topPadding));
      
      // Animated GEMS logo
      const gemsLogo = figlet.textSync('GEMS', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default'
      });
      
      // Apply rainbow gradient with animation
      const animatedLogo = this.rainbowGradient.multiline(gemsLogo);
      console.log(this.centerText(animatedLogo));
      
      // Status line with spinner
      const spinner = this.frames[frameIndex % this.frames.length];
      const elapsedMs = Date.now() - startTime;
      const elapsedSec = (elapsedMs / 1000).toFixed(1);
      const statusLine = `${chalk.cyan(spinner)} Generating ${chalk.yellow(componentType)} component... ${chalk.dim(`[${elapsedSec}s]`)}`;
      console.log('\n' + this.centerText(statusLine));
      
      // Description with word wrap
      if (description) {
        const wrapped = this.wordWrap(description, 60);
        console.log('\n' + this.centerText(chalk.dim(`"${wrapped}"`)));
      }
      
      // Progress bar - slowly fill instead of loop
      const totalDuration = 60000; // 60 seconds expected max
      const progress = Math.min(elapsedMs / totalDuration, 0.95); // Cap at 95% until done
      const barWidth = 40;
      const filled = Math.floor(progress * barWidth);
      const progressBar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(barWidth - filled));
      console.log('\n' + this.centerText(progressBar));
      
      // AI status - progress through messages based on time
      const aiMessages = [
        'Analyzing requirements...',
        'Understanding component needs...',
        'Crafting component structure...',
        'Implementing core functionality...',
        'Adding accessibility features...',
        'Optimizing for WordPress...',
        'Implementing responsive design...',
        'Adding interactive elements...',
        'Polishing visual details...',
        'Finalizing component code...'
      ];
      
      // Progress through messages based on elapsed time
      const messageProgress = Math.min(elapsedMs / 30000, 1); // 30 seconds to go through all messages
      const messageIndex = Math.min(Math.floor(messageProgress * aiMessages.length), aiMessages.length - 1);
      console.log('\n' + this.centerText(chalk.magenta(aiMessages[messageIndex])));
      
      frameIndex++;
    }, 100);
    
    return () => {
      clearInterval(interval);
      // Show cursor again
      process.stdout.write('\x1B[?25h');
    };
  }
  
  static showSuccess(component: any) {
    const width = process.stdout.columns;
    const height = process.stdout.rows;
    
    // Clear screen
    this.clearScreen();
    
    // Calculate vertical centering
    const contentHeight = 20;
    const topPadding = Math.max(0, Math.floor((height - contentHeight) / 2));
    
    // Add top padding
    process.stdout.write('\n'.repeat(topPadding));
    
    // Success banner
    const successText = figlet.textSync('SUCCESS!', {
      font: 'Standard',
      horizontalLayout: 'default'
    });
    
    console.log(this.centerText(gradient.rainbow(successText)));
    console.log('\n');
    
    // Component info box
    const boxWidth = 60;
    const boxTop = '╭' + '─'.repeat(boxWidth - 2) + '╮';
    const boxBottom = '╰' + '─'.repeat(boxWidth - 2) + '╯';
    
    console.log(this.centerText(chalk.cyan(boxTop)));
    console.log(this.centerText(chalk.cyan('│') + ' '.repeat(boxWidth - 2) + chalk.cyan('│')));
    
    // Files created
    component.files.forEach((file: any) => {
      const fileName = file.path.split('/').pop();
      const line = `  📄 ${chalk.green(fileName)}`;
      const padding = boxWidth - line.length - 3;
      console.log(this.centerText(chalk.cyan('│') + line + ' '.repeat(padding) + chalk.cyan('│')));
    });
    
    console.log(this.centerText(chalk.cyan('│') + ' '.repeat(boxWidth - 2) + chalk.cyan('│')));
    console.log(this.centerText(chalk.cyan(boxBottom)));
    
    // Location
    const location = component.files[0]?.path ? component.files[0].path.split('/').slice(0, -1).join('/') : '';
    console.log('\n' + this.centerText(chalk.dim(`📍 ${location}`)));
    
    // Next steps with rainbow effect
    console.log('\n' + this.centerText(this.rainbowGradient('✨ Component generated successfully! ✨')));
    console.log('\n' + this.centerText(chalk.gray('Opening preview in browser...')));
    
    // Add some space at the bottom
    console.log('\n\n');
  }
  
  private static wordWrap(text: string, maxWidth: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    words.forEach(word => {
      if ((currentLine + ' ' + word).trim().length <= maxWidth) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }
}