const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const { execSync, spawnSync } = require('child_process');
const os   = require('os');
const path = require('path');
const fs = require('fs');

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AI Test Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Fix CSP — allow inline styles and all connections
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline'; connect-src *; font-src * data:;"
        ]
      }
    });
  });

  win.loadFile(path.join(__dirname, 'renderer/index.html'));
});

// Save generated files to disk
ipcMain.handle('save-output', async (_, { filename, content }) => {
  if (_dialogOpen) return { success: false };
  _dialogOpen = true;
  try {
  const { filePath } = await dialog.showSaveDialog(win, {
    defaultPath: filename,
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });
  if (filePath) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, path: filePath };
  }
  return { success: false };
  } finally {
    _dialogOpen = false;
  }
});

// ── Pick a folder ────────────────────────────────────────────
let _dialogOpen = false;

ipcMain.handle('pick-folder', async () => {
  if (_dialogOpen) return null;
  _dialogOpen = true;
  try {
    const { filePaths } = await dialog.showOpenDialog(win, {
      title:      'Choose folder to save Cypress framework',
      properties: ['openDirectory', 'createDirectory']
    });
    return filePaths?.[0] ?? null;
  } finally {
    _dialogOpen = false;
  }
});

// ── Write multiple files into that folder ────────────────────
ipcMain.handle('write-files', async (_, { folderPath, allFiles }) => {
  let count = 0;
  for (const file of allFiles) {
    try {
      const fullPath = path.join(folderPath, file.name);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, 'utf8');
      console.log('✓ Written:', fullPath);
      count++;
    } catch (err) {
      console.error('✗ Failed:', file.name, err.message);
    }
  }
  return { success: true, count };
});

ipcMain.handle('extract-file-text', async (_, { name, ext, data }) => {
  const buffer = Buffer.from(data);
  const os   = require('os');
  const path = require('path');
  const fs   = require('fs');

  // Write buffer to temp file
  const tmpPath = path.join(os.tmpdir(), name);
  fs.writeFileSync(tmpPath, buffer);

  if (ext === 'pdf') {
    try {
      // Use pdftotext if available (install poppler-utils)
      const { execSync } = require('child_process');
      const text = execSync(`pdftotext "${tmpPath}" -`).toString();
      fs.unlinkSync(tmpPath);
      return text;
    } catch {
      // Fallback: return placeholder
      fs.unlinkSync(tmpPath);
      return fs.readFileSync(tmpPath, 'utf8').replace(/[^\x20-\x7E\n]/g,' ');
    }
  }

  if (ext === 'docx' || ext === 'doc') {
    try {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ path: tmpPath });
      fs.unlinkSync(tmpPath);
      return result.value;
    } catch {
      fs.unlinkSync(tmpPath);
      return 'Could not extract DOCX text — paste requirements manually';
    }
  }

  // Plain text fallback
  return buffer.toString('utf8');
});

// ── Pick a folder to save/load session ──────────────────────
ipcMain.handle('pick-session-folder', async () => {
  if (_dialogOpen) return null;
  _dialogOpen = true;
  try {
    const { filePaths } = await dialog.showOpenDialog(win, {
      title:      'Choose folder to save / load session',
      properties: ['openDirectory', 'createDirectory']
    });
    return filePaths?.[0] ?? null;
  } finally {
    _dialogOpen = false;
  }
});

