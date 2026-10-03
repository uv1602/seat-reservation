export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(401, 'AUTHENTICATION_ERROR', message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(403, 'AUTHORIZATION_ERROR', message);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public originalError?: unknown) {
    super(500, 'DATABASE_ERROR', message);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'BUSINESS_LOGIC_ERROR', message, details);
    this.name = 'BusinessLogicError';
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', public originalError?: unknown) {
    super(500, 'INTERNAL_SERVER_ERROR', message);
    this.name = 'InternalServerError';
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}
