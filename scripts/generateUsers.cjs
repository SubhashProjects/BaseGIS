const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '002_powergis_organisation_seed.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const lines = sql.split(/\r?\n/).filter((l) => l.startsWith('insert into public.organization_users'));

function parseSqlValues(line) {
  const openIdx = line.indexOf('values (');
  if (openIdx === -1) return null;
  const inner = line.slice(openIdx + 8, line.lastIndexOf(');'));
  const tokens = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "'" && inner[i - 1] !== '\\') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      tokens.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  tokens.push(cur.trim());

  const clean = (val) => {
    if (!val || val === 'NULL') return null;
    return val.replace(/^'|'$/g, '').replace(/''/g, "'");
  };

  // Column mapping from INSERT statement:
  // (id, username, display_name, role, subdivision, division, circle, department, admin_name, region, scope_field, scope_value, source_rows, jurisdiction_ids)
  const id = clean(tokens[0]);
  let username = clean(tokens[1]);
  let displayName = clean(tokens[2]);
  const role = clean(tokens[3]);
  const subdivision = clean(tokens[4]);
  const division = clean(tokens[5]);
  const circle = clean(tokens[6]);
  const department = clean(tokens[7]);
  const admin = clean(tokens[8]);
  const region = clean(tokens[9]) || 'Pondicherry';
  const scopeField = clean(tokens[10]);
  const scopeValue = clean(tokens[11]);
  const rawJurs = tokens[13] || '';
  const jurisdictions = rawJurs
    .replace(/['"{}()]/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (username === 'SE - 1 HOD' || displayName === 'SE - 1 HOD') {
    username = 'SE - 1 cum HOD';
    displayName = 'SE - 1 cum HOD';
  }

  return {
    id,
    username,
    displayName,
    role,
    subdivision,
    division,
    circle,
    department,
    admin,
    region,
    scopeField,
    scopeValue,
    jurisdictions: jurisdictions.length > 0 ? jurisdictions : ['PONDICHERRY'],
  };
}

const users = lines.map(parseSqlValues).filter(Boolean);

// Ensure SE - 1 cum HOD is present
if (!users.some((u) => u.username === 'SE - 1 cum HOD' || u.id === 'org-se-000')) {
  users.unshift({
    id: 'org-se-000',
    username: 'SE - 1 cum HOD',
    displayName: 'SE - 1 cum HOD',
    role: 'SE',
    subdivision: null,
    division: null,
    circle: null,
    department: 'SE - 1 cum HOD',
    admin: 'GIS Admin',
    region: 'All Regions',
    scopeField: 'department',
    scopeValue: 'SE - 1 cum HOD',
    jurisdictions: ['PONDICHERRY', 'KARAIKAL', 'MAHE', 'YANAM'],
  });
}

// Add a test Contractor profile
if (!users.some((u) => u.role === 'CONTRACTOR')) {
  users.push({
    id: 'org-contractor-001',
    username: 'Contractor-Pondy',
    displayName: 'Contractor - Pondy Power Works',
    role: 'CONTRACTOR',
    subdivision: 'AEE- Town I',
    division: 'EE - Urban',
    circle: 'SE - 3 O&M',
    department: 'SE - 1 cum HOD',
    admin: 'GIS Admin',
    region: 'Pondicherry',
    scopeField: 'division',
    scopeValue: 'EE - Urban',
    jurisdictions: ['PONDICHERRY'],
  });
}

console.log(`Successfully parsed ${users.length} users from SQL seed.`);

