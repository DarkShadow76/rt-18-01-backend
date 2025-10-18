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
import { v4 as uuidv4 } from 'uuid';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = uuidv4();

    let status: number;
    let errorResponse: ErrorResponseDto;

    if (exception instanceof HttpException) {
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
    } else {
      // Handle unexpected errors
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        success: false,
        error: {
          type: ErrorType.PROCESSING_ERROR,
          message: 'Internal server error',
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
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return ErrorType.PROCESSING_ERROR;
      default:
        return ErrorType.PROCESSING_ERROR;
    }
  }

  private logError(
    exception: unknown,
    request: Request,
    correlationId: string,
    status: number,
  ): void {
    const message = exception instanceof Error ? exception.message : 'Unknown error';
    const stack = exception instanceof Error ? exception.stack : undefined;

    const logContext = {
      correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.get('User-Agent'),
      ip: request.ip,
      status,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${message}`,
        stack,
        JSON.stringify(logContext),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${message}`,
        JSON.stringify(logContext),
      );
    }
  }
}