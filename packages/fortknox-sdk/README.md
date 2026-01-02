# 🏰 Fort Knox SDK

**Enterprise-grade authentication SDK for multi-tenant applications**

Built on the principles of Auth0, Clerk, and NextAuth - but for your own infrastructure.

---

## 🎯 Design Principles

1. **Access tokens live in memory** (never localStorage)
2. **Refresh tokens live in httpOnly cookies** (XSS-safe)
3. **SDK never stores refresh tokens** (cookies handle it)
4. **SDK only refreshes on 401** (no refresh storms)
5. **Concurrency-safe refresh** (single refresh, queue requests)
6. **Environment-agnostic** (works everywhere)

---

## 📦 Installation

```bash
npm install @fortknox/sdk
# or
yarn add @fortknox/sdk
# or
pnpm add @fortknox/sdk
```

---

## 🚀 Quick Start

### **Browser / React**

```typescript
import { createWebClient } from '@fortknox/sdk';
import { FortKnoxProvider, useAuth } from '@fortknox/sdk/react';

// Create client
const client = createWebClient({
  baseURL: 'http://localhost:4000',
  tenant: 'acme',
  debug: true,
});

// Wrap app
function App() {
  return (
    <FortKnoxProvider client={client}>
      <YourApp />
    </FortKnoxProvider>
  );
}

// Use in components
function LoginPage() {
  const { login, user, isAuthenticated } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    await login({ email, password });
  };

  if (isAuthenticated) {
    return <div>Welcome {user?.email}!</div>;
  }

  return <form onSubmit={handleLogin}>...</form>;
}
```

---

## 🏗️ Architecture

```
@fortknox/sdk
├── /core        Pure auth logic (works everywhere)
├── /web         Browser helpers
├── /react       React hooks
├── /next        Next.js SSR
└── /node        Server-to-server
```

---

## 📖 Usage by Environment

### **1. Browser (Vanilla JS)**

```typescript
import { createWebClient } from '@fortknox/sdk/web';

const client = createWebClient({
  baseURL: 'https://auth.scrolloop.com',
  tenant: 'acme',
});

// Login
await client.login({ email: 'user@example.com', password: 'pass' });

// Get user
const user = await client.getCurrentUser();

// Logout
await client.logout();
```

### **2. React**

```typescript
import { FortKnoxProvider, useAuth, useUser } from '@fortknox/sdk/react';

// In component
function Profile() {
  const { user, isLoading } = useUser();
  
  if (isLoading) return <div>Loading...</div>;
  return <div>Hello {user?.email}</div>;
}
```

### **3. Next.js (Server Components)**

```typescript
import { getFortKnoxClient } from '@fortknox/sdk/next';

export default async function ServerComponent() {
  const client = getFortKnoxClient(
    'https://auth.scrolloop.com',
    'acme',
    req
  );
  
  const user = await client.getCurrentUser();
  
  return <div>Hello {user.email}</div>;
}
```

### **4. Next.js (API Routes)**

```typescript
import { getFortKnoxClient } from '@fortknox/sdk/next';

export async function GET(req: Request) {
  const client = getFortKnoxClient(
    process.env.AUTH_URL!,
    'acme',
    req
  );
  
  const user = await client.getCurrentUser();
  
  return Response.json({ user });
}
```

### **5. Node.js (Server-to-Server)**

```typescript
import { createNodeClient } from '@fortknox/sdk/node';

const client = createNodeClient({
  baseURL: 'https://auth.scrolloop.com',
  tenant: 'service-account',
  apiKey: process.env.API_KEY,
});

// Use for webhooks, CRON jobs, etc.
const user = await client.getCurrentUser();
```

---

## 🔐 How Token Refresh Works

```
Request → 200 OK ✅
Request → 401 ❌
  ↓
  Trigger refresh (using cookie)
  ↓
  Get new access token
  ↓
  Retry original request → 200 OK ✅
```

**Key points:**
- ✅ Only refreshes on 401 (no preemptive refresh)
- ✅ Concurrency-safe (single refresh, queue other requests)
- ✅ No refresh token in JavaScript (httpOnly cookie)
- ✅ Exponential backoff retry
- ✅ Never loops infinitely

---

## 🎨 Features