// 1. Write src/services/defaultUsers.ts
const tsContent = `// Auto-generated PowerGIS Organization Users Hierarchy Seed
import type { PowerGISUser } from './powergisData';

export const DEFAULT_ORGANIZATION_USERS: PowerGISUser[] = ${JSON.stringify(users, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'services', 'defaultUsers.ts'), tsContent, 'utf8');
console.log('Wrote src/services/defaultUsers.ts');

// 2. Generate CSV for Excel
const csvHeaders = [
  'User ID',
  'Username',
  'Officer Display Name',
  'Designation Role',
  'Department',
  'Circle',
  'Division',
  'Sub Division',
  'Region',
  'Scope Field',
  'Scope Value',
  'Reporting Admin',
  'Authorized Jurisdictions',
  'Hierarchy Level',
];

const escapeCsv = (str) => {
  if (str === null || str === undefined) return '';
  const s = String(str);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const getHierarchyLevel = (role) => {
  switch (role) {
    case 'GIS_ADMIN':
      return 'System Administrator (Level 0)';
    case 'SE':
      return 'Level 1 - Superintending Engineer / HOD';
    case 'EE':
      return 'Level 2 - Executive Engineer';
    case 'AEE':
      return 'Level 3 - Assistant Executive Engineer';
    case 'AE':
      return 'Level 4 - Assistant Engineer';
    case 'JE':
      return 'Level 5 - Junior Engineer (Field / Jurisdictional)';
    case 'CONTRACTOR':
      return 'Level 6 - External Contractor / Field Surveyor';
    default:
      return 'Staff';
  }
};

const csvRows = [
  csvHeaders.join(','),
  ...users.map((u) =>
    [
      escapeCsv(u.id),
      escapeCsv(u.username),
      escapeCsv(u.displayName),
      escapeCsv(u.role),
      escapeCsv(u.department || '—'),
      escapeCsv(u.circle || '—'),
      escapeCsv(u.division || '—'),
      escapeCsv(u.subdivision || '—'),
      escapeCsv(u.region),
      escapeCsv(u.scopeField || 'All'),
      escapeCsv(u.scopeValue || 'All'),
      escapeCsv(u.admin || 'GIS Admin'),
      escapeCsv((u.jurisdictions || []).join('; ')),
      escapeCsv(getHierarchyLevel(u.role)),
    ].join(',')
  ),
];

// UTF-8 BOM so Excel opens properly with all characters
const csvContent = '\uFEFF' + csvRows.join('\r\n');

// Ensure public/templates directory exists
const publicTemplatesDir = path.join(__dirname, '..', 'public', 'templates');
if (!fs.existsSync(publicTemplatesDir)) {
  fs.mkdirSync(publicTemplatesDir, { recursive: true });
}

fs.writeFileSync(path.join(publicTemplatesDir, 'PowerGIS_Users_Hierarchy_and_Roles.csv'), csvContent, 'utf8');
console.log('Wrote public/templates/PowerGIS_Users_Hierarchy_and_Roles.csv');

// Also write an Excel XML spreadsheet format (.xls) which Excel opens with colored headers & auto-fit columns
const excelXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
   </Borders>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataRow">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="RoleBadge">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#1E3A8A"/>
   <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Users &amp; Roles Hierarchy">
  <Table ss:DefaultRowHeight="22">
   <Column ss:Width="110"/>
   <Column ss:Width="150"/>
   <Column ss:Width="170"/>
   <Column ss:Width="90"/>
   <Column ss:Width="130"/>
   <Column ss:Width="120"/>
   <Column ss:Width="130"/>
   <Column ss:Width="130"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="130"/>
   <Column ss:Width="100"/>
   <Column ss:Width="160"/>
   <Column ss:Width="220"/>
   <Row ss:Height="26">
    ${csvHeaders.map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${h}</Data></Cell>`).join('\n    ')}
   </Row>
   ${users
     .map(
       (u) => `
   <Row ss:StyleID="DataRow">
    <Cell><Data ss:Type="String">${u.id}</Data></Cell>
    <Cell><Data ss:Type="String">${u.username}</Data></Cell>
    <Cell><Data ss:Type="String">${u.displayName}</Data></Cell>
    <Cell ss:StyleID="RoleBadge"><Data ss:Type="String">${u.role}</Data></Cell>
    <Cell><Data ss:Type="String">${u.department || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.circle || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.division || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.subdivision || '—'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.region}</Data></Cell>
    <Cell><Data ss:Type="String">${u.scopeField || 'All'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.scopeValue || 'All'}</Data></Cell>
    <Cell><Data ss:Type="String">${u.admin || 'GIS Admin'}</Data></Cell>
    <Cell><Data ss:Type="String">${(u.jurisdictions || []).join('; ')}</Data></Cell>
    <Cell><Data ss:Type="String">${getHierarchyLevel(u.role)}</Data></Cell>
   </Row>`
     )
     .join('')}
  </Table>
 </Worksheet>
</Workbook>`;

fs.writeFileSync(path.join(publicTemplatesDir, 'PowerGIS_Users_Hierarchy_and_Roles.xls'), excelXml, 'utf8');
console.log('Wrote public/templates/PowerGIS_Users_Hierarchy_and_Roles.xls');
