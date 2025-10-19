import { Module } from '@nestjs/common';
import { FileValidationService } from './file-validation/file-validation.service';
import { DocumentAIService } from './document-ai/document-ai.service';
import { DataExtractionService } from './data-extraction/data-extraction.service';
import { InvoiceValidationService } from './invoice-validation/invoice-validation.service';
import { DuplicateDetectionService } from './duplicate-detection/duplicate-detection.service';
import { AuditService } from './audit/audit.service';
import { InvoiceProcessingModule } from './invoice-processing/invoice-processing.module';
import { RepositoriesModule } from '../repositories/repositories.module';

@Module({
  imports: [
    RepositoriesModule,
    InvoiceProcessingModule
  ],
  providers: [
    FileValidationService,
    DocumentAIService,
    DataExtractionService,
    InvoiceValidationService,
    DuplicateDetectionService,
    AuditService,
  ],
  exports: [
    FileValidationService,
    DocumentAIService,
    DataExtractionService,
    InvoiceValidationService,
    DuplicateDetectionService,
    AuditService,
    InvoiceProcessingModule,
  ],
})
export class ServicesModule {}