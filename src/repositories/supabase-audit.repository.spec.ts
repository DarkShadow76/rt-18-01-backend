import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseAuditRepository } from './supabase-audit.repository';
import { ConfigurationService } from '../config/configuration.service';

// Mock the entire Supabase module
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('SupabaseAuditRepository', () => {
  let repository: SupabaseAuditRepository;
  let configService: jest.Mocked<ConfigurationService>;

  const mockDatabaseConfig = {
    url: 'https://test.supabase.co',
    apiKey: 'test-api-key',
  };

  beforeEach(async () => {
    // Mock the createClient function
    const { createClient } = require('@supabase/supabase-js');
    createClient.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            })
          })
        })
      })
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseAuditRepository,
        {
          provide: ConfigurationService,
          useValue: {
            database: mockDatabaseConfig,
          },
        },
      ],
    }).compile();

    repository = module.get<SupabaseAuditRepository>(SupabaseAuditRepository);
    configService = module.get(ConfigurationService);
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });

    it('should initialize with configuration', () => {
      expect(configService.database).toEqual(mockDatabaseConfig);
    });
  });

  describe('mapToAuditEntry', () => {
    it('should map database row to audit entry', () => {
      const mockDatabaseRow = {
        id: 'audit-123',
        invoice_id: 'invoice-123',
        action: 'created',
        timestamp: '2023-01-01T10:00:00Z',
        user_id: 'user-123',
        changes: { created: { invoiceNumber: 'INV-001' } },
        metadata: { operation: 'invoice_creation' },
        correlation_id: 'corr-123',
      };

      const result = (repository as any).mapToAuditEntry(mockDatabaseRow);

      expect(result).toEqual({
        id: 'audit-123',
        invoiceId: 'invoice-123',
        action: 'created',
        timestamp: new Date('2023-01-01T10:00:00Z'),
        userId: 'user-123',
        changes: { created: { invoiceNumber: 'INV-001' } },
        metadata: { operation: 'invoice_creation' },
        correlationId: 'corr-123',
      });
    });
  });

  describe('mapSortColumn', () => {
    it('should map sort columns correctly', () => {
      expect((repository as any).mapSortColumn('invoiceId')).toBe('invoice_id');
      expect((repository as any).mapSortColumn('userId')).toBe('user_id');
      expect((repository as any).mapSortColumn('correlationId')).toBe('correlation_id');
      expect((repository as any).mapSortColumn('timestamp')).toBe('timestamp');
      expect((repository as any).mapSortColumn('invalidColumn' as any)).toBe('timestamp');
    });
  });

  describe('findById', () => {
    it('should return null when audit entry not found', async () => {
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });
});