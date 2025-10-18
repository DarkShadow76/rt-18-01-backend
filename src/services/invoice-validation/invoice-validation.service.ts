import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/logger/logger.service';
import { AppError, ErrorType } from '../../common/errors/app-error';
import * as crypto from 'crypto';

export interface InvoiceData {
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
  lineItems?: InvoiceLineItem[];
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxRate?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  correctedData?: Partial<InvoiceData>;
  validationScore: number;
  correlationId: string;
  metadata: {
    rulesApplied: string[];
    businessLogicChecks: string[];
    dataCorrections: string[];
  };
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  suggestedFix?: string;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  impact: 'low' | 'medium' | 'high';
}

export interface ValidationOptions {
  strictMode?: boolean;
  allowFutureInvoiceDates?: boolean;
  allowFutureDueDates?: boolean;
  maxInvoiceAge?: number; // days
  maxDueDateFuture?: number; // days
  minAmount?: number;
  maxAmount?: number;
  requiredFields?: string[];
  enableAutoCorrection?: boolean;
  businessRules?: BusinessRule[];
}

export interface BusinessRule {
  name: string;
  description: string;
  validator: (data: InvoiceData) => ValidationResult | null;
  severity: 'error' | 'warning';
  autoCorrect?: boolean;
}

@Injectable()
export class InvoiceValidationService {
  private readonly DEFAULT_OPTIONS: ValidationOptions = {
    strictMode: false,
    allowFutureInvoiceDates: false,
    allowFutureDueDates: true,
    maxInvoiceAge: 365, // 1 year
    maxDueDateFuture: 365, // 1 year
    minAmount: 0.01,
    maxAmount: 1000000,
    requiredFields: ['invoiceNumber', 'totalAmount', 'dueDate'],
    enableAutoCorrection: true,
    businessRules: [],
  };

  private readonly BUILT_IN_BUSINESS_RULES: BusinessRule[] = [
    {
      name: 'invoice_date_before_due_date',
      description: 'Invoice date must be before or equal to due date',
      validator: this.validateInvoiceDateBeforeDueDate.bind(this),
      severity: 'warning',
      autoCorrect: false,
    },
    {
      name: 'reasonable_payment_terms',
      description: 'Payment terms should be reasonable (typically 0-90 days)',
      validator: this.validateReasonablePaymentTerms.bind(this),
      severity: 'warning',
      autoCorrect: false,
    },
    {
      name: 'tax_amount_calculation',
      description: 'Tax amount should be reasonable compared to total amount',
      validator: this.validateTaxAmountCalculation.bind(this),
      severity: 'warning',
      autoCorrect: true,
    },
    {
      name: 'line_items_total',
      description: 'Line items total should match invoice total',
      validator: this.validateLineItemsTotal.bind(this),
      severity: 'error',
      autoCorrect: true,
    },
    {
      name: 'currency_consistency',
      description: 'Currency should be consistent throughout the invoice',
      validator: this.validateCurrencyConsistency.bind(this),
      severity: 'warning',
      autoCorrect: false,
    },
  ];

  constructor(private logger: LoggerService) {}

  async validateInvoice(
    invoiceData: InvoiceData,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const correlationId = crypto.randomUUID();
    const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Safely access invoice data for logging
      let invoiceNumber: string | undefined;
      try {
        invoiceNumber = invoiceData.invoiceNumber;
      } catch (error) {
        invoiceNumber = 'error-accessing-invoice-number';
      }

      this.logger.debug('Starting invoice validation', 'InvoiceValidationService', {
        correlationId,
        invoiceNumber,
        strictMode: mergedOptions.strictMode,
      });
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];
      const rulesApplied: string[] = [];
      const businessLogicChecks: string[] = [];
      const dataCorrections: string[] = [];
      let correctedData: Partial<InvoiceData> = {};

      // Basic field validation
      try {
        this.validateRequiredFields(invoiceData, mergedOptions, errors);
        rulesApplied.push('required_fields');
      } catch (error) {
        throw AppError.validationError(
          'Required field validation failed',
          { originalError: error.message },
          correlationId
        );
      }

