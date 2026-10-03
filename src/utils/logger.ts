import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
  serializers: {
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
      headers: req.headers,
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders?.(),
    }),
  },
});

export default logger;
