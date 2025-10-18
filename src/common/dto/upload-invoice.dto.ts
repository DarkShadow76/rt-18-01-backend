import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UploadInvoiceDto {
  @IsNotEmpty()
  file: Express.Multer.File;

  @IsOptional()
  @IsString()
  description?: string;
}

export class InvoiceResponseDto {
  id: string;
  invoiceNumber: string;
  billTo: string;
  dueDate: string;
  totalAmount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    originalFileName: string;
    fileSize: number;
    mimeType: string;
    processingTimeMs: number;
    extractionConfidence: number;
  };
}

export class ErrorResponseDto {
  success: false;
  error: {
    type: string;
    message: string;
    details?: any;
    correlationId?: string;
  };
  timestamp: string;
}

export class SuccessResponseDto<T = any> {
  success: true;
  data: T;
  timestamp: string;
  correlationId?: string;
}