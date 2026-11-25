import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx';
import { GeoPackageAPI } from 'npm:@ngageoint/geopackage';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceKey);

const MAX_IMPORT_BYTES = Number(Deno.env.get('POWERGIS_MAX_IMPORT_BYTES') ?? 52428800);
const MAX_IMPORT_FEATURES = Number(Deno.env.get('POWERGIS_MAX_IMPORT_FEATURES') ?? 50000);
const ALLOWED_ASSET_TYPES = new Set(['SUBSTATION','EHV_LINE','HV_LINE','DT','LT_LINE','POLE','SMART_METER']);

function isValidGeometry(geometry: any): boolean {
  if (!geometry || !['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'].includes(geometry.type)) return false;
  const walk = (value: any): boolean => Array.isArray(value) ? value.length > 0 && value.every(walk) : typeof value === 'number' && Number.isFinite(value);
  if (!walk(geometry.coordinates)) return false;
  const validatePairs = (value: any): boolean => {
    if (!Array.isArray(value)) return false;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') return value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
    return value.every(validatePairs);
  };
  return validatePairs(geometry.coordinates);
}

function normalizeFeature(feature: any, index: number, defaultType: string) {
  const properties = feature?.properties ?? {};
  const geometry = feature?.geometry ?? null;
  if (!isValidGeometry(geometry)) return null;
  const coords = geometry.type === 'Point' && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  return { assetNo: String(properties.asset_no ?? properties.assetNo ?? properties.id ?? `IMP-${crypto.randomUUID()}`), assetType: ALLOWED_ASSET_TYPES.has(String(properties.asset_type ?? properties.assetType ?? defaultType)) ? String(properties.asset_type ?? properties.assetType ?? defaultType) : defaultType, status: String(properties.status ?? 'ACTIVE'), geometry, latitude: coords.length > 1 ? Number(coords[1]) : undefined, longitude: coords.length ? Number(coords[0]) : undefined, metadata: properties };
}

function parseKml(text: string, defaultType: string) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  return Array.from(xml?.getElementsByTagName('Placemark') ?? []).map((pm, i) => {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || `KML-${i + 1}`;
    const coords = (s: string) => s.trim().split(/\s+/).map((pair) => pair.split(',').slice(0,2).map(Number));
    const point = pm.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    const line = pm.getElementsByTagName('LineString')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    const ring = pm.getElementsByTagName('Polygon')[0]?.getElementsByTagName('outerBoundaryIs')[0]?.getElementsByTagName('LinearRing')[0]?.getElementsByTagName('coordinates')[0]?.textContent;
    const geometry = point ? {type:'Point',coordinates:coords(point)[0]} : line ? {type:'LineString',coordinates:coords(line)} : ring ? {type:'Polygon',coordinates:[coords(ring)]} : null;
    return normalizeFeature({properties:{name,asset_no:name},geometry},i,defaultType);
  }).filter(Boolean);
}

function parseGeoJSON(text: string, defaultType: string) {
  const data = JSON.parse(text); const fs = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [];
  return fs.map((f:any,i:number)=>normalizeFeature(f,i,defaultType)).filter(Boolean);
}

function parseCsv(text: string, defaultType: string) {
  const rows=text.split(/\r?\n/).filter(Boolean); if(!rows.length) return [];
  const headers=rows[0].split(',').map(x=>x.trim().replace(/^"|"$/g,''));
  return rows.slice(1).map((line,i)=>{const vals=line.split(',').map(x=>x.trim().replace(/^"|"$/g,'')); const p:any={}; headers.forEach((h,n)=>p[h]=vals[n]??''); const lat=Number(p.latitude??p.lat), lng=Number(p.longitude??p.lng??p.lon); const geometry=Number.isFinite(lat)&&Number.isFinite(lng)?{type:'Point',coordinates:[lng,lat]}:null; return normalizeFeature({properties:p,geometry},i,defaultType);}).filter(Boolean);
}

async function parseXlsx(bytes: Uint8Array, defaultType: string) {
  const wb=XLSX.read(bytes,{type:'array'}); const out:any[]=[];
  for(const sheet of wb.SheetNames){ const rows=XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet]); rows.forEach((row:any,i:number)=>{const lat=Number(row.latitude??row.Latitude??row.lat),lng=Number(row.longitude??row.Longitude??row.lng??row.lon); let geometry=row.geometry; if(typeof geometry==='string'){try{geometry=JSON.parse(geometry)}catch{geometry=null}} if(!geometry&&Number.isFinite(lat)&&Number.isFinite(lng))geometry={type:'Point',coordinates:[lng,lat]}; const f=normalizeFeature({properties:{...row,source_sheet:sheet},geometry},out.length+i,defaultType); if(f)out.push(f);}); }
  return out;
}

async function parseGpkg(bytes: Uint8Array, defaultType: string) {
  const gp = await GeoPackageAPI.open(bytes); const out:any[]=[];
  for(const table of gp.getFeatureTables()){ const rs=gp.queryForGeoJSONFeatures(table); for(const f of rs) { const n=normalizeFeature(f,out.length,defaultType); if(n) out.push(n); } rs.close?.(); }
  gp.close(); return out;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response(JSON.stringify({ok:false,error:'Method not allowed.'}),{status:405,headers:{'content-type':'application/json'}});
    const form=await req.formData(); const file=form.get('file'); const requestedType=String(form.get('defaultType')??'DT'); const defaultType=ALLOWED_ASSET_TYPES.has(requestedType) ? requestedType : 'DT'; const sessionToken=String(form.get('sessionToken')??'');
    if(!(file instanceof File)) return new Response(JSON.stringify({ok:false,error:'No GIS file supplied.'}),{status:400});
    if (file.size <= 0 || file.size > MAX_IMPORT_BYTES) return new Response(JSON.stringify({ok:false,error:`File must be between 1 byte and ${MAX_IMPORT_BYTES} bytes.`}),{status:413,headers:{'content-type':'application/json'}});
    const {data:user,error:userError}=await admin.rpc('session_user',{p_session_token:sessionToken});
    if(userError || !user?.length || user[0].role!=='GIS_ADMIN') return new Response(JSON.stringify({ok:false,error:'GIS Admin session required.'}),{status:403});
    const bytes=new Uint8Array(await file.arrayBuffer()); const name=file.name.toLowerCase(); let features:any[]=[];
    if(name.endsWith('.kml')) features=parseKml(new TextDecoder().decode(bytes),defaultType);
    else if(name.endsWith('.geojson')||name.endsWith('.json')) features=parseGeoJSON(new TextDecoder().decode(bytes),defaultType);
    else if(name.endsWith('.csv')) features=parseCsv(new TextDecoder().decode(bytes),defaultType);
    else if(name.endsWith('.xlsx')||name.endsWith('.xls')) features=await parseXlsx(bytes,defaultType);
    else if(name.endsWith('.gpkg')) features=await parseGpkg(bytes,defaultType);
    else throw new Error(`Unsupported GIS format: ${file.name}`);
    if(!features.length) throw new Error('No valid GIS features could be read from the selected file.');
    if(features.length > MAX_IMPORT_FEATURES) throw new Error(`Import exceeds the configured feature limit (${MAX_IMPORT_FEATURES}).`);
    const {data,error}=await admin.rpc('admin_import_assets',{p_session_token:sessionToken,p_assets:features});
    if(error) throw error;
    return new Response(JSON.stringify({ok:true,...(data?.[0]??{})}),{headers:{'content-type':'application/json'}});
  } catch(error) { return new Response(JSON.stringify({ok:false,error:String(error)}),{status:500,headers:{'content-type':'application/json'}}); }
});
