import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeProvider } from './ClaudeCodeProvider.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('ClaudeCodeProvider', () => {
  let provider: ClaudeCodeProvider;
  let mockSpawn: any;

  beforeEach(() => {
    provider = new ClaudeCodeProvider(5000); // 5 second timeout for tests
    mockSpawn = vi.mocked(spawn);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generate', () => {
    it('should successfully generate a component with sonnet-4', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const generatePromise = provider.generate({
        prompt: 'Create a button component',
        model: 'sonnet-4'
      });

      // Simulate successful output
      mockProcess.stdout.emit('data', '```javascript\n');
      mockProcess.stdout.emit('data', 'class ButtonComponent extends HTMLElement {\n');
      mockProcess.stdout.emit('data', '  constructor() { super(); }\n');
      mockProcess.stdout.emit('data', '}\n');
      mockProcess.stdout.emit('data', 'customElements.define("button-component", ButtonComponent);\n');
      mockProcess.stdout.emit('data', '```');
      mockProcess.emit('close', 0);

      const result = await generatePromise;

      expect(result.content).toContain('class ButtonComponent extends HTMLElement');
      expect(result.content).toContain('customElements.define');
      expect(result.source.type).toBe('claude-code');
      expect(result.source.model).toBe('claude-sonnet-4');
    });

    it('should successfully generate a component with opus-4', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const generatePromise = provider.generate({
        prompt: 'Create a card component',
        model: 'opus-4'
      });

      // Check that opus-4 model flag is passed
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--model', 'opus-4']),
        expect.any(Object)
      );

      // Simulate successful output
      mockProcess.stdout.emit('data', '```javascript\n');
      mockProcess.stdout.emit('data', 'class CardComponent extends HTMLElement {\n');
      mockProcess.stdout.emit('data', '  constructor() { super(); }\n');
      mockProcess.stdout.emit('data', '}\n');
      mockProcess.stdout.emit('data', 'customElements.define("card-component", CardComponent);\n');
      mockProcess.stdout.emit('data', '```');
      mockProcess.emit('close', 0);

      const result = await generatePromise;

      expect(result.source.model).toBe('claude-opus-4');
    });

    it('should handle authentication errors', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const generatePromise = provider.generate({
        prompt: 'Create a component',
        model: 'sonnet-4'
      });

      // Simulate auth error
      mockProcess.stderr.emit('data', 'Error: authentication failed');
      mockProcess.emit('close', 1);

      await expect(generatePromise).rejects.toThrow('authentication failed');
    });

    it('should handle Claude not being installed', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const generatePromise = provider.generate({
        prompt: 'Create a component',
        model: 'sonnet-4'
      });

      // Simulate ENOENT error
      const error = new Error('spawn claude ENOENT') as any;
      error.code = 'ENOENT';
      mockProcess.emit('error', error);

      await expect(generatePromise).rejects.toThrow('Claude Code CLI not found');
    });

    it('should handle timeout', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const shortTimeoutProvider = new ClaudeCodeProvider(100); // 100ms timeout
      const generatePromise = shortTimeoutProvider.generate({
        prompt: 'Create a component',
        model: 'sonnet-4'
      });

      // Don't emit any events, let it timeout
      await expect(generatePromise).rejects.toThrow('execution timed out');
      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    it('should return true when Claude is available', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const availablePromise = provider.isAvailable();

      // Simulate successful version check
      mockProcess.emit('close', 0);

      const result = await availablePromise;
      expect(result).toBe(true);
    });

    it('should return false when Claude is not available', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const availablePromise = provider.isAvailable();

      // Simulate error
      mockProcess.emit('error', new Error('Command not found'));

      const result = await availablePromise;
      expect(result).toBe(false);
    });
  });

  describe('parseClaudeOutput', () => {
    it('should extract code from markdown code blocks', () => {
      const output = `Here's your component:

\`\`\`javascript
class TestComponent extends HTMLElement {
  constructor() {
    super();
  }
}
customElements.define('test-component', TestComponent);
\`\`\`

That's the component!`;

      const provider = new ClaudeCodeProvider();
      const parsed = (provider as any).parseClaudeOutput(output);

      expect(parsed).toContain('class TestComponent extends HTMLElement');
      expect(parsed).toContain('customElements.define');
      expect(parsed).not.toContain("Here's your component");
      expect(parsed).not.toContain("That's the component");
    });

    it('should handle output without code blocks', () => {
      const output = `class DirectComponent extends HTMLElement {
  constructor() {
    super();
  }
}
customElements.define('direct-component', DirectComponent);`;

      const provider = new ClaudeCodeProvider();
      const parsed = (provider as any).parseClaudeOutput(output);

      expect(parsed).toBe(output.trim());
    });

    it('should throw error for invalid output', () => {
      const output = `This is not a valid component code. Just some random text.`;

      const provider = new ClaudeCodeProvider();
      
      expect(() => {
        (provider as any).parseClaudeOutput(output);
      }).toThrow('Could not parse valid web component code');
    });
  });
});