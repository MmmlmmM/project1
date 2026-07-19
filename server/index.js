// ============================================================
// 课堂实录分析后端服务
// - 视频上传 → Remux换容器(秒级) → 提取音频 → Whisper语音识别 → 自动标注
// - 音频和视频时间轴完全对应，视频不重编码，速度快
// ============================================================

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

// 使用 npm 包自带的 ffmpeg 二进制文件，无需系统安装
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
// @ffmpeg-installer 只包含 ffmpeg.exe，ffprobe 用 ffmpeg 代替
const ffprobePath = ffmpegPath;  // 用 ffmpeg 的 -show_streams 参数代替 ffprobe

const app = express();
const PORT = process.env.PORT || 3001;

// ========== 目录初始化 ==========
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CONVERTED_DIR = path.join(__dirname, 'converted');
const AUDIO_DIR = path.join(__dirname, 'audio');
const TRANSCRIPT_DIR = path.join(__dirname, 'transcripts');
const ANNOTATION_DIR = path.join(__dirname, 'annotations');

[UPLOAD_DIR, CONVERTED_DIR, AUDIO_DIR, TRANSCRIPT_DIR, ANNOTATION_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 任务状态存储（内存）
const taskStore = new Map();

// ========== 中间件 ==========
app.use(cors());
app.use(express.json());
app.use('/converted', express.static(CONVERTED_DIR));
app.use('/audio', express.static(AUDIO_DIR));

// ========== Multer 配置 ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB
  fileFilter: (req, file, cb) => {
    const allowedExt = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.wmv', '.flv', '.m4v', '.ts', '.mts'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的格式: ${ext}，支持 MP4/AVI/MOV/WebM/MKV 等`));
    }
  },
});

// ========== 工具函数 ==========

/**
 * 检测 ffmpeg 是否可用
 */
