// ============================================================
// 反思报告模块 - 生成教学反思报告
// ============================================================

import { showToast, formatSeconds, getTagTypeName } from '../utils.js';

export class ReportManager {
  constructor(state, store) {
    this.state = state;
    this.store = store;
  }

  init() {
    document.getElementById('generateReportBtn').addEventListener('click', () => this.generateReport());
    document.getElementById('exportReportBtn').addEventListener('click', () => this.exportReport());
    document.getElementById('printReportBtn').addEventListener('click', () => this.printReport());

    // 数据变更监听
    this.store.onChange((event) => {
      // 不自动刷新报告
    });
  }

  generateReport() {
    const tags = this.store.getTags();
    if (tags.length === 0) {
      showToast('请先添加标注数据', 'warning');
      return;
    }

    document.getElementById('reportEmpty').style.display = 'none';
    document.getElementById('reportContent').style.display = 'block';

    const courseInfo = this.store.getCourseInfo();
    const stats = this.store.getStats();
    const flanders = this.store.getFlandersData();
    const stData = this.store.getSTData();

    // 计算详细统计
    const teacherTags = tags.filter(t => t.category === 'teacher');
    const studentTags = tags.filter(t => t.category === 'student');
    const interactionTags = tags.filter(t => t.category === 'interaction');

    const teacherDuration = teacherTags.reduce((s, t) => s + t.duration, 0);
    const studentDuration = studentTags.reduce((s, t) => s + t.duration, 0);
    const totalDuration = Math.max(...tags.map(t => t.endSeconds));

    const questionCount = tags.filter(t => t.type === 'teacher_question').length;
    const feedbackCount = tags.filter(t => t.type === 'teacher_feedback').length;
    const groupWorkCount = tags.filter(t => t.type === 'group_work').length;

    // 生成洞察
    const insights = this.generateInsights(tags, flanders, stData);

    // 生成改进建议
    const suggestions = this.generateSuggestions(tags, flanders, stData, courseInfo);

    const reportHTML = `
      <div class="report-section">
        <h3>一、课程基本信息</h3>
        <div class="report-metrics-grid">
          <div class="report-metric">
            <div class="value">${courseInfo.subject || '-'}</div>
            <div class="label">学科</div>
          </div>
          <div class="report-metric">
            <div class="value">${courseInfo.grade || '-'}</div>
            <div class="label">年级</div>
          </div>
          <div class="report-metric">
            <div class="value">${courseInfo.lessonType || '-'}</div>
            <div class="label">课型</div>
          </div>
          <div class="report-metric">
            <div class="value">${courseInfo.topicName || '-'}</div>
            <div class="label">课题名称</div>
          </div>
          <div class="report-metric">
            <div class="value">${formatSeconds(totalDuration)}</div>
            <div class="label">课堂总时长</div>
          </div>
          <div class="report-metric">
            <div class="value">${stats.totalTags}</div>
            <div class="label">总标注数</div>
          </div>
        </div>
      </div>

      <div class="report-section">
        <h3>二、弗兰德斯互动分析 (FIAS)</h3>
        <div class="report-metrics-grid">
          <div class="report-metric">
            <div class="value" style="color:#6366f1">${flanders.teacher}%</div>
            <div class="label">教师言语比率</div>
          </div>
          <div class="report-metric">
            <div class="value" style="color:#10b981">${flanders.student}%</div>
            <div class="label">学生言语比率</div>
          </div>
          <div class="report-metric">
            <div class="value" style="color:#94a3b8">${flanders.silence}%</div>
            <div class="label">沉默/混乱比率</div>
          </div>
        </div>
        <p>
          根据弗兰德斯互动分析系统，本堂课教师言语占比 ${flanders.teacher}%，学生言语占比 ${flanders.student}%。
          ${parseFloat(flanders.teacher) > 60
            ? '教师主导性较强，建议适当增加学生参与和表达的机会，促进学生主体性发挥。'
            : parseFloat(flanders.student) > 40
              ? '学生参与度较高，体现了以学生为中心的教学理念。'
              : '师生互动较为均衡，课堂教学结构合理。'}
        </p>
      </div>

      <div class="report-section">
        <h3>三、S-T 教学分析</h3>
        <div class="report-metrics-grid">
          <div class="report-metric">
            <div class="value">${stData.Rt}</div>
            <div class="label">Rt (教师行为占有率)</div>
          </div>
          <div class="report-metric">
            <div class="value">${stData.Ch}</div>
            <div class="label">Ch (行为转换率)</div>
          </div>
          <div class="report-metric">
            <div class="value" style="color:var(--primary)">${stData.mode}</div>
            <div class="label">教学模式</div>
          </div>
        </div>
        <p>
          S-T分析显示本堂课属于<strong>${stData.mode}</strong>模式。
          ${stData.mode === '讲授型'
            ? '课堂以教师讲授为主，建议在保持知识传递效率的同时，增加互动和探究环节。'
            : stData.mode === '练习型'
              ? '课堂以学生练习为主，建议加强讲解与练习的有机结合，提升学习效果。'
              : stData.mode === '对话型'
                ? '课堂师生互动频繁，教学行为转换率高，体现了良好的课堂对话氛围。'
                : '课堂呈现多种教学行为的混合模式，结构灵活多样。'}
        </p>
      </div>

      <div class="report-section">
        <h3>四、关键数据洞察</h3>
        ${insights.map(i => `
          <div class="report-insight ${i.type}">
            <h4>${i.title}</h4>
            <p>${i.content}</p>
          </div>
        `).join('')}
      </div>

      <div class="report-section">
        <h3>五、教学行为量化分析</h3>
        <div class="report-metrics-grid">
          <div class="report-metric">
            <div class="value">${questionCount}</div>
            <div class="label">教师提问次数</div>
          </div>
          <div class="report-metric">
            <div class="value">${feedbackCount}</div>
            <div class="label">教师反馈次数</div>
          </div>
          <div class="report-metric">
            <div class="value">${groupWorkCount}</div>
            <div class="label">小组合作次数</div>
          </div>
          <div class="report-metric">
            <div class="value">${formatSeconds(teacherDuration)}</div>
            <div class="label">教师行为总时长</div>
          </div>
          <div class="report-metric">
            <div class="value">${formatSeconds(studentDuration)}</div>
            <div class="label">学生行为总时长</div>
          </div>
          <div class="report-metric">
            <div class="value">${interactionTags.length}</div>
            <div class="label">互动事件数</div>
          </div>
        </div>
      </div>

      <div class="report-section">
        <h3>六、专业成长建议</h3>
        <ul class="suggestions-list">
          ${suggestions.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>

      <div class="report-section">
        <h3>七、反思总结</h3>
        <p>
          本报告基于弗兰德斯互动分析系统(FIAS)、S-T教学分析法等多维理论框架，
          对课堂实录进行了系统性的量化分析与质性解读。
          建议教师结合本报告的客观数据，对照自身的教学设计意图，深入反思教学行为背后的教育理念，
          在实践中持续优化课堂教学策略，实现专业成长的精准突破。
        </p>
        <p style="margin-top:12px;color:var(--text-muted);font-size:13px;">
          报告生成时间：${new Date().toLocaleString('zh-CN')}
        </p>
      </div>
    `;

    document.getElementById('reportContent').innerHTML = reportHTML;
    showToast('反思报告已生成', 'success');
  }

