export const testimonialTemplate = {
  name: 'testimonial',
  description: 'Customer testimonial or quote section',
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
    
    return `Generate a testimonial/social proof web component with these requirements:

1. Component name: testimonial-section
2. Use Shadow DOM for encapsulation
3. Include:
   - Customer quote (with quotation marks or styling)
   - Customer name and title/company
   - Optional customer photo/avatar
   - Star rating or other credibility indicator
   
4. Design options:
   - Single testimonial or carousel of multiple
   - Card-based or quote-style design
   - Background accent or pattern
   - Subtle animation for emphasis
   
5. Trust elements:
   - Professional typography for quotes
   - Clear attribution
   - Optional logo of customer's company
   - Authentic feeling design

${options.brand ? `Brand: ${options.brand}` : ''}
${options.style ? `Style: ${options.style}` : 'Style: trustworthy and professional'}

Return ONLY the JavaScript web component code in a code block marked with \`\`\`javascript`;
  }
};