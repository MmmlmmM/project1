// ============================================================
// 课堂实录标注与分析系统 - 主入口
// ============================================================

import { AppState } from './state.js';
import { Navigation } from './navigation.js';
import { UploadManager } from './modules/upload.js';
import { AnnotationManager } from './modules/annotate.js';
import { TimelineManager } from './modules/timeline.js';
import { AnalysisManager } from './modules/analysis.js';
import { ReportManager } from './modules/report.js';
import { DataStore } from './store.js';
import { showToast } from './utils.js';

// 全局应用状态
const state = new AppState();
const store = new DataStore();

// 初始化各模块
const navigation = new Navigation(state);
const uploadManager = new UploadManager(state, store);
const annotationManager = new AnnotationManager(state, store);
const timelineManager = new TimelineManager(state, store);
const analysisManager = new AnalysisManager(state, store);
const reportManager = new ReportManager(state, store);

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('课堂实录标注与分析系统 v1.0 已启动');

  // 初始化导航
  navigation.init();

  // 初始化上传模块
  uploadManager.init();

  // 初始化标注模块
  annotationManager.init();

  // 初始化时间轴模块
  timelineManager.init();

  // 初始化分析模块
  analysisManager.init();

  // 初始化报告模块
  reportManager.init();

  // 加载示例数据（用于演示）
  loadDemoData();

  showToast('系统已就绪，请上传课堂实录视频开始分析', 'info');
});

/**
 * 加载演示数据
 */
function loadDemoData() {
  // 生成模拟标注数据用于演示
  const demoTags = generateDemoTags();
  store.setTags(demoTags);

  // 设置课程信息
  store.setCourseInfo({
    subject: '数学',
    grade: '初中',
    lessonType: '新授课',
    topicName: '一元二次方程的解法'
  });

  // 更新各模块
  annotationManager.refresh();
  timelineManager.refresh();
  analysisManager.refresh();
}

/**
 * 生成演示标注数据（模拟一节45分钟的数学课）
 */
function generateDemoTags() {
  const tags = [];
  let id = 1;

  const addTag = (type, start, end, note = '') => {
    tags.push({
      id: id++,
      type,
      category: getCategory(type),
      startTime: formatTime(start),
      startSeconds: start,
      endTime: formatTime(end),
      endSeconds: end,
      duration: end - start,
      note: note || getDefaultNote(type)
    });
  };

  // 导入环节 (0-3分钟)
  addTag('teacher_talk', 0, 120, '回顾上节课内容，引入新课');
  addTag('student_answer', 120, 155, '学生回答复习问题');
  addTag('teacher_feedback', 155, 180, '教师点评并导入新课');

  // 新知讲解 (3-12分钟)
  addTag('teacher_talk', 180, 360, '讲解一元二次方程的定义');
  addTag('board_writing', 200, 350, '板书方程定义和标准形式');
  addTag('teacher_question', 360, 370, '提问：什么是一元二次方程？');
  addTag('student_answer', 370, 420, '学生回答');
  addTag('teacher_feedback', 420, 450, '补充和纠正');
  addTag('teacher_talk', 450, 600, '讲解配方法');
  addTag('teacher_demo', 550, 720, '演示配方法解方程');

  // 师生互动 (12-18分钟)
  addTag('qa_interaction', 720, 820, '师生问答：配方法的步骤');
  addTag('student_practice', 820, 980, '学生在练习本上做配方法练习');
  addTag('teacher_guide', 820, 980, '教师巡视指导');
  addTag('student_present', 980, 1060, '学生上台展示解题过程');
  addTag('teacher_feedback', 1060, 1080, '教师点评');

  // 小组合作 (18-25分钟)
  addTag('transition', 1080, 1100, '过渡到小组合作环节');
  addTag('teacher_question', 1100, 1110, '布置小组任务');
  addTag('group_work', 1110, 1410, '小组合作探究公式法');
  addTag('teacher_guide', 1110, 1410, '教师巡视各小组');
  addTag('student_present', 1410, 1500, '各组代表展示');

  // 巩固练习 (25-35分钟)
  addTag('teacher_talk', 1500, 1560, '总结归纳解题方法');
  addTag('media_use', 1500, 1540, 'PPT展示知识框架');
  addTag('student_practice', 1560, 1860, '课堂练习');
  addTag('teacher_guide', 1560, 1860, '个别辅导');
  addTag('qa_interaction', 1860, 1980, '讲解典型错题');
  addTag('teacher_feedback', 1980, 2100, '纠错与强调要点');

  // 课堂小结 (35-40分钟)
  addTag('teacher_question', 2100, 2110, '提问：今天学到了什么？');
  addTag('student_answer', 2110, 2200, '多名学生总结');
  addTag('teacher_talk', 2200, 2350, '教师补充总结');
  addTag('board_writing', 2200, 2340, '板书知识框架');

  // 布置作业 (40-45分钟)
  addTag('teacher_talk', 2400, 2520, '布置课后作业');
  addTag('transition', 2520, 2580, '下课');
  addTag('silence', 2580, 2700, '课间休息');

  return tags;
}

function getCategory(type) {
  if (type.startsWith('teacher')) return 'teacher';
  if (type.startsWith('student')) return 'student';
  if (type.startsWith('qa') || type === 'group_work') return 'interaction';
  if (type === 'media_use' || type === 'board_writing') return 'media';
  return 'other';
}

function getDefaultNote(type) {
  const notes = {
    teacher_talk: '教师讲授',
    teacher_question: '教师提问',
    teacher_feedback: '教师反馈评价',
    teacher_demo: '教师演示示范',
    teacher_guide: '教师巡视指导',
    student_answer: '学生回答问题',
    student_question: '学生主动提问',
    student_discuss: '学生讨论交流',
    student_practice: '学生练习',
    student_present: '学生展示',
    qa_interaction: '师生互动问答',
    group_work: '小组合作学习',
    media_use: '多媒体使用',
    board_writing: '板书',
    silence: '课堂沉默/等待',
    transition: '教学过渡'
  };
  return notes[type] || '';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
