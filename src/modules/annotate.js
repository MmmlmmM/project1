// ============================================================
// 智能标注模块
// ============================================================

import {
  showToast,
  formatSeconds,
  parseTime,
  getTagTypeName,
  getTagCategory,
  generateId,
  exportJSON,
  exportCSV
} from '../utils.js';

export class AnnotationManager {
  constructor(state, store) {
    this.state = state;
    this.store = store;
    this.currentFilter = 'all';
    this.isEditing = false;
    this.editingTagId = null;
    this.videoElement = null;
  }

  init() {
    this.videoElement = document.getElementById('annotateVideo');

    // 视频同步
    this.setupVideoSync();
    this.setupQuickTags();
    this.setupFilters();
    this.setupTagEditor();
    this.setupManualTag();
    this.setupAutoAnnotate();
    this.setupExport();

    // 数据变更监听
    this.store.onChange((event, store) => {
      if (event === 'tags') this.refresh();
      if (event === 'video') this.syncVideo();
    });

    // 初始化标记时刻按钮
    document.getElementById('markMomentBtn').addEventListener('click', () => {
      if (!this.videoElement) return;
      const currentTime = this.videoElement.currentTime;
      document.getElementById('tagStartTime').value = formatSeconds(currentTime);
      document.getElementById('tagEndTime').value = formatSeconds(currentTime + 5);
      this.showEditor();
      showToast(`已标记当前时刻 ${formatSeconds(currentTime)}`, 'info');
    });

    // 播放/暂停
    document.getElementById('playPauseBtn').addEventListener('click', () => {
      if (!this.videoElement) return;
      if (this.videoElement.paused) {
        this.videoElement.play();
      } else {
        this.videoElement.pause();
      }
    });
  }

  setupVideoSync() {
    if (!this.videoElement) return;

    const timeDisplay = document.getElementById('currentTimeDisplay');

    this.videoElement.addEventListener('timeupdate', () => {
      const current = this.videoElement.currentTime;
      const duration = this.videoElement.duration || 0;
      timeDisplay.textContent = `${formatSeconds(current)} / ${formatSeconds(duration)}`;

      // 高亮当前时间对应的标注
      this.highlightActiveTag(current);
    });
  }

  highlightActiveTag(currentTime) {
    const items = document.querySelectorAll('.tag-item');
    items.forEach(item => {
      const start = parseFloat(item.dataset.start || 0);
      const end = parseFloat(item.dataset.end || 0);
      if (currentTime >= start && currentTime <= end) {
        item.classList.add('active-tag');
      } else {
        item.classList.remove('active-tag');
      }
    });
  }

