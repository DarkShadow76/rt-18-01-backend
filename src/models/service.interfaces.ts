import { Invoice, InvoiceFilters, InvoiceQueryOptions, InvoiceStats, DuplicateDetectionResult, AuditEntry } from './invoice.entity';
import type { AuditSearchCriteria } from '../repositories/interfaces/invoice-repository.interface';

// Repository interfaces - Import from dedicated interface files
export type { 
  IInvoiceRepository, 
  IAuditRepository,
  ProcessingMetrics,
  AuditQueryOptions,
  AuditSearchCriteria,
  AuditActionStats,
  UserActivityStats,
  RepositoryHealthStatus
} from '../repositories/interfaces/invoice-repository.interface';

// Service interfaces
export interface IFileValidationService {
  validateFile(file: Express.Multer.File): Promise<FileValidationResult>;
  validateFileContent(buffer: Buffer, mimeType: string): Promise<boolean>;
  scanForMaliciousContent(buffer: Buffer): Promise<MaliciousContentResult>;
}

export interface IDocumentAIService {
  processDocument(file: Express.Multer.File): Promise<DocumentProcessingResult>;
  extractInvoiceData(file: Express.Multer.File): Promise<ExtractedInvoiceData>;
  getProcessorInfo(): Promise<ProcessorInfo>;
}

export interface IDataExtractionService {
  extractAndValidateData(rawData: any): Promise<ExtractedInvoiceData>;
  normalizeData(data: ExtractedInvoiceData): Promise<ExtractedInvoiceData>;
  validateExtractedData(data: ExtractedInvoiceData): Promise<ValidationResult>;
}

export interface IInvoiceValidationService {
  validateInvoiceData(data: ExtractedInvoiceData): Promise<ValidationResult>;
  validateBusinessRules(invoice: Invoice): Promise<ValidationResult>;
  validateDateFormat(dateString: string): boolean;
  validateAmount(amount: number): boolean;
}

export interface IDuplicateDetectionService {
  checkForDuplicates(invoice: Partial<Invoice>): Promise<DuplicateDetectionResult>;
  generateContentHash(invoice: Partial<Invoice>): string;
  findSimilarInvoices(invoice: Partial<Invoice>): Promise<Invoice[]>;
  resolveDuplicate(duplicateId: string, originalId: string, resolution: string): Promise<void>;
}

export interface IInvoiceProcessingService {
  processInvoice(file: Express.Multer.File, options?: ProcessingOptions): Promise<Invoice>;
  reprocessInvoice(invoiceId: string, options?: ProcessingOptions): Promise<Invoice>;
  getProcessingStatus(invoiceId: string): Promise<ProcessingStatus>;
  cancelProcessing(invoiceId: string): Promise<void>;
  getProcessingStatistics(): Promise<{
    activeProcessing: number;
    completedToday: number;
    failedToday: number;
    averageProcessingTime: number;
    duplicateRate: number;
  }>;
  healthCheck(): Promise<{
    status: string;
    activeProcessing: number;
    dependencies: Record<string, boolean>;
  }>;
}

export interface IAuditService {
  logAction(invoiceId: string, action: string, changes: Record<string, any>, metadata?: Record<string, any>, userId?: string): Promise<void>;
  getAuditTrail(invoiceId: string): Promise<AuditEntry[]>;
  searchAuditLogs(criteria: AuditSearchCriteria): Promise<AuditEntry[]>;
  logInvoiceCreated(invoiceId: string, invoiceData: Record<string, any>, userId?: string, correlationId?: string): Promise<void>;
  logInvoiceUpdated(invoiceId: string, oldData: Record<string, any>, newData: Record<string, any>, userId?: string, correlationId?: string): Promise<void>;
  logInvoiceDeleted(invoiceId: string, invoiceData: Record<string, any>, userId?: string, correlationId?: string): Promise<void>;
  logStatusChanged(invoiceId: string, oldStatus: string, newStatus: string, reason?: string, userId?: string, correlationId?: string): Promise<void>;
  logProcessingEvent(invoiceId: string, eventType: 'started' | 'completed' | 'failed' | 'retried', details: Record<string, any>, userId?: string, correlationId?: string): Promise<void>;
  logDuplicateDetected(invoiceId: string, originalInvoiceId: string, similarityScore: number, detectionMethod: string, userId?: string, correlationId?: string): Promise<void>;
  logValidationFailed(invoiceId: string, validationErrors: any[], validationType: string, userId?: string, correlationId?: string): Promise<void>;
}

// Supporting types and interfaces
export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    size: number;
    mimeType: string;
    originalName: string;
    extension: string;
  };
}

export interface MaliciousContentResult {
  isSafe: boolean;
  threats: string[];
  confidence: number;
}

export interface DocumentProcessingResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTimeMs: number;
  confidence: number;
  processorVersion: string;
}

export interface ExtractedInvoiceData {
  invoiceNumber: string;
  billTo: string;
  dueDate: string;
  totalAmount: number;
  issueDate?: string;
  vendorName?: string;
  vendorAddress?: string;
  lineItems?: InvoiceLineItem[];
  taxAmount?: number;
  subtotal?: number;
  confidence: number;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ProcessorInfo {
  id: string;
  version: string;
  location: string;
  capabilities: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  value?: any;
}

export interface ProcessingOptions {
  forceReprocess?: boolean;
  skipDuplicateCheck?: boolean;
  skipValidation?: boolean;
  userId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface ProcessingStatus {
  invoiceId: string;
  status: string;
  progress: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
  error?: string;
  startedAt: Date;
  updatedAt: Date;
}

// AuditSearchCriteria is imported from repository interfaces

// Configuration interfaces
export interface DatabaseConfig {
  url: string;
  apiKey: string;
  maxConnections?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
}

export interface GoogleCloudConfig {
  projectId: string;
  location: string;
  processorId: string;
  credentials: {
    clientEmail: string;
    privateKey: string;
  };
  timeout?: number;
  retryAttempts?: number;
}

export interface UploadConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  storageLocation: string;
  tempDirectory?: string;
  cleanupInterval?: number;
}

export interface LoggingConfig {
  level: string;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize?: string;
  maxFiles?: number;
  enableAuditLogging?: boolean;
}

export interface AppConfig {
  database: DatabaseConfig;
  googleCloud: GoogleCloudConfig;
  upload: UploadConfig;
  logging: LoggingConfig;
  port: number;
  frontendUrl: string;
  environment: string;
}