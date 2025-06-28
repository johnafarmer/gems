export const ctaTemplate = {
  name: 'cta',
  description: 'Call-to-action section with compelling copy and buttons',
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
    
    return `Generate a compelling call-to-action (CTA) section web component with these requirements:

1. Component name: cta-section
2. Use Shadow DOM for encapsulation
3. Include:
   - Eye-catching headline
   - Persuasive supporting text
   - Primary action button (prominent)
   - Optional secondary button
   - Visual interest (background pattern, gradient, or accent)
   
4. Design requirements:
   - Make the CTA stand out from regular content
   - Use contrast and hierarchy effectively
   - Include hover states and transitions
   - Fully responsive layout
   
5. Accessibility:
   - Proper heading hierarchy
   - ARIA labels on buttons
   - Good color contrast ratios

${options.brand ? `Brand: ${options.brand}` : ''}
${options.style ? `Style: ${options.style}` : 'Style: modern and compelling'}

Return ONLY the JavaScript web component code in a code block marked with \`\`\`javascript`;
  }
};