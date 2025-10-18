import { Injectable } from '@nestjs/common';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { ConfigurationService } from '../../config/configuration.service';
import { LoggerService } from '../../common/logger/logger.service';

export interface DocumentProcessingResult {
  success: boolean;
  extractedData?: any;
  error?: string;
  processingTimeMs: number;
  confidence?: number;
}

@Injectable()
export class DocumentAIService {
  private client: DocumentProcessorServiceClient;
  private readonly processorName: string;

  constructor(
    private configService: ConfigurationService,
    private logger: LoggerService
  ) {
    this.initializeClient();
    this.processorName = this.buildProcessorName();
  }

  private initializeClient(): void {
    const credentials = this.configService.googleCloud.credentials;
    
    this.client = new DocumentProcessorServiceClient({
      credentials: {
        client_email: credentials.clientEmail,
        private_key: credentials.privateKey,
      },
      projectId: this.configService.googleCloud.projectId,
    });

    this.logger.log('Document AI client initialized', 'DocumentAIService');
  }

  private buildProcessorName(): string {
    const { projectId, location, processorId } = this.configService.googleCloud;
    return `projects/${projectId}/locations/${location}/processors/${processorId}`;
  }

  async processDocument(fileBuffer: Buffer, mimeType: string): Promise<DocumentProcessingResult> {
    const startTime = Date.now();
    
    this.logger.debug('Starting document processing', 'DocumentAIService', {
      mimeType,
      fileSize: fileBuffer.length,
    });

    try {
      const request = {
        name: this.processorName,
        rawDocument: {
          content: fileBuffer,
          mimeType,
        },
      };

      const [result] = await this.client.processDocument(request);
      const processingTimeMs = Date.now() - startTime;

      if (!result.document) {
        this.logger.error('No document returned from Document AI', undefined, 'DocumentAIService');
        return {
          success: false,
          error: 'No document returned from processing',
          processingTimeMs,
        };
      }

      const extractedData = this.extractInvoiceData(result.document);
      const confidence = this.calculateConfidence(result.document);

      this.logger.log('Document processing completed successfully', 'DocumentAIService', {
        processingTimeMs,
        confidence,
        extractedFieldCount: Object.keys(extractedData).length,
      });

      return {
        success: true,
        extractedData,
        processingTimeMs,
        confidence,
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      this.logger.error('Document processing failed', error.stack, 'DocumentAIService', {
        processingTimeMs,
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        processingTimeMs,
      };
    }
  }

  private extractInvoiceData(document: any): any {
    const extractedData: any = {};

    if (document.entities) {
      for (const entity of document.entities) {
        const entityType = entity.type;
        const entityValue = entity.mentionText || entity.normalizedValue?.text || '';

        switch (entityType) {
          case 'invoice_id':
          case 'invoice_number':
            extractedData.invoiceNumber = entityValue;
            break;
          case 'invoice_date':
            extractedData.invoiceDate = entityValue;
            break;
          case 'due_date':
            extractedData.dueDate = entityValue;
            break;
          case 'total_amount':
          case 'net_amount':
            extractedData.totalAmount = this.parseAmount(entityValue);
            break;
          case 'supplier_name':
          case 'vendor_name':
            extractedData.supplierName = entityValue;
            break;
          case 'receiver_name':
          case 'bill_to':
            extractedData.billTo = entityValue;
            break;
          case 'supplier_address':
            extractedData.supplierAddress = entityValue;
            break;
          case 'receiver_address':
            extractedData.receiverAddress = entityValue;
            break;
        }
      }
    }

    // Fallback to text extraction if entities are not available
    if (Object.keys(extractedData).length === 0 && document.text) {
      this.logger.warn('No entities found, attempting text-based extraction', 'DocumentAIService');
      extractedData.rawText = document.text;
    }

    return extractedData;
  }

  private calculateConfidence(document: any): number {
    if (!document.entities || document.entities.length === 0) {
      return 0;
    }

    const confidenceScores = document.entities
      .filter((entity: any) => entity.confidence !== undefined)
      .map((entity: any) => entity.confidence);

    if (confidenceScores.length === 0) {
      return 0.5; // Default confidence when not available
    }

    return confidenceScores.reduce((sum: number, score: number) => sum + score, 0) / confidenceScores.length;
  }

  private parseAmount(amountString: string): number | null {
    if (!amountString) return null;

    // Remove currency symbols and whitespace
    const cleanAmount = amountString.replace(/[$€£¥,\s]/g, '');
    const parsed = parseFloat(cleanAmount);

    return isNaN(parsed) ? null : parsed;
  }
}