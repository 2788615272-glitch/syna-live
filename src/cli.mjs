import os from 'node:os';
import path from 'node:path';
import { startLocalServer } from './server/local-server.mjs';
import { SecretVault } from './runtime/secret-vault.mjs';

const dataDir = process.env.SYNA_DATA_DIR || path.join(os.homedir(), '.syna-live');
const vault = await new SecretVault({
  dataDir,
  initial: { providerApiKey: process.env.SYNA_PROVIDER_API_KEY || '' }
}).init();
const server = await startLocalServer({
  dataDir,
  vault,
  port: Number(process.env.SYNA_PORT || 18181)
});

console.log(`Syna Live: ${server.dashboardUrl}`);
console.log('开发服务器不会持久化 API Key；桌面版使用系统加密存储。');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
