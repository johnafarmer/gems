# Claude Code Integration Demo

This demonstrates how to use Claude Code as the AI provider in GEMS.

## Prerequisites

1. Install Claude Code CLI from https://claude.ai/code
2. Ensure you're logged in: `claude login`

## Usage Examples

### Using Claude Code (Default)

```bash
# Create a component using Claude Sonnet 4 (default)
gems create hero "Modern hero section with animated gradient"

# Explicitly specify Claude Code
gems create nav --model claude-code
```

### Using Claude Opus 4

```bash
# Use Opus 4 for complex components
gems create "complex e-commerce product grid with filters" --model claude-code-opus

# Or configure it as default
gems config set ai.claudeCode.model "opus-4"
```

### Fallback Behavior

If Claude Code is not available or authentication fails, GEMS will automatically fall back to:
1. Local LM Studio (if configured)
2. OpenRouter cloud models (if API key is set)
3. Template-based generation (as last resort)

## Configuration

```bash
# View current AI configuration
gems config get ai

# Set Claude Code as default (already default in latest version)
gems config set ai.defaultModel "claude-code"

# Switch between Sonnet 4 and Opus 4
gems config set ai.claudeCode.model "opus-4"
```

## Benefits

- **No additional API costs** - Uses your existing Claude subscription
- **Access to latest models** - Sonnet 4 and Opus 4
- **Better quality** - Claude models excel at component generation
- **Faster generation** - Direct CLI access without API overhead

## Troubleshooting

If you encounter issues:

1. **"Claude Code CLI not found"**
   - Install Claude Code: https://claude.ai/code
   - Ensure `claude` is in your PATH

2. **"Authentication failed"**
   - Run `claude login` to authenticate
   - Check your subscription status

3. **"Execution timed out"**
   - Complex components may take longer
   - Increase timeout: `gems config set ai.claudeCode.timeout 120000`