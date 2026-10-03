export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    correlationId?: string;
    timestamp?: string;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface RequestContext {
  correlationId: string;
  userId?: string;
  timestamp: Date;
}
