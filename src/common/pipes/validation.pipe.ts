import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
  ValidationPipe as NestValidationPipe,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ErrorType } from '../dto/upload-invoice.dto';

@Injectable()
export class CustomValidationPipe extends NestValidationPipe implements PipeTransform {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const fieldErrors = this.formatValidationErrors(errors);
        
        throw new BadRequestException({
          type: ErrorType.VALIDATION_ERROR,
          message: 'Validation failed',
          details: {
            fieldErrors,
            totalErrors: Object.keys(fieldErrors).length,
          },
          timestamp: new Date().toISOString(),
        });
      },
    });
  }

  private formatValidationErrors(errors: ValidationError[]): Record<string, string[]> {
    const fieldErrors: Record<string, string[]> = {};

    const processError = (error: ValidationError, parentPath = '') => {
      const fieldPath = parentPath ? `${parentPath}.${error.property}` : error.property;

      if (error.constraints) {
        fieldErrors[fieldPath] = Object.values(error.constraints);
      }

      if (error.children && error.children.length > 0) {
        error.children.forEach(child => processError(child, fieldPath));
      }
    };

    errors.forEach(error => processError(error));
    return fieldErrors;
  }
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly allowedMimeTypes = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
  ];

  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB

  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type === 'body' && value.file) {
      this.validateFile(value.file);
    }
    return value;
  }

  private validateFile(file: Express.Multer.File) {
    const errors: string[] = [];

    // Check if file exists
    if (!file) {
      errors.push('File is required');
    } else {
      // Check file size
      if (file.size > this.maxFileSize) {
        errors.push(`File size must be less than ${this.maxFileSize / (1024 * 1024)}MB`);
      }

      // Check MIME type
      if (!this.allowedMimeTypes.includes(file.mimetype)) {
        errors.push(`File type must be one of: ${this.allowedMimeTypes.join(', ')}`);
      }

      // Check file extension
      const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
      const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
      if (!allowedExtensions.includes(fileExtension)) {
        errors.push(`File extension must be one of: ${allowedExtensions.join(', ')}`);
      }

      // Basic file content validation
      if (file.size === 0) {
        errors.push('File cannot be empty');
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        type: ErrorType.FILE_VALIDATION_ERROR,
        message: 'File validation failed',
        details: {
          fieldErrors: { file: errors },
          totalErrors: errors.length,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}