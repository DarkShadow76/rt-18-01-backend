import { LoggerService } from '../logger/logger.service';

/**
 * Decorator to automatically track method performance
 * @param operationName - Optional custom operation name, defaults to className.methodName
 */
export function TrackPerformance(operationName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const className = target.constructor.name;
    const defaultOperationName = `${className}.${propertyName}`;
    const finalOperationName = operationName || defaultOperationName;

    descriptor.value = async function (...args: any[]) {
      // Get logger service from the instance (assuming it's injected)
      const logger: LoggerService = (this as any).logger || (this as any).loggerService;
      
      if (!logger) {
        console.warn(`LoggerService not found in ${className}. Performance tracking skipped for ${propertyName}.`);
        return method.apply(this, args);
      }

      const operationId = `${finalOperationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        logger.startPerformanceTimer(operationId);
        const result = await method.apply(this, args);
        logger.endPerformanceTimer(operationId, finalOperationName, className);
        return result;
      } catch (error) {
        logger.endPerformanceTimer(operationId, finalOperationName, className, {
          error: error.message,
          success: false,
        });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to track database operations
 * @param tableName - Name of the database table being operated on
 * @param operation - Type of operation (SELECT, INSERT, UPDATE, DELETE, etc.)
 */
export function TrackDatabaseOperation(tableName: string, operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const className = target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      const logger: LoggerService = (this as any).logger || (this as any).loggerService;
      
      if (!logger) {
        return method.apply(this, args);
      }

      const startTime = Date.now();
      let success = true;
      let rowsAffected: number | undefined;

      try {
        const result = await method.apply(this, args);
        
        // Try to extract rows affected from result
        if (result && typeof result === 'object') {
          if ('affectedRows' in result) {
            rowsAffected = result.affectedRows;
          } else if ('count' in result) {
            rowsAffected = result.count;
          } else if (Array.isArray(result)) {
            rowsAffected = result.length;
          }
        }

        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const durationMs = Date.now() - startTime;
        
        logger.logDatabaseOperation({
          operation,
          table: tableName,
          durationMs,
          rowsAffected,
          success,
        }, className);
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to track external service calls
 * @param serviceName - Name of the external service
 * @param operationName - Name of the operation being performed
 */
export function TrackExternalService(serviceName: string, operationName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const className = target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      const logger: LoggerService = (this as any).logger || (this as any).loggerService;
      
      if (!logger) {
        return method.apply(this, args);
      }

      const startTime = Date.now();
      let success = true;

      try {
        const result = await method.apply(this, args);
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const durationMs = Date.now() - startTime;
        
        logger.logExternalServiceCall(serviceName, operationName, durationMs, success, {
          method: propertyName,
          class: className,
        });
      }
    };

    return descriptor;
  };
}

/**
 * Decorator to log business events
 * @param eventName - Name of the business event
 * @param entityType - Type of entity being operated on
 */
export function LogBusinessEvent(eventName: string, entityType: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const className = target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      const logger: LoggerService = (this as any).logger || (this as any).loggerService;
      
      const result = await method.apply(this, args);
      
      if (logger) {
        // Try to extract entity ID from result or arguments
        let entityId = 'unknown';
        if (result && typeof result === 'object' && 'id' in result) {
          entityId = result.id;
        } else if (args.length > 0 && typeof args[0] === 'string') {
          entityId = args[0];
        }

        logger.logBusinessEvent(eventName, entityType, entityId, propertyName, {
          class: className,
          arguments: args.length,
        });
      }
      
      return result;
    };

    return descriptor;
  };
}