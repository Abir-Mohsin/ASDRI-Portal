import * as XLSX from 'xlsx';
import { DailyAttendanceRecord, TaskItem, LeaveApplication, Employee, RawPunchEvent } from './types';

export function exportAttendanceToExcel(
  records: DailyAttendanceRecord[],
  employees: Employee[],
  monthStr: string = 'Current Month'
) {
  const data = records.map((r, idx) => {
    const emp = employees.find((e) => e.id === r.employeeId);
    return {
      'SL': idx + 1,
      'Employee ID': r.employeeId,
      'Full Name': r.employeeName,
      'Designation': emp?.designation || 'Staff',
      'Department': r.department,
      'Date': r.date,
      'In Time': r.firstInTime || '--:--',
      'Out Time': r.lastOutTime || '--:--',
      'Work Duration (Mins)': r.totalWorkingDurationMinutes,
      'Late (Mins)': r.lateDurationMinutes,
      'Status': r.status,
      'Remarks': r.remarks || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Records');

  XLSX.writeFile(workbook, `ASDRI_Attendance_Report_${monthStr.replace(/\s+/g, '_')}.xlsx`);
}

export function exportAttendanceToCSV(records: DailyAttendanceRecord[], monthStr: string = 'Current Month') {
  const headers = ['SL', 'Employee ID', 'Name', 'Department', 'Date', 'First IN', 'Last OUT', 'Duration (Min)', 'Late (Min)', 'Status', 'Remarks'];
  const rows = records.map((r, i) => [
    i + 1,
    `"${r.employeeId}"`,
    `"${r.employeeName}"`,
    `"${r.department}"`,
    `"${r.date}"`,
    `"${r.firstInTime || '--'}"`,
    `"${r.lastOutTime || '--'}"`,
    r.totalWorkingDurationMinutes,
    r.lateDurationMinutes,
    `"${r.status}"`,
    `"${r.remarks || ''}"`,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `ASDRI_Attendance_${monthStr.replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportTasksToExcel(tasks: TaskItem[], title: string = 'Tasks_Report') {
  const data = tasks.map((t, idx) => ({
    'SL': idx + 1,
    'Task ID': t.id,
    'Title': t.title,
    'Category': t.category,
    'Department': t.department,
    'Assignee': t.assignedPersonName,
    'Supervisor': t.supervisorName,
    'Priority': t.priority,
    'Deadline': t.deadline,
    'Progress %': `${t.progressPercentage}%`,
    'Status': t.status,
    'Related Meeting': t.relatedMeetingId || '--',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tasks');
  XLSX.writeFile(workbook, `ASDRI_${title}.xlsx`);
}

export function exportLeavesToExcel(leaves: LeaveApplication[]) {
  const data = leaves.map((l, idx) => ({
    'SL': idx + 1,
    'Application ID': l.id,
    'Employee ID': l.employeeId,
    'Applicant Name': l.employeeName,
    'Department': l.department,
    'Leave Type': l.leaveType,
    'Start Date': l.startDate,
    'End Date': l.endDate,
    'Total Days': l.totalDays,
    'Reason': l.reason,
    'Status': l.status,
    'Department Head': l.deptHeadRecommendation || 'Pending',
    'Applied Date': l.appliedDate,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Leave Applications');
  XLSX.writeFile(workbook, `ASDRI_Leave_Applications.xlsx`);
}

export function exportRawPunchesToCSV(punches: RawPunchEvent[]) {
  const headers = ['Event ID', 'Machine ID', 'Employee ID', 'Biometric Machine ID', 'Punch Date', 'Punch Time', 'Type', 'Verification Method', 'Sync Status'];
  const rows = punches.map((p) => [
    `"${p.id}"`,
    `"${p.machineId}"`,
    `"${p.employeeId}"`,
    `"${p.attendanceMachineId}"`,
    `"${p.punchDate}"`,
    `"${p.punchTime}"`,
    `"${p.punchType}"`,
    `"${p.verificationType}"`,
    `"${p.syncStatus}"`,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `ASDRI_Raw_Machine_Punches.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
