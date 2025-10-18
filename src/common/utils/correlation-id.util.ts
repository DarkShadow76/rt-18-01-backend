import { v4 as uuidv4 } from 'uuid';

export class CorrelationIdUtil {
  static generate(): string {
    return uuidv4();
  }

  static extract(headers: Record<string, any>): string | undefined {
    return headers['x-correlation-id'] || headers['correlation-id'];
  }

  static getOrGenerate(headers: Record<string, any>): string {
    return this.extract(headers) || this.generate();
  }
}