function checkFfmpeg() {
  try {
    execSync(`"${ffmpegPath}" -version`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检测 ffprobe 是否可用（当前通过 ffmpeg 实现）
 */
function checkFfprobe() {
  // 直接复用 checkFfmpeg，因为我们用 ffmpeg 代替 ffprobe
  return checkFfmpeg();
}

/**
 * 获取视频编码信息
 */
function getVideoCodec(filePath) {
  return new Promise((resolve, reject) => {
    // 使用 ffmpeg 获取视频信息（ffprobe 不可用时）
    const proc = spawn(ffmpegPath, [
      '-i', filePath,
    ]);

    let stderr = '';
    proc.stderr.on('data', d => stderr += d);

    proc.on('close', (code) => {
      // ffmpeg -i 不传输出参数时，code=1 是正常的（它会输出信息后退出）
      // code=0 或 code=1 都表示成功获取了信息
      if (code !== 0 && code !== 1) return reject(new Error('ffmpeg 分析失败'));

      // 从 stderr 中解析视频信息
      const videoMatch = stderr.match(/Stream #\d+:\d+.*?Video:\s*(\w+)\s*(?:\(([^)]+)\))?.*?(\d+)x(\d+)/);
      const audioMatch = stderr.match(/Stream #\d+:\d+.*?Audio:\s*(\w+)/);
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      const bitrateMatch = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/);

      let duration = 0;
      if (durationMatch) {
        duration = parseInt(durationMatch[1]) * 3600 +
                   parseInt(durationMatch[2]) * 60 +
                   parseInt(durationMatch[3]) +
                   parseInt(durationMatch[4]) / 100;
      }

      resolve({
        videoCodec: videoMatch ? videoMatch[1] : 'unknown',
        videoCodecLong: videoMatch && videoMatch[2] ? videoMatch[2] : (videoMatch ? videoMatch[1] : 'unknown'),
        width: videoMatch ? parseInt(videoMatch[3]) : 0,
        height: videoMatch ? parseInt(videoMatch[4]) : 0,
        bitRate: bitrateMatch ? parseInt(bitrateMatch[1]) * 1000 : 0,
        audioCodec: audioMatch ? audioMatch[1] : 'none',
        duration: duration,
      });
    });

    proc.on('error', reject);
  });
}

/**
 * 视频转码为 H.264 + AAC
 */
function transcodeToH264(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const ffmpeg = spawn(ffmpegPath, [
      '-y',                         // 覆盖输出文件
      '-i', inputPath,              // 输入文件
      '-c:v', 'libx264',            // H.264 编码
      '-preset', 'ultrafast',       // 最快速度，最低内存占用
      '-crf', '28',                 // 质量 (18-28, 越高压缩越大，内存占用越低)
      '-threads', '1',              // 单线程编码，减少内存占用
      '-pix_fmt', 'yuv420p',        // 像素格式（兼容所有浏览器）
      '-c:a', 'aac',                // AAC 音频编码
      '-b:a', '128k',               // 音频比特率
      '-ar', '44100',               // 音频采样率
      '-ac', '2',                   // 双声道
      '-movflags', '+faststart',    // 网页渐进式加载
      '-progress', 'pipe:1',        // 进度输出到stdout
      '-nostats',                   // 不输出统计信息
      outputPath
    ]);

    let duration = 0;
    let lastProgress = 0;

    ffmpeg.stdout.on('data', (data) => {
      const text = data.toString();
      // 解析 duration
      const durMatch = text.match(/duration=(\d+)/);
      if (durMatch) duration = parseInt(durMatch[1]) / 1000000;

      // 解析当前进度
      const timeMatch = text.match(/out_time_us=(\d+)/);
      if (timeMatch && duration > 0 && onProgress) {
        const current = parseInt(timeMatch[1]) / 1000000;
        const progress = Math.min(Math.round((current / duration) * 100), 100);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress(progress);
        }
      }
    });

    let stderr = '';
    ffmpeg.stderr.on('data', d => stderr += d.toString());

    ffmpeg.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`[转码完成] 耗时 ${elapsed}s → ${outputPath}`);
        resolve({ success: true, elapsed, outputPath });
      } else {
        console.error(`[转码失败] code=${code}\n${stderr.slice(-500)}`);
        reject(new Error(`转码失败 (code=${code})`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg 启动失败: ${err.message}`));
    });
  });
}

/**
 * 快速 remux：将视频流+音频流复制到 MP4 容器（不重编码，速度快）
 * 用于把 AVI/MOV/MKV/TS 等浏览器不支持的格式转为 MP4
 * 时间轴完全不变，音频提取后的时间戳仍然对应
 */
function remuxToMp4(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const ffmpeg = spawn(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-c', 'copy',           // 视频流和音频流都直接复制，不重编码
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      '-nostats',
      outputPath
    ]);

    let duration = 0;
    let lastProgress = 0;

    ffmpeg.stdout.on('data', (data) => {
      const text = data.toString();
      const durMatch = text.match(/duration=(\d+)/);
      if (durMatch) duration = parseInt(durMatch[1]) / 1000000;

      const timeMatch = text.match(/out_time_us=(\d+)/);
      if (timeMatch && duration > 0 && onProgress) {
        const current = parseInt(timeMatch[1]) / 1000000;
        const progress = Math.min(Math.round((current / duration) * 100), 100);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress(progress);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`[Remux完成] 耗时 ${elapsed}s → ${outputPath}`);
        resolve({ success: true, elapsed, outputPath });
      } else {
        reject(new Error(`Remux 失败 (code=${code})`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg 启动失败: ${err.message}`));
    });
  });
}

/**
 * 提取音频为 WAV (16kHz, mono, 16bit) - Whisper 要求格式
 */
