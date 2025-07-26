import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from './AIService.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { ClaudeCodeProvider } from './providers/ClaudeCodeProvider.js';

// Mock dependencies
vi.mock('../../config/ConfigManager.js');
vi.mock('./providers/ClaudeCodeProvider.js');
vi.mock('openai');

// Mock fetch for local AI tests
global.fetch = vi.fn();

describe('AIService', () => {
  let aiService: AIService;
  let mockConfig: any;
  let mockClaudeCodeProvider: any;

  beforeEach(() => {
    // Setup mock config
    mockConfig = {
      get: vi.fn((key: string) => {
        const config: any = {
          'ai.defaultModel': 'claude-code',
          'ai.claudeCode.model': 'sonnet-4',
          'ai.claudeCode.timeout': 60000,
          'ai.local.endpoint': 'http://localhost:1234',
          'ai.local.model': 'local-model',
          'ai.openrouter.key': 'test-key',
          'ai.openrouter.model': 'test-model'
        };
        return config[key];
      })
    };

    // Setup mock Claude Code provider
    mockClaudeCodeProvider = {
      generate: vi.fn(),
      isAvailable: vi.fn()
    };

    vi.mocked(ConfigManager).mockImplementation(() => mockConfig);
    vi.mocked(ClaudeCodeProvider).mockImplementation(() => mockClaudeCodeProvider);

    aiService = new AIService(mockConfig);
  });

  describe('generateWithSource', () => {
    it('should use Claude Code when model is claude-code', async () => {
      mockClaudeCodeProvider.isAvailable.mockResolvedValue(true);
      mockClaudeCodeProvider.generate.mockResolvedValue({
        content: 'generated component code',
        source: {
          type: 'claude-code',
          model: 'claude-sonnet-4',
          endpoint: 'local'
        }
      });

      const result = await aiService.generateWithSource({
        prompt: 'Create a button',
        model: 'claude-code'
      });

      expect(mockClaudeCodeProvider.generate).toHaveBeenCalledWith({
        prompt: 'Create a button',
        model: 'sonnet-4'
      });
      expect(result.source.type).toBe('claude-code');
    });

    it('should fall back to local when Claude Code is not available', async () => {
      mockClaudeCodeProvider.isAvailable.mockResolvedValue(false);
      
      // Mock successful local response
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'local generated component'
            }
          }]
        })
      });

      const result = await aiService.generateWithSource({
        prompt: 'Create a button',
        model: 'claude-code'
      });

      expect(mockClaudeCodeProvider.generate).not.toHaveBeenCalled();
      expect(result.source.type).toBe('local');
    });

    it('should fall back to cloud on Claude Code auth error', async () => {
      mockClaudeCodeProvider.isAvailable.mockResolvedValue(true);
      mockClaudeCodeProvider.generate.mockRejectedValue(
        new Error('Claude Code authentication failed')
      );

      const result = await aiService.generateWithSource({
        prompt: 'Create a button',
        model: 'claude-code'
      });

      // Should fall back to cloud due to auth error
      expect(result.source.type).toBe('cloud');
    });

    it('should use default model when not specified', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'ai.defaultModel') return 'claude-code';
        if (key === 'ai.claudeCode.model') return 'opus-4';
        return undefined;
      });

      mockClaudeCodeProvider.isAvailable.mockResolvedValue(true);
      mockClaudeCodeProvider.generate.mockResolvedValue({
        content: 'generated component',
        source: {
          type: 'claude-code',
          model: 'claude-opus-4',
          endpoint: 'local'
        }
      });

      await aiService.generateWithSource({
        prompt: 'Create a card'
      });

      expect(mockClaudeCodeProvider.generate).toHaveBeenCalledWith({
        prompt: 'Create a card',
        model: 'opus-4'
      });
    });
  });

  describe('isClaudeCodeAvailable', () => {
    it('should return true when provider is available', async () => {
      mockClaudeCodeProvider.isAvailable.mockResolvedValue(true);
      
      const result = await aiService.isClaudeCodeAvailable();
      
      expect(result).toBe(true);
    });

    it('should return false when provider is not available', async () => {
      mockClaudeCodeProvider.isAvailable.mockResolvedValue(false);
      
      const result = await aiService.isClaudeCodeAvailable();
      
      expect(result).toBe(false);
    });

    it('should return false when provider is not initialized', async () => {
      // Create service without provider
      const service = new AIService(mockConfig);
      (service as any).claudeCodeProvider = undefined;
      
      const result = await service.isClaudeCodeAvailable();
      
      expect(result).toBe(false);
    });
  });
});