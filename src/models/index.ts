// Entity exports
export * from './invoice.entity';
export * from './service.interfaces';
export * from './document-data.interface';

// Re-export commonly used types
export type {
  Invoice,
  InvoiceMetadata,
  AuditEntry,
  InvoiceFilters,
  InvoiceQueryOptions,
  InvoiceStats,
  DuplicateDetectionResult,
  DuplicateRecord,
} from './invoice.entity';

export type {
  IInvoiceRepository,
  IAuditRepository,
  IFileValidationService,
  IDocumentAIService,
  IDataExtractionService,
  IInvoiceValidationService,
  IDuplicateDetectionService,
  IInvoiceProcessingService,
  IAuditService,
  FileValidationResult,
  ExtractedInvoiceData,
  ValidationResult,
  ProcessingOptions,
  ProcessingStatus,
  AppConfig,
} from './service.interfaces';

export type {
  DocumentData,
  EnhancedDocumentData,
  DocumentLineItem,
  DocumentProcessingResult,
} from './document-data.interface';

// Enum re-exports for convenience
export {
  AuditAction,
  DuplicateDetectionMethod,
  DuplicateResolution,
} from './invoice.entity';

export {
  InvoiceStatus,
  ErrorType,
} from '../common/dto/upload-invoice.dto';