export default () => ({
  dbUrl: process.env.DB_URL!,
  dbSsl: /^(1|true|yes|on)$/i.test(process.env.DB_SSL || 'false'),
  dbLogging: /^(1|true|yes|on)$/i.test(process.env.DB_LOGGING || 'false'),
});
