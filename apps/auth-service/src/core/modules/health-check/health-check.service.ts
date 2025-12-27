import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';

@Injectable()
export class HealthCheckService {
  constructor() {}

  async welcome() {
    return {
      message: 'Hola Amigos, Welcome to Identity!',
      status: 200,
    };
  }

  async getSwaggerYaml() {
    // read the swagger.yaml file and return it
    const swaggerYaml = readFileSync(
      './api-management/nest-be/api-docs.yaml',
      'utf8',
    );
    return swaggerYaml;
  }
}
