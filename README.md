# 🏰 Fort Knox Authentication System

**Enterprise-grade, multi-tenant authentication system built with NestJS, TypeORM, and Redis**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red)](https://nestjs.com/)

---

## 🚀 Features

### ✅ Core Authentication
- [x] Email/Password authentication with Argon2id hashing
- [x] JWT + Refresh Token implementation
- [x] Multi-tenant architecture
- [x] Session management with device tracking
- [ ] Social login (Google, GitHub, Microsoft)
- [ ] SAML 2.0 enterprise SSO
- [ ] OAuth 2.0 / OIDC server

### 🔐 Security
- [x] Rate limiting (Sliding Window + Token Bucket)
- [x] Brute force protection
- [x] AES-256-GCM field-level encryption
- [ ] Account lockout with exponential backoff
- [ ] Security headers (Helmet.js)
- [ ] CSRF protection
- [ ] IP whitelisting/blacklisting

### 🔑 Multi-Factor Authentication (MFA)
- [ ] TOTP (Google Authenticator, Authy)
- [ ] SMS OTP via Twilio
- [ ] Email OTP / Magic Links
- [ ] WebAuthn / FIDO2 (hardware keys, biometrics)
- [ ] Backup codes

### 👥 User & Tenant Management
- [x] Multi-tenant isolation
- [x] Custom domain support
- [ ] Role-Based Access Control (RBAC)
- [ ] Hierarchical permissions
- [ ] User invitation system
- [ ] Bulk user provisioning
- [ ] SCIM 2.0 user directory sync

### 📊 Admin Dashboard
- [ ] User management UI
- [ ] Analytics & reporting
- [ ] Security events monitoring
- [ ] Tenant configuration
- [ ] Branding customization

### 🔧 Developer Tools
- [ ] JavaScript/TypeScript SDK
- [ ] Python SDK
- [ ] Go SDK
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Webhook system
- [ ] Developer portal

---

## 📦 Project Structure

```
fort-knox/
├── apps/
│   ├── auth-service/          # NestJS authentication microservice
│   ├── admin-portal/          # Next.js admin dashboard
│   ├── api-gateway/           # API gateway service
│   └── webhook-service/       # Webhook delivery system
├── packages/
│   ├── security/              # Security utilities (encryption, hashing, rate limiting)
│   ├── shared/                # Shared types, constants, DTOs
│   ├── database/              # TypeORM entities, migrations
│   ├── sdk-js/                # JavaScript/TypeScript SDK
│   └── ui/                    # shadcn/ui components
├── tools/
│   ├── scripts/               # Deployment scripts
│   └── docker/                # Docker configurations
├── turbo.json                 # Turborepo configuration
├── docker-compose.yml         # Local development services
└── package.json
```

---

## 🛠️ Tech Stack

### Backend
- **Framework:** NestJS (Node.js + TypeScript)
- **Database:** PostgreSQL 16
- **ORM:** TypeORM
- **Cache:** Redis 7
- **Queue:** Bull (Redis-based)

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI:** shadcn/ui + Tailwind CSS
- **State:** React Query

### Security
- **Password Hashing:** Argon2id
- **Encryption:** AES-256-GCM
- **JWT:** jsonwebtoken
- **Rate Limiting:** Redis-based sliding window

### DevOps
- **Containerization:** Docker
- **Orchestration:** Kubernetes
- **CI/CD:** GitHub Actions
- **Monitoring:** Prometheus + Grafana
- **Logging:** ELK Stack

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 20.0.0
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### 1. Clone Repository
```bash
git clone https://github.com/your-org/fort-knox.git
cd fort-knox
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Infrastructure (Docker)
```bash
npm run docker:dev
```

This starts:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- pgAdmin on `localhost:5050`
- Redis Commander on `localhost:8081`
- Mailhog on `localhost:8025`

### 4. Environment Variables
Create `.env` files in each app:

**apps/auth-service/.env:**
```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=fortknox
DATABASE_PASSWORD=fortknox_dev_password
DATABASE_NAME=fortknox_auth

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=fortknox_redis_password

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this

# Encryption
ENCRYPTION_KEY=your-256-bit-encryption-master-key

# Application
PORT=3001
NODE_ENV=development
```

### 5. Run Database Migrations
```bash
cd apps/auth-service
npm run db:migrate
npm run db:seed
```

### 6. Start Development Servers
```bash
# Start all apps in watch mode
npm run dev

# Or start specific app
npm run dev --filter=auth-service
```

---

## 📚 API Documentation

Once the auth-service is running, access Swagger docs at:
```
http://localhost:3001/api/docs
```

### Key Endpoints

#### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password

#### User Management
- `GET /users/me` - Get current user
- `PATCH /users/me` - Update current user
- `POST /users/change-password` - Change password

#### MFA
- `POST /mfa/totp/setup` - Setup TOTP
- `POST /mfa/totp/verify` - Verify TOTP code
- `POST /mfa/backup-codes` - Generate backup codes

---

## 🔐 Security Best Practices

### Implemented
✅ **Password Security**
- Argon2id hashing (OWASP recommended)
- Password strength validation
- Password history (prevent reuse)

✅ **Session Security**
- Device fingerprinting
- IP tracking
- Concurrent session limits

✅ **Rate Limiting**
- Per-IP rate limiting
- Per-user rate limiting
- Distributed rate limiting (Redis)

✅ **Encryption**
- AES-256-GCM for sensitive data
- HMAC signatures for webhooks
- Encrypted fields in database

### Planned
🔄 **Additional Security Measures**
- WAF (Web Application Firewall)
- DDoS protection
- Penetration testing
- Security audits
- Compliance certifications (SOC 2, ISO 27001)

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Run specific test suite
npm run test --filter=auth-service
```

---

## 📊 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Uptime | 99.99% | TBD |
| Auth Latency | <100ms | TBD |
| Throughput | 10,000 req/s | TBD |
| Test Coverage | >80% | TBD |

---

## 🗺️ Roadmap

### Phase 1: Security Hardening ✅ (In Progress)
- [x] Argon2id password hashing
- [x] Rate limiting
- [x] Field-level encryption
- [ ] Security headers
- [ ] CSRF protection

### Phase 2: MFA (Weeks 2-3)
- [ ] TOTP implementation
- [ ] SMS OTP
- [ ] Email OTP / Magic Links
- [ ] WebAuthn / FIDO2

### Phase 3: OAuth 2.0 & Social Login (Weeks 3-4)
- [ ] OAuth 2.0 server
- [ ] OIDC support
- [ ] Google OAuth
- [ ] GitHub OAuth
- [ ] Microsoft OAuth

### Phase 4: Enterprise SSO (Weeks 4-5)
- [ ] SAML 2.0
- [ ] SCIM 2.0 provisioning
- [ ] Azure AD integration

### Phase 5: RBAC & Permissions (Weeks 5-6)
- [ ] Hierarchical roles
- [ ] Fine-grained permissions
- [ ] Role inheritance

### Phase 6: Admin Dashboard (Weeks 9-11)
- [ ] User management UI
- [ ] Analytics dashboard
- [ ] Security monitoring
- [ ] Tenant configuration

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [TypeORM](https://typeorm.io/) - ORM for TypeScript
- [shadcn/ui](https://ui.shadcn.com/) - Re-usable components
- [Argon2](https://github.com/P-H-C/phc-winner-argon2) - Password hashing
- OWASP for security best practices

---

## 📞 Support

- 📧 Email: support@fortknox.dev
- 💬 Discord: [Join our community](https://discord.gg/fortknox)
- 📖 Docs: [docs.fortknox.dev](https://docs.fortknox.dev)
- 🐛 Issues: [GitHub Issues](https://github.com/your-org/fort-knox/issues)

---

**Built with ❤️ by Rishit Shivesh**