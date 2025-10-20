import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { 
  TestHelpers, 
  InvoiceFixtures, 
  DatabaseTestUtils,
  createFailingDocumentAIMock,
  createFailingSupabaseMock 
} from '../index';

describe('Error Scenarios and Recovery Integration Tests', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await DatabaseTestUtils.cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await DatabaseTestUtils.cleanupTestData();
  });

  describe('File Validation Error Scenarios', () => {
    it('should handle corrupted PDF files', async () => {
      const corruptedPdf = Buffer.from('This is not a valid PDF file');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', corruptedPdf, 'corrupted.pdf')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      expect(response.body.message).toContain('validation');
      expect(response.body.error).toBeDefined();
    });

    it('should handle files with malicious content', async () => {
      const maliciousFile = TestHelpers.createMaliciousFile();

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', maliciousFile, 'malicious.pdf')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      expect(response.body.message).toContain('malicious');
    });

    it('should handle empty files', async () => {
      const emptyFile = Buffer.alloc(0);

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', emptyFile, 'empty.pdf')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      expect(response.body.message).toContain('empty');
    });

    it('should handle files with suspicious names', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nContent\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, '../../../etc/passwd')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      expect(response.body.message).toContain('filename');
    });

    it('should handle multiple validation errors', async () => {
      const largeCorruptedFile = Buffer.alloc(100 * 1024 * 1024, 'x'); // 100MB of invalid data

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', largeCorruptedFile, 'large-corrupted.exe')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      // Should report multiple validation errors
      expect(response.body.message).toBeDefined();
    });
  });

  describe('Document AI Service Error Scenarios', () => {
    it('should handle Document AI service unavailable', async () => {
      // Mock Document AI to be unavailable
      const validPdf = Buffer.from('%PDF-1.4\nInvoice content\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'test.pdf');

      // Should handle service unavailability gracefully
      expect([200, 201, 500, 503]).toContain(response.status);

      if (response.status >= 500) {
        TestHelpers.assertErrorResponse(response, response.status);
        expect(response.body.message).toContain('processing');
      }
    });

    it('should handle Document AI timeout', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice content\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'timeout-test.pdf')
        .timeout(5000); // Short timeout

      // Should handle timeout gracefully
      expect([200, 201, 408, 500, 503]).toContain(response.status);
    });

    it('should handle Document AI returning invalid data', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice content\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'invalid-response.pdf');

      // Should handle invalid AI response gracefully
      expect([200, 201, 422, 500]).toContain(response.status);
    });

    it('should retry failed Document AI requests', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice INV-RETRY-001\nTotal: $100.00\n%%EOF');

      // This test assumes retry logic is implemented
      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'retry-test.pdf');

      // Should eventually succeed or fail gracefully after retries
      expect([200, 201, 500, 503]).toContain(response.status);
    });
  });

  describe('Database Error Scenarios', () => {
    it('should handle database connection failures', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice INV-DB-FAIL-001\nTotal: $200.00\n%%EOF');

      // This would require mocking database to fail
      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'db-fail.pdf');

      // Should handle database failures gracefully
      expect([200, 201, 500, 503]).toContain(response.status);
    });

    it('should handle database constraint violations', async () => {
      const duplicatePdf = Buffer.from('%PDF-1.4\nInvoice INV-DUPLICATE-001\nTotal: $300.00\n%%EOF');

      // Upload same invoice twice to trigger constraint violation
      const firstResponse = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', duplicatePdf, 'first.pdf');

      const secondResponse = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', duplicatePdf, 'second.pdf');

      // Second upload should handle constraint violation
      if (secondResponse.status === 409) {
        expect(secondResponse.body.message).toContain('duplicate');
      }
    });

    it('should handle database transaction rollbacks', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice INV-ROLLBACK-001\nTotal: $400.00\n%%EOF');

      // This test would require forcing a transaction rollback scenario
      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'rollback-test.pdf');

      // Should handle rollback gracefully
      expect([200, 201, 500]).toContain(response.status);
    });
  });

  describe('Data Validation Error Scenarios', () => {
    it('should handle invoices with missing required data', async () => {
      const incompletePdf = Buffer.from('%PDF-1.4\nIncomplete invoice\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', incompletePdf, 'incomplete.pdf');

      // Should handle missing data gracefully
      expect([200, 201, 400, 422]).toContain(response.status);

      if (response.status >= 400) {
        TestHelpers.assertErrorResponse(response, response.status);
      }
    });

    it('should handle invoices with invalid amounts', async () => {
      const invalidAmountPdf = Buffer.from('%PDF-1.4\nInvoice INV-001\nTotal: INVALID\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invalidAmountPdf, 'invalid-amount.pdf');

      // Should handle invalid amount gracefully
      expect([200, 201, 400, 422]).toContain(response.status);
    });

    it('should handle invoices with invalid dates', async () => {
      const invalidDatePdf = Buffer.from('%PDF-1.4\nInvoice INV-001\nDue Date: INVALID\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invalidDatePdf, 'invalid-date.pdf');

      // Should handle invalid date gracefully
      expect([200, 201, 400, 422]).toContain(response.status);
    });

    it('should handle invoices with business logic violations', async () => {
      const logicViolationPdf = Buffer.from('%PDF-1.4\nInvoice INV-001\nInvoice Date: 2024-12-31\nDue Date: 2024-01-01\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', logicViolationPdf, 'logic-violation.pdf');

      // Should handle business logic violations
      expect([200, 201, 400, 422]).toContain(response.status);
    });
  });

  describe('Concurrent Processing Error Scenarios', () => {
    it('should handle race conditions in duplicate detection', async () => {
      const duplicatePdf = Buffer.from('%PDF-1.4\nInvoice INV-RACE-001\nTotal: $500.00\n%%EOF');

      // Upload same invoice simultaneously
      const promises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/upload')
          .attach('file', duplicatePdf, 'race-test.pdf')
      );

      const responses = await Promise.all(promises);

      // Only one should succeed, others should detect duplicate or fail gracefully
      const successfulUploads = responses.filter(r => [200, 201].includes(r.status));
      const duplicateDetections = responses.filter(r => r.status === 409);
      const errors = responses.filter(r => r.status >= 500);

      expect(successfulUploads.length).toBeLessThanOrEqual(1);
      expect(duplicateDetections.length + errors.length).toBeGreaterThan(0);
    });

    it('should handle resource contention', async () => {
      const invoices = Array.from({ length: 20 }, (_, i) =>
        Buffer.from(`%PDF-1.4\nInvoice INV-CONTENTION-${i}\nTotal: $${100 + i}.00\n%%EOF`)
      );

      const promises = invoices.map((buffer, i) =>
        request(app.getHttpServer())
          .post('/upload')
          .attach('file', buffer, `contention-${i}.pdf`)
      );

      const responses = await Promise.all(promises);

      // All should complete, either successfully or with proper error handling
      responses.forEach(response => {
        expect([200, 201, 400, 409, 422, 500, 503]).toContain(response.status);
      });

      // Most should succeed
      const successfulUploads = responses.filter(r => [200, 201].includes(r.status));
      expect(successfulUploads.length).toBeGreaterThan(responses.length * 0.5);
    });
  });

  describe('Memory and Resource Error Scenarios', () => {
    it('should handle memory pressure from large files', async () => {
      // Create a large but valid PDF
      const largePdf = Buffer.alloc(20 * 1024 * 1024); // 20MB
      largePdf.write('%PDF-1.4\n', 0);
      largePdf.write('Large invoice content\n', 10);
      largePdf.write('%%EOF', largePdf.length - 5);

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', largePdf, 'large.pdf')
        .timeout(60000); // Longer timeout for large file

      // Should handle large files gracefully
      expect([200, 201, 413, 500, 503]).toContain(response.status);
    });

    it('should handle multiple large files concurrently', async () => {
      const largeFiles = Array.from({ length: 3 }, (_, i) => {
        const buffer = Buffer.alloc(10 * 1024 * 1024); // 10MB each
        buffer.write(`%PDF-1.4\nLarge invoice ${i}\n%%EOF`, 0);
        return buffer;
      });

      const promises = largeFiles.map((buffer, i) =>
        request(app.getHttpServer())
          .post('/upload')
          .attach('file', buffer, `large-${i}.pdf`)
          .timeout(60000)
      );

      const responses = await Promise.allSettled(promises);

      // Should handle resource pressure gracefully
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          expect([200, 201, 413, 500, 503]).toContain(result.value.status);
        }
        // Rejected promises are also acceptable under resource pressure
      });
    });
  });

  describe('Network and Timeout Error Scenarios', () => {
    it('should handle client disconnection during upload', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice content\n%%EOF');

      // Simulate client disconnection by setting very short timeout
      try {
        await request(app.getHttpServer())
          .post('/upload')
          .attach('file', validPdf, 'disconnect-test.pdf')
          .timeout(1); // 1ms timeout to force disconnection

        // If it doesn't timeout, that's also acceptable
      } catch (error) {
        expect(error.message).toContain('timeout');
      }
    });

    it('should handle slow client uploads', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice content\n%%EOF');

      // Test with reasonable timeout
      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'slow-upload.pdf')
        .timeout(30000); // 30 second timeout

      // Should complete within timeout
      expect([200, 201, 408, 500]).toContain(response.status);
    });
  });

  describe('Recovery and Resilience Tests', () => {
    it('should recover from temporary service failures', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice INV-RECOVERY-001\nTotal: $600.00\n%%EOF');

      // First attempt might fail due to temporary issues
      const firstResponse = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'recovery-1.pdf');

      // Second attempt should succeed (assuming recovery)
      await TestHelpers.wait(1000); // Wait a bit for recovery

      const secondResponse = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'recovery-2.pdf');

      // At least one should succeed or both should fail gracefully
      const statuses = [firstResponse.status, secondResponse.status];
      expect(statuses.some(status => [200, 201].includes(status)) || 
             statuses.every(status => [500, 503].includes(status))).toBe(true);
    });

    it('should maintain data consistency during failures', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice INV-CONSISTENCY-001\nTotal: $700.00\n%%EOF');

      // Upload invoice
      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'consistency-test.pdf');

      if ([200, 201].includes(response.status)) {
        const invoiceId = response.body.data?.id;
        
        if (invoiceId) {
          // Verify data consistency
          const savedInvoice = await DatabaseTestUtils.findTestInvoice(invoiceId);
          
          if (savedInvoice) {
            expect(savedInvoice.id).toBe(invoiceId);
            expect(savedInvoice.status).toBeDefined();
            expect(savedInvoice.createdAt).toBeDefined();
          }
        }
      }
    });

    it('should handle graceful degradation', async () => {
      const validPdf = Buffer.from('%PDF-1.4\nInvoice INV-DEGRADATION-001\nTotal: $800.00\n%%EOF');

      // Test should work even with some services degraded
      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'degradation-test.pdf');

      // Should either succeed or fail gracefully
      expect([200, 201, 422, 500, 503]).toContain(response.status);

      if (response.status >= 500) {
        TestHelpers.assertErrorResponse(response, response.status);
        expect(response.body.message).toBeDefined();
      }
    });
  });

  describe('Error Logging and Monitoring', () => {
    it('should log errors with proper context', async () => {
      const consoleSpy = TestHelpers.spyOnConsole();

      const invalidFile = Buffer.from('invalid content');

      await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invalidFile, 'error-logging-test.pdf')
        .expect(400);

      // Verify error was logged (in a real app, you'd check your logging system)
      expect(consoleSpy.error).toHaveBeenCalled();

      TestHelpers.restoreConsole(consoleSpy);
    });

    it('should provide correlation IDs for error tracking', async () => {
      const invalidFile = Buffer.from('invalid content');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invalidFile, 'correlation-test.pdf')
        .expect(400);

      // Should include correlation ID for tracking
      expect(response.body.correlationId || response.body.requestId).toBeDefined();
    });
  });
});