// ── Save session JSON to folder ──────────────────────────────
ipcMain.handle('save-session', async (_, { folderPath, session }) => {
  try {
    const filePath = path.join(folderPath, 'agent-session.json');
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Load session JSON from folder ────────────────────────────
ipcMain.handle('load-session', async (_, { folderPath }) => {
  try {
    const filePath = path.join(folderPath, 'agent-session.json');
    if (!fs.existsSync(filePath)) return { success: false, error: 'No session file found' };
    const raw     = fs.readFileSync(filePath, 'utf8');
    const session = JSON.parse(raw);
    return { success: true, session };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── List available sessions (show date saved) ────────────────
ipcMain.handle('check-session', async (_, { folderPath }) => {
  try {
    const filePath = path.join(folderPath, 'agent-session.json');
    if (!fs.existsSync(filePath)) return { exists: false };
    const stat = fs.statSync(filePath);
    const raw  = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      exists:    true,
      savedAt:   stat.mtime.toISOString(),
      modules:   data.modules ?? [],
      baseUrl:   data.baseUrl ?? ''
    };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle('generate-excel', async (_, { rows }) => {
  if (_dialogOpen) return { success: false, error: 'Dialog already open' };
  _dialogOpen = true;
  try {
    const { filePath } = await dialog.showSaveDialog(win, {
      title:       'Save Test Cases Excel',
      defaultPath: 'test-cases.xlsx',
      filters:     [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (!filePath) return { success: false };

    const ExcelJS = require('exceljs');
    const wb      = new ExcelJS.Workbook();

    wb.creator  = 'AI Test Agent';
    wb.created  = new Date();

    // ── Colours ──────────────────────────────────────────────────────────
    const CLR = {
      headerBg:  '1A1F36',
      headerFg:  'FFFFFF',
      accentBg:  '2E86AB',
      uiBg:      'E8F4FD',
      apiBg:     'EDF7ED',
      altBg:     'F8F9FA',
      whiteBg:   'FFFFFF',
      highFg:    'C0392B',
      medFg:     'E67E22',
      lowFg:     '27AE60',
      border:    'D0D7E0',
    };

    const borderStyle = {
      top:    { style: 'thin', color: { argb: CLR.border } },
      left:   { style: 'thin', color: { argb: CLR.border } },
      bottom: { style: 'thin', color: { argb: CLR.border } },
      right:  { style: 'thin', color: { argb: CLR.border } },
    };

    const headerBorderStyle = {
      top:    { style: 'medium', color: { argb: 'FFFFFF' } },
      left:   { style: 'thin',   color: { argb: 'FFFFFF' } },
      bottom: { style: 'medium', color: { argb: 'FFFFFF' } },
      right:  { style: 'thin',   color: { argb: 'FFFFFF' } },
    };

    // ── Column definitions ────────────────────────────────────────────────
    const COLS = [
      { key: 'ID',              header: 'ID',              width: 12  },
      { key: 'Type',            header: 'Type',            width: 10  },
      { key: 'Title',           header: 'Title',           width: 42  },
      { key: 'Preconditions',   header: 'Preconditions',   width: 38  },
      { key: 'Steps',           header: 'Steps',           width: 55  },
      { key: 'Expected Result', header: 'Expected Result', width: 46  },
      { key: 'Priority',        header: 'Priority',        width: 13  },
    ];

    // ════════════════════════════════════════════════════════════════════
    //  SHEET 1 — All Test Cases
    // ════════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('Test Cases', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    ws1.properties.tabColor = { argb: CLR.accentBg };

    ws1.columns = COLS.map(c => ({ key: c.key, width: c.width }));

    // Header row
    const headerRow = ws1.addRow(COLS.map(c => c.header));
    headerRow.height = 32;
    headerRow.eachCell(cell => {
      cell.font      = { name: 'Arial', bold: true, color: { argb: CLR.headerFg }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.headerBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
      cell.border    = headerBorderStyle;
    });

    // Auto filter
    ws1.autoFilter = { from: 'A1', to: 'G1' };

    // Counters for summary
    let uiCnt=0, apiCnt=0, highCnt=0, medCnt=0, lowCnt=0;

    // Data rows
    rows.forEach((tc, i) => {
      const tcType  = (tc['Type']     || 'UI').trim().toUpperCase();
      const priority = (tc['Priority'] || 'Medium').trim();

      if (tcType === 'API') apiCnt++; else uiCnt++;
      if (priority === 'High') highCnt++;
      else if (priority === 'Medium') medCnt++;
      else lowCnt++;

      // Steps: replace " | " with newline
      const stepsFormatted = (tc['Steps'] || '').replace(/ \| /g, '\n');
      const stepCount = (tc['Steps'] || '').split(' | ').length;

      const rowData = [
        tc['ID']             || '',
        tcType,
        tc['Title']          || '',
        tc['Preconditions']  || '',
        stepsFormatted,
        tc['Expected Result'] || '',
        priority
      ];

      const dataRow = ws1.addRow(rowData);

      // Row height based on steps
      const titleLines  = Math.ceil((tc['Title'] || '').length / 40);
      const expectLines = Math.ceil((tc['Expected Result'] || '').length / 44);
      dataRow.height = Math.max(stepCount, titleLines, expectLines) * 16 + 8;

      // Row background
      const isAlt  = i % 2 === 0;
      const rowBg  = tcType === 'API' ? CLR.apiBg : (isAlt ? CLR.uiBg : CLR.altBg);

      dataRow.eachCell((cell, colNumber) => {
        const key = COLS[colNumber - 1]?.key || '';

        // Base
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = borderStyle;
        cell.font   = { name: 'Arial', size: 10 };
        cell.alignment = {
          horizontal : ['ID','Type','Priority'].includes(key) ? 'center' : 'left',
          vertical   : 'top',
          wrapText   : ['Title','Preconditions','Steps','Expected Result'].includes(key)
        };

        // Per-column styling
        if (key === 'ID') {
          cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: CLR.accentBg } };
        } else if (key === 'Type') {
          const col = tcType === 'UI' ? CLR.accentBg : CLR.lowFg;
          cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: col } };
        } else if (key === 'Title') {
          cell.font = { name: 'Arial', bold: true, size: 10 };
        } else if (key === 'Priority') {
          const pc = priority === 'High' ? CLR.highFg : (priority === 'Medium' ? CLR.medFg : CLR.lowFg);
          cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: pc } };
        }
      });
    });

    // Totals bar
    const totalRow = ws1.addRow([
      `Total: ${rows.length}`,
      `UI: ${uiCnt} | API: ${apiCnt}`,
      '', '', '',
      `High: ${highCnt}  Med: ${medCnt}  Low: ${lowCnt}`,
      ''
    ]);
    totalRow.height = 24;
    totalRow.eachCell(cell => {
      cell.font      = { name: 'Arial', bold: true, size: 10, color: { argb: CLR.headerFg } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.headerBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = headerBorderStyle;
    });

    // ════════════════════════════════════════════════════════════════════
    //  SHEET 2 — Summary Dashboard
    // ════════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('Summary', {
      views: [{ showGridLines: false }]
    });
    ws2.properties.tabColor = { argb: CLR.headerBg };
    ws2.columns = [
      { width: 26 }, { width: 14 }, { width: 34 }, { width: 10 }
    ];

    // Title
    ws2.mergeCells('A1:D1');
    const titleCell = ws2.getCell('A1');
    titleCell.value     = 'TEST CASES — SUMMARY DASHBOARD';
    titleCell.font      = { name: 'Arial', bold: true, size: 15, color: { argb: 'FFFFFF' } };
    titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.headerBg } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 44;

    ws2.mergeCells('A2:D2');
    const subTitle = ws2.getCell('A2');
    subTitle.value     = `AI Test Agent  •  ${rows.length} test cases generated`;
    subTitle.font      = { name: 'Arial', italic: true, size: 10, color: { argb: '888888' } };
    subTitle.alignment = { horizontal: 'center' };
    ws2.getRow(2).height = 20;

    const addSection = (startRow, title, items) => {
      ws2.mergeCells(`A${startRow}:D${startRow}`);
      const sh = ws2.getCell(`A${startRow}`);
      sh.value     = title;
      sh.font      = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFF' } };
      sh.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.accentBg } };
      sh.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      ws2.getRow(startRow).height = 26;

      items.forEach(([label, value, color], idx) => {
        const r = startRow + 1 + idx;
        ws2.getRow(r).height = 26;

        const lbl = ws2.getCell(`A${r}`);
        lbl.value     = label;
        lbl.font      = { name: 'Arial', bold: true, size: 10 };
        lbl.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F4F8' } };
        lbl.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        lbl.border    = borderStyle;

        const val = ws2.getCell(`B${r}`);
        val.value     = value;
        val.font      = { name: 'Arial', bold: true, size: 14, color: { argb: color } };
        val.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } };
        val.alignment = { horizontal: 'center', vertical: 'middle' };
        val.border    = borderStyle;

        ws2.mergeCells(`C${r}:D${r}`);
        const pct   = rows.length ? value / rows.length : 0;
        const filled = Math.round(pct * 12);
        const bar    = ws2.getCell(`C${r}`);
        bar.value     = '█'.repeat(filled) + '░'.repeat(12 - filled) + `  ${(pct*100).toFixed(1)}%`;
        bar.font      = { name: 'Consolas', size: 11, color: { argb: color } };
        bar.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FAFAFA' } };
        bar.alignment = { horizontal: 'left', vertical: 'middle' };
        bar.border    = borderStyle;
      });

      return startRow + 1 + items.length + 1;
    };

    let nextRow = 4;
    nextRow = addSection(nextRow, 'BY TEST TYPE', [
      ['UI Tests',  uiCnt,  CLR.accentBg],
      ['API Tests', apiCnt, CLR.lowFg],
    ]);
    nextRow = addSection(nextRow, 'BY PRIORITY', [
      ['High',   highCnt, CLR.highFg],
      ['Medium', medCnt,  CLR.medFg],
      ['Low',    lowCnt,  CLR.lowFg],
    ]);
    nextRow = addSection(nextRow, 'TOTALS', [
      ['Total Test Cases', rows.length, CLR.accentBg],
    ]);

    // ════════════════════════════════════════════════════════════════════
    //  SHEET 3 — High Priority
    // ════════════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet('High Priority', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    ws3.properties.tabColor = { argb: CLR.highFg };
    ws3.columns = COLS.map(c => ({ key: c.key, width: c.width }));

    const hpHeaderRow = ws3.addRow(COLS.map(c => c.header));
    hpHeaderRow.height = 30;
    hpHeaderRow.eachCell(cell => {
      cell.font      = { name: 'Arial', bold: true, color: { argb: 'FFFFFF' }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLR.highFg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { ...borderStyle, top: { style:'medium', color:{ argb:'FFFFFF' } }, bottom: { style:'medium', color:{ argb:'FFFFFF' } } };
    });

    ws3.autoFilter = { from: 'A1', to: 'G1' };

    const highRows = rows.filter(r => (r['Priority'] || '').trim() === 'High');
    highRows.forEach((tc, i) => {
      const stepsFormatted = (tc['Steps'] || '').replace(/ \| /g, '\n');
      const stepCount      = (tc['Steps'] || '').split(' | ').length;
      const dataRow        = ws3.addRow([
        tc['ID'] || '', tc['Type'] || '',
        tc['Title'] || '', tc['Preconditions'] || '',
        stepsFormatted, tc['Expected Result'] || '', 'High'
      ]);
      dataRow.height = Math.max(stepCount * 16 + 8, 22);

      const bg = i % 2 === 0 ? 'FFF5F5' : 'FFFFFF';
      dataRow.eachCell((cell, colNumber) => {
        const key = COLS[colNumber - 1]?.key || '';
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = borderStyle;
        cell.font   = { name: 'Arial', size: 10, bold: ['ID','Title','Priority'].includes(key) };
        cell.alignment = {
          horizontal : ['ID','Type','Priority'].includes(key) ? 'center' : 'left',
          vertical   : 'top',
          wrapText   : ['Title','Preconditions','Steps','Expected Result'].includes(key)
        };
        if (key === 'Priority') {
          cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: CLR.highFg } };
        }
      });
    });

    // ── Write file ────────────────────────────────────────────────────────
    await wb.xlsx.writeFile(filePath);
    console.log(`✓ Excel saved: ${filePath}`);
    return { success: true, path: filePath };

  } catch (err) {
    console.error('Excel generation error:', err);
    return { success: false, error: err.message };
  } finally {
    _dialogOpen = false;
  }
});

