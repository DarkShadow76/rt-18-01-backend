import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../logger/logger.service';
import { CorrelationIdUtil } from '../utils/correlation-id.util';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    
    // Get or generate correlation ID
    const correlationId = CorrelationIdUtil.getOrGenerate(req.headers);
    
    // Set correlation ID in logger context
    this.logger.setCorrelationId(correlationId);
    
    // Add correlation ID to response headers
    res.setHeader('X-Correlation-ID', correlationId);
    
    // Add correlation ID to request for downstream use
    (req as any).correlationId = correlationId;

    // Log incoming request
    this.logIncomingRequest(req, correlationId);

    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any, cb?: any) {
      const endTime = Date.now();
      const durationMs = endTime - startTime;
      
      // Log outgoing response
      this.logOutgoingResponse(req, res, durationMs, correlationId);
      
      // Clear correlation ID from logger context
      this.logger.clearCorrelationId();
      
      // Call original end method
      originalEnd.call(res, chunk, encoding, cb);
    }.bind(this);

    next();
  }

  private logIncomingRequest(req: Request, correlationId: string): void {
    const requestInfo = {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      referer: req.get('Referer'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      query: req.query && Object.keys(req.query).length > 0 ? req.query : undefined,
      body: this.sanitizeRequestBody(req.body),
    };

    this.logger.log(`Incoming Request: ${req.method} ${req.url}`, 'HTTP', {
      request: requestInfo,
      correlationId,
    });
  }

  private logOutgoingResponse(req: Request, res: Response, durationMs: number, correlationId: string): void {
    const responseInfo = {
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length'),
      contentType: res.get('Content-Type'),
    };

    // Log API request metrics
    this.logger.logApiRequest(req.method, req.url, res.statusCode, durationMs, {
      response: responseInfo,
      correlationId,
    });

    // Log performance if request took too long
    if (durationMs > 1000) {
      this.logger.warn(`Slow Request: ${req.method} ${req.url} took ${durationMs}ms`, 'Performance', {
        durationMs,
        correlationId,
      });
    }
  }

  private sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization', 'apiKey'];
    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Limit body size for logging
    const bodyString = JSON.stringify(sanitized);
    if (bodyString.length > 1000) {
      return { 
        _truncated: true, 
        _originalSize: bodyString.length,
        _preview: bodyString.substring(0, 500) + '...'
      };
    }

    return sanitized;
  }
}