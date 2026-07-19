// ============================================================
// 时间轴分析模块
// ============================================================

import { formatSeconds, getTagTypeName } from '../utils.js';

export class TimelineManager {
  constructor(state, store) {
    this.state = state;
    this.store = store;
    this.chart = null;
    this.currentView = 'full';
  }

  init() {
    // 视图切换
    document.getElementById('timelineViewSelect').addEventListener('change', (e) => {
      this.currentView = e.target.value;
      this.refresh();
    });

    // 数据变更监听
    this.store.onChange((event) => {
      if (event === 'tags') this.refresh();
    });

    this.refresh();
  }

  refresh() {
    this.updateStats();
    this.renderTimelineChart();
    this.renderTimelineTrack();
  }

  updateStats() {
    const stats = this.store.getStats();
    document.getElementById('totalTagsStat').textContent = stats.totalTags;
    document.getElementById('teacherRatioStat').textContent = stats.teacherRatio + '%';
    document.getElementById('studentRatioStat').textContent = stats.studentRatio + '%';
    document.getElementById('interactionCountStat').textContent = stats.interactionCount;
  }

  renderTimelineChart() {
    const tags = this.store.getTags();
    const canvas = document.getElementById('timelineChart');

    if (this.chart) {
      this.chart.destroy();
    }

    if (tags.length === 0) return;

    // 按每分钟聚合
    const maxTime = Math.max(...tags.map(t => t.endSeconds));
    const totalMinutes = Math.ceil(maxTime / 60);
    const minutes = Array.from({ length: totalMinutes }, (_, i) => i);

    const teacherData = new Array(totalMinutes).fill(0);
    const studentData = new Array(totalMinutes).fill(0);
    const interactionData = new Array(totalMinutes).fill(0);
    const mediaData = new Array(totalMinutes).fill(0);
    const otherData = new Array(totalMinutes).fill(0);

    tags.forEach(t => {
      const startMin = Math.floor(t.startSeconds / 60);
      const endMin = Math.floor(t.endSeconds / 60);
      for (let m = startMin; m <= Math.min(endMin, totalMinutes - 1); m++) {
        switch (t.category) {
          case 'teacher': teacherData[m]++; break;
          case 'student': studentData[m]++; break;
          case 'interaction': interactionData[m]++; break;
          case 'media': mediaData[m]++; break;
          case 'other': otherData[m]++; break;
        }
      }
    });

    const datasets = [];
    if (this.currentView === 'full' || this.currentView === 'teacher') {
      datasets.push({
        label: '教师行为',
        data: teacherData,
        backgroundColor: 'rgba(99, 102, 241, 0.6)',
        borderColor: '#6366f1',
        borderWidth: 1,
      });
    }
    if (this.currentView === 'full' || this.currentView === 'student') {
      datasets.push({
        label: '学生行为',
        data: studentData,
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: '#10b981',
        borderWidth: 1,
      });
    }
    if (this.currentView === 'full' || this.currentView === 'interaction') {
      datasets.push({
        label: '互动',
        data: interactionData,
        backgroundColor: 'rgba(245, 158, 11, 0.6)',
        borderColor: '#f59e0b',
        borderWidth: 1,
      });
    }
    if (this.currentView === 'full') {
      datasets.push(
        {
          label: '媒体使用',
          data: mediaData,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: '#3b82f6',
          borderWidth: 1,
        },
        {
          label: '其他',
          data: otherData,
          backgroundColor: 'rgba(148, 163, 184, 0.6)',
          borderColor: '#94a3b8',
          borderWidth: 1,
        }
      );
    }

    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: minutes.map(m => `${m}'`),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            title: { display: true, text: '时间 (分钟)' },
            ticks: { font: { size: 10 } },
          },
          y: {
            stacked: true,
            title: { display: true, text: '标注数量' },
            ticks: { stepSize: 1 },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 10, font: { size: 11 } },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
        },
      },
    });
  }

  renderTimelineTrack() {
    const tags = this.store.getTags();
    const container = document.getElementById('timelineTrack');

    if (tags.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:40px">暂无标注数据</div>';
      return;
    }

    const maxTime = Math.max(...tags.map(t => t.endSeconds));

    const categories = [
      { key: 'teacher', label: '教师行为' },
      { key: 'student', label: '学生行为' },
      { key: 'interaction', label: '互动' },
      { key: 'media', label: '媒体使用' },
      { key: 'other', label: '其他' },
    ];

    container.innerHTML = categories.map(cat => {
      const catTags = tags.filter(t => t.category === cat.key);
      const segments = catTags.map(t => {
        const left = (t.startSeconds / maxTime * 100).toFixed(2);
        const width = Math.max((t.duration / maxTime * 100), 0.5).toFixed(2);
        return `<div class="timeline-segment ${cat.key}" style="left:${left}%;width:${width}%" title="${getTagTypeName(t.type)}: ${t.startTime}-${t.endTime}"></div>`;
      }).join('');

      return `
        <div class="timeline-row">
          <div class="timeline-row-label">${cat.label}</div>
          <div class="timeline-row-track">${segments}</div>
        </div>
      `;
    }).join('');
  }
}
