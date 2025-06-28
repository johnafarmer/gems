export const heroTemplate = {
  name: 'hero',
  description: 'Hero section with headline, subtitle, and CTA',
  generatePrompt: (options: any) => `
Generate a modern, accessible hero section web component with the following EXACT requirements:

1. Component name: hero-section
2. Use Shadow DOM for encapsulation
3. Include:
   - Main headline (h1) with brand name "${options.brand || 'Your Brand'}"
   - Supporting text/subtitle
   - Primary CTA button
   - Optional secondary CTA
   - ANIMATED GRADIENT BACKGROUND (not static image) that shifts between colors
   
4. CSS Requirements:
   - Animated gradient background using CSS animations
   - The gradient should animate/shift between purple and blue colors
   - Use @keyframes for smooth color transitions
   - Background animation should be subtle and loop infinitely
   
5. Make it fully responsive with mobile-first approach
6. Include proper ARIA labels and semantic HTML
7. Use CSS custom properties for theming
8. WordPress-compatible (no external dependencies)

${options.brand ? `Brand name to use in headline: ${options.brand}` : ''}
${options.style ? `Visual style: ${options.style}` : 'Style: modern and clean'}

Return ONLY the JavaScript web component code in a code block. The code should include:
- The complete web component class with Shadow DOM
- All CSS including the animated gradient background
- The component should be self-contained and ready to use

Format: Return the code inside a single code block marked with triple backticks and javascript
`
};