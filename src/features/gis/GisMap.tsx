import { XyzTileMap } from './XyzTileMap';
import type { PowerGISAsset, PowerGISBoundary, PowerGISUser } from '../../services/powergisData';
export function GisMap({ currentUser, assets, boundaries }:{ currentUser:PowerGISUser; assets:PowerGISAsset[]; boundaries:PowerGISBoundary[] }) {
  return <div className="map-wrap"><XyzTileMap currentUser={currentUser} assets={assets} boundaries={boundaries}/></div>;
}
