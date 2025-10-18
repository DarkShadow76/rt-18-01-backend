import { Test, TestingModule } from '@nestjs/testing';
import { FileValidationService } from './file-validation.service';
import { ConfigurationService } from '../../config/configuration.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError } from '../../common/errors/app-error';

describe('FileValidationService', () => {
  let service: FileValidationService;
  let configService: jest.Mocked<ConfigurationService>;
  let loggerService: jest.Mocked<LoggerService>;

  const mockUploadConfig = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    storageLocation: './test-uploads',
  };

  beforeEach(async () => {
    const mockConfigService = {
      upload: mockUploadConfig,
    };

    const mockLoggerService = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileValidationService,
        {
          provide: ConfigurationService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
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
      const mockFile = createMockFile('test.pdf', 'application/pdf', validPdfBuffer);

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata?.fileHash).toBeDefined();
      expect(loggerService.debug).toHaveBeenCalledWith(
        'Starting comprehensive file validation',
        'FileValidationService',
        expect.any(Object)
      );
    });

    it('should validate a valid PNG file successfully', async () => {
      const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Array(100).fill(0)]);
      const mockFile = createMockFile('test.png', 'image/png', validPngBuffer);

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid JPEG file successfully', async () => {
      const validJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0), 0xFF, 0xD9]);
      const mockFile = createMockFile('test.jpg', 'image/jpeg', validJpegBuffer);

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject file with no name', async () => {
      const mockFile = createMockFile('', 'application/pdf', Buffer.from('test'));

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File name is required');
    });

    it('should reject file that exceeds maximum size', async () => {
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
      const mockFile = createMockFile('large.pdf', 'application/pdf', largeBuffer);

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('exceeds maximum allowed size'))).toBe(true);
    });

    it('should reject empty file', async () => {
      const mockFile = createMockFile('empty.pdf', 'application/pdf', Buffer.alloc(0));

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject disallowed MIME type', async () => {
      const mockFile = createMockFile('test.txt', 'text/plain', Buffer.from('test content'));

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('File type text/plain is not allowed'))).toBe(true);
    });

    it('should reject dangerous file extensions', async () => {
      const mockFile = createMockFile('malicious.exe', 'application/pdf', Buffer.from('test'));

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'File extension .exe is not allowed for security reasons'
      );
    });

    it('should reject file with suspicious filename patterns', async () => {
      const mockFile = createMockFile('../../../etc/passwd', 'application/pdf', Buffer.from('test'));

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File name contains suspicious characters or patterns');
    });

    it('should reject file with mismatched signature', async () => {
      const invalidPdfBuffer = Buffer.from('This is not a PDF file');
      const mockFile = createMockFile('fake.pdf', 'application/pdf', invalidPdfBuffer);

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File signature does not match declared type application/pdf');
    });

    it('should detect malicious JavaScript content', async () => {
      const maliciousBuffer = Buffer.from('<script>alert("xss")</script>');
      const mockFile = createMockFile('malicious.pdf', 'application/pdf', maliciousBuffer);

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File contains potentially malicious content patterns');
      expect(result.metadata?.suspiciousPatterns).toBeDefined();
    });

    it('should detect embedded executable content', async () => {
      const executableBuffer = Buffer.from([0x4D, 0x5A, ...Array(100).fill(0)]); // PE header
      const mockFile = createMockFile('embedded.pdf', 'application/pdf', executableBuffer);

      const result = await service.validateFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File contains embedded executable content');
    });

    it('should warn about MIME type mismatch', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Array(100).fill(0)]);
      const mockFile = createMockFile('test.png', 'image/jpeg', pngBuffer); // Wrong MIME type

      const result = await service.validateFile(mockFile);

      expect(result.warnings.some(warning => 
        warning.includes('Detected MIME type (image/png) differs from declared type (image/jpeg)')
      )).toBe(true);
    });

    it('should warn about PDF with JavaScript', async () => {
      const pdfWithJs = Buffer.from('%PDF-1.4\n/JavaScript (alert("test"))\n%%EOF');
      const mockFile = createMockFile('js.pdf', 'application/pdf', pdfWithJs);

      const result = await service.validateFile(mockFile);

      expect(result.warnings).toContain('PDF contains JavaScript - potential security risk');
    });

    it('should warn about unusually large files', async () => {
      const largeBuffer = Buffer.alloc(60 * 1024 * 1024); // 60MB
      largeBuffer.write('%PDF-1.4', 0); // Valid PDF header
      const mockFile = createMockFile('huge.pdf', 'application/pdf', largeBuffer);

      const result = await service.validateFile(mockFile, { customMaxSize: 100 * 1024 * 1024 });

      expect(result.warnings).toContain(
        'File is unusually large - potential zip bomb or similar attack'
      );
    });

    it('should skip content validation when requested', async () => {
      const invalidBuffer = Buffer.from('not a pdf');
      const mockFile = createMockFile('test.pdf', 'application/pdf', invalidBuffer);

      const result = await service.validateFile(mockFile, { skipContentValidation: true });

      // Should not fail on signature mismatch since content validation is skipped
      expect(result.errors).not.toContain(
        expect.stringContaining('File signature does not match')
      );
    });

    it('should skip malicious content check when requested', async () => {
      const maliciousBuffer = Buffer.from('<script>alert("xss")</script>');
      const mockFile = createMockFile('test.pdf', 'application/pdf', maliciousBuffer);

      const result = await service.validateFile(mockFile, { skipMaliciousContentCheck: true });

      expect(result.errors).not.toContain('File contains potentially malicious content patterns');
    });

    it('should use custom max size when provided', async () => {
      const buffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
      buffer.write('%PDF-1.4', 0);
      const mockFile = createMockFile('test.pdf', 'application/pdf', buffer);

      const result = await service.validateFile(mockFile, { customMaxSize: 1024 * 1024 }); // 1MB limit

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('exceeds maximum allowed size'))).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      const mockFile = null as any;

      await expect(service.validateFile(mockFile)).rejects.toThrow(AppError);
      // Logger is not called for early validation errors, only for unexpected errors
    });
  });

  describe('validateFiles', () => {
    it('should validate multiple files', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\n%%EOF');
      const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      
      const files = [
        createMockFile('test1.pdf', 'application/pdf', validPdfBuffer),
        createMockFile('test2.png', 'image/png', validPngBuffer),
      ];

      const results = await service.validateFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should handle mixed valid and invalid files', async () => {
      const validBuffer = Buffer.from('%PDF-1.4\n%%EOF');
      const invalidBuffer = Buffer.from('not a pdf');
      
      const files = [
        createMockFile('valid.pdf', 'application/pdf', validBuffer),
        createMockFile('invalid.pdf', 'application/pdf', invalidBuffer),
      ];

      const results = await service.validateFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
    });
  });

  describe('validateFileBasic', () => {
    it('should perform basic validation only', () => {
      const mockFile = createMockFile('test.pdf', 'application/pdf', Buffer.from('test'));

      const result = service.validateFileBasic(mockFile);

      expect(result.isValid).toBe(true);
      expect(result.metadata).toBeUndefined();
    });

    it('should reject file with basic validation errors', () => {
      const mockFile = createMockFile('', 'text/plain', Buffer.alloc(0));

      const result = service.validateFileBasic(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File name is required');
      expect(result.errors).toContain('File is empty');
      expect(result.errors.some(error => error.includes('File type text/plain is not allowed'))).toBe(true);
    });
  });

  // Helper function to create mock files
  function createMockFile(
    originalname: string,
    mimetype: string,
    buffer: Buffer
  ): Express.Multer.File {
    return {
      fieldname: 'file',
      originalname,
      encoding: '7bit',
      mimetype,
      size: buffer.length,
      buffer,
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };
  }
});