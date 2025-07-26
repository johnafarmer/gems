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
  
  static async showGeneratingAnimation(componentType: string, description: string, source?: any) {
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
      
      // Display source info if available
      if (source) {
        let sourceText = '';
        if (source.type === 'claude-code') {
          const modelName = source.model || 'Claude sonnet-4';
          sourceText = chalk.blueBright('🤖 Claude Code: ') + chalk.white(modelName);
        } else if (source.type === 'local') {
          const modelName = source.model?.split('/').pop() || 'Local Model';
          sourceText = chalk.cyan('🖥️  Local LM Studio: ') + chalk.white(modelName);
        } else if (source.type === 'network') {
          const endpoint = source.endpoint?.split('//')[1]?.split(':')[0] || 'Network';
          const modelName = source.model?.split('/').pop() || 'Network Model';
          sourceText = chalk.magenta('🌐 Network (') + chalk.white(endpoint) + chalk.magenta('): ') + chalk.white(modelName);
        } else if (source.type === 'cloud') {
          const modelName = this.formatModelName(source.model || 'Cloud Model');
          sourceText = chalk.yellow('☁️  OpenRouter: ') + chalk.white(modelName);
        } else if (source.type === 'template') {
          sourceText = chalk.gray('📝 Template Mode');
        }
        
        if (sourceText) {
          console.log('\n' + this.centerText(sourceText));
        }
      }
      
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
  
  static showSuccess(component: any, source?: any) {
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
    
    // Source info
    if (source) {
      let sourceText = '';
      if (source.type === 'claude-code') {
        const modelName = source.model || 'Claude sonnet-4';
        sourceText = chalk.blueBright('Generated with Claude Code (') + chalk.white(modelName) + chalk.blueBright(')');
      } else if (source.type === 'local') {
        const modelName = source.model?.split('/').pop() || 'Local Model';
        sourceText = chalk.cyan('Generated with Local LM Studio (') + chalk.white(modelName) + chalk.cyan(')');
      } else if (source.type === 'network') {
        const endpoint = source.endpoint?.split('//')[1]?.split(':')[0] || 'Network';
        const modelName = source.model?.split('/').pop() || 'Network Model';
        sourceText = chalk.magenta(`Generated with ${endpoint} (`) + chalk.white(modelName) + chalk.magenta(')');
      } else if (source.type === 'cloud') {
        const modelName = this.formatModelName(source.model || 'Cloud Model');
        sourceText = chalk.yellow('Generated with OpenRouter (') + chalk.white(modelName) + chalk.yellow(')');
      } else if (source.type === 'template') {
        sourceText = chalk.gray('Generated from Template');
      }
      
      if (sourceText) {
        console.log('\n' + this.centerText(sourceText));
      }
    }
    
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
  
  private static formatModelName(model: string): string {
    // Handle common model formats
    if (model.includes('claude-sonnet-4')) return 'Claude Sonnet 4';
    if (model.includes('claude-3.5-sonnet')) return 'Claude 3.5 Sonnet';
    if (model.includes('claude-3.7-sonnet')) return 'Claude 3.7 Sonnet';
    if (model.includes('gpt-4o')) return 'GPT-4o';
    if (model.includes('o3-mini')) return 'o3-mini';
    if (model.includes('o3-pro')) return 'o3-pro';
    if (model.includes('o3')) return 'o3';
    if (model.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
    if (model.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
    if (model.includes('gemini-2.0-flash')) return 'Gemini 2.0 Flash';
    if (model.includes('devstral')) return 'Devstral';
    
    // Default: just return the last part of the model path
    return model.split('/').pop() || model;
  }
}