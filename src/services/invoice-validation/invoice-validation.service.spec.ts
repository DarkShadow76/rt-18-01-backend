import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceValidationService, InvoiceData } from './invoice-validation.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError } from '../../common/errors/app-error';

describe('InvoiceValidationService', () => {
  let service: InvoiceValidationService;
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
        InvoiceValidationService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<InvoiceValidationService>(InvoiceValidationService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateInvoice', () => {
    it('should validate a complete and valid invoice successfully', async () => {
      const validInvoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-01',
        dueDate: '2024-01-31',
        totalAmount: 1000.00,
        taxAmount: 100.00,
        supplierName: 'ACME Corp',
        billTo: 'Customer Inc',
        currency: 'USD',
      };

      const result = await service.validateInvoice(validInvoice);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validationScore).toBeGreaterThan(80);
      expect(result.correlationId).toBeDefined();
      expect(result.metadata.rulesApplied).toContain('required_fields');
      expect(result.metadata.rulesApplied).toContain('field_formats');
      expect(result.metadata.rulesApplied).toContain('date_validation');
      expect(result.metadata.rulesApplied).toContain('amount_validation');
    });

    it('should fail validation for missing required fields', async () => {
      const incompleteInvoice: InvoiceData = {
        supplierName: 'ACME Corp',
      };

      const result = await service.validateInvoice(incompleteInvoice, {
        requiredFields: ['invoiceNumber', 'totalAmount', 'dueDate'],
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors.some(e => e.field === 'invoiceNumber' && e.code === 'REQUIRED_FIELD_MISSING')).toBe(true);
      expect(result.errors.some(e => e.field === 'totalAmount' && e.code === 'REQUIRED_FIELD_MISSING')).toBe(true);
      expect(result.errors.some(e => e.field === 'dueDate' && e.code === 'REQUIRED_FIELD_MISSING')).toBe(true);
    });

    it('should validate invoice number format', async () => {
      const testCases = [
        { invoiceNumber: '', shouldHaveError: true, errorCode: 'INVALID_FORMAT' },
        { invoiceNumber: 'A'.repeat(51), shouldHaveError: true, errorCode: 'INVALID_LENGTH' },
        { invoiceNumber: 'INV@001', shouldHaveError: false, warningCode: 'UNUSUAL_FORMAT' },
        { invoiceNumber: 'INV-001', shouldHaveError: false },
      ];

      for (const testCase of testCases) {
        const invoice: InvoiceData = {
          invoiceNumber: testCase.invoiceNumber,
          totalAmount: 100,
          dueDate: '2024-01-31',
        };

        const result = await service.validateInvoice(invoice);

        if (testCase.shouldHaveError) {
          expect(result.errors.some(e => e.field === 'invoiceNumber' && e.code === testCase.errorCode)).toBe(true);
        } else if (testCase.warningCode) {
          expect(result.warnings.some(w => w.field === 'invoiceNumber' && w.code === testCase.warningCode)).toBe(true);
        } else {
          expect(result.errors.filter(e => e.field === 'invoiceNumber')).toHaveLength(0);
        }
      }
    });

    it('should validate date formats and ranges', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: 'invalid-date',
        dueDate: '2024-01-31',
        totalAmount: 100,
      };

      const result = await service.validateInvoice(invoice);

      expect(result.errors.some(e => e.field === 'invoiceDate' && e.code === 'INVALID_DATE_FORMAT')).toBe(true);
    });

    it('should validate future invoice dates', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: futureDate.toISOString().split('T')[0],
        dueDate: '2024-12-31',
        totalAmount: 100,
      };

      const result = await service.validateInvoice(invoice, {
        allowFutureInvoiceDates: false,
      });

      expect(result.errors.some(e => e.field === 'invoiceDate' && e.code === 'FUTURE_INVOICE_DATE')).toBe(true);
    });

    it('should warn about old invoice dates', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);

      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: oldDate.toISOString().split('T')[0],
        dueDate: '2024-12-31',
        totalAmount: 100,
      };

      const result = await service.validateInvoice(invoice, {
        maxInvoiceAge: 365,
      });

      expect(result.warnings.some(w => w.field === 'invoiceDate' && w.code === 'OLD_INVOICE_DATE')).toBe(true);
    });

    it('should validate amount ranges', async () => {
      const testCases = [
        { amount: -100, shouldHaveError: true, errorCode: 'NEGATIVE_AMOUNT' },
        { amount: 0.005, shouldHaveError: true, errorCode: 'AMOUNT_TOO_SMALL' },
        { amount: 2000000, shouldHaveError: false, warningCode: 'AMOUNT_VERY_LARGE' },
        { amount: 100, shouldHaveError: false },
      ];

      for (const testCase of testCases) {
        const invoice: InvoiceData = {
          invoiceNumber: 'INV-001',
          totalAmount: testCase.amount,
          dueDate: '2024-01-31',
        };

        const result = await service.validateInvoice(invoice, {
          minAmount: 0.01,
          maxAmount: 1000000,
        });

        if (testCase.shouldHaveError) {
          expect(result.errors.some(e => e.field === 'totalAmount' && e.code === testCase.errorCode)).toBe(true);
        } else if (testCase.warningCode) {
          expect(result.warnings.some(w => w.field === 'totalAmount' && w.code === testCase.warningCode)).toBe(true);
        } else {
          expect(result.errors.filter(e => e.field === 'totalAmount')).toHaveLength(0);
        }
      }
    });

    it('should validate currency format', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        dueDate: '2024-01-31',
        currency: 'INVALID',
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.field === 'currency' && w.code === 'INVALID_CURRENCY_FORMAT')).toBe(true);
    });

    it('should apply business rule: invoice date before due date', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-02-01',
        dueDate: '2024-01-15', // Due date before invoice date
        totalAmount: 100,
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.field === 'dueDate' && w.code === 'DUE_DATE_BEFORE_INVOICE_DATE')).toBe(true);
    });

    it('should apply business rule: reasonable payment terms', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-01',
        dueDate: '2024-06-01', // 5 months later
        totalAmount: 100,
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.field === 'dueDate' && w.code === 'UNUSUAL_PAYMENT_TERMS')).toBe(true);
    });

    it('should apply business rule: tax amount validation', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        taxAmount: 60, // 60% tax rate - unusually high
        dueDate: '2024-01-31',
      };

      const result = await service.validateInvoice(invoice);

      expect(result.warnings.some(w => w.field === 'taxAmount' && w.code === 'UNUSUAL_TAX_RATE')).toBe(true);
    });

    it('should apply business rule: line items total validation with auto-correction', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        dueDate: '2024-01-31',
        lineItems: [
          { description: 'Item 1', quantity: 2, unitPrice: 25, totalPrice: 50 },
          { description: 'Item 2', quantity: 1, unitPrice: 30, totalPrice: 30 },
        ],
      };

      const result = await service.validateInvoice(invoice, {
        enableAutoCorrection: true,
      });

      expect(result.errors.some(e => e.field === 'totalAmount' && e.code === 'LINE_ITEMS_TOTAL_MISMATCH')).toBe(true);
      expect(result.correctedData?.totalAmount).toBe(80);
      expect(result.metadata.dataCorrections).toContain('line_items_total');
    });

    it('should work in strict mode', async () => {
      const invoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        dueDate: '2024-01-31',
      };

      // Add a custom business rule that generates a warning
      const customRule = {
        name: 'test_rule',
        description: 'Test rule',
        validator: () => ({
          isValid: false,
          errors: [],
          warnings: [{ field: 'test', code: 'TEST_WARNING', message: 'Test warning', impact: 'low' as const }],
          validationScore: 0,
          correlationId: '',
          metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
        }),
        severity: 'warning' as const,
      };

      const strictResult = await service.validateInvoice(invoice, {
        strictMode: true,
        businessRules: [customRule],
      });

      const nonStrictResult = await service.validateInvoice(invoice, {
        strictMode: false,
        businessRules: [customRule],
      });

      expect(strictResult.isValid).toBe(true); // No errors, only warnings
      expect(nonStrictResult.isValid).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      // Create an invoice that will cause an error in validation
      const problematicInvoice = {
        get invoiceNumber() {
          throw new Error('Simulated error');
        },
      } as unknown as InvoiceData;

      await expect(service.validateInvoice(problematicInvoice)).rejects.toThrow(AppError);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should calculate validation score correctly', async () => {
      const highQualityInvoice: InvoiceData = {
        invoiceNumber: 'INV-001',
        invoiceDate: '2024-01-01',
        dueDate: '2024-01-31',
        totalAmount: 1000,
        taxAmount: 100,
        supplierName: 'ACME Corp',
        billTo: 'Customer Inc',
        currency: 'USD',
      };

      const lowQualityInvoice: InvoiceData = {
        invoiceNumber: '', // Invalid
        totalAmount: -100, // Invalid
        dueDate: 'invalid-date', // Invalid
      };

      const highQualityResult = await service.validateInvoice(highQualityInvoice);
      const lowQualityResult = await service.validateInvoice(lowQualityInvoice);

      expect(highQualityResult.validationScore).toBeGreaterThan(lowQualityResult.validationScore);
      expect(highQualityResult.validationScore).toBeGreaterThan(80);
      expect(lowQualityResult.validationScore).toBeLessThan(50);
    });
  });

  describe('validateInvoices', () => {
    it('should validate multiple invoices', async () => {
      const invoices: InvoiceData[] = [
        {
          invoiceNumber: 'INV-001',
          totalAmount: 100,
          dueDate: '2024-01-31',
        },
        {
          invoiceNumber: 'INV-002',
          totalAmount: 200,
          dueDate: '2024-02-28',
        },
      ];

      const results = await service.validateInvoices(invoices);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should handle errors in batch validation', async () => {
      const invoices = [
        {
          invoiceNumber: 'INV-001',
          totalAmount: 100,
          dueDate: '2024-01-31',
        },
        {
          get invoiceNumber() {
            throw new Error('Simulated error');
          },
        } as unknown as InvoiceData,
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
      const results = [
        {
          isValid: true,
          errors: [],
          warnings: [],
          validationScore: 90,
          correlationId: '1',
          metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
        },
        {
          isValid: false,
          errors: [
            { field: 'invoiceNumber', code: 'REQUIRED_FIELD_MISSING', message: 'Missing', severity: 'error' as const },
            { field: 'totalAmount', code: 'NEGATIVE_AMOUNT', message: 'Negative', severity: 'error' as const },
          ],
          warnings: [
            { field: 'currency', code: 'INVALID_CURRENCY_FORMAT', message: 'Invalid', impact: 'medium' as const },
          ],
          validationScore: 30,
          correlationId: '2',
          metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
        },
        {
          isValid: true,
          errors: [],
          warnings: [
            { field: 'currency', code: 'INVALID_CURRENCY_FORMAT', message: 'Invalid', impact: 'medium' as const },
          ],
          validationScore: 85,
          correlationId: '3',
          metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
        },
      ];

      const stats = service.getValidationStatistics(results);

      expect(stats.totalValidated).toBe(3);
      expect(stats.validCount).toBe(2);
      expect(stats.invalidCount).toBe(1);
      expect(stats.averageScore).toBeCloseTo(68.33, 1);
      expect(stats.commonErrors).toHaveLength(2);
      expect(stats.commonErrors[0].code).toBe('REQUIRED_FIELD_MISSING');
      expect(stats.commonErrors[0].count).toBe(1);
      expect(stats.commonWarnings).toHaveLength(1);
      expect(stats.commonWarnings[0].code).toBe('INVALID_CURRENCY_FORMAT');
      expect(stats.commonWarnings[0].count).toBe(2);
    });
  });
});