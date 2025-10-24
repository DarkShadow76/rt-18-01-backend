import { Module } from '@nestjs/common';
import { InvoiceProcessingService } from './invoice-processing.service';
import { FileValidationService } from '../file-validation/file-validation.service';
import { DocumentAIService } from '../document-ai/document-ai.service';
import { DataExtractionService } from '../data-extraction/data-extraction.service';
import { InvoiceValidationService } from '../invoice-validation/invoice-validation.service';
import { DuplicateDetectionService } from '../duplicate-detection/duplicate-detection.service';
import { AuditService } from '../audit/audit.service';
import { RepositoriesModule } from '../../repositories/repositories.module';
import { LoggerModule } from '../../common/logger/logger.module';
import { MetricsService } from '../../common/services/metrics.service';
import { ConfigModule } from '../../config/config.module';

@Module({
  imports: [
    RepositoriesModule,
    LoggerModule,
    ConfigModule
  ],
  providers: [
    InvoiceProcessingService,
    {
      provide: 'IInvoiceProcessingService',
      useClass: InvoiceProcessingService
    },
    {
      provide: 'IFileValidationService',
      useClass: FileValidationService
    },
    {
      provide: 'IDocumentAIService', 
      useClass: DocumentAIService
    },
    {
      provide: 'IDataExtractionService',
      useClass: DataExtractionService
    },
    {
      provide: 'IInvoiceValidationService',
      useClass: InvoiceValidationService
    },
    {
      provide: 'IDuplicateDetectionService',
      useClass: DuplicateDetectionService
    },
    {
      provide: 'IAuditService',
      useClass: AuditService
    },
    MetricsService
  ],
  exports: [
    InvoiceProcessingService,
    'IInvoiceProcessingService',
    'IFileValidationService',
    'IDocumentAIService',
    'IDataExtractionService', 
    'IInvoiceValidationService',
    'IDuplicateDetectionService',
    'IAuditService'
  ]
})
export class InvoiceProcessingModule {}