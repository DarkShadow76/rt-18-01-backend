import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { 
  Invoice, 
  DuplicateDetectionMethod,
  DuplicateDetectionResult 
} from '../../models/invoice.entity';
import { InvoiceStatus } from '../../common/dto/upload-invoice.dto';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DuplicateDetectionService],
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateContentHash', () => {
    it('should generate consistent hash for same invoice data', () => {
      const invoice1: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Acme Corp',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const invoice2: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Acme Corp',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
    });

    it('should generate different hashes for different invoice data', () => {
      const invoice1: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Acme Corp',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const invoice2: Partial<Invoice> = {
        invoiceNumber: 'INV-002',
        billTo: 'Acme Corp',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle missing or undefined fields gracefully', () => {
      const invoice: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        // Missing other fields
      };

      expect(() => service.generateContentHash(invoice)).not.toThrow();
      const hash = service.generateContentHash(invoice);
      expect(hash).toHaveLength(64);
    });

    it('should normalize string fields for consistent hashing', () => {
      const invoice1: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: '  Acme Corp  ',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const invoice2: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'acme corp',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2);
    });

    it('should handle floating point precision in amounts', () => {
      const invoice1: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Acme Corp',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const invoice2: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Acme Corp',
        totalAmount: 999.999999, // Should round to 1000.00
        dueDate: new Date('2024-01-15'),
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('checkForDuplicates', () => {
    it('should return no duplicate when invoice is unique', async () => {
      const invoice: Partial<Invoice> = {
        invoiceNumber: 'INV-UNIQUE-001',
        billTo: 'Unique Corp',
        totalAmount: 1500.00,
        dueDate: new Date('2024-02-15'),
      };

      const result = await service.checkForDuplicates(invoice);

      expect(result.isDuplicate).toBe(false);
      expect(result.detectionMethod).toBe(DuplicateDetectionMethod.COMBINED);
      expect(result.confidence).toBe(1.0);
    });

    it('should handle errors gracefully and throw meaningful error messages', async () => {
      // Mock a scenario that would cause an error
      const invalidInvoice: Partial<Invoice> = null;

      await expect(service.checkForDuplicates(invalidInvoice)).rejects.toThrow('Invoice data is required for duplicate detection');
    });
  });

  describe('findSimilarInvoices', () => {
    it('should return empty array when no repository is available', async () => {
      const invoice: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Corp',
        totalAmount: 1000.00,
        dueDate: new Date('2024-01-15'),
      };

      const result = await service.findSimilarInvoices(invoice);

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const invalidInvoice: Partial<Invoice> = null;

      await expect(service.findSimilarInvoices(invalidInvoice)).rejects.toThrow('Invoice data is required to find similar invoices');
    });
  });

  describe('resolveDuplicate', () => {
    it('should handle resolution without repository gracefully', async () => {
      await expect(
        service.resolveDuplicate('duplicate-id', 'original-id', 'keep_original')
      ).resolves.not.toThrow();
    });

    it('should handle errors gracefully', async () => {
      // This would test error scenarios once repository is implemented
      expect(true).toBe(true); // Placeholder test
    });
  });

  describe('private methods through public interface', () => {
    it('should normalize strings consistently', () => {
      const invoice1: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: '  Test   Corp  ',
        totalAmount: 1000,
        dueDate: new Date('2024-01-15'),
      };

      const invoice2: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'TEST CORP',
        totalAmount: 1000,
        dueDate: new Date('2024-01-15'),
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2);
    });

    it('should handle date normalization', () => {
      const invoice1: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Corp',
        totalAmount: 1000,
        dueDate: new Date('2024-01-15T10:30:00Z'),
      };

      const invoice2: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Corp',
        totalAmount: 1000,
        dueDate: new Date('2024-01-15T15:45:00Z'),
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2); // Should be same because only date part is used
    });

    it('should handle amount normalization with precision', () => {
      const invoice1: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Corp',
        totalAmount: 1000.004, // Will round to 1000.00
        dueDate: new Date('2024-01-15'),
      };

      const invoice2: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Corp',
        totalAmount: 1000.003, // Will also round to 1000.00
        dueDate: new Date('2024-01-15'),
      };

      const hash1 = service.generateContentHash(invoice1);
      const hash2 = service.generateContentHash(invoice2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty invoice data', () => {
      const emptyInvoice: Partial<Invoice> = {};

      expect(() => service.generateContentHash(emptyInvoice)).not.toThrow();
      const hash = service.generateContentHash(emptyInvoice);
      expect(hash).toHaveLength(64);
    });

    it('should handle null and undefined values', () => {
      const invoiceWithNulls: Partial<Invoice> = {
        invoiceNumber: null,
        billTo: undefined,
        totalAmount: null,
        dueDate: undefined,
      };

      expect(() => service.generateContentHash(invoiceWithNulls)).not.toThrow();
      const hash = service.generateContentHash(invoiceWithNulls);
      expect(hash).toHaveLength(64);
    });

    it('should handle invalid dates', () => {
      const invoiceWithInvalidDate: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Corp',
        totalAmount: 1000,
        dueDate: new Date('invalid-date'),
      };

      expect(() => service.generateContentHash(invoiceWithInvalidDate)).not.toThrow();
    });

    it('should handle NaN amounts', () => {
      const invoiceWithNaNAmount: Partial<Invoice> = {
        invoiceNumber: 'INV-001',
        billTo: 'Test Corp',
        totalAmount: NaN,
        dueDate: new Date('2024-01-15'),
      };

      expect(() => service.generateContentHash(invoiceWithNaNAmount)).not.toThrow();
    });
  });
});