      // Format validation
      try {
        this.validateFieldFormats(invoiceData, errors, warnings);
        rulesApplied.push('field_formats');
      } catch (error) {
        throw AppError.validationError(
          'Field format validation failed',
          { originalError: error.message },
          correlationId
        );
      }

      // Date validation
      try {
        this.validateDates(invoiceData, mergedOptions, errors, warnings);
        rulesApplied.push('date_validation');
      } catch (error) {
        throw AppError.validationError(
          'Date validation failed',
          { originalError: error.message },
          correlationId
        );
      }

      // Amount validation
      try {
        this.validateAmounts(invoiceData, mergedOptions, errors, warnings);
        rulesApplied.push('amount_validation');
      } catch (error) {
        throw AppError.validationError(
          'Amount validation failed',
          { originalError: error.message },
          correlationId
        );
      }

      // Business rules validation
      const allBusinessRules = [...this.BUILT_IN_BUSINESS_RULES, ...(mergedOptions.businessRules || [])];
      for (const rule of allBusinessRules) {
        try {
          const ruleResult = rule.validator(invoiceData);
          if (ruleResult) {
            businessLogicChecks.push(rule.name);
            
            if (rule.severity === 'error') {
              errors.push(...ruleResult.errors);
            } else {
              warnings.push(...ruleResult.warnings);
            }

            // Apply auto-corrections if enabled
            if (mergedOptions.enableAutoCorrection && rule.autoCorrect && ruleResult.correctedData) {
              correctedData = { ...correctedData, ...ruleResult.correctedData };
              dataCorrections.push(rule.name);
            }
          }
        } catch (error) {
          this.logger.warn(`Business rule '${rule.name}' failed to execute`, 'InvoiceValidationService', {
            correlationId,
            rule: rule.name,
            error: error.message,
          });
        }
      }

      // Calculate validation score
      const validationScore = this.calculateValidationScore(invoiceData, errors, warnings);

      const result: ValidationResult = {
        isValid: errors.length === 0 || (!mergedOptions.strictMode && errors.filter(e => e.severity === 'error').length === 0),
        errors,
        warnings,
        correctedData: Object.keys(correctedData).length > 0 ? correctedData : undefined,
        validationScore,
        correlationId,
        metadata: {
          rulesApplied,
          businessLogicChecks,
          dataCorrections,
        },
      };

      this.logger.debug('Invoice validation completed', 'InvoiceValidationService', {
        correlationId,
        isValid: result.isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
        validationScore,
      });

      if (!result.isValid) {
        this.logger.warn('Invoice validation failed', 'InvoiceValidationService', {
          correlationId,
          invoiceNumber: invoiceData.invoiceNumber,
          errors: errors.map(e => `${e.field}: ${e.message}`),
        });
      }

