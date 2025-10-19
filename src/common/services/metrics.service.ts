import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

export interface MetricValue {
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface AggregatedMetric {
  name: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  lastValue: number;
  lastUpdated: Date;
}

@Injectable()
export class MetricsService {
  private metrics: Map<string, MetricValue[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  constructor(private readonly logger: LoggerService) {
    // Start periodic metrics logging
    this.startPeriodicLogging();
  }

  // Invoice processing specific metrics
  recordProcessingSuccess(processingTimeMs: number): void {
    this.incrementCounter('invoice.processing.success');
    this.recordHistogram('invoice.processing.time', processingTimeMs);
    this.logger.debug('Recorded processing success', 'MetricsService', {
      processingTimeMs
    });
  }

  recordProcessingFailure(processingTimeMs: number): void {
    this.incrementCounter('invoice.processing.failure');
    this.recordHistogram('invoice.processing.time', processingTimeMs);
    this.logger.debug('Recorded processing failure', 'MetricsService', {
      processingTimeMs
    });
  }

  recordValidationFailure(validationType: string): void {
    this.incrementCounter('invoice.validation.failure', 1, { type: validationType });
    this.logger.debug('Recorded validation failure', 'MetricsService', {
      validationType
    });
  }

  recordDuplicateDetection(detectionMethod: string): void {
    this.incrementCounter('invoice.duplicate.detected', 1, { method: detectionMethod });
    this.logger.debug('Recorded duplicate detection', 'MetricsService', {
      detectionMethod
    });
  }

  // Counter methods
  incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
    const key = this.getMetricKey(name, tags);
    const currentValue = this.counters.get(key) || 0;
    this.counters.set(key, currentValue + value);
    
    this.recordMetric(key, currentValue + value, tags);
  }

  getCounter(name: string, tags?: Record<string, string>): number {
    const key = this.getMetricKey(name, tags);
    return this.counters.get(key) || 0;
  }

  // Gauge methods
  setGauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getMetricKey(name, tags);
    this.gauges.set(key, value);
    
    this.recordMetric(key, value, tags);
  }

  getGauge(name: string, tags?: Record<string, string>): number | undefined {
    const key = this.getMetricKey(name, tags);
    return this.gauges.get(key);
  }

  // Histogram methods
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getMetricKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    
    // Keep only last 1000 values to prevent memory issues
    if (values.length > 1000) {
      values.shift();
    }
    
