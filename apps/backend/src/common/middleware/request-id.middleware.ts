import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: Request & { requestId?: string },
    res: Response,
    next: NextFunction,
  ) {
    const requestId = req.headers['x-request-id'] || randomUUID();

    req.requestId = requestId as string;

    res.setHeader('x-request-id', requestId as string);

    next();
  }
}