function generateExcelPython(rows, outputPath) {
  // Serialise rows as Python literal
  const pyRows = JSON.stringify(rows);

  return `
import json, sys
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openpyxl', '-q'])
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

rows = json.loads(${"`"}${pyRows}${"`"})
output_path = r"${outputPath.replace(/\\/g, '\\\\')}"

CLR_HEADER   = "1A1F36"
CLR_ACCENT   = "2E86AB"
CLR_UI_BG    = "E8F4FD"
CLR_API_BG   = "EDF7ED"
CLR_ALT      = "F8F9FA"
CLR_HIGH     = "C0392B"
CLR_MED      = "E67E22"
CLR_LOW      = "27AE60"
CLR_BORDER   = "D0D7E0"

def border(c=CLR_BORDER):
    s = Side(border_style="thin", color=c)
    return Border(left=s, right=s, top=s, bottom=s)

def hborder():
    t = Side(border_style="medium", color="FFFFFF")
    n = Side(border_style="thin",   color="FFFFFF")
    return Border(left=n, right=n, top=t, bottom=t)

wb = Workbook()

# ── Sheet 1: Test Cases ──────────────────────────────────────────────────
ws = wb.active
ws.title = "Test Cases"

COLS = [
    ("ID",              12,  False),
    ("Type",            10,  False),
    ("Title",           40,  True),
    ("Preconditions",   35,  True),
    ("Steps",           55,  True),
    ("Expected Result", 45,  True),
    ("Priority",        12,  False),
]
FIELDS = [c[0] for c in COLS]

hfill  = PatternFill("solid", fgColor=CLR_HEADER)
hfont  = Font(name="Arial", bold=True, color="FFFFFF", size=11)
halign = Alignment(horizontal="center", vertical="center")

for ci, (name, width, wrap) in enumerate(COLS, 1):
    cell = ws.cell(row=1, column=ci, value=name)
    cell.font = hfont; cell.fill = hfill
    cell.alignment = halign; cell.border = hborder()
    ws.column_dimensions[get_column_letter(ci)].width = width
ws.row_dimensions[1].height = 32

total = len(rows)
ui_cnt = api_cnt = high = med = low = 0

for ri, tc in enumerate(rows, 2):
    ttype = tc.get("Type","UI").strip().upper()
    prio  = tc.get("Priority","Medium").strip()
    if ttype == "API": api_cnt += 1
    else: ui_cnt += 1
    if prio == "High": high += 1
    elif prio == "Medium": med += 1
    else: low += 1

    bg = CLR_API_BG if ttype == "API" else (CLR_UI_BG if ri%2==0 else CLR_ALT)
    rfill = PatternFill("solid", fgColor=bg)

    for ci, field in enumerate(FIELDS, 1):
        val = tc.get(field,"").strip()
        if field == "Steps": val = val.replace(" | ", "\\n")
        cell = ws.cell(row=ri, column=ci, value=val)
        cell.fill = rfill; cell.border = border()
        _, _, wrap = COLS[ci-1]
        cell.font = Font(name="Arial", size=10)
        cell.alignment = Alignment(
            horizontal="center" if field in ("ID","Type","Priority") else "left",
            vertical="top", wrap_text=wrap
        )
        if field == "ID":
            cell.font = Font(name="Arial", bold=True, size=10, color=CLR_ACCENT)
        elif field == "Type":
            col = CLR_ACCENT if ttype=="UI" else CLR_LOW
            cell.font = Font(name="Arial", bold=True, size=10, color=col)
        elif field == "Title":
            cell.font = Font(name="Arial", bold=True, size=10)
        elif field == "Priority":
            pc = CLR_HIGH if prio=="High" else (CLR_MED if prio=="Medium" else CLR_LOW)
            cell.font = Font(name="Arial", bold=True, size=10, color=pc)

    steps = tc.get("Steps","")
    sc = steps.count(" | ") + 1 if steps else 1
    lt = max(1, len(tc.get("Title","")) // 38)
    le = max(1, len(tc.get("Expected Result","")) // 43)
    ws.row_dimensions[ri].height = max(max(sc,lt,le)*16+6, 22)

ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:{get_column_letter(len(COLS))}1"
ws.sheet_properties.tabColor = CLR_ACCENT

# ── Sheet 2: Summary ─────────────────────────────────────────────────────
ws2 = wb.create_sheet("Summary")
ws2.sheet_view.showGridLines = False

ws2.merge_cells("A1:D1")
t = ws2["A1"]
t.value = "TEST CASES — SUMMARY DASHBOARD"
t.font  = Font(name="Arial", bold=True, size=14, color="FFFFFF")
t.fill  = PatternFill("solid", fgColor=CLR_HEADER)
t.alignment = Alignment(horizontal="center", vertical="center")
ws2.row_dimensions[1].height = 40

ws2.merge_cells("A2:D2")
ws2["A2"].value = f"AI Test Agent  •  Total: {total} test cases"
ws2["A2"].font  = Font(name="Arial", italic=True, size=10, color="888888")
ws2["A2"].alignment = Alignment(horizontal="center")
ws2.row_dimensions[2].height = 20

def section(ws, sr, title, items, total):
    ws.merge_cells(f"A{sr}:D{sr}")
    h = ws[f"A{sr}"]
    h.value = title
    h.font  = Font(name="Arial", bold=True, size=11, color="FFFFFF")
    h.fill  = PatternFill("solid", fgColor=CLR_ACCENT)
    h.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[sr].height = 26
    for i,(lbl,val,col) in enumerate(items):
        r = sr+1+i
        lb = ws.cell(row=r,column=1,value=lbl)
        lb.font=Font(name="Arial",bold=True,size=10)
        lb.fill=PatternFill("solid",fgColor="F0F4F8")
        lb.alignment=Alignment(horizontal="left",vertical="center",indent=1)
        lb.border=border()
        vl = ws.cell(row=r,column=2,value=val)
        vl.font=Font(name="Arial",bold=True,size=13,color=col)
        vl.fill=PatternFill("solid",fgColor="FFFFFF")
        vl.alignment=Alignment(horizontal="center",vertical="center")
        vl.border=border()
        pct = int(val/total*10) if total else 0
        bar = ws.cell(row=r,column=3,value="█"*pct+"░"*(10-pct)+f"  {val/total*100:.1f}%" if total else "")
        bar.font=Font(name="Consolas",size=10,color=col)
        bar.alignment=Alignment(horizontal="left",vertical="center")
        bar.fill=PatternFill("solid",fgColor="FAFAFA")
        ws.merge_cells(f"C{r}:D{r}")
        bar.border=border()
        ws.row_dimensions[r].height=24
    return sr+1+len(items)+1

r = 4
r = section(ws2, r, "BY TEST TYPE",  [("UI Tests",ui_cnt,CLR_ACCENT),("API Tests",api_cnt,CLR_LOW)], total)
r = section(ws2, r, "BY PRIORITY",   [("High",high,CLR_HIGH),("Medium",med,CLR_MED),("Low",low,CLR_LOW)], total)
r = section(ws2, r, "TOTALS",        [("Total Test Cases",total,CLR_ACCENT)], total)

ws2.column_dimensions["A"].width=24
ws2.column_dimensions["B"].width=14
ws2.column_dimensions["C"].width=32
ws2.column_dimensions["D"].width=10
ws2.sheet_properties.tabColor = CLR_HEADER

# ── Sheet 3: High Priority ────────────────────────────────────────────────
ws3 = wb.create_sheet("High Priority")
for ci,(name,width,wrap) in enumerate(COLS,1):
    cell=ws3.cell(row=1,column=ci,value=name)
    cell.font=Font(name="Arial",bold=True,color="FFFFFF",size=11)
    cell.fill=PatternFill("solid",fgColor=CLR_HIGH)
    cell.alignment=Alignment(horizontal="center",vertical="center")
    cell.border=border("FFFFFF")
    ws3.column_dimensions[get_column_letter(ci)].width=width
ws3.row_dimensions[1].height=30
ws3.freeze_panes="A2"

hp_rows=[r for r in rows if r.get("Priority","").strip()=="High"]
for ri,tc in enumerate(hp_rows,2):
    bg="FFF5F5" if ri%2==0 else "FFFFFF"
    rf=PatternFill("solid",fgColor=bg)
    for ci,field in enumerate(FIELDS,1):
        val=tc.get(field,"").strip()
        if field=="Steps": val=val.replace(" | ","\\n")
        cell=ws3.cell(row=ri,column=ci,value=val)
        cell.fill=rf; cell.border=border()
        _,_,wrap=COLS[ci-1]
        cell.font=Font(name="Arial",size=10,bold=(field in ("ID","Title","Priority")))
        cell.alignment=Alignment(
            horizontal="center" if field in ("ID","Type","Priority") else "left",
            vertical="top",wrap_text=wrap)
        if field=="Priority":
            cell.font=Font(name="Arial",bold=True,size=10,color=CLR_HIGH)
    sc=tc.get("Steps","").count(" | ")+1 if tc.get("Steps") else 1
    ws3.row_dimensions[ri].height=max(sc*16+6,22)

ws3.auto_filter.ref=f"A1:{get_column_letter(len(COLS))}1"
ws3.sheet_properties.tabColor=CLR_HIGH

wb.save(output_path)
print(f"Saved {total} test cases to {output_path}")
`;
}