  generateInsights(tags, flanders, stData) {
    const insights = [];

    const teacherRatio = parseFloat(flanders.teacher);
    const studentRatio = parseFloat(flanders.student);
    const questionCount = tags.filter(t => t.type === 'teacher_question').length;
    const feedbackCount = tags.filter(t => t.type === 'teacher_feedback').length;
    const groupCount = tags.filter(t => t.type === 'group_work').length;

    // 教师言语占比洞察
    if (teacherRatio > 60) {
      insights.push({
        type: 'warning',
        title: '教师主导性偏强',
        content: `教师言语占比达到 ${teacherRatio}%，超出建议的合理范围（建议 < 60%）。过高的教师主导性可能压缩学生的思考和表达空间，建议设计更多以学生为中心的学习活动。`,
      });
    } else if (teacherRatio < 30) {
      insights.push({
        type: 'warning',
        title: '教师引导不足',
        content: `教师言语占比仅 ${teacherRatio}%，可能导致知识讲解不够充分。建议在确保学生主体性的同时，加强关键知识点的讲授和引导。`,
      });
    } else {
      insights.push({
        type: 'success',
        title: '师生言语比例合理',
        content: `教师言语占比 ${teacherRatio}%，学生言语占比 ${studentRatio}%，师生言语比例处于合理范围，体现了较好的课堂互动结构。`,
      });
    }

    // 提问与反馈
    if (questionCount < 5) {
      insights.push({
        type: 'warning',
        title: '课堂提问偏少',
        content: `整堂课仅检测到 ${questionCount} 次教师提问，提问是激发学生思维的重要手段。建议增加启发性、开放性问题，促进学生深度思考。`,
      });
    } else {
      insights.push({
        type: 'success',
        title: '课堂提问充分',
        content: `检测到 ${questionCount} 次教师提问和 ${feedbackCount} 次反馈，表明教师注重通过问答互动来推动教学进程。`,
      });
    }

    // 小组合作
    if (groupCount === 0) {
      insights.push({
        type: 'info',
        title: '缺少合作学习环节',
        content: '未检测到小组合作学习活动。合作学习能够培养学生的沟通协作能力，建议在适当环节融入小组讨论或合作探究活动。',
      });
    }

    // 行为转换
    const chVal = parseFloat(stData.Ch);
    if (chVal > 0.5) {
      insights.push({
        type: 'success',
        title: '教学行为转换灵活',
        content: `行为转换率 Ch = ${stData.Ch}，表明课堂中教学行为切换较为频繁，节奏感好，能够保持学生的注意力。`,
      });
    }

    return insights;
  }

