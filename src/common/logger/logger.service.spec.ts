import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { LoggerService, PerformanceMetrics, SecurityEvent, DatabaseMetrics } from './logger.service';
import { ConfigurationService } from '../../config/configuration.service';

// Mock Winston logger
const mockWinstonLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  log: jest.fn(),
};

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockWinstonLogger),
  format: {
    combine: jest.fn(() => ({})),
    timestamp: jest.fn(() => ({})),
    errors: jest.fn(() => ({})),
    json: jest.fn(() => ({})),
    colorize: jest.fn(() => ({})),
    printf: jest.fn(() => ({})),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

describe('LoggerService', () => {
  let service: LoggerService;
  let configService: ConfigurationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env.test',
          isGlobal: true,
        }),
      ],
      providers: [
        LoggerService,
        {
          provide: ConfigurationService,
          useValue: {
            logging: {
              level: 'info',
              enableConsole: true,
              enableFile: true,
            },
          },
        },
      ],
    }).compile();

    service = module.get<LoggerService>(LoggerService);
    configService = module.get<ConfigurationService>(ConfigurationService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Basic logging methods', () => {
    it('should log info messages with correlation ID', () => {
      const correlationId = 'test-correlation-id';
      service.setCorrelationId(correlationId);

      service.log('Test message', 'TestContext', { extra: 'data' });

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test message', {
        context: 'TestContext',
        correlationId,
        extra: 'data',
      });
    });

    it('should log error messages with stack trace', () => {
      const correlationId = 'test-correlation-id';
      service.setCorrelationId(correlationId);

      service.error('Error message', 'Stack trace', 'ErrorContext', { errorCode: 'E001' });

      expect(mockWinstonLogger.error).toHaveBeenCalledWith('Error message', {
        context: 'ErrorContext',
        correlationId,
        stack: 'Stack trace',
        errorCode: 'E001',
      });
    });

    it('should log warning messages', () => {
      service.warn('Warning message', 'WarnContext', { level: 'medium' });

      expect(mockWinstonLogger.warn).toHaveBeenCalledWith('Warning message', {
        context: 'WarnContext',
        correlationId: undefined,
        level: 'medium',
      });
    });

    it('should log debug messages', () => {
      service.debug('Debug message', 'DebugContext');

      expect(mockWinstonLogger.debug).toHaveBeenCalledWith('Debug message', {
        context: 'DebugContext',
        correlationId: undefined,
      });
    });
  });

  describe('Correlation ID management', () => {
    it('should set and clear correlation ID', () => {
      const correlationId = 'test-correlation-id';
      
      service.setCorrelationId(correlationId);
      service.log('Test message');
      
      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test message', {
        context: undefined,
        correlationId,
      });

      service.clearCorrelationId();
      service.log('Another message');

      expect(mockWinstonLogger.info).toHaveBeenLastCalledWith('Another message', {
        context: undefined,
        correlationId: undefined,
      });
    });
  });

  describe('Performance monitoring', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(process, 'cpuUsage').mockReturnValue({ user: 1000, system: 500 });
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 1000000,
        heapUsed: 500000,
        heapTotal: 800000,
        external: 100000,
        arrayBuffers: 50000,
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start and end performance timer', () => {
      const operationId = 'test-operation';
      const operation = 'TestOperation';

      service.startPerformanceTimer(operationId);
      
      // Advance time by 1000ms
      jest.advanceTimersByTime(1000);
      
      const metrics = service.endPerformanceTimer(operationId, operation, 'TestContext');

      expect(metrics).toBeDefined();
      expect(metrics?.operation).toBe(operation);
      expect(metrics?.durationMs).toBe(1000);
      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'debug',
        `Performance: ${operation} completed in 1000ms`,
        expect.objectContaining({
          context: 'TestContext',
          performance: expect.objectContaining({
            operation,
            durationMs: 1000,
          }),
        })
      );
    });

    it('should handle missing performance timer', () => {
      const result = service.endPerformanceTimer('non-existent', 'TestOperation');

      expect(result).toBeNull();
      expect(mockWinstonLogger.warn).toHaveBeenCalledWith(
        'Performance timer not found for operation: non-existent',
        { context: undefined, correlationId: undefined }
      );
    });

    it('should log performance with appropriate log level based on duration', () => {
      const testCases = [
        { durationMs: 500, expectedLevel: 'debug' },
        { durationMs: 1500, expectedLevel: 'info' },
        { durationMs: 3000, expectedLevel: 'warn' },
        { durationMs: 6000, expectedLevel: 'error' },
      ];

      testCases.forEach(({ durationMs, expectedLevel }) => {
        const metrics: PerformanceMetrics = {
          operation: 'TestOperation',
          durationMs,
          startTime: new Date(),
          endTime: new Date(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: { user: 1000, system: 500 },
        };

        service.logPerformance(metrics);

        expect(mockWinstonLogger.log).toHaveBeenCalledWith(
          expectedLevel,
          `Performance: TestOperation completed in ${durationMs}ms`,
          expect.any(Object)
        );
      });
    });
  });

  describe('Security event logging', () => {
    it('should log security events with appropriate log level', () => {
      const testCases = [
        { severity: 'low' as const, expectedLevel: 'info' },
        { severity: 'medium' as const, expectedLevel: 'warn' },
        { severity: 'high' as const, expectedLevel: 'error' },
        { severity: 'critical' as const, expectedLevel: 'error' },
      ];

      testCases.forEach(({ severity, expectedLevel }) => {
        const securityEvent: SecurityEvent = {
          type: 'SUSPICIOUS_ACTIVITY',
          severity,
          source: 'TestSource',
          details: { ip: '192.168.1.1' },
          timestamp: new Date(),
        };

        service.logSecurityEvent(securityEvent, 'SecurityContext');

        expect(mockWinstonLogger.log).toHaveBeenCalledWith(
          expectedLevel,
          `Security Event: SUSPICIOUS_ACTIVITY - ${severity.toUpperCase()}`,
          expect.objectContaining({
            context: 'SecurityContext',
            security: expect.objectContaining({
              type: 'SUSPICIOUS_ACTIVITY',
              severity,
              source: 'TestSource',
            }),
          })
        );
      });
    });
  });

  describe('Database operation logging', () => {
    it('should log successful database operations', () => {
      const metrics: DatabaseMetrics = {
        operation: 'SELECT',
        table: 'invoices',
        durationMs: 150,
        rowsAffected: 5,
        success: true,
      };

      service.logDatabaseOperation(metrics, 'DatabaseContext');

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'debug',
        'Database: SELECT on invoices - SUCCESS (150ms)',
        expect.objectContaining({
          context: 'DatabaseContext',
          database: expect.objectContaining({
            operation: 'SELECT',
            table: 'invoices',
            durationMs: 150,
            rowsAffected: 5,
            success: true,
          }),
        })
      );
    });

    it('should log failed database operations', () => {
      const metrics: DatabaseMetrics = {
        operation: 'INSERT',
        table: 'invoices',
        durationMs: 300,
        success: false,
      };

      service.logDatabaseOperation(metrics, 'DatabaseContext');

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'error',
        'Database: INSERT on invoices - FAILED (300ms)',
        expect.objectContaining({
          database: expect.objectContaining({
            success: false,
          }),
        })
      );
    });
  });

  describe('API request logging', () => {
    it('should log API requests with appropriate log level', () => {
      const testCases = [
        { statusCode: 200, expectedLevel: 'info' },
        { statusCode: 400, expectedLevel: 'warn' },
        { statusCode: 500, expectedLevel: 'error' },
      ];

      testCases.forEach(({ statusCode, expectedLevel }) => {
        service.logApiRequest('POST', '/api/upload', statusCode, 250);

        expect(mockWinstonLogger.log).toHaveBeenCalledWith(
          expectedLevel,
          `API Request: POST /api/upload - ${statusCode} (250ms)`,
          expect.objectContaining({
            api: expect.objectContaining({
              method: 'POST',
              url: '/api/upload',
              statusCode,
              durationMs: 250,
            }),
          })
        );
      });
    });
  });

  describe('Business event logging', () => {
    it('should log business events', () => {
      service.logBusinessEvent('INVOICE_PROCESSED', 'Invoice', 'inv-123', 'process');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Business Event: INVOICE_PROCESSED',
        expect.objectContaining({
          business: expect.objectContaining({
            event: 'INVOICE_PROCESSED',
            entity: 'Invoice',
            entityId: 'inv-123',
            action: 'process',
          }),
        })
      );
    });
  });

  describe('External service call logging', () => {
    it('should log successful external service calls', () => {
      service.logExternalServiceCall('DocumentAI', 'processDocument', 1500, true);

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'info',
        'External Service: DocumentAI.processDocument - SUCCESS (1500ms)',
        expect.objectContaining({
          externalService: expect.objectContaining({
            service: 'DocumentAI',
            operation: 'processDocument',
            durationMs: 1500,
            success: true,
          }),
        })
      );
    });

    it('should log failed external service calls', () => {
      service.logExternalServiceCall('DocumentAI', 'processDocument', 5000, false);

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'error',
        'External Service: DocumentAI.processDocument - FAILED (5000ms)',
        expect.objectContaining({
          externalService: expect.objectContaining({
            success: false,
          }),
        })
      );
    });
  });

  describe('Audit logging', () => {
    it('should log audit events', () => {
      const changes = { status: { from: 'pending', to: 'completed' } };
      
      service.logAuditEvent('user-123', 'UPDATE', 'Invoice', 'inv-456', changes);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Audit: UPDATE on Invoice',
        expect.objectContaining({
          audit: expect.objectContaining({
            userId: 'user-123',
            action: 'UPDATE',
            resource: 'Invoice',
            resourceId: 'inv-456',
            changes,
          }),
        })
      );
    });
  });

  describe('Health check logging', () => {
    it('should log healthy components', () => {
      service.logHealthCheck('Database', 'healthy', { responseTime: 50 });

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'debug',
        'Health Check: Database - HEALTHY',
        expect.objectContaining({
          health: expect.objectContaining({
            component: 'Database',
            status: 'healthy',
            details: { responseTime: 50 },
          }),
        })
      );
    });

    it('should log unhealthy components', () => {
      service.logHealthCheck('ExternalAPI', 'unhealthy', { error: 'Connection timeout' });

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'error',
        'Health Check: ExternalAPI - UNHEALTHY',
        expect.objectContaining({
          health: expect.objectContaining({
            component: 'ExternalAPI',
            status: 'unhealthy',
            details: { error: 'Connection timeout' },
          }),
        })
      );
    });
  });

  describe('Configuration logging', () => {
    it('should log successful configuration loading', () => {
      service.logConfigurationLoad('DatabaseConfig', true, { tables: 5 });

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'info',
        'Configuration: DatabaseConfig - LOADED',
        expect.objectContaining({
          configuration: expect.objectContaining({
            name: 'DatabaseConfig',
            success: true,
            details: { tables: 5 },
          }),
        })
      );
    });

    it('should log failed configuration loading', () => {
      service.logConfigurationLoad('InvalidConfig', false, { error: 'Missing required field' });

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        'error',
        'Configuration: InvalidConfig - FAILED',
        expect.objectContaining({
          configuration: expect.objectContaining({
            success: false,
          }),
        })
      );
    });
  });

  describe('Metrics logging', () => {
    it('should log application metrics', () => {
      const metrics = {
        'http_requests_total': 1500,
        'database_connections': 10,
        'memory_usage_mb': 256,
      };

      service.logMetrics(metrics, 'MetricsContext');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Application Metrics',
        expect.objectContaining({
          context: 'MetricsContext',
          metrics: expect.objectContaining({
            'http_requests_total': 1500,
            'database_connections': 10,
            'memory_usage_mb': 256,
            timestamp: expect.any(String),
          }),
        })
      );
    });
  });
});