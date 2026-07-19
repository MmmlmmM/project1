// ============================================================
// 视频上传模块 - 对接后端 Remux + Whisper AI 自动标注流水线
// ============================================================

import { showToast, formatSeconds } from '../utils.js';

const API_BASE = '/api';

export class UploadManager {
  constructor(state, store) {
    this.state = state;
    this.store = store;
    this.videoFile = null;
    this.currentFileId = null;
    this.pollTimer = null;
  }

  init() {
    this.setupDragDrop();
    this.setupFileInput();
    this.setupStartAnalysis();
    this.setupFormChange();
    this.checkBackendHealth();
  }

  async checkBackendHealth() {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      console.log('后端服务状态:', data);
    } catch {
      console.warn('后端服务未启动，将使用纯前端模式');
    }
  }

  setupDragDrop() {
    const zone = document.getElementById('uploadZone');

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFile(files[0]);
      }
    });

    zone.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      document.getElementById('videoInput').click();
    });
  }

  setupFileInput() {
    const input = document.getElementById('videoInput');
    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });
  }

  handleFile(file) {
    const validExtensions = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.wmv', '.flv', '.m4v'];
    const extension = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(extension)) {
      showToast(`不支持的文件格式 (${extension})，请上传 MP4/AVI/MOV/WebM 等格式`, 'error');
      return;
    }

    if (file.size > 1024 * 1024 * 1024 * 4) {
      showToast('文件大小不能超过 4GB', 'error');
      return;
    }

    this.videoFile = file;

    // 先本地预览
    this.showLocalPreview(file);
  }

  showLocalPreview(file) {
    const url = URL.createObjectURL(file);

    const zone = document.getElementById('uploadZone');
    const preview = document.getElementById('uploadPreview');
    const courseForm = document.getElementById('courseInfoForm');
    const video = document.getElementById('previewVideo');

    zone.style.display = 'none';
    preview.style.display = 'block';
    courseForm.style.display = 'block';

    // 显示文件信息
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = this.formatFileSize(file.size);
    document.getElementById('fileDuration').textContent = '检测中...';

    // 添加编码检测提示
    const startBtn = document.getElementById('startAnalysisBtn');
    startBtn.textContent = '上传并开始处理';
    startBtn.style.background = '#10b981';
    startBtn.onmouseenter = null;
    startBtn.onmouseleave = null;
  }

  setupStartAnalysis() {
    const btn = document.getElementById('startAnalysisBtn');
    btn.addEventListener('click', () => {
      const subject = document.getElementById('subject').value;
      const grade = document.getElementById('grade').value;
      const lessonType = document.getElementById('lessonType').value;
      const topicName = document.getElementById('topicName').value;

      if (!subject || !grade || !lessonType) {
        showToast('请填写课程基本信息', 'warning');
        return;
      }

      this.store.setCourseInfo({ subject, grade, lessonType, topicName });

      if (this.videoFile) {
        this.uploadAndProcess();
      } else {
        this.runDemoAnalysis();
      }
    });
  }

  /**
   * 上传视频到后端，启动转码+Whisper流水线
   */
  async uploadAndProcess() {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    overlay.style.display = 'flex';
    this.state.setAnalyzing(true);

    try {
      // Step 1: 上传文件
      loadingText.textContent = '正在上传视频文件...';
      const formData = new FormData();
      formData.append('video', this.videoFile);

      const uploadRes = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || '上传失败');
      }

      const uploadData = await uploadRes.json();
      this.currentFileId = uploadData.fileId;

      // 保存 fileId 到 videoInfo，供标注页面 AI 标注使用
      if (!this.state.videoInfo) {
        this.state.videoInfo = {};
      }
      this.state.videoInfo.fileId = uploadData.fileId;

      console.log('上传成功:', uploadData);

      // 设置进度轮询
      loadingText.textContent = '文件已上传，正在后台处理...';
      this.startProgressPolling(uploadData.fileId);

    } catch (err) {
      overlay.style.display = 'none';
      this.state.setAnalyzing(false);
      console.error('上传失败:', err);

      // 如果后端不可用，降级为本地模式
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        showToast('后端服务未启动，使用本地预览模式', 'warning');
        this.runLocalMode();
      } else {
        showToast('上传失败: ' + err.message, 'error');
      }
    }
  }

  /**
   * 轮询处理进度
   */
  startProgressPolling(fileId) {
    const loadingText = document.getElementById('loadingText');
    const overlay = document.getElementById('loadingOverlay');
    let consecutiveErrors = 0;

    this.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/task/${fileId}`);
        if (!res.ok) {
          consecutiveErrors++;
          if (consecutiveErrors > 5) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
            overlay.style.display = 'none';
            this.state.setAnalyzing(false);
            showToast('处理状态查询失败，请刷新页面重试', 'error');
          }
          return;
        }
        consecutiveErrors = 0;

        const task = await res.json();

        loadingText.textContent = task.progressText || `处理中 ${task.progress}%...`;

        if (task.status === 'completed') {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
          this.onPipelineComplete(task);
        } else if (task.status === 'error') {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
          overlay.style.display = 'none';
          this.state.setAnalyzing(false);
          showToast('处理失败: ' + (task.error || '未知错误'), 'error');
        }
      } catch (err) {
        console.warn('[轮询] 请求失败:', err.message);
        consecutiveErrors++;
        if (consecutiveErrors > 5) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
          overlay.style.display = 'none';
          this.state.setAnalyzing(false);
          showToast('网络连接失败，请检查后端服务', 'error');
        }
      }
    }, 1500); // 1.5秒轮询一次，减少请求压力
  }

  /**
   * 流水线完成后的处理
   */
  onPipelineComplete(task) {
    const overlay = document.getElementById('loadingOverlay');

    console.log('[onPipelineComplete] 收到任务结果:', {
      id: task.id,
      status: task.status,
      tagsCount: task.tags?.length,
      tagsCountAlt: task.tagsCount,
      transcript: task.transcript,
    });

    // 先关 overlay
    overlay.style.display = 'none';
    this.state.setAnalyzing(false);

    // 保存 fileId 到 state，供标注页面使用
    if (!this.state.videoInfo) {
      this.state.videoInfo = {};
    }
    this.state.videoInfo.fileId = task.id;

    // 保存转码后的视频URL
    const videoUrl = `${API_BASE}/task/${task.id}/video`;
    this.store.setVideoUrl(videoUrl);

    // 同步视频到标注页面
    const annotateVideo = document.getElementById('annotateVideo');
    if (annotateVideo) {
      annotateVideo.src = videoUrl;
    }

    // 先更新UI（在setTags之前，避免refresh报错中断）
    // 显示课程信息表单
    document.getElementById('courseInfoForm').style.display = 'block';

    // 更新按钮状态
    const btn = document.getElementById('startAnalysisBtn');
    if (btn) {
      btn.textContent = '查看分析结果';
      btn.style.background = '#6366f1';
      btn.onclick = () => {
        const navItem = document.querySelector('.nav-item[data-page="annotate"]');
        if (navItem) navItem.click();
      };
    }

    // 更新上传页面的视频预览
    const previewVideo = document.getElementById('previewVideo');
    if (previewVideo) {
      previewVideo.src = videoUrl;
      previewVideo.onloadedmetadata = () => {
        const durEl = document.getElementById('fileDuration');
        if (durEl) durEl.textContent = formatSeconds(previewVideo.duration);
      };
    }

    // 加载自动标注（tags 可能是 task.tags 数组或 task.tagsCount 数字）
    const tagsArray = task.tags;
    const hasTags = Array.isArray(tagsArray) && tagsArray.length > 0;

    if (hasTags) {
      try {
        this.store.setTags(tagsArray);
      } catch (e) {
        console.error('[onPipelineComplete] setTags失败:', e);
      }
      showToast(`处理完成！自动生成 ${tagsArray.length} 条教学行为标注`, 'success');
    } else if (task.transcript?.segments > 0) {
      showToast(`处理完成！语音识别已完成，请在标注页面添加标签`, 'success');
    } else {
      showToast('视频和音频已就绪，请到标注页面手动打断点添加标签', 'success');
    }

    console.log('[onPipelineComplete] 完成 - tags已加载:', tagsArray?.length || 0);
  }

  /**
   * 降级：后端不可用时的本地模式
   */
  runLocalMode() {
    const url = URL.createObjectURL(this.videoFile);
    this.store.setVideoUrl(url);

    const previewVideo = document.getElementById('previewVideo');
    previewVideo.src = url;

    previewVideo.onloadedmetadata = () => {
      document.getElementById('fileDuration').textContent = formatSeconds(previewVideo.duration);
      this.state.setVideoLoaded(true, {
        name: this.videoFile.name,
        duration: previewVideo.duration,
        size: this.videoFile.size,
        url: url,
      });
    };

    previewVideo.onerror = () => {
      showToast('视频解码失败，可能是 H.265 编码。请安装 ffmpeg 后端进行自动转码', 'error');
    };

    // 同步到标注页面
    const annotateVideo = document.getElementById('annotateVideo');
    if (annotateVideo) annotateVideo.src = url;
  }

  /**
   * 演示模式分析
   */
  runDemoAnalysis() {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    overlay.style.display = 'flex';
    loadingText.textContent = '正在进行AI智能分析...';

    this.state.setAnalyzing(true);

    const steps = [
      { text: '正在提取音频特征...', delay: 800 },
      { text: '正在识别教学行为...', delay: 1200 },
      { text: '正在标注师生互动...', delay: 1000 },
      { text: '正在生成分析报告...', delay: 1000 },
      { text: '分析完成！', delay: 500 },
    ];

    let totalDelay = 0;
    steps.forEach(step => {
      totalDelay += step.delay;
      setTimeout(() => { loadingText.textContent = step.text; }, totalDelay);
    });

    setTimeout(() => {
      overlay.style.display = 'none';
      this.state.setAnalyzing(false);
      showToast('AI分析完成！', 'success');
      document.querySelector('.nav-item[data-page="annotate"]').click();
    }, totalDelay + 500);
  }

  setupFormChange() {
    const formElements = ['subject', 'grade', 'lessonType', 'topicName'];
    formElements.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          const key = id === 'subject' ? 'subject' : id === 'grade' ? 'grade' : 'lessonType';
          this.store.setCourseInfo({ [key]: el.value });
        });
      }
    });
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}
