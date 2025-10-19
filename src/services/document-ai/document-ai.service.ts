import { Injectable } from '@nestjs/common';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { ConfigurationService } from '../../config/configuration.service';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError, ErrorType } from '../../common/errors/app-error';
import * as crypto from 'crypto';

export interface DocumentProcessingResult {
  success: boolean;
  extractedData?: any;
  error?: string;
  processingTimeMs: number;
  confidence?: number;
  retryCount?: number;
  correlationId?: string;
  metadata?: {
    documentPages?: number;
    documentText?: string;
    entityCount?: number;
    processingVersion?: string;
  };
}

export interface DocumentProcessingOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  enableImageQualityScores?: boolean;
  skipLowConfidenceEntities?: boolean;
  confidenceThreshold?: number;
}

export interface ProcessingMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageProcessingTime: number;
  retryCount: number;
}

@Injectable()
export class DocumentAIService {
  private client: DocumentProcessorServiceClient;
  private readonly processorName: string;
  private readonly metrics: ProcessingMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageProcessingTime: 0,
    retryCount: 0,
  };

  private readonly DEFAULT_OPTIONS: DocumentProcessingOptions = {
    maxRetries: 3,
    retryDelayMs: 1000,
    enableImageQualityScores: true,
    skipLowConfidenceEntities: false,
    confidenceThreshold: 0.5,
  };

  constructor(
    private configService: ConfigurationService,
    private logger: LoggerService
  ) {
    this.initializeClient();
    this.processorName = this.buildProcessorName();
  }

  private initializeClient(): void {
    try {
      const credentials = this.configService.googleCloud.credentials;
      
      if (!credentials.clientEmail || !credentials.privateKey) {
        throw AppError.configurationError(
          'Google Cloud credentials are missing or invalid'
        );
      }

      this.client = new DocumentProcessorServiceClient({
        credentials: {
          client_email: credentials.clientEmail,
          private_key: credentials.privateKey,
        },
        projectId: this.configService.googleCloud.projectId,
      });

      this.logger.log('Document AI client initialized successfully', 'DocumentAIService', {
        projectId: this.configService.googleCloud.projectId,
        location: this.configService.googleCloud.location,
      });
    } catch (error) {
      this.logger.error('Failed to initialize Document AI client', error.stack, 'DocumentAIService', {
        error: error.message,
      });
      throw error;
    }
  }

  private buildProcessorName(): string {
    const { projectId, location, processorId } = this.configService.googleCloud;
    return `projects/${projectId}/locations/${location}/processors/${processorId}`;
  }

  async processDocument(file: Express.Multer.File): Promise<DocumentProcessingResult> {
    return this.processDocumentBuffer(file.buffer, file.mimetype, {});
  }

  async processDocumentBuffer(
    fileBuffer: Buffer, 
    mimeType: string, 
    options: DocumentProcessingOptions = {}
  ): Promise<DocumentProcessingResult> {
    const correlationId = crypto.randomUUID();
    const startTime = Date.now();
    const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };
    
    this.metrics.totalRequests++;

    this.logger.debug('Starting document processing', 'DocumentAIService', {
      mimeType,
      fileSize: fileBuffer.length,
      correlationId,
      maxRetries: mergedOptions.maxRetries,
    });

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= mergedOptions.maxRetries!; attempt++) {
      try {
        if (attempt > 0) {
          retryCount++;
          this.metrics.retryCount++;
          
          this.logger.warn(`Retrying document processing (attempt ${attempt + 1})`, 'DocumentAIService', {
            correlationId,
            attempt: attempt + 1,
            maxRetries: mergedOptions.maxRetries! + 1,
          });

          // Exponential backoff delay
          const delay = mergedOptions.retryDelayMs! * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }

        const result = await this.processDocumentInternal(
          fileBuffer, 
          mimeType, 
          mergedOptions, 
          correlationId
        );

        const processingTimeMs = Date.now() - startTime;
        
        if (result.success) {
          this.metrics.successfulRequests++;
          this.updateAverageProcessingTime(processingTimeMs);
          
          this.logger.log('Document processing completed successfully', 'DocumentAIService', {
            processingTimeMs,
            confidence: result.confidence,
            extractedFieldCount: result.extractedData ? Object.keys(result.extractedData).length : 0,
            correlationId,
            retryCount,
          });
        } else {
          this.metrics.failedRequests++;
        }

        // Update the result with actual processing time
        result.processingTimeMs = processingTimeMs;

        return {
          ...result,
          retryCount,
          correlationId,
        };

      } catch (error) {
        lastError = error;
        
        if (this.isRetryableError(error)) {
          this.logger.warn(`Document processing attempt ${attempt + 1} failed, will retry`, 'DocumentAIService', {
            correlationId,
            error: error.message,
            attempt: attempt + 1,
            maxRetries: mergedOptions.maxRetries! + 1,
          });
          continue;
        } else {
          // Non-retryable error, break immediately
          this.logger.error('Document processing failed with non-retryable error', error.stack, 'DocumentAIService', {
            correlationId,
            error: error.message,
            attempt: attempt + 1,
          });
          break;
        }
      }
    }

    // All retries exhausted or non-retryable error
    const processingTimeMs = Date.now() - startTime;
    this.metrics.failedRequests++;

    this.logger.error('Document processing failed after all retries', lastError?.stack, 'DocumentAIService', {
      correlationId,
      error: lastError?.message,
      retryCount,
      processingTimeMs,
    });

    return {
      success: false,
      error: lastError?.message || 'Unknown error occurred',
      processingTimeMs,
      retryCount,
      correlationId,
    };
  }

  private async processDocumentInternal(
    fileBuffer: Buffer,
    mimeType: string,
    options: DocumentProcessingOptions,
    correlationId: string
  ): Promise<DocumentProcessingResult> {
    const request = {
      name: this.processorName,
      rawDocument: {
        content: fileBuffer.toString('base64'),
        mimeType,
      },
      processOptions: {
        ocrConfig: {
          enableImageQualityScores: options.enableImageQualityScores,
        },
      },
    };

    const [result] = await this.client.processDocument(request);

    if (!result.document) {
      throw AppError.externalServiceError(
        'No document returned from Document AI processing',
        { correlationId },
        correlationId
      );
    }

    const extractedData = this.extractInvoiceData(result.document, options);
    const confidence = this.calculateConfidence(result.document);
    
    // Check if confidence meets threshold
    if (confidence < options.confidenceThreshold!) {
      this.logger.warn('Document processing confidence below threshold', 'DocumentAIService', {
        confidence,
        threshold: options.confidenceThreshold,
        correlationId,
      });
    }

    const metadata = {
      documentPages: result.document.pages?.length || 0,
      documentText: result.document.text?.substring(0, 200) + '...' || '',
      entityCount: result.document.entities?.length || 0,
      processingVersion: result.document.revisions?.[0]?.agent || 'unknown',
    };

    return {
      success: true,
      extractedData,
      confidence,
      processingTimeMs: 0, // Will be set by the calling method
      metadata,
    };
  }

  private extractInvoiceData(document: any, options: DocumentProcessingOptions): any {
    const extractedData: any = {};
    const entityConfidences: Record<string, number> = {};

    if (document.entities) {
      for (const entity of document.entities) {
        const entityType = entity.type;
        const entityValue = entity.mentionText || entity.normalizedValue?.text || '';
        const entityConfidence = entity.confidence || 0;

        // Skip low confidence entities if option is enabled
        if (options.skipLowConfidenceEntities && entityConfidence < options.confidenceThreshold!) {
          this.logger.debug(`Skipping low confidence entity: ${entityType}`, 'DocumentAIService', {
            entityType,
            confidence: entityConfidence,
            threshold: options.confidenceThreshold,
          });
          continue;
        }

        switch (entityType) {
          case 'invoice_id':
          case 'invoice_number':
            extractedData.invoiceNumber = entityValue.trim();
            entityConfidences.invoiceNumber = entityConfidence;
            break;
          case 'invoice_date':
            extractedData.invoiceDate = this.parseDate(entityValue);
            entityConfidences.invoiceDate = entityConfidence;
            break;
          case 'due_date':
            extractedData.dueDate = this.parseDate(entityValue);
            entityConfidences.dueDate = entityConfidence;
            break;
          case 'total_amount':
          case 'net_amount':
            const amount = this.parseAmount(entityValue);
            if (amount !== null) {
              extractedData.totalAmount = amount;
              entityConfidences.totalAmount = entityConfidence;
            }
            break;
          case 'supplier_name':
          case 'vendor_name':
            extractedData.supplierName = entityValue.trim();
            entityConfidences.supplierName = entityConfidence;
            break;
          case 'receiver_name':
          case 'bill_to':
            extractedData.billTo = entityValue.trim();
            entityConfidences.billTo = entityConfidence;
            break;
          case 'supplier_address':
            extractedData.supplierAddress = entityValue.trim();
            entityConfidences.supplierAddress = entityConfidence;
            break;
          case 'receiver_address':
            extractedData.receiverAddress = entityValue.trim();
            entityConfidences.receiverAddress = entityConfidence;
            break;
          case 'tax_amount':
            const taxAmount = this.parseAmount(entityValue);
            if (taxAmount !== null) {
              extractedData.taxAmount = taxAmount;
              entityConfidences.taxAmount = entityConfidence;
            }
            break;
          case 'currency':
            extractedData.currency = entityValue.trim();
            entityConfidences.currency = entityConfidence;
            break;
        }
      }
    }

    // Add confidence scores to extracted data
    if (Object.keys(entityConfidences).length > 0) {
      extractedData._confidences = entityConfidences;
    }

    // Fallback to text extraction if entities are not available
    if (Object.keys(extractedData).length === 0 && document.text) {
      this.logger.warn('No entities found, attempting text-based extraction', 'DocumentAIService');
      extractedData.rawText = document.text.substring(0, 1000); // Limit raw text length
      extractedData._fallbackExtraction = true;
    }

    // Validate required fields
    this.validateExtractedData(extractedData);

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

    // Remove currency symbols, whitespace, and common formatting
    const cleanAmount = amountString
      .replace(/[$€£¥₹¢₽₩₪₦₨₡₵₴₸₼₾₿,\s]/g, '')
      .replace(/[()]/g, '') // Remove parentheses (sometimes used for negative amounts)
      .trim();

    if (!cleanAmount) return null;

    const parsed = parseFloat(cleanAmount);
    return isNaN(parsed) ? null : parsed;
  }

  private parseDate(dateString: string): string | null {
    if (!dateString) return null;

    try {
      // Try to parse the date and return in ISO format
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        // If direct parsing fails, try common date formats
        const formats = [
          /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // MM/DD/YYYY or DD/MM/YYYY
          /(\d{4})-(\d{1,2})-(\d{1,2})/,    // YYYY-MM-DD
          /(\d{1,2})-(\d{1,2})-(\d{4})/,    // MM-DD-YYYY or DD-MM-YYYY
        ];

        for (const format of formats) {
          const match = dateString.match(format);
          if (match) {
            return dateString.trim(); // Return original format if it matches a pattern
          }
        }
        
        return dateString.trim(); // Return as-is if no format matches
      }
      
      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch (error) {
      this.logger.warn('Failed to parse date', 'DocumentAIService', {
        dateString,
        error: error.message,
      });
      return dateString.trim();
    }
  }

  private validateExtractedData(extractedData: any): void {
    const warnings: string[] = [];

    // Check for required fields
    if (!extractedData.invoiceNumber) {
      warnings.push('Invoice number not found');
    }

    if (!extractedData.totalAmount && !extractedData.rawText) {
      warnings.push('Total amount not found');
    }

    if (!extractedData.dueDate && !extractedData.rawText) {
      warnings.push('Due date not found');
    }

    if (warnings.length > 0) {
      this.logger.warn('Extracted data validation warnings', 'DocumentAIService', {
        warnings,
        extractedFields: Object.keys(extractedData),
      });
    }
  }

  private isRetryableError(error: any): boolean {
    // Check for retryable error conditions
    const retryableErrors = [
      'DEADLINE_EXCEEDED',
      'UNAVAILABLE',
      'INTERNAL',
      'RESOURCE_EXHAUSTED',
      'ABORTED',
    ];

    const errorCode = error.code || error.status;
    const errorMessage = error.message?.toLowerCase() || '';

    // Check by error code
    if (retryableErrors.includes(errorCode)) {
      return true;
    }

    // Check by error message patterns
    const retryablePatterns = [
      'timeout',
      'connection',
      'network',
      'temporary',
      'rate limit',
      'quota exceeded',
    ];

    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateAverageProcessingTime(processingTimeMs: number): void {
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.successfulRequests - 1);
    this.metrics.averageProcessingTime = (totalTime + processingTimeMs) / this.metrics.successfulRequests;
  }

  /**
   * Get processing metrics for monitoring
   */
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  resetMetrics(): void {
    this.metrics.totalRequests = 0;
    this.metrics.successfulRequests = 0;
    this.metrics.failedRequests = 0;
    this.metrics.averageProcessingTime = 0;
    this.metrics.retryCount = 0;
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      // Simple test to verify client connectivity
      const testRequest = {
        name: this.processorName,
        rawDocument: {
          content: Buffer.from('test').toString('base64'),
          mimeType: 'text/plain',
        },
      };

      // This will likely fail but should give us connectivity info
      await this.client.processDocument(testRequest);
      
      return {
        status: 'healthy',
        details: {
          processorName: this.processorName,
          metrics: this.getMetrics(),
        },
      };
    } catch (error) {
      // Expected to fail with test data, but connection errors are concerning
      if (this.isRetryableError(error)) {
        return {
          status: 'unhealthy',
          details: {
            error: error.message,
            processorName: this.processorName,
          },
        };
      }

      // Non-retryable errors with test data are expected
      return {
        status: 'healthy',
        details: {
          processorName: this.processorName,
          metrics: this.getMetrics(),
          note: 'Service accessible but test data rejected (expected)',
        },
      };
    }
  }
}