function extractAudio(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const ffmpeg = spawn(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',                        // 不要视频
      '-acodec', 'pcm_s16le',       // PCM 16-bit
      '-ar', '16000',               // 16kHz (Whisper 要求)
      '-ac', '1',                   // 单声道
      '-progress', 'pipe:1',
      '-nostats',
      outputPath
    ]);

    let duration = 0;
    let lastProgress = 0;

    ffmpeg.stdout.on('data', (data) => {
      const text = data.toString();
      const durMatch = text.match(/duration=(\d+)/);
      if (durMatch) duration = parseInt(durMatch[1]) / 1000000;

      const timeMatch = text.match(/out_time_us=(\d+)/);
      if (timeMatch && duration > 0 && onProgress) {
        const current = parseInt(timeMatch[1]) / 1000000;
        const progress = Math.min(Math.round((current / duration) * 100), 100);
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress(progress);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`[音频提取完成] 耗时 ${elapsed}s → ${outputPath}`);
        resolve({ success: true, elapsed, outputPath });
      } else {
        reject(new Error(`音频提取失败 (code=${code})`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg 启动失败: ${err.message}`));
    });
  });
}

/**
 * 使用 Whisper 进行语音识别
 * 支持: whisper (openai-whisper CLI) 或 whisper.cpp
 */
function runWhisper(audioPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      model = 'base',          // tiny/base/small/medium/large
      language = 'zh',          // 中文
      wordTimestamps = true,    // 词级时间戳
    } = options;

    // 尝试 whisper CLI
    const args = [
      audioPath,
      '--model', model,
      '--language', language,
      '--output_format', 'json',
      '--output_dir', path.dirname(outputPath),
      '--task', 'transcribe',
    ];

    if (wordTimestamps) {
      args.push('--word_timestamps', 'True');
    }

    console.log(`[Whisper] 开始识别 (model=${model}, lang=${language})`);

    // 构建环境变量：Whisper 内部调用 ffmpeg 读取音频，需要 ffmpeg 在 PATH 中
    const env = { ...process.env };
    const ffmpegDir = path.dirname(ffmpegPath);
    env.PATH = ffmpegDir + path.delimiter + (env.PATH || env.Path || '');

    // 使用 python -m whisper 方式调用（更可靠，不依赖 PATH）
    const whisper = spawn('python', ['-m', 'whisper', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';

    whisper.stdout.on('data', d => {
      const text = d.toString();
      stdout += text;
      // 实时输出进度
      if (text.includes('%')) {
        const match = text.match(/(\d+)%/);
        if (match) console.log(`[Whisper] 进度: ${match[1]}%`);
      }
    });

    whisper.stderr.on('data', d => {
      const text = d.toString();
      stderr += text;
      // Whisper 把进度输出到 stderr
      if (text.includes('%')) {
        const match = text.match(/(\d+)%/);
        if (match) console.log(`[Whisper] 进度: ${match[1]}%`);
      }
    });

    whisper.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Whisper] 失败 (code=${code})`);
        // 输出部分 stderr 用于调试
        console.error(stderr.slice(-1000));
        return reject(new Error(`Whisper 识别失败 (code=${code})`));
      }

      console.log('[Whisper] 识别完成');
      // Whisper 输出文件名为 {音频文件名}.json
      const audioBaseName = path.basename(audioPath, path.extname(audioPath));
      const jsonPath = path.join(path.dirname(outputPath), audioBaseName + '.json');

      if (fs.existsSync(jsonPath)) {
        const result = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        // 也保存一份到指定路径
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        resolve(result);
      } else if (fs.existsSync(outputPath)) {
        resolve(JSON.parse(fs.readFileSync(outputPath, 'utf-8')));
      } else {
        // 尝试从 stdout 解析
        try {
          const result = JSON.parse(stdout);
          fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
          resolve(result);
        } catch {
          reject(new Error('Whisper 未生成输出文件'));
        }
      }
    });

    whisper.on('error', (err) => {
      reject(new Error(`Whisper 启动失败: ${err.message}`));
    });
  });
}

/**
 * 从转录文本中提取教学行为标注
 * 优先关键词匹配，无法匹配的片段自动分配默认类型
 */
