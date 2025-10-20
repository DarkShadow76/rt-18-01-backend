import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError, ErrorType } from '../../common/errors/app-error';
import * as crypto from 'crypto';

export interface ExtractedInvoiceData {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount?: number;
  taxAmount?: number;
  supplierName?: string;
  billTo?: string;
  supplierAddress?: string;
  receiverAddress?: string;
  currency?: string;
  rawText?: string;
  _confidences?: Record<string, number>;
  _fallbackExtraction?: boolean;
}

export interface DataExtractionResult {
  success: boolean;
  extractedData?: ExtractedInvoiceData;
  validationErrors: string[];
  validationWarnings: string[];
  qualityScore: number;
  confidence: number;
  correlationId: string;
  metadata: {
    extractionMethod: 'entity' | 'fallback' | 'hybrid';
    fieldsExtracted: number;
    requiredFieldsMissing: string[];
    dataQualityIssues: string[];
  };
}

export interface DataExtractionOptions {
  requireInvoiceNumber?: boolean;
  requireTotalAmount?: boolean;
  requireDueDate?: boolean;
  minimumConfidence?: number;
  enableFallbackExtraction?: boolean;
  strictValidation?: boolean;
}

export interface FieldValidationRule {
  field: string;
  required: boolean;
  validator: (value: any) => { isValid: boolean; error?: string };
  confidence?: number;
}

@Injectable()
export class DataExtractionService {
  private readonly DEFAULT_OPTIONS: DataExtractionOptions = {
    requireInvoiceNumber: true,
    requireTotalAmount: true,
    requireDueDate: true,
    minimumConfidence: 0.5,
    enableFallbackExtraction: true,
    strictValidation: false,
  };

  private readonly FIELD_VALIDATION_RULES: FieldValidationRule[] = [
    {
      field: 'invoiceNumber',
      required: true,
      validator: this.validateInvoiceNumber.bind(this),
    },
    {
      field: 'totalAmount',
      required: true,
      validator: this.validateAmount.bind(this),
    },
    {
      field: 'dueDate',
      required: true,
      validator: this.validateDate.bind(this),
    },
    {
      field: 'invoiceDate',
      required: false,
      validator: this.validateDate.bind(this),
    },
    {
      field: 'taxAmount',
      required: false,
      validator: this.validateAmount.bind(this),
    },
    {
      field: 'supplierName',
      required: false,
      validator: this.validateText.bind(this),
    },
    {
      field: 'billTo',
      required: false,
      validator: this.validateText.bind(this),
    },
  ];

  constructor(private logger: LoggerService) {}

  async extractAndValidateData(
    rawData: any,
    options: DataExtractionOptions = {}
  ): Promise<DataExtractionResult> {
    const correlationId = crypto.randomUUID();
    const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };

    this.logger.debug('Starting data extraction and validation', 'DataExtractionService', {
      correlationId,
      hasRawData: !!rawData,
      options: mergedOptions,
    });

