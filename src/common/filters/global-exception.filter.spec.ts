import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { GlobalExceptionFilter } from './global-exception.filter';
import { AppError } from '../errors/app-error';
import { ErrorType } from '../dto/upload-invoice.dto';
import { CorrelationIdUtil } from '../utils/correlation-id.util';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockArgumentsHost: Partial<ArgumentsHost>;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);

    // Mock request object
    mockRequest = {
      method: 'POST',
      url: '/api/upload',
      headers: {},
      query: {},
      body: { test: 'data' },
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
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Mock ArgumentsHost
    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };

    // Spy on logger methods
    loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AppError handling', () => {
    it('should handle AppError with all properties', () => {
      const correlationId = 'test-correlation-id';
      const appError = new AppError(
        ErrorType.VALIDATION_ERROR,
        'Test validation error',
        400,
        { field: 'test' },
        correlationId,
      );

      filter.catch(appError, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.VALIDATION_ERROR,
          message: 'Test validation error',
          details: { field: 'test' },
          correlationId,
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle AppError without correlation ID', () => {
      const appError = AppError.processingError('Processing failed', { code: 'PROC_001' });
      jest.spyOn(CorrelationIdUtil, 'getOrGenerate').mockReturnValue('generated-id');

      filter.catch(appError, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: 'Processing failed',
          details: { code: 'PROC_001' },
          correlationId: 'generated-id',
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle different AppError types correctly', () => {
      const testCases = [
        {
          error: AppError.validationError('Invalid input'),
          expectedStatus: 400,
          expectedType: ErrorType.VALIDATION_ERROR,
        },
        {
          error: AppError.databaseError('DB connection failed'),
          expectedStatus: 500,
          expectedType: ErrorType.DATABASE_ERROR,
        },
        {
          error: AppError.externalServiceError('API unavailable'),
          expectedStatus: 502,
          expectedType: ErrorType.EXTERNAL_SERVICE_ERROR,
        },
        {
          error: AppError.duplicateError('Duplicate entry'),
          expectedStatus: 409,
          expectedType: ErrorType.DUPLICATE_ERROR,
        },
      ];

      testCases.forEach(({ error, expectedStatus, expectedType }) => {
        jest.clearAllMocks();
        filter.catch(error, mockArgumentsHost as ArgumentsHost);

        expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              type: expectedType,
            }),
          }),
        );
      });
    });
  });

  describe('HttpException handling', () => {
    it('should handle HttpException with custom error format', () => {
      const httpException = new HttpException(
        {
          type: ErrorType.VALIDATION_ERROR,
          message: 'Custom validation error',
          details: { field: 'email' },
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(httpException, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.VALIDATION_ERROR,
          message: 'Custom validation error',
          details: { field: 'email' },
          correlationId: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle NestJS validation pipe errors', () => {
      const validationException = new HttpException(
        {
          message: ['email should not be empty', 'password must be a string'],
          error: 'Bad Request',
          statusCode: 400,
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(validationException, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.VALIDATION_ERROR,
          message: 'Validation failed',
          details: {
            validationErrors: ['email should not be empty', 'password must be a string'],
          },
          correlationId: expect.any(String),
          fieldErrors: {
            email: ['email should not be empty'],
            password: ['password must be a string'],
          },
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle simple HttpException', () => {
      const httpException = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(httpException, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.VALIDATION_ERROR,
          message: 'Not found',
          correlationId: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('Standard Error handling', () => {
    it('should handle standard JavaScript Error in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Standard error');
      error.stack = 'Error stack trace';

      filter.catch(error, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: 'Standard error',
          details: { stack: 'Error stack trace' },
          correlationId: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle standard JavaScript Error in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Standard error');

      filter.catch(error, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: 'Internal server error',
          correlationId: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('Unknown error handling', () => {
    it('should handle unknown error types in development', () => {
      process.env.NODE_ENV = 'development';
      const unknownError = 'string error';

      filter.catch(unknownError, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: 'Internal server error',
          details: { originalError: 'string error' },
          correlationId: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle unknown error types in production', () => {
      process.env.NODE_ENV = 'production';
      const unknownError = { custom: 'error' };

      filter.catch(unknownError, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: 'Internal server error',
          correlationId: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('Correlation ID handling', () => {
    it('should use correlation ID from request headers', () => {
      const correlationId = 'header-correlation-id';
      mockRequest.headers = { 'x-correlation-id': correlationId };
      jest.spyOn(CorrelationIdUtil, 'getOrGenerate').mockReturnValue(correlationId);

      const error = new Error('Test error');
      filter.catch(error, mockArgumentsHost as ArgumentsHost);

      expect(CorrelationIdUtil.getOrGenerate).toHaveBeenCalledWith(mockRequest.headers);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            correlationId,
          }),
        }),
      );
    });
  });

  describe('Logging behavior', () => {
    it('should log errors with status >= 500 as error level', () => {
      const error = new Error('Server error');
      filter.catch(error, mockArgumentsHost as ArgumentsHost);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Server error'),
        expect.objectContaining({
          stack: expect.any(String),
          context: expect.any(Object),
        }),
      );
    });

    it('should log errors with status 400-499 as warn level', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const error = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
      filter.catch(error, mockArgumentsHost as ArgumentsHost);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Bad request'),
        expect.objectContaining({
          context: expect.any(Object),
        }),
      );
    });

    it('should sanitize sensitive data in request body', () => {
      mockRequest.body = {
        username: 'test',
        password: 'secret123',
        token: 'jwt-token',
        data: 'normal-data',
      };

      const error = new Error('Test error');
      filter.catch(error, mockArgumentsHost as ArgumentsHost);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          context: expect.objectContaining({
            body: {
              username: 'test',
              password: '[REDACTED]',
              token: '[REDACTED]',
              data: 'normal-data',
            },
          }),
        }),
      );
    });

    it('should log security events for suspicious activities', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      mockRequest.url = '/upload';
      mockRequest.query = { id: 'SELECT * FROM users' };

      const error = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
      filter.catch(error, mockArgumentsHost as ArgumentsHost);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SECURITY]'),
        expect.objectContaining({
          events: expect.arrayContaining(['SUSPICIOUS_UPLOAD_ATTEMPT', 'POTENTIAL_SQL_INJECTION']),
        }),
      );
    });
  });

  describe('Field error extraction', () => {
    it('should extract field errors from validation messages', () => {
      const validationException = new HttpException(
        {
          message: [
            'email should not be empty',
            'email must be an email',
            'password must be a string',
            'age must be a number',
          ],
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(validationException, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            fieldErrors: {
              email: ['email should not be empty', 'email must be an email'],
              password: ['password must be a string'],
              age: ['age must be a number'],
            },
          }),
        }),
      );
    });

    it('should return undefined for field errors when no patterns match', () => {
      const validationException = new HttpException(
        {
          message: ['Invalid request format', 'Something went wrong'],
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(validationException, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.not.objectContaining({
            fieldErrors: expect.anything(),
          }),
        }),
      );
    });
  });
});