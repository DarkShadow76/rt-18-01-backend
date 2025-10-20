import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { 
  TestHelpers, 
  InvoiceFixtures, 
  DatabaseTestUtils 
} from '../index';

describe('Performance Integration Tests', () => {
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

  describe('Single Invoice Processing Performance', () => {
    it('should process small invoices within acceptable time', async () => {
      const smallInvoice = Buffer.from('%PDF-1.4\nInvoice INV-SMALL-001\nTotal: $100.00\n%%EOF');

      const { result: response, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return request(app.getHttpServer())
          .post('/upload')
          .attach('file', smallInvoice, 'small-invoice.pdf');
      });

      expect(timeMs).toBeLessThan(5000); // Should complete within 5 seconds
      expect([200, 201, 400, 422]).toContain(response.status);
    });

    it('should process medium invoices within acceptable time', async () => {
      // Create a medium-sized invoice (100KB)
      const mediumContent = 'Invoice INV-MEDIUM-001\n'.repeat(3000) + 'Total: $500.00\n';
      const mediumInvoice = Buffer.from(`%PDF-1.4\n${mediumContent}%%EOF`);

      const { result: response, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return request(app.getHttpServer())
          .post('/upload')
          .attach('file', mediumInvoice, 'medium-invoice.pdf');
      });

      expect(timeMs).toBeLessThan(15000); // Should complete within 15 seconds
      expect([200, 201, 400, 422]).toContain(response.status);
    });

    it('should process large invoices within acceptable time', async () => {
      // Create a large invoice (5MB)
      const largeContent = 'Invoice line item detail\n'.repeat(200000);
      const largeInvoice = Buffer.from(`%PDF-1.4\nInvoice INV-LARGE-001\n${largeContent}Total: $10000.00\n%%EOF`);

      const { result: response, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return request(app.getHttpServer())
          .post('/upload')
          .attach('file', largeInvoice, 'large-invoice.pdf')
          .timeout(60000); // 60 second timeout for large files
      });

      expect(timeMs).toBeLessThan(45000); // Should complete within 45 seconds
      expect([200, 201, 400, 413, 422]).toContain(response.status);
    });

    it('should handle maximum allowed file size', async () => {
      // Create file at maximum allowed size (adjust based on your limits)
      const maxSizeInvoice = Buffer.alloc(10 * 1024 * 1024); // 10MB
      maxSizeInvoice.write('%PDF-1.4\n', 0);
      maxSizeInvoice.write('Invoice INV-MAX-SIZE-001\nTotal: $50000.00\n', 10);
      maxSizeInvoice.write('%%EOF', maxSizeInvoice.length - 5);

      const { result: response, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return request(app.getHttpServer())
          .post('/upload')
          .attach('file', maxSizeInvoice, 'max-size-invoice.pdf')
          .timeout(120000); // 2 minute timeout
      });

      expect(timeMs).toBeLessThan(90000); // Should complete within 90 seconds
      expect([200, 201, 413, 422]).toContain(response.status);
    });
  });

  describe('Concurrent Processing Performance', () => {
    it('should handle low concurrency efficiently', async () => {
      const concurrentRequests = 5;
      const invoices = Array.from({ length: concurrentRequests }, (_, i) =>
        Buffer.from(`%PDF-1.4\nInvoice INV-CONCURRENT-LOW-${i}\nTotal: $${100 + i}.00\n%%EOF`)
      );

      const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        const promises = invoices.map((buffer, i) =>
          request(app.getHttpServer())
            .post('/upload')
            .attach('file', buffer, `concurrent-low-${i}.pdf`)
        );
        return Promise.all(promises);
      });

      expect(timeMs).toBeLessThan(30000); // Should complete within 30 seconds
      expect(responses).toHaveLength(concurrentRequests);

      // Most requests should succeed
      const successfulRequests = responses.filter(r => [200, 201].includes(r.status));
      expect(successfulRequests.length).toBeGreaterThan(concurrentRequests * 0.6);
    });

    it('should handle medium concurrency efficiently', async () => {
      const concurrentRequests = 15;
      const invoices = Array.from({ length: concurrentRequests }, (_, i) =>
        Buffer.from(`%PDF-1.4\nInvoice INV-CONCURRENT-MED-${i}\nTotal: $${200 + i}.00\n%%EOF`)
      );

      const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        const promises = invoices.map((buffer, i) =>
          request(app.getHttpServer())
            .post('/upload')
            .attach('file', buffer, `concurrent-med-${i}.pdf`)
        );
        return Promise.all(promises);
      });

      expect(timeMs).toBeLessThan(60000); // Should complete within 60 seconds
      expect(responses).toHaveLength(concurrentRequests);

      // At least half should succeed
      const successfulRequests = responses.filter(r => [200, 201].includes(r.status));
      expect(successfulRequests.length).toBeGreaterThan(concurrentRequests * 0.4);
    });

    it('should handle high concurrency gracefully', async () => {
      const concurrentRequests = 30;
      const invoices = Array.from({ length: concurrentRequests }, (_, i) =>
        Buffer.from(`%PDF-1.4\nInvoice INV-CONCURRENT-HIGH-${i}\nTotal: $${300 + i}.00\n%%EOF`)
      );

      const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        const promises = invoices.map((buffer, i) =>
          request(app.getHttpServer())
            .post('/upload')
            .attach('file', buffer, `concurrent-high-${i}.pdf`)
        );
        return Promise.allSettled(promises);
      });

      expect(timeMs).toBeLessThan(120000); // Should complete within 2 minutes
      expect(responses).toHaveLength(concurrentRequests);

      // Count successful responses
      const successfulResponses = responses.filter(result => 
        result.status === 'fulfilled' && [200, 201].includes(result.value.status)
      );

      // Should handle at least some requests successfully
      expect(successfulResponses.length).toBeGreaterThan(0);

      // Should not have too many failures
      const failedResponses = responses.filter(result => result.status === 'rejected');
      expect(failedResponses.length).toBeLessThan(concurrentRequests * 0.5);
    });

    it('should maintain performance under sustained load', async () => {
      const batchSize = 10;
      const numberOfBatches = 3;
      const results = [];

      for (let batch = 0; batch < numberOfBatches; batch++) {
        const invoices = Array.from({ length: batchSize }, (_, i) =>
          Buffer.from(`%PDF-1.4\nInvoice INV-SUSTAINED-${batch}-${i}\nTotal: $${100 + i}.00\n%%EOF`)
        );

        const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
          const promises = invoices.map((buffer, i) =>
            request(app.getHttpServer())
              .post('/upload')
              .attach('file', buffer, `sustained-${batch}-${i}.pdf`)
          );
          return Promise.all(promises);
        });

        results.push({ batch, timeMs, responses });

        // Brief pause between batches
        await TestHelpers.wait(2000);
      }

      // Performance should not degrade significantly across batches
      const times = results.map(r => r.timeMs);
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      
      times.forEach(time => {
        expect(time).toBeLessThan(avgTime * 2); // No batch should take more than 2x average
      });

      // Overall success rate should be maintained
      const totalRequests = results.reduce((sum, r) => sum + r.responses.length, 0);
      const totalSuccesses = results.reduce((sum, r) => 
        sum + r.responses.filter(resp => [200, 201].includes(resp.status)).length, 0
      );

      expect(totalSuccesses / totalRequests).toBeGreaterThan(0.5);
    });
  });

  describe('Memory Usage Performance', () => {
    it('should handle multiple large files without memory issues', async () => {
      const largeFileSize = 2 * 1024 * 1024; // 2MB each
      const numberOfFiles = 5;

      const largeFiles = Array.from({ length: numberOfFiles }, (_, i) => {
        const buffer = Buffer.alloc(largeFileSize);
        buffer.write(`%PDF-1.4\nLarge Invoice ${i}\n`, 0);
        buffer.write(`Total: $${1000 + i}.00\n%%EOF`, largeFileSize - 50);
        return buffer;
      });

      const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        // Process files sequentially to test memory cleanup
        const results = [];
        for (let i = 0; i < largeFiles.length; i++) {
          const response = await request(app.getHttpServer())
            .post('/upload')
            .attach('file', largeFiles[i], `large-memory-${i}.pdf`)
            .timeout(60000);
          results.push(response);
          
          // Small delay to allow garbage collection
          await TestHelpers.wait(1000);
        }
        return results;
      });

      expect(timeMs).toBeLessThan(300000); // Should complete within 5 minutes
      expect(responses).toHaveLength(numberOfFiles);

      // Should handle all files without memory errors
      const memoryErrors = responses.filter(r => r.status === 500 && 
        r.body.message?.toLowerCase().includes('memory'));
      expect(memoryErrors).toHaveLength(0);
    });

    it('should handle rapid file uploads without memory leaks', async () => {
      const numberOfUploads = 20;
      const smallFiles = Array.from({ length: numberOfUploads }, (_, i) =>
        Buffer.from(`%PDF-1.4\nInvoice INV-RAPID-${i}\nTotal: $${50 + i}.00\n%%EOF`)
      );

      const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        const promises = smallFiles.map((buffer, i) =>
          request(app.getHttpServer())
            .post('/upload')
            .attach('file', buffer, `rapid-${i}.pdf`)
        );
        return Promise.all(promises);
      });

      expect(timeMs).toBeLessThan(60000); // Should complete within 60 seconds
      expect(responses).toHaveLength(numberOfUploads);

      // Should not have memory-related failures
      const successfulUploads = responses.filter(r => [200, 201].includes(r.status));
      expect(successfulUploads.length).toBeGreaterThan(numberOfUploads * 0.7);
    });
  });

  describe('Database Performance', () => {
    it('should handle bulk invoice creation efficiently', async () => {
      const numberOfInvoices = 50;
      const invoices = Array.from({ length: numberOfInvoices }, (_, i) =>
        Buffer.from(`%PDF-1.4\nInvoice INV-BULK-${i}\nTotal: $${100 + i}.00\n%%EOF`)
      );

      const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        // Process in smaller batches to avoid overwhelming the system
        const batchSize = 10;
        const results = [];
        
        for (let i = 0; i < invoices.length; i += batchSize) {
          const batch = invoices.slice(i, i + batchSize);
          const batchPromises = batch.map((buffer, j) =>
            request(app.getHttpServer())
              .post('/upload')
              .attach('file', buffer, `bulk-${i + j}.pdf`)
          );
          
          const batchResults = await Promise.all(batchPromises);
          results.push(...batchResults);
          
          // Small delay between batches
          await TestHelpers.wait(500);
        }
        
        return results;
      });

      expect(timeMs).toBeLessThan(180000); // Should complete within 3 minutes
      expect(responses).toHaveLength(numberOfInvoices);

      // Most should succeed
      const successfulUploads = responses.filter(r => [200, 201].includes(r.status));
      expect(successfulUploads.length).toBeGreaterThan(numberOfInvoices * 0.6);
    });

    it('should handle complex queries efficiently', async () => {
      // First, create some test data
      const setupInvoices = Array.from({ length: 20 }, (_, i) =>
        Buffer.from(`%PDF-1.4\nInvoice INV-QUERY-${i}\nTotal: $${100 + (i * 50)}.00\n%%EOF`)
      );

      // Upload test invoices
      await Promise.all(setupInvoices.map((buffer, i) =>
        request(app.getHttpServer())
          .post('/upload')
          .attach('file', buffer, `query-setup-${i}.pdf`)
      ));

      // Wait for processing
      await TestHelpers.wait(5000);

      // Test query performance (this would require implementing query endpoints)
      const { result: response, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return request(app.getHttpServer())
          .get('/invoices')
          .query({ status: 'completed', minAmount: 200, maxAmount: 800 });
      });

      expect(timeMs).toBeLessThan(5000); // Query should complete within 5 seconds
      
      if (response.status === 200) {
        expect(response.body.data).toBeDefined();
      }
    });
  });

  describe('Resource Utilization Performance', () => {
    it('should handle CPU-intensive operations efficiently', async () => {
      // Create invoices with complex content that requires more processing
      const complexInvoices = Array.from({ length: 10 }, (_, i) => {
        const complexContent = Array.from({ length: 1000 }, (_, j) =>
          `Line item ${j}: Product ${j} - Quantity: ${j + 1} - Price: $${(j + 1) * 10}.00`
        ).join('\n');
        
        return Buffer.from(`%PDF-1.4\nInvoice INV-COMPLEX-${i}\n${complexContent}\nTotal: $${10000 + i}.00\n%%EOF`);
      });

      const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        const promises = complexInvoices.map((buffer, i) =>
          request(app.getHttpServer())
            .post('/upload')
            .attach('file', buffer, `complex-${i}.pdf`)
            .timeout(60000)
        );
        return Promise.all(promises);
      });

      expect(timeMs).toBeLessThan(120000); // Should complete within 2 minutes
      expect(responses).toHaveLength(10);

      // Should handle complex processing
      const successfulUploads = responses.filter(r => [200, 201].includes(r.status));
      expect(successfulUploads.length).toBeGreaterThan(5);
    });

    it('should maintain responsiveness under load', async () => {
      // Start background load
      const backgroundLoad = Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .post('/upload')
          .attach('file', Buffer.from(`%PDF-1.4\nBackground ${i}\n%%EOF`), `bg-${i}.pdf`)
      );

      // Test responsiveness during load
      const { result: response, timeMs } = await TestHelpers.measureExecutionTime(async () => {
        return request(app.getHttpServer())
          .get('/health');
      });

      expect(timeMs).toBeLessThan(5000); // Health check should remain responsive
      expect(response.status).toBe(200);

      // Wait for background load to complete
      await Promise.allSettled(backgroundLoad);
    });
  });

  describe('Scalability Tests', () => {
    it('should demonstrate linear scaling characteristics', async () => {
      const testSizes = [5, 10, 20];
      const results = [];

      for (const size of testSizes) {
        const invoices = Array.from({ length: size }, (_, i) =>
          Buffer.from(`%PDF-1.4\nInvoice INV-SCALE-${size}-${i}\nTotal: $${100 + i}.00\n%%EOF`)
        );

        const { result: responses, timeMs } = await TestHelpers.measureExecutionTime(async () => {
          const promises = invoices.map((buffer, i) =>
            request(app.getHttpServer())
              .post('/upload')
              .attach('file', buffer, `scale-${size}-${i}.pdf`)
          );
          return Promise.all(promises);
        });

        results.push({
          size,
          timeMs,
          successRate: responses.filter(r => [200, 201].includes(r.status)).length / size
        });

        // Clean up between tests
        await TestHelpers.wait(2000);
      }

      // Analyze scaling characteristics
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];
        
        // Time should scale reasonably (not exponentially)
        const timeRatio = curr.timeMs / prev.timeMs;
        const sizeRatio = curr.size / prev.size;
        
        expect(timeRatio).toBeLessThan(sizeRatio * 2); // Should not be worse than 2x linear scaling
      }

      // Success rate should remain reasonable
      results.forEach(result => {
        expect(result.successRate).toBeGreaterThan(0.5);
      });
    });
  });
});