// TrpcContext is the context passed to all tRPC procedures.
// Kept framework-agnostic so AppRouter type can be shared with the web app.
export interface TrpcContext {
  userId: string | null;
}
