/**
 * 测试用例 - API 接口
 */
import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function testHealth() {
  console.log('📝 测试: GET /health');
  
  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.status, 'ok');
  
  console.log('  ✅ 通过');
}

async function testSkillInfo() {
  console.log('📝 测试: GET /api/skill/info');
  
  const res = await fetch(`${BASE_URL}/api/skill/info`);
  const data = await res.json();
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  assert.ok(data.skill.name);
  assert.ok(data.skill.description);
  
  console.log('  ✅ 通过');
}

async function testChatSuccess() {
  console.log('📝 测试: POST /api/chat (正常请求)');
  
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '测试消息' })
  });
  
  const data = await res.json();
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  assert.ok(data.reply);
  assert.ok(data.timestamp);
  
  console.log('  ✅ 通过');
}

async function testChatMissingMessage() {
  console.log('📝 测试: POST /api/chat (缺少消息)');
  
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  assert.strictEqual(res.status, 400);
  
  console.log('  ✅ 通过');
}

async function testChatReset() {
  console.log('📝 测试: POST /api/chat/reset');
  
  const res = await fetch(`${BASE_URL}/api/chat/reset`, {
    method: 'POST'
  });
  
  const data = await res.json();
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  
  console.log('  ✅ 通过');
}

async function testChatWithHistory() {
  console.log('📝 测试: POST /api/chat (带历史)');
  
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '你好',
      history: [
        { role: 'human', content: '之前的问题' },
        { role: 'ai', content: '之前的回答' }
      ]
    })
  });
  
  const data = await res.json();
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  
  console.log('  ✅ 通过');
}

// 运行所有测试
async function runTests() {
  console.log('\n🧪 API 接口测试\n');
  
  try {
    await testHealth();
    await testSkillInfo();
    await testChatSuccess();
    await testChatMissingMessage();
    await testChatReset();
    await testChatWithHistory();
    
    console.log('\n✅ 所有测试通过\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

runTests();