  generateSuggestions(tags, flanders, stData, courseInfo) {
    const suggestions = [];
    const teacherRatio = parseFloat(flanders.teacher);
    const questionCount = tags.filter(t => t.type === 'teacher_question').length;

    if (teacherRatio > 60) {
      suggestions.push('减少教师单向讲授时间，将部分讲授内容转化为引导性问题和探究任务，提升学生参与度。');
    }

    suggestions.push('增加课堂提问的层次性，从记忆性问题逐步过渡到理解性、应用性和分析性问题，促进高阶思维发展。');

    if (questionCount < 8) {
      suggestions.push('采用"问题链"策略设计递进式问题，引导学生从浅层认知走向深层理解。');
    }

    suggestions.push('加强课堂反馈的针对性和发展性，不仅关注答案正确与否，更要关注学生的思维过程和进步空间。');

    const groupCount = tags.filter(t => t.type === 'group_work').length;
    if (groupCount === 0) {
      suggestions.push('在适当时机融入小组合作学习，通过同伴互助促进学生之间的知识共建和能力互补。');
    }

    suggestions.push('关注课堂沉默时间的教育价值，合理利用等待时间，给学生充分的思考和准备空间。');

    suggestions.push('定期使用本系统进行课堂实录分析，追踪个人教学行为的变化趋势，实现数据驱动的持续专业成长。');

    if (courseInfo.subject) {
      suggestions.push(`结合${courseInfo.subject}学科特点，设计更多体现学科核心素养的教学活动，使课堂教学与学科育人目标深度融合。`);
    }

    return suggestions;
  }

  exportReport() {
    const reportContent = document.getElementById('reportContent');
    if (reportContent.style.display === 'none') {
      showToast('请先生成报告', 'warning');
      return;
    }
    showToast('导出PDF功能需要集成PDF生成库，当前可使用"打印"功能保存为PDF', 'info');
    window.print();
  }

  printReport() {
    const reportContent = document.getElementById('reportContent');
    if (reportContent.style.display === 'none') {
      showToast('请先生成报告', 'warning');
      return;
    }
    window.print();
  }
}
