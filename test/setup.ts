import { ConfigService } from '@nestjs/config';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-key';
  process.env.GOOGLE_CLOUD_PROJECT_ID = 'test-project';
  process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';
  process.env.GOOGLE_CLOUD_PROCESSOR_ID = 'test-processor';
  process.env.GOOGLE_CLOUD_CLIENT_EMAIL = 'test@test.com';
  process.env.GOOGLE_CLOUD_PRIVATE_KEY = 'test-key';
});

// Global test teardown
afterAll(() => {
  // Clean up any global resources
});

// Increase timeout for integration tests
jest.setTimeout(30000);