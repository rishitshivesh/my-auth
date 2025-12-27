import "reflect-metadata";
import { DataSource, DataSourceOptions } from "typeorm";
import * as path from "path";

/**
 * TypeORM DataSource Configuration
 *
 * This file is used by TypeORM CLI for migrations
 * and can also be imported by the NestJS application
 */

const isProduction = process.env.NODE_ENV === "production";

export const dataSourceOptions: DataSourceOptions = {
  type: "postgres",
  host: process.env.DATABASE_HOST || "localhost",
  port: parseInt(process.env.DATABASE_PORT || "5432", 10),
  username: process.env.DATABASE_USER || "postgres",
  password: process.env.DATABASE_PASSWORD || "fortknox_dev_password",
  database: process.env.DATABASE_NAME || "fortknox_auth",

  // Entities
  entities: [path.join(__dirname, "entities", "*.entity.{ts,js}")],

  // Migrations
  migrations: [path.join(__dirname, "migrations", "*.{ts,js}")],

  // Migration settings
  migrationsTableName: "migrations",
  migrationsRun: false, // Don't auto-run migrations

  // Logging
  logging: process.env.DATABASE_LOGGING === "true" || !isProduction,
  logger: "advanced-console",

  // Connection pool
  extra: {
    max: parseInt(process.env.DATABASE_POOL_MAX || "20", 10),
    min: parseInt(process.env.DATABASE_POOL_MIN || "2", 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  // SSL (for production)
  ssl: isProduction
    ? {
        rejectUnauthorized:
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      }
    : false,

  // Schema
  schema: process.env.DATABASE_SCHEMA || "public",

  // Synchronize (NEVER use in production!)
  synchronize: false,
};

// Create and export DataSource
const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
