import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MigrationRunnerService } from '../migration-runner.service';
import { 
  DatabaseConnection, 
  MigrationConfig, 
  IMigration, 
  MigrationMetadata,
  MigrationResult 
} from '../migration.interface';

describe('MigrationRunnerService', () => {
  let service: MigrationRunnerService;
  let mockConnection: jest.Mocked<DatabaseConnection>;
  let mockConfig: MigrationConfig;

  beforeEach(async () => {
    mockConnection = {
      query: jest.fn(),
      transaction: jest.fn(),
      close: jest.fn()
    };

    mockConfig = {
      migrationsPath: 'test/migrations',
      tableName: 'test_migrations',
      schemaName: 'public',
      validateChecksums: true,
      allowOutOfOrder: false
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationRunnerService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockConnection
        },
        {
          provide: 'MIGRATION_CONFIG',
          useValue: mockConfig
        }
      ]
    }).compile();

    service = module.get<MigrationRunnerService>(MigrationRunnerService);
    
    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create migration table if it does not exist', async () => {
      mockConnection.query.mockResolvedValueOnce([]);

      await service.initialize();

      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS')
      );
    });

    it('should handle database errors during initialization', async () => {
      const error = new Error('Database connection failed');
      mockConnection.query.mockRejectedValueOnce(error);

      await expect(service.initialize()).rejects.toThrow();
    });
  });

  describe('getAppliedMigrations', () => {
    it('should return applied migrations in correct format', async () => {
      const mockRows = [
        {
          version: '001',
          applied_at: '2024-01-01T00:00:00Z',
          checksum: 'abc123',
          execution_time_ms: 100
        },
        {
          version: '002',
          applied_at: '2024-01-02T00:00:00Z',
          checksum: 'def456',
          execution_time_ms: 200
        }
      ];

      mockConnection.query.mockResolvedValueOnce(mockRows);

      const result = await service.getAppliedMigrations();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        version: '001',
        appliedAt: new Date('2024-01-01T00:00:00Z'),
        checksum: 'abc123',
        executionTimeMs: 100
      });
    });

    it('should handle empty migration table', async () => {
      mockConnection.query.mockResolvedValueOnce([]);

      const result = await service.getAppliedMigrations();

      expect(result).toEqual([]);
    });
  });

  describe('applyMigration', () => {
    let mockMigration: jest.Mocked<IMigration>;

    beforeEach(() => {
      mockMigration = {
        metadata: {
          version: '001',
          name: 'TestMigration',
          description: 'Test migration',
          createdAt: new Date(),
          dependencies: []
        },
        up: jest.fn(),
        down: jest.fn(),
        validate: jest.fn()
      };
    });

    it('should successfully apply a valid migration', async () => {
      const mockResult: MigrationResult = {
        success: true,
        version: '001',
        executionTimeMs: 100
      };

      mockMigration.validate.mockResolvedValueOnce(true);
      mockMigration.up.mockResolvedValueOnce(mockResult);
      mockConnection.query.mockResolvedValueOnce([]); // getAppliedMigrations
      mockConnection.transaction.mockImplementation(async (callback) => {
        return await callback(mockConnection);
      });

      const result = await service.applyMigration(mockMigration);

      expect(result.success).toBe(true);
      expect(result.version).toBe('001');
      expect(mockMigration.validate).toHaveBeenCalled();
      expect(mockMigration.up).toHaveBeenCalled();
    });

    it('should skip already applied migration', async () => {
      mockConnection.query.mockResolvedValueOnce([
        {
          version: '001',
          applied_at: '2024-01-01T00:00:00Z',
          checksum: 'abc123',
          execution_time_ms: 100
        }
      ]);

      const result = await service.applyMigration(mockMigration);

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBe(0);
      expect(mockMigration.up).not.toHaveBeenCalled();
    });

    it('should fail if migration validation fails', async () => {
      mockMigration.validate.mockResolvedValueOnce(false);
      mockConnection.query.mockResolvedValueOnce([]); // getAppliedMigrations

      const result = await service.applyMigration(mockMigration);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(mockMigration.up).not.toHaveBeenCalled();
    });

    it('should handle migration execution failure', async () => {
      const migrationError = new Error('Migration failed');
      
      mockMigration.validate.mockResolvedValueOnce(true);
      mockMigration.up.mockResolvedValueOnce({
        success: false,
        version: '001',
        executionTimeMs: 50,
        error: migrationError
      });
      mockConnection.query.mockResolvedValueOnce([]); // getAppliedMigrations
      mockConnection.transaction.mockRejectedValueOnce(migrationError);

      const result = await service.applyMigration(mockMigration);

      expect(result.success).toBe(false);
      expect(result.error).toBe(migrationError);
    });
  });

  describe('rollbackMigration', () => {
    let mockMigration: jest.Mocked<IMigration>;

    beforeEach(() => {
      mockMigration = {
        metadata: {
          version: '001',
          name: 'TestMigration',
          description: 'Test migration',
          createdAt: new Date()
        },
        up: jest.fn(),
        down: jest.fn(),
        validate: jest.fn()
      };

      // Mock the findMigrationByVersion method
      jest.spyOn(service as any, 'findMigrationByVersion')
        .mockResolvedValue(mockMigration);
    });

    it('should successfully rollback an applied migration', async () => {
      const mockResult: MigrationResult = {
        success: true,
        version: '001',
        executionTimeMs: 100
      };

      mockConnection.query.mockResolvedValueOnce([
        {
          version: '001',
          applied_at: '2024-01-01T00:00:00Z',
          checksum: 'abc123',
          execution_time_ms: 100
        }
      ]);
      mockMigration.down.mockResolvedValueOnce(mockResult);
      mockConnection.transaction.mockImplementation(async (callback) => {
        return await callback(mockConnection);
      });

      const result = await service.rollbackMigration('001');

      expect(result.success).toBe(true);
      expect(result.version).toBe('001');
      expect(mockMigration.down).toHaveBeenCalled();
    });

    it('should fail if migration is not applied', async () => {
      mockConnection.query.mockResolvedValueOnce([]); // No applied migrations

      const result = await service.rollbackMigration('001');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('is not applied');
      expect(mockMigration.down).not.toHaveBeenCalled();
    });

    it('should fail if migration is not found', async () => {
      jest.spyOn(service as any, 'findMigrationByVersion')
        .mockResolvedValue(null);

      const result = await service.rollbackMigration('999');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('validateMigration', () => {
    let mockMigration: jest.Mocked<IMigration>;

    beforeEach(() => {
      mockMigration = {
        metadata: {
          version: '002',
          name: 'TestMigration',
          description: 'Test migration',
          createdAt: new Date(),
          dependencies: ['001']
        },
        up: jest.fn(),
        down: jest.fn(),
        validate: jest.fn()
      };
    });

    it('should validate migration with satisfied dependencies', async () => {
      mockConnection.query.mockResolvedValueOnce([
        { version: '001', applied_at: '2024-01-01T00:00:00Z', checksum: 'abc', execution_time_ms: 100 }
      ]);
      mockMigration.validate.mockResolvedValueOnce(true);

      const result = await service.validateMigration(mockMigration);

      expect(result).toBe(true);
      expect(mockMigration.validate).toHaveBeenCalled();
    });

    it('should fail validation with missing dependencies', async () => {
      mockConnection.query.mockResolvedValueOnce([]); // No applied migrations

      const result = await service.validateMigration(mockMigration);

      expect(result).toBe(false);
      expect(mockMigration.validate).not.toHaveBeenCalled();
    });

    it('should fail validation if custom validation fails', async () => {
      mockConnection.query.mockResolvedValueOnce([
        { version: '001', applied_at: '2024-01-01T00:00:00Z', checksum: 'abc', execution_time_ms: 100 }
      ]);
      mockMigration.validate.mockResolvedValueOnce(false);

      const result = await service.validateMigration(mockMigration);

      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return correct status summary', async () => {
      const appliedMigrations = [
        {
          version: '001',
          applied_at: '2024-01-01T00:00:00Z',
          checksum: 'abc123',
          execution_time_ms: 100
        }
      ];

      mockConnection.query.mockResolvedValueOnce(appliedMigrations);
      
      // Mock loadAllMigrations to return pending migrations
      jest.spyOn(service as any, 'loadAllMigrations').mockResolvedValue([
        {
          metadata: { version: '001', name: 'Applied', description: '', createdAt: new Date() }
        },
        {
          metadata: { version: '002', name: 'Pending', description: '', createdAt: new Date() }
        }
      ]);

      const status = await service.getStatus();

      expect(status.applied).toHaveLength(1);
      expect(status.pending).toHaveLength(1);
      expect(status.total).toBe(2);
    });
  });
});