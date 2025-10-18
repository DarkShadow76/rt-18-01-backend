import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UploadController } from './upload.controller';
import { InvoiceService } from '../invoice/invoice.service';

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

    const mockInvoiceService = {
      saveInvoiceData: jest.fn().mockResolvedValue(undefined),
      getAllInvoices: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: InvoiceService,
          useValue: mockInvoiceService,
        },
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
