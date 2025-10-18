import { Test, TestingModule } from '@nestjs/testing';
import { DocumentAIService } from './document-ai.service';
import { ConfigurationService } from '../../config/configuration.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError } from '../../common/errors/app-error';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

// Mock the Google Cloud DocumentAI client
jest.mock('@google-cloud/documentai');

describe('DocumentAIService', () => {
  let service: DocumentAIService;
  let configService: jest.Mocked<ConfigurationService>;
  let loggerService: jest.Mocked<LoggerService>;
  let mockClient: any;

  const mockGoogleCloudConfig = {
    projectId: 'test-project',
    location: 'us-central1',
    processorId: 'test-processor',
    credentials: {
      clientEmail: 'test@test.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----',
    },
  };

  beforeEach(async () => {
    const mockConfigService = {
      googleCloud: mockGoogleCloudConfig,
    };

    const mockLoggerService = {
      log: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockClient = {
      processDocument: jest.fn(),
    };

    (DocumentProcessorServiceClient as any).mockImplementation(() => mockClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentAIService,
        {
          provide: ConfigurationService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<DocumentAIService>(DocumentAIService);
    configService = module.get(ConfigurationService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.resetMetrics();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid configuration', () => {
      expect(service).toBeDefined();
      expect(loggerService.log).toHaveBeenCalledWith(
        'Document AI client initialized successfully',
        'DocumentAIService',
        expect.any(Object)
      );
    });

    it('should throw configuration error with invalid credentials', () => {
      const invalidConfig = {
        ...mockGoogleCloudConfig,
        credentials: {
          clientEmail: '',
          privateKey: '',
        },
      };

      expect(() => {
        const mockConfigServiceInvalid = { googleCloud: invalidConfig };
        new DocumentAIService(mockConfigServiceInvalid as any, loggerService);
      }).toThrow(AppError);
    });
  });

  describe('processDocument', () => {
    const mockFileBuffer = Buffer.from('test file content');
    const mockMimeType = 'application/pdf';

    it('should process document successfully', async () => {
      const mockDocumentResult = {
        document: {
          text: 'Invoice content',
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.95,
            },
            {
              type: 'total_amount',
              mentionText: '$100.00',
              confidence: 0.90,
            },
            {
              type: 'due_date',
              mentionText: '2024-01-15',
              confidence: 0.85,
            },
          ],
          pages: [{}],
        },
      };

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType);

      expect(result.success).toBe(true);
      expect(result.extractedData.invoiceNumber).toBe('INV-001');
      expect(result.extractedData.totalAmount).toBe(100);
      expect(result.extractedData.dueDate).toBe('2024-01-15');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);
      expect(result.correlationId).toBeDefined();
      expect(result.retryCount).toBe(0);
    });

    it('should handle document with no entities', async () => {
      const mockDocumentResult = {
        document: {
          text: 'Some document text without entities',
          entities: [],
        },
      };

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType);

      expect(result.success).toBe(true);
      expect(result.extractedData.rawText).toBeDefined();
      expect(result.extractedData._fallbackExtraction).toBe(true);
    });

    it('should retry on retryable errors', async () => {
      const retryableError = new Error('DEADLINE_EXCEEDED') as any;
      retryableError.code = 'DEADLINE_EXCEEDED';

      const mockDocumentResult = {
        document: {
          text: 'Invoice content',
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.95,
            },
          ],
        },
      };

      mockClient.processDocument
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType, {
        maxRetries: 3,
        retryDelayMs: 10, // Short delay for testing
      });

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2);
      expect(mockClient.processDocument).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const retryableError = new Error('DEADLINE_EXCEEDED') as any;
      retryableError.code = 'DEADLINE_EXCEEDED';

      mockClient.processDocument.mockRejectedValue(retryableError);

      const result = await service.processDocument(mockFileBuffer, mockMimeType, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('DEADLINE_EXCEEDED');
      expect(result.retryCount).toBe(2);
      expect(mockClient.processDocument).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry on non-retryable errors', async () => {
      const nonRetryableError = new Error('INVALID_ARGUMENT') as any;
      nonRetryableError.code = 'INVALID_ARGUMENT';

      mockClient.processDocument.mockRejectedValue(nonRetryableError);

      const result = await service.processDocument(mockFileBuffer, mockMimeType, {
        maxRetries: 3,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('INVALID_ARGUMENT');
      expect(result.retryCount).toBe(0);
      expect(mockClient.processDocument).toHaveBeenCalledTimes(1);
    });

    it('should skip low confidence entities when option is enabled', async () => {
      const mockDocumentResult = {
        document: {
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.95, // High confidence
            },
            {
              type: 'total_amount',
              mentionText: '$100.00',
              confidence: 0.3, // Low confidence
            },
          ],
        },
      };

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType, {
        skipLowConfidenceEntities: true,
        confidenceThreshold: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.extractedData.invoiceNumber).toBe('INV-001');
      expect(result.extractedData.totalAmount).toBeUndefined(); // Should be skipped
    });

    it('should handle missing document in response', async () => {
      const mockDocumentResult = {}; // No document property

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No document returned from Document AI processing');
    });

    it('should parse various amount formats correctly', async () => {
      const mockDocumentResult = {
        document: {
          entities: [
            {
              type: 'total_amount',
              mentionText: '$1,234.56',
              confidence: 0.9,
            },
          ],
        },
      };

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType);

      expect(result.success).toBe(true);
      expect(result.extractedData.totalAmount).toBe(1234.56);
    });

    it('should parse date formats correctly', async () => {
      const mockDocumentResult = {
        document: {
          entities: [
            {
              type: 'due_date',
              mentionText: '01/15/2024',
              confidence: 0.9,
            },
          ],
        },
      };

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType);

      expect(result.success).toBe(true);
      expect(result.extractedData.dueDate).toBeDefined();
    });

    it('should include confidence scores in extracted data', async () => {
      const mockDocumentResult = {
        document: {
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.95,
            },
          ],
        },
      };

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType);

      expect(result.success).toBe(true);
      expect(result.extractedData._confidences).toBeDefined();
      expect(result.extractedData._confidences.invoiceNumber).toBe(0.95);
    });

    it('should warn about low overall confidence', async () => {
      const mockDocumentResult = {
        document: {
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.2, // Low confidence
            },
          ],
        },
      };

      mockClient.processDocument.mockResolvedValue([mockDocumentResult]);

      const result = await service.processDocument(mockFileBuffer, mockMimeType, {
        confidenceThreshold: 0.5,
      });

      expect(result.success).toBe(true);
      expect(loggerService.warn).toHaveBeenCalledWith(
        'Document processing confidence below threshold',
        'DocumentAIService',
        expect.objectContaining({
          confidence: 0.2,
          threshold: 0.5,
        })
      );
    });
  });

  describe('metrics', () => {
    it('should track processing metrics', async () => {
      const mockDocumentResult = {
        document: {
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.95,
            },
          ],
        },
      };

      // Add a small delay to simulate processing time
      mockClient.processDocument.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([mockDocumentResult]), 10))
      );

      await service.processDocument(Buffer.from('test'), 'application/pdf');
      await service.processDocument(Buffer.from('test'), 'application/pdf');

      const metrics = service.getMetrics();

      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
    });

    it('should track failed requests', async () => {
      const error = new Error('Processing failed');
      mockClient.processDocument.mockRejectedValue(error);

      await service.processDocument(Buffer.from('test'), 'application/pdf', {
        maxRetries: 0,
      });

      const metrics = service.getMetrics();

      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
    });

    it('should reset metrics', () => {
      service.resetMetrics();
      const metrics = service.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageProcessingTime).toBe(0);
      expect(metrics.retryCount).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when service is accessible', async () => {
      // Health check will fail with test data but that's expected
      const error = new Error('Invalid document format') as any;
      error.code = 'INVALID_ARGUMENT';
      mockClient.processDocument.mockRejectedValue(error);

      const health = await service.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details.processorName).toContain('test-project');
    });

    it('should return unhealthy status on connectivity issues', async () => {
      const error = new Error('Connection failed') as any;
      error.code = 'UNAVAILABLE';
      mockClient.processDocument.mockRejectedValue(error);

      const health = await service.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details.error).toContain('Connection failed');
    });
  });
});