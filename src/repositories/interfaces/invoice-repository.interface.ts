import { 
  Invoice, 
  InvoiceFilters, 
  InvoiceQueryOptions, 
  InvoiceStats, 
  AuditEntry,
  InvoiceStatus,
  InvoiceMetadata 
} from '../../models/invoice.entity';

// Enhanced repository interface with comprehensive CRUD operations
export interface IInvoiceRepository {
  // Basic CRUD operations
  save(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<Invoice>;
  findById(id: string, includeAuditTrail?: boolean): Promise<Invoice | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null>;
  update(id: string, updates: Partial<Invoice>): Promise<Invoice>;
  delete(id: string): Promise<void>;
  
  // Advanced querying and filtering
  findAll(options?: InvoiceQueryOptions): Promise<{
    invoices: Invoice[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  
  // Filtering and search capabilities
  findByFilters(filters: InvoiceFilters): Promise<Invoice[]>;
  findByStatus(status: InvoiceStatus[]): Promise<Invoice[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<Invoice[]>;
  findByAmountRange(minAmount: number, maxAmount: number): Promise<Invoice[]>;
  searchByBillTo(searchTerm: string): Promise<Invoice[]>;
  
  // Duplicate detection support
  findDuplicates(invoice: Partial<Invoice>): Promise<Invoice[]>;
  findByContentHash(contentHash: string): Promise<Invoice[]>;
  findSimilarInvoices(invoiceNumber: string, billTo: string): Promise<Invoice[]>;
  
  // Statistics and reporting
  count(filters?: InvoiceFilters): Promise<number>;
  getStats(filters?: InvoiceFilters): Promise<InvoiceStats>;
  getProcessingMetrics(dateFrom?: Date, dateTo?: Date): Promise<ProcessingMetrics>;
  
  // Audit trail operations
  saveWithAudit(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>, auditEntry: Omit<AuditEntry, 'id' | 'invoiceId' | 'timestamp'>): Promise<Invoice>;
  updateWithAudit(id: string, updates: Partial<Invoice>, auditEntry: Omit<AuditEntry, 'id' | 'invoiceId' | 'timestamp'>): Promise<Invoice>;
  deleteWithAudit(id: string, auditEntry: Omit<AuditEntry, 'id' | 'invoiceId' | 'timestamp'>): Promise<void>;
  
  // Batch operations
  saveBatch(invoices: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Invoice[]>;
  updateBatch(updates: { id: string; updates: Partial<Invoice> }[]): Promise<Invoice[]>;
  
  // Health and maintenance
  healthCheck(): Promise<RepositoryHealthStatus>;
  cleanup(olderThanDays: number): Promise<number>;
}

// Audit repository interface for dedicated audit operations
export interface IAuditRepository {
  // Basic audit operations
  save(auditEntry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry>;
  findById(id: string): Promise<AuditEntry | null>;
  
  // Query operations
  findByInvoiceId(invoiceId: string, options?: AuditQueryOptions): Promise<AuditEntry[]>;
  findByAction(action: string, options?: AuditQueryOptions): Promise<AuditEntry[]>;
  findByUserId(userId: string, options?: AuditQueryOptions): Promise<AuditEntry[]>;
  findByDateRange(startDate: Date, endDate: Date, options?: AuditQueryOptions): Promise<AuditEntry[]>;
  findByCorrelationId(correlationId: string): Promise<AuditEntry[]>;
  
  // Advanced search
  search(criteria: AuditSearchCriteria): Promise<{
    entries: AuditEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  
  // Statistics and reporting
  count(criteria?: AuditSearchCriteria): Promise<number>;
  getActionStats(dateFrom?: Date, dateTo?: Date): Promise<AuditActionStats>;
  getUserActivityStats(userId: string, dateFrom?: Date, dateTo?: Date): Promise<UserActivityStats>;
  
  // Maintenance
  cleanup(olderThanDays: number): Promise<number>;
  healthCheck(): Promise<RepositoryHealthStatus>;
}

// Supporting interfaces
export interface ProcessingMetrics {
  totalProcessed: number;
  successRate: number;
  averageProcessingTime: number;
  failureReasons: Record<string, number>;
  duplicateRate: number;
  processingTrends: ProcessingTrend[];
}

export interface ProcessingTrend {
  date: Date;
  processed: number;
  successful: number;
  failed: number;
  averageTime: number;
}

export interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: keyof AuditEntry;
  sortOrder?: 'asc' | 'desc';
}

export interface AuditSearchCriteria {
  invoiceId?: string;
  action?: string;
  userId?: string;
  correlationId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  limit?: number;
  offset?: number;
  sortBy?: keyof AuditEntry;
  sortOrder?: 'asc' | 'desc';
}

export interface AuditActionStats {
  totalActions: number;
  actionCounts: Record<string, number>;
  userCounts: Record<string, number>;
  dailyActivity: DailyActivityStats[];
}

export interface DailyActivityStats {
  date: Date;
  actionCount: number;
  uniqueUsers: number;
  topActions: Record<string, number>;
}

export interface UserActivityStats {
  userId: string;
  totalActions: number;
  actionBreakdown: Record<string, number>;
  firstActivity: Date;
  lastActivity: Date;
  averageActionsPerDay: number;
}

export interface RepositoryHealthStatus {
  isHealthy: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  responseTime: number;
  lastChecked: Date;
  errors: string[];
  warnings: string[];
  metrics: {
    totalRecords: number;
    diskUsage?: string;
    memoryUsage?: string;
    activeConnections?: number;
  };
}

// Re-export commonly used types for convenience
export type { 
  Invoice, 
  InvoiceFilters, 
  InvoiceQueryOptions, 
  InvoiceStats, 
  AuditEntry,
  InvoiceStatus,
  InvoiceMetadata 
} from '../../models/invoice.entity';