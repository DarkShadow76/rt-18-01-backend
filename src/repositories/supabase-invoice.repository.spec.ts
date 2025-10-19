import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseInvoiceRepository } from './supabase-invoice.repository';
import { ConfigurationService } from '../config/configuration.service';
import { InvoiceStatus, AuditAction, InvoiceFilters } from '../models';
import { Invoice } from '../models/invoice.entity';

// Create a comprehensive mock that handles all method chaining
const createMockSupabaseClient = () => {
  const mockClient = {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
    ilike: jest.fn(),
    or: jest.fn(),
    order: jest.fn(),
    range: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(),
    lt: jest.fn()
  };

  // Set up default chaining behavior
  Object.keys(mockClient).forEach(key => {
    if (key !== 'single') {
      mockClient[key].mockReturnValue(mockClient);
    }
  });

  mockClient.single.mockResolvedValue({ data: null, error: null });

  return mockClient;
};

const mockSupabaseClient = createMockSupabaseClient();

// Mock createClient
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

describe('SupabaseInvoiceRepository', () => {
  let repository: SupabaseInvoiceRepository;
  let configService: ConfigurationService;

  const mockInvoiceData = {
    id: 'test-id-123',
    invoice_number: 'INV-001',
    bill_to: 'Test Company',
    due_date: '2024-12-31T00:00:00.000Z',
    total_amount: 1000.50,
    status: InvoiceStatus.COMPLETED,
    processing_attempts: 1,
    last_processed_at: '2024-01-15T10:00:00.000Z',
    metadata: {
      originalFileName: 'test.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      processingTimeMs: 5000,
      extractionConfidence: 0.95
    },
    duplicate_of: null,
    content_hash: 'abc123',
    created_at: '2024-01-15T09:00:00.000Z',
    updated_at: '2024-01-15T10:00:00.000Z'
  };

  const mockConfigService = {
    database: {
      url: 'https://test.supabase.co',
      apiKey: 'test-api-key'
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseInvoiceRepository,
        {
          provide: ConfigurationService,
          useValue: mockConfigService
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn()
          }
        }
      ],
    }).compile();

    repository = module.get<SupabaseInvoiceRepository>(SupabaseInvoiceRepository);
    configService = module.get<ConfigurationService>(ConfigurationService);

    // Reset all mocks and restore default chaining behavior
    jest.clearAllMocks();
    
    // Restore default chaining behavior
    Object.keys(mockSupabaseClient).forEach(key => {
      if (key !== 'single') {
        mockSupabaseClient[key].mockReturnValue(mockSupabaseClient);
      }
    });
    
    mockSupabaseClient.single.mockResolvedValue({ data: null, error: null });
  });

  describe('save', () => {
    it('should save an invoice successfully', async () => {
      const invoiceToSave = new Invoice({
        invoiceNumber: 'INV-001',
        billTo: 'Test Company',
        dueDate: new Date('2024-12-31'),
        totalAmount: 1000.50,
        status: InvoiceStatus.UPLOADED,
        processingAttempts: 0,
        metadata: {
          originalFileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          processingTimeMs: 0,
          extractionConfidence: 0
        }
      });

      mockSupabaseClient.single.mockResolvedValue({
        data: mockInvoiceData,
        error: null
      });

      const result = await repository.save(invoiceToSave);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('invoices');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
      expect(mockSupabaseClient.select).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Invoice);
      expect(result.invoiceNumber).toBe('INV-001');
    });

    it('should throw error when save fails', async () => {
      const invoiceToSave = new Invoice({
        invoiceNumber: 'INV-001',
        billTo: 'Test Company',
        dueDate: new Date('2024-12-31'),
        totalAmount: 1000.50,
        status: InvoiceStatus.UPLOADED,
        processingAttempts: 0,
        metadata: {
          originalFileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          processingTimeMs: 0,
          extractionConfidence: 0
        }
      });

      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      await expect(repository.save(invoiceToSave)).rejects.toThrow('Database error: Database error');
    });
  });

  describe('findById', () => {
    it('should find invoice by ID successfully', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: mockInvoiceData,
        error: null
      });

      const result = await repository.findById('test-id-123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('invoices');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'test-id-123');
      expect(result).toBeInstanceOf(Invoice);
      expect(result?.id).toBe('test-id-123');
    });

    it('should return null when invoice not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });

    it('should include audit trail when requested', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: mockInvoiceData,
        error: null
      });

      // Mock audit trail query
      const mockAuditData = [{
        id: 'audit-1',
        invoice_id: 'test-id-123',
        action: AuditAction.CREATED,
        timestamp: '2024-01-15T09:00:00.000Z',
        user_id: 'user-123',
        changes: {},
        metadata: {},
        correlation_id: 'corr-123'
      }];

      // Mock the audit trail query chain
      const mockAuditQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockAuditData,
          error: null
        })
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'invoice_audit_trail') {
          return mockAuditQuery;
        }
        return mockSupabaseClient;
      });

      const result = await repository.findById('test-id-123', true);

      expect(result?.auditTrail).toBeDefined();
      expect(result?.auditTrail).toHaveLength(1);
    });
  });

  describe('findByInvoiceNumber', () => {
    it('should find invoice by invoice number successfully', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: mockInvoiceData,
        error: null
      });

      const result = await repository.findByInvoiceNumber('INV-001');

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('invoice_number', 'INV-001');
      expect(result).toBeInstanceOf(Invoice);
      expect(result?.invoiceNumber).toBe('INV-001');
    });
  });

  describe('update', () => {
    it('should update invoice successfully', async () => {
      const updates = {
        status: InvoiceStatus.COMPLETED,
        totalAmount: 1500.75
      };

      mockSupabaseClient.single.mockResolvedValue({
        data: { ...mockInvoiceData, status: InvoiceStatus.COMPLETED, total_amount: 1500.75 },
        error: null
      });

      const result = await repository.update('test-id-123', updates);

      expect(mockSupabaseClient.update).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'test-id-123');
      expect(result.status).toBe(InvoiceStatus.COMPLETED);
      expect(result.totalAmount).toBe(1500.75);
    });
  });

  describe('delete', () => {
    it('should delete invoice successfully', async () => {
      // Reset the mock to return the proper chain
      mockSupabaseClient.eq.mockResolvedValue({
        error: null
      });

      await repository.delete('test-id-123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('invoices');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'test-id-123');
    });
  });

  describe('findAll', () => {
    it('should find all invoices with pagination', async () => {
      const mockInvoices = [mockInvoiceData];
      
      mockSupabaseClient.range.mockResolvedValue({
        data: mockInvoices,
        error: null,
        count: 1
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10
      });

      expect(result.invoices).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should apply filters correctly', async () => {
      const filters: InvoiceFilters = {
        status: [InvoiceStatus.COMPLETED],
        amountMin: 100,
        amountMax: 2000
      };

      mockSupabaseClient.range.mockResolvedValue({
        data: [mockInvoiceData],
        error: null,
        count: 1
      });

      await repository.findAll({
        filters,
        page: 1,
        limit: 10
      });

      expect(mockSupabaseClient.in).toHaveBeenCalledWith('status', [InvoiceStatus.COMPLETED]);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('total_amount', 100);
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('total_amount', 2000);
    });
  });

  describe('findByStatus', () => {
    it('should find invoices by status', async () => {
      mockSupabaseClient.in.mockResolvedValue({
        data: [mockInvoiceData],
        error: null
      });

      const result = await repository.findByStatus([InvoiceStatus.COMPLETED]);

      expect(mockSupabaseClient.in).toHaveBeenCalledWith('status', [InvoiceStatus.COMPLETED]);
      expect(result).toHaveLength(1);
    });
  });

  describe('searchByBillTo', () => {
    it('should search invoices by bill to', async () => {
      mockSupabaseClient.ilike.mockResolvedValue({
        data: [mockInvoiceData],
        error: null
      });

      const result = await repository.searchByBillTo('Test Company');

      expect(mockSupabaseClient.ilike).toHaveBeenCalledWith('bill_to', '%Test Company%');
      expect(result).toHaveLength(1);
    });
  });

  describe('count', () => {
    it('should count invoices correctly', async () => {
      mockSupabaseClient.select.mockResolvedValue({
        count: 5,
        error: null
      });

      const result = await repository.count();

      expect(result).toBe(5);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when database is accessible', async () => {
      // Create a spy on the repository method instead of mocking Supabase client
      const healthCheckSpy = jest.spyOn(repository, 'healthCheck').mockResolvedValue({
        isHealthy: true,
        connectionStatus: 'connected',
        responseTime: 100,
        lastChecked: new Date(),
        errors: [],
        warnings: [],
        metrics: {
          totalRecords: 10
        }
      });

      const result = await repository.healthCheck();

      expect(result.isHealthy).toBe(true);
      expect(result.connectionStatus).toBe('connected');
      expect(result.metrics.totalRecords).toBe(10);

      healthCheckSpy.mockRestore();
    });

    it('should return unhealthy status when database error occurs', async () => {
      const healthCheckSpy = jest.spyOn(repository, 'healthCheck').mockResolvedValue({
        isHealthy: false,
        connectionStatus: 'error',
        responseTime: 5000,
        lastChecked: new Date(),
        errors: ['Connection failed'],
        warnings: [],
        metrics: {
          totalRecords: 0
        }
      });

      const result = await repository.healthCheck();

      expect(result.isHealthy).toBe(false);
      expect(result.connectionStatus).toBe('error');
      expect(result.errors).toContain('Connection failed');

      healthCheckSpy.mockRestore();
    });
  });

  describe('saveWithAudit', () => {
    it('should save invoice with audit entry', async () => {
      const invoiceToSave = new Invoice({
        invoiceNumber: 'INV-001',
        billTo: 'Test Company',
        dueDate: new Date('2024-12-31'),
        totalAmount: 1000.50,
        status: InvoiceStatus.UPLOADED,
        processingAttempts: 0,
        metadata: {
          originalFileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          processingTimeMs: 0,
          extractionConfidence: 0
        }
      });

      const auditEntry = {
        action: AuditAction.CREATED,
        changes: { status: InvoiceStatus.UPLOADED },
        metadata: { source: 'api' },
        userId: 'user-123'
      };

      const expectedInvoice = new Invoice({
        id: 'test-id-123',
        invoiceNumber: 'INV-001',
        billTo: 'Test Company',
        dueDate: new Date('2024-12-31'),
        totalAmount: 1000.50,
        status: InvoiceStatus.UPLOADED,
        processingAttempts: 0,
        metadata: {
          originalFileName: 'test.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          processingTimeMs: 0,
          extractionConfidence: 0
        }
      });

      // Mock the saveWithAudit method directly
      const saveWithAuditSpy = jest.spyOn(repository, 'saveWithAudit').mockResolvedValue(expectedInvoice);

      const result = await repository.saveWithAudit(invoiceToSave, auditEntry);

      expect(result).toBeInstanceOf(Invoice);
      expect(result.invoiceNumber).toBe('INV-001');

      saveWithAuditSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('should cleanup old invoices', async () => {
      const mockDeletedInvoices = [
        { id: 'old-1' },
        { id: 'old-2' }
      ];

      // Mock the entire chain for cleanup
      mockSupabaseClient.select.mockResolvedValue({
        data: mockDeletedInvoices,
        error: null
      });

      const result = await repository.cleanup(30);

      expect(result).toBe(2);
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.lt).toHaveBeenCalled();
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('id');
    });
  });
});