### **Core Features**
- ✅ Refresh-on-401 only (no storms)
- ✅ Request queuing during refresh
- ✅ Exponential backoff retry
- ✅ Event emitter for state changes
- ✅ TypeScript strict mode
- ✅ Zero dependencies (except React for hooks)

### **Security**
- ✅ Access tokens in memory only
- ✅ Refresh tokens in httpOnly cookies
- ✅ XSS protection
- ✅ CSRF protection
- ✅ No token leakage

### **Multi-tenant**
- ✅ Tenant context automatic
- ✅ Auto-detect from subdomain
- ✅ Per-tenant configuration

### **Environment Support**
- ✅ Browser
- ✅ Node.js
- ✅ Next.js SSR
- ✅ Next.js Client Components
- ✅ React Native (with custom transport)

---

## 📡 Events

Listen to auth events:

```typescript
client.on((event) => {
  switch (event.type) {
    case 'token_refreshed':
      console.log('Token refreshed:', event.accessToken);
      break;
    
    case 'logout':
      console.log('User logged out');
      break;
    
    case 'session_expired':
      console.log('Session expired');
      break;
    
    case 'error':
      console.error('Auth error:', event.error);
      break;
  }
});
```

---

## 🧪 Testing

Mock the transport for testing:

```typescript
const mockTransport = async (req) => ({
  ok: true,
  status: 200,
  data: { user: { id: '1', email: 'test@test.com' } },
  headers: {},
  statusText: 'OK',
});

const client = new FortKnoxClient({
  baseURL: 'http://test',
  tenant: 'test',
  transport: mockTransport,
});
```

---

## 🎯 API Reference

### **FortKnoxClient**

```typescript
class FortKnoxClient {
  // Authentication
  login(credentials: LoginCredentials): Promise<LoginResponse>
  logout(): Promise<void>
  
  // User
  getCurrentUser(): Promise<User>
  isAuthenticated(): boolean
  getAccessToken(): string | undefined
  
  // Events
  on(listener: AuthEventListener): () => void
  
  // Low-level
  request(req: TransportRequest): Promise<TransportResponse>
}
```

### **React Hooks**

```typescript
// Main auth hook
const { 
  user, 
  isLoading, 
  isAuthenticated, 
  login, 
  logout, 
  refreshUser,
  client 
} = useAuth()

// User only
const { user, isLoading, isAuthenticated } = useUser()

// Session only
const { isAuthenticated, isLoading, accessToken } = useSession()
```

---

## 🔧 Configuration

```typescript
interface FortKnoxConfig {
  baseURL: string;              // Auth service URL
  tenant: string;               // Tenant ID
  transport?: Transport;        // Custom HTTP client
  debug?: boolean;              // Enable logging
  refreshMargin?: number;       // Seconds before expiry (default: 30)
  maxRefreshRetries?: number;   // Max retry attempts (default: 3)
  onTokenRefreshed?: (token) => void;
  onLogout?: () => void;
  onError?: (error) => void;
}
```

---

## 📊 Bundle Size

- **Core**: ~3 KB gzipped
- **Web**: +0.5 KB
- **React**: +1 KB
- **Total**: ~4.5 KB gzipped

Compare to:
- Auth0 SDK: ~25 KB
- Firebase Auth: ~35 KB
- AWS Amplify: ~50 KB

---

## 🎯 Why This Design?

### **❌ What NOT to do:**

```typescript
// DON'T: Preemptive refresh
setInterval(() => refresh(), 14 * 60 * 1000)  // Refresh storms!

// DON'T: Store refresh token
localStorage.setItem('refreshToken', token)   // XSS vulnerability!

// DON'T: No concurrency control
async function request() {
  if (isExpired) await refresh()              // Race conditions!
}
```

### **✅ What we do:**

```typescript
// Refresh ONLY on 401
if (response.status === 401) {
  await refresh()
  retry(request)
}

// Refresh token in httpOnly cookie
// Backend: res.cookie('refreshToken', token, { httpOnly: true })

// Concurrency-safe refresh
if (isRefreshing) {
  return queueRequest(request)  // Wait for ongoing refresh
}
```

---

## 🤝 Contributing

Issues and PRs welcome!

---

## 📄 License

MIT

---

## 🎉 Credits

Built by the Fort Knox team.

Inspired by Auth0, Clerk, Supabase, and NextAuth.
