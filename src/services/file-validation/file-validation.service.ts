import { Injectable } from '@nestjs/common';
import { ConfigurationService } from '../../config/configuration.service';
import { LoggerService } from '../../common/logger/logger.service';

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class FileValidationService {
  constructor(
    private configService: ConfigurationService,
    private logger: LoggerService
  ) {}

  async validateFile(file: Express.Multer.File): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    this.logger.debug('Starting file validation', 'FileValidationService', {
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    // Validate file size
    const maxSize = this.configService.upload.maxFileSize;
    if (file.size > maxSize) {
      result.errors.push(`File size ${file.size} exceeds maximum allowed size of ${maxSize} bytes`);
      result.isValid = false;
    }

    // Validate MIME type
    const allowedTypes = this.configService.upload.allowedMimeTypes;
    if (!allowedTypes.includes(file.mimetype)) {
      result.errors.push(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
      result.isValid = false;
    }

    // Validate file name
    if (!file.originalname || file.originalname.trim().length === 0) {
      result.errors.push('File name is required');
      result.isValid = false;
    }

    // Check for potentially dangerous file extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
    const fileExtension = file.originalname.toLowerCase().split('.').pop();
    if (fileExtension && dangerousExtensions.includes(`.${fileExtension}`)) {
      result.errors.push(`File extension .${fileExtension} is not allowed for security reasons`);
      result.isValid = false;
    }

    this.logger.debug('File validation completed', 'FileValidationService', {
      filename: file.originalname,
      isValid: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
    });

    if (!result.isValid) {
      this.logger.warn('File validation failed', 'FileValidationService', {
        filename: file.originalname,
        errors: result.errors,
      });
    }

    return result;
  }

  validateFileContent(buffer: Buffer, mimetype: string): FileValidationResult {
    const result: FileValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Basic content validation - check for empty files
    if (buffer.length === 0) {
      result.errors.push('File is empty');
      result.isValid = false;
    }

    // PDF specific validation
    if (mimetype === 'application/pdf') {
      const pdfHeader = buffer.slice(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        result.errors.push('Invalid PDF file format');
        result.isValid = false;
      }
    }

    // Image specific validation
    if (mimetype.startsWith('image/')) {
      // Basic image header validation
      const imageHeaders = {
        'image/jpeg': [0xFF, 0xD8, 0xFF],
        'image/png': [0x89, 0x50, 0x4E, 0x47],
      };

      const expectedHeader = imageHeaders[mimetype as keyof typeof imageHeaders];
      if (expectedHeader) {
        const actualHeader = Array.from(buffer.slice(0, expectedHeader.length));
        if (!expectedHeader.every((byte, index) => byte === actualHeader[index])) {
          result.errors.push(`Invalid ${mimetype} file format`);
          result.isValid = false;
        }
      }
    }

    return result;
  }
}