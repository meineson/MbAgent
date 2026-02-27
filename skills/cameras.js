import { execSync } from 'child_process';

export async function get_cameras({ range }) {
  const cameras = [
    { id: 1, name: '门口', url: 'rtsp://172.21.132.230/url1' },
    { id: 2, name: '办公室', url: 'rtsp://172.21.132.230:554/rtp/...' },
    { id: 3, name: '广场', url: 'rtsp://172.21.132.230/url3' },
  ];
  let resp = `已成功获取所有摄像头：\n\n`;
  cameras.forEach((cam) => {
    resp += `摄像头名称: "${cam.name}"\nRTSP地址: "${cam.url}"\n\n`;
  });
  return resp;
}

export async function check_camera({ url, name }) {
  try {
    const output = execSync(
      `ffprobe -timeout 3000000 -v error -show_entries stream=codec_name,codec_type -of default=noprint_wrappers=1 '${url}'`,
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 1024,
      }
    );
    return `检查${name}摄像头状态完成：视频流正常。ffprobe输出：${output.slice(0, 200)}`;
  } catch {
    return `检查${name}摄像头状态完成：连接失败。`;
  }
}