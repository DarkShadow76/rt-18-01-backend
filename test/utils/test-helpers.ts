import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

export class TestHelpers {
  /**
   * Creates a test file buffer for upload testing
   */
  static createTestFile(
    filename: string = 'test.pdf',
    mimeType: string = 'application/pdf',
    size: number = 1024
  ): Buffer {
    return Buffer.alloc(size, `Test file content for ${filename}`);
  }

  /**
   * Creates a malicious file buffer for security testing
   */
  static createMaliciousFile(): Buffer {
    return Buffer.from('<script>alert("xss")</script>');
  }

  /**
   * Creates a large file buffer for size limit testing
   */
  static createLargeFile(sizeInMB: number = 50): Buffer {
    return Buffer.alloc(sizeInMB * 1024 * 1024, 'x');
  }

  /**
   * Waits for a specified amount of time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generates a random string for unique test data
   */
  static generateRandomString(length: number = 10): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Creates a test HTTP request with file upload
   */
  static createFileUploadRequest(
    app: INestApplication,
    endpoint: string,
    filename: string = 'test.pdf',
    fileBuffer: Buffer = TestHelpers.createTestFile()
  ) {
    return request(app.getHttpServer())
      .post(endpoint)
      .attach('file', fileBuffer, filename);
  }

  /**
   * Asserts that an error response has the expected structure
   */
  static assertErrorResponse(response: any, expectedStatus: number, expectedMessage?: string) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('timestamp');
    
    if (expectedMessage) {
      expect(response.body.message).toContain(expectedMessage);
    }
  }

  /**
   * Asserts that a success response has the expected structure
   */
  static assertSuccessResponse(response: any, expectedStatus: number = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('success', true);
  }

  /**
   * Creates a mock logger that captures log calls
   */
  static createMockLogger() {
    return {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      setContext: jest.fn()
    };
  }

  /**
   * Creates a spy on console methods to capture output
   */
  static spyOnConsole() {
    return {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation()
    };
  }

  /**
   * Restores console methods after spying
   */
  static restoreConsole(spies: any) {
    Object.values(spies).forEach((spy: any) => spy.mockRestore());
  }

  /**
   * Measures execution time of a function
   */
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> {
    const start = Date.now();
    const result = await fn();
    const timeMs = Date.now() - start;
    return { result, timeMs };
  }

  /**
   * Creates a timeout promise for testing async operations
   */
  static createTimeout(ms: number, message: string = 'Operation timed out'): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}