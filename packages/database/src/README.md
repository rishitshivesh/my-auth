# @repo/database

**Fort Knox Database Package** - TypeORM entities and migrations for the authentication system.

## 📦 What's Included

### Entities (7 Core Tables)

1. **Tenant** - Multi-tenant organizations
2. **User** - User accounts with comprehensive security
3. **Session** - Active sessions with device tracking
4. **MfaSettings** - Multi-factor authentication settings
5. **SecurityEvent** - Security audit log
6. **Role** - RBAC roles
7. **Permission** - RBAC permissions

### Features

✅ **Multi-Tenancy** - Complete tenant isolation  
✅ **Soft Deletes** - All entities support soft deletion  
✅ **Timestamps** - Auto-managed created/updated dates  
✅ **UUID Primary Keys** - Better for distributed systems  
✅ **JSONB Fields** - Flexible metadata storage  
✅ **Comprehensive Indexes** - Optimized for performance  
✅ **Foreign Key Constraints** - Data integrity  
✅ **Database Comments** - Self-documenting schema

---

## 🚀 Quick Start

### 1. Installation

```bash
cd packages/database
npm install
```

### 2. Environment Variables

Create `.env` file in your auth-service:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=fortknox
DATABASE_PASSWORD=fortknox_dev_password
DATABASE_NAME=fortknox_auth
DATABASE_LOGGING=true
DATABASE_POOL_MAX=20
DATABASE_POOL_MIN=2
```

### 3. Run Migration

```bash
# Build the package first
npm run build

# Run migration
npm run migration:run
```

---

## 📚 Usage

### In Your NestJS Application

#### app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from '@repo/database';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    // ... other modules
  ],
})
export class AppModule {}
```

#### Using Entities in Modules

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, Tenant } from '@repo/database';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Tenant]),
  ],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

#### Using in Services

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@repo/database';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email, tenantId },
      relations: ['tenant', 'mfaSettings'],
    });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async updateLastLogin(userId: string, ip: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      failedLoginAttempts: 0,
    });
  }
}
```

---

## 🗄️ Database Schema

### Entity Relationships

```
Tenant (1) ──── (M) User
                  │
                  ├─── (1) MfaSettings
                  ├─── (M) Session
                  └─── (M) SecurityEvent

Tenant (1) ──── (M) Role ──── (M) Permission
```

### Key Tables

#### Tenants

```sql
tenants (
  id uuid PRIMARY KEY,
  name varchar(255),
  subdomain varchar(100) UNIQUE,
  custom_domain varchar(255),
  status enum('active', 'trial', 'suspended', 'cancelled'),
  plan enum('free', 'starter', 'professional', 'enterprise'),
  settings jsonb,
  ...
)
```

#### Users

```sql
users (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  email varchar(255),
  password_hash varchar(255),
  email_verified boolean,
  status enum('active', 'inactive', 'suspended', 'deleted'),
  password_history jsonb,
  failed_login_attempts int,
  locked_until timestamp,
  ...
)
```

#### Sessions

```sql
sessions (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  token_hash varchar(255) UNIQUE,
  device_info jsonb,
  ip_address varchar(45),
  expires_at timestamp,
  ...
)
```

---

## 🔄 Migration Commands

```bash
# Generate a new migration (after entity changes)
npm run migration:generate -- src/migrations/MyMigration

# Create an empty migration
npm run migration:create -- src/migrations/MyMigration

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Show migration status
npm run migration:show

# Sync schema (DEVELOPMENT ONLY!)
npm run schema:sync

# Drop all tables (DANGER!)
npm run schema:drop
```

---

## 🎯 Common Queries

### Find User with Relations

```typescript
const user = await userRepository.findOne({
  where: { id: userId },
  relations: ['tenant', 'mfaSettings', 'sessions'],
});
```

### Create User with MFA Settings

```typescript
const user = userRepository.create({
  email: 'user@example.com',
  passwordHash: hashedPassword,
  tenantId: tenant.id,
  mfaSettings: {
    totpEnabled: false,
    backupCodes: [],
  },
});
await userRepository.save(user);
```

### Get Active Sessions for User

```typescript
const activeSessions = await sessionRepository.find({
  where: {
    userId,
    isActive: true,
    expiresAt: MoreThan(new Date()),
  },
  order: {
    lastActivity: 'DESC',
  },
});
```

### Log Security Event

```typescript
await securityEventRepository.save({
  userId,
  tenantId,
  eventType: 'LOGIN_SUCCESS',
  severity: 'info',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: { method: 'password' },
});
```

### Get User's Permissions

```typescript
const user = await userRepository.findOne({
  where: { id: userId },
  relations: ['roles', 'roles.permissions'],
});