    this.histograms.set(key, values);
    this.recordMetric(key, value, tags);
  }

  getHistogramStats(name: string, tags?: Record<string, string>): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | undefined {
    const key = this.getMetricKey(name, tags);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) {
      return undefined;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / count;
    const min = sorted[0];
    const max = sorted[count - 1];

    const p50 = this.percentile(sorted, 0.5);
    const p95 = this.percentile(sorted, 0.95);
    const p99 = this.percentile(sorted, 0.99);

    return { count, sum, avg, min, max, p50, p95, p99 };
  }

  // Application-specific metrics
  recordRequestDuration(method: string, endpoint: string, statusCode: number, durationMs: number): void {
    this.recordHistogram('http_request_duration_ms', durationMs, {
      method,
      endpoint: this.sanitizeEndpoint(endpoint),
      status_code: statusCode.toString(),
    });

    this.incrementCounter('http_requests_total', 1, {
      method,
      endpoint: this.sanitizeEndpoint(endpoint),
      status_code: statusCode.toString(),
    });
  }

  recordDatabaseOperation(operation: string, table: string, durationMs: number, success: boolean): void {
    this.recordHistogram('database_operation_duration_ms', durationMs, {
      operation,
      table,
      success: success.toString(),
    });

    this.incrementCounter('database_operations_total', 1, {
      operation,
      table,
      success: success.toString(),
    });
  }

  recordExternalServiceCall(service: string, operation: string, durationMs: number, success: boolean): void {
    this.recordHistogram('external_service_duration_ms', durationMs, {
      service,
      operation,
      success: success.toString(),
    });

    this.incrementCounter('external_service_calls_total', 1, {
      service,
      operation,
      success: success.toString(),
    });
  }

  recordFileProcessing(fileType: string, fileSizeBytes: number, processingTimeMs: number, success: boolean): void {
    this.recordHistogram('file_processing_duration_ms', processingTimeMs, {
      file_type: fileType,
      success: success.toString(),
    });

    this.recordHistogram('file_size_bytes', fileSizeBytes, {
      file_type: fileType,
    });

    this.incrementCounter('files_processed_total', 1, {
      file_type: fileType,
      success: success.toString(),
    });
  }

  recordMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    this.setGauge('memory_usage_rss_bytes', memUsage.rss);
    this.setGauge('memory_usage_heap_used_bytes', memUsage.heapUsed);
    this.setGauge('memory_usage_heap_total_bytes', memUsage.heapTotal);
    this.setGauge('memory_usage_external_bytes', memUsage.external);
  }

  recordCpuUsage(): void {
    const cpuUsage = process.cpuUsage();
    this.setGauge('cpu_usage_user_microseconds', cpuUsage.user);
    this.setGauge('cpu_usage_system_microseconds', cpuUsage.system);
  }

  // Get all metrics for reporting
  getAllMetrics(): Record<string, AggregatedMetric> {
    const result: Record<string, AggregatedMetric> = {};

    for (const [name, values] of this.metrics.entries()) {
      if (values.length === 0) continue;

      const numericValues = values.map(v => v.value);
      const sum = numericValues.reduce((acc, val) => acc + val, 0);
      const count = numericValues.length;
      const avg = sum / count;
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      const lastValue = values[values.length - 1].value;
      const lastUpdated = values[values.length - 1].timestamp;

      result[name] = {
        name,
        count,
        sum,
        avg,
        min,
        max,
        lastValue,
        lastUpdated,
      };
    }

    return result;
  }

  // Clear old metrics to prevent memory leaks
  clearOldMetrics(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    for (const [name, values] of this.metrics.entries()) {
      const filteredValues = values.filter(v => v.timestamp > cutoffTime);
      if (filteredValues.length === 0) {
        this.metrics.delete(name);
      } else {
        this.metrics.set(name, filteredValues);
      }
    }
  }

  private recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const values = this.metrics.get(name) || [];
    values.push({
      value,
      timestamp: new Date(),
      tags,
    });

    // Keep only last 1000 values per metric
    if (values.length > 1000) {
      values.shift();
    }

    this.metrics.set(name, values);
  }

  private getMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }

    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(',');

    return `${name}{${tagString}}`;
  }

  private sanitizeEndpoint(endpoint: string): string {
    // Replace dynamic path parameters with placeholders
    // Order matters: more specific patterns first
    return endpoint
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')  // UUID with hyphens (36 chars)
      .replace(/\/[a-f0-9]{24}/g, '/:objectId')  // MongoDB ObjectId (24 chars)
      .replace(/\/\d+/g, '/:id');  // Simple numeric IDs
  }

  private percentile(sortedArray: number[], p: number): number {
    const index = (sortedArray.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sortedArray.length) {
      return sortedArray[sortedArray.length - 1];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  private startPeriodicLogging(): void {
    // Log metrics every 5 minutes
    const intervalId = setInterval(() => {
      this.recordMemoryUsage();
      this.recordCpuUsage();
      
      const allMetrics = this.getAllMetrics();
      if (Object.keys(allMetrics).length > 0) {
        this.logger.logMetrics(
          Object.fromEntries(
            Object.entries(allMetrics).map(([name, metric]) => [name, metric.lastValue])
          ),
          'MetricsService'
        );
      }

      // Clean up old metrics
      this.clearOldMetrics(24);
    }, 5 * 60 * 1000); // 5 minutes

    // Store interval ID for cleanup
    (this as any).metricsInterval = intervalId;
  }

  // Method to clean up the interval (useful for testing)
  destroy(): void {
    if ((this as any).metricsInterval) {
      clearInterval((this as any).metricsInterval);
    }
  }
}