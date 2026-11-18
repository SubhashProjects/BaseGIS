import { XyzTileMap } from './XyzTileMap';
import type { MapNavigationTarget } from './MapHierarchyNavigator';
import type { PowerGISAsset, PowerGISBoundary, PowerGISUser } from '../../services/powergisData';

export function GisMap({
  currentUser,
  assets,
  boundaries,
  navigationTarget,
}: {
  currentUser: PowerGISUser;
  assets: PowerGISAsset[];
  boundaries: PowerGISBoundary[];
  navigationTarget?: MapNavigationTarget | null;
}) {
  return (
    <div className="map-wrap">
      <XyzTileMap
        currentUser={currentUser}
        assets={assets}
        boundaries={boundaries}
        navigationTarget={navigationTarget}
      />
    </div>
  );
}
