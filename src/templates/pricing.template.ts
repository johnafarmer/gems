export const pricingTemplate = {
  name: 'pricing',
  description: 'Pricing table or cards showing plans and features',
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
    
    return `Generate a pricing table/cards web component with these requirements:

1. Component name: pricing-section
2. Use Shadow DOM for encapsulation
3. Include:
   - Multiple pricing tiers (typically 3)
   - Price display with currency
   - Feature list for each tier
   - CTA button for each plan
   - Highlight recommended plan
   
4. Design patterns:
   - Card-based or table layout
   - Clear visual hierarchy
   - Emphasized "best value" tier
   - Comparison checkmarks/features
   - Responsive stack on mobile
   
5. User experience:
   - Easy to scan and compare
   - Clear differentiation between plans
   - Compelling CTAs
   - Trust indicators (guarantees, etc.)

${options.brand ? `Brand: ${options.brand}` : ''}
${options.style ? `Style: ${options.style}` : 'Style: clear and conversion-focused'}

Return ONLY the JavaScript web component code in a code block marked with \`\`\`javascript`;
  }
};