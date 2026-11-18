import { usePowerGISData } from './usePowerGISData'; import type { PowerGISUser } from '../services/powergisData';
export function useAssetsViewModel(user:PowerGISUser){ return usePowerGISData(user); }
