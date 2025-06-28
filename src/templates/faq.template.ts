export const faqTemplate = {
  name: 'faq',
  description: 'Frequently asked questions accordion or list',
  generatePrompt: (options: any) => {
    if (options.description) {
      return `Generate a web component based on this exact description: "${options.description}".
      
Requirements:
- Use Shadow DOM for encapsulation
- Make it a proper Web Component with customElements.define()
- Include all necessary CSS within the component
- Make it responsive and accessible
${options.brand ? `- Include the brand name: ${options.brand}\n` : ''}
${options.style ? `- Visual style: ${options.style}\n` : ''}

Return ONLY the JavaScript web component code in a code block.`;
    }
    
    return `Generate an FAQ (Frequently Asked Questions) web component with these requirements:

1. Component name: faq-section
2. Use Shadow DOM for encapsulation
3. Include:
   - Expandable/collapsible question items
   - Smooth expand/collapse animations
   - Clear question and answer typography
   - Plus/minus or arrow indicators
   
4. Interaction design:
   - Click to expand/collapse
   - Only one open at a time (optional)
   - Keyboard accessible (Enter/Space)
   - Smooth height transitions
   
5. Visual design:
   - Clear separation between items
   - Hover states
   - Active/expanded state styling
   - Mobile-friendly touch targets

${options.brand ? `Brand: ${options.brand}` : ''}
${options.style ? `Style: ${options.style}` : 'Style: clean and organized'}

Return ONLY the JavaScript web component code in a code block marked with \`\`\`javascript`;
  }
};