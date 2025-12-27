import { SequelizeModuleOptions } from '@nestjs/sequelize';

/**
 * @deprecated
 * */
export const databaseConfig: SequelizeModuleOptions = {
  dialect: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  autoLoadModels: true,
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
};