function analyzeTranscript(transcript, videoDuration) {
  const segments = transcript.segments || [];
  const tags = [];
  let id = 1;

  // 教学行为关键词映射（扩展关键词库）
  const keywordMap = [
    // 教师讲解类
    { keywords: ['打开课本', '翻到', '第.*页', '看书', '课本', '教材', '课文', '朗读', '读.*课文', '齐读', '默读'], type: 'teacher_talk', note: '教师讲解' },
    // 教师提问类
    { keywords: ['谁来回答', '请.*回答', '有没有.*知道', '大家.*想想', '为什么', '什么是', '怎么', '如何', '谁知道', '哪位同学', '告诉我', '说一说', '想一想', '你觉得', '你们觉得'], type: 'teacher_question', note: '教师提问' },
    // 教师反馈类
    { keywords: ['很好', '不错', '正确', '对的', '很棒', '非常好', '不对', '再想想', '还有吗', '说得对', '真棒', '鼓掌', '鼓励', '表扬', '错了', '没关系', '继续', '加油'], type: 'teacher_feedback', note: '教师反馈' },
    // 教师示范类
    { keywords: ['大家看', '请看', '注意', '演示', '示范', '例如', '比如', '看黑板', '看屏幕', '看这里', '注意看', '观察'], type: 'teacher_talk', note: '教师示范' },
    // 学生练习类
    { keywords: ['下面.*做', '练习', '试试', '自己.*做', '动手', '做题', '写.*题', '算.*题', '完成.*题', '练一练'], type: 'student_practice', note: '学生练习' },
    // 小组合作类
    { keywords: ['讨论', '小组', '交流', '互相', '合作', '一起', '同伴', '同桌', '前后桌'], type: 'group_work', note: '小组合作' },
    // 学生展示类
    { keywords: ['上台', '展示', '汇报', '分享', '表演', '黑板.*写', '板演'], type: 'student_present', note: '学生展示' },
    // 课堂总结类
    { keywords: ['总结', '回顾', '今天.*学了', '这节课', '我们.*学了', '学到了', '收获', '小结'], type: 'teacher_talk', note: '课堂总结' },
    // 布置作业类
    { keywords: ['作业', '课后', '预习', '复习', '回家', '下节课', '明天'], type: 'teacher_talk', note: '布置任务' },
    // 课堂管理/上下课 → 归入教师行为
    { keywords: ['安静', '坐好', '注意听', '不要.*说话', '停.*笔', '看.*老师', '集中.*注意'], type: 'teacher_talk', note: '课程讲解' },
    { keywords: ['上课', '起立', '老师好', '同学们好'], type: 'teacher_talk', note: '课程讲解' },
    { keywords: ['下课', '休息', '再见', '老师再见', '同学们再见'], type: 'teacher_talk', note: '课程讲解' },
    // 学生举手/提问
    { keywords: ['举手', '提问', '我有.*问题', '请问', '老师.*问', '不懂', '不会', '没听懂'], type: 'student_answer', note: '学生举手/提问' },
    // 问答互动类
    { keywords: ['问', '答', '对答'], type: 'qa_interaction', note: '师生问答' },
  ];

  // 第一步：匹配关键词 + 收集未匹配片段
  const unmatchedSegs = [];

  segments.forEach(seg => {
    const text = (seg.text || '').trim();
    if (!text) return;

    let matched = false;

    // 匹配关键词
    for (const mapping of keywordMap) {
      for (const pattern of mapping.keywords) {
        if (new RegExp(pattern).test(text)) {
          tags.push({
            id: id++,
            type: mapping.type,
            category: getCategory(mapping.type),
            startTime: formatTime(seg.start),
            startSeconds: seg.start,
            endTime: formatTime(seg.end),
            endSeconds: seg.end,
            duration: seg.end - seg.start,
            note: mapping.note,
            transcript: text,
          });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      unmatchedSegs.push(seg);
    }
  });

  // 第二步：合并相邻的未匹配短片段，避免碎片化
  const mergedSegs = [];
  const MAX_GAP = 3; // 3秒内的间隙合并

  for (const seg of unmatchedSegs) {
    const last = mergedSegs[mergedSegs.length - 1];
    if (last && seg.start - last.endSeconds <= MAX_GAP) {
      // 合并到上一个片段
      last.endSeconds = seg.end;
      last.endTime = formatTime(seg.end);
      last.duration = last.endSeconds - last.startSeconds;
      last.transcript = (last.transcript || '') + ' ' + (seg.text || '');
    } else {
      mergedSegs.push({
        startSeconds: seg.start,
        startTime: formatTime(seg.start),
        endSeconds: seg.end,
        endTime: formatTime(seg.end),
        duration: seg.end - seg.start,
        transcript: seg.text || '',
      });
    }
  }

  // 第三步：为合并后的片段分配类型
  mergedSegs.forEach(seg => {
    const dur = seg.duration;
    let defaultType, defaultNote;
    if (dur >= 20) {
      defaultType = 'teacher_talk';
      defaultNote = '教师讲解';
    } else if (dur >= 8) {
      defaultType = 'teacher_talk';
      defaultNote = '教学讲授';
    } else {
      // 合并后仍很短 → 跳过，不生成标注
      return;
    }

    tags.push({
      id: id++,
      type: defaultType,
      category: getCategory(defaultType),
      startTime: seg.startTime,
      startSeconds: seg.startSeconds,
      endTime: seg.endTime,
      endSeconds: seg.endSeconds,
      duration: dur,
      note: defaultNote,
      transcript: seg.transcript,
    });
  });

  return tags;
}

function getCategory(type) {
  if (type.startsWith('teacher')) return 'teacher';
  if (type.startsWith('student')) return 'student';
  if (type.startsWith('qa') || type === 'group_work') return 'interaction';
  return 'other';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ========== API 路由 ==========

// 健康检查 + 环境检测
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      ffmpeg: checkFfmpeg(),
      ffprobe: checkFfprobe(),
      whisper: checkWhisper(),
    },
  });
});

