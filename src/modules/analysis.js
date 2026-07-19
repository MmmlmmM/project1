// ============================================================
// 数据分析模块 - 弗兰德斯/S-T/提问类型/课堂节奏/互动热度/教学环节
// ============================================================

export class AnalysisManager {
  constructor(state, store) {
    this.state = state;
    this.store = store;
    this.charts = {};
  }

  init() {
    // 刷新按钮
    document.getElementById('refreshAnalysisBtn').addEventListener('click', () => {
      this.refresh();
    });

    // 数据变更监听
    this.store.onChange((event) => {
      if (event === 'tags') this.refresh();
    });

    this.refresh();
  }

  refresh() {
    try { this.renderFlanders(); } catch (e) { console.error('Flanders图表错误:', e); }
    try { this.renderSTAnalysis(); } catch (e) { console.error('S-T图表错误:', e); }
    try { this.renderQuestionChart(); } catch (e) { console.error('提问图表错误:', e); }
    try { this.renderRhythmChart(); } catch (e) { console.error('节奏图表错误:', e); }
    try { this.renderHeatmap(); } catch (e) { console.error('热度图表错误:', e); }
    try { this.renderPhaseChart(); } catch (e) { console.error('环节图表错误:', e); }
  }

  // 弗兰德斯互动分析
  renderFlanders() {
    const data = this.store.getFlandersData();
    const teacherVal = parseFloat(data.teacher);
    const studentVal = parseFloat(data.student);
    const silenceVal = parseFloat(data.silence);

    // 进度条
    document.getElementById('teacherSpeechBar').style.width = teacherVal + '%';
    document.getElementById('studentSpeechBar').style.width = studentVal + '%';
    document.getElementById('silenceBar').style.width = silenceVal + '%';
    document.getElementById('teacherSpeechVal').textContent = teacherVal + '%';
    document.getElementById('studentSpeechVal').textContent = studentVal + '%';
    document.getElementById('silenceVal').textContent = silenceVal + '%';

    // 图表
    this.destroyChart('flandersChart');
    const canvas = document.getElementById('flandersChart');
    if (!canvas) return;

    this.charts.flanders = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['教师言语', '学生言语', '沉默/混乱'],
        datasets: [{
          data: [teacherVal, studentVal, silenceVal],
          backgroundColor: ['#6366f1', '#10b981', '#94a3b8'],
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 15, font: { size: 12 } },
          },
        },
        cutout: '60%',
      },
    });
  }

  // S-T分析
  renderSTAnalysis() {
    const data = this.store.getSTData();
    const Rt = parseFloat(data.Rt);
    const Ch = parseFloat(data.Ch);

    document.getElementById('rtValue').textContent = Rt.toFixed(2);
    document.getElementById('chValue').textContent = Ch.toFixed(2);
    document.getElementById('teachingMode').textContent = data.mode;

    this.destroyChart('stChart');
    const canvas = document.getElementById('stChart');
    if (!canvas) return;

    // 散点图模拟
    this.charts.st = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: '当前课堂',
          data: [{ x: Ch, y: Rt }],
          backgroundColor: '#ef4444',
          borderColor: '#ef4444',
          pointRadius: 8,
          pointHoverRadius: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: 'Ch (行为转换率)' },
            min: 0,
            max: 1,
          },
          y: {
            title: { display: true, text: 'Rt (教师行为占有率)' },
            min: 0,
            max: 1,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Rt: ${Rt.toFixed(2)}, Ch: ${Ch.toFixed(2)}`,
            },
          },
        },
      },
    });

    // 绘制分区
    this.drawSTZones();
  }

  drawSTZones() {
    const chart = this.charts.st;
    if (!chart) return;

    const ctx = chart.ctx;
    const xAxis = chart.scales.x;
    const yAxis = chart.scales.y;

    if (!xAxis || !yAxis) return;

    const zones = [
      { label: '练习型', xMin: 0, xMax: 1, yMin: 0, yMax: 0.3, color: 'rgba(16, 185, 129, 0.08)' },
      { label: '讲授型', xMin: 0, xMax: 1, yMin: 0.7, yMax: 1, color: 'rgba(99, 102, 241, 0.08)' },
      { label: '对话型', xMin: 0.4, xMax: 1, yMin: 0.3, yMax: 0.7, color: 'rgba(245, 158, 11, 0.08)' },
      { label: '混合型', xMin: 0, xMax: 0.4, yMin: 0.3, yMax: 0.7, color: 'rgba(148, 163, 184, 0.08)' },
    ];

    // 延迟绘制，等chart渲染完成
    setTimeout(() => {
      zones.forEach(zone => {
        const x1 = xAxis.getPixelForValue(zone.xMin);
        const x2 = xAxis.getPixelForValue(zone.xMax);
        const y1 = yAxis.getPixelForValue(zone.yMax);
        const y2 = yAxis.getPixelForValue(zone.yMin);

        ctx.fillStyle = zone.color;
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(zone.label, (x1 + x2) / 2, (y1 + y2) / 2);
      });
    }, 200);
  }

  // 提问类型分布
  renderQuestionChart() {
    const data = this.store.getQuestionDistribution();

    this.destroyChart('questionChart');
    const canvas = document.getElementById('questionChart');
    if (!canvas) return;

    this.charts.question = new Chart(canvas, {
      type: 'polarArea',
      data: {
        labels: Object.keys(data),
        datasets: [{
          data: Object.values(data),
          backgroundColor: [
            'rgba(99, 102, 241, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(59, 130, 246, 0.7)',
            'rgba(139, 92, 246, 0.7)',
          ],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 10, font: { size: 11 } },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            ticks: { stepSize: 1, font: { size: 9 } },
          },
        },
      },
    });
  }

  // 课堂节奏分析
  renderRhythmChart() {
    const tags = this.store.getTags();
    this.destroyChart('rhythmChart');
    const canvas = document.getElementById('rhythmChart');
    if (!canvas) return;

    if (tags.length === 0) return;

    const maxTime = Math.max(...tags.map(t => t.endSeconds));
    const totalMinutes = Math.ceil(maxTime / 60);

    // 每分钟计算活动密度
    const densityData = new Array(totalMinutes).fill(0);
    tags.forEach(t => {
      const startMin = Math.floor(t.startSeconds / 60);
      const endMin = Math.floor(t.endSeconds / 60);
      for (let m = startMin; m <= Math.min(endMin, totalMinutes - 1); m++) {
        densityData[m]++;
      }
    });

    // 计算滚动平均作为节奏指标
    const rhythmData = [];
    const windowSize = 3;
    for (let i = 0; i < densityData.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
        sum += densityData[j];
        count++;
      }
      rhythmData.push(count > 0 ? sum / count : 0);
    }

    this.charts.rhythm = new Chart(canvas, {
      type: 'line',
      data: {
        labels: Array.from({ length: totalMinutes }, (_, i) => `${i}'`),
        datasets: [
          {
            label: '活动密度',
            data: densityData,
            borderColor: 'rgba(99, 102, 241, 0.3)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 1,
            fill: true,
            pointRadius: 2,
          },
          {
            label: '课堂节奏',
            data: rhythmData,
            borderColor: '#ef4444',
            borderWidth: 2,
            fill: false,
            pointRadius: 3,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: '时间 (分钟)' },
          },
          y: {
            title: { display: true, text: '活动密度' },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 10, font: { size: 11 } },
          },
        },
      },
    });
  }

  // 互动热度图
  renderHeatmap() {
    const tags = this.store.getTags();
    this.destroyChart('heatmapChart');
    const canvas = document.getElementById('heatmapChart');
    if (!canvas) return;

    if (tags.length === 0) return;

    const maxTime = Math.max(...tags.map(t => t.endSeconds));
    const totalMinutes = Math.ceil(maxTime / 60);

    // 按5分钟分段
    const segmentSize = 5;
    const segments = Math.ceil(totalMinutes / segmentSize);
    const categories = ['teacher', 'student', 'interaction', 'media', 'other'];
    const heatData = categories.map(() => new Array(segments).fill(0));

    tags.forEach(t => {
      const catIdx = categories.indexOf(t.category);
      if (catIdx === -1) return;
      const seg = Math.floor(t.startSeconds / 60 / segmentSize);
      if (seg < segments) {
        heatData[catIdx][seg] += t.duration;
      }
    });

    this.charts.heatmap = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Array.from({ length: segments }, (_, i) => `${i * segmentSize}-${(i + 1) * segmentSize}分`),
        datasets: categories.map((cat, i) => ({
          label: this.getCategoryLabel(cat),
          data: heatData[i],
          backgroundColor: this.getCategoryColor(cat, 0.7),
          borderWidth: 0,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            title: { display: true, text: '时间段' },
            ticks: { font: { size: 9 } },
          },
          y: {
            stacked: true,
            title: { display: true, text: '持续时间(秒)' },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 8, font: { size: 10 } },
          },
        },
      },
    });
  }

  // 教学环节分布
  renderPhaseChart() {
    const tags = this.store.getTags();
    this.destroyChart('phaseChart');
    const canvas = document.getElementById('phaseChart');
    if (!canvas) return;

    if (tags.length === 0) return;

    const maxTime = Math.max(...tags.map(t => t.endSeconds));
    const totalMinutes = Math.ceil(maxTime / 60);

    // 按5分钟分阶段，计算每阶段各类别占比
    const segmentSize = 5;
    const segments = Math.ceil(totalMinutes / segmentSize);
    const phaseLabels = Array.from({ length: segments }, (_, i) => `第${i + 1}段`);

    const categories = ['teacher', 'student', 'interaction', 'media', 'other'];
    const phaseData = categories.map(() => new Array(segments).fill(0));

    tags.forEach(t => {
      const catIdx = categories.indexOf(t.category);
      if (catIdx === -1) return;
      const seg = Math.floor(t.startSeconds / 60 / segmentSize);
      if (seg < segments) {
        phaseData[catIdx][seg] += t.duration;
      }
    });

    // 计算每段百分比
    const percentageData = categories.map((_, catIdx) => {
      return Array.from({ length: segments }, (_, segIdx) => {
        const total = categories.reduce((sum, _, c) => sum + phaseData[c][segIdx], 0);
        return total > 0 ? (phaseData[catIdx][segIdx] / total * 100) : 0;
      });
    });

    this.charts.phase = new Chart(canvas, {
      type: 'line',
      data: {
        labels: phaseLabels,
        datasets: categories.map((cat, i) => ({
          label: this.getCategoryLabel(cat),
          data: percentageData[i],
          borderColor: this.getCategoryColor(cat, 1),
          backgroundColor: this.getCategoryColor(cat, 0.1),
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: '占比 (%)' },
            min: 0,
            max: 100,
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, padding: 8, font: { size: 10 } },
          },
        },
      },
    });
  }

  getCategoryLabel(cat) {
    const labels = {
      teacher: '教师行为',
      student: '学生行为',
      interaction: '互动',
      media: '媒体使用',
      other: '其他',
    };
    return labels[cat] || cat;
  }

  getCategoryColor(cat, alpha) {
    const colors = {
      teacher: `rgba(99, 102, 241, ${alpha})`,
      student: `rgba(16, 185, 129, ${alpha})`,
      interaction: `rgba(245, 158, 11, ${alpha})`,
      media: `rgba(59, 130, 246, ${alpha})`,
      other: `rgba(148, 163, 184, ${alpha})`,
    };
    return colors[cat] || `rgba(148, 163, 184, ${alpha})`;
  }

  destroyChart(key) {
    if (this.charts[key]) {
      this.charts[key].destroy();
      this.charts[key] = null;
      // 清理 canvas 避免重复使用冲突
      const canvas = document.getElementById(key);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 移除 chartjs 的 chartjs- 属性（如果有旧实例残留）
        const attrKey = Object.keys(canvas).find(k => k.startsWith('chartjs'));
        if (attrKey) delete canvas[attrKey];
      }
    }
  }
}