  setupQuickTags() {
    const quickTags = [
      { type: 'teacher_talk', label: '教师讲解', category: 'teacher' },
      { type: 'teacher_question', label: '教师提问', category: 'teacher' },
      { type: 'teacher_feedback', label: '教师反馈', category: 'teacher' },
      { type: 'student_answer', label: '学生回答', category: 'student' },
      { type: 'student_discuss', label: '学生讨论', category: 'student' },
      { type: 'student_practice', label: '学生练习', category: 'student' },
      { type: 'qa_interaction', label: '师生问答', category: 'interaction' },
      { type: 'group_work', label: '小组合作', category: 'interaction' },
      { type: 'media_use', label: '媒体使用', category: 'media' },
      { type: 'board_writing', label: '板书', category: 'media' },
      { type: 'silence', label: '课堂沉默', category: 'other' },
      { type: 'transition', label: '教学过渡', category: 'other' },
    ];

    const list = document.getElementById('quickTagList');
    list.innerHTML = quickTags.map(t =>
      `<button class="quick-tag ${t.category}" data-type="${t.type}">${t.label}</button>`
    ).join('');

    list.querySelectorAll('.quick-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.videoElement) return;

        const type = btn.dataset.type;
        const currentTime = this.videoElement.currentTime;
        const startTime = formatSeconds(currentTime);
        const endTime = formatSeconds(currentTime + 10);

        // 快速创建标注
        const tag = {
          id: generateId(),
          type,
          category: getTagCategory(type),
          startTime,
          startSeconds: currentTime,
          endTime,
          endSeconds: currentTime + 10,
          duration: 10,
          note: getTagTypeName(type),
        };

        this.store.addTag(tag);
        showToast(`已添加标注：${getTagTypeName(type)} (${startTime})`, 'success');
      });
    });
  }

  setupFilters() {
    document.querySelectorAll('.tag-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tag-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.category;
        this.renderTagList();
      });
    });
  }

  setupTagEditor() {
    document.getElementById('saveTagBtn').addEventListener('click', () => this.saveTag());
    document.getElementById('cancelTagBtn').addEventListener('click', () => this.hideEditor());
  }

  setupManualTag() {
    document.getElementById('addManualTagBtn').addEventListener('click', () => {
      document.getElementById('manualTagModal').style.display = 'flex';
    });

    // 关闭模态框
    document.querySelector('.modal-close').addEventListener('click', () => {
      document.getElementById('manualTagModal').style.display = 'none';
    });

    // 点击遮罩关闭
    document.getElementById('manualTagModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        e.currentTarget.style.display = 'none';
      }
    });

    // 全局暴露保存函数
    window.closeManualTagModal = () => {
      document.getElementById('manualTagModal').style.display = 'none';
    };
    window.saveManualTag = () => this.saveManualTag();
  }

  setupAutoAnnotate() {
    const btn = document.getElementById('autoAnnotateBtn');

    btn.addEventListener('click', async () => {
      // 获取当前视频信息
      const videoInfo = this.state.videoInfo;
      const videoUrl = this.store.videoUrl;

      // 检查是否有已处理的 fileId（通过上传流程）
      const fileId = this._getFileId();

      if (!fileId) {
        // 没有 fileId，提示用户需要先上传视频
        showToast('请先在"视频上传"页面导入视频并点击"上传并开始处理"', 'warning');
        return;
      }

      // 禁用按钮，显示加载状态
      btn.disabled = true;
      btn.textContent = 'AI处理中...';

      try {
        // 轮询任务状态
        const task = await this._pollTask(fileId);

        if (task.tags && task.tags.length > 0) {
          // 加载 AI 生成的标注
          this.store.setTags(task.tags);
          showToast(`AI标注完成！自动生成 ${task.tags.length} 条教学行为标注`, 'success');
        } else if (task.transcript && task.transcript.segments > 0) {
          // 有语音识别结果但没有生成标注
          showToast(`语音识别完成（${task.transcript.segments}个片段），但未生成标注。请手动添加或重试`, 'warning');
        } else {
          showToast('处理完成，请在标注页面手动添加标签', 'info');
        }
      } catch (err) {
        console.error('AI标注失败:', err);
        showToast('AI标注失败: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'AI自动标注';
      }
    });
  }

  /**
   * 从 store/state 中获取当前视频的 fileId
   */
  _getFileId() {
    // 尝试从 videoUrl 中提取 fileId
    const videoUrl = this.store.videoUrl || '';
    const match = videoUrl.match(/\/task\/([^\/]+)\/video/);
    if (match) return match[1];

    // 尝试从 videoInfo 中获取
    if (this.state.videoInfo?.fileId) return this.state.videoInfo.fileId;

    return null;
  }

  /**
   * 轮询任务状态直到完成
   */
  async _pollTask(fileId) {
    const maxRetries = 300; // 最多等5分钟
    let retries = 0;

    while (retries < maxRetries) {
      const res = await fetch(`/api/task/${fileId}`);
      if (!res.ok) throw new Error('任务查询失败');

      const task = await res.json();

      if (task.status === 'completed') {
        return task;
      }

      if (task.status === 'error') {
        throw new Error(task.error || '处理失败');
      }

      // 显示进度
      showToast(task.progressText || `处理中 ${task.progress}%...`, 'info');

      // 等待1秒再轮询
      await new Promise(r => setTimeout(r, 1000));
      retries++;
    }

    throw new Error('处理超时，请稍后重试');
  }

  setupExport() {
    document.getElementById('exportTagsBtn').addEventListener('click', () => {
      const tags = this.store.getTags();
      if (tags.length === 0) {
        showToast('没有可导出的标注数据', 'warning');
        return;
      }

      const exportData = tags.map(t => ({
        id: t.id,
        type: getTagTypeName(t.type),
        category: t.category,
        startTime: t.startTime,
        endTime: t.endTime,
        duration: formatSeconds(t.duration),
        note: t.note,
      }));

      exportCSV(exportData, `课堂标注_${new Date().toISOString().slice(0, 10)}.csv`);
      showToast('标注数据已导出为CSV文件', 'success');
    });
  }

  // 手动标注
  saveManualTag() {
    const type = document.getElementById('manualTagType').value;
    const startStr = document.getElementById('manualStartTime').value;
    const endStr = document.getElementById('manualEndTime').value;
    const note = document.getElementById('manualNote').value;

    const startSeconds = parseTime(startStr);
    const endSeconds = parseTime(endStr);

    if (isNaN(startSeconds) || isNaN(endSeconds)) {
      showToast('请输入有效的时间格式 (MM:SS)', 'error');
      return;
    }

    if (endSeconds <= startSeconds) {
      showToast('结束时间必须大于开始时间', 'error');
      return;
    }

    const tag = {
      id: generateId(),
      type,
      category: getTagCategory(type),
      startTime: startStr,
      startSeconds,
      endTime: endStr,
      endSeconds,
      duration: endSeconds - startSeconds,
      note: note || getTagTypeName(type),
    };

    this.store.addTag(tag);
    document.getElementById('manualTagModal').style.display = 'none';

    // 清空表单
    document.getElementById('manualStartTime').value = '';
    document.getElementById('manualEndTime').value = '';
    document.getElementById('manualNote').value = '';

    showToast(`已添加标注：${getTagTypeName(type)} (${startStr} - ${endStr})`, 'success');
  }

  // 编辑器
  showEditor(tag = null) {
    const editor = document.getElementById('tagEditor');
    editor.style.display = 'block';

    if (tag) {
      this.editingTagId = tag.id;
      document.getElementById('tagType').value = tag.type;
      document.getElementById('tagStartTime').value = tag.startTime;
      document.getElementById('tagEndTime').value = tag.endTime;
      document.getElementById('tagNote').value = tag.note || '';
    }
  }

  hideEditor() {
    document.getElementById('tagEditor').style.display = 'none';
    this.editingTagId = null;
    document.getElementById('tagType').value = 'teacher_talk';
    document.getElementById('tagStartTime').value = '';
    document.getElementById('tagEndTime').value = '';
    document.getElementById('tagNote').value = '';
  }

  saveTag() {
    const type = document.getElementById('tagType').value;
    const startStr = document.getElementById('tagStartTime').value;
    const endStr = document.getElementById('tagEndTime').value;
    const note = document.getElementById('tagNote').value;

    const startSeconds = parseTime(startStr);
    const endSeconds = parseTime(endStr);

    if (isNaN(startSeconds) || isNaN(endSeconds)) {
      showToast('请输入有效的时间格式', 'error');
      return;
    }

    if (this.editingTagId) {
      this.store.updateTag(this.editingTagId, {
        type,
        category: getTagCategory(type),
        startTime: startStr,
        startSeconds,
        endTime: endStr,
        endSeconds,
        duration: endSeconds - startSeconds,
        note,
      });
      showToast('标注已更新', 'success');
    } else {
      const tag = {
        id: generateId(),
        type,
        category: getTagCategory(type),
        startTime: startStr,
        startSeconds,
        endTime: endStr,
        endSeconds,
        duration: endSeconds - startSeconds,
        note,
      };
      this.store.addTag(tag);
      showToast(`已添加标注：${getTagTypeName(type)}`, 'success');
    }

    this.hideEditor();
  }

  // 渲染标注列表
  renderTagList() {
    const tags = this.currentFilter === 'all'
      ? this.store.getTags()
      : this.store.getTagsByCategory(this.currentFilter);

    const container = document.getElementById('tagItems');
    const count = document.getElementById('tagCount');
    count.textContent = tags.length;

    if (tags.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无标注，请播放视频并使用快捷标注或手动添加标注</div>';
      return;
    }

    container.innerHTML = tags.map(t => `
      <div class="tag-item ${t.category}"
           data-start="${t.startSeconds}"
           data-end="${t.endSeconds}"
           data-id="${t.id}"
           onclick="window.scrollToTag(${t.startSeconds})">
        <div class="tag-item-content">
          <div class="tag-item-type">${getTagTypeName(t.type)}</div>
          <div class="tag-item-time">${t.startTime} - ${t.endTime} (${formatSeconds(t.duration)})</div>
          ${t.note ? `<div class="tag-item-note">${t.note}</div>` : ''}
        </div>
        <button class="tag-item-delete" onclick="event.stopPropagation(); window.deleteTag('${t.id}')">✕</button>
      </div>
    `).join('');

    // 全局方法
    window.scrollToTag = (seconds) => {
      if (this.videoElement) {
        this.videoElement.currentTime = seconds;
        this.videoElement.play();
      }
    };

    window.deleteTag = (id) => {
      this.store.removeTag(id);
      showToast('标注已删除', 'info');
    };
  }

  syncVideo() {
    const url = this.store.getVideoUrl();
    if (url && this.videoElement) {
      this.videoElement.src = url;
    }
  }

  refresh() {
    this.renderTagList();
  }
}
