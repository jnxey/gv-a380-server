const fs = require('fs');
const path = require('path');

/** 本配置文件所在目录：项目根，或 pack 后的 bundle。 */
const configDirectory = __dirname;

/** pack 后与配置同目录的入口。 */
const packedIndexPath = path.join(configDirectory, 'index.js');

/** 在项目根执行时的入口。 */
const projectBundleIndexPath = path.join(configDirectory, 'bundle', 'index.js');

let scriptPath;
let workingDirectory;

if (fs.existsSync(packedIndexPath)) {
  scriptPath = packedIndexPath;
  workingDirectory = configDirectory;
} else if (fs.existsSync(projectBundleIndexPath)) {
  scriptPath = projectBundleIndexPath;
  workingDirectory = configDirectory;
} else {
  throw new Error('index.js not found, run npm run pack first');
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
