export const featuresTemplate = {
  name: 'features',
  description: 'Feature grid or list showcasing product/service benefits',
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
    
    return `Generate a feature showcase web component with these requirements:

1. Component name: features-section
2. Use Shadow DOM for encapsulation
3. Include:
   - Grid or list layout for multiple features
   - Icon or visual element for each feature
   - Feature title and description
   - Flexible number of features (3-6 typical)
   
4. Design patterns:
   - Use cards, tiles, or list items
   - Include subtle animations on hover
   - Maintain visual hierarchy
   - Responsive grid that stacks on mobile
   
5. Make it flexible:
   - Easy to update feature content
   - Consistent spacing and alignment
   - Optional CTA at the end

${options.brand ? `Brand: ${options.brand}` : ''}
${options.style ? `Style: ${options.style}` : 'Style: clean and informative'}

Return ONLY the JavaScript web component code in a code block marked with \`\`\`javascript`;
  }
};