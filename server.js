const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const REDIRECT_URL = 'https://m.sqbe.cn/2d?c=25090203479144875194';

// 内存中存储状态
let queueCount = 0;
let minutesPerPortion = 3;
let autoComplete = false;
let autoCompleteTimer = null;

// ===== 持久化 =====
function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      queueCount = data.queueCount ?? 0;
      minutesPerPortion = data.minutesPerPortion ?? 3;
      autoComplete = data.autoComplete ?? false;
      console.log(`📂 已加载状态: ${queueCount}份, ${minutesPerPortion}分钟/份, 自动销单${autoComplete ? '开' : '关'}`);
    }
  } catch (e) {
    console.error('⚠️  加载状态失败，使用默认值', e.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      queueCount,
      minutesPerPortion,
      autoComplete
    }, null, 2));
  } catch (e) {
    console.error('⚠️  保存状态失败', e.message);
  }
}

// 启动时加载
loadState();

// ===== 自动销单 =====
function startAutoComplete() {
  stopAutoComplete();
  if (queueCount <= 0) {
    autoComplete = false;
    saveState();
    return;
  }
  autoCompleteTimer = setInterval(() => {
    if (queueCount > 0) {
      queueCount -= 1;
      console.log(`⏰ 自动销单: -1 份, 剩余 ${queueCount} 份`);
      saveState();
    }
    if (queueCount <= 0) {
      stopAutoComplete();
      autoComplete = false;
      saveState();
      console.log('⏰ 自动销单: 队列已清空，自动关闭');
    }
  }, minutesPerPortion * 60 * 1000);
}

function stopAutoComplete() {
  if (autoCompleteTimer) {
    clearInterval(autoCompleteTimer);
    autoCompleteTimer = null;
  }
}

// 启动时如果自动销单是开着的，恢复计时器
if (autoComplete && queueCount > 0) {
  startAutoComplete();
  console.log('⏰ 已恢复自动销单计时器');
}

function queueResponse() {
  return {
    count: queueCount,
    waitMinutes: queueCount * minutesPerPortion,
    minutesPerPortion,
    autoComplete
  };
}

app.use(express.json());

// 客户页面：等待时间 < 5分钟时直接 302 跳转
app.get('/customer.html', (req, res) => {
  const waitMinutes = queueCount * minutesPerPortion;
  if (waitMinutes < 5) {
    return res.redirect(302, REDIRECT_URL);
  }
  res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// 获取当前排队状态
app.get('/api/queue', (req, res) => {
  res.json(queueResponse());
});

// 增加份数
app.post('/api/queue/add', (req, res) => {
  const { count } = req.body;
  const validCounts = [1, 2, 5];
  if (!validCounts.includes(count)) {
    return res.status(400).json({ error: '份数只能是 1、2 或 5' });
  }
  queueCount += count;
  saveState();
  if (autoComplete) {
    startAutoComplete();
  }
  res.json(queueResponse());
});

// 完成一份
app.post('/api/queue/complete', (req, res) => {
  if (queueCount > 0) {
    queueCount -= 1;
    saveState();
  }
  res.json(queueResponse());
});

// 重置
app.post('/api/queue/reset', (req, res) => {
  queueCount = 0;
  stopAutoComplete();
  autoComplete = false;
  saveState();
  res.json(queueResponse());
});

// 设置每份等待时长
app.post('/api/settings/minutes', (req, res) => {
  const { minutes } = req.body;
  if (typeof minutes !== 'number' || minutes < 1 || minutes > 30) {
    return res.status(400).json({ error: '时长需在 1~30 分钟之间' });
  }
  minutesPerPortion = minutes;
  saveState();
  if (autoComplete) {
    startAutoComplete();
  }
  res.json(queueResponse());
});

// 切换自动销单
app.post('/api/settings/auto-complete', (req, res) => {
  const { enabled } = req.body;
  autoComplete = !!enabled;
  saveState();
  if (autoComplete && queueCount > 0) {
    startAutoComplete();
  } else {
    stopAutoComplete();
    if (queueCount <= 0) autoComplete = false;
  }
  res.json(queueResponse());
});

app.listen(PORT, () => {
  console.log(`🍽️  餐厅等候系统已启动: http://localhost:${PORT}`);
  console.log(`   商家页面: http://localhost:${PORT}/merchant.html`);
  console.log(`   客户页面: http://localhost:${PORT}/customer.html`);
});
