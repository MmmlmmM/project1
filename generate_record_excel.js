import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workbook = XLSX.utils.book_new();

const headers = [
  '课程编号',
  '课程名称',
  '课题名称',
  '指导日期\n（8位数字）',
  '指导时间起',
  '指导时间止',
  '学时',
  '指导形式',
  '指导地点',
  '指导内容摘要',
  '学生名单',
  '学生签字（至少3名）'
];

const data = [
  ['1801037', '项目实践', '', '', '', '', '', '', '', '', '', '']
];

const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);

worksheet['!cols'] = [
  { wpx: 80 },   // 课程编号
  { wpx: 100 },  // 课程名称
  { wpx: 120 },  // 课题名称
  { wpx: 100 },  // 指导日期
  { wpx: 80 },   // 指导时间起
  { wpx: 80 },   // 指导时间止
  { wpx: 60 },   // 学时
  { wpx: 90 },   // 指导形式
  { wpx: 100 },  // 指导地点
  { wpx: 200 },  // 指导内容摘要
  { wpx: 120 },  // 学生名单
  { wpx: 140 }   // 学生签字
];

worksheet['!rows'] = [{ hpx: 40 }];

const range = XLSX.utils.decode_range(worksheet['!ref']);
for (let R = range.s.r; R <= range.e.r; ++R) {
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
    const cell = worksheet[cellAddress];
    if (!cell) continue;
    cell.s = {
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      },
      alignment: {
        horizontal: 'center',
        vertical: 'center',
        wrapText: true
      },
      font: {
        name: '宋体',
        sz: 11
      }
    };
    if (R === 0) {
      cell.s.fill = {
        patternType: 'solid',
        fgColor: { rgb: 'D9E1F2' }
      };
      cell.s.font.bold = true;
    }
  }
}

XLSX.utils.book_append_sheet(workbook, worksheet, '项目实践指导记录');

const outputPath = path.join(__dirname, '项目实践指导记录表.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log('✅ Excel 已生成:', outputPath);
