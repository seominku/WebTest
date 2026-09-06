import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getServiceInfo() {
    return {
      name: 'real-estate-api',
      status: 'ok' as const,
      version: '0.0.1',
    };
  }
}
