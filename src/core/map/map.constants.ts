/** 高德路网瓦片。{s} 是子域，{x} {y} {z} 是瓦片坐标。 */
export const AmapTileUrl =
  'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';

/** 瓦片子域。同一张瓦片按坐标固定选一个。 */
export const AmapTileSubdomainList = ['1', '2', '3', '4'] as const;

/**
 * 高德逆地理。
 * location 的顺序是经度,纬度。
 */
export const AmapReverseGeocodeUrl =
  'https://restapi.amap.com/v3/geocode/regeo?key={key}&location={lng},{lat}&extensions=base';

/** 逆地理 JSON 里地址文字的路径。 */
export const AmapAddressPath = 'regeocode.formatted_address';

/** 瓦片最大层级。 */
export const MapTileMaxZoom = 22;

/** 最大层级下横纵坐标的上限。 */
export const MapTileMaxIndex = 2 ** MapTileMaxZoom - 1;
