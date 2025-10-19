import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import { LoggingMiddleware } from './logging.middleware';
import { LoggerService } from '../logger/logger.service';
import { CorrelationIdUtil } from '../utils/correlation-id.util';

describe('LoggingMiddleware', () => {
  let middleware: LoggingMiddleware;
  let mockLoggerService: Partial<LoggerService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(async () => {
    mockLoggerService = {
      setCorrelationId: jest.fn(),
      clearCorrelationId: jest.fn(),
      log: jest.fn(),
      logApiRequest: jest.fn(),
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingMiddleware,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    middleware = module.get<LoggingMiddleware>(LoggingMiddleware);

    // Mock request object
    mockRequest = {
      method: 'GET',
      url: '/api/users',
      headers: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        const headers = {
          'User-Agent': 'test-agent',
          'Content-Type': 'application/json',
          'Content-Length': '100',
          'Referer': 'http://localhost:3000',
        };
        return headers[header];
      }),
    };

    // Mock response object
    mockResponse = {
      statusCode: 200,
      setHeader: jest.fn(),
      get: jest.fn((header: string) => {
        const headers = {
          'Content-Length': '250',
          'Content-Type': 'application/json',
        };
        return headers[header];
      }),
      end: jest.fn(),
    };

    mockNext = jest.fn();

    // Mock CorrelationIdUtil
    jest.spyOn(CorrelationIdUtil, 'getOrGenerate').mockReturnValue('test-correlation-id');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Request processing', () => {
    it('should set correlation ID and log incoming request', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(CorrelationIdUtil.getOrGenerate).toHaveBeenCalledWith(mockRequest.headers);
      expect(mockLoggerService.setCorrelationId).toHaveBeenCalledWith('test-correlation-id');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'test-correlation-id');
      expect((mockRequest as any).correlationId).toBe('test-correlation-id');
      expect(mockNext).toHaveBeenCalled();

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'GET',
            url: '/api/users',
            userAgent: 'test-agent',
            ip: '127.0.0.1',
          }),
          correlationId: 'test-correlation-id',
        })
      );
    });

    it('should use existing correlation ID from headers', () => {
      const existingCorrelationId = 'existing-correlation-id';
      mockRequest.headers = { 'x-correlation-id': existingCorrelationId };
      jest.spyOn(CorrelationIdUtil, 'getOrGenerate').mockReturnValue(existingCorrelationId);

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.setCorrelationId).toHaveBeenCalledWith(existingCorrelationId);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Correlation-ID', existingCorrelationId);
    });

    it('should log request with query parameters', () => {
      mockRequest.query = { page: '1', limit: '10' };

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            query: { page: '1', limit: '10' },
          }),
        })
      );
    });

    it('should sanitize sensitive data in request body', () => {
      mockRequest.body = {
        username: 'testuser',
        password: 'secret123',
        token: 'jwt-token',
        apiKey: 'api-key-123',
        normalData: 'normal-value',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            body: {
              username: 'testuser',
              password: '[REDACTED]',
              token: '[REDACTED]',
              apiKey: '[REDACTED]',
              normalData: 'normal-value',
            },
          }),
        })
      );
    });

    it('should truncate large request bodies', () => {
      const largeBody = { data: 'x'.repeat(2000) };
      mockRequest.body = largeBody;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            body: expect.objectContaining({
              _truncated: true,
              _originalSize: expect.any(Number),
              _preview: expect.any(String),
            }),
          }),
        })
      );
    });
  });

  describe('Response processing', () => {
    it('should test response logging directly', () => {
      // Test the logOutgoingResponse method directly
      (middleware as any).logOutgoingResponse(mockRequest, mockResponse, 150, 'test-correlation-id');

      expect(mockLoggerService.logApiRequest).toHaveBeenCalledWith(
        'GET',
        '/api/users',
        200,
        150,
        expect.objectContaining({
          response: expect.objectContaining({
            statusCode: 200,
            contentLength: '250',
            contentType: 'application/json',
          }),
          correlationId: 'test-correlation-id',
        })
      );
    });

    it('should log slow requests as warnings', () => {
      // Test slow request logging directly
      (middleware as any).logOutgoingResponse(mockRequest, mockResponse, 2000, 'test-correlation-id');

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'Slow Request: GET /api/users took 2000ms',
        'Performance',
        expect.objectContaining({
          durationMs: 2000,
          correlationId: 'test-correlation-id',
        })
      );
    });

    it('should handle different HTTP status codes', () => {
      const testCases = [
        { statusCode: 200, method: 'GET' },
        { statusCode: 201, method: 'POST' },
        { statusCode: 400, method: 'POST' },
        { statusCode: 500, method: 'GET' },
      ];

      testCases.forEach(({ statusCode, method }) => {
        jest.clearAllMocks();
        mockRequest.method = method;
        mockResponse.statusCode = statusCode;

        (middleware as any).logOutgoingResponse(mockRequest, mockResponse, 100, 'test-correlation-id');

        expect(mockLoggerService.logApiRequest).toHaveBeenCalledWith(
          method,
          '/api/users',
          statusCode,
          100,
          expect.any(Object)
        );
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle request without query parameters', () => {
      delete mockRequest.query;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.not.objectContaining({
            query: expect.anything(),
          }),
        })
      );
    });

    it('should handle request without body', () => {
      delete mockRequest.body;

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            body: undefined,
          }),
        })
      );
    });

    it('should handle non-object request body', () => {
      mockRequest.body = 'string body';

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            body: 'string body',
          }),
        })
      );
    });

    it('should handle missing headers gracefully', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            userAgent: undefined,
            contentType: undefined,
            contentLength: undefined,
            referer: undefined,
          }),
        })
      );
    });

    it('should handle response without headers', () => {
      (mockResponse.get as jest.Mock).mockReturnValue(undefined);

      (middleware as any).logOutgoingResponse(mockRequest, mockResponse, 100, 'test-correlation-id');

      expect(mockLoggerService.logApiRequest).toHaveBeenCalledWith(
        'GET',
        '/api/users',
        200,
        100,
        expect.objectContaining({
          response: expect.objectContaining({
            contentLength: undefined,
            contentType: undefined,
          }),
        })
      );
    });
  });

  describe('Request body sanitization', () => {
    it('should handle nested sensitive fields', () => {
      mockRequest.body = {
        user: {
          username: 'test',
          password: 'secret',
        },
        auth: {
          token: 'jwt-token',
        },
        data: 'normal',
      };

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Note: The current implementation only sanitizes top-level fields
      // This test documents the current behavior
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            body: {
              user: {
                username: 'test',
                password: 'secret', // Not sanitized (nested)
              },
              auth: {
                token: 'jwt-token', // Not sanitized (nested)
              },
              data: 'normal',
            },
          }),
        })
      );
    });

    it('should handle empty request body', () => {
      mockRequest.body = {};

      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Incoming Request: GET /api/users',
        'HTTP',
        expect.objectContaining({
          request: expect.objectContaining({
            body: {},
          }),
        })
      );
    });
  });
});