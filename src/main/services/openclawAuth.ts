import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/**
 * 设备身份信息（持久化存储用）
 * 使用 PEM 格式存储 Ed25519 密钥（Node.js crypto 原生支持）
 */
interface DeviceIdentity {
  id: string;
  publicKeyPem: string;    // PEM 格式公钥
  privateKeyPem: string;   // PEM 格式私钥
  createdAt: number;
}

/**
 * OpenClaw 设备认证服务（运行在 Electron 主进程）
 * 负责 Ed25519 密钥对的生成、持久化和签名操作
 */
class OpenClawAuthService {
  private deviceIdentity: DeviceIdentity | null = null;

  /**
   * 获取或创建设备身份
   */
  getOrCreateDeviceIdentity(): DeviceIdentity {
    if (this.deviceIdentity) {
      return this.deviceIdentity;
    }

    const identityPath = this.getIdentityFilePath();

    // 尝试从文件加载已有的设备身份
    try {
      if (fs.existsSync(identityPath)) {
        const data = fs.readFileSync(identityPath, 'utf-8');
        const parsed = JSON.parse(data);

        // 验证私钥是否可用（能成功创建 KeyObject 说明格式正确）
        if (parsed.privateKeyPem) {
          try {
            crypto.createPrivateKey(parsed.privateKeyPem);
            this.deviceIdentity = parsed;
            console.log('📱 [Main] 已加载设备身份:', this.deviceIdentity.id);
            return this.deviceIdentity!;
          } catch (verifyErr) {
            console.warn('⚠️ [Main] 已保存的密钥无法使用，将重新生成:', verifyErr);
            fs.unlinkSync(identityPath);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ [Main] 加载设备身份失败，将重新生成:', e);
    }

    // 生成新的 Ed25519 密钥对（PEM 格式 - Node.js 原生支持）
    console.log('🔑 [Main] 正在生成新的 Ed25519 设备密钥对...');
    const keypair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const pubKeyPem = keypair.publicKey as string;
    const privKeyPem = keypair.privateKey as string;

    // 从公钥生成设备 ID（与 openclaw-client SDK 一致）
    const pubKeyObj = crypto.createPublicKey(pubKeyPem);
    const pubKeyDer = pubKeyObj.export({ type: 'spki', format: 'der' });
    // 使用原始公钥 DER 的 SHA256 前12字节作为设备 ID
    const deviceId = crypto.createHash('sha256').update(pubKeyDer).digest('hex').substring(0, 12);

    this.deviceIdentity = {
      id: deviceId,
      publicKeyPem: pubKeyPem,
      privateKeyPem: privKeyPem,
      createdAt: Date.now()
    };

    // 确保目录存在
    const dir = path.dirname(identityPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 持久化到文件
    fs.writeFileSync(identityPath, JSON.stringify(this.deviceIdentity, null, 2));

    console.log('✅ [Main] 新设备身份已保存:');
    console.log('   📱 设备ID:', this.deviceIdentity.id);

    return this.deviceIdentity;
  }

  /**
   * 使用 Ed25519 私钥签名 challenge 数据
   * 按照官方 device-identity.ts 的方式：直接签名 nonce 原始字节
   */
  signChallenge(nonce: string, _ts: number): string {
    const identity = this.getOrCreateDeviceIdentity();

    // 官方方式：直接签名 nonce 原始字节（不是 JSON payload！）
    const nonceBytes = Buffer.from(nonce, 'utf-8');

    console.log('📝 [Main] 签名: 直接使用 nonce 原始字节，长度:', nonceBytes.length);

    // 直接用 PEM 字符串创建私钥对象
    const privateKeyObj = crypto.createPrivateKey(identity.privateKeyPem);

    // 使用 Ed25519 签名（第一个参数 null 表示使用 Ed25519）
    const signature = crypto.sign(null, nonceBytes, privateKeyObj);

    console.log('✅ [Main] Ed25519 签名完成，长度:', signature.length);

    return signature.toString('base64');
  }

  /**
   * 获取 Base64 编码的公钥（用于发送给 OpenClaw 服务器）
   */
  getPublicKeyBase64(): string {
    const identity = this.getOrCreateDeviceIdentity();
    const pubKeyObj = crypto.createPublicKey(identity.publicKeyPem);
    const pubKeyDer = pubKeyObj.export({ type: 'spki', format: 'der' });
    return Buffer.from(pubKeyDer).toString('base64');
  }

  /**
   * 获取设备 ID
   */
  getDeviceId(): string {
    return this.getOrCreateDeviceIdentity().id;
  }

  private getIdentityFilePath(): string {
    return path.join(app.getPath('userData'), 'openclaw_device_identity.json');
  }
}

const openClawAuthService = new OpenClawAuthService();
export default openClawAuthService;
