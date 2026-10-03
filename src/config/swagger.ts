export const swaggerOptions = {
  info: {
    title: 'Seat Reservation API',
    description: 'High-concurrency seat reservation system with atomic operations and idempotency',
    version: '1.0.0',
    contact: {
      name: 'API Support',
    },
  },
  servers: [
    {
      url: 'http://localhost:8080',
      description: 'Local development',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
        description: 'Bearer token for authentication',
      },
    },
  },
} as any;

export const swaggerUiOptions = {
  routePrefix: '/api/docs',
  uiConfig: {
    deepLinking: true,
  },
};
