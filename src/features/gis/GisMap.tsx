import { XyzTileMap } from './XyzTileMap';
import type { MapNavigationTarget } from './MapHierarchyNavigator';
import type { PowerGISAsset, PowerGISBoundary, PowerGISUser } from '../../services/powergisData';

export function GisMap({
  currentUser,
  assets,
  boundaries,
  navigationTarget,
  onViewportChange,
}: {
  currentUser: PowerGISUser;
  assets: PowerGISAsset[];
  boundaries: PowerGISBoundary[];
  navigationTarget?: MapNavigationTarget | null;
  onViewportChange?: (bounds: { west: number; south: number; east: number; north: number }) => void;
}) {
  return (
    <div className="map-wrap">
      <XyzTileMap
        currentUser={currentUser}
        assets={assets}
        boundaries={boundaries}
        navigationTarget={navigationTarget}
        onViewportChange={onViewportChange}
      />
    </div>
  );
}
