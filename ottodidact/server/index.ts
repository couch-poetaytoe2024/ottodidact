import dotenv from 'dotenv';
import { createApp } from './app';
import { providerStatus, readConfig } from './config';

dotenv.config();
const config = readConfig();
const app = createApp({ config });
const server = app.listen(config.port, '127.0.0.1', () => {
  const status = providerStatus(config);
  console.log('Ottodidact backend: http://127.0.0.1:' + config.port + ' | ' + status.provider + ' / ' + status.model);
  console.log(status.message);
});
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? 'Backend port ' + config.port + ' is in use. Stop the other Ottodidact backend and retry.' : 'Backend could not start (' + (error.code ?? 'unknown') + ').');
  process.exitCode = 1;
});
