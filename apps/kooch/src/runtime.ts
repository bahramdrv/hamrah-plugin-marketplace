import snapshot from '../data/iran-start-snapshot.json';
import { createCompassApi } from './api';
import retrieval from '../data/retrieval-status.json';
import type { RetrievalStatus } from './retrieval';
export const compassApi = createCompassApi({ snapshot, retrieval: retrieval as RetrievalStatus });