const permissions = user.roles
  .flatMap((role) => role.permissions)
  .map((perm) => `${perm.resource}:${perm.action}`);
```

---

## 🔒 Security Features

### Password History

The `password_history` JSONB field stores the last 5 password hashes to prevent reuse:

```typescript
// Check password history
const isReused = await Promise.all(
  user.passwordHistory.map((oldHash) => 
    PasswordService.verify(oldHash, newPassword)
  )
).then((results) => results.some((r) => r));

if (isReused) {
  throw new Error('Password has been used recently');
}

// Update password with history
user.passwordHistory = [
  user.passwordHash,
  ...user.passwordHistory,
].slice(0, 5);
user.passwordHash = newHash;
```

### Account Lockout

```typescript
// Increment failed attempts
user.failedLoginAttempts += 1;

if (user.failedLoginAttempts >= 5) {
  // Lock for 15 minutes
  user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
}

await userRepository.save(user);
```

### Session Expiration

Sessions automatically expire based on `expires_at`:

```typescript
// Check if session is valid
const isValid = 
  session.isActive && 
  !session.revokedAt && 
  session.expiresAt > new Date();
```

---

## 📊 Performance Tips

### Indexes

All critical fields are indexed:
- User email + tenantId (unique)
- Session tokenHash (unique)
- All foreign keys
- Frequently queried fields (status, email_verified, etc.)

### Query Optimization

```typescript
// ✅ Good - Select only needed fields
const user = await userRepository.findOne({
  where: { id: userId },
  select: ['id', 'email', 'status'],
});

// ✅ Good - Use query builder for complex queries
const users = await userRepository
  .createQueryBuilder('user')
  .where('user.tenant_id = :tenantId', { tenantId })
  .andWhere('user.status = :status', { status: 'active' })
  .andWhere('user.last_login_at > :date', { 
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) 
  })
  .getMany();

// ❌ Bad - Loading all relations unnecessarily
const user = await userRepository.findOne({
  where: { id: userId },
  relations: ['tenant', 'sessions', 'mfaSettings', 'securityEvents'],
});
```

---

## 🧪 Testing

### Example Test Setup

```typescript
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, dataSourceOptions } from '@repo/database';

describe('UserService', () => {
  let userRepository: Repository<User>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          ...dataSourceOptions,
          database: 'fortknox_test',
          synchronize: true, // OK for tests
        }),
        TypeOrmModule.forFeature([User]),
      ],
    }).compile();

    userRepository = module.get('UserRepository');
  });

  it('should create user', async () => {
    const user = await userRepository.save({
      email: 'test@example.com',
      passwordHash: 'hashed',
      tenantId: 'tenant-id',
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});
```

---

## 🚨 Important Notes

### DO NOT Use in Production:
- ❌ `synchronize: true`
- ❌ `dropSchema: true`
- ❌ Hardcoded credentials

### ALWAYS Use:
- ✅ Migrations for schema changes
- ✅ Environment variables for config
- ✅ Connection pooling
- ✅ Query parameter binding (prevents SQL injection)

---

## 📝 Entity Field Reference

### User Entity

| Field | Type | Description |
|-------|------|-------------|
| `email` | varchar(255) | User email (unique per tenant) |
| `passwordHash` | varchar(255) | Argon2id password hash |
| `passwordHistory` | jsonb | Last 5 password hashes |
| `status` | enum | active, inactive, suspended, deleted |
| `emailVerified` | boolean | Email verification status |
| `failedLoginAttempts` | int | Failed login counter |
| `lockedUntil` | timestamp | Account lockout expiration |
| `lastLoginAt` | timestamp | Last successful login |
| `metadata` | jsonb | Additional user data |

### Session Entity

| Field | Type | Description |
|-------|------|-------------|
| `tokenHash` | varchar(255) | Hashed session token (unique) |
| `deviceInfo` | jsonb | Browser, OS, device fingerprint |
| `ipAddress` | varchar(45) | IP address |
| `expiresAt` | timestamp | Session expiration |
| `lastActivity` | timestamp | Last activity timestamp |
| `revokedAt` | timestamp | Manual revocation time |

---

## 🤝 Contributing

When adding new entities:

1. Create entity in `src/entities/`
2. Export from `src/entities/index.ts`
3. Generate migration: `npm run migration:generate`
4. Test migration: `npm run migration:run`
5. Update this README

---

**Built with 🔒 for Fort Knox Security**