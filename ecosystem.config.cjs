const fs = require('fs');
const path = require('path');

/** 本配置文件所在目录：项目根，或 pack 后的 bundle。 */
const configDirectory = __dirname;

/** pack 后与配置同目录的入口。 */
const packedEntryPath = path.join(configDirectory, 'a380.js');

/** 在项目根执行时的入口。 */
const projectBundleEntryPath = path.join(configDirectory, 'bundle', 'a380.js');

let scriptPath;
let workingDirectory;

if (fs.existsSync(packedEntryPath)) {
  scriptPath = packedEntryPath;
  workingDirectory = configDirectory;
} else if (fs.existsSync(projectBundleEntryPath)) {
  scriptPath = projectBundleEntryPath;
  workingDirectory = configDirectory;
} else {
  throw new Error('a380.js not found, run npm run pack first');
}

module.exports = {
  apps: [
    {
      name: 'node-3200',
      script: scriptPath,
      cwd: workingDirectory,
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: '3200',
        NODE_APP_INSTANCE: '0',
        NODE_ENV: 'production',
      },
    },
  ],
};
