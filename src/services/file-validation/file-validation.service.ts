import { Injectable } from '@nestjs/common';
import { ConfigurationService } from '../../config/configuration.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError, ErrorType } from '../../common/errors/app-error';
import * as crypto from 'crypto';

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    fileHash?: string;
    actualMimeType?: string;
    suspiciousPatterns?: string[];
  };
}

export interface FileValidationOptions {
  skipContentValidation?: boolean;
  skipMaliciousContentCheck?: boolean;
  customMaxSize?: number;
}

@Injectable()
export class FileValidationService {
  private readonly DANGEROUS_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.vbs', '.js', '.jar',
    '.msi', '.dll', '.app', '.deb', '.rpm', '.dmg', '.pkg', '.sh', '.ps1'
  ];

  private readonly SUSPICIOUS_PATTERNS = [
    // JavaScript patterns
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    // Executable patterns
    /MZ[\x00-\xFF]{2}/,  // PE header
    /\x7fELF/,           // ELF header
    /\xca\xfe\xba\xbe/,  // Java class file
    // Suspicious URLs
    /https?:\/\/[^\s]+\.(exe|bat|cmd|scr|pif|com|vbs|js|jar|msi|dll)/gi,
  ];

  private readonly FILE_SIGNATURES = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    'image/gif': [0x47, 0x49, 0x46, 0x38],
    'image/bmp': [0x42, 0x4D],
    'image/tiff': [0x49, 0x49, 0x2A, 0x00], // or [0x4D, 0x4D, 0x00, 0x2A]
  };

  constructor(
    private configService: ConfigurationService,
    private logger: LoggerService
  ) {}

  async validateFile(
    file: Express.Multer.File, 
    options: FileValidationOptions = {}
  ): Promise<FileValidationResult> {
    const result: FileValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      metadata: {},
    };

    const correlationId = crypto.randomUUID();

    try {
      // Early validation for null/undefined file
      if (!file) {
        throw AppError.validationError(
          'No file provided for validation',
          { correlationId },
          correlationId
        );
      }

      this.logger.debug('Starting comprehensive file validation', 'FileValidationService', {
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        correlationId,
      });
      // Basic file validation
      this.validateBasicFileProperties(file, result, options);

      // Content validation
      if (!options.skipContentValidation && file.buffer) {
        this.validateFileContent(file.buffer, file.mimetype, result);
        
        // Generate file hash for integrity checking
        result.metadata!.fileHash = this.generateFileHash(file.buffer);
      }

      // Malicious content detection
      if (!options.skipMaliciousContentCheck && file.buffer) {
        this.detectMaliciousContent(file.buffer, file.originalname, result);
      }

      // Advanced file type detection
      if (file.buffer) {
        const detectedMimeType = this.detectActualMimeType(file.buffer);
        result.metadata!.actualMimeType = detectedMimeType;
        
        if (detectedMimeType && detectedMimeType !== file.mimetype) {
          result.warnings.push(
            `Detected MIME type (${detectedMimeType}) differs from declared type (${file.mimetype})`
          );
        }
      }

      this.logger.debug('File validation completed', 'FileValidationService', {
        filename: file.originalname,
        isValid: result.isValid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        correlationId,
      });

      if (!result.isValid) {
        this.logger.warn('File validation failed', 'FileValidationService', {
          filename: file.originalname,
          errors: result.errors,
          correlationId,
        });
      }

      return result;

    } catch (error) {
      // If it's already an AppError, just re-throw it
      if (error instanceof AppError) {
        throw error;
      }

      this.logger.error('Error during file validation', error.stack, 'FileValidationService', {
        filename: file?.originalname || 'unknown',
        error: error.message,
        correlationId,
      });

      throw AppError.validationError(
        'File validation failed due to internal error',
        { originalError: error.message },
        correlationId
      );
    }
  }

  private validateBasicFileProperties(
    file: Express.Multer.File,
    result: FileValidationResult,
    options: FileValidationOptions
  ): void {
    // Validate file existence
    if (!file) {
      result.errors.push('No file provided');
      result.isValid = false;
      return;
    }

    // Validate file name
    if (!file.originalname || file.originalname.trim().length === 0) {
      result.errors.push('File name is required');
      result.isValid = false;
    } else {
      // Check for suspicious file names
      if (this.containsSuspiciousFileName(file.originalname)) {
        result.errors.push('File name contains suspicious characters or patterns');
        result.isValid = false;
      }

      // Check file extension
      const fileExtension = this.getFileExtension(file.originalname);
      if (fileExtension && this.DANGEROUS_EXTENSIONS.includes(fileExtension)) {
        result.errors.push(
          `File extension ${fileExtension} is not allowed for security reasons`
        );
        result.isValid = false;
      }
    }

    // Validate file size
    const maxSize = options.customMaxSize || this.configService.upload.maxFileSize;
    if (file.size > maxSize) {
      result.errors.push(
        `File size ${this.formatFileSize(file.size)} exceeds maximum allowed size of ${this.formatFileSize(maxSize)}`
      );
      result.isValid = false;
    }

    if (file.size === 0) {
      result.errors.push('File is empty');
      result.isValid = false;
    }

    // Validate MIME type
    const allowedTypes = this.configService.upload.allowedMimeTypes;
    if (!allowedTypes.includes(file.mimetype)) {
      result.errors.push(
        `File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
      );
      result.isValid = false;
    }
  }

  private validateFileContent(
    buffer: Buffer,
    mimetype: string,
    result: FileValidationResult
  ): void {
    // Check file signature matches declared MIME type
    const expectedSignature = this.FILE_SIGNATURES[mimetype as keyof typeof this.FILE_SIGNATURES];
    if (expectedSignature) {
      const actualSignature = Array.from(buffer.slice(0, expectedSignature.length));
      if (!expectedSignature.every((byte, index) => byte === actualSignature[index])) {
        result.errors.push(`File signature does not match declared type ${mimetype}`);
        result.isValid = false;
      }
    }

    // PDF specific validation
    if (mimetype === 'application/pdf') {
      this.validatePdfContent(buffer, result);
    }

    // Image specific validation
    if (mimetype.startsWith('image/')) {
      this.validateImageContent(buffer, mimetype, result);
    }
  }

  private validatePdfContent(buffer: Buffer, result: FileValidationResult): void {
    const content = buffer.toString('binary');
    
    // Check for PDF structure
    if (!content.includes('%%EOF')) {
      result.warnings.push('PDF file may be corrupted - missing EOF marker');
    }

    // Check for suspicious JavaScript in PDF
    if (content.includes('/JavaScript') || content.includes('/JS')) {
      result.warnings.push('PDF contains JavaScript - potential security risk');
    }

    // Check for forms or interactive elements
    if (content.includes('/AcroForm') || content.includes('/XFA')) {
      result.warnings.push('PDF contains interactive forms');
    }
  }

  private validateImageContent(
    buffer: Buffer,
    mimetype: string,
    result: FileValidationResult
  ): void {
    // Check for embedded scripts in image metadata
    const content = buffer.toString('binary');
    
    if (content.includes('<script') || content.includes('javascript:')) {
      result.errors.push('Image contains embedded scripts - potential security risk');
      result.isValid = false;
    }

    // Basic image corruption check
    if (mimetype === 'image/jpeg' && !content.includes('\xFF\xD9')) {
      result.warnings.push('JPEG file may be corrupted - missing end marker');
    }
  }

  private detectMaliciousContent(
    buffer: Buffer,
    filename: string,
    result: FileValidationResult
  ): void {
    const content = buffer.toString('binary');
    const suspiciousPatterns: string[] = [];

    // Check for suspicious patterns
    for (const pattern of this.SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        suspiciousPatterns.push(pattern.toString());
      }
    }

    if (suspiciousPatterns.length > 0) {
      result.metadata!.suspiciousPatterns = suspiciousPatterns;
      result.errors.push('File contains potentially malicious content patterns');
      result.isValid = false;
    }

    // Check for embedded executables
    if (this.containsEmbeddedExecutable(buffer)) {
      result.errors.push('File contains embedded executable content');
      result.isValid = false;
    }

    // Check for suspicious file size patterns (e.g., very large files that might be zip bombs)
    if (buffer.length > 50 * 1024 * 1024) { // 50MB
      result.warnings.push('File is unusually large - potential zip bomb or similar attack');
    }
  }

  private detectActualMimeType(buffer: Buffer): string | null {
    for (const [mimeType, signature] of Object.entries(this.FILE_SIGNATURES)) {
      const actualSignature = Array.from(buffer.slice(0, signature.length));
      if (signature.every((byte, index) => byte === actualSignature[index])) {
        return mimeType;
      }
    }
    return null;
  }

  private containsSuspiciousFileName(filename: string): boolean {
    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return true;
    }

    // Check for null bytes or control characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(filename)) {
      return true;
    }

    // Check for excessively long filenames
    if (filename.length > 255) {
      return true;
    }

    return false;
  }

  private containsEmbeddedExecutable(buffer: Buffer): boolean {
    // Check for PE header (Windows executable)
    if (buffer.includes(Buffer.from([0x4D, 0x5A]))) {
      return true;
    }

    // Check for ELF header (Linux executable)
    if (buffer.includes(Buffer.from([0x7F, 0x45, 0x4C, 0x46]))) {
      return true;
    }

    return false;
  }

  private getFileExtension(filename: string): string | null {
    const parts = filename.toLowerCase().split('.');
    return parts.length > 1 ? `.${parts.pop()}` : null;
  }

  private generateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Validates multiple files in batch
   */
  async validateFiles(
    files: Express.Multer.File[],
    options: FileValidationOptions = {}
  ): Promise<FileValidationResult[]> {
    const results: FileValidationResult[] = [];

    for (const file of files) {
      try {
        const result = await this.validateFile(file, options);
        results.push(result);
      } catch (error) {
        results.push({
          isValid: false,
          errors: [`Validation failed: ${error.message}`],
          warnings: [],
        });
      }
    }

    return results;
  }

  /**
   * Quick validation for basic checks only
   */
  validateFileBasic(file: Express.Multer.File): FileValidationResult {
    const result: FileValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    this.validateBasicFileProperties(file, result, {});
    return result;
  }
}