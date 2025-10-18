// Legacy interface - kept for backward compatibility
export interface DocumentData {
  invoiceNumber: string;
  billTo: string;
  dueDate: string;
  totalAmount: number;
}

// Enhanced document data interface
export interface EnhancedDocumentData extends DocumentData {
  issueDate?: string;
  vendorName?: string;
  vendorAddress?: string;
  customerAddress?: string;
  lineItems?: DocumentLineItem[];
  taxAmount?: number;
  subtotal?: number;
  currency?: string;
  paymentTerms?: string;
  poNumber?: string;
  confidence: number;
  extractionMetadata: {
    processingTimeMs: number;
    processorVersion: string;
    extractionMethod: string;
    confidenceScores: Record<string, number>;
  };
}

export interface DocumentLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxRate?: number;
  category?: string;
}

// Document processing result
export interface DocumentProcessingResult {
  success: boolean;
  data?: EnhancedDocumentData;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  processingTimeMs: number;
  confidence: number;
  processorInfo: {
    id: string;
    version: string;
    location: string;
  };
}