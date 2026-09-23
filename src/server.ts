import { buildApp } from './app.js';
const app = buildApp();
try {
  const address = await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '127.0.0.1' });
  console.log(`Conversor disponível em ${address}`);
} catch (error) { console.error(error); process.exit(1); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
