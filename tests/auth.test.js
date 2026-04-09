/**
 * 测试用例 - 认证接口
 */
import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function testAuthStatus() {
  console.log('📝 测试: GET /api/auth/status');
  
  const res = await fetch(`${BASE_URL}/api/auth/status`);
  const data = await res.json();
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(typeof data.required, 'boolean');
  
  console.log('  ✅ 通过');
}

async function testAuthVerifySuccess() {
  console.log('📝 测试: POST /api/auth/verify (正确密码)');
  
  const res = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'zhangxuefeng2026' })
  });
  
  const data = await res.json();
  
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  
  console.log('  ✅ 通过');
}

async function testAuthVerifyFailure() {
  console.log('📝 测试: POST /api/auth/verify (错误密码)');
  
  const res = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrongpassword' })
  });
  
  const data = await res.json();
  
  assert.strictEqual(res.status, 401);
  assert.strictEqual(data.success, false);
  
  console.log('  ✅ 通过');
}

async function testAuthVerifyMissing() {
  console.log('📝 测试: POST /api/auth/verify (缺少密码)');
  
  const res = await fetch(`${BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  assert.strictEqual(res.status, 400);
  
  console.log('  ✅ 通过');
}

// 运行所有测试
async function runTests() {
  console.log('\n🧪 认证接口测试\n');
  
  try {
    await testAuthStatus();
    await testAuthVerifySuccess();
    await testAuthVerifyFailure();
    await testAuthVerifyMissing();
    
    console.log('\n✅ 所有测试通过\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

runTests();