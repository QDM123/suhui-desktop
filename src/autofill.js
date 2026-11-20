/* ============================================================
   写日记自动填充（用户确认方案：定位 + 逆地理地址 + 自动天气）
   - 首选系统 geolocation（主进程仅放行该权限）→ 逆地理 + 实况天气
   - 精确定位失败时回退 IP 城市级定位（ipapi.co）并标注精度
   - 会话级缓存；不覆盖用户已手填的值；日记内容不出本机
   ============================================================ */

let cache = null

/** WMO weathercode → 吾记 10 项枚举 id（晴1 多云2 阴3 雨4 雷5 雾7 雪8 夜晚10） */
function mapWeather(cw) {
  if (!cw || typeof cw.weathercode !== 'number') return null
  const code = cw.weathercode
  const isDay = cw.is_day === 1
  let id = 2
  if (code === 0) id = 1
  else if (code === 1 || code === 2) id = 2
  else if (code === 3) id = 3
  else if (code === 45 || code === 48) id = 7
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) id = 4
  else if (code === 95 || code === 96 || code === 99) id = 5
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) id = 8
  if (!isDay && id === 1) id = 10
  return id
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Object.assign(new Error('unavailable'), { code: 2 }))
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(err), {
      timeout: 8000,
      maximumAge: 10 * 60 * 1000
    })
  })
}

async function reverseGeocode(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}` +
    `&accept-language=zh-CN&zoom=14`
  const j = await fetch(url).then((r) => r.json())
  const a = j.address || {}
  return a.city || a.town || a.district || a.county || a.state || j.name || ''
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
  const j = await fetch(url).then((r) => r.json())
  return mapWeather(j.current_weather)
}

async function byIp() {
  const j = await fetch('https://ipapi.co/json/').then((r) => r.json())
  if (!j || typeof j.latitude !== 'number') return null
  return { lat: j.latitude, lon: j.longitude, address: j.city || j.region || '' }
}

/**
 * 返回 { address, weatherId, precision: 'precise'|'city', reason? }
 * precision=city 表示精确定位失败后按 IP 城市回退
 */
export async function getAutoInfo() {
  if (cache) return cache

  let lat, lon, address, precision = 'precise'
  try {
    const pos = await getPosition()
    lat = pos.coords.latitude
    lon = pos.coords.longitude
    address = await reverseGeocode(lat, lon).catch(() => '')
  } catch (e) {
    // 精确定位失败：回退 IP 城市级
    let ip = null
    try { ip = await byIp() } catch { ip = null }
    if (!ip) {
      const reason = e?.code === 1
        ? '定位被拒绝（Windows 设置 → 隐私和安全性 → 位置，需开启并允许桌面应用）'
        : '定位不可用（请检查 Windows 位置服务）'
      return { failed: true, reason }
    }
    lat = ip.lat
    lon = ip.lon
    address = ip.address
    precision = 'city'
  }

  const weatherId = await fetchWeather(lat, lon).catch(() => null)
  cache = { address, weatherId, precision }
  return cache
}
