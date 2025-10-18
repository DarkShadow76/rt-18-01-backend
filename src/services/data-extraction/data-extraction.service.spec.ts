import { Test, TestingModule } from '@nestjs/testing';
import { DataExtractionService } from './data-extraction.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError } from '../../common/errors/app-error';

describe('DataExtractionService', () => {
  let service: DataExtractionService;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockLoggerService = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExtractionService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<DataExtractionService>(DataExtractionService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractAndValidateData', () => {
    it('should extract and validate data from Document AI entities successfully', async () => {
      const mockDocumentAIData = {
        entities: [
          {
            type: 'invoice_number',
            mentionText: 'INV-001',
            confidence: 0.95,
          },
          {
            type: 'total_amount',
            mentionText: '$1,234.56',
            confidence: 0.90,
          },
          {
            type: 'due_date',
            mentionText: '2024-01-15',
            confidence: 0.85,
          },
          {
            type: 'supplier_name',
            mentionText: 'ACME Corp',
            confidence: 0.88,
          },
        ],
      };

      const result = await service.extractAndValidateData(mockDocumentAIData);

      expect(result.success).toBe(true);
      expect(result.extractedData?.invoiceNumber).toBe('INV-001');
      expect(result.extractedData?.totalAmount).toBe(1234.56);
      expect(result.extractedData?.dueDate).toBe('2024-01-15');
      expect(result.extractedData?.supplierName).toBe('ACME Corp');
      expect(result.validationErrors).toHaveLength(0);
      expect(result.qualityScore).toBeGreaterThan(70);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.metadata.extractionMethod).toBe('entity');
      expect(result.metadata.fieldsExtracted).toBe(4);
    });

    it('should handle fallback text extraction when no entities are present', async () => {
      const mockTextData = {
        text: 'Invoice #INV-123 Total: $500.00 Due: 01/15/2024 From: Test Company',
        entities: [],
      };

      const result = await service.extractAndValidateData(mockTextData);

      expect(result.success).toBe(true);
      expect(result.extractedData?.invoiceNumber).toBe('INV-123');
      expect(result.extractedData?.totalAmount).toBe(500);
      expect(result.extractedData?._fallbackExtraction).toBe(true);
      expect(result.metadata.extractionMethod).toBe('fallback');
      expect(result.qualityScore).toBeLessThan(70); // Lower score for fallback
    });

    it('should extract data from plain text input', async () => {
      const textInput = 'Invoice: INV-456 Amount: $750.25 Due Date: 02/20/2024';

      const result = await service.extractAndValidateData(textInput);

      expect(result.success).toBe(true);
      expect(result.extractedData?.invoiceNumber).toBe('INV-456');
      expect(result.extractedData?.totalAmount).toBe(750.25);
      expect(result.extractedData?._fallbackExtraction).toBe(true);
    });

    it('should validate required fields and return errors for missing data', async () => {
      const incompleteData = {
        entities: [
          {
            type: 'supplier_name',
            mentionText: 'Test Supplier',
            confidence: 0.9,
          },
        ],
      };

      const result = await service.extractAndValidateData(incompleteData, {
        requireInvoiceNumber: true,
        requireTotalAmount: true,
        requireDueDate: true,
        strictValidation: true,
      });

      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain("Required field 'invoiceNumber' is missing");
      expect(result.validationErrors).toContain("Required field 'totalAmount' is missing");
      expect(result.validationErrors).toContain("Required field 'dueDate' is missing");
      expect(result.metadata.requiredFieldsMissing).toContain('invoiceNumber');
      expect(result.metadata.requiredFieldsMissing).toContain('totalAmount');
      expect(result.metadata.requiredFieldsMissing).toContain('dueDate');
    });

    it('should validate field formats and return validation errors', async () => {
      const invalidData = {
        entities: [
          {
            type: 'invoice_number',
            mentionText: '', // Empty invoice number
            confidence: 0.9,
          },
          {
            type: 'total_amount',
            mentionText: '-100', // Negative amount
            confidence: 0.8,
          },
          {
            type: 'due_date',
            mentionText: 'invalid-date',
            confidence: 0.7,
          },
        ],
      };

      const result = await service.extractAndValidateData(invalidData);

      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.validationErrors.some(error => error.includes('invoiceNumber'))).toBe(true);
      expect(result.validationErrors.some(error => error.includes('totalAmount'))).toBe(true);
      expect(result.validationErrors.some(error => error.includes('dueDate'))).toBe(true);
    });

    it('should warn about low confidence scores', async () => {
      const lowConfidenceData = {
        entities: [
          {
            type: 'invoice_number',
            mentionText: 'INV-001',
            confidence: 0.3, // Low confidence
          },
          {
            type: 'total_amount',
            mentionText: '$100.00',
            confidence: 0.2, // Very low confidence
          },
          {
            type: 'due_date',
            mentionText: '2024-01-15',
            confidence: 0.4, // Low confidence
          },
        ],
      };

      const result = await service.extractAndValidateData(lowConfidenceData, {
        minimumConfidence: 0.5,
      });

      expect(result.validationWarnings.length).toBeGreaterThan(0);
      expect(result.validationWarnings.some(warning => warning.includes('Low confidence'))).toBe(true);
      expect(result.metadata.dataQualityIssues.some(issue => issue.includes('Low confidence'))).toBe(true);
    });

    it('should validate business logic rules', async () => {
      const logicallyInconsistentData = {
        entities: [
          {
            type: 'invoice_number',
            mentionText: 'INV-001',
            confidence: 0.9,
          },
          {
            type: 'invoice_date',
            mentionText: '2024-02-01',
            confidence: 0.9,
          },
          {
            type: 'due_date',
            mentionText: '2024-01-15', // Due date before invoice date
            confidence: 0.9,
          },
          {
            type: 'total_amount',
            mentionText: '$100.00',
            confidence: 0.9,
          },
          {
            type: 'tax_amount',
            mentionText: '$150.00', // Tax amount greater than total
            confidence: 0.9,
          },
        ],
      };

      const result = await service.extractAndValidateData(logicallyInconsistentData);

      expect(result.validationWarnings).toContain('Due date is before invoice date');
      expect(result.validationWarnings).toContain('Tax amount exceeds total amount');
      expect(result.metadata.dataQualityIssues).toContain('Date logic issue');
      expect(result.metadata.dataQualityIssues).toContain('Amount logic issue');
    });

    it('should handle different currency formats in amounts', async () => {
      const currencyData = {
        entities: [
          {
            type: 'invoice_number',
            mentionText: 'INV-001',
            confidence: 0.9,
          },
          {
            type: 'total_amount',
            mentionText: '€1.234,56', // European format
            confidence: 0.9,
          },
          {
            type: 'due_date',
            mentionText: '2024-01-15',
            confidence: 0.9,
          },
        ],
      };

      const result = await service.extractAndValidateData(currencyData);

      expect(result.success).toBe(true);
      expect(result.extractedData?.totalAmount).toBe(1234.56);
    });

    it('should calculate quality score based on completeness and accuracy', async () => {
      const completeHighQualityData = {
        entities: [
          {
            type: 'invoice_number',
            mentionText: 'INV-001',
            confidence: 0.95,
          },
          {
            type: 'total_amount',
            mentionText: '$1,000.00',
            confidence: 0.92,
          },
          {
            type: 'due_date',
            mentionText: '2024-01-15',
            confidence: 0.90,
          },
          {
            type: 'invoice_date',
            mentionText: '2024-01-01',
            confidence: 0.88,
          },
          {
            type: 'supplier_name',
            mentionText: 'ACME Corp',
            confidence: 0.85,
          },
          {
            type: 'bill_to',
            mentionText: 'Customer Inc',
            confidence: 0.87,
          },
          {
            type: 'currency',
            mentionText: 'USD',
            confidence: 0.95,
          },
        ],
      };

      const result = await service.extractAndValidateData(completeHighQualityData);

      expect(result.qualityScore).toBeGreaterThan(85);
      expect(result.confidence).toBeGreaterThan(0.85);
    });

    it('should handle empty or null input gracefully', async () => {
      const result = await service.extractAndValidateData(null);

      expect(result.success).toBe(false);
      expect(result.extractedData).toEqual({});
      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.qualityScore).toBe(0);
    });

    it('should work with non-strict validation mode', async () => {
      const incompleteData = {
        entities: [
          {
            type: 'supplier_name',
            mentionText: 'Test Supplier',
            confidence: 0.9,
          },
        ],
      };

      const result = await service.extractAndValidateData(incompleteData, {
        strictValidation: false,
      });

      expect(result.success).toBe(true); // Should succeed in non-strict mode
      expect(result.validationErrors.length).toBeGreaterThan(0); // But still have errors
    });

    it('should handle already extracted invoice data', async () => {
      const alreadyExtractedData = {
        invoiceNumber: 'INV-123',
        totalAmount: 500,
        dueDate: '2024-01-15',
        supplierName: 'Test Corp',
      };

      const result = await service.extractAndValidateData(alreadyExtractedData);

      expect(result.success).toBe(true);
      expect(result.extractedData?.invoiceNumber).toBe('INV-123');
      expect(result.extractedData?.totalAmount).toBe(500);
      expect(result.metadata.extractionMethod).toBe('entity');
    });

    it('should handle extraction errors gracefully', async () => {
      // Mock an error in the extraction process
      const invalidInput = { 
        get entities() { 
          throw new Error('Simulated extraction error'); 
        } 
      };

      await expect(service.extractAndValidateData(invalidInput)).rejects.toThrow(AppError);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('field validation', () => {
    it('should validate invoice numbers correctly', async () => {
      const testCases = [
        { value: 'INV-001', shouldBeValid: true },
        { value: 'BILL123', shouldBeValid: true },
        { value: 'INV_2024_001', shouldBeValid: true },
        { value: '', shouldBeValid: false },
        { value: 'INV-001-WITH-VERY-LONG-NAME-THAT-EXCEEDS-FIFTY-CHARS', shouldBeValid: false },
        { value: 'INV@001', shouldBeValid: false },
      ];

      for (const testCase of testCases) {
        const data = {
          entities: [
            {
              type: 'invoice_number',
              mentionText: testCase.value,
              confidence: 0.9,
            },
          ],
        };

        const result = await service.extractAndValidateData(data, {
          requireInvoiceNumber: true,
          requireTotalAmount: false,
          requireDueDate: false,
        });

        if (testCase.shouldBeValid) {
          expect(result.validationErrors.filter(e => e.includes('invoiceNumber'))).toHaveLength(0);
        } else {
          expect(result.validationErrors.filter(e => e.includes('invoiceNumber'))).toHaveLength(1);
        }
      }
    });

    it('should validate amounts correctly', async () => {
      const testCases = [
        { value: '$100.00', shouldBeValid: true },
        { value: '0', shouldBeValid: true },
        { value: '999999', shouldBeValid: true },
        { value: '-100', shouldBeValid: false },
        { value: '1000001', shouldBeValid: false },
      ];

      for (const testCase of testCases) {
        const data = {
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.9,
            },
            {
              type: 'total_amount',
              mentionText: testCase.value,
              confidence: 0.9,
            },
          ],
        };

        const result = await service.extractAndValidateData(data, {
          requireInvoiceNumber: false,
          requireTotalAmount: true,
          requireDueDate: false,
        });

        if (testCase.shouldBeValid) {
          expect(result.validationErrors.filter(e => e.includes('totalAmount'))).toHaveLength(0);
        } else {
          expect(result.validationErrors.filter(e => e.includes('totalAmount'))).toHaveLength(1);
        }
      }
    });

    it('should validate dates correctly', async () => {
      const testCases = [
        { value: '2024-01-15', shouldBeValid: true },
        { value: '01/15/2024', shouldBeValid: true },
        { value: '2024-12-31', shouldBeValid: true },
        { value: 'invalid-date', shouldBeValid: false },
        { value: '1900-01-01', shouldBeValid: false }, // Too old
        { value: '2050-01-01', shouldBeValid: false }, // Too far in future
      ];

      for (const testCase of testCases) {
        const data = {
          entities: [
            {
              type: 'invoice_number',
              mentionText: 'INV-001',
              confidence: 0.9,
            },
            {
              type: 'due_date',
              mentionText: testCase.value,
              confidence: 0.9,
            },
          ],
        };

        const result = await service.extractAndValidateData(data, {
          requireInvoiceNumber: false,
          requireTotalAmount: false,
          requireDueDate: true,
        });

        if (testCase.shouldBeValid) {
          expect(result.validationErrors.filter(e => e.includes('dueDate'))).toHaveLength(0);
        } else {
          expect(result.validationErrors.filter(e => e.includes('dueDate'))).toHaveLength(1);
        }
      }
    });
  });
});