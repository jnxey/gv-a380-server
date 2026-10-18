import { BadGatewayException, BadRequestException, Injectable, Logger, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmpty, isNumber, isObject } from '../../common/tools';
import { AmapAddressPath, AmapReverseGeocodeUrl, AmapTileSubdomainList, AmapTileUrl } from './map.constants';

/**
 * 地图转发。瓦片和逆地理都走高德，密钥留在环境变量里。
 */
@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  /** 等上游响应的最长时间（毫秒） */
  private readonly upstreamTimeoutMs = 8_000;
  /** 一张瓦片允许的最大字节数 */
  private readonly maxTileBytes = 2 * 1024 * 1024;
  /** 逆地理响应允许的最大字节数 */
  private readonly maxReverseBytes = 1024 * 1024;
  /** 跟随上游跳转的次数上限 */
  private readonly maxRedirects = 3;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 按层级和坐标拉取一张瓦片图。
   */
  async getTile(zoom: number, x: number, y: number): Promise<StreamableFile> {
    // 编号必须落在这一层的格子里，避免拼出上游不存在的地址
    const maxIndex = 2 ** zoom - 1;
    if (isNumber(zoom) !== true || isNumber(x) !== true || isNumber(y) !== true || x > maxIndex || y > maxIndex) {
      throw new BadRequestException('坐标不正确');
    }

    // 按坐标固定选一个子域，同一张瓦片每次打到同一台
    const subdomain = this.pickSubdomain(zoom, x, y);
    const tileUrl = this.fillTemplate(AmapTileUrl, {
      z: String(zoom),
      x: String(x),
      y: String(y),
      s: subdomain,
    });

    const upstreamResponse = await this.fetchUpstream(tileUrl);
    if (upstreamResponse.ok !== true) {
      this.logger.warn(`map tile upstream status=${upstreamResponse.status}`);
      throw new BadGatewayException('地图服务暂时不可用');
    }
    const mediaType = this.readImageMediaType(upstreamResponse.headers.get('content-type'));
    if (isEmpty(mediaType)) {
      throw new BadGatewayException('地图服务暂时不可用');
    }
    const imageBytes = await this.readLimitedBody(upstreamResponse, this.maxTileBytes);
    return new StreamableFile(imageBytes, { type: mediaType });
  }

  /**
   * 把经纬度解析成地址文字。上游没有地址时返回空字符串。
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<{ address: string }> {
    if (
      isNumber(latitude) !== true ||
      isNumber(longitude) !== true ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('坐标不正确');
    }

    const reverseUrl = this.fillTemplate(AmapReverseGeocodeUrl, {
      key: this.readAmapWebKey(),
      lat: String(latitude),
      lng: String(longitude),
    });

    const upstreamResponse = await this.fetchUpstream(reverseUrl);
    if (upstreamResponse.ok !== true) {
      this.logger.warn(`map reverse upstream status=${upstreamResponse.status}`);
      throw new BadGatewayException('地图服务暂时不可用');
    }
    const responseBytes = await this.readLimitedBody(upstreamResponse, this.maxReverseBytes);
    const payload = this.parseJsonObject(responseBytes);
    // 高德成功时 status 为 1。密钥错误也是 HTTP 200，不能当成空地址。
    if (isObject(payload) !== true || payload.status !== '1') {
      this.logger.warn('map reverse upstream rejected');
      throw new BadGatewayException('地图服务暂时不可用');
    }
    const address = this.readAddress(payload, AmapAddressPath);
    return { address };
  }

  /**
   * 读取高德 Web 服务密钥。没有配置时不请求上游。
   */
  private readAmapWebKey(): string {
    const amapWebKey = this.configService.get<string>('AMAP_WEB_KEY');
    if (isEmpty(amapWebKey)) {
      this.logger.warn('map reverse key missing');
      throw new BadGatewayException('地图服务暂时不可用');
    }
    return amapWebKey;
  }

  /**
   * 按坐标从高德子域里选一个。
   */
  private pickSubdomain(zoom: number, x: number, y: number): string {
    const subdomainIndex = (zoom + x + y) % AmapTileSubdomainList.length;
    return AmapTileSubdomainList[subdomainIndex];
  }

  /**
   * 把模板里的占位换成这次请求的值。只替换已知占位，不接收调用方传入的地址。
   */
  private fillTemplate(template: string, values: Record<string, string>): string {
    let filled = template;
    for (const [name, value] of Object.entries(values)) {
      filled = filled.split(`{${name}}`).join(value);
    }
    return filled;
  }

  /**
   * 按点路径取出字符串。中间不是对象，或最后不是字符串时返回空串。
   */
  private readAddress(payload: unknown, addressPath: string): string {
    if (isEmpty(addressPath)) {
      return '';
    }
    let current: unknown = payload;
    const segments = addressPath.split('.');
    for (const segment of segments) {
      if (isEmpty(segment) || isObject(current) !== true) {
        return '';
      }
      current = current[segment];
    }
    if (typeof current !== 'string') {
      return '';
    }
    return current;
  }

  /**
   * 把响应正文解析成对象。不是 JSON 对象时返回空对象，地址就会是空串。
   */
  private parseJsonObject(responseBytes: Buffer): unknown {
    try {
      return JSON.parse(responseBytes.toString('utf8')) as unknown;
    } catch {
      return {};
    }
  }

  /**
   * 请求上游。跳转只跟 http 和 https，次数有上限。失败时不带出上游地址。
   */
  private async fetchUpstream(url: string): Promise<Response> {
    let currentUrl = url;
    for (let hop = 0; hop <= this.maxRedirects; hop += 1) {
      const parsedUrl = this.parseHttpUrl(currentUrl);
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), this.upstreamTimeoutMs);
      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(parsedUrl, { redirect: 'manual', signal: abortController.signal });
      } catch {
        throw new BadGatewayException('地图服务暂时不可用');
      } finally {
        clearTimeout(timer);
      }

      const isRedirect = upstreamResponse.status >= 300 && upstreamResponse.status < 400;
      if (isRedirect !== true) {
        return upstreamResponse;
      }
      const location = upstreamResponse.headers.get('location');
      if (typeof location !== 'string' || isEmpty(location) || hop === this.maxRedirects) {
        throw new BadGatewayException('地图服务暂时不可用');
      }
      currentUrl = new URL(location, parsedUrl).toString();
    }
    throw new BadGatewayException('地图服务暂时不可用');
  }

  /**
   * 只接受 http 和 https。其它协议或无法解析时视为上游失败。
   */
  private parseHttpUrl(url: string): URL {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadGatewayException('地图服务暂时不可用');
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new BadGatewayException('地图服务暂时不可用');
    }
    return parsedUrl;
  }

  /**
   * 读出图片类型。不是 image 时返回空串。
   */
  private readImageMediaType(contentType: string | null): string {
    if (typeof contentType !== 'string') {
      return '';
    }
    const mediaType = contentType.split(';')[0].trim().toLowerCase();
    if (mediaType.startsWith('image/') !== true) {
      return '';
    }
    return mediaType;
  }

  /**
   * 读完正文。超过上限就中止，避免把过大的响应放进内存。
   */
  private async readLimitedBody(upstreamResponse: Response, maxBytes: number): Promise<Buffer> {
    const contentLength = Number(upstreamResponse.headers.get('content-length'));
    if (isNumber(contentLength) && Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new BadGatewayException('地图服务暂时不可用');
    }
    const responseBody = upstreamResponse.body;
    if (responseBody === null) {
      throw new BadGatewayException('地图服务暂时不可用');
    }
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    const reader = responseBody.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done === true) {
        break;
      }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > maxBytes) {
        throw new BadGatewayException('地图服务暂时不可用');
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  }
}
