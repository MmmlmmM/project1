// ============================================================
// 工具函数
// ============================================================

/**
 * 显示 Toast 通知
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * 格式化秒数为 MM:SS
 */
export function formatSeconds(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 解析 MM:SS 格式为秒数
 */
export function parseTime(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

/**
 * 获取标注类型的中文名称
 */
export function getTagTypeName(type) {
  const names = {
    teacher_talk: '教师讲解',
    teacher_question: '教师提问',
    teacher_feedback: '教师反馈',
    teacher_demo: '教师示范',
    teacher_guide: '教师引导',
    student_answer: '学生回答',
    student_question: '学生提问',
    student_discuss: '学生讨论',
    student_practice: '学生练习',
    student_present: '学生展示',
    qa_interaction: '师生问答',
    group_work: '小组合作',
    media_use: '媒体使用',
    board_writing: '板书',
    silence: '课堂沉默',
    transition: '教学过渡',
  };
  return names[type] || type;
}

/**
 * 获取标注类型的类别
 */
export function getTagCategory(type) {
  if (type.startsWith('teacher')) return 'teacher';
  if (type.startsWith('student')) return 'student';
  if (type.startsWith('qa') || type === 'group_work') return 'interaction';
  if (type === 'media_use' || type === 'board_writing') return 'media';
  return 'other';
}

/**
 * 节流函数
 */
export function throttle(fn, delay) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 生成唯一ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * 导出数据为JSON文件
 */
export function exportJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导出数据为CSV文件
 */
export function exportCSV(data, filename) {
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
