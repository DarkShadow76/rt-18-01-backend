import { Module } from '@nestjs/common';
import { FileValidationService } from './file-validation/file-validation.service';
import { DocumentAIService } from './document-ai/document-ai.service';
import { DataExtractionService } from './data-extraction/data-extraction.service';
import { InvoiceValidationService } from './invoice-validation/invoice-validation.service';
import { DuplicateDetectionService } from './duplicate-detection/duplicate-detection.service';

@Module({
  providers: [
    FileValidationService,
    DocumentAIService,
    DataExtractionService,
    InvoiceValidationService,
    DuplicateDetectionService,
  ],
  exports: [
    FileValidationService,
    DocumentAIService,
    DataExtractionService,
    InvoiceValidationService,
    DuplicateDetectionService,
  ],
})
export class ServicesModule {}