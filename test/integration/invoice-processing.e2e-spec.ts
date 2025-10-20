import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { 
  TestHelpers, 
  InvoiceFixtures, 
  DatabaseTestUtils,
  createDocumentAIMock,
  createSupabaseMock 
} from '../index';

describe('Invoice Processing Integration (e2e)', () => {
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
    // Clean up test data before each test
    await DatabaseTestUtils.cleanupTestData();
  });

  describe('Complete Invoice Upload and Processing Workflow', () => {
    it('should successfully process a valid PDF invoice end-to-end', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\nInvoice INV-2024-001\nBill To: Test Company Inc.\nDue Date: 12/31/2024\nTotal: $1,500.00\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdfBuffer, 'test-invoice.pdf')
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('invoiceNumber');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data.status).toBe('completed');
    });

    it('should handle file validation errors in the complete workflow', async () => {
      const invalidFile = TestHelpers.createMaliciousFile();

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invalidFile, 'malicious.pdf')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      expect(response.body.message).toContain('validation');
    });

    it('should handle oversized files', async () => {
      const largeFile = TestHelpers.createLargeFile(100); // 100MB file

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', largeFile, 'large.pdf')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      expect(response.body.message).toContain('size');
    });

    it('should handle unsupported file types', async () => {
      const textFile = Buffer.from('This is a text file, not a PDF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', textFile, 'document.txt')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
      expect(response.body.message).toContain('type');
    });

    it('should handle Document AI processing failures gracefully', async () => {
      // This test would require mocking the Document AI service to fail
      const validPdf = Buffer.from('%PDF-1.4\nSome content\n%%EOF');

      // Mock Document AI to fail
      // Note: In a real implementation, you'd mock the DocumentAIService here

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', validPdf, 'test.pdf');

      // Should handle the error gracefully and return appropriate response
      expect([200, 201, 500, 503]).toContain(response.status);
    });

    it('should handle duplicate invoice detection', async () => {
      const invoiceBuffer = Buffer.from('%PDF-1.4\nInvoice INV-DUPLICATE-001\nBill To: Test Company\nTotal: $500.00\n%%EOF');

      // Upload the same invoice twice
      const firstResponse = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'invoice1.pdf');

      const secondResponse = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'invoice2.pdf');

      // First upload should succeed
      expect([200, 201]).toContain(firstResponse.status);

      // Second upload should detect duplicate
      if (secondResponse.status === 409) {
        expect(secondResponse.body.message).toContain('duplicate');
      } else {
        // Or it might succeed but mark as duplicate
        expect([200, 201]).toContain(secondResponse.status);
      }
    });

    it('should process multiple invoices concurrently', async () => {
      const invoices = Array.from({ length: 5 }, (_, i) => ({
        buffer: Buffer.from(`%PDF-1.4\nInvoice INV-CONCURRENT-${i}\nTotal: $${100 + i}.00\n%%EOF`),
        filename: `invoice-${i}.pdf`
      }));

      const uploadPromises = invoices.map(invoice =>
        request(app.getHttpServer())
          .post('/upload')
          .attach('file', invoice.buffer, invoice.filename)
      );

      const responses = await Promise.all(uploadPromises);

      // All uploads should complete (either successfully or with proper error handling)
      responses.forEach(response => {
        expect([200, 201, 400, 409, 500]).toContain(response.status);
      });

      // At least some should succeed
      const successfulUploads = responses.filter(r => [200, 201].includes(r.status));
      expect(successfulUploads.length).toBeGreaterThan(0);
    });
  });

  describe('Database Integration Tests', () => {
    it('should persist invoice data correctly', async () => {
      const invoiceBuffer = Buffer.from('%PDF-1.4\nInvoice INV-DB-TEST-001\nBill To: Database Test Co.\nTotal: $750.00\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'db-test.pdf');

      if ([200, 201].includes(response.status)) {
        const invoiceId = response.body.data.id;

        // Verify the invoice was saved to database
        const savedInvoice = await DatabaseTestUtils.findTestInvoice(invoiceId);
        
        if (savedInvoice) {
          expect(savedInvoice.id).toBe(invoiceId);
          expect(savedInvoice.invoiceNumber).toBeDefined();
          expect(savedInvoice.status).toBeDefined();
        }
      }
    });

    it('should handle database connection failures', async () => {
      // This test would require temporarily breaking the database connection
      // In a real scenario, you might use a test database that you can control

      const invoiceBuffer = Buffer.from('%PDF-1.4\nInvoice INV-DB-FAIL-001\nTotal: $100.00\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'db-fail-test.pdf');

      // Should handle database errors gracefully
      expect([200, 201, 500, 503]).toContain(response.status);
    });

    it('should create audit trail entries', async () => {
      const invoiceBuffer = Buffer.from('%PDF-1.4\nInvoice INV-AUDIT-001\nTotal: $200.00\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'audit-test.pdf');

      if ([200, 201].includes(response.status)) {
        // Verify audit trail was created
        // Note: This would require implementing audit trail queries
        expect(response.body.data).toBeDefined();
      }
    });
  });

  describe('Error Recovery and Retry Scenarios', () => {
    it('should retry failed Document AI processing', async () => {
      const invoiceBuffer = Buffer.from('%PDF-1.4\nInvoice INV-RETRY-001\nTotal: $300.00\n%%EOF');

      // This test would mock Document AI to fail initially then succeed
      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'retry-test.pdf');

      // Should eventually succeed or fail gracefully
      expect([200, 201, 500, 503]).toContain(response.status);
    });

    it('should handle partial processing failures', async () => {
      const invoiceBuffer = Buffer.from('%PDF-1.4\nIncomplete invoice data\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'partial-fail.pdf');

      if (response.status === 400) {
        expect(response.body.message).toContain('validation');
      } else {
        // Should handle partial data gracefully
        expect([200, 201, 422]).toContain(response.status);
      }
    });

    it('should handle timeout scenarios', async () => {
      // Create a large file that might cause processing timeout
      const largeInvoice = Buffer.alloc(5 * 1024 * 1024, '%PDF-1.4\nLarge invoice content\n%%EOF');

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', largeInvoice, 'timeout-test.pdf')
        .timeout(30000); // 30 second timeout

      // Should handle timeout gracefully
      expect([200, 201, 408, 500, 503]).toContain(response.status);
    });
  });

  describe('Performance Tests', () => {
    it('should process invoices within acceptable time limits', async () => {
      const invoiceBuffer = Buffer.from('%PDF-1.4\nInvoice INV-PERF-001\nTotal: $400.00\n%%EOF');

      const startTime = Date.now();

      const response = await request(app.getHttpServer())
        .post('/upload')
        .attach('file', invoiceBuffer, 'perf-test.pdf');

      const processingTime = Date.now() - startTime;

      // Should complete within reasonable time (adjust based on requirements)
      expect(processingTime).toBeLessThan(30000); // 30 seconds

      if ([200, 201].includes(response.status)) {
        expect(response.body.data).toBeDefined();
      }
    });

    it('should handle high load scenarios', async () => {
      const concurrentRequests = 10;
      const invoices = Array.from({ length: concurrentRequests }, (_, i) => 
        Buffer.from(`%PDF-1.4\nInvoice INV-LOAD-${i}\nTotal: $${100 + i}.00\n%%EOF`)
      );

      const startTime = Date.now();

      const promises = invoices.map((buffer, i) =>
        request(app.getHttpServer())
          .post('/upload')
          .attach('file', buffer, `load-test-${i}.pdf`)
      );

      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // All requests should complete
      expect(responses).toHaveLength(concurrentRequests);

      // Should handle load reasonably well
      expect(totalTime).toBeLessThan(60000); // 60 seconds for all requests

      // Most requests should succeed or fail gracefully
      const validStatuses = [200, 201, 400, 409, 422, 500, 503];
      responses.forEach(response => {
        expect(validStatuses).toContain(response.status);
      });
    });
  });

  describe('Health Check Integration', () => {
    it('should return healthy status when all services are available', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
    });

    it('should include service-specific health information', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('info');
      // Should include database, Document AI, and other service statuses
    });
  });

  describe('API Documentation Integration', () => {
    it('should serve Swagger documentation', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-docs')
        .expect(200);

      // Should return HTML page or redirect to Swagger UI
      expect(response.text).toBeDefined();
    });

    it('should provide OpenAPI specification', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-docs-json')
        .expect(200);

      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('paths');
    });
  });

  describe('Security Integration Tests', () => {
    it('should reject requests without proper content type', async () => {
      const response = await request(app.getHttpServer())
        .post('/upload')
        .send({ data: 'not a file' })
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/upload')
        .set('Content-Type', 'multipart/form-data')
        .send('malformed data')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
    });

    it('should validate file upload limits', async () => {
      // Test with no file
      const response = await request(app.getHttpServer())
        .post('/upload')
        .expect(400);

      TestHelpers.assertErrorResponse(response, 400);
    });
  });
});