function checkWhisper() {
  try {
    execSync('python -c "import whisper; print(whisper.__version__)"', { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

// ========== 核心流水线 API ==========

/**
 * POST /api/upload
 * 上传视频 → 检测信息 → H.264转码 → 提取音频 → 用户手动打断点标注
 */
app.post('/api/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未选择文件' });
  }

  const fileId = path.parse(req.file.filename).name;
  const originalPath = req.file.path;
  const originalName = req.file.originalname;
  const fileSize = req.file.size;

  // 初始化任务状态
  taskStore.set(fileId, {
    id: fileId,
    status: 'uploaded',
    originalName,
    originalPath,
    fileSize,
    steps: {
      codecCheck: 'pending',
      transcode: 'pending',
      audioExtract: 'pending',
      whisper: 'pending',
    },
    progress: 0,
    progressText: '文件已上传',
    codecInfo: null,
    convertedPath: null,
    audioPath: null,
    transcriptPath: null,
    transcript: null,
    tags: [],
    error: null,
  });

  // 立即返回任务ID，后台异步处理
  res.json({
    success: true,
    fileId,
    originalName,
    fileSize,
    message: '文件已上传，正在后台处理...',
  });

  // 后台流水线处理
  processVideoPipeline(fileId).catch(err => {
    console.error(`[流水线错误] ${fileId}:`, err.message);
    const task = taskStore.get(fileId);
    if (task) {
      task.status = 'error';
      task.error = err.message;
      task.progressText = '处理失败: ' + err.message;
    }
  });
});

/**
 * 视频处理流水线
 * 流程：检测信息 → Remux换容器(快) → 提取音频 → Whisper语音识别 → 自动生成标注
 * 视频不重编码，时间轴完全对应，速度快
 */
