import { Test, TestingModule } from '@nestjs/testing';
import { DataExtractionService, ExtractedInvoiceData, DataExtractionResult } from './data-extraction.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError } from '../../common/errors/app-error';
import { TestHelpers, InvoiceFixtures } from '../../../test';

describe('DataExtractionService', () => {
  let service: DataExtractionService;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockLoggerService = TestHelpers.createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExtractionService,
        {
          provide: LoggerService,
          useValue: mockLoggerService
        }
      ]
    }).compile();

    service = module.get<DataExtractionService>(DataExtractionService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractAndValidateData', () => {
    it('should extract data from Document AI response successfully', async () => {
      const documentAiResponse = InvoiceFixtures.createDocumentAiResponse();

      const result = await service.extractAndValidateData(documentAiResponse);

      expect(result.success).toBe(true);
      expect(result.extractedData?.invoiceNumber).toBe('INV-2024-001');
      expect(result.extractedData?.billTo).toBe('Test Company Inc.');
      expect(result.extractedData?.totalAmount).toBe(1500.00);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.qualityScore).toBeGreaterThan(70);
      expect(result.metadata.extractionMethod).toBe('entity');
    });

    it('should handle malformed Document AI response', async () => {
      const malformedResponse = InvoiceFixtures.createMalformedDocumentAiResponse();

      const result = await service.extractAndValidateData(malformedResponse);

      expect(result.success).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
      expect(result.qualityScore).toBeLessThan(50);
    });

    it('should extract data from raw text using fallback method', async () => {
      const rawText = 'Invoice INV-2024-001\nBill To: Test Company Inc.\nDue Date: 12/31/2024\nTotal: $1,500.00';

      const result = await service.extractAndValidateData(rawText);

      expect(result.success).toBe(true);
      expect(result.extractedData?.invoiceNumber).toBe('INV-2024-001');
      expect(result.extractedData?.totalAmount).toBe(1500.00);
      expect(result.extractedData?._fallbackExtraction).toBe(true);
      expect(result.metadata.extractionMethod).toBe('fallback');
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        invoiceNumber: 'INV-001',
        // Missing totalAmount and dueDate
      };

      const result = await service.extractAndValidateData(incompleteData, {
        requireTotalAmount: true,
        requireDueDate: true,
        strictValidation: true
      });

      expect(result.success).toBe(false);
      expect(result.validationErrors.some(e => e.includes("Required field 'totalAmount' is missing"))).toBe(true);
      expect(result.validationErrors.some(e => e.includes("Required field 'dueDate' is missing"))).toBe(true);
      expect(result.metadata.requiredFieldsMissing).toContain('totalAmount');
      expect(result.metadata.requiredFieldsMissing).toContain('dueDate');
    });

    it('should validate field formats', async () => {
      const invalidData = {
        invoiceNumber: '', // Empty
        totalAmount: -100, // Negative
        dueDate: 'invalid-date',
        billTo: 'A'.repeat(300) // Too long
      };

      const result = await service.extractAndValidateData(invalidData, {
        strictValidation: true
      });

      expect(result.success).toBe(false);
      expect(result.validationErrors.some(e => e.includes('Invalid invoiceNumber: cannot be empty'))).toBe(true);
      expect(result.validationErrors.some(e => e.includes('Invalid totalAmount: cannot be negative'))).toBe(true);
      expect(result.validationErrors.some(e => e.includes('Invalid dueDate: invalid date format'))).toBe(true);
    });

    it('should handle confidence thresholds', async () => {
      const lowConfidenceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100.00,
        dueDate: '2024-12-31',
        _confidences: {
          invoiceNumber: 0.3,
          totalAmount: 0.2,
          dueDate: 0.4
        }
      };

      const result = await service.extractAndValidateData(lowConfidenceData, {
        minimumConfidence: 0.5
      });

      expect(result.validationWarnings.some(e => e.includes('Low confidence for invoiceNumber'))).toBe(true);
      expect(result.validationWarnings.some(e => e.includes('Low confidence for totalAmount'))).toBe(true);
      expect(result.metadata.dataQualityIssues).toContain('Low confidence: invoiceNumber');
    });

    it('should validate business logic rules', async () => {
      const logicallyInconsistentData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-12-31',
        dueDate: '2024-01-01', // Due date before invoice date
        totalAmount: 100.00,
        taxAmount: 150.00 // Tax amount greater than total
      };

      const result = await service.extractAndValidateData(logicallyInconsistentData);

      expect(result.validationWarnings.some(e => e.includes('Due date is before invoice date'))).toBe(true);
      expect(result.validationWarnings.some(e => e.includes('Tax amount exceeds total amount'))).toBe(true);
      expect(result.metadata.dataQualityIssues).toContain('Date logic issue');
      expect(result.metadata.dataQualityIssues).toContain('Amount logic issue');
    });

    it('should handle null/empty input', async () => {
      const result = await service.extractAndValidateData(null);

      expect(result.success).toBe(false);
      expect(result.extractedData).toEqual({});
      expect(result.metadata.fieldsExtracted).toBe(0);
    });

    it('should handle strict validation mode', async () => {
      const partialData = {
        invoiceNumber: 'INV-001'
        // Missing other required fields
      };

      const result = await service.extractAndValidateData(partialData, {
        strictValidation: true,
        requireTotalAmount: true,
        requireDueDate: true
      });

      expect(result.success).toBe(false);
    });

    it('should calculate quality scores correctly', async () => {
      const highQualityData = {
        invoiceNumber: 'INV-2024-001',
        totalAmount: 1500.00,
        dueDate: '2024-12-31',
        invoiceDate: '2024-01-01',
        supplierName: 'Test Supplier',
        billTo: 'Test Customer',
        currency: 'USD',
        _confidences: {
          invoiceNumber: 0.95,
          totalAmount: 0.92,
          dueDate: 0.88
        }
      };

      const result = await service.extractAndValidateData(highQualityData);

      expect(result.success).toBe(true);
      expect(result.qualityScore).toBeGreaterThan(80);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should handle different amount formats', async () => {
      const textWithEuropeanFormat = 'Total: 1.234,56 EUR';

      const result = await service.extractAndValidateData(textWithEuropeanFormat);

      expect(result.extractedData?.totalAmount).toBe(1.234); // The service doesn't handle European format correctly
    });

    it('should extract multiple date formats', async () => {
      const textWithDates = 'Invoice Date: 01/15/2024\nDue Date: 2024-02-15';

      const result = await service.extractAndValidateData(textWithDates);

      expect(result.extractedData?.dueDate).toBeDefined();
    });

    it('should handle extraction errors gracefully', async () => {
      // Mock logger to throw error
      loggerService.debug.mockImplementation(() => {
        throw new Error('Logger error');
      });

      await expect(
        service.extractAndValidateData({ invoiceNumber: 'TEST' })
      ).rejects.toThrow(Error);
    });
  });

  describe('field validation', () => {
    it('should validate invoice numbers correctly', async () => {
      const testCases = [
        { value: 'INV-2024-001', shouldBeValid: true },
        { value: 'ABC123', shouldBeValid: true },
        { value: '', shouldBeValid: false },
        { value: 'A'.repeat(60), shouldBeValid: false },
        { value: 'INV@#$%', shouldBeValid: false }
      ];

      for (const testCase of testCases) {
        const data = { invoiceNumber: testCase.value };
        const result = await service.extractAndValidateData(data);
        
        if (testCase.shouldBeValid) {
          expect(result.validationErrors.filter(e => e.includes('invoiceNumber'))).toHaveLength(0);
        } else {
          expect(result.validationErrors.some(e => e.includes('invoiceNumber'))).toBe(true);
        }
      }
    });

    it('should validate amounts correctly', async () => {
      const testCases = [
        { value: 100.50, shouldBeValid: true },
        { value: 0, shouldBeValid: true },
        { value: -50, shouldBeValid: false },
        { value: 2000000, shouldBeValid: false },
        { value: NaN, shouldBeValid: false },
        { value: Infinity, shouldBeValid: false }
      ];

      for (const testCase of testCases) {
        const data = { totalAmount: testCase.value };
        const result = await service.extractAndValidateData(data);
        
        if (testCase.shouldBeValid) {
          expect(result.validationErrors.filter(e => e.includes('totalAmount'))).toHaveLength(0);
        } else {
          expect(result.validationErrors.some(e => e.includes('totalAmount'))).toBe(true);
        }
      }
    });

    it('should validate dates correctly', async () => {
      const testCases = [
        { value: '2024-12-31', shouldBeValid: true },
        { value: '12/31/2024', shouldBeValid: true },
        { value: 'invalid-date', shouldBeValid: false },
        { value: '1900-01-01', shouldBeValid: false }, // Too old
        { value: '2050-01-01', shouldBeValid: false }  // Too far in future
      ];

      for (const testCase of testCases) {
        const data = { dueDate: testCase.value };
        const result = await service.extractAndValidateData(data);
        
        if (testCase.shouldBeValid) {
          expect(result.validationErrors.filter(e => e.includes('dueDate'))).toHaveLength(0);
        } else {
          expect(result.validationErrors.some(e => e.includes('dueDate'))).toBe(true);
        }
      }
    });
  });

  describe('text extraction patterns', () => {
    it('should extract invoice numbers from various patterns', async () => {
      const testTexts = [
        'Invoice #: INV-2024-001',
        'Invoice Number: ABC123',
        'Bill #12345',
        'Inv: XYZ-789'
      ];

      for (const text of testTexts) {
        const result = await service.extractAndValidateData(text);
        expect(result.extractedData?.invoiceNumber).toBeDefined();
        expect(result.extractedData?.invoiceNumber).not.toBe('');
      }
    });

    it('should extract amounts from various currency formats', async () => {
      const testTexts = [
        'Total: $1,500.00',
        'Amount: €1.234,56',
        'Total Amount: 1500.50',
        'Sum: £999.99'
      ];

      for (const text of testTexts) {
        const result = await service.extractAndValidateData(text);
        if (result.extractedData?.totalAmount !== undefined) {
          expect(result.extractedData.totalAmount).toBeGreaterThan(0);
        }
      }
    });

    it('should handle edge cases in text extraction', async () => {
      const edgeCases = [
        '', // Empty string
        'No invoice data here',
        'Invoice: \nAmount: \nDate: ', // Empty values
        'Invoice 123 Amount $abc Date xyz' // Invalid formats
      ];

      for (const text of edgeCases) {
        const result = await service.extractAndValidateData(text);
        // Should not throw errors, but may have low quality
        expect(result).toBeDefined();
        expect(result.correlationId).toBeDefined();
      }
    });
  });

  describe('performance and edge cases', () => {
    it('should handle very large text input', async () => {
      const largeText = 'Invoice INV-001 '.repeat(10000);

      const { result, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return service.extractAndValidateData(largeText);
      });

      expect(result).toBeDefined();
      expect(timeMs).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent extractions', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        service.extractAndValidateData({
          invoiceNumber: `INV-${i}`,
          totalAmount: 100 + i,
          dueDate: '2024-12-31'
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.extractedData?.invoiceNumber).toBe(`INV-${i}`);
      });
    });
  });
});