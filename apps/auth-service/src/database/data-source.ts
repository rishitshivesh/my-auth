import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'path';
import * as dotenv from 'dotenv';

// Always load root .env unless DOTENV_CONFIG_PATH is set
dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || join(process.cwd(), '.env'),
});

const yes = (v?: string, d = false) =>
  v === undefined
    ? d
    : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DB_URL,
  ssl: yes(process.env.DB_SSL) ? { rejectUnauthorized: false } : false,
  logging: yes(process.env.DB_LOGGING),
  // find all entities anywhere under src/**
  entities: [join(__dirname, '../**/*.entity.{ts,js}')],
  // your repo keeps migrations under src/database/migrations
  migrations: [join(__dirname, './migrations/*.{ts,js}')],
});
