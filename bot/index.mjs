import 'dotenv/config';
import { startServer } from '../server/index.mjs';

// Compatibility entrypoint: Telegram updates are handled by the protected webhook server.
// Do not start a second getUpdates/long-polling client for the same bot token.
startServer().catch(() => {
  console.error('Не удалось запустить сервер КИНОВОЛНА. Проверьте конфигурацию без вывода секретов.');
  process.exitCode = 1;
});
