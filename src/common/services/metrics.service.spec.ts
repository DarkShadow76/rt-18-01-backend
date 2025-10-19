import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { LoggerService } from '../logger/logger.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let mockLoggerService: Partial<LoggerService>;

  beforeEach(async () => {
    mockLoggerService = {
      logMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);

    // Clear timers to prevent interference
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    // Clean up the service to prevent timer leaks
    service.destroy();
  });

  describe('Counter operations', () => {
    it('should increment counter', () => {
      service.incrementCounter('test_counter', 5);
      expect(service.getCounter('test_counter')).toBe(5);

      service.incrementCounter('test_counter', 3);
      expect(service.getCounter('test_counter')).toBe(8);
    });

    it('should increment counter with default value', () => {
      service.incrementCounter('test_counter');
      expect(service.getCounter('test_counter')).toBe(1);
    });

    it('should handle counter with tags', () => {
      service.incrementCounter('http_requests', 1, { method: 'GET', status: '200' });
      service.incrementCounter('http_requests', 1, { method: 'POST', status: '200' });
      service.incrementCounter('http_requests', 1, { method: 'GET', status: '200' });

      expect(service.getCounter('http_requests', { method: 'GET', status: '200' })).toBe(2);
      expect(service.getCounter('http_requests', { method: 'POST', status: '200' })).toBe(1);
    });

    it('should return 0 for non-existent counter', () => {
      expect(service.getCounter('non_existent')).toBe(0);
    });
  });

  describe('Gauge operations', () => {
    it('should set and get gauge values', () => {
      service.setGauge('memory_usage', 256);
      expect(service.getGauge('memory_usage')).toBe(256);

      service.setGauge('memory_usage', 512);
      expect(service.getGauge('memory_usage')).toBe(512);
    });

    it('should handle gauge with tags', () => {
      service.setGauge('cpu_usage', 75, { core: '0' });
      service.setGauge('cpu_usage', 80, { core: '1' });

      expect(service.getGauge('cpu_usage', { core: '0' })).toBe(75);
      expect(service.getGauge('cpu_usage', { core: '1' })).toBe(80);
    });

    it('should return undefined for non-existent gauge', () => {
      expect(service.getGauge('non_existent')).toBeUndefined();
    });
  });

  describe('Histogram operations', () => {
    it('should record histogram values', () => {
      service.recordHistogram('response_time', 100);
      service.recordHistogram('response_time', 200);
      service.recordHistogram('response_time', 150);

      const stats = service.getHistogramStats('response_time');
      expect(stats).toBeDefined();
      expect(stats?.count).toBe(3);
      expect(stats?.sum).toBe(450);
      expect(stats?.avg).toBe(150);
      expect(stats?.min).toBe(100);
      expect(stats?.max).toBe(200);
    });

    it('should calculate percentiles correctly', () => {
      // Add values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        service.recordHistogram('test_histogram', i);
      }

      const stats = service.getHistogramStats('test_histogram');
      expect(stats?.p50).toBeCloseTo(50.5, 1);
      expect(stats?.p95).toBeCloseTo(95.05, 1);
      expect(stats?.p99).toBeCloseTo(99.01, 1);
    });

    it('should handle histogram with tags', () => {
      service.recordHistogram('request_duration', 100, { endpoint: '/api/users' });
      service.recordHistogram('request_duration', 200, { endpoint: '/api/orders' });

      const userStats = service.getHistogramStats('request_duration', { endpoint: '/api/users' });
      const orderStats = service.getHistogramStats('request_duration', { endpoint: '/api/orders' });

      expect(userStats?.count).toBe(1);
      expect(userStats?.avg).toBe(100);
      expect(orderStats?.count).toBe(1);
      expect(orderStats?.avg).toBe(200);
    });

    it('should return undefined for non-existent histogram', () => {
      expect(service.getHistogramStats('non_existent')).toBeUndefined();
    });

    it('should limit histogram values to prevent memory issues', () => {
      // Record more than 1000 values
      for (let i = 0; i < 1500; i++) {
        service.recordHistogram('large_histogram', i);
      }

      const stats = service.getHistogramStats('large_histogram');
      expect(stats?.count).toBe(1000); // Should be limited to 1000
    });
  });

  describe('Application-specific metrics', () => {
    it('should record request duration metrics', () => {
      service.recordRequestDuration('GET', '/api/users', 200, 150);
      service.recordRequestDuration('POST', '/api/users', 201, 250);
      service.recordRequestDuration('GET', '/api/users', 500, 5000);

      // Check histogram
      const durationStats = service.getHistogramStats('http_request_duration_ms', {
        method: 'GET',
        endpoint: '/api/users',
        status_code: '200',
      });
      expect(durationStats?.count).toBe(1);
      expect(durationStats?.avg).toBe(150);

      // Check counter
      expect(service.getCounter('http_requests_total', {
        method: 'GET',
        endpoint: '/api/users',
        status_code: '200',
      })).toBe(1);

      expect(service.getCounter('http_requests_total', {
        method: 'GET',
        endpoint: '/api/users',
        status_code: '500',
      })).toBe(1);
    });

    it('should record database operation metrics', () => {
      service.recordDatabaseOperation('SELECT', 'users', 50, true);
      service.recordDatabaseOperation('INSERT', 'users', 100, false);

      const selectStats = service.getHistogramStats('database_operation_duration_ms', {
        operation: 'SELECT',
        table: 'users',
        success: 'true',
      });
      expect(selectStats?.avg).toBe(50);

      expect(service.getCounter('database_operations_total', {
        operation: 'INSERT',
        table: 'users',
        success: 'false',
      })).toBe(1);
    });

    it('should record external service call metrics', () => {
      service.recordExternalServiceCall('DocumentAI', 'processDocument', 1500, true);
      service.recordExternalServiceCall('DocumentAI', 'processDocument', 3000, false);

      const successStats = service.getHistogramStats('external_service_duration_ms', {
        service: 'DocumentAI',
        operation: 'processDocument',
        success: 'true',
      });
      expect(successStats?.avg).toBe(1500);

      expect(service.getCounter('external_service_calls_total', {
        service: 'DocumentAI',
        operation: 'processDocument',
        success: 'false',
      })).toBe(1);
    });

    it('should record file processing metrics', () => {
      service.recordFileProcessing('pdf', 1024000, 2000, true);
      service.recordFileProcessing('png', 512000, 500, true);

      const processingStats = service.getHistogramStats('file_processing_duration_ms', {
        file_type: 'pdf',
        success: 'true',
      });
      expect(processingStats?.avg).toBe(2000);

      const sizeStats = service.getHistogramStats('file_size_bytes', {
        file_type: 'pdf',
      });
      expect(sizeStats?.avg).toBe(1024000);

      expect(service.getCounter('files_processed_total', {
        file_type: 'png',
        success: 'true',
      })).toBe(1);
    });
  });

  describe('System metrics', () => {
    beforeEach(() => {
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 1000000,
        heapUsed: 500000,
        heapTotal: 800000,
        external: 100000,
        arrayBuffers: 50000,
      });

      jest.spyOn(process, 'cpuUsage').mockReturnValue({
        user: 1000000,
        system: 500000,
      });
    });

    it('should record memory usage', () => {
      service.recordMemoryUsage();

      expect(service.getGauge('memory_usage_rss_bytes')).toBe(1000000);
      expect(service.getGauge('memory_usage_heap_used_bytes')).toBe(500000);
      expect(service.getGauge('memory_usage_heap_total_bytes')).toBe(800000);
      expect(service.getGauge('memory_usage_external_bytes')).toBe(100000);
    });

    it('should record CPU usage', () => {
      service.recordCpuUsage();

      expect(service.getGauge('cpu_usage_user_microseconds')).toBe(1000000);
      expect(service.getGauge('cpu_usage_system_microseconds')).toBe(500000);
    });
  });

  describe('Metrics aggregation', () => {
    it('should get all metrics', () => {
      service.incrementCounter('test_counter', 5);
      service.setGauge('test_gauge', 100);
      service.recordHistogram('test_histogram', 50);
      service.recordHistogram('test_histogram', 150);

      const allMetrics = service.getAllMetrics();

      expect(allMetrics['test_counter']).toEqual(
        expect.objectContaining({
          name: 'test_counter',
          count: 1,
          sum: 5,
          avg: 5,
          min: 5,
          max: 5,
          lastValue: 5,
        })
      );

      expect(allMetrics['test_gauge']).toEqual(
        expect.objectContaining({
          name: 'test_gauge',
          lastValue: 100,
        })
      );

      expect(allMetrics['test_histogram']).toEqual(
        expect.objectContaining({
          name: 'test_histogram',
          count: 2,
          sum: 200,
          avg: 100,
          min: 50,
          max: 150,
        })
      );
    });

    it('should clear old metrics', () => {
      // Mock Date constructor to control time
      const originalDate = global.Date;
      const baseTime = 1000000000000; // Some base timestamp
      
      // Mock Date constructor for new Date() calls
      global.Date = jest.fn(() => new originalDate(baseTime)) as any;
      global.Date.now = jest.fn(() => baseTime);
      Object.setPrototypeOf(global.Date, originalDate);

      service.incrementCounter('old_metric', 1);
      
      // Advance time by 25 hours
      global.Date = jest.fn(() => new originalDate(baseTime + 25 * 60 * 60 * 1000)) as any;
      global.Date.now = jest.fn(() => baseTime + 25 * 60 * 60 * 1000);
      Object.setPrototypeOf(global.Date, originalDate);
      
      service.clearOldMetrics(24); // Clear metrics older than 24 hours

      const allMetrics = service.getAllMetrics();
      expect(allMetrics['old_metric']).toBeUndefined();

      // Restore Date
      global.Date = originalDate;
    });
  });

  describe('Metric key generation', () => {
    it('should generate consistent keys for metrics with tags', () => {
      // Tags should be sorted consistently
      service.incrementCounter('test_metric', 1, { b: '2', a: '1', c: '3' });
      service.incrementCounter('test_metric', 1, { a: '1', c: '3', b: '2' });

      expect(service.getCounter('test_metric', { a: '1', b: '2', c: '3' })).toBe(2);
    });
  });

  describe('Endpoint sanitization', () => {
    it('should sanitize dynamic endpoints', () => {
      service.recordRequestDuration('GET', '/api/users/123', 200, 100);
      service.recordRequestDuration('GET', '/api/users/456', 200, 150);

      // Both should be recorded under the same sanitized endpoint
      const stats = service.getHistogramStats('http_request_duration_ms', {
        method: 'GET',
        endpoint: '/api/users/:id',
        status_code: '200',
      });

      expect(stats?.count).toBe(2);
      expect(stats?.avg).toBe(125);
    });

    it('should sanitize UUID endpoints', () => {
      const originalEndpoint = '/api/invoices/550e8400-e29b-41d4-a716-446655440000';
      service.recordRequestDuration('GET', originalEndpoint, 200, 100);
      
      // Test the sanitization directly first
      const sanitizedEndpoint = (service as any).sanitizeEndpoint(originalEndpoint);
      expect(sanitizedEndpoint).toBe('/api/invoices/:uuid');
      
      // The UUID pattern should be replaced with :uuid
      const stats = service.getHistogramStats('http_request_duration_ms', {
        method: 'GET',
        endpoint: '/api/invoices/:uuid',
        status_code: '200',
      });

      expect(stats?.count).toBe(1);
      expect(stats?.avg).toBe(100);
    });
  });
});