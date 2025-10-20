import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { LoggerService } from '../common/logger/logger.service';

describe('UploadController', () => {
  let controller: UploadController;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config = {
          PROJECT_ID: 'test-project',
          LOCATION: 'us-central1',
          PROCESSOR_ID: 'test-processor',
          SB_URL: 'https://test.supabase.co',
          SB_ANON_KEY: 'test-anon-key',
        };
        return config[key];
      }),
    };

    const mockInvoiceProcessingService = {
      processInvoice: jest.fn().mockResolvedValue({
        success: true,
        invoiceId: 'test-id',
        extractedData: {
          invoiceNumber: 'INV-001',
          totalAmount: 100,
          dueDate: '2024-12-31'
        }
      }),
      getProcessingStatus: jest.fn().mockResolvedValue({
        status: 'completed',
        progress: 100
      }),
    };

    const mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      setContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: 'IInvoiceProcessingService',
          useValue: mockInvoiceProcessingService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