// Proxy Claude API calls (keeps key off renderer)
ipcMain.handle('claude-call', async (_, { apiKey, system, user, provider, model }) => {
  if (provider === 'openai') {
    return callOpenAIMain(apiKey, system, user, model);
  }
  return callAnthropicMain(apiKey, system, user, model);
});

/* ── Anthropic call (main process) ───────────────────────── */
function callAnthropicMain(apiKey, system, user, model) {
  return new Promise((resolve, reject) => {
    const { net } = require('electron');
    const request = net.request({
      method: 'POST',
      url:    'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    let body = '';
    request.on('response', res => {
      res.on('data',  chunk => { body += chunk.toString(); });
      res.on('end',   () => {
        try {
          const data = JSON.parse(body);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data.content.map(b => b.text || '').join(''));
        } catch (e) { reject(e); }
      });
    });
    request.on('error', reject);

    request.write(JSON.stringify({
      model:      model || 'claude-sonnet-4-6',
      max_tokens: 8000,
      system,
      messages:   [{ role: 'user', content: user }]
    }));
    request.end();
  });
}

/* ── OpenAI call (main process) ──────────────────────────── */
function callOpenAIMain(apiKey, system, user, model) {
  return new Promise((resolve, reject) => {
    const { net } = require('electron');
    const request = net.request({
      method: 'POST',
      url:    'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    let body = '';
    request.on('response', res => {
      res.on('data',  chunk => { body += chunk.toString(); });
      res.on('end',   () => {
        try {
          const data = JSON.parse(body);
          if (data.error) reject(new Error(data.error.message));
          else {
            const text = data.choices?.[0]?.message?.content;
            if (!text) reject(new Error('Empty response from OpenAI'));
            else resolve(text);
          }
        } catch (e) { reject(e); }
      });
    });
    request.on('error', reject);

    request.write(JSON.stringify({
      model:      model || 'gpt-4o',
      max_tokens: 8000,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   }
      ]
    }));
    request.end();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});