# Brand Style Guidelines Template

This template provides a structure for defining your brand guidelines that GEMS will use when generating components.

## Brand Identity

### Company Name
[Your Company Name]

### Positioning
[Brief description of your brand's position in the market]

### Tagline
*[Your company tagline]*

## Visual Identity

### Logo Usage
- **Primary Logo:** [Description of primary logo usage]
- **Placement:** [Logo placement guidelines]
- **Restrictions:** [What not to do with the logo]

### Color Palette

| Type | Color Name | Hex | RGB | Usage Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | [Color Name] | `#000000` | `0 0 0` | [When to use this color] |
| **Primary** | [Color Name] | `#FFFFFF` | `255 255 255` | [When to use this color] |
| **Accent** | [Color Name] | `#FF0000` | `255 0 0` | [When to use this color] |

### Typography

| Application | Font Standard |
| :--- | :--- |
| **Headings** | [Font Name and Weight] |
| **Body Text** | [Font Name and Weight] |
| **UI Elements** | [Font Name and Weight] |

### Spacing and Layout
- **Standard Padding:** [e.g., 16px, 24px, 32px]
- **Standard Margins:** [e.g., 8px, 16px, 24px]
- **Border Radius:** [e.g., 4px for small, 8px for medium]

## Component Guidelines

### Buttons
- **Primary Button:** [Color, hover state, padding]
- **Secondary Button:** [Color, hover state, padding]
- **Disabled State:** [How disabled elements should appear]

### Forms
- **Input Fields:** [Border style, focus state, error state]
- **Labels:** [Font size, color, spacing]
- **Validation:** [Error message styling]

### Cards and Containers
- **Background:** [Color or gradient]
- **Shadows:** [Box shadow values]
- **Borders:** [Border style if any]

## Interaction Guidelines

### Hover States
[How elements should behave on hover]

### Transitions
[Standard transition timing and easing]

### Animations
[Any specific animation guidelines]

## Accessibility

### Color Contrast
- Minimum contrast ratios for text
- Alternative color combinations for accessibility

### Focus Indicators
- Style for keyboard focus states
- High contrast mode considerations

## Code Standards

### CSS Variables
Define your brand colors as CSS variables:
```css
:root {
  --brand-primary: #000000;
  --brand-secondary: #FFFFFF;
  --brand-accent: #FF0000;
}
```

### Component Naming
- Prefix for custom elements (e.g., `company-button`)
- Class naming convention (e.g., BEM, utility-first)

---

**Note:** This template is a starting point. Customize it based on your brand's specific needs and guidelines.