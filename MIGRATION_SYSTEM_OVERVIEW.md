# Database Migration System Overview

This project now includes **two migration approaches** to address different needs and complexity levels.

## 🚀 Quick Start (Recommended for Most Users)

```bash
# Set environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_KEY="your-service-key"

# Run all migrations
npm run migration:up

# Check status
npm run migration:status
```

## 📋 Migration Approaches

### 1. Simple Migration Runner (Recommended)

**Location**: `src/database/migrations/simple-migration-runner.ts`

**Best for**:

- Quick setup and deployment
- Teams that prefer SQL-first approach
- Simple migration needs

**Features**:

- ✅ Uses existing SQL files
- ✅ Better error handling than legacy system
- ✅ Progress reporting
- ✅ Basic validation
- ✅ No additional dependencies

**Commands**:

```bash
npm run migration:up        # Apply all migrations
npm run migration:status    # Show current status
npm run migration:validate  # Validate SQL files
```

### 2. Advanced Migration System (Enterprise-Grade)

**Location**: `src/database/migrations/` (TypeScript classes)

**Best for**:

- Large teams with complex requirements
- Projects requiring sophisticated dependency management
- Applications needing comprehensive testing
- Long-term maintainability

**Features**:

- ✅ Full TypeScript integration
- ✅ Dependency management
- ✅ Transaction safety
- ✅ Comprehensive testing
- ✅ Rollback capabilities
- ✅ Checksum validation

**Commands**:

```bash
npm run migration:advanced up      # Apply migrations
npm run migration:advanced down    # Rollback migrations
npm run migration:advanced status  # Show detailed status
```

### 3. Legacy System (Deprecated)

**Location**: `migrations/` (Original SQL files)

**Status**: Maintained for backward compatibility only

**Commands**:

```bash
npm run migration:legacy up
npm run migration:legacy status
```

## 🏗️ Architecture Comparison

| Feature                   | Simple Runner | Advanced System | Legacy |
| ------------------------- | ------------- | --------------- | ------ |
| **Setup Complexity**      | Low           | Medium          | Low    |
| **Type Safety**           | None          | Full            | None   |
| **Error Handling**        | Good          | Excellent       | Basic  |
| **Testing**               | Manual        | Automated       | None   |
| **Rollback Support**      | Manual        | Automatic       | Manual |
| **Dependency Management** | None          | Automatic       | None   |
| **Transaction Safety**    | Basic         | Full            | None   |
| **Performance**           | Good          | Excellent       | Basic  |

## 📁 File Structure

```
rt-18-01-backend/
├── migrations/                          # Legacy SQL files
│   ├── all-migrations.sql              # Complete migration script
│   ├── validate-schema.sql             # Validation script
│   └── rollback-all.sql                # Emergency rollback
│
├── src/database/migrations/             # Advanced TypeScript system
│   ├── migration.interface.ts          # Core interfaces
│   ├── base-migration.ts               # Abstract base class
│   ├── migration-runner.service.ts     # Main orchestration
│   ├── simple-migration-runner.ts      # Simple runner
│   ├── 001-create-invoices-table.migration.ts
│   ├── 002-create-audit-trail-table.migration.ts
│   ├── 003-create-duplicate-detection-table.migration.ts
│   └── __tests__/                      # Comprehensive tests
```

## 🎯 Which Approach Should You Use?

### Use Simple Runner If:

- ✅ You want to get started quickly
- ✅ Your team prefers SQL-first development
- ✅ You have simple migration needs
- ✅ You want minimal dependencies

### Use Advanced System If:

- ✅ You need enterprise-grade features
- ✅ Your team values type safety
- ✅ You require comprehensive testing
- ✅ You need sophisticated dependency management
- ✅ You're building a long-term, complex application

### Use Legacy System If:

- ✅ You're maintaining existing code only
- ❌ **Not recommended for new development**

## 🔧 Setup Instructions

### For Simple Runner:

1. **Set Environment Variables**:

   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_KEY="your-service-role-key"
   ```

2. **Run Migrations**:

   ```bash
   npm run migration:up
   ```

3. **Verify**:
   ```bash
   npm run migration:status
   ```

### For Advanced System:

1. **Install Dependencies** (if needed):

   ```bash
   npm install
   ```

2. **Set Environment Variables**:

   ```bash
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_KEY="your-service-role-key"
   ```

3. **Run Migrations**:

   ```bash
   npm run migration:advanced up
   ```

4. **Run Tests**:
   ```bash
   npm test src/database/migrations
   ```

## 📊 Database Schema Created

Both systems create the same database schema:

### Tables:

1. **`invoices`** - Enhanced invoice table with status tracking
2. **`invoice_audit_trail`** - Comprehensive audit logging
3. **`invoice_duplicates`** - Duplicate detection and resolution
4. **`schema_migrations`** - Migration tracking

### Key Features:

- ✅ Status tracking (uploaded, processing, completed, failed, duplicate)
- ✅ JSONB metadata storage
- ✅ Automatic timestamp management
- ✅ Comprehensive indexing for performance
- ✅ Foreign key constraints for data integrity
- ✅ Audit trail for all operations
- ✅ Duplicate detection with similarity scoring

## 🚨 Migration from Legacy System

If you're currently using the legacy system:

1. **Backup your data** first
2. **Run current migrations** to establish baseline
3. **Choose your new approach** (Simple or Advanced)
4. **Test in development** environment
5. **Deploy to production** with proper monitoring

## 🔍 Troubleshooting

### Common Issues:

1. **Permission Errors**:

   ```bash
   # Ensure you're using service role key
   export SUPABASE_SERVICE_KEY="your-service-role-key"
   ```

2. **Connection Issues**:

   ```bash
   # Verify your Supabase URL
   export SUPABASE_URL="https://your-project.supabase.co"
   ```

3. **Migration Failures**:

   ```bash
   # Check status first
   npm run migration:status

   # Validate migrations
   npm run migration:validate
   ```

### Debug Mode:

```bash
# Enable verbose logging
DEBUG=* npm run migration:up
```

## 📈 Performance Considerations

### Indexes Created:

- Primary key indexes on all tables
- Foreign key indexes for efficient joins
- Composite indexes for common query patterns
- Partial indexes for status-specific queries
- JSONB GIN indexes for metadata queries
- Text search indexes for full-text search

### Optimization Tips:

- Run migrations during low-traffic periods
- Monitor query performance after migration
- Consider creating indexes `CONCURRENTLY` for large datasets
- Use connection pooling for high-traffic applications

## 🔒 Security Best Practices

1. **Use Service Role Key** for migrations
2. **Limit migration user permissions** to necessary operations only
3. **Audit migration execution** in production
4. **Backup data** before major schema changes
5. **Test rollback procedures** in development
6. **Monitor for suspicious activity** during migrations

## 📚 Further Reading

- [Simple Migration Runner Documentation](src/database/migrations/README.md)
- [Advanced Migration System Guide](src/database/migrations/README.md)
- [Legacy Migration Guide](migrations/MIGRATION_GUIDE.md)
- [Database Schema Documentation](docs/database-schema.md)

## 🤝 Contributing

When adding new migrations:

1. **For Simple System**: Add SQL to `migrations/all-migrations.sql`
2. **For Advanced System**: Create new migration class in `src/database/migrations/`
3. **Test thoroughly** in development
4. **Update documentation** as needed
5. **Follow naming conventions** for consistency

---

**Recommendation**: Start with the **Simple Migration Runner** for immediate needs, then migrate to the **Advanced System** as your application grows in complexity.