async function processVideoPipeline(fileId) {
  const task = taskStore.get(fileId);
  if (!task) return;

  const updateProgress = (step, status, progress, text) => {
    task.steps[step] = status;
    task.progress = progress;
    task.progressText = text;
    taskStore.set(fileId, task);
  };

  try {
    // Step 1: 检测编码 & 视频信息
    updateProgress('codecCheck', 'running', 5, '正在检测视频信息...');
    console.log(`[流水线] ${fileId} - 检测视频信息`);

    const codecInfo = await getVideoCodec(task.originalPath);
    task.codecInfo = codecInfo;
    updateProgress('codecCheck', 'done', 10,
      `编码: ${codecInfo.videoCodec}, 分辨率: ${codecInfo.width}x${codecInfo.height}, 时长: ${codecInfo.duration.toFixed(1)}s`);

    // Step 2: 准备视频（remux换容器，不重编码，秒级完成）
    const ext = path.extname(task.originalPath).toLowerCase();
    const browserPlayable = ['.mp4', '.webm', '.ogg', '.ogv'];

    if (browserPlayable.includes(ext)) {
      updateProgress('transcode', 'running', 12, '正在准备视频文件...');
      const convertedPath = path.join(CONVERTED_DIR, fileId + ext);
      fs.copyFileSync(task.originalPath, convertedPath);
      task.convertedPath = convertedPath;
      updateProgress('transcode', 'done', 15, `视频就绪 (${ext}, 浏览器原生支持)`);
    } else {
      updateProgress('transcode', 'running', 12, `正在转换容器 (${ext} → .mp4, 不重编码)...`);
      console.log(`[流水线] ${fileId} - Remux ${ext} → .mp4`);

      const convertedPath = path.join(CONVERTED_DIR, fileId + '.mp4');
      await remuxToMp4(task.originalPath, convertedPath, (p) => {
        const overall = 12 + Math.floor(p * 0.08);
        updateProgress('transcode', 'running', overall, `换容器 ${p}%...`);
      });

      task.convertedPath = convertedPath;
      updateProgress('transcode', 'done', 20, '视频容器转换完成 (.mp4)');
    }

    // Step 3: 从原始视频提取音频（时间轴与视频完全一致）
    updateProgress('audioExtract', 'running', 25, '正在提取音频...');
    console.log(`[流水线] ${fileId} - 提取音频`);

    const audioPath = path.join(AUDIO_DIR, fileId + '.wav');
    await extractAudio(task.originalPath, audioPath, (p) => {
      const overall = 25 + Math.floor(p * 0.15); // 25%-40%
      updateProgress('audioExtract', 'running', overall, `提取音频 ${p}%...`);
    });

    task.audioPath = audioPath;
    updateProgress('audioExtract', 'done', 40, '音频提取完成 (16kHz WAV)');

    // Step 4: Whisper 语音识别 → 自动生成标注
    if (checkWhisper()) {
      updateProgress('whisper', 'running', 45, '正在进行语音识别 (Whisper AI)...');
      console.log(`[流水线] ${fileId} - Whisper 识别开始`);

      const transcriptPath = path.join(TRANSCRIPT_DIR, fileId + '.json');

      try {
        const transcript = await runWhisper(audioPath, transcriptPath, {
          model: 'base',
          language: 'zh',
          wordTimestamps: true,
        });

        task.transcript = transcript;
        task.transcriptPath = transcriptPath;

        // 从转录文本自动生成教学行为标注
        const tags = analyzeTranscript(transcript, task.codecInfo?.duration || 0);
        task.tags = tags;

        updateProgress('whisper', 'done', 95, `语音识别完成！自动生成 ${tags.length} 条标注`);
        console.log(`[流水线] ${fileId} - Whisper完成，${tags.length}条标注`);
      } catch (whisperErr) {
        console.error(`[Whisper] 失败:`, whisperErr.message);
        updateProgress('whisper', 'error', 45, 'Whisper 识别失败，请手动标注');
        task.tags = [];
      }
    } else {
      updateProgress('whisper', 'skipped', 45, 'Whisper 未安装，请手动标注');
      task.tags = [];
    }

    task.status = 'completed';
    task.progress = 100;
    task.progressText = task.tags.length > 0
      ? `处理完成！自动生成 ${task.tags.length} 条标注`
      : '处理完成！请在标注页面手动添加标签';
    taskStore.set(fileId, task);
    console.log(`[流水线] ${fileId} - 全部完成`);

  } catch (err) {
    task.status = 'error';
    task.error = err.message;
    task.progressText = '处理失败: ' + err.message;
    taskStore.set(fileId, task);
    throw err;
  }
}

