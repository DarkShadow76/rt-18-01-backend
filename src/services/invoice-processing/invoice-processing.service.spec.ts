import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceProcessingService } from './invoice-processing.service';
import { 
  IFileValidationService,
  IDocumentAIService,
  IDataExtractionService,
  IInvoiceValidationService,
  IDuplicateDetectionService,
  IInvoiceRepository,
  IAuditService
} from '../../models/service.interfaces';
import { 
  Invoice, 
  AuditAction,
  DuplicateDetectionMethod
} from '../../models/invoice.entity';
import { InvoiceStatus } from '../../common/dto/upload-invoice.dto';
import { AppError } from '../../common/errors/app-error';
import { LoggerService } from '../../common/logger/logger.service';
import { MetricsService } from '../../common/services/metrics.service';

describe('InvoiceProcessingService', () => {
  let service: InvoiceProcessingService;
  let fileValidationService: jest.Mocked<IFileValidationService>;
  let documentAIService: jest.Mocked<IDocumentAIService>;
  let dataExtractionService: jest.Mocked<IDataExtractionService>;
  let invoiceValidationService: jest.Mocked<IInvoiceValidationService>;
  let duplicateDetectionService: jest.Mocked<IDuplicateDetectionService>;
  let invoiceRepository: jest.Mocked<IInvoiceRepository>;
  let auditService: jest.Mocked<IAuditService>;
  let loggerService: jest.Mocked<LoggerService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test-invoice.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('test file content'),
    destination: '',
    filename: '',
    path: '',
    stream: null as any
  };

  const mockExtractedData = {
    invoiceNumber: 'INV-001',
    billTo: 'Test Company',
    dueDate: '2024-12-31',
    totalAmount: 1000,
    confidence: 0.95
  };

  const mockInvoice = new Invoice({
    id: 'test-invoice-id',
    invoiceNumber: 'INV-001',
    billTo: 'Test Company',
    dueDate: new Date('2024-12-31'),
    totalAmount: 1000,
    status: InvoiceStatus.COMPLETED,
    processingAttempts: 1,
    metadata: {
      originalFileName: 'test-invoice.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      processingTimeMs: 1000,
      extractionConfidence: 0.95
    }
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    const mockFileValidationService = {
      validateFile: jest.fn(),
      validateFileContent: jest.fn(),
      scanForMaliciousContent: jest.fn()
    };

    const mockDocumentAIService = {
      processDocument: jest.fn(),
      extractInvoiceData: jest.fn(),
      getProcessorInfo: jest.fn()
    };

    const mockDataExtractionService = {
      extractAndValidateData: jest.fn(),
      normalizeData: jest.fn(),
      validateExtractedData: jest.fn()
    };

    const mockInvoiceValidationService = {
      validateInvoiceData: jest.fn(),
      validateBusinessRules: jest.fn(),
      validateDateFormat: jest.fn(),
      validateAmount: jest.fn()
    };

    const mockDuplicateDetectionService = {
      checkForDuplicates: jest.fn(),
      generateContentHash: jest.fn(),
      findSimilarInvoices: jest.fn(),
      resolveDuplicate: jest.fn()
    };

    const mockInvoiceRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByInvoiceNumber: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn(),
      findByFilters: jest.fn(),
      findByStatus: jest.fn(),
      findByDateRange: jest.fn(),
      findByAmountRange: jest.fn(),
      searchByBillTo: jest.fn(),
      findDuplicates: jest.fn(),
      findByContentHash: jest.fn(),
      findSimilarInvoices: jest.fn(),
      count: jest.fn(),
      getStats: jest.fn(),
      getProcessingMetrics: jest.fn(),
      saveWithAudit: jest.fn(),
      updateWithAudit: jest.fn(),
      deleteWithAudit: jest.fn(),
      saveBatch: jest.fn(),
      updateBatch: jest.fn(),
      healthCheck: jest.fn(),
      cleanup: jest.fn()
    };

    const mockAuditService = {
      logAction: jest.fn(),
      getAuditTrail: jest.fn(),
      searchAuditLogs: jest.fn(),
      logInvoiceCreated: jest.fn(),
      logInvoiceUpdated: jest.fn(),
      logInvoiceDeleted: jest.fn(),
      logStatusChanged: jest.fn(),
      logProcessingEvent: jest.fn(),
      logDuplicateDetected: jest.fn(),
      logValidationFailed: jest.fn()
    };

    const mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn()
    };

    const mockMetricsService = {
      recordProcessingSuccess: jest.fn(),
      recordProcessingFailure: jest.fn(),
      recordValidationFailure: jest.fn(),
      recordDuplicateDetection: jest.fn(),
      getMetrics: jest.fn(),
      recordProcessingTime: jest.fn(),
      recordValidationSuccess: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceProcessingService,
        { provide: 'IFileValidationService', useValue: mockFileValidationService },
        { provide: 'IDocumentAIService', useValue: mockDocumentAIService },
        { provide: 'IDataExtractionService', useValue: mockDataExtractionService },
        { provide: 'IInvoiceValidationService', useValue: mockInvoiceValidationService },
        { provide: 'IDuplicateDetectionService', useValue: mockDuplicateDetectionService },
        { provide: 'IInvoiceRepository', useValue: mockInvoiceRepository },
        { provide: 'IAuditService', useValue: mockAuditService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: MetricsService, useValue: mockMetricsService }
      ]
    }).compile();

    service = module.get<InvoiceProcessingService>(InvoiceProcessingService);
    fileValidationService = module.get('IFileValidationService');
    documentAIService = module.get('IDocumentAIService');
    dataExtractionService = module.get('IDataExtractionService');
    invoiceValidationService = module.get('IInvoiceValidationService');
    duplicateDetectionService = module.get('IDuplicateDetectionService');
    invoiceRepository = module.get('IInvoiceRepository');
    auditService = module.get('IAuditService');
    loggerService = module.get(LoggerService);
    metricsService = module.get(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clear any timers
    jest.clearAllTimers();
  });

  afterAll(() => {
    // Use fake timers to avoid async operations hanging
    jest.useRealTimers();
  });

  describe('processInvoice', () => {
    it('should successfully process a valid invoice', async () => {
      // Arrange
      fileValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        metadata: {
          size: 1024,
          mimeType: 'application/pdf',
          originalName: 'test-invoice.pdf',
          extension: '.pdf'
        }
      });

      documentAIService.processDocument.mockResolvedValue({
        success: true,
        data: mockExtractedData,
        processingTimeMs: 500,
        confidence: 0.95,
        processorVersion: 'v1'
      });

      dataExtractionService.extractAndValidateData.mockResolvedValue(mockExtractedData);

      invoiceValidationService.validateInvoiceData.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      duplicateDetectionService.checkForDuplicates.mockResolvedValue({
        isDuplicate: false,
        detectionMethod: DuplicateDetectionMethod.COMBINED,
        confidence: 1.0
      });

      duplicateDetectionService.generateContentHash.mockReturnValue('test-hash');
      invoiceRepository.save.mockResolvedValue(mockInvoice);

      // Act
      const result = await service.processInvoice(mockFile);

      // Assert
      expect(result).toEqual(mockInvoice);
      expect(fileValidationService.validateFile).toHaveBeenCalledWith(mockFile);
      expect(documentAIService.processDocument).toHaveBeenCalledWith(mockFile);
      expect(dataExtractionService.extractAndValidateData).toHaveBeenCalledWith(
        mockExtractedData
      );
      expect(invoiceValidationService.validateInvoiceData).toHaveBeenCalledWith(
        mockExtractedData
      );
      expect(duplicateDetectionService.checkForDuplicates).toHaveBeenCalled();
      expect(invoiceRepository.save).toHaveBeenCalled();
      expect(auditService.logInvoiceCreated).toHaveBeenCalledWith(
        mockInvoice.id,
        mockInvoice.toResponseDto(),
        undefined,
        expect.any(String)
      );
      expect(auditService.logProcessingEvent).toHaveBeenCalledWith(
        mockInvoice.id,
        'completed',
        expect.objectContaining({
          processingTimeMs: expect.any(Number),
          steps: expect.any(Array),
          retryCount: 0
        }),
        undefined,
        expect.any(String)
      );
      expect(metricsService.recordProcessingSuccess).toHaveBeenCalledWith(
        expect.any(Number)
      );
    });

    it('should handle file validation failure', async () => {
      // Arrange
      fileValidationService.validateFile.mockResolvedValue({
        isValid: false,
        errors: ['File is too large', 'Invalid file type'],
        warnings: [],
        metadata: {
          size: 1024,
          mimeType: 'application/pdf',
          originalName: 'test-invoice.pdf',
          extension: '.pdf'
        }
      });

      // Act & Assert
      await expect(service.processInvoice(mockFile)).rejects.toThrow(AppError);
      expect(fileValidationService.validateFile).toHaveBeenCalledWith(mockFile);
      expect(documentAIService.processDocument).not.toHaveBeenCalled();
      expect(metricsService.recordProcessingFailure).toHaveBeenCalledWith(
        expect.any(Number)
      );
    });

    it('should handle Document AI processing failure', async () => {
      // Arrange
      fileValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        metadata: {
          size: 1024,
          mimeType: 'application/pdf',
          originalName: 'test-invoice.pdf',
          extension: '.pdf'
        }
      });

      documentAIService.processDocument.mockResolvedValue({
        success: false,
        error: 'Document AI service unavailable',
        processingTimeMs: 500,
        confidence: 0,
        processorVersion: 'v1'
      });

      // Act & Assert
      await expect(service.processInvoice(mockFile)).rejects.toThrow(AppError);
      expect(documentAIService.processDocument).toHaveBeenCalledWith(mockFile);
      expect(dataExtractionService.extractAndValidateData).not.toHaveBeenCalled();
      expect(metricsService.recordProcessingFailure).toHaveBeenCalledWith(
        expect.any(Number)
      );
    });

    it('should handle duplicate detection and create duplicate invoice', async () => {
      // Arrange
      fileValidationService.validateFile.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        metadata: {
          size: 1024,
          mimeType: 'application/pdf',
          originalName: 'test-invoice.pdf',
          extension: '.pdf'
        }
      });

      documentAIService.processDocument.mockResolvedValue({
        success: true,
        data: mockExtractedData,
        processingTimeMs: 500,
        confidence: 0.95,
        processorVersion: 'v1'
      });

      dataExtractionService.extractAndValidateData.mockResolvedValue(mockExtractedData);

      invoiceValidationService.validateInvoiceData.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: []
      });

      duplicateDetectionService.checkForDuplicates.mockResolvedValue({
        isDuplicate: true,
        originalInvoiceId: 'original-invoice-id',
        similarityScore: 1.0,
        detectionMethod: DuplicateDetectionMethod.INVOICE_NUMBER,
        confidence: 1.0
      });

      duplicateDetectionService.generateContentHash.mockReturnValue('test-hash');

      const duplicateInvoice = new Invoice({
        ...mockInvoice,
        status: InvoiceStatus.DUPLICATE,
        duplicateOf: 'original-invoice-id'
      });

      invoiceRepository.save.mockResolvedValue(duplicateInvoice);

      // Act
      const result = await service.processInvoice(mockFile);

      // Assert
      expect(result.status).toBe(InvoiceStatus.DUPLICATE);
      expect(result.duplicateOf).toBe('original-invoice-id');
      expect(auditService.logDuplicateDetected).toHaveBeenCalledWith(
        duplicateInvoice.id,
        'original-invoice-id',
        1.0,
        DuplicateDetectionMethod.INVOICE_NUMBER,
        undefined,
        expect.any(String)
      );
    });
  });

  describe('reprocessInvoice', () => {
    it('should successfully reprocess a failed invoice', async () => {
      // Arrange
      const failedInvoice = new Invoice({
        ...mockInvoice,
        status: InvoiceStatus.FAILED,
        processingAttempts: 1
      });

      const reprocessedInvoice = new Invoice({
        ...failedInvoice,
        status: InvoiceStatus.COMPLETED,
        processingAttempts: 2
      });

      invoiceRepository.findById.mockResolvedValue(failedInvoice);
      invoiceRepository.update.mockResolvedValue(reprocessedInvoice);

      // Act
      const result = await service.reprocessInvoice('test-invoice-id');

      // Assert
      expect(result.status).toBe(InvoiceStatus.COMPLETED);
      expect(result.processingAttempts).toBe(2);
      expect(invoiceRepository.findById).toHaveBeenCalledWith('test-invoice-id');
      expect(invoiceRepository.update).toHaveBeenCalledTimes(2);
      expect(auditService.logProcessingEvent).toHaveBeenCalledWith(
        'test-invoice-id',
        'retried',
        expect.objectContaining({
          reason: 'Manual reprocessing',
          previousStatus: InvoiceStatus.FAILED
        }),
        undefined,
        expect.any(String)
      );
    });

    it('should throw error when invoice not found', async () => {
      // Arrange
      invoiceRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.reprocessInvoice('non-existent-id')).rejects.toThrow(AppError);
      expect(invoiceRepository.findById).toHaveBeenCalledWith('non-existent-id');
    });
  });

  describe('getProcessingStatus', () => {
    it('should return processing status for existing invoice', async () => {
      // Arrange
      invoiceRepository.findById.mockResolvedValue(mockInvoice);

      // Act
      const result = await service.getProcessingStatus('test-invoice-id');

      // Assert
      expect(result).toEqual({
        invoiceId: 'test-invoice-id',
        status: 'completed',
        progress: 100,
        currentStep: 'completed',
        startedAt: mockInvoice.createdAt,
        updatedAt: mockInvoice.updatedAt,
        error: undefined
      });
    });

    it('should throw error when invoice not found', async () => {
      // Arrange
      invoiceRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getProcessingStatus('non-existent-id')).rejects.toThrow(AppError);
    });
  });

  describe('cancelProcessing', () => {
    it('should cancel processing for a processing invoice', async () => {
      // Arrange
      const processingInvoice = new Invoice({
        ...mockInvoice,
        status: InvoiceStatus.PROCESSING
      });

      const cancelledInvoice = new Invoice({
        ...processingInvoice,
        status: InvoiceStatus.FAILED
      });

      invoiceRepository.findById.mockResolvedValue(processingInvoice);
      invoiceRepository.update.mockResolvedValue(cancelledInvoice);

      // Act
      await service.cancelProcessing('test-invoice-id');

      // Assert
      expect(invoiceRepository.findById).toHaveBeenCalledWith('test-invoice-id');
      expect(invoiceRepository.update).toHaveBeenCalled();
      expect(auditService.logProcessingEvent).toHaveBeenCalledWith(
        'test-invoice-id',
        'failed',
        { reason: 'Processing cancelled by user' }
      );
    });
  });

  describe('getProcessingStatistics', () => {
    it('should return processing statistics', async () => {
      // Arrange
      invoiceRepository.getStats.mockResolvedValue({
        total: 100,
        byStatus: {
          [InvoiceStatus.UPLOADED]: 5,
          [InvoiceStatus.PROCESSING]: 3,
          [InvoiceStatus.COMPLETED]: 80,
          [InvoiceStatus.FAILED]: 10,
          [InvoiceStatus.DUPLICATE]: 2
        },
        averageProcessingTime: 2500,
        successRate: 80,
        duplicateRate: 2,
        totalAmount: 50000
      });

      // Act
      const result = await service.getProcessingStatistics();

      // Assert
      expect(result).toEqual({
        activeProcessing: 0,
        completedToday: 80,
        failedToday: 10,
        averageProcessingTime: 2500,
        duplicateRate: 2
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all dependencies are working', async () => {
      // Act
      const result = await service.healthCheck();

      // Assert
      expect(result.status).toBe('healthy');
      expect(result.activeProcessing).toBe(0);
      expect(result.dependencies).toBeDefined();
    });
  });
});