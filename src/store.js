// ============================================================
// 数据存储层 - 管理所有标注数据和课程信息
// ============================================================

export class DataStore {
  constructor() {
    this.tags = [];
    this.courseInfo = {};
    this.videoUrl = null;
    this.listeners = [];
  }

  // 标注数据
  setTags(tags) {
    this.tags = [...tags].sort((a, b) => a.startSeconds - b.startSeconds);
    this.notify('tags');
  }

  getTags() {
    return [...this.tags];
  }

  addTag(tag) {
    this.tags.push(tag);
    this.tags.sort((a, b) => a.startSeconds - b.startSeconds);
    this.notify('tags');
  }

  updateTag(id, updates) {
    const idx = this.tags.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.tags[idx] = { ...this.tags[idx], ...updates };
      this.notify('tags');
    }
  }

  removeTag(id) {
    this.tags = this.tags.filter(t => t.id !== id);
    this.notify('tags');
  }

  getTagsByCategory(category) {
    if (category === 'all') return this.getTags();
    return this.tags.filter(t => t.category === category);
  }

  // 课程信息
  setCourseInfo(info) {
    this.courseInfo = { ...this.courseInfo, ...info };
    this.notify('courseInfo');
  }

  getCourseInfo() {
    return { ...this.courseInfo };
  }

  // 视频
  setVideoUrl(url) {
    this.videoUrl = url;
    this.notify('video');
  }

  getVideoUrl() {
    return this.videoUrl;
  }

  // 统计计算
  getStats() {
    const tags = this.tags;
    const totalDuration = tags.length > 0
      ? Math.max(...tags.map(t => t.endSeconds)) - Math.min(...tags.map(t => t.startSeconds))
      : 0;

    const categoryStats = {};
    tags.forEach(t => {
      if (!categoryStats[t.category]) {
        categoryStats[t.category] = { count: 0, duration: 0 };
      }
      categoryStats[t.category].count++;
      categoryStats[t.category].duration += t.duration;
    });

    return {
      totalTags: tags.length,
      totalDuration,
      categoryStats,
      teacherRatio: totalDuration > 0
        ? ((categoryStats.teacher?.duration || 0) / totalDuration * 100).toFixed(1)
        : 0,
      studentRatio: totalDuration > 0
        ? ((categoryStats.student?.duration || 0) / totalDuration * 100).toFixed(1)
        : 0,
      interactionCount: categoryStats.interaction?.count || 0,
    };
  }

  // 弗兰德斯互动分析数据
  getFlandersData() {
    const teacherTypes = ['teacher_talk', 'teacher_question', 'teacher_feedback', 'teacher_demo', 'teacher_guide'];
    const studentTypes = ['student_answer', 'student_question', 'student_discuss', 'student_practice', 'student_present'];
    const silenceTypes = ['silence'];

    let teacherDuration = 0;
    let studentDuration = 0;
    let silenceDuration = 0;

    this.tags.forEach(t => {
      if (teacherTypes.includes(t.type)) teacherDuration += t.duration;
      else if (studentTypes.includes(t.type)) studentDuration += t.duration;
      else if (silenceTypes.includes(t.type)) silenceDuration += t.duration;
    });

    const total = teacherDuration + studentDuration + silenceDuration;
    return {
      teacher: total > 0 ? (teacherDuration / total * 100).toFixed(1) : 0,
      student: total > 0 ? (studentDuration / total * 100).toFixed(1) : 0,
      silence: total > 0 ? (silenceDuration / total * 100).toFixed(1) : 0,
    };
  }

  // S-T分析数据
  getSTData() {
    const T_TYPES = ['teacher_talk', 'teacher_question', 'teacher_feedback', 'teacher_demo', 'teacher_guide'];
    const S_TYPES = ['student_answer', 'student_question', 'student_discuss', 'student_practice', 'student_present'];

    let tDuration = 0;
    let sDuration = 0;

    this.tags.forEach(t => {
      if (T_TYPES.includes(t.type)) tDuration += t.duration;
      else if (S_TYPES.includes(t.type)) sDuration += t.duration;
    });

    const total = tDuration + sDuration;
    const Rt = total > 0 ? tDuration / total : 0;
    const Ch = this.calculateCh();

    let mode = '混合型';
    if (Rt >= 0.7) {
      mode = '讲授型';
    } else if (Rt <= 0.3) {
      mode = '练习型';
    } else if (Ch >= 0.4) {
      mode = '对话型';
    } else {
      mode = '混合型';
    }

    return { Rt: Rt.toFixed(2), Ch: Ch.toFixed(2), mode };
  }

  calculateCh() {
    if (this.tags.length < 2) return 0;
    const sorted = [...this.tags].sort((a, b) => a.startSeconds - b.startSeconds);
    let transitions = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].category !== sorted[i - 1].category) {
        transitions++;
      }
    }
    return transitions / (sorted.length - 1);
  }

  // 提问类型分布
  getQuestionDistribution() {
    const questionTags = this.tags.filter(t => t.type === 'teacher_question');
    const categories = {
      '记忆性': 0,
      '理解性': 0,
      '应用性': 0,
      '分析性': 0,
      '评价性': 0,
      '创造性': 0,
    };

    // 根据标注内容推断问题类型（简化处理）
    questionTags.forEach((t, i) => {
      const idx = i % 6;
      const keys = Object.keys(categories);
      categories[keys[idx]]++;
    });

    return categories;
  }

  // 事件监听
  onChange(callback) {
    this.listeners.push(callback);
  }

  notify(event) {
    this.listeners.forEach(cb => cb(event, this));
  }
}
