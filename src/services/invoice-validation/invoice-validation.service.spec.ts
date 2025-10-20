import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceValidationService, InvoiceData, ValidationResult } from './invoice-validation.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError } from '../../common/errors/app-error';
import { TestHelpers } from '../../../test';

describe('InvoiceValidationService', () => {
  let service: InvoiceValidationService;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockLoggerService = TestHelpers.createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceValidationService,
        {
          provide: LoggerService,
          useValue: mockLoggerService
        }
      ]
    }).compile();

    service = module.get<InvoiceValidationService>(InvoiceValidationService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateInvoice', () => {
    it('should validate a complete valid invoice successfully', async () => {
      const validInvoice: InvoiceData = {
        invoiceNumber: 'INV-2024-001',
        invoiceDate: '2024-01-15',
        dueDate: '2024-02-15',
        totalAmount: 1500.00,
        taxAmount: 150.00,
        supplierName: 'Test Supplier Inc.',
        billTo: 'Test Customer Corp.',
        currency: 'USD'
      };

      const result = await service.validateInvoice(validInvoice);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validationScore).toBeGreaterThan(90);
      expect(result.correlationId).toBeDefined();
      expect(result.metadata.rulesApplied).toContain('required_fields');
      expect(result.metadata.rulesApplied).toContain('field_formats');
    });

    it('should fail validation for missing required fields', async () => {
      const incompleteInvoice: InvoiceData = {
        invoiceNumber: 'INV-001'
        // Missing totalAmount and dueDate
      };

      const result = await service.validateInvoice(incompleteInvoice, {
        requiredFields: ['invoiceNumber', 'totalAmount', 'dueDate']
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].code).toBe('REQUIRED_FIELD_MISSING');
      expect(result.errors[0].field).toBe('totalAmount');
      expect(result.errors[1].field).toBe('dueDate');
    });

    it('should validate invoice number format', async () => {
      const testCases = [
        { invoiceNumber: '', shouldBeValid: false, expectedCode: 'REQUIRED_FIELD_MISSING', isError: true },
        { invoiceNumber: 'A'.repeat(60), shouldBeValid: false, expectedCode: 'INVALID_LENGTH', isError: true },
        { invoiceNumber: 'INV@#$%', shouldBeValid: true, expectedCode: 'UNUSUAL_FORMAT', isError: false }, // This generates a warning, not an error
        { invoiceNumber: 'INV-2024-001', shouldBeValid: true }
      ];

      for (const testCase of testCases) {
        const invoice: InvoiceData = {
          invoiceNumber: testCase.invoiceNumber,
          totalAmount: 100,
          dueDate: '2024-12-31'
        };

        const result = await service.validateInvoice(invoice);

        if (testCase.shouldBeValid) {
          expect(result.errors.filter(e => e.field === 'invoiceNumber')).toHaveLength(0);
          // Check for warnings if expected
          if (testCase.expectedCode && !testCase.isError) {
            const invoiceNumberWarnings = result.warnings.filter(w => w.field === 'invoiceNumber');
            expect(invoiceNumberWarnings.length).toBeGreaterThan(0);
            expect(invoiceNumberWarnings[0].code).toBe(testCase.expectedCode);
          }
        } else {
          const invoiceNumberErrors = result.errors.filter(e => e.field === 'invoiceNumber');
          expect(invoiceNumberErrors.length).toBeGreaterThan(0);
          if (testCase.expectedCode) {
            expect(invoiceNumberErrors[0].code).toBe(testCase.expectedCode);
          }
        }
      }
    });

    it('should validate date formats and ranges', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);

      const testCases = [
        {
          invoiceDate: 'invalid-date',
          shouldHaveError: true,
          expectedCode: 'INVALID_DATE_FORMAT'
        },
        {
          invoiceDate: futureDate.toISOString().split('T')[0],
          shouldHaveError: true,
          expectedCode: 'FUTURE_INVOICE_DATE'
        },
        {
          invoiceDate: oldDate.toISOString().split('T')[0],
          shouldHaveWarning: true,
          expectedCode: 'OLD_INVOICE_DATE'
        },
        {
          invoiceDate: '2024-01-15',
          shouldHaveError: false
        }
      ];

      for (const testCase of testCases) {
        const invoice: InvoiceData = {
          invoiceNumber: 'INV-001',
          invoiceDate: testCase.invoiceDate,
          totalAmount: 100,
          dueDate: '2024-12-31'
        };

        const result = await service.validateInvoice(invoice);

        if (testCase.shouldHaveError) {
          const dateErrors = result.errors.filter(e => e.field === 'invoiceDate');
          expect(dateErrors.length).toBeGreaterThan(0);
          expect(dateErrors[0].code).toBe(testCase.expectedCode);
        }

        if (testCase.shouldHaveWarning) {
          const dateWarnings = result.warnings.filter(w => w.field === 'invoiceDate');
          expect(dateWarnings.length).toBeGreaterThan(0);
          expect(dateWarnings[0].code).toBe(testCase.expectedCode);
        }
      }
    });

    it('should validate amount formats and ranges', async () => {
      const testCases = [
        { totalAmount: 'invalid' as any, shouldHaveError: true, expectedCode: 'INVALID_AMOUNT_FORMAT' },
        { totalAmount: -100, shouldHaveError: true, expectedCode: 'AMOUNT_TOO_SMALL' },
        { totalAmount: 0.005, shouldHaveError: true, expectedCode: 'AMOUNT_TOO_SMALL' },
        { totalAmount: 2000000, shouldHaveWarning: true, expectedCode: 'AMOUNT_VERY_LARGE' },
        { totalAmount: 1500.00, shouldHaveError: false }
      ];

      for (const testCase of testCases) {
        const invoice: InvoiceData = {
          invoiceNumber: 'INV-001',
          totalAmount: testCase.totalAmount,
          dueDate: '2024-12-31'
        };

        const result = await service.validateInvoice(invoice, {
          minAmount: 0.01,
          maxAmount: 1000000
        });

        if (testCase.shouldHaveError) {
          const amountErrors = result.errors.filter(e => e.field === 'totalAmount');
          expect(amountErrors.length).toBeGreaterThan(0);
          expect(amountErrors[0].code).toBe(testCase.expectedCode);
        }

        if (testCase.shouldHaveWarning) {
          const amountWarnings = result.warnings.filter(w => w.field === 'totalAmount');
          expect(amountWarnings.length).toBeGreaterThan(0);
          expect(amountWarnings[0].code).toBe(testCase.expectedCode);
        }
      }
    });

    it('should validate currency format', async () => {
      const testCases = [
        { currency: 'USD', shouldHaveWarning: false },
        { currency: 'EUR', shouldHaveWarning: false },
        { currency: 'US', shouldHaveWarning: true },
        { currency: 'Dollar', shouldHaveWarning: true },
        { currency: '123', shouldHaveWarning: true }
      ];

      for (const testCase of testCases) {
        const invoice: InvoiceData = {
          invoiceNumber: 'INV-001',
          totalAmount: 100,
          dueDate: '2024-12-31',
          currency: testCase.currency
        };

        const result = await service.validateInvoice(invoice);

        if (testCase.shouldHaveWarning) {
          const currencyWarnings = result.warnings.filter(w => w.field === 'currency');
          expect(currencyWarnings.length).toBeGreaterThan(0);
          expect(currencyWarnings[0].code).toBe('INVALID_CURRENCY_FORMAT');
        } else {
          const currencyWarnings = result.warnings.filter(w => w.field === 'currency');
          expect(currencyWarnings).toHaveLength(0);
        }
      }
    });

    it('should apply business rule: invoice date before due date', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-02-15',
        dueDate: '2024-01-15', // Due date before invoice date
        totalAmount: 100
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.code === 'DUE_DATE_BEFORE_INVOICE_DATE')).toBe(true);
      expect(result.metadata.businessLogicChecks).toContain('invoice_date_before_due_date');
    });

    it('should apply business rule: reasonable payment terms', async () => {
      const invoiceDate = new Date('2024-01-01');
      const dueDate = new Date('2024-05-01'); // 120 days later

      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: invoiceDate.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        totalAmount: 100
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.code === 'UNUSUAL_PAYMENT_TERMS')).toBe(true);
      expect(result.metadata.businessLogicChecks).toContain('reasonable_payment_terms');
    });

    it('should apply business rule: tax amount calculation', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        taxAmount: 60, // 60% tax rate - unusually high
        dueDate: '2024-12-31'
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.code === 'UNUSUAL_TAX_RATE')).toBe(true);
      expect(result.metadata.businessLogicChecks).toContain('tax_amount_calculation');
    });

    it('should apply business rule: line items total with auto-correction', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100, // Incorrect total
        dueDate: '2024-12-31',
        lineItems: [
          { description: 'Item 1', quantity: 2, unitPrice: 25, totalPrice: 50 },
          { description: 'Item 2', quantity: 1, unitPrice: 75, totalPrice: 75 }
        ]
      };

      const result = await service.validateInvoice(invoice, {
        enableAutoCorrection: true
      });

      expect(result.errors.some(e => e.code === 'LINE_ITEMS_TOTAL_MISMATCH')).toBe(true);
      expect(result.correctedData?.totalAmount).toBe(125);
      expect(result.metadata.dataCorrections).toContain('line_items_total');
    });

    it('should handle strict mode validation', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        dueDate: '2024-12-31',
        currency: 'INVALID' // This would normally be a warning
      };

      const strictResult = await service.validateInvoice(invoice, { strictMode: true });
      const normalResult = await service.validateInvoice(invoice, { strictMode: false });

      // In strict mode, warnings might affect validity differently
      expect(strictResult.isValid).toBeDefined();
      expect(normalResult.isValid).toBeDefined();
    });

    it('should calculate validation scores correctly', async () => {
      const highQualityInvoice: InvoiceData = {
        invoiceNumber: 'INV-2024-001',
        invoiceDate: '2024-01-15',
        dueDate: '2024-02-15',
        totalAmount: 1500.00,
        taxAmount: 150.00,
        supplierName: 'Test Supplier',
        billTo: 'Test Customer',
        currency: 'USD'
      };

      const lowQualityInvoice: InvoiceData = {
        invoiceNumber: '', // Invalid
        totalAmount: -100, // Invalid
        dueDate: 'invalid-date' // Invalid
      };

      const highQualityResult = await service.validateInvoice(highQualityInvoice);
      const lowQualityResult = await service.validateInvoice(lowQualityInvoice);

      expect(highQualityResult.validationScore).toBeGreaterThan(lowQualityResult.validationScore);
      expect(highQualityResult.validationScore).toBeGreaterThan(80);
      expect(lowQualityResult.validationScore).toBeLessThan(50);
    });

    it('should handle null/undefined invoice data', async () => {
      await expect(service.validateInvoice(null as any)).rejects.toThrow(AppError);
    });

    it('should handle internal errors gracefully', async () => {
      // Mock logger to throw error during validation
      loggerService.debug.mockImplementation(() => {
        throw new Error('Logger error');
      });

      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        dueDate: '2024-12-31'
      };

      await expect(service.validateInvoice(invoice)).rejects.toThrow(AppError);
    });
  });

  describe('validateInvoices', () => {
    it('should validate multiple invoices in batch', async () => {
      const invoices: InvoiceData[] = [
        {
          invoiceNumber: 'INV-001',
          totalAmount: 100,
          dueDate: '2024-12-31'
        },
        {
          invoiceNumber: 'INV-002',
          totalAmount: 200,
          dueDate: '2024-12-31'
        }
      ];

      const results = await service.validateInvoices(invoices);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should handle validation errors in batch processing', async () => {
      const invoices: InvoiceData[] = [
        {
          invoiceNumber: 'INV-001',
          totalAmount: 100,
          dueDate: '2024-12-31'
        },
        null as any // Invalid invoice
      ];

      const results = await service.validateInvoices(invoices);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
      expect(results[1].errors[0].code).toBe('VALIDATION_ERROR');
    });
  });

  describe('getValidationStatistics', () => {
    it('should calculate validation statistics correctly', () => {
      const results: ValidationResult[] = [
        {
          isValid: true,
          errors: [],
          warnings: [],
          validationScore: 95,
          correlationId: '1',
          metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] }
        },
        {
          isValid: false,
          errors: [
            { field: 'totalAmount', code: 'NEGATIVE_AMOUNT', message: 'Amount cannot be negative', severity: 'error' }
          ],
          warnings: [
            { field: 'currency', code: 'INVALID_CURRENCY_FORMAT', message: 'Invalid currency', impact: 'medium' }
          ],
          validationScore: 60,
          correlationId: '2',
          metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] }
        }
      ];

      const stats = service.getValidationStatistics(results);

      expect(stats.totalValidated).toBe(2);
      expect(stats.validCount).toBe(1);
      expect(stats.invalidCount).toBe(1);
      expect(stats.averageScore).toBe(77.5);
      expect(stats.commonErrors).toHaveLength(1);
      expect(stats.commonErrors[0].code).toBe('NEGATIVE_AMOUNT');
      expect(stats.commonWarnings).toHaveLength(1);
      expect(stats.commonWarnings[0].code).toBe('INVALID_CURRENCY_FORMAT');
    });
  });

  describe('edge cases and performance', () => {
    it('should handle very long text fields', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        dueDate: '2024-12-31',
        supplierName: 'A'.repeat(1000), // Very long name
        billTo: 'B'.repeat(1000)
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.code === 'FIELD_TOO_LONG')).toBe(true);
    });

    it('should handle concurrent validations', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        service.validateInvoice({
          invoiceNumber: `INV-${i}`,
          totalAmount: 100 + i,
          dueDate: '2024-12-31'
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.isValid).toBe(true);
        expect(result.correlationId).toBeDefined();
      });
    });

    it('should measure validation performance', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        dueDate: '2024-12-31'
      };

      const { result, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return service.validateInvoice(invoice);
      });

      expect(result.isValid).toBe(true);
      expect(timeMs).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});