      return result;

    } catch (error) {
      // Safely access invoice number for logging
      let invoiceNumber: string | undefined;
      try {
        invoiceNumber = invoiceData.invoiceNumber;
      } catch (accessError) {
        invoiceNumber = 'error-accessing-invoice-number';
      }

      this.logger.error('Error during invoice validation', error.stack, 'InvoiceValidationService', {
        correlationId,
        invoiceNumber,
        error: error.message,
      });

      throw AppError.validationError(
        'Invoice validation failed due to internal error',
        { originalError: error.message },
        correlationId
      );
    }
  }

  private validateRequiredFields(
    data: InvoiceData,
    options: ValidationOptions,
    errors: ValidationError[]
  ): void {
    const requiredFields = options.requiredFields || [];

    for (const field of requiredFields) {
      const value = data[field as keyof InvoiceData];
      if (value === undefined || value === null || value === '') {
        errors.push({
          field,
          code: 'REQUIRED_FIELD_MISSING',
          message: `Required field '${field}' is missing or empty`,
          severity: 'error',
          suggestedFix: `Provide a valid value for ${field}`,
        });
      }
    }
  }

  private validateFieldFormats(
    data: InvoiceData,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Invoice number format
    try {
      if (data.invoiceNumber !== undefined) {
        if (typeof data.invoiceNumber !== 'string' || data.invoiceNumber.trim().length === 0) {
          errors.push({
            field: 'invoiceNumber',
            code: 'INVALID_FORMAT',
            message: 'Invoice number must be a non-empty string',
            severity: 'error',
          });
        } else if (data.invoiceNumber.length > 50) {
          errors.push({
            field: 'invoiceNumber',
            code: 'INVALID_LENGTH',
            message: 'Invoice number is too long (maximum 50 characters)',
            severity: 'error',
          });
        } else if (!/^[A-Z0-9\-_#]+$/i.test(data.invoiceNumber.trim())) {
          warnings.push({
            field: 'invoiceNumber',
            code: 'UNUSUAL_FORMAT',
            message: 'Invoice number contains unusual characters',
            impact: 'low',
          });
        }
      }
    } catch (error) {
      throw new Error(`Invoice number validation failed: ${error.message}`);
    }

    // Currency format
    try {
      if (data.currency) {
        if (typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency)) {
          warnings.push({
            field: 'currency',
            code: 'INVALID_CURRENCY_FORMAT',
            message: 'Currency should be a 3-letter ISO code (e.g., USD, EUR)',
            impact: 'medium',
          });
        }
      }
    } catch (error) {
      throw new Error(`Currency validation failed: ${error.message}`);
    }

    // Text field lengths
    try {
      const textFields = ['supplierName', 'billTo', 'supplierAddress', 'receiverAddress'];
      for (const field of textFields) {
        const value = data[field as keyof InvoiceData] as string;
        if (value && typeof value === 'string' && value.length > 500) {
          warnings.push({
            field,
            code: 'FIELD_TOO_LONG',
            message: `${field} is unusually long (${value.length} characters)`,
            impact: 'low',
          });
        }
      }
    } catch (error) {
      throw new Error(`Text field validation failed: ${error.message}`);
    }
  }

  private validateDates(
    data: InvoiceData,
    options: ValidationOptions,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const now = new Date();

    // Invoice date validation
    if (data.invoiceDate) {
      const invoiceDate = new Date(data.invoiceDate);
      
      if (isNaN(invoiceDate.getTime())) {
        errors.push({
          field: 'invoiceDate',
          code: 'INVALID_DATE_FORMAT',
          message: 'Invoice date is not a valid date',
          severity: 'error',
          suggestedFix: 'Use a valid date format (YYYY-MM-DD)',
        });
      } else {
        // Check if invoice date is in the future
        if (invoiceDate > now && !options.allowFutureInvoiceDates) {
          errors.push({
            field: 'invoiceDate',
            code: 'FUTURE_INVOICE_DATE',
            message: 'Invoice date cannot be in the future',
            severity: 'error',
          });
        }

        // Check if invoice date is too old
        const maxAge = options.maxInvoiceAge || 365;
        const maxAgeDate = new Date(now.getTime() - maxAge * 24 * 60 * 60 * 1000);
        if (invoiceDate < maxAgeDate) {
          warnings.push({
            field: 'invoiceDate',
            code: 'OLD_INVOICE_DATE',
            message: `Invoice date is older than ${maxAge} days`,
            impact: 'medium',
          });
        }
      }
    }

    // Due date validation
    if (data.dueDate) {
      const dueDate = new Date(data.dueDate);
      
      if (isNaN(dueDate.getTime())) {
        errors.push({
          field: 'dueDate',
          code: 'INVALID_DATE_FORMAT',
          message: 'Due date is not a valid date',
          severity: 'error',
          suggestedFix: 'Use a valid date format (YYYY-MM-DD)',
        });
      } else {
        // Check if due date is too far in the future
        const maxFuture = options.maxDueDateFuture || 365;
        const maxFutureDate = new Date(now.getTime() + maxFuture * 24 * 60 * 60 * 1000);
        if (dueDate > maxFutureDate && !options.allowFutureDueDates) {
          warnings.push({
            field: 'dueDate',
            code: 'FAR_FUTURE_DUE_DATE',
            message: `Due date is more than ${maxFuture} days in the future`,
            impact: 'medium',
          });
        }
      }
    }
  }

  private validateAmounts(
    data: InvoiceData,
    options: ValidationOptions,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Total amount validation
    if (data.totalAmount !== undefined) {
      if (typeof data.totalAmount !== 'number' || isNaN(data.totalAmount) || !isFinite(data.totalAmount)) {
        errors.push({
          field: 'totalAmount',
          code: 'INVALID_AMOUNT_FORMAT',
          message: 'Total amount must be a valid number',
          severity: 'error',
        });
      } else {
        if (data.totalAmount < (options.minAmount || 0)) {
          errors.push({
            field: 'totalAmount',
            code: 'AMOUNT_TOO_SMALL',
            message: `Total amount is below minimum (${options.minAmount})`,
            severity: 'error',
          });
        }

        if (data.totalAmount > (options.maxAmount || 1000000)) {
          warnings.push({
            field: 'totalAmount',
            code: 'AMOUNT_VERY_LARGE',
            message: `Total amount is unusually large (${data.totalAmount})`,
            impact: 'high',
          });
        }

        if (data.totalAmount < 0) {
          errors.push({
            field: 'totalAmount',
            code: 'NEGATIVE_AMOUNT',
            message: 'Total amount cannot be negative',
            severity: 'error',
          });
        }
      }
    }

    // Tax amount validation
    if (data.taxAmount !== undefined) {
      if (typeof data.taxAmount !== 'number' || isNaN(data.taxAmount) || !isFinite(data.taxAmount)) {
        errors.push({
          field: 'taxAmount',
          code: 'INVALID_AMOUNT_FORMAT',
          message: 'Tax amount must be a valid number',
          severity: 'error',
        });
      } else if (data.taxAmount < 0) {
        errors.push({
          field: 'taxAmount',
          code: 'NEGATIVE_AMOUNT',
          message: 'Tax amount cannot be negative',
          severity: 'error',
        });
      }
    }
  }

  // Business rule validators
  private validateInvoiceDateBeforeDueDate(data: InvoiceData): ValidationResult | null {
    if (!data.invoiceDate || !data.dueDate) return null;

    const invoiceDate = new Date(data.invoiceDate);
    const dueDate = new Date(data.dueDate);

    if (isNaN(invoiceDate.getTime()) || isNaN(dueDate.getTime())) return null;

    if (dueDate < invoiceDate) {
      return {
        isValid: false,
        errors: [],
        warnings: [{
          field: 'dueDate',
          code: 'DUE_DATE_BEFORE_INVOICE_DATE',
          message: 'Due date is before invoice date',
          impact: 'high',
        }],
        validationScore: 0,
        correlationId: '',
        metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
      };
    }

    return null;
  }

  private validateReasonablePaymentTerms(data: InvoiceData): ValidationResult | null {
    if (!data.invoiceDate || !data.dueDate) return null;

    const invoiceDate = new Date(data.invoiceDate);
    const dueDate = new Date(data.dueDate);

    if (isNaN(invoiceDate.getTime()) || isNaN(dueDate.getTime())) return null;

    const daysDiff = Math.ceil((dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 90) {
      return {
        isValid: false,
        errors: [],
        warnings: [{
          field: 'dueDate',
          code: 'UNUSUAL_PAYMENT_TERMS',
          message: `Payment terms are unusually long (${daysDiff} days)`,
          impact: 'medium',
        }],
        validationScore: 0,
        correlationId: '',
        metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
      };
    }

    return null;
  }

  private validateTaxAmountCalculation(data: InvoiceData): ValidationResult | null {
    if (!data.totalAmount || !data.taxAmount) return null;

    const taxRate = data.taxAmount / data.totalAmount;

    // Reasonable tax rates are typically 0-50%
    if (taxRate > 0.5) {
      return {
        isValid: false,
        errors: [],
        warnings: [{
          field: 'taxAmount',
          code: 'UNUSUAL_TAX_RATE',
          message: `Tax rate appears unusually high (${(taxRate * 100).toFixed(1)}%)`,
          impact: 'medium',
        }],
        validationScore: 0,
        correlationId: '',
        metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
      };
    }

    return null;
  }

  private validateLineItemsTotal(data: InvoiceData): ValidationResult | null {
    if (!data.lineItems || data.lineItems.length === 0 || !data.totalAmount) return null;

    const calculatedTotal = data.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const difference = Math.abs(calculatedTotal - data.totalAmount);
    const tolerance = 0.01; // 1 cent tolerance

    if (difference > tolerance) {
      return {
        isValid: false,
        errors: [{
          field: 'totalAmount',
          code: 'LINE_ITEMS_TOTAL_MISMATCH',
          message: `Line items total (${calculatedTotal}) does not match invoice total (${data.totalAmount})`,
          severity: 'error',
          suggestedFix: `Adjust total amount to ${calculatedTotal}`,
        }],
        warnings: [],
        correctedData: { totalAmount: calculatedTotal },
        validationScore: 0,
        correlationId: '',
        metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
      };
    }

    return null;
  }

  private validateCurrencyConsistency(data: InvoiceData): ValidationResult | null {
    // This is a placeholder for currency consistency validation
    // In a real implementation, you might check that all amounts use the same currency
    return null;
  }

  private calculateValidationScore(
    data: InvoiceData,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): number {
    let score = 100;

    // Deduct points for errors
    score -= errors.length * 20;

    // Deduct points for warnings based on impact
    for (const warning of warnings) {
      switch (warning.impact) {
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    }

    // Bonus points for completeness
    const requiredFields = ['invoiceNumber', 'totalAmount', 'dueDate'];
    const optionalFields = ['invoiceDate', 'supplierName', 'billTo', 'currency'];
    
    const presentRequired = requiredFields.filter(field => data[field as keyof InvoiceData] !== undefined).length;
    const presentOptional = optionalFields.filter(field => data[field as keyof InvoiceData] !== undefined).length;

    score += (presentRequired / requiredFields.length) * 10;
    score += (presentOptional / optionalFields.length) * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Validate multiple invoices in batch
   */
  async validateInvoices(
    invoices: InvoiceData[],
    options: ValidationOptions = {}
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const invoice of invoices) {
      try {
        const result = await this.validateInvoice(invoice, options);
        results.push(result);
      } catch (error) {
        results.push({
          isValid: false,
          errors: [{
            field: 'general',
            code: 'VALIDATION_ERROR',
            message: `Validation failed: ${error.message}`,
            severity: 'error',
          }],
          warnings: [],
          validationScore: 0,
          correlationId: crypto.randomUUID(),
          metadata: { rulesApplied: [], businessLogicChecks: [], dataCorrections: [] },
        });
      }
    }

    return results;
  }

  /**
   * Get validation statistics for monitoring
   */
  getValidationStatistics(results: ValidationResult[]): {
    totalValidated: number;
    validCount: number;
    invalidCount: number;
    averageScore: number;
    commonErrors: { code: string; count: number }[];
    commonWarnings: { code: string; count: number }[];
  } {
    const totalValidated = results.length;
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = totalValidated - validCount;
    const averageScore = results.reduce((sum, r) => sum + r.validationScore, 0) / totalValidated;

    // Count error codes
    const errorCounts = new Map<string, number>();
    const warningCounts = new Map<string, number>();

    for (const result of results) {
      for (const error of result.errors) {
        errorCounts.set(error.code, (errorCounts.get(error.code) || 0) + 1);
      }
      for (const warning of result.warnings) {
        warningCounts.set(warning.code, (warningCounts.get(warning.code) || 0) + 1);
      }
    }

    const commonErrors = Array.from(errorCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const commonWarnings = Array.from(warningCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalValidated,
      validCount,
      invalidCount,
      averageScore,
      commonErrors,
      commonWarnings,
    };
  }
}