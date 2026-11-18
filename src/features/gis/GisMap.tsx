import { XyzTileMap } from './XyzTileMap';

export function GisMap({ currentUser }:{ currentUser:any }) {
  return <div className="map-wrap"><XyzTileMap currentUser={currentUser}/></div>;
}
