const { spawn } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env };
// Some editor terminals inherit this flag from their own Electron host.
delete env.ELECTRON_RUN_AS_NODE;
// Provider secrets belong to the separate backend, never to the desktop process.
for (const key of Object.keys(env)) if (/_API_KEY$/.test(key)) delete env[key];
const child = spawn(require('electron'), ['.', ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
