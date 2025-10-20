import { Invoice, InvoiceStatus, InvoiceMetadata } from '../../src/models/invoice.entity';
import { UploadInvoiceDto } from '../../src/common/dto/upload-invoice.dto';

export class InvoiceFixtures {
  static createValidInvoice(overrides: Partial<Invoice> = {}): Invoice {
    const invoiceData = {
      id: 'test-invoice-id',
      invoiceNumber: 'INV-2024-001',
      billTo: 'Test Company Inc.',
      dueDate: new Date('2024-12-31'),
      totalAmount: 1500.00,
      status: InvoiceStatus.COMPLETED,
      processingAttempts: 1,
      lastProcessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        originalFileName: 'test-invoice.pdf',
        fileSize: 1024000,
        mimeType: 'application/pdf',
        processingTimeMs: 2500,
        extractionConfidence: 0.95,
        documentAiVersion: '1.0.0'
      },
      auditTrail: [],
      ...overrides
    };
    
    return new Invoice(invoiceData);
  }

  static createInvoiceWithStatus(status: InvoiceStatus): Invoice {
    return this.createValidInvoice({ status });
  }

  static createDuplicateInvoice(): Invoice {
    return this.createValidInvoice({
      id: 'duplicate-invoice-id',
      status: InvoiceStatus.DUPLICATE
    });
  }

  static createFailedInvoice(): Invoice {
    return this.createValidInvoice({
      id: 'failed-invoice-id',
      status: InvoiceStatus.FAILED,
      processingAttempts: 3
    });
  }

  static createUploadDto(): UploadInvoiceDto {
    return {
      file: {
        fieldname: 'file',
        originalname: 'test-invoice.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024000,
        buffer: Buffer.from('test pdf content'),
        destination: '',
        filename: '',
        path: '',
        stream: null
      } as Express.Multer.File
    };
  }

  static createInvalidUploadDto(): UploadInvoiceDto {
    return {
      file: {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 50000000, // Too large
        buffer: Buffer.from('invalid content'),
        destination: '',
        filename: '',
        path: '',
        stream: null
      } as Express.Multer.File
    };
  }

  static createDocumentAiResponse() {
    return {
      entities: [
        {
          type: 'invoice_id',
          mentionText: 'INV-2024-001',
          confidence: 0.95
        },
        {
          type: 'bill_to',
          mentionText: 'Test Company Inc.',
          confidence: 0.92
        },
        {
          type: 'due_date',
          mentionText: '12/31/2024',
          confidence: 0.88
        },
        {
          type: 'total_amount',
          mentionText: '$1,500.00',
          confidence: 0.94
        }
      ],
      text: 'Invoice\nINV-2024-001\nBill To: Test Company Inc.\nDue Date: 12/31/2024\nTotal: $1,500.00'
    };
  }

  static createMalformedDocumentAiResponse() {
    return {
      entities: [
        {
          type: 'invoice_id',
          mentionText: '',
          confidence: 0.1
        }
      ],
      text: 'Incomplete document'
    };
  }
}