import { startHealthServer } from './src/utils/healthServer';
process.env.PORT = '3999';
startHealthServer();
setTimeout(() => process.exit(0), 120000);
