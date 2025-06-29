# GEMS - Generative Element Management System 🚀

[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-f6f6f6?style=flat&logo=bun&logoColor=f6f6f6)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Powered by AI](https://img.shields.io/badge/Powered%20by-AI-blueviolet?style=flat)](https://openrouter.ai)

GEMS is a blazing-fast CLI tool for rapid prototyping of web components for WordPress websites. Generate beautiful, accessible components through natural language prompts - all with a local-first approach that respects your privacy and works offline.

## ✨ Features

### Available Now
- **🎯 Natural Language Generation** - Describe what you want, get production-ready components
- **🏠 Local-First** - Primary AI processing via LM Studio, fallback to cloud when needed
- **⚡ Lightning Fast** - Built with Bun for superior performance
- **🔌 WordPress Ready** - Components work seamlessly with WordPress
- **👁️ Live Preview** - Interactive preview server with component management
- **💎 SHARDS** - Create and browse multiple versions of your components
- **🎨 Interactive Mode** - User-friendly CLI with visual menus

### Coming Soon
- **🎤 Voice Input** - Speak your ideas into existence with local Whisper WASM
- **📸 Screenshot to Component** - Turn any design into code instantly
- **🔄 Multi-Framework Output** - Export to React, Vue, or vanilla JS
- **🧪 Visual Regression Testing** - Built-in testing for your components

## 🚀 Quick Start

```bash
# Install GEMS globally
bun install -g gems-cli

# Generate your first component
gems create hero

# Start interactive mode
gems

# Preview your components
gems preview

# Configure AI endpoints
gems config ai
```

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh) - All-in-one JavaScript runtime & toolkit
- **Language**: TypeScript 5.0+
- **CLI Framework**: [Cliffy](https://cliffy.io) - Type-safe CLI framework
- **AI Integration**: 
  - [LM Studio](https://lmstudio.ai) for local models
  - [OpenRouter](https://openrouter.ai) for cloud models
- **Preview Server**: Custom-built with glassmorphic UI
- **Component Output**: Web Components (vanilla JS)

## 📋 Prerequisites

- Bun 1.0+ installed (`curl -fsSL https://bun.sh/install | bash`)
- Node.js 18+ (for some dependencies)
- LM Studio (optional, for local AI)
- OpenRouter API key (optional, for cloud AI)

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/gems.git
cd gems

# Install dependencies
bun install

# Link for local development
bun link

# Run the CLI
gems
```

## 🏗️ Project Structure

```
gems/
├── src/
│   ├── cli/              # CLI commands and interface
│   ├── services/         # Core services (AI, storage, etc.)
│   ├── generators/       # Component generation logic
│   ├── templates/        # Component templates
│   ├── preview/          # Preview server
│   └── utils/           # Utilities and helpers
├── tests/               # Test suites
├── prompts/            # AI prompt templates
└── examples/           # Example components
```

## 💎 SHARDS - Version Your Components

SHARDS let you create multiple versions of any component directly from the preview server:

1. **View a component** in the preview server
2. **Click "New SHARD"** to create a variation
3. **Describe the changes** you want (e.g., "make it more colorful", "add animations")
4. **Browse versions** with the version slider
5. **Copy any version** independently

Each SHARD maintains the original component's structure while applying your requested modifications.

## 🎯 Usage Examples

### Basic Component Generation
```bash
# Generate a hero section
gems create hero --brand "TechCorp" --style "modern"

# Generate a pricing table
gems create pricing --columns 3 --currency USD

# Generate from description
gems create "A testimonial carousel with customer photos and ratings"
```

### Advanced Features
```bash
# Use local AI model
gems create nav --model local

# Use cloud AI model (OpenRouter)
gems create hero --model cloud

# Interactive mode for easy creation
gems
```

### Configuration
```bash
# Set up LM Studio endpoint
gems config set ai.local.endpoint "http://10.0.0.237:1234"

# Configure OpenRouter
gems config set ai.openrouter.key "your-api-key"

# Set default output format
gems config set output.format "webcomponent"
```

## 🤖 AI Configuration

GEMS uses a smart routing system for AI:

1. **Local Models** (via LM Studio)
   - Default: Devstral at `http://10.0.0.237:1234`
   - Privacy-first, no data leaves your network
   - Works offline

2. **Cloud Models** (via OpenRouter)
   - Fallback when local unavailable
   - Access to latest models
   - Requires API key

## 🎨 Component Types

- **Hero Sections** - Stunning landing page heroes
- **Navigation** - Responsive nav bars and menus
- **Forms** - Contact, signup, and custom forms
- **CTAs** - Call-to-action sections
- **Grids** - Feature and product grids
- **Testimonials** - Social proof sections
- **Footers** - Complete footer sections
- **Custom** - Anything you can imagine!

## 🧪 Development

```bash
# Run in development mode
bun run dev

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Lint code
bun run lint

# Format code
bun run format

# Type checking
bun run typecheck

# Build for production
bun run build
```

## 📚 Documentation

- [Getting Started](./docs/getting-started.md)
- [CLI Reference](./docs/cli-reference.md)
- [Component Guidelines](./docs/components.md)
- [AI Integration](./docs/ai-integration.md)
- [WordPress Integration](./docs/wordpress.md)
- [Contributing](./CONTRIBUTING.md)

## 🤝 Contributing

We love contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## 📄 License

MIT © [Your Name]

## 🗺️ Roadmap

### ✅ Completed
- Natural language component generation
- Local-first AI with LM Studio
- Cloud AI fallback with OpenRouter
- Interactive CLI mode
- Live preview server
- WordPress-ready output
- **SHARDS versioning system** (NEW!)

### 🚧 In Progress
- Voice input support
- Screenshot to component
- Multi-framework output
- Visual regression testing
- Component marketplace

## 🙏 Acknowledgments

- Built with love using [Bun](https://bun.sh)
- AI powered by [OpenRouter](https://openrouter.ai) and [LM Studio](https://lmstudio.ai)
- CLI magic by [Cliffy](https://cliffy.io)

---

<p align="center">Made with ❤️ and ☕ by developers, for developers</p>