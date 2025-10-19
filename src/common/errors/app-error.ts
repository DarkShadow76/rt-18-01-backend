import { ErrorType } from '../dto/upload-invoice.dto';

export { ErrorType };

export class AppError extends Error {
  constructor(
    public readonly type: ErrorType,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: any,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static validationError(
    message: string,
    details?: any,
    correlationId?: string,
  ): AppError {
    return new AppError(
      ErrorType.VALIDATION_ERROR,
      message,
      400,
      details,
      correlationId,
    );
  }

  static processingError(
    message: string,
    details?: any,
    correlationId?: string,
  ): AppError {
    return new AppError(
      ErrorType.PROCESSING_ERROR,
      message,
      500,
      details,
      correlationId,
    );
  }

  static externalServiceError(
    message: string,
    details?: any,
    correlationId?: string,
  ): AppError {
    return new AppError(
      ErrorType.EXTERNAL_SERVICE_ERROR,
      message,
      502,
      details,
      correlationId,
    );
  }

  static databaseError(
    message: string,
    details?: any,
    correlationId?: string,
  ): AppError {
    return new AppError(
      ErrorType.DATABASE_ERROR,
      message,
      500,
      details,
      correlationId,
    );
  }

  static configurationError(
    message: string,
    details?: any,
    correlationId?: string,
  ): AppError {
    return new AppError(
      ErrorType.CONFIGURATION_ERROR,
      message,
      500,
      details,
      correlationId,
    );
  }

  static fileValidationError(
    message: string,
    details?: any,
    correlationId?: string,
  ): AppError {
    return new AppError(
      ErrorType.FILE_VALIDATION_ERROR,
      message,
      400,
      details,
      correlationId,
    );
  }

  static duplicateError(
    message: string,
    details?: any,
    correlationId?: string,
  ): AppError {
    return new AppError(
      ErrorType.DUPLICATE_ERROR,
      message,
      409,
      details,
      correlationId,
    );
  }
}
