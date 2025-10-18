export interface InvoiceFilters {
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  invoiceNumber?: string;
  billTo?: string;
  limit?: number;
  offset?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  billTo: string;
  dueDate: Date;
  totalAmount: number;
  status: InvoiceStatus;
  processingAttempts: number;
  lastProcessedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: InvoiceMetadata;
}

export enum InvoiceStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DUPLICATE = 'duplicate'
}

export interface InvoiceMetadata {
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  processingTimeMs: number;
  extractionConfidence: number;
  documentAiVersion: string;
}

export interface IInvoiceRepository {
  save(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null>;
  findAll(filters?: InvoiceFilters): Promise<Invoice[]>;
  update(id: string, updates: Partial<Invoice>): Promise<Invoice>;
  delete(id: string): Promise<void>;
  count(filters?: InvoiceFilters): Promise<number>;
}