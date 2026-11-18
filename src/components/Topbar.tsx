import { Bell, UserCircle } from 'lucide-react';
export function Topbar(){return <header className="topbar"><input className="search" placeholder="Search assets, substations, transformers…"/><div style={{display:'flex',gap:16,alignItems:'center'}}><Bell size={18}/><div style={{display:'flex',gap:7,alignItems:'center',fontSize:13}}><UserCircle size={20}/>GIS Admin</div></div></header>}