/**
 * GET /api/task/:fileId
 * 查询处理进度
 */
app.get('/api/task/:fileId', (req, res) => {
  const task = taskStore.get(req.params.fileId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }

  res.json({
    id: task.id,
    status: task.status,
    progress: task.progress,
    progressText: task.progressText,
    steps: task.steps,
    codecInfo: task.codecInfo,
    originalName: task.originalName,
    error: task.error,
    // 处理完成后返回结果路径
    ...(task.status === 'completed' ? {
      videoUrl: `/converted/${path.basename(task.convertedPath)}`,
      audioUrl: `/audio/${task.id}.wav`,
      transcript: task.transcript ? {
        segments: task.transcript.segments?.length || 0,
        language: task.transcript.language,
      } : null,
      tagsCount: task.tags.length,
      tags: task.tags,
    } : {}),
  });
});

/**
 * GET /api/task/:fileId/video
 * 获取原始视频文件（音频时间轴与视频完全对应）
 */
app.get('/api/task/:fileId/video', (req, res) => {
  const task = taskStore.get(req.params.fileId);
  if (!task || !task.convertedPath) {
    return res.status(404).json({ error: '视频不可用' });
  }
  res.sendFile(task.convertedPath);
});

/**
 * GET /api/task/:fileId/audio
 * 获取提取的音频文件
 */
app.get('/api/task/:fileId/audio', (req, res) => {
  const task = taskStore.get(req.params.fileId);
  if (!task || !task.audioPath) {
    return res.status(404).json({ error: '音频不可用' });
  }
  res.sendFile(task.audioPath);
});

/**
 * GET /api/task/:fileId/transcript
 * 获取转录文本
 */
app.get('/api/task/:fileId/transcript', (req, res) => {
  const task = taskStore.get(req.params.fileId);
  if (!task || !task.transcript) {
    return res.status(404).json({ error: '转录文本不可用' });
  }
  res.json(task.transcript);
});

/**
 * GET /api/task/:fileId/tags
 * 获取自动标注
 */
app.get('/api/task/:fileId/tags', (req, res) => {
  const task = taskStore.get(req.params.fileId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  res.json({ tags: task.tags || [] });
});

// ========== 视频编码检测 API ==========

/**
 * POST /api/detect-codec
 * 单独检测视频编码（不上传，传入本地路径或URL）
 */
app.post('/api/detect-codec', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未选择文件' });
  }

  try {
    const info = await getVideoCodec(req.file.path);
    // 清理临时文件
    fs.unlinkSync(req.file.path);
    res.json({ success: true, ...info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 标注数据 API ==========

app.post('/api/annotations', (req, res) => {
  const annotations = req.body;
  const filename = `annotations_${Date.now()}.json`;
  fs.writeFileSync(
    path.join(ANNOTATION_DIR, filename),
    JSON.stringify(annotations, null, 2)
  );
  res.json({ success: true, filename });
});

app.get('/api/annotations/:filename', (req, res) => {
  const filePath = path.join(ANNOTATION_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
});

// ========== 静态文件（生产环境） ==========
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

// ========== 错误处理 ==========
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

// ========== 启动 ==========
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('  课堂实录分析后端服务已启动');
  console.log(`  http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log(`  ffmpeg:   ${checkFfmpeg() ? '✓ 可用' : '✗ 未安装'}`);
  console.log(`  ffprobe:  ${checkFfprobe() ? '✓ 可用' : '✗ 未安装'}`);
  console.log(`  whisper:  ${checkWhisper() ? '✓ 可用' : '✗ 未安装'}`);
  console.log('='.repeat(60));

  if (!checkFfmpeg()) {
    console.warn('⚠ 请安装 ffmpeg: https://ffmpeg.org/download.html');
  }
  if (!checkWhisper()) {
    console.warn('⚠ 请安装 openai-whisper: pip install openai-whisper');
  }
});
