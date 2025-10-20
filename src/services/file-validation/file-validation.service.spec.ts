import { Test, TestingModule } from '@nestjs/testing';
import { FileValidationService, FileValidationResult } from './file-validation.service';
import { ConfigurationService } from '../../config/configuration.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError } from '../../common/errors/app-error';
import { TestHelpers, InvoiceFixtures } from '../../../test';

describe('FileValidationService', () => {
  let service: FileValidationService;
  let configService: jest.Mocked<ConfigurationService>;
  let loggerService: jest.Mocked<LoggerService>;

  const mockConfig = {
    upload: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg']
    }
  };

  beforeEach(async () => {
    const mockConfigService = {
      upload: mockConfig.upload
    };

    const mockLoggerService = TestHelpers.createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileValidationService,
        {
          provide: ConfigurationService,
          useValue: mockConfigService
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService
        }
      ]
    }).compile();

    service = module.get<FileValidationService>(FileValidationService);
    configService = module.get(ConfigurationService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFile', () => {
    it('should validate a valid PDF file successfully', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n%%EOF');
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'invoice.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: validPdfBuffer.length,
        buffer: validPdfBuffer,
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata?.fileHash).toBeDefined();
      expect(result.metadata?.actualMimeType).toBe('application/pdf');
    });

    it('should reject files that are too large', async () => {
      const largeFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'large.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 50 * 1024 * 1024, // 50MB
        buffer: TestHelpers.createLargeFile(50),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(largeFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum allowed size'))).toBe(true);
    });

    it('should reject files with dangerous extensions', async () => {
      const executableFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'malware.exe',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        size: 1024,
        buffer: Buffer.from('MZ\x90\x00'), // PE header
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(executableFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('File extension .exe is not allowed'))).toBe(true);
    });

    it('should reject files with disallowed MIME types', async () => {
      const textFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'document.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('Plain text content'),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(textFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('File type text/plain is not allowed'))).toBe(true);
    });

    it('should detect MIME type mismatch', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
      const mismatchedFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'image.png',
        encoding: '7bit',
        mimetype: 'application/pdf', // Wrong MIME type
        size: pngBuffer.length,
        buffer: pngBuffer,
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(mismatchedFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('File signature does not match declared type'))).toBe(true);
      expect(result.warnings.some(e => e.includes('Detected MIME type (image/png) differs from declared type'))).toBe(true);
    });

    it('should detect malicious content patterns', async () => {
      const maliciousBuffer = TestHelpers.createMaliciousFile();
      const maliciousFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'malicious.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: maliciousBuffer.length,
        buffer: maliciousBuffer,
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(maliciousFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('potentially malicious content patterns'))).toBe(true);
      expect(result.metadata?.suspiciousPatterns).toBeDefined();
    });

    it('should reject empty files', async () => {
      const emptyFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'empty.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 0,
        buffer: Buffer.alloc(0),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(emptyFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject files with suspicious filenames', async () => {
      const suspiciousFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: '../../../etc/passwd',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('content'),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(suspiciousFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('suspicious characters or patterns'))).toBe(true);
    });

    it('should handle null file input', async () => {
      await expect(service.validateFile(null as any)).rejects.toThrow(AppError);
    });

    it('should skip content validation when option is set', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('invalid pdf content'),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(file, { skipContentValidation: true });

      expect(result.metadata?.fileHash).toBeUndefined();
      expect(result.metadata?.actualMimeType).toBeNull();
    });

    it('should use custom max size when provided', async () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.alloc(2048),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(file, { customMaxSize: 1024 });

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum allowed size'))).toBe(true);
    });
  });

  describe('validateFiles', () => {
    it('should validate multiple files', async () => {
      const files: Express.Multer.File[] = [
        {
          fieldname: 'file1',
          originalname: 'test1.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('%PDF-1.4\n%%EOF'),
          destination: '',
          filename: '',
          path: '',
          stream: null
        },
        {
          fieldname: 'file2',
          originalname: 'test2.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('%PDF-1.4\n%%EOF'),
          destination: '',
          filename: '',
          path: '',
          stream: null
        }
      ];

      const results = await service.validateFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should handle validation errors in batch processing', async () => {
      const files: Express.Multer.File[] = [
        {
          fieldname: 'file1',
          originalname: 'valid.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('%PDF-1.4\n%%EOF'),
          destination: '',
          filename: '',
          path: '',
          stream: null
        },
        null as any // Invalid file
      ];

      const results = await service.validateFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
      expect(results[1].errors[0]).toContain('Validation failed');
    });
  });

  describe('validateFileBasic', () => {
    it('should perform basic validation only', () => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('content'),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = service.validateFileBasic(file);

      expect(result.isValid).toBe(true);
      expect(result.metadata).toBeUndefined();
    });
  });

  describe('PDF specific validation', () => {
    it('should warn about PDF with JavaScript', async () => {
      const pdfWithJs = Buffer.from('%PDF-1.4\n/JavaScript (alert("test"))\n%%EOF');
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'js.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: pdfWithJs.length,
        buffer: pdfWithJs,
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(file);

      expect(result.warnings.some(e => e.includes('PDF contains JavaScript'))).toBe(true);
    });

    it('should warn about corrupted PDF', async () => {
      const corruptedPdf = Buffer.from('%PDF-1.4\ncorrupted content'); // Missing %%EOF
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'corrupted.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: corruptedPdf.length,
        buffer: corruptedPdf,
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(file);

      expect(result.warnings.some(e => e.includes('PDF file may be corrupted'))).toBe(true);
    });
  });

  describe('Image specific validation', () => {
    it('should validate PNG images correctly', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: pngBuffer.length,
        buffer: pngBuffer,
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(file);

      expect(result.isValid).toBe(true);
      expect(result.metadata?.actualMimeType).toBe('image/png');
    });

    it('should detect embedded scripts in images', async () => {
      const maliciousImage = Buffer.from('PNG\x89<script>alert("xss")</script>');
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'malicious.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: maliciousImage.length,
        buffer: maliciousImage,
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      const result = await service.validateFile(file);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('embedded scripts'))).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle internal errors gracefully', async () => {
      // Mock the logger to throw an error
      loggerService.debug.mockImplementation(() => {
        throw new Error('Logger error');
      });

      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('content'),
        destination: '',
        filename: '',
        path: '',
        stream: null
      };

      await expect(service.validateFile(file)).rejects.toThrow(AppError);
    });
  });
});