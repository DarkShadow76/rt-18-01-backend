import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AuditService } from './audit.service';
import { 
  IAuditRepository,
  AuditEntry, 
  AuditSearchCriteria,
  AuditActionStats,
  UserActivityStats,
  RepositoryHealthStatus
} from '../../models';
import { AuditAction } from '../../models/invoice.entity';

describe('AuditService', () => {
  let service: AuditService;
  let mockAuditRepository: jest.Mocked<IAuditRepository>;

  const mockAuditEntry: AuditEntry = {
    id: 'audit-123',
    invoiceId: 'invoice-123',
    action: AuditAction.CREATED,
    timestamp: new Date('2023-01-01T10:00:00Z'),
    userId: 'user-123',
    changes: { created: { invoiceNumber: 'INV-001' } },
    metadata: { operation: 'invoice_creation' },
    correlationId: 'corr-123',
  };

  const mockAuditRepositoryMethods = {
    save: jest.fn(),
    findById: jest.fn(),
    findByInvoiceId: jest.fn(),
    findByAction: jest.fn(),
    findByUserId: jest.fn(),
    findByDateRange: jest.fn(),
    findByCorrelationId: jest.fn(),
    search: jest.fn(),
    count: jest.fn(),
    getActionStats: jest.fn(),
    getUserActivityStats: jest.fn(),
    cleanup: jest.fn(),
    healthCheck: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: 'IAuditRepository',
          useValue: mockAuditRepositoryMethods,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    mockAuditRepository = module.get('IAuditRepository');

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    it('should successfully log an action', async () => {
      mockAuditRepository.save.mockResolvedValue(mockAuditEntry);

      await service.logAction(
        'invoice-123',
        AuditAction.CREATED,
        { created: { invoiceNumber: 'INV-001' } },
        { operation: 'test' },
        'user-123',
        'corr-123',
      );

      expect(mockAuditRepository.save).toHaveBeenCalledWith({
        invoiceId: 'invoice-123',
        action: AuditAction.CREATED,
        userId: 'user-123',
        changes: { created: { invoiceNumber: 'INV-001' } },
        metadata: expect.objectContaining({
          operation: 'test',
          timestamp: expect.any(String),
          source: 'audit-service',
        }),
        correlationId: 'corr-123',
      });
    });

    it('should handle repository errors gracefully', async () => {
      mockAuditRepository.save.mockRejectedValue(new Error('Database error'));
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(
        service.logAction(
          'invoice-123',
          AuditAction.CREATED,
          { created: { invoiceNumber: 'INV-001' } },
        ),
      ).resolves.not.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create audit entry'),
        expect.any(Object),
      );
    });

    it('should log action without optional parameters', async () => {
      mockAuditRepository.save.mockResolvedValue(mockAuditEntry);

      await service.logAction(
        'invoice-123',
        AuditAction.UPDATED,
        { updated: { status: 'completed' } },
      );

      expect(mockAuditRepository.save).toHaveBeenCalledWith({
        invoiceId: 'invoice-123',
        action: AuditAction.UPDATED,
        userId: undefined,
        changes: { updated: { status: 'completed' } },
        metadata: expect.objectContaining({
          timestamp: expect.any(String),
          source: 'audit-service',
        }),
        correlationId: undefined,
      });
    });
  });

  describe('getAuditTrail', () => {
    it('should return audit trail for an invoice', async () => {
      const mockEntries = [mockAuditEntry];
      mockAuditRepository.findByInvoiceId.mockResolvedValue(mockEntries);

      const result = await service.getAuditTrail('invoice-123');

      expect(result).toEqual(mockEntries);
      expect(mockAuditRepository.findByInvoiceId).toHaveBeenCalledWith('invoice-123', {
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    });

    it('should throw error when repository fails', async () => {
      mockAuditRepository.findByInvoiceId.mockRejectedValue(new Error('Database error'));

      await expect(service.getAuditTrail('invoice-123')).rejects.toThrow('Database error');
    });
  });

  describe('searchAuditLogs', () => {
    it('should search audit logs and return entries', async () => {
      const criteria: AuditSearchCriteria = {
        invoiceId: 'invoice-123',
        action: AuditAction.CREATED,
      };
      const mockResult = {
        entries: [mockAuditEntry],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockAuditRepository.search.mockResolvedValue(mockResult);

      const result = await service.searchAuditLogs(criteria);

      expect(result).toEqual([mockAuditEntry]);
      expect(mockAuditRepository.search).toHaveBeenCalledWith(criteria);
    });

    it('should throw error when search fails', async () => {
      const criteria: AuditSearchCriteria = { invoiceId: 'invoice-123' };
      mockAuditRepository.search.mockRejectedValue(new Error('Search error'));

      await expect(service.searchAuditLogs(criteria)).rejects.toThrow('Search error');
    });
  });

  describe('searchAuditLogsPaginated', () => {
    it('should return paginated search results', async () => {
      const criteria: AuditSearchCriteria = {
        limit: 10,
        offset: 0,
      };
      const mockResult = {
        entries: [mockAuditEntry],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      mockAuditRepository.search.mockResolvedValue(mockResult);

      const result = await service.searchAuditLogsPaginated(criteria);

      expect(result).toEqual(mockResult);
      expect(mockAuditRepository.search).toHaveBeenCalledWith(criteria);
    });
  });

  describe('getAuditEntriesByAction', () => {
    it('should return audit entries by action', async () => {
      const mockEntries = [mockAuditEntry];
      mockAuditRepository.findByAction.mockResolvedValue(mockEntries);

      const result = await service.getAuditEntriesByAction(AuditAction.CREATED, 10, 0);

      expect(result).toEqual(mockEntries);
      expect(mockAuditRepository.findByAction).toHaveBeenCalledWith(AuditAction.CREATED, {
        limit: 10,
        offset: 0,
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    });
  });

  describe('getAuditEntriesByUser', () => {
    it('should return audit entries by user', async () => {
      const mockEntries = [mockAuditEntry];
      mockAuditRepository.findByUserId.mockResolvedValue(mockEntries);

      const result = await service.getAuditEntriesByUser('user-123', 10, 0);

      expect(result).toEqual(mockEntries);
      expect(mockAuditRepository.findByUserId).toHaveBeenCalledWith('user-123', {
        limit: 10,
        offset: 0,
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    });
  });

  describe('getAuditEntriesByCorrelationId', () => {
    it('should return audit entries by correlation ID', async () => {
      const mockEntries = [mockAuditEntry];
      mockAuditRepository.findByCorrelationId.mockResolvedValue(mockEntries);

      const result = await service.getAuditEntriesByCorrelationId('corr-123');

      expect(result).toEqual(mockEntries);
      expect(mockAuditRepository.findByCorrelationId).toHaveBeenCalledWith('corr-123');
    });
  });

  describe('getAuditEntriesByDateRange', () => {
    it('should return audit entries by date range', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-31');
      const mockEntries = [mockAuditEntry];
      mockAuditRepository.findByDateRange.mockResolvedValue(mockEntries);

      const result = await service.getAuditEntriesByDateRange(startDate, endDate, 10, 0);

      expect(result).toEqual(mockEntries);
      expect(mockAuditRepository.findByDateRange).toHaveBeenCalledWith(startDate, endDate, {
        limit: 10,
        offset: 0,
        sortBy: 'timestamp',
        sortOrder: 'desc',
      });
    });
  });

  describe('getActionStats', () => {
    it('should return action statistics', async () => {
      const mockStats: AuditActionStats = {
        totalActions: 100,
        actionCounts: { [AuditAction.CREATED]: 50, [AuditAction.UPDATED]: 30 },
        userCounts: { 'user-123': 80, 'user-456': 20 },
        dailyActivity: [],
      };
      mockAuditRepository.getActionStats.mockResolvedValue(mockStats);

      const result = await service.getActionStats();

      expect(result).toEqual(mockStats);
      expect(mockAuditRepository.getActionStats).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should return action statistics with date range', async () => {
      const dateFrom = new Date('2023-01-01');
      const dateTo = new Date('2023-01-31');
      const mockStats: AuditActionStats = {
        totalActions: 50,
        actionCounts: { [AuditAction.CREATED]: 25, [AuditAction.UPDATED]: 15 },
        userCounts: { 'user-123': 40, 'user-456': 10 },
        dailyActivity: [],
      };
      mockAuditRepository.getActionStats.mockResolvedValue(mockStats);

      const result = await service.getActionStats(dateFrom, dateTo);

      expect(result).toEqual(mockStats);
      expect(mockAuditRepository.getActionStats).toHaveBeenCalledWith(dateFrom, dateTo);
    });
  });

  describe('getUserActivityStats', () => {
    it('should return user activity statistics', async () => {
      const mockStats: UserActivityStats = {
        userId: 'user-123',
        totalActions: 50,
        actionBreakdown: { [AuditAction.CREATED]: 30, [AuditAction.UPDATED]: 20 },
        firstActivity: new Date('2023-01-01'),
        lastActivity: new Date('2023-01-31'),
        averageActionsPerDay: 1.6,
      };
      mockAuditRepository.getUserActivityStats.mockResolvedValue(mockStats);

      const result = await service.getUserActivityStats('user-123');

      expect(result).toEqual(mockStats);
      expect(mockAuditRepository.getUserActivityStats).toHaveBeenCalledWith(
        'user-123',
        undefined,
        undefined,
      );
    });
  });

  describe('countAuditEntries', () => {
    it('should return count of audit entries', async () => {
      mockAuditRepository.count.mockResolvedValue(100);

      const result = await service.countAuditEntries();

      expect(result).toBe(100);
      expect(mockAuditRepository.count).toHaveBeenCalledWith(undefined);
    });

    it('should return count with criteria', async () => {
      const criteria: AuditSearchCriteria = { action: AuditAction.CREATED };
      mockAuditRepository.count.mockResolvedValue(50);

      const result = await service.countAuditEntries(criteria);

      expect(result).toBe(50);
      expect(mockAuditRepository.count).toHaveBeenCalledWith(criteria);
    });
  });

  describe('cleanupOldEntries', () => {
    it('should cleanup old entries and return count', async () => {
      mockAuditRepository.cleanup.mockResolvedValue(25);
      const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const result = await service.cleanupOldEntries(30);

      expect(result).toBe(25);
      expect(mockAuditRepository.cleanup).toHaveBeenCalledWith(30);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Cleaned up 25 audit entries older than 30 days',
      );
    });

    it('should throw error when cleanup fails', async () => {
      mockAuditRepository.cleanup.mockRejectedValue(new Error('Cleanup error'));

      await expect(service.cleanupOldEntries(30)).rejects.toThrow('Cleanup error');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const mockHealthStatus: RepositoryHealthStatus = {
        isHealthy: true,
        connectionStatus: 'connected',
        responseTime: 50,
        lastChecked: new Date(),
        errors: [],
        warnings: [],
        metrics: { totalRecords: 1000 },
      };
      mockAuditRepository.healthCheck.mockResolvedValue(mockHealthStatus);

      const result = await service.healthCheck();

      expect(result).toEqual({
        isHealthy: true,
        message: 'Audit service is healthy',
      });
    });

    it('should return unhealthy status', async () => {
      const mockHealthStatus: RepositoryHealthStatus = {
        isHealthy: false,
        connectionStatus: 'error',
        responseTime: 5000,
        lastChecked: new Date(),
        errors: ['Connection timeout'],
        warnings: [],
        metrics: { totalRecords: 0 },
      };
      mockAuditRepository.healthCheck.mockResolvedValue(mockHealthStatus);

      const result = await service.healthCheck();

      expect(result).toEqual({
        isHealthy: false,
        message: 'Audit service has issues',
      });
    });

    it('should handle health check errors', async () => {
      mockAuditRepository.healthCheck.mockRejectedValue(new Error('Health check failed'));

      const result = await service.healthCheck();

      expect(result).toEqual({
        isHealthy: false,
        message: 'Audit service health check failed: Health check failed',
      });
    });
  });

  describe('Helper methods', () => {
    describe('logInvoiceCreated', () => {
      it('should log invoice creation', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logInvoiceCreated(
          'invoice-123',
          { invoiceNumber: 'INV-001' },
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.CREATED,
          { created: { invoiceNumber: 'INV-001' } },
          { operation: 'invoice_creation' },
          'user-123',
          'corr-123',
        );
      });
    });

    describe('logInvoiceUpdated', () => {
      it('should log invoice update with changes', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logInvoiceUpdated(
          'invoice-123',
          { status: 'processing', amount: 100 },
          { status: 'completed', amount: 150 },
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.UPDATED,
          {
            status: { old: 'processing', new: 'completed' },
            amount: { old: 100, new: 150 },
          },
          { operation: 'invoice_update' },
          'user-123',
          'corr-123',
        );
      });
    });

    describe('logInvoiceDeleted', () => {
      it('should log invoice deletion', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logInvoiceDeleted(
          'invoice-123',
          { invoiceNumber: 'INV-001' },
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.DELETED,
          { deleted: { invoiceNumber: 'INV-001' } },
          { operation: 'invoice_deletion' },
          'user-123',
          'corr-123',
        );
      });
    });

    describe('logStatusChanged', () => {
      it('should log status change', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logStatusChanged(
          'invoice-123',
          'processing',
          'completed',
          'Processing finished successfully',
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.STATUS_CHANGED,
          {
            oldStatus: 'processing',
            newStatus: 'completed',
            reason: 'Processing finished successfully',
          },
          { operation: 'status_change' },
          'user-123',
          'corr-123',
        );
      });
    });

    describe('logProcessingEvent', () => {
      it('should log processing started event', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logProcessingEvent(
          'invoice-123',
          'started',
          { processingId: 'proc-123' },
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.PROCESSED,
          { eventType: 'started', processingId: 'proc-123' },
          { operation: 'processing_event' },
          'user-123',
          'corr-123',
        );
      });

      it('should log processing failed event', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logProcessingEvent(
          'invoice-123',
          'failed',
          { error: 'Processing timeout' },
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.FAILED,
          { eventType: 'failed', error: 'Processing timeout' },
          { operation: 'processing_event' },
          'user-123',
          'corr-123',
        );
      });

      it('should log processing retried event', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logProcessingEvent(
          'invoice-123',
          'retried',
          { attempt: 2 },
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.REPROCESSED,
          { eventType: 'retried', attempt: 2 },
          { operation: 'processing_event' },
          'user-123',
          'corr-123',
        );
      });
    });

    describe('logDuplicateDetected', () => {
      it('should log duplicate detection', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();

        await service.logDuplicateDetected(
          'invoice-123',
          'original-456',
          0.95,
          'content_hash',
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.DUPLICATE_DETECTED,
          {
            originalInvoiceId: 'original-456',
            similarityScore: 0.95,
            detectionMethod: 'content_hash',
          },
          { operation: 'duplicate_detection' },
          'user-123',
          'corr-123',
        );
      });
    });

    describe('logValidationFailed', () => {
      it('should log validation failure', async () => {
        const spy = jest.spyOn(service, 'logAction').mockResolvedValue();
        const validationErrors = [
          { field: 'amount', message: 'Invalid amount', code: 'INVALID_AMOUNT' },
        ];

        await service.logValidationFailed(
          'invoice-123',
          validationErrors,
          'business_rules',
          'user-123',
          'corr-123',
        );

        expect(spy).toHaveBeenCalledWith(
          'invoice-123',
          AuditAction.VALIDATION_FAILED,
          {
            validationErrors,
            validationType: 'business_rules',
          },
          { operation: 'validation_failure' },
          'user-123',
          'corr-123',
        );
      });
    });
  });

  describe('calculateChanges', () => {
    it('should calculate changes between objects', () => {
      const oldData = { status: 'processing', amount: 100, name: 'old' };
      const newData = { status: 'completed', amount: 150, description: 'new' };

      // Access private method for testing
      const changes = (service as any).calculateChanges(oldData, newData);

      expect(changes).toEqual({
        status: { old: 'processing', new: 'completed' },
        amount: { old: 100, new: 150 },
        name: { old: 'old', new: null },
        description: { old: undefined, new: 'new' },
      });
    });

    it('should handle empty objects', () => {
      const changes = (service as any).calculateChanges({}, {});
      expect(changes).toEqual({});
    });
  });
});