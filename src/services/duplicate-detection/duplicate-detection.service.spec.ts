import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { Invoice, DuplicateDetectionMethod } from '../../models/invoice.entity';
import { TestHelpers, InvoiceFixtures } from '../../../test';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DuplicateDetectionService]
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkForDuplicates', () => {
    it('should return no duplicate for unique invoice', async () => {
      const uniqueInvoice = InvoiceFixtures.createValidInvoice({
        invoiceNumber: 'UNIQUE-001',
        billTo: 'Unique Customer',
        totalAmount: 999.99
      });

      const result = await service.checkForDuplicates(uniqueInvoice);

      expect(result.isDuplicate).toBe(false);
      expect(result.detectionMethod).toBe(DuplicateDetectionMethod.COMBINED);
      expect(result.confidence).toBe(1.0);
    });

    it('should handle null/undefined invoice input', async () => {
      await expect(service.checkForDuplicates(null)).rejects.toThrow(
        'Invoice data is required for duplicate detection'
      );

      await expect(service.checkForDuplicates(undefined)).rejects.toThrow(
        'Invoice data is required for duplicate detection'
      );
    });

    it('should handle empty invoice object', async () => {
      const emptyInvoice = {};

      const result = await service.checkForDuplicates(emptyInvoice);

      expect(result.isDuplicate).toBe(false);
      expect(result.detectionMethod).toBe(DuplicateDetectionMethod.COMBINED);
    });

    it('should handle invoice with minimal data', async () => {
      const minimalInvoice = {
        invoiceNumber: 'MIN-001'
      };

      const result = await service.checkForDuplicates(minimalInvoice);

      expect(result.isDuplicate).toBe(false);
      expect(result.confidence).toBeDefined();
    });

    it('should handle invoice without invoice number', async () => {
      const invoiceWithoutNumber = {
        billTo: 'Test Customer',
        totalAmount: 100.00,
        dueDate: new Date('2024-12-31')
      };

      const result = await service.checkForDuplicates(invoiceWithoutNumber);

      expect(result.isDuplicate).toBe(false);
      // Should still check other methods even without invoice number
    });
  });

  describe('generateContentHash', () => {
    it('should generate consistent hash for same invoice data', () => {
      const invoice1 = InvoiceFixtures.createValidInvoice();
      const invoice2 = InvoiceFixtures.createValidInvoice();

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    it('should generate different hashes for different invoice data', () => {
      const invoice1 = InvoiceFixtures.createValidInvoice({
        invoiceNumber: 'INV-001',
        totalAmount: 100.00
      });

      const invoice2 = InvoiceFixtures.createValidInvoice({
        invoiceNumber: 'INV-002',
        totalAmount: 200.00
      });

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize data before hashing', () => {
      const invoice1 = {
        invoiceNumber: '  INV-001  ',
        billTo: 'Test   Company   Inc.',
        totalAmount: 100.00,
        dueDate: new Date('2024-12-31')
      };

      const invoice2 = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Company Inc.',
        totalAmount: 100.00,
        dueDate: new Date('2024-12-31')
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2);
    });

    it('should handle missing fields gracefully', () => {
      const incompleteInvoice = {
        invoiceNumber: 'INV-001'
        // Missing other fields
      };

      expect(() => service.generateContentHash(incompleteInvoice)).not.toThrow();
      
      const hash = service.generateContentHash(incompleteInvoice);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle null/undefined values in invoice', () => {
      const invoiceWithNulls = {
        invoiceNumber: 'INV-001',
        billTo: null,
        totalAmount: undefined,
        dueDate: new Date('2024-12-31')
      };

      expect(() => service.generateContentHash(invoiceWithNulls)).not.toThrow();
      
      const hash = service.generateContentHash(invoiceWithNulls);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle invalid date objects', () => {
      const invoiceWithInvalidDate = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Company',
        totalAmount: 100.00,
        dueDate: new Date('invalid-date')
      };

      expect(() => service.generateContentHash(invoiceWithInvalidDate)).not.toThrow();
    });

    it('should handle floating point precision issues', () => {
      const invoice1 = {
        invoiceNumber: 'INV-001',
        totalAmount: 0.1 + 0.2 // JavaScript floating point issue
      };

      const invoice2 = {
        invoiceNumber: 'INV-001',
        totalAmount: 0.3
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2); // Should normalize to same value
    });
  });

  describe('findSimilarInvoices', () => {
    it('should handle null/undefined invoice input', async () => {
      await expect(service.findSimilarInvoices(null)).rejects.toThrow(
        'Invoice data is required to find similar invoices'
      );
    });

    it('should return empty array when no repository is available', async () => {
      const invoice = InvoiceFixtures.createValidInvoice();

      const similarInvoices = await service.findSimilarInvoices(invoice);

      expect(similarInvoices).toEqual([]);
    });

    it('should handle invoice with minimal data', async () => {
      const minimalInvoice = {
        invoiceNumber: 'MIN-001'
      };

      const similarInvoices = await service.findSimilarInvoices(minimalInvoice);

      expect(similarInvoices).toEqual([]);
    });
  });

  describe('resolveDuplicate', () => {
    it('should handle duplicate resolution without repository', async () => {
      // Since repository is not implemented yet, this should not throw
      await expect(
        service.resolveDuplicate('duplicate-id', 'original-id', 'marked_as_duplicate')
      ).resolves.not.toThrow();
    });

    it('should handle various resolution types', async () => {
      const resolutionTypes = [
        'marked_as_duplicate',
        'merged_with_original',
        'kept_both',
        'manual_review_required'
      ];

      for (const resolution of resolutionTypes) {
        await expect(
          service.resolveDuplicate('dup-id', 'orig-id', resolution)
        ).resolves.not.toThrow();
      }
    });
  });

  describe('private methods via public interface', () => {
    describe('string normalization', () => {
      it('should normalize strings consistently through hash generation', () => {
        const testCases = [
          { input: '  Test Company  ', expected: 'test company' },
          { input: 'Test   Multiple   Spaces', expected: 'test multiple spaces' },
          { input: 'UPPERCASE', expected: 'uppercase' },
          { input: 'MixedCase', expected: 'mixedcase' },
          { input: '', expected: '' },
          { input: null, expected: '' },
          { input: undefined, expected: '' }
        ];

        // Test normalization through hash generation
        for (const testCase of testCases) {
          const invoice1 = { billTo: testCase.input };
          const invoice2 = { billTo: testCase.expected };

          if (testCase.input !== null && testCase.input !== undefined) {
            const hash1 = service.generateContentHash(invoice1);
            const hash2 = service.generateContentHash(invoice2);
            expect(hash1).toBe(hash2);
          }
        }
      });
    });

    describe('amount normalization', () => {
      it('should normalize amounts consistently', () => {
        const testCases = [
          { amount1: 100.00, amount2: 100, shouldMatch: true },
          { amount1: 99.999, amount2: 100.00, shouldMatch: true }, // Same after rounding to 2 decimals
          { amount1: 100.001, amount2: 100.00, shouldMatch: true }, // Same after rounding to 2 decimals
          { amount1: 100.1, amount2: 100.3, shouldMatch: false },
          { amount1: null, amount2: 0, shouldMatch: true },
          { amount1: undefined, amount2: 0, shouldMatch: true },
          { amount1: NaN, amount2: 0, shouldMatch: true }
        ];

        for (const testCase of testCases) {
          const invoice1 = { totalAmount: testCase.amount1 };
          const invoice2 = { totalAmount: testCase.amount2 };

          const hash1 = service.generateContentHash(invoice1);
          const hash2 = service.generateContentHash(invoice2);

          if (testCase.shouldMatch) {
            expect(hash1).toBe(hash2);
          } else {
            expect(hash1).not.toBe(hash2);
          }
        }
      });
    });

    describe('date normalization', () => {
      it('should normalize dates consistently', () => {
        const testCases = [
          {
            date1: new Date('2024-12-31T10:30:00Z'),
            date2: new Date('2024-12-31T15:45:00Z'),
            shouldMatch: true // Same date, different times
          },
          {
            date1: new Date('2024-12-31'),
            date2: new Date('2024-12-31'),
            shouldMatch: true
          },
          {
            date1: new Date('2024-12-31'),
            date2: new Date('2024-12-30'),
            shouldMatch: false
          },
          {
            date1: null,
            date2: undefined,
            shouldMatch: true // Both normalize to empty string
          }
        ];

        for (const testCase of testCases) {
          const invoice1 = { dueDate: testCase.date1 };
          const invoice2 = { dueDate: testCase.date2 };

          const hash1 = service.generateContentHash(invoice1);
          const hash2 = service.generateContentHash(invoice2);

          if (testCase.shouldMatch) {
            expect(hash1).toBe(hash2);
          } else {
            expect(hash1).not.toBe(hash2);
          }
        }
      });
    });
  });

  describe('error handling', () => {
    it('should handle errors in hash generation gracefully', () => {
      // Create an object that might cause JSON.stringify to fail
      const problematicInvoice = {
        invoiceNumber: 'INV-001'
      };

      // Add circular reference
      (problematicInvoice as any).self = problematicInvoice;

      // The service only uses specific fields, so circular references shouldn't cause issues
      expect(() => service.generateContentHash(problematicInvoice)).not.toThrow();
    });

    it('should handle errors in duplicate checking', async () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const invoice = InvoiceFixtures.createValidInvoice();

      // The service should handle internal errors gracefully
      const result = await service.checkForDuplicates(invoice);

      expect(result).toBeDefined();
      expect(result.isDuplicate).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('performance and edge cases', () => {
    it('should handle large invoice objects efficiently', async () => {
      const largeInvoice = {
        invoiceNumber: 'LARGE-001',
        billTo: 'A'.repeat(10000), // Very long string
        supplierName: 'B'.repeat(10000),
        totalAmount: 999999.99,
        dueDate: new Date('2024-12-31')
      };

      const { result, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return service.checkForDuplicates(largeInvoice);
      });

      expect(result).toBeDefined();
      expect(timeMs).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle concurrent duplicate checks', async () => {
      const invoices = Array.from({ length: 10 }, (_, i) => 
        InvoiceFixtures.createValidInvoice({
          invoiceNumber: `CONCURRENT-${i}`,
          totalAmount: 100 + i
        })
      );

      const promises = invoices.map(invoice => service.checkForDuplicates(invoice));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.isDuplicate).toBe(false);
        expect(result.confidence).toBeDefined();
      });
    });

    it('should generate unique hashes for similar but different invoices', () => {
      const baseInvoice = InvoiceFixtures.createValidInvoice();
      
      const variations = [
        { ...baseInvoice, invoiceNumber: baseInvoice.invoiceNumber + 'A' },
        { ...baseInvoice, totalAmount: baseInvoice.totalAmount + 0.01 },
        { ...baseInvoice, billTo: baseInvoice.billTo + ' LLC' },
        { ...baseInvoice, dueDate: new Date(baseInvoice.dueDate.getTime() + 86400000) } // +1 day
      ];

      const baseHash = service.generateContentHash(baseInvoice);
      
      variations.forEach((variation, i) => {
        const variationHash = service.generateContentHash(variation);
        expect(variationHash).not.toBe(baseHash);
      });
    });

    it('should handle invoices with special characters', () => {
      const specialCharInvoice = {
        invoiceNumber: 'INV-001-äöü',
        billTo: 'Tëst Cömpäny Iñc. 中文',
        totalAmount: 100.00,
        dueDate: new Date('2024-12-31')
      };

      expect(() => service.generateContentHash(specialCharInvoice)).not.toThrow();
      
      const hash = service.generateContentHash(specialCharInvoice);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle invoices with extreme numeric values', () => {
      const extremeInvoice = {
        invoiceNumber: 'EXTREME-001',
        totalAmount: Number.MAX_SAFE_INTEGER,
        dueDate: new Date('2024-12-31')
      };

      expect(() => service.generateContentHash(extremeInvoice)).not.toThrow();
      
      const hash = service.generateContentHash(extremeInvoice);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});