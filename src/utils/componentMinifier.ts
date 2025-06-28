export function createElementorComponent(jsCode: string, componentName: string): string {
  // Extract the custom element name
  const defineMatch = jsCode.match(/customElements\.define\(['"`]([\w-]+)['"`]/);
  const elementName = defineMatch ? defineMatch[1] : componentName;
  
  // Minify the JavaScript (basic minification)
  const minifiedJs = jsCode
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\s*([{}:;,=<>+\-*\/!])\s*/g, '$1') // Remove spaces around operators
    .trim();
  
  // Create the self-contained component with inline script
  return `<!-- GEMS Component: ${elementName} -->
<script>
(function() {
  // Check if component is already defined
  if (customElements.get('${elementName}')) return;
  
  ${minifiedJs}
})();
</script>

<!-- Use the component -->
<${elementName}></${elementName}>

<style>
/* Elementor container fix */
${elementName} {
  display: block;
  width: 100%;
}
</style>`;
}

export function extractComponentCode(jsCode: string): { 
  script: string; 
  elementName: string;
  usage: string;
} {
  const defineMatch = jsCode.match(/customElements\.define\(['"`]([\w-]+)['"`]/);
  const elementName = defineMatch ? defineMatch[1] : 'custom-element';
  
  return {
    script: jsCode,
    elementName,
    usage: `<${elementName}></${elementName}>`
  };
}