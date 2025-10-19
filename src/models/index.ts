// Entity exports
export * from './service.interfaces';
export * from './document-data.interface';

// Re-export commonly used types and classes
export {
  Invoice,
  AuditAction,
  DuplicateDetectionMethod,
  DuplicateResolution,
} from './invoice.entity';

export type {
  InvoiceMetadata,
  AuditEntry,
  InvoiceFilters,
  InvoiceQueryOptions,
  InvoiceStats,
  DuplicateDetectionResult,
  DuplicateRecord,
} from './invoice.entity';

export type {
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

// Repository interfaces
export type {
  IInvoiceRepository,
  IAuditRepository,
  ProcessingMetrics,
  AuditQueryOptions,
  AuditSearchCriteria,
  AuditActionStats,
  UserActivityStats,
  RepositoryHealthStatus,
} from '../repositories/interfaces/invoice-repository.interface';

export type {
  DocumentData,
  EnhancedDocumentData,
  DocumentLineItem,
  DocumentProcessingResult,
} from './document-data.interface';

// Enum re-exports for convenience
export {
  InvoiceStatus,
  ErrorType,
} from '../common/dto/upload-invoice.dto';