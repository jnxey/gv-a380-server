/**
 * 本地联调时签发会员访问令牌。
 * 这不是登录接口，小程序工程不会调用它。
 * accountType 必须与服务端 AccountType.MEMBER 保持一致。
 *
 * 用法：node scripts/sign-member-token.js 1
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const memberAccountType = 'MEMBER';
const defaultExpiresSeconds = 7200;

function readEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const envMap = {};
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      return;
    }
    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }
    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();
    envMap[key] = value;
  });
  return envMap;
}

const memberId = process.argv[2];
if (memberId === undefined || memberId.trim() === '') {
  console.error('用法: node scripts/sign-member-token.js <memberId>');
  process.exit(1);
}

const envMap = readEnvFile();
const secret = process.env.JWT_SECRET || envMap.JWT_SECRET;
if (secret === undefined || secret.trim() === '') {
  console.error('请在环境变量或 .env 中配置 JWT_SECRET');
  process.exit(1);
}
const expiresText = process.env.JWT_EXPIRES_SECONDS || envMap.JWT_EXPIRES_SECONDS;
const expiresSeconds = expiresText !== undefined && expiresText.trim() !== '' && Number.isFinite(Number(expiresText))
  ? Number(expiresText)
  : defaultExpiresSeconds;

const accessToken = jwt.sign(
  {
    sub: String(memberId),
    accountType: memberAccountType,
  },
  secret,
  {
    expiresIn: expiresSeconds,
    jwtid: crypto.randomUUID(),
  },
);

console.log(accessToken);
