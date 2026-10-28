import baseline from '../data/global-catalog.json';
import supplement from '../data/official-route-supplement.json';
import { mergeOfficialRoutes } from './official-route-supplement';

export function publishedCatalog(input: unknown = baseline, now = new Date()) {
  return mergeOfficialRoutes(input, supplement, now);
}
