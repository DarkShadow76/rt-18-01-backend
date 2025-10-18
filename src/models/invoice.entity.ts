import { InvoiceStatus } from '../common/dto/upload-invoice.dto';

export interface InvoiceMetadata {
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  processingTimeMs: number;
  extractionConfidence: number;
  documentAiVersion?: string;
  processorId?: string;
  uploadedBy?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry {
  id: string;
  invoiceId: string;
  action: AuditAction;
  timestamp: Date;
  userId?: string;
  changes: Record<string, any>;
  metadata: Record<string, any>;
  correlationId?: string;
}

export enum AuditAction {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
  PROCESSED = 'processed',
  FAILED = 'failed',
  REPROCESSED = 'reprocessed',
  STATUS_CHANGED = 'status_changed',
  DUPLICATE_DETECTED = 'duplicate_detected',
  VALIDATION_FAILED = 'validation_failed',
}

export interface ProcessingAttempt {
  attemptNumber: number;
  timestamp: Date;
  status: InvoiceStatus;
  errorMessage?: string;
  processingTimeMs?: number;
  extractionConfidence?: number;
}

export class Invoice {
  id: string;
  invoiceNumber: string;
  billTo: string;
  dueDate: Date;
  totalAmount: number;
  status: InvoiceStatus;
  processingAttempts: number;
  lastProcessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: InvoiceMetadata;
  auditTrail?: AuditEntry[];
  processingHistory?: ProcessingAttempt[];
  duplicateOf?: string; // Reference to original invoice if this is a duplicate
  contentHash?: string; // Hash for duplicate detection

  constructor(data: Partial<Invoice>) {
    this.id = data.id || '';
    this.invoiceNumber = data.invoiceNumber || '';
    this.billTo = data.billTo || '';
    this.dueDate = data.dueDate || new Date();
    this.totalAmount = data.totalAmount || 0;
    this.status = data.status || InvoiceStatus.UPLOADED;
    this.processingAttempts = data.processingAttempts || 0;
    this.lastProcessedAt = data.lastProcessedAt;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.metadata = data.metadata || {} as InvoiceMetadata;
    this.auditTrail = data.auditTrail || [];
    this.processingHistory = data.processingHistory || [];
    this.duplicateOf = data.duplicateOf;
    this.contentHash = data.contentHash;
  }

  // Helper methods
  isProcessing(): boolean {
    return this.status === InvoiceStatus.PROCESSING;
  }

  isCompleted(): boolean {
    return this.status === InvoiceStatus.COMPLETED;
  }

  isFailed(): boolean {
    return this.status === InvoiceStatus.FAILED;
  }

  isDuplicate(): boolean {
    return this.status === InvoiceStatus.DUPLICATE;
  }

  canReprocess(): boolean {
    return this.status === InvoiceStatus.FAILED || this.status === InvoiceStatus.DUPLICATE;
  }

  updateStatus(newStatus: InvoiceStatus, metadata?: Record<string, any>): void {
    const oldStatus = this.status;
    this.status = newStatus;
    this.updatedAt = new Date();
    
    if (newStatus === InvoiceStatus.PROCESSING || newStatus === InvoiceStatus.COMPLETED || newStatus === InvoiceStatus.FAILED) {
      this.lastProcessedAt = new Date();
      this.processingAttempts += 1;
    }

    // Add to processing history
    if (!this.processingHistory) {
      this.processingHistory = [];
    }
    
    this.processingHistory.push({
      attemptNumber: this.processingAttempts,
      timestamp: new Date(),
      status: newStatus,
      ...metadata,
    });
  }

  addAuditEntry(action: AuditAction, changes: Record<string, any>, metadata: Record<string, any> = {}, userId?: string, correlationId?: string): void {
    if (!this.auditTrail) {
      this.auditTrail = [];
    }

    const auditEntry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      invoiceId: this.id,
      action,
      timestamp: new Date(),
      userId,
      changes,
      metadata,
      correlationId,
    };

    this.auditTrail.push(auditEntry);
  }

  toResponseDto(): any {
    return {
      id: this.id,
      invoiceNumber: this.invoiceNumber,
      billTo: this.billTo,
      dueDate: this.dueDate.toISOString(),
      totalAmount: this.totalAmount,
      status: this.status,
      processingAttempts: this.processingAttempts,
      lastProcessedAt: this.lastProcessedAt?.toISOString(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      metadata: this.metadata,
    };
  }
}

// Additional interfaces for filtering and querying
export interface InvoiceFilters {
  status?: InvoiceStatus[];
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: number;
  amountMax?: number;
  invoiceNumber?: string;
  billTo?: string;
  processingAttemptsMin?: number;
  processingAttemptsMax?: number;
}

export interface InvoiceQueryOptions {
  filters?: InvoiceFilters;
  sortBy?: keyof Invoice;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  includeAuditTrail?: boolean;
  includeProcessingHistory?: boolean;
}

export interface InvoiceStats {
  total: number;
  byStatus: Record<InvoiceStatus, number>;
  averageProcessingTime: number;
  successRate: number;
  duplicateRate: number;
  totalAmount: number;
}

// Duplicate detection interfaces
export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  originalInvoiceId?: string;
  similarityScore?: number;
  detectionMethod: DuplicateDetectionMethod;
  confidence: number;
}

export enum DuplicateDetectionMethod {
  INVOICE_NUMBER = 'invoice_number',
  CONTENT_HASH = 'content_hash',
  FUZZY_MATCH = 'fuzzy_match',
  COMBINED = 'combined',
}

export interface DuplicateRecord {
  id: string;
  originalInvoiceId: string;
  duplicateInvoiceId: string;
  similarityScore: number;
  detectionMethod: DuplicateDetectionMethod;
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: DuplicateResolution;
}

export enum DuplicateResolution {
  KEEP_ORIGINAL = 'keep_original',
  KEEP_DUPLICATE = 'keep_duplicate',
  MERGE = 'merge',
  MANUAL_REVIEW = 'manual_review',
}