    try {
      // Extract data from raw input
      const extractedData = this.extractDataFromRaw(rawData);
      
      // Determine extraction method
      const extractionMethod = this.determineExtractionMethod(extractedData);
      
      // Validate extracted data
      const validationResult = this.validateExtractedData(extractedData, mergedOptions);
      
      // Calculate quality score
      const qualityScore = this.calculateQualityScore(extractedData, validationResult);
      
      // Calculate overall confidence
      const confidence = this.calculateOverallConfidence(extractedData);

      // Determine success based on validation results and data availability
      const hasAnyData = Object.keys(extractedData).filter(key => !key.startsWith('_')).length > 0;
      const hasValidationErrors = validationResult.validationErrors.length > 0;
      
      // Success requires: having data AND no validation errors
      // In strict mode, also require minimum confidence
      const shouldSucceed = hasAnyData && !hasValidationErrors && 
                           (!mergedOptions.strictValidation || confidence >= mergedOptions.minimumConfidence!);

      const result: DataExtractionResult = {
        success: shouldSucceed,
        extractedData,
        validationErrors: validationResult.validationErrors,
        validationWarnings: validationResult.validationWarnings,
        qualityScore,
        confidence,
        correlationId,
        metadata: {
          extractionMethod,
          fieldsExtracted: Object.keys(extractedData).filter(key => !key.startsWith('_')).length,
          requiredFieldsMissing: validationResult.requiredFieldsMissing,
          dataQualityIssues: validationResult.dataQualityIssues,
        },
      };

      this.logger.debug('Data extraction completed', 'DataExtractionService', {
        correlationId,
        success: result.success,
        fieldsExtracted: result.metadata.fieldsExtracted,
        qualityScore: result.qualityScore,
        confidence: result.confidence,
      });

      if (!result.success) {
        this.logger.warn('Data extraction validation failed', 'DataExtractionService', {
          correlationId,
          validationErrors: result.validationErrors,
          extractionMethod: result.metadata.extractionMethod,
        });
      }

      return result;

    } catch (error) {
      this.logger.error('Error during data extraction', error.stack, 'DataExtractionService', {
        correlationId,
        error: error.message,
      });

      throw AppError.processingError(
        'Data extraction failed due to internal error',
        { originalError: error.message },
        correlationId
      );
    }
  }

  private extractDataFromRaw(rawData: any): ExtractedInvoiceData {
    if (!rawData) {
      return {};
    }

    // If it's already extracted data, return as-is
    if (this.isExtractedInvoiceData(rawData)) {
      return rawData;
    }

    // If it's raw text, attempt text-based extraction
    if (typeof rawData === 'string') {
      return this.extractFromText(rawData);
    }

    // If it's a document AI response, extract from entities
    if (rawData.entities || rawData.text) {
      return this.extractFromDocumentAI(rawData);
    }

    // Unknown format
    this.logger.warn('Unknown raw data format for extraction', 'DataExtractionService', {
      dataType: typeof rawData,
      hasEntities: !!rawData.entities,
      hasText: !!rawData.text,
    });

    return {};
  }

  private extractFromDocumentAI(documentData: any): ExtractedInvoiceData {
    const extractedData: ExtractedInvoiceData = {};
    const confidences: Record<string, number> = {};

    if (documentData.entities) {
      for (const entity of documentData.entities) {
        const entityType = entity.type;
        const entityValue = entity.mentionText || entity.normalizedValue?.text || '';
        const entityConfidence = entity.confidence || 0;

        switch (entityType) {
          case 'invoice_id':
          case 'invoice_number':
            extractedData.invoiceNumber = this.cleanText(entityValue);
            confidences.invoiceNumber = entityConfidence;
            break;
          case 'invoice_date':
            extractedData.invoiceDate = this.parseDate(entityValue);
            confidences.invoiceDate = entityConfidence;
            break;
          case 'due_date':
            extractedData.dueDate = this.parseDate(entityValue);
            confidences.dueDate = entityConfidence;
            break;
          case 'total_amount':
          case 'net_amount':
            const amount = this.parseAmount(entityValue);
            if (amount !== null) {
              extractedData.totalAmount = amount;
              confidences.totalAmount = entityConfidence;
            }
            break;
          case 'tax_amount':
            const taxAmount = this.parseAmount(entityValue);
            if (taxAmount !== null) {
              extractedData.taxAmount = taxAmount;
              confidences.taxAmount = entityConfidence;
            }
            break;
          case 'supplier_name':
          case 'vendor_name':
            extractedData.supplierName = this.cleanText(entityValue);
            confidences.supplierName = entityConfidence;
            break;
          case 'receiver_name':
          case 'bill_to':
            extractedData.billTo = this.cleanText(entityValue);
            confidences.billTo = entityConfidence;
            break;
          case 'supplier_address':
            extractedData.supplierAddress = this.cleanText(entityValue);
            confidences.supplierAddress = entityConfidence;
            break;
          case 'receiver_address':
            extractedData.receiverAddress = this.cleanText(entityValue);
            confidences.receiverAddress = entityConfidence;
            break;
          case 'currency':
            extractedData.currency = this.cleanText(entityValue);
            confidences.currency = entityConfidence;
            break;
        }
      }
    }

    if (Object.keys(confidences).length > 0) {
      extractedData._confidences = confidences;
    }

    // Fallback to text extraction if no entities found
    if (Object.keys(extractedData).filter(key => !key.startsWith('_')).length === 0 && documentData.text) {
      const textExtracted = this.extractFromText(documentData.text);
      return { ...textExtracted, _fallbackExtraction: true };
    }

    return extractedData;
  }

  private extractFromText(text: string): ExtractedInvoiceData {
    const extractedData: ExtractedInvoiceData = {};

    // Invoice number patterns - using exec for better matching
    const invoicePatterns = [
      /invoice\s*#?\s*:?\s*([A-Z0-9\-]+)/gi,
      /inv\s*#?\s*:?\s*([A-Z0-9\-]+)/gi,
      /bill\s*#?\s*:?\s*([A-Z0-9\-]+)/gi,
      /#([A-Z0-9\-]+)/gi,
    ];

    for (const pattern of invoicePatterns) {
      pattern.lastIndex = 0; // Reset regex
      const match = pattern.exec(text);
      if (match && match[1]) {
        extractedData.invoiceNumber = match[1].trim();
        break;
      }
    }

    // Amount patterns - using exec for better matching
    const amountPatterns = [
      /total\s*:?\s*\$?([0-9,]+\.?[0-9]*)/gi,
      /amount\s*:?\s*\$?([0-9,]+\.?[0-9]*)/gi,
      /\$([0-9,]+\.?[0-9]*)/g,
    ];

    for (const pattern of amountPatterns) {
      pattern.lastIndex = 0; // Reset regex
      const match = pattern.exec(text);
      if (match && match[1]) {
        const amount = this.parseAmount(match[1]);
        if (amount !== null) {
          extractedData.totalAmount = amount;
          break;
        }
      }
    }

    // Date patterns - using exec for better matching
    const datePatterns = [
      /due\s*:?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/gi,
      /date\s*:?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/gi,
    ];

    for (const pattern of datePatterns) {
      pattern.lastIndex = 0; // Reset regex
      const match = pattern.exec(text);
      if (match && match[1]) {
        extractedData.dueDate = this.parseDate(match[1]);
        break;
      }
    }

    extractedData.rawText = text.substring(0, 500); // Store first 500 chars
    extractedData._fallbackExtraction = true;

    return extractedData;
  }

  private validateExtractedData(
    data: ExtractedInvoiceData,
    options: DataExtractionOptions
  ): {
    validationErrors: string[];
    validationWarnings: string[];
    requiredFieldsMissing: string[];
    dataQualityIssues: string[];
  } {
    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];
    const requiredFieldsMissing: string[] = [];
    const dataQualityIssues: string[] = [];

    // Apply field validation rules
    for (const rule of this.FIELD_VALIDATION_RULES) {
      const fieldValue = data[rule.field as keyof ExtractedInvoiceData];
      const isRequired = this.isFieldRequired(rule.field, options);

      if (isRequired && (fieldValue === undefined || fieldValue === null)) {
        requiredFieldsMissing.push(rule.field);
        validationErrors.push(`Required field '${rule.field}' is missing`);
        continue;
      }

      if (fieldValue !== undefined && fieldValue !== null) {
        const validationResult = rule.validator(fieldValue);
        if (!validationResult.isValid) {
          if (isRequired) {
            validationErrors.push(`Invalid ${rule.field}: ${validationResult.error}`);
          } else {
            validationWarnings.push(`Invalid ${rule.field}: ${validationResult.error}`);
          }
          dataQualityIssues.push(`${rule.field}: ${validationResult.error}`);
        }
      }
    }

    // Check confidence levels
    if (data._confidences) {
      for (const [field, confidence] of Object.entries(data._confidences)) {
        if (confidence < options.minimumConfidence!) {
          validationWarnings.push(
            `Low confidence for ${field}: ${confidence.toFixed(2)} < ${options.minimumConfidence}`
          );
          dataQualityIssues.push(`Low confidence: ${field}`);
        }
      }
    }

    // Business logic validations
    if (data.invoiceDate && data.dueDate) {
      const invoiceDate = new Date(data.invoiceDate);
      const dueDate = new Date(data.dueDate);
      
      if (dueDate < invoiceDate) {
        validationWarnings.push('Due date is before invoice date');
        dataQualityIssues.push('Date logic issue');
      }
    }

    if (data.totalAmount && data.taxAmount) {
      if (data.taxAmount > data.totalAmount) {
        validationWarnings.push('Tax amount exceeds total amount');
        dataQualityIssues.push('Amount logic issue');
      }
    }

    return {
      validationErrors,
      validationWarnings,
      requiredFieldsMissing,
      dataQualityIssues,
    };
  }

  private calculateQualityScore(
    data: ExtractedInvoiceData,
    validationResult: any
  ): number {
    let score = 0;
    const maxScore = 100;

    // Base score for having data
    if (Object.keys(data).filter(key => !key.startsWith('_')).length > 0) {
      score += 20;
    }

    // Score for required fields
    const requiredFields = ['invoiceNumber', 'totalAmount', 'dueDate'];
    const presentRequiredFields = requiredFields.filter(field => 
      data[field as keyof ExtractedInvoiceData] !== undefined
    );
    score += (presentRequiredFields.length / requiredFields.length) * 40;

    // Score for optional fields
    const optionalFields = ['supplierName', 'billTo', 'invoiceDate', 'currency'];
    const presentOptionalFields = optionalFields.filter(field => 
      data[field as keyof ExtractedInvoiceData] !== undefined
    );
    score += (presentOptionalFields.length / optionalFields.length) * 20;

    // Deduct for validation errors
    score -= validationResult.validationErrors.length * 10;
    score -= validationResult.validationWarnings.length * 5;

    // Bonus for high confidence
    if (data._confidences) {
      const avgConfidence = Object.values(data._confidences).reduce((a, b) => a + b, 0) / 
                           Object.values(data._confidences).length;
      if (avgConfidence > 0.8) {
        score += 10;
      }
    }

    // Penalty for fallback extraction
    if (data._fallbackExtraction) {
      score -= 15;
    }

    return Math.max(0, Math.min(maxScore, score));
  }

  private calculateOverallConfidence(data: ExtractedInvoiceData): number {
    if (!data._confidences || Object.keys(data._confidences).length === 0) {
      return data._fallbackExtraction ? 0.3 : 0.5;
    }

    const confidenceValues = Object.values(data._confidences);
    return confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length;
  }

  private determineExtractionMethod(data: ExtractedInvoiceData): 'entity' | 'fallback' | 'hybrid' {
    if (data._fallbackExtraction) {
      return data._confidences ? 'hybrid' : 'fallback';
    }
    return 'entity';
  }

  private isFieldRequired(field: string, options: DataExtractionOptions): boolean {
    switch (field) {
      case 'invoiceNumber':
        return options.requireInvoiceNumber!;
      case 'totalAmount':
        return options.requireTotalAmount!;
      case 'dueDate':
        return options.requireDueDate!;
      default:
        return false;
    }
  }

  private isExtractedInvoiceData(obj: any): obj is ExtractedInvoiceData {
    return obj && typeof obj === 'object' && 
           (obj.invoiceNumber !== undefined || obj.totalAmount !== undefined || obj.dueDate !== undefined);
  }

  // Validation methods
  private validateInvoiceNumber(value: any): { isValid: boolean; error?: string } {
    if (typeof value !== 'string') {
      return { isValid: false, error: 'must be a string' };
    }

    const cleaned = value.trim();
    if (cleaned.length === 0) {
      return { isValid: false, error: 'cannot be empty' };
    }

    if (cleaned.length > 50) {
      return { isValid: false, error: 'too long (max 50 characters)' };
    }

    // Basic format validation
    if (!/^[A-Z0-9\-_#]+$/i.test(cleaned)) {
      return { isValid: false, error: 'contains invalid characters' };
    }

    return { isValid: true };
  }

  private validateAmount(value: any): { isValid: boolean; error?: string } {
    if (typeof value !== 'number') {
      return { isValid: false, error: 'must be a number' };
    }

    if (isNaN(value) || !isFinite(value)) {
      return { isValid: false, error: 'must be a valid number' };
    }

    if (value < 0) {
      return { isValid: false, error: 'cannot be negative' };
    }

    if (value > 1000000) {
      return { isValid: false, error: 'amount too large (max 1,000,000)' };
    }

    return { isValid: true };
  }

  private validateDate(value: any): { isValid: boolean; error?: string } {
    if (typeof value !== 'string') {
      return { isValid: false, error: 'must be a string' };
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { isValid: false, error: 'invalid date format' };
    }

    // Check reasonable date range (not too far in past or future)
    const now = new Date();
    const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    const fiveYearsFromNow = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());

    if (date < tenYearsAgo || date > fiveYearsFromNow) {
      return { isValid: false, error: 'date outside reasonable range' };
    }

    return { isValid: true };
  }

  private validateText(value: any): { isValid: boolean; error?: string } {
    if (typeof value !== 'string') {
      return { isValid: false, error: 'must be a string' };
    }

    const cleaned = value.trim();
    if (cleaned.length === 0) {
      return { isValid: false, error: 'cannot be empty' };
    }

    if (cleaned.length > 200) {
      return { isValid: false, error: 'too long (max 200 characters)' };
    }

    return { isValid: true };
  }

  // Utility methods
  private cleanText(text: string): string {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ');
  }

  private parseAmount(amountString: string): number | null {
    if (!amountString) return null;

    let cleanAmount = amountString.trim();

    // Handle European format (1.234,56 -> 1234.56)
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(cleanAmount.replace(/[€£¥₹¢₽₩₪₦₨₡₵₴₸₼₾₿$\s]/g, ''))) {
      cleanAmount = cleanAmount.replace(/\./g, '').replace(',', '.');
    }

    // Remove currency symbols and other characters
    cleanAmount = cleanAmount
      .replace(/[$€£¥₹¢₽₩₪₦₨₡₵₴₸₼₾₿,\s]/g, '')
      .replace(/[()]/g, '')
      .trim();

    if (!cleanAmount) return null;

    const parsed = parseFloat(cleanAmount);
    return isNaN(parsed) ? null : parsed;
  }

  private parseDate(dateString: string): string | null {
    if (!dateString) return null;

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString.trim(); // Return original if parsing fails
      }
      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch (error) {
      return dateString.trim();
    }
  }
}