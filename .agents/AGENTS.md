# Custom Agent Rules for Scrolloop Sentry

These project-scoped rules guide agent behavior within this workspace.

## API & Network Requests

- **No Direct Fetch Calls:** Do not use the raw `fetch` API directly in the admin portal code for communicating with backend services or when handling authentication.
- **Use authClient / apiClient:** All network requests and authentication actions must route through the `authClient` instance (defined in `apps/admin-portal/app/layout.tsx`). Use `authClient.request({ url, method, body })`.
- **Use withErrorHandler HOF:** Wrap all API/query/mutation functions with the `withErrorHandler` High-Order Function (defined in `apps/admin-portal/lib/with-error-handler.ts`). This automatically extracts the `{ data }` payload from the backend response and triggers toast notifications (via `sonner`) for success or error states.
