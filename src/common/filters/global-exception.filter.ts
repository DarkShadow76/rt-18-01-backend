import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorType, ErrorResponseDto } from '../dto/upload-invoice.dto';
import { AppError } from '../errors/app-error';
import { CorrelationIdUtil } from '../utils/correlation-id.util';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    // Get or generate correlation ID
    const correlationId = CorrelationIdUtil.getOrGenerate(request.headers);

    let status: number;
    let errorResponse: ErrorResponseDto;

    if (exception instanceof AppError) {
      // Handle our custom AppError class
      status = exception.statusCode;
      errorResponse = {
        success: false,
        error: {
          type: exception.type,
          message: exception.message,
          details: exception.details,
          correlationId: exception.correlationId || correlationId,
        },
        timestamp: new Date().toISOString(),
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Handle validation errors and custom error formats
      if (typeof exceptionResponse === 'object' && 'type' in exceptionResponse) {
        errorResponse = {
          success: false,
          error: {
            type: (exceptionResponse as any).type || ErrorType.VALIDATION_ERROR,
            message: (exceptionResponse as any).message || exception.message,
            details: (exceptionResponse as any).details,
            correlationId,
            fieldErrors: (exceptionResponse as any).details?.fieldErrors,
          },
          timestamp: new Date().toISOString(),
        };
      } else if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
        // Handle NestJS validation pipe errors
        const messages = Array.isArray((exceptionResponse as any).message) 
          ? (exceptionResponse as any).message 
          : [exception.message];
        
        errorResponse = {
          success: false,
          error: {
            type: ErrorType.VALIDATION_ERROR,
            message: 'Validation failed',
            details: { validationErrors: messages },
            correlationId,
            fieldErrors: this.extractFieldErrors(messages),
          },
          timestamp: new Date().toISOString(),
        };
      } else {
        errorResponse = {
          success: false,
          error: {
            type: this.getErrorTypeFromStatus(status),
            message: exception.message,
            correlationId,
          },
          timestamp: new Date().toISOString(),
        };
      }
    } else if (exception instanceof Error) {
      // Handle standard JavaScript errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : exception.message,
          details: process.env.NODE_ENV === 'production' 
            ? undefined 
            : { stack: exception.stack },
          correlationId,
        },
        timestamp: new Date().toISOString(),
      };
    } else {
      // Handle unexpected errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: 'Internal server error',
          details: process.env.NODE_ENV === 'production' 
            ? undefined 
            : { originalError: String(exception) },
          correlationId,
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Log the error with context
    this.logError(exception, request, correlationId, status);

    response.status(status).json(errorResponse);
  }

  private getErrorTypeFromStatus(status: number): ErrorType {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorType.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
      case HttpStatus.FORBIDDEN:
        return ErrorType.VALIDATION_ERROR;
      case HttpStatus.NOT_FOUND:
        return ErrorType.VALIDATION_ERROR;
      case HttpStatus.CONFLICT:
        return ErrorType.DUPLICATE_ERROR;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorType.VALIDATION_ERROR;
      case HttpStatus.BAD_GATEWAY:
      case HttpStatus.SERVICE_UNAVAILABLE:
      case HttpStatus.GATEWAY_TIMEOUT:
        return ErrorType.EXTERNAL_SERVICE_ERROR;
      case HttpStatus.INTERNAL_SERVER_ERROR:
      default:
        return ErrorType.PROCESSING_ERROR;
    }
  }

  private extractFieldErrors(messages: string[]): Record<string, string[]> | undefined {
    const fieldErrors: Record<string, string[]> = {};
    let hasFieldErrors = false;

    messages.forEach(message => {
      // Try to extract field name from validation messages
      // Format: "property should not be empty" or "property must be a string"
      const fieldMatch = message.match(/^(\w+)\s+(should|must|cannot)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        if (!fieldErrors[fieldName]) {
          fieldErrors[fieldName] = [];
        }
        fieldErrors[fieldName].push(message);
        hasFieldErrors = true;
      }
    });

    return hasFieldErrors ? fieldErrors : undefined;
  }

  private logError(
    exception: unknown,
    request: Request,
    correlationId: string,
    status: number,
  ): void {
    const message = exception instanceof Error ? exception.message : 'Unknown error';
    const stack = exception instanceof Error ? exception.stack : undefined;
    
    // Extract additional context
    const errorType = exception instanceof AppError 
      ? exception.type 
      : this.getErrorTypeFromStatus(status);
    
    const details = exception instanceof AppError 
      ? exception.details 
      : undefined;

    const logContext = {
      correlationId,
      errorType,
      method: request.method,
      url: request.url,
      query: request.query,
      body: this.sanitizeRequestBody(request.body),
      userAgent: request.get('User-Agent'),
      ip: request.ip,
      referer: request.get('Referer'),
      contentType: request.get('Content-Type'),
      contentLength: request.get('Content-Length'),
      status,
      details,
      timestamp: new Date().toISOString(),
    };

    // Log based on severity
    if (status >= 500) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${request.url} - ${message}`,
        {
          stack,
          context: logContext,
        },
      );
    } else if (status >= 400) {
      this.logger.warn(
        `[${correlationId}] ${request.method} ${request.url} - ${message}`,
        {
          context: logContext,
        },
      );
    } else {
      this.logger.log(
        `[${correlationId}] ${request.method} ${request.url} - ${message}`,
        {
          context: logContext,
        },
      );
    }

    // Log security events for suspicious activities
    this.logSecurityEvents(exception, request, correlationId, status);
  }

  private sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Limit body size for logging
    const bodyString = JSON.stringify(sanitized);
    if (bodyString.length > 1000) {
      return { ...sanitized, _truncated: true, _originalSize: bodyString.length };
    }

    return sanitized;
  }

  private logSecurityEvents(
    exception: unknown,
    request: Request,
    correlationId: string,
    status: number,
  ): void {
    // Log potential security events
    const securityEvents = [];

    // Multiple failed requests from same IP
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
      securityEvents.push('AUTHENTICATION_FAILURE');
    }

    // Suspicious file uploads
    if (request.url.includes('/upload') && status >= 400) {
      securityEvents.push('SUSPICIOUS_UPLOAD_ATTEMPT');
    }

    // Large request bodies (potential DoS)
    const contentLength = parseInt(request.get('Content-Length') || '0', 10);
    if (contentLength > 10 * 1024 * 1024) { // 10MB
      securityEvents.push('LARGE_REQUEST_BODY');
    }

    // SQL injection patterns in query parameters
    const queryString = JSON.stringify(request.query).toLowerCase();
    if (queryString.includes('select') || queryString.includes('union') || 
        queryString.includes('drop') || queryString.includes('delete')) {
      securityEvents.push('POTENTIAL_SQL_INJECTION');
    }

    if (securityEvents.length > 0) {
      this.logger.warn(
        `[SECURITY] [${correlationId}] Security events detected: ${securityEvents.join(', ')}`,
        {
          events: securityEvents,
          ip: request.ip,
          userAgent: request.get('User-Agent'),
          url: request.url,
          method: request.method,
          timestamp: new Date().toISOString(),
        },
      );
    }
  }
}