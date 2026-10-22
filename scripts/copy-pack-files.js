const fs = require('fs');
const path = require('path');

/** 项目根目录（在仓库根执行 npm run pack）。 */
const projectRootDirectory = process.cwd();

/** ncc 产出目录。 */
const bundleDirectory = path.join(projectRootDirectory, 'bundle');

/**
 * 把源路径复制到 bundle 内的目标路径。
 * 目录用递归复制，文件直接覆盖。
 *
 * @param {string} sourceRelativePath 相对项目根的源路径
 * @param {string} targetRelativePath 相对 bundle 目录的目标路径
 */
function copyIntoBundle(sourceRelativePath, targetRelativePath) {
  // 拼出源和目标的绝对路径
  const sourceAbsolutePath = path.join(projectRootDirectory, sourceRelativePath);
  const targetAbsolutePath = path.join(bundleDirectory, targetRelativePath);

  // 源不存在则直接报错，避免静默漏拷
  if (!fs.existsSync(sourceAbsolutePath)) {
    throw new Error('pack copy source not found: ' + sourceAbsolutePath);
  }

  // 递归复制，文件和目录都走同一套
  fs.cpSync(sourceAbsolutePath, targetAbsolutePath, { recursive: true });
}

copyIntoBundle('pm2-start.bat', 'pm2-start.bat');
copyIntoBundle('pm2-stop.bat', 'pm2-stop.bat');
copyIntoBundle('pm2-monit.bat', 'pm2-monit.bat');
copyIntoBundle('pm2-smooth.bat', 'pm2-smooth.bat');
copyIntoBundle('ecosystem.config.cjs', 'ecosystem.config.cjs');
copyIntoBundle('.env', '.env');
