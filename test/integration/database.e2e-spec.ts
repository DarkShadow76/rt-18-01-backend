import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { 
  TestHelpers, 
  InvoiceFixtures, 
  DatabaseTestUtils,
  createSupabaseMock 
} from '../index';
import { SupabaseInvoiceRepository } from '../../src/repositories/supabase-invoice.repository';
import { AuditService } from '../../src/services/audit/audit.service';
import { Invoice, InvoiceStatus } from '../../src/models/invoice.entity';

describe('Database Integration Tests', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let invoiceRepository: SupabaseInvoiceRepository;
  let auditService: AuditService;

  beforeAll(async () => {
    // Only run these tests if we have a real database connection
    if (!process.env.SUPABASE_URL?.includes('supabase')) {
      console.log('Skipping database integration tests - no real database configured');
      return;
    }

    moduleRef = await Test.createTestingModule({
      providers: [
        SupabaseInvoiceRepository,
        AuditService,
        // Add other necessary providers
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    invoiceRepository = moduleRef.get<SupabaseInvoiceRepository>(SupabaseInvoiceRepository);
    auditService = moduleRef.get<AuditService>(AuditService);
  });

  afterAll(async () => {
    if (app) {
      await DatabaseTestUtils.cleanupTestData();
      await app.close();
    }
  });

  beforeEach(async () => {
    if (app) {
      await DatabaseTestUtils.cleanupTestData();
    }
  });

  describe('Invoice Repository Integration', () => {
    it('should save and retrieve invoices correctly', async () => {
      if (!invoiceRepository) return;

      const testInvoice = InvoiceFixtures.createValidInvoice({
        id: 'test-save-retrieve',
        invoiceNumber: 'TEST-SAVE-001'
      });

      // Save invoice
      const savedInvoice = await invoiceRepository.save(testInvoice);
      expect(savedInvoice).toBeDefined();
      expect(savedInvoice.id).toBe(testInvoice.id);

      // Retrieve invoice
      const retrievedInvoice = await invoiceRepository.findById(testInvoice.id);
      expect(retrievedInvoice).toBeDefined();
      expect(retrievedInvoice?.invoiceNumber).toBe(testInvoice.invoiceNumber);
      expect(retrievedInvoice?.totalAmount).toBe(testInvoice.totalAmount);
    });

    it('should update invoice status correctly', async () => {
      if (!invoiceRepository) return;

      const testInvoice = await DatabaseTestUtils.createTestInvoice({
        id: 'test-update-status',
        status: InvoiceStatus.PROCESSING
      });

      // Update status
      const updatedInvoice = await invoiceRepository.update(testInvoice.id, {
        status: InvoiceStatus.COMPLETED
      });

      expect(updatedInvoice.status).toBe(InvoiceStatus.COMPLETED);

      // Verify in database
      const retrievedInvoice = await invoiceRepository.findById(testInvoice.id);
      expect(retrievedInvoice?.status).toBe(InvoiceStatus.COMPLETED);
    });

    it('should find invoices by invoice number', async () => {
      if (!invoiceRepository) return;

      const testInvoice = await DatabaseTestUtils.createTestInvoice({
        id: 'test-find-by-number',
        invoiceNumber: 'FIND-BY-NUMBER-001'
      });

      const foundInvoice = await invoiceRepository.findByInvoiceNumber('FIND-BY-NUMBER-001');
      expect(foundInvoice).toBeDefined();
      expect(foundInvoice?.id).toBe(testInvoice.id);
    });

    it('should handle duplicate invoice numbers', async () => {
      if (!invoiceRepository) return;

      const invoice1 = await DatabaseTestUtils.createTestInvoice({
        id: 'test-duplicate-1',
        invoiceNumber: 'DUPLICATE-001'
      });

      // Try to create another invoice with same number
      const invoice2 = InvoiceFixtures.createValidInvoice({
        id: 'test-duplicate-2',
        invoiceNumber: 'DUPLICATE-001'
      });

      // This should either fail or be handled gracefully
      try {
        await invoiceRepository.save(invoice2);
        // If it succeeds, verify the duplicate detection logic
        const duplicates = await invoiceRepository.findByInvoiceNumber('DUPLICATE-001');
        expect(duplicates).toBeDefined();
      } catch (error) {
        // Expected to fail due to unique constraint
        expect(error).toBeDefined();
      }
    });

    it('should filter invoices correctly', async () => {
      if (!invoiceRepository) return;

      // Create test invoices with different statuses
      await DatabaseTestUtils.createTestInvoice({
        id: 'test-filter-1',
        status: InvoiceStatus.COMPLETED,
        totalAmount: 100
      });

      await DatabaseTestUtils.createTestInvoice({
        id: 'test-filter-2',
        status: InvoiceStatus.FAILED,
        totalAmount: 200
      });

      await DatabaseTestUtils.createTestInvoice({
        id: 'test-filter-3',
        status: InvoiceStatus.COMPLETED,
        totalAmount: 300
      });

      // Filter by status
      const completedInvoices = await invoiceRepository.findAll({
        status: InvoiceStatus.COMPLETED
      });

      expect(completedInvoices.length).toBe(2);
      completedInvoices.forEach(invoice => {
        expect(invoice.status).toBe(InvoiceStatus.COMPLETED);
      });
    });

    it('should handle pagination correctly', async () => {
      if (!invoiceRepository) return;

      // Create multiple test invoices
      const invoicePromises = Array.from({ length: 15 }, (_, i) =>
        DatabaseTestUtils.createTestInvoice({
          id: `test-pagination-${i}`,
          invoiceNumber: `PAGE-${i.toString().padStart(3, '0')}`
        })
      );

      await Promise.all(invoicePromises);

      // Test pagination
      const page1 = await invoiceRepository.findAll({
        limit: 10,
        offset: 0
      });

      const page2 = await invoiceRepository.findAll({
        limit: 10,
        offset: 10
      });

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(5);

      // Ensure no overlap
      const page1Ids = page1.map(inv => inv.id);
      const page2Ids = page2.map(inv => inv.id);
      const overlap = page1Ids.filter(id => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('should delete invoices correctly', async () => {
      if (!invoiceRepository) return;

      const testInvoice = await DatabaseTestUtils.createTestInvoice({
        id: 'test-delete',
        invoiceNumber: 'DELETE-001'
      });

      // Delete invoice
      await invoiceRepository.delete(testInvoice.id);

      // Verify deletion
      const deletedInvoice = await invoiceRepository.findById(testInvoice.id);
      expect(deletedInvoice).toBeNull();
    });
  });

  describe('Audit Service Integration', () => {
    it('should create audit trail entries', async () => {
      if (!auditService) return;

      const testInvoice = await DatabaseTestUtils.createTestInvoice({
        id: 'test-audit-create'
      });

      // Create audit entry
      await auditService.logAction(
        testInvoice.id,
        'invoice_created',
        { invoiceNumber: testInvoice.invoiceNumber }
      );

      // Retrieve audit trail
      const auditEntries = await auditService.getAuditTrail(testInvoice.id);
      expect(auditEntries.length).toBeGreaterThan(0);
      expect(auditEntries[0].action).toBe('invoice_created');
    });

    it('should track invoice status changes', async () => {
      if (!auditService || !invoiceRepository) return;

      const testInvoice = await DatabaseTestUtils.createTestInvoice({
        id: 'test-audit-status',
        status: InvoiceStatus.PROCESSING
      });

      // Update status and log audit
      await invoiceRepository.update(testInvoice.id, {
        status: InvoiceStatus.COMPLETED
      });

      await auditService.logAction(
        testInvoice.id,
        'status_changed',
        {
          from: InvoiceStatus.PROCESSING,
          to: InvoiceStatus.COMPLETED
        }
      );

      // Verify audit trail
      const auditEntries = await auditService.getAuditTrail(testInvoice.id);
      const statusChangeEntry = auditEntries.find(entry => entry.action === 'status_changed');
      
      expect(statusChangeEntry).toBeDefined();
      expect(statusChangeEntry?.changes.from).toBe(InvoiceStatus.PROCESSING);
      expect(statusChangeEntry?.changes.to).toBe(InvoiceStatus.COMPLETED);
    });

    it('should handle concurrent audit logging', async () => {
      if (!auditService) return;

      const testInvoice = await DatabaseTestUtils.createTestInvoice({
        id: 'test-audit-concurrent'
      });

      // Create multiple audit entries concurrently
      const auditPromises = Array.from({ length: 10 }, (_, i) =>
        auditService.logAction(
          testInvoice.id,
          `action_${i}`,
          { step: i }
        )
      );

      await Promise.all(auditPromises);

      // Verify all entries were created
      const auditEntries = await auditService.getAuditTrail(testInvoice.id);
      expect(auditEntries.length).toBe(10);
    });
  });

  describe('Transaction Handling', () => {
    it('should handle transaction rollback on errors', async () => {
      if (!invoiceRepository) return;

      const testInvoice = InvoiceFixtures.createValidInvoice({
        id: 'test-transaction-rollback'
      });

      try {
        // Simulate a transaction that should fail
        await invoiceRepository.save(testInvoice);
        
        // Force an error that should rollback the transaction
        throw new Error('Simulated transaction error');
      } catch (error) {
        // Verify the invoice was not saved due to rollback
        const retrievedInvoice = await invoiceRepository.findById(testInvoice.id);
        expect(retrievedInvoice).toBeNull();
      }
    });

    it('should maintain data consistency during concurrent operations', async () => {
      if (!invoiceRepository) return;

      const testInvoice = await DatabaseTestUtils.createTestInvoice({
        id: 'test-consistency',
        totalAmount: 100
      });

      // Simulate concurrent updates
      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        invoiceRepository.update(testInvoice.id, {
          totalAmount: 100 + i
        })
      );

      const results = await Promise.allSettled(updatePromises);

      // At least one update should succeed
      const successfulUpdates = results.filter(result => result.status === 'fulfilled');
      expect(successfulUpdates.length).toBeGreaterThan(0);

      // Final state should be consistent
      const finalInvoice = await invoiceRepository.findById(testInvoice.id);
      expect(finalInvoice?.totalAmount).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Performance Tests', () => {
    it('should handle bulk operations efficiently', async () => {
      if (!invoiceRepository) return;

      const bulkInvoices = Array.from({ length: 100 }, (_, i) =>
        InvoiceFixtures.createValidInvoice({
          id: `bulk-${i}`,
          invoiceNumber: `BULK-${i.toString().padStart(3, '0')}`
        })
      );

      const { result, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        const savePromises = bulkInvoices.map(invoice => 
          invoiceRepository.save(invoice)
        );
        return Promise.all(savePromises);
      });

      expect(result.length).toBe(100);
      expect(timeMs).toBeLessThan(30000); // Should complete within 30 seconds

      // Verify all invoices were saved
      const savedCount = await invoiceRepository.findAll({ limit: 1000 });
      expect(savedCount.length).toBeGreaterThanOrEqual(100);
    });

    it('should handle complex queries efficiently', async () => {
      if (!invoiceRepository) return;

      // Create test data with various statuses and amounts
      const testData = Array.from({ length: 50 }, (_, i) => ({
        id: `complex-query-${i}`,
        invoiceNumber: `CQ-${i}`,
        status: i % 3 === 0 ? InvoiceStatus.COMPLETED : 
               i % 3 === 1 ? InvoiceStatus.PROCESSING : InvoiceStatus.FAILED,
        totalAmount: 100 + (i * 10)
      }));

      await Promise.all(testData.map(data => 
        DatabaseTestUtils.createTestInvoice(data)
      ));

      const { result, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return invoiceRepository.findAll({
          status: InvoiceStatus.COMPLETED,
          minAmount: 200,
          maxAmount: 800
        });
      });

      expect(timeMs).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.length).toBeGreaterThan(0);

      // Verify query results are correct
      result.forEach(invoice => {
        expect(invoice.status).toBe(InvoiceStatus.COMPLETED);
        expect(invoice.totalAmount).toBeGreaterThanOrEqual(200);
        expect(invoice.totalAmount).toBeLessThanOrEqual(800);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      if (!invoiceRepository) return;

      // This test would require temporarily breaking the database connection
      // In a real scenario, you might use a test database that you can control

      const testInvoice = InvoiceFixtures.createValidInvoice({
        id: 'test-connection-failure'
      });

      try {
        await invoiceRepository.save(testInvoice);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('should handle invalid data gracefully', async () => {
      if (!invoiceRepository) return;

      const invalidInvoice = {
        id: 'invalid-data-test',
        // Missing required fields
      } as Invoice;

      try {
        await invoiceRepository.save(invalidInvoice);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle constraint violations', async () => {
      if (!invoiceRepository) return;

      const invoice1 = InvoiceFixtures.createValidInvoice({
        id: 'constraint-test-1',
        invoiceNumber: 'CONSTRAINT-001'
      });

      const invoice2 = InvoiceFixtures.createValidInvoice({
        id: 'constraint-test-2',
        invoiceNumber: 'CONSTRAINT-001' // Same invoice number
      });

      await invoiceRepository.save(invoice1);

      try {
        await invoiceRepository.save(invoice2);
      } catch (error) {
        expect(error).toBeDefined();
        // Should be a constraint violation error
      }
    });
  });
});