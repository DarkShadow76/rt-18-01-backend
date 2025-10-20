import { DocumentAIService } from '../../src/services/document-ai/document-ai.service';
import { InvoiceFixtures } from '../fixtures/invoice-fixtures';

export const createDocumentAIMock = () => {
  const mockDocumentAI = {
    processDocument: jest.fn(),
    extractInvoiceData: jest.fn()
  };

  // Default successful response
  mockDocumentAI.processDocument.mockResolvedValue(
    InvoiceFixtures.createDocumentAiResponse()
  );

  mockDocumentAI.extractInvoiceData.mockResolvedValue({
    invoiceNumber: 'INV-2024-001',
    billTo: 'Test Company Inc.',
    dueDate: '2024-12-31',
    totalAmount: 1500.00,
    confidence: 0.95
  });

  return mockDocumentAI;
};

export const createFailingDocumentAIMock = () => {
  const mockDocumentAI = createDocumentAIMock();
  
  mockDocumentAI.processDocument.mockRejectedValue(
    new Error('Document AI service unavailable')
  );

  return mockDocumentAI;
};

export const createLowConfidenceDocumentAIMock = () => {
  const mockDocumentAI = createDocumentAIMock();
  
  mockDocumentAI.processDocument.mockResolvedValue(
    InvoiceFixtures.createMalformedDocumentAiResponse()
  );

  mockDocumentAI.extractInvoiceData.mockResolvedValue({
    invoiceNumber: '',
    billTo: '',
    dueDate: '',
    totalAmount: 0,
    confidence: 0.1
  });

  return mockDocumentAI;
};