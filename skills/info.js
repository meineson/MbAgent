export async function get_weather({ city }) {
  const weatherData = {
    '北京': { temp: 15, condition: '晴', humidity: 45 },
    '上海': { temp: 22, condition: '多云', humidity: 65 },
    '广州': { temp: 28, condition: '小雨', humidity: 80 },
  };
  const w = weatherData[city] || { temp: 20, condition: '未知', humidity: 50 };
  return `${city}天气: ${w.condition}, 气温${w.temp}°C, 湿度${w.humidity}%`;
}

export async function get_current_time({ timezone = 'Asia/Shanghai' }) {
  const now = new Date();
  return `当前时间 (${timezone}): ${now.toLocaleString('zh-CN', { timeZone: timezone })}`;
}