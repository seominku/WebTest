import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class JsonRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.is('application/json')) {
      throw new UnsupportedMediaTypeException('application/json is required');
    }

    return true;
  }
}
