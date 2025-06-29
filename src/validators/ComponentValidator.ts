export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    componentName?: string;
    customElementName?: string;
    hasConstructor: boolean;
    hasShadowDOM: boolean;
    hasConnectedCallback: boolean;
  };
}

export class ComponentValidator {
  /**
   * Validates that the code is syntactically correct JavaScript
   */
  private validateSyntax(code: string): { isValid: boolean; error?: string } {
    try {
      // Use Function constructor to check syntax without executing
      new Function(code);
      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Syntax error in JavaScript code'
      };
    }
  }

  /**
   * Validates that the code defines a valid web component
   */
  private validateWebComponentPattern(code: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for customElements.define
    const defineMatch = code.match(/customElements\.define\(\s*['"`]([\w-]+)['"`]\s*,\s*([\w]+)\s*\)/);
    if (!defineMatch) {
      errors.push('No customElements.define() found. Web components must be registered with customElements.define()');
      return { isValid: false, errors, warnings };
    }
    
    const [, elementName, className] = defineMatch;
    
    // Validate custom element name (must contain hyphen)
    if (!elementName.includes('-')) {
      errors.push(`Invalid custom element name "${elementName}". Custom element names must contain a hyphen (e.g., "my-component")`);
    }
    
    // Check if class extends HTMLElement
    const classPattern = new RegExp(`class\\s+${className}\\s+extends\\s+HTMLElement`);
    if (!classPattern.test(code)) {
      errors.push(`Class ${className} must extend HTMLElement`);
    }
    
    // Check for constructor
    const hasConstructor = code.includes('constructor()') || code.includes('constructor ()');
    
    // Check for shadow DOM
    const hasShadowDOM = code.includes('attachShadow');
    if (!hasShadowDOM) {
      warnings.push('Component does not use Shadow DOM. Consider using attachShadow() for better encapsulation');
    }
    
    // Check for connectedCallback
    const hasConnectedCallback = code.includes('connectedCallback()') || code.includes('connectedCallback ()');
    if (!hasConnectedCallback) {
      warnings.push('Component does not implement connectedCallback(). This is where component initialization typically happens');
    }
    
    // Check for super() in constructor if constructor exists
    if (hasConstructor && !code.includes('super()')) {
      errors.push('Constructor must call super() when extending HTMLElement');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        componentName: className,
        customElementName: elementName,
        hasConstructor,
        hasShadowDOM,
        hasConnectedCallback
      }
    };
  }

  /**
   * Performs security checks on the component code
   */
  private validateSecurity(code: string): { warnings: string[] } {
    const warnings: string[] = [];
    
    // Check for eval usage
    if (/\beval\s*\(/.test(code)) {
      warnings.push('Code contains eval() which is a security risk');
    }
    
    // Check for innerHTML without proper context
    if (/\.innerHTML\s*=/.test(code) && !code.includes('shadowRoot.innerHTML')) {
      warnings.push('Direct innerHTML usage detected. Ensure content is properly sanitized');
    }
    
    // Check for external script loading
    if (/<script\s+src=/.test(code)) {
      warnings.push('Component appears to load external scripts. This may cause security or performance issues');
    }
    
    return { warnings };
  }

  /**
   * Main validation method
   */
  validate(code: string): ValidationResult {
    // First check syntax
    const syntaxResult = this.validateSyntax(code);
    if (!syntaxResult.isValid) {
      return {
        isValid: false,
        errors: [`JavaScript syntax error: ${syntaxResult.error}`],
        warnings: []
      };
    }
    
    // Then validate web component patterns
    const componentResult = this.validateWebComponentPattern(code);
    
    // Add security warnings
    const securityResult = this.validateSecurity(code);
    componentResult.warnings.push(...securityResult.warnings);
    
    return componentResult;
  }

  /**
   * Attempts to fix common issues in component code
   */
  attemptAutoFix(code: string): { fixed: boolean; code: string; changes: string[] } {
    let fixedCode = code;
    const changes: string[] = [];
    
    // Fix missing super() in constructor
    if (fixedCode.includes('constructor()') && !fixedCode.includes('super()')) {
      fixedCode = fixedCode.replace(
        /constructor\s*\(\s*\)\s*{/,
        'constructor() {\n    super();'
      );
      changes.push('Added missing super() call in constructor');
    }
    
    // Fix missing hyphen in custom element name
    const defineMatch = fixedCode.match(/customElements\.define\(\s*['"`](\w+)['"`]/);
    if (defineMatch && !defineMatch[1].includes('-')) {
      const oldName = defineMatch[1];
      const newName = oldName.toLowerCase() + '-component';
      fixedCode = fixedCode.replace(
        new RegExp(`(['"\`])${oldName}(['"\`])`, 'g'),
        `$1${newName}$2`
      );
      changes.push(`Changed element name from "${oldName}" to "${newName}" (added required hyphen)`);
    }
    
    return {
      fixed: changes.length > 0,
      code: fixedCode,
      changes
    };
  }
}