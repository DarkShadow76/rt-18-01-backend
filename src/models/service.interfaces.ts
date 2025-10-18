import { Invoice, InvoiceFilters, InvoiceQueryOptions, InvoiceStats, DuplicateDetectionResult, AuditEntry } from './invoice.entity';

// Repository interfaces
export interface IInvoiceRepository {
  save(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null>;
  findAll(options?: InvoiceQueryOptions): Promise<{
    invoices: Invoice[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  update(id: string, updates: Partial<Invoice>): Promise<Invoice>;
  delete(id: string): Promise<void>;
  findDuplicates(invoice: Partial<Invoice>): Promise<Invoice[]>;
  getStats(filters?: InvoiceFilters): Promise<InvoiceStats>;
  findByContentHash(contentHash: string): Promise<Invoice[]>;
}

export interface IAuditRepository {
  save(auditEntry: AuditEntry): Promise<AuditEntry>;
  findByInvoiceId(invoiceId: string): Promise<AuditEntry[]>;
  findByAction(action: string): Promise<AuditEntry[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<AuditEntry[]>;
  findByUserId(userId: string): Promise<AuditEntry[]>;
}

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
}

export interface IAuditService {
  logAction(invoiceId: string, action: string, changes: Record<string, any>, metadata?: Record<string, any>, userId?: string): Promise<void>;
  getAuditTrail(invoiceId: string): Promise<AuditEntry[]>;
  searchAuditLogs(criteria: AuditSearchCriteria): Promise<AuditEntry[]>;
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

export interface AuditSearchCriteria {
  invoiceId?: string;
  